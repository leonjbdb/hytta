import { z } from 'zod';
import { ValidationError } from './errors';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Date must be in YYYY-MM-DD format')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Date is not a valid calendar date');

export const DateRangeSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((r) => r.startDate <= r.endDate, {
    message: 'end_date must be on or after start_date',
    path: ['endDate'],
  });

/* ------------------------------------------------------------------ *
 * Participant — either a registered user or a free-form guest name.
 * ------------------------------------------------------------------ */
export const ParticipantRefSchema = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({ guestName: z.string().trim().min(1).max(120) }),
]);

export type ParticipantRef = z.infer<typeof ParticipantRefSchema>;

export function isUserParticipant(p: ParticipantRef): p is { userId: string } {
  return 'userId' in p;
}

/* ------------------------------------------------------------------ *
 * Legacy single-target schema. Used by the lower-level
 * `ReservationService.create()` wrapper and the unit tests.
 * ------------------------------------------------------------------ */
export const CreateReservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FULL_COTTAGE'), startDate: isoDate, endDate: isoDate }),
  z.object({
    kind: z.literal('ROOM'),
    roomId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
  }),
  z.object({
    kind: z.literal('BED'),
    bedId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
  }),
  z.object({
    kind: z.literal('SLOT'),
    roomId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
  }),
]);

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

const MAX_DAYS = 30;

function daysInRange(startDate: string, endDate: string): number {
  const a = new Date(startDate + 'T00:00:00Z').getTime();
  const b = new Date(endDate + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyDatePolicy(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new ValidationError([
      { path: 'endDate', message: 'end_date must be on or after start_date' },
    ]);
  }
  if (startDate < todayISO()) {
    throw new ValidationError([
      { path: 'startDate', message: 'start_date cannot be in the past' },
    ]);
  }
  if (daysInRange(startDate, endDate) > MAX_DAYS) {
    throw new ValidationError([
      { path: 'endDate', message: `Maximum stay is ${MAX_DAYS} days` },
    ]);
  }
}

export function parseCreateReservation(raw: unknown): CreateReservationInput {
  const r = CreateReservationSchema.safeParse(raw);
  if (!r.success) {
    throw new ValidationError(
      r.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    );
  }
  applyDatePolicy(r.data.startDate, r.data.endDate);
  return r.data;
}

/* ------------------------------------------------------------------ *
 * Multi-participant booking schema.
 *
 * Every participant row carries either `userId` (registered user) or
 * `guestName` (free-form). Targets:
 *   FULL_COTTAGE — everyone in the cottage. Multiple participants allowed.
 *   SLOT         — one slot in a room (capacity-bound). N rows per room.
 *   ROOM         — exclusive whole-room hold. Carries N participants.
 *   BED          — kept for completeness (unit tests rely on it); UI uses
 *                  SLOT instead and counts beds towards capacity.
 * ------------------------------------------------------------------ */
const ParticipantBase = {
  userId: z.string().min(1).optional(),
  guestName: z.string().trim().min(1).max(120).optional(),
} as const;

const checkXor = (v: { userId?: string; guestName?: string }) =>
  Boolean(v.userId) !== Boolean(v.guestName);

export const ParticipantSchema = z.discriminatedUnion('targetKind', [
  z
    .object({ targetKind: z.literal('FULL_COTTAGE'), ...ParticipantBase })
    .refine(checkXor, { message: 'Provide either userId or guestName' }),
  z
    .object({
      targetKind: z.literal('ROOM'),
      roomId: z.string().min(1),
      ...ParticipantBase,
    })
    .refine(checkXor, { message: 'Provide either userId or guestName' }),
  z
    .object({
      targetKind: z.literal('BED'),
      bedId: z.string().min(1),
      ...ParticipantBase,
    })
    .refine(checkXor, { message: 'Provide either userId or guestName' }),
  z
    .object({
      targetKind: z.literal('SLOT'),
      roomId: z.string().min(1),
      ...ParticipantBase,
    })
    .refine(checkXor, { message: 'Provide either userId or guestName' }),
]);

export type ParticipantInput = z.infer<typeof ParticipantSchema>;

export const CreateBookingSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    participants: z.array(ParticipantSchema).min(1),
  })
  .superRefine((v, ctx) => {
    // FULL_COTTAGE participants stand alone — you can't mix them with rooms.
    const hasFull = v.participants.some((p) => p.targetKind === 'FULL_COTTAGE');
    const hasNonFull = v.participants.some((p) => p.targetKind !== 'FULL_COTTAGE');
    if (hasFull && hasNonFull) {
      ctx.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Whole-cottage bookings cannot also reserve rooms',
      });
    }

    // A registered user can only appear once per booking — they can't sleep
    // in two places at the same time. Guests are free-form text and aren't
    // de-duplicated.
    const seenUsers = new Set<string>();
    v.participants.forEach((p, i) => {
      if (p.userId) {
        if (seenUsers.has(p.userId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['participants', i, 'userId'],
            message: 'Each person can only be assigned once per booking',
          });
        }
        seenUsers.add(p.userId);
      }
    });
  });

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export function parseCreateBooking(raw: unknown): CreateBookingInput {
  const r = CreateBookingSchema.safeParse(raw);
  if (!r.success) {
    throw new ValidationError(
      r.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    );
  }
  applyDatePolicy(r.data.startDate, r.data.endDate);
  return r.data;
}
