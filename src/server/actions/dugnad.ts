'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { dugnadTasks } from '@/db/schema';

export type DugnadActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | 'AUTH_REQUIRED'
        | 'CONFLICT'
        | 'VALIDATION'
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'UNKNOWN';
      message: string;
      issues?: { path: string; message: string }[];
    };

const TitleSchema = z.string().trim().min(1, 'Tittel kan ikke være tom').max(120);
const DescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Beskrivelse kan ikke være tom')
  .max(5000, 'Beskrivelsen er for lang (maks 5000 tegn)');

const CreateSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema,
});

const UpdateSchema = CreateSchema;

function zodToIssues(err: z.ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function revalidateDugnad() {
  revalidatePath('/dugnad', 'page');
}

export async function createDugnadAction(
  raw: unknown,
): Promise<DugnadActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Du må være innlogget' };
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Ugyldig input',
      issues: zodToIssues(parsed.error),
    };
  }
  try {
    const inserted = await db
      .insert(dugnadTasks)
      .values({
        title: parsed.data.title,
        description: parsed.data.description,
        createdBy: session.user.id,
      })
      .returning({ id: dugnadTasks.id })
      .all();
    const row = inserted[0];
    if (!row) {
      return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke lagre oppgaven' };
    }
    revalidateDugnad();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    console.error('[dugnad] create failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke lagre oppgaven' };
  }
}

export async function updateDugnadAction(
  id: string,
  raw: unknown,
): Promise<DugnadActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Du må være innlogget' };
  }
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Mangler id' };
  }
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Ugyldig input',
      issues: zodToIssues(parsed.error),
    };
  }
  const existing = await db.select().from(dugnadTasks).where(eq(dugnadTasks.id, id)).get();
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Oppgaven finnes ikke' };
  }
  if (existing.completedAt !== null) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Løste oppgaver kan ikke endres',
    };
  }
  const isOwner = existing.createdBy === session.user.id;
  if (!isOwner && !session.user.isAdmin) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Bare eier eller admin kan endre denne oppgaven',
    };
  }
  try {
    await db.update(dugnadTasks)
      .set({ title: parsed.data.title, description: parsed.data.description })
      .where(eq(dugnadTasks.id, id))
      .run();
    revalidateDugnad();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error('[dugnad] update failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke oppdatere oppgaven' };
  }
}

export async function deleteDugnadAction(id: string): Promise<DugnadActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Du må være innlogget' };
  }
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Mangler id' };
  }
  const existing = await db.select().from(dugnadTasks).where(eq(dugnadTasks.id, id)).get();
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Oppgaven finnes ikke' };
  }
  const isOwner = existing.createdBy === session.user.id;
  if (!isOwner && !session.user.isAdmin) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Du kan bare slette dine egne oppgaver',
    };
  }
  try {
    await db.delete(dugnadTasks).where(eq(dugnadTasks.id, id)).run();
    revalidateDugnad();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error('[dugnad] delete failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke slette oppgaven' };
  }
}

export async function uncompleteDugnadAction(id: string): Promise<DugnadActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Du må være innlogget' };
  }
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Mangler id' };
  }
  const existing = await db.select().from(dugnadTasks).where(eq(dugnadTasks.id, id)).get();
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Oppgaven finnes ikke' };
  }
  if (existing.completedAt === null) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'Oppgaven er ikke markert som løst',
    };
  }
  const isCompleter = existing.completedBy === session.user.id;
  if (!isCompleter && !session.user.isAdmin) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Bare den som løste oppgaven (eller admin) kan angre',
    };
  }
  try {
    await db.update(dugnadTasks)
      .set({ completedBy: null, completedAt: null })
      .where(eq(dugnadTasks.id, id))
      .run();
    revalidateDugnad();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error('[dugnad] uncomplete failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke angre' };
  }
}

export async function completeDugnadAction(id: string): Promise<DugnadActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Du må være innlogget' };
  }
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, code: 'VALIDATION', message: 'Mangler id' };
  }
  const existing = await db.select().from(dugnadTasks).where(eq(dugnadTasks.id, id)).get();
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Oppgaven finnes ikke' };
  }
  if (existing.completedAt !== null) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'Oppgaven er allerede markert som løst',
    };
  }
  try {
    await db.update(dugnadTasks)
      .set({
        completedBy: session.user.id,
        completedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(dugnadTasks.id, id))
      .run();
    revalidateDugnad();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error('[dugnad] complete failed', err);
    return { ok: false, code: 'UNKNOWN', message: 'Kunne ikke markere som løst' };
  }
}
