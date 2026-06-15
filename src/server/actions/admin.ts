'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/db/client';
import { beds, reservations, rooms, users } from '@/db/schema';
import { auth } from '@/lib/auth/config';
import { notifyRoleChanged } from '@/lib/email/notify';

export type AdminResult =
  | { ok: true }
  | { ok: false; code: 'AUTH' | 'FORBIDDEN' | 'VALIDATION' | 'CONFLICT'; message: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | Extract<AdminResult, { ok: false }>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  if (!session.user.isAdmin) return { ok: false, code: 'FORBIDDEN', message: 'Admins only' };
  return { ok: true, userId: session.user.id };
}

const RoomFields = {
  nameNb: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #RRGGBB hex'),
  capacityMode: z.enum(['BEDS', 'SLOTS']),
  slotCount: z.number().int().positive().nullable().optional(),
};

const RoomCreate = z
  .object({
    ...RoomFields,
    beds: z.array(z.object({ kind: z.enum(['DOUBLE', 'SINGLE']) })).optional(),
  })
  .refine((v) => v.capacityMode !== 'SLOTS' || (v.beds ?? []).length === 0, {
    message: 'Slot rooms cannot have beds',
  });

const RoomUpdate = z.object({
  ...RoomFields,
  id: z.string().min(1),
});

function makeBedLabel(kind: 'DOUBLE' | 'SINGLE'): string {
  return `${kind}-${randomUUID().slice(0, 8)}`;
}

export async function createRoom(input: unknown): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;

  const parsed = RoomCreate.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  const v = parsed.data;
  const dup = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.nameNb, v.nameNb)).all();
  if (dup.length > 0) return { ok: false, code: 'CONFLICT', message: 'Name already in use' };

  const inserted = (await db
    .insert(rooms)
    .values({
      nameNb: v.nameNb,
      nameEn: v.nameEn,
      icon: v.icon,
      color: v.color,
      capacityMode: v.capacityMode,
      slotCount: v.capacityMode === 'SLOTS' ? v.slotCount ?? null : null,
    })
    .returning({ id: rooms.id })
    .all())[0]!;

  if (v.capacityMode === 'BEDS' && v.beds && v.beds.length > 0) {
    await db.insert(beds)
      .values(v.beds.map((b) => ({ roomId: inserted.id, kind: b.kind, label: makeBedLabel(b.kind) })))
      .run();
  }

  revalidatePath('/admin');
  revalidatePath('/book');
  return { ok: true };
}

export async function updateRoom(input: unknown): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;

  const parsed = RoomUpdate.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  const v = parsed.data;
  const existing = (await db.select().from(rooms).where(eq(rooms.id, v.id)).all())[0];
  if (!existing) return { ok: false, code: 'VALIDATION', message: 'Room not found' };

  // Reject name collisions with other rooms.
  const dup = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.nameNb, v.nameNb), ne(rooms.id, v.id)))
    .all();
  if (dup.length > 0) return { ok: false, code: 'CONFLICT', message: 'Name already in use' };

  // Switching mode while beds or active reservations exist would silently
  // break things — block the change instead.
  if (existing.capacityMode !== v.capacityMode) {
    if (existing.capacityMode === 'BEDS') {
      const bedRows = await db.select({ id: beds.id }).from(beds).where(eq(beds.roomId, v.id)).all();
      if (bedRows.length > 0) {
        return {
          ok: false,
          code: 'CONFLICT',
          message: 'Remove all beds before switching this room to slot mode',
        };
      }
    }
    const refs = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.roomId, v.id), ne(reservations.status, 'CANCELLED')))
      .all();
    if (refs.length > 0) {
      return {
        ok: false,
        code: 'CONFLICT',
        message: 'Cancel reservations on this room before changing its mode',
      };
    }
  }

  await db.update(rooms)
    .set({
      nameNb: v.nameNb,
      nameEn: v.nameEn,
      icon: v.icon,
      color: v.color,
      capacityMode: v.capacityMode,
      slotCount: v.capacityMode === 'SLOTS' ? v.slotCount ?? null : null,
    })
    .where(eq(rooms.id, v.id))
    .run();

  revalidatePath('/admin');
  revalidatePath('/book');
  return { ok: true };
}

export async function addBed(roomId: string, kind: 'DOUBLE' | 'SINGLE'): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof roomId !== 'string' || !roomId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing room id' };
  }
  if (kind !== 'DOUBLE' && kind !== 'SINGLE') {
    return { ok: false, code: 'VALIDATION', message: 'Invalid bed kind' };
  }
  const room = (await db.select().from(rooms).where(eq(rooms.id, roomId)).all())[0];
  if (!room) return { ok: false, code: 'VALIDATION', message: 'Room not found' };
  if (room.capacityMode !== 'BEDS') {
    return { ok: false, code: 'CONFLICT', message: 'This room uses slot mode — switch it to beds first' };
  }
  await db.insert(beds).values({ roomId, kind, label: makeBedLabel(kind) }).run();
  revalidatePath('/admin');
  revalidatePath('/book');
  return { ok: true };
}

export async function removeBed(bedId: string): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof bedId !== 'string' || !bedId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing bed id' };
  }
  const used = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.bedId, bedId), ne(reservations.status, 'CANCELLED')))
    .all();
  if (used.length > 0) {
    return { ok: false, code: 'CONFLICT', message: 'Bed is in use by a reservation — cancel it first' };
  }
  await db.delete(beds).where(eq(beds.id, bedId)).run();
  revalidatePath('/admin');
  revalidatePath('/book');
  return { ok: true };
}

export async function deleteRoom(roomId: string): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof roomId !== 'string' || !roomId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing room id' };
  }

  // Reject deletion if there are confirmed reservations referencing this room
  // (directly or via its beds).
  const direct = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.roomId, roomId))
    .all();
  if (direct.length > 0) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'Room still has reservations — cancel them first',
    };
  }

  await db.delete(rooms).where(eq(rooms.id, roomId)).run();
  revalidatePath('/admin');
  revalidatePath('/book');
  return { ok: true };
}

export async function setUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;

  if (typeof userId !== 'string' || !userId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing user id' };
  }

  // Don't allow demoting the last remaining admin — leaves the system
  // permanently unmanageable otherwise.
  if (!isAdmin) {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAdmin, true))
      .all();
    if (admins.length <= 1 && admins[0]?.id === userId) {
      return { ok: false, code: 'CONFLICT', message: 'Cannot remove the last admin' };
    }
  }

  const before = (await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .all())[0];
  await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).run();
  if (before && before.isAdmin !== isAdmin) {
    await notifyRoleChanged(userId, 'admin', isAdmin);
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function setUserManager(
  userId: string,
  isManager: boolean,
): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;

  if (typeof userId !== 'string' || !userId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing user id' };
  }

  const before = (await db
    .select({ isManager: users.isManager })
    .from(users)
    .where(eq(users.id, userId))
    .all())[0];
  await db.update(users).set({ isManager }).where(eq(users.id, userId)).run();
  if (before && before.isManager !== isManager) {
    await notifyRoleChanged(userId, 'manager', isManager);
  }
  revalidatePath('/admin');
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setUserInvitee(
  userId: string,
  isInvitee: boolean,
): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;

  if (typeof userId !== 'string' || !userId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing user id' };
  }

  await db.update(users).set({ isInvitee }).where(eq(users.id, userId)).run();
  revalidatePath('/admin');
  revalidatePath('/invite');
  return { ok: true };
}

/**
 * Remove a user from the app entirely. FK cascades clear their sessions,
 * bookings, group memberships, invites and dugnad authorship (see schema
 * `onDelete` rules). You can't remove yourself, nor the last remaining admin.
 */
export async function deleteUser(userId: string): Promise<AdminResult> {
  const guard = await requireAdmin();
  if ('ok' in guard && !guard.ok) return guard;
  if (typeof userId !== 'string' || !userId) {
    return { ok: false, code: 'VALIDATION', message: 'Missing user id' };
  }
  if (userId === guard.userId) {
    return { ok: false, code: 'CONFLICT', message: 'You cannot remove your own account.' };
  }

  const target = (await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .all())[0];
  if (!target) return { ok: false, code: 'VALIDATION', message: 'User not found' };
  if (target.isAdmin) {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).all();
    if (admins.length <= 1) {
      return { ok: false, code: 'CONFLICT', message: 'Cannot remove the last admin' };
    }
  }

  await db.delete(users).where(eq(users.id, userId)).run();
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  revalidatePath('/requests');
  revalidatePath('/groups');
  revalidatePath('/invite');
  return { ok: true };
}
