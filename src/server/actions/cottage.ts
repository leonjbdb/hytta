'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth, signIn } from '@/lib/auth/config';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { COTTAGE_NAME_MAX, isCottageConfigured, setCottageName } from '@/lib/cottage';
import { composeName } from '@/lib/name';

export type SetupResult =
  | { ok: true; emailed?: boolean }
  | { ok: false; message: string };

const NameSchema = z.object({
  name: z.string().trim().min(1).max(COTTAGE_NAME_MAX),
});

const SetupSchema = z.object({
  name: z.string().trim().min(1).max(COTTAGE_NAME_MAX),
  adminEmail: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
});

/**
 * First-run setup: name the cottage. Deliberately a one-shot — once a name
 * exists this refuses to overwrite it, so the public `/setup` route can't be
 * used to rename the cottage after the operator has configured it. (Renaming
 * later would be a separate, admin-gated action.)
 */
export async function completeCottageSetup(formData: FormData): Promise<SetupResult> {
  if (await isCottageConfigured()) {
    return { ok: false, message: 'The cottage has already been set up.' };
  }

  const parsed = SetupSchema.safeParse({
    name: formData.get('name'),
    adminEmail: formData.get('adminEmail'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { name, adminEmail, firstName, lastName } = parsed.data;
  const displayName = composeName(firstName, lastName);

  // Create (or promote) the named admin first. Done before naming the cottage
  // so that if it fails, setup stays re-runnable — the cottage name is the
  // "already configured" gate, set last.
  await getDb()
    .insert(users)
    .values({
      email: adminEmail,
      firstName,
      lastName,
      name: displayName,
      emailVerified: new Date(),
      isAdmin: true,
      isInvitee: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { firstName, lastName, name: displayName, isAdmin: true, isInvitee: true },
    })
    .run();

  await setCottageName(name);
  // The name flows into the brand, title, emails and feeds — bust the whole tree.
  revalidatePath('/', 'layout');

  // Best-effort: email the admin a magic sign-in link so they can get in right
  // away. Delivery is recommended, not enforced — if email isn't configured
  // (or the send fails) setup still completes and the admin can sign in at
  // /login. `signIn` mints the verification token and routes through the
  // mailer; the magic-link provider only sends because the user now exists.
  let emailed = false;
  try {
    await signIn('nodemailer', { email: adminEmail, redirect: false });
    emailed = true;
  } catch (err) {
    console.error('[setup] could not send admin sign-in email', err);
  }

  return { ok: true, emailed };
}

/**
 * Rename the cottage after setup. Admin-gated (unlike `/setup`, which is a
 * public one-shot) so the operator can fix or change the name from the admin
 * page. Overwrites the existing name.
 */
export async function renameCottage(formData: FormData): Promise<SetupResult> {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return { ok: false, message: 'Admins only.' };
  }

  const parsed = NameSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid name' };
  }

  await setCottageName(parsed.data.name);
  revalidatePath('/', 'layout');
  return { ok: true };
}
