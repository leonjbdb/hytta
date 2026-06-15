'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { groupMembers, groupTemplates, rooms, users } from '@/db/schema';
import { auth } from '@/lib/auth/config';

export type GroupActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'; message: string };

async function requireUser(): Promise<string | { ok: false; code: 'AUTH'; message: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'AUTH', message: 'Sign in required' };
  return session.user.id;
}

async function requireMember(
  groupId: string,
): Promise<{ ok: true; userId: string } | Extract<GroupActionResult, { ok: false }>> {
  const guard = await requireUser();
  if (typeof guard !== 'string') return guard;
  const member = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, guard)))
    .all();
  if (member.length === 0) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only members of the group can edit it' };
  }
  return { ok: true, userId: guard };
}

const NameSchema = z.string().trim().min(1).max(120);
const MemberSchema = z
  .object({
    userId: z.string().min(1).optional(),
    guestName: z.string().trim().min(1).max(120).optional(),
    preferredRoomId: z.string().min(1).nullable().optional(),
    preferredBedId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.guestName), {
    message: 'Provide either userId or guestName',
  });

/* -------------------------------------------------- *
 * Queries
 * -------------------------------------------------- */

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  const guard = await requireUser();
  if (typeof guard !== 'string') return [];

  const myGroupIds = (await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, guard))
    .all())
    .map((r) => r.groupId);
  if (myGroupIds.length === 0) return [];

  const groups = await db
    .select()
    .from(groupTemplates)
    .where(inArray(groupTemplates.id, myGroupIds))
    .orderBy(asc(groupTemplates.name))
    .all();
  const memberCounts = await db
    .select({ groupId: groupMembers.groupId, id: groupMembers.id })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, myGroupIds))
    .all();
  const counts = new Map<string, number>();
  for (const r of memberCounts) counts.set(r.groupId, (counts.get(r.groupId) ?? 0) + 1);

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: counts.get(g.id) ?? 0,
  }));
}

export interface GroupDetail {
  id: string;
  name: string;
  members: Array<{
    id: string;
    userId: string | null;
    userName: string | null;
    userIsAdmin: boolean;
    userIsManager: boolean;
    guestName: string | null;
    preferredRoomId: string | null;
    preferredBedId: string | null;
  }>;
}

export async function getGroup(groupId: string): Promise<GroupActionResult<GroupDetail>> {
  const guard = await requireMember(groupId);
  if ('ok' in guard && !guard.ok) return guard;

  const group = (await db.select().from(groupTemplates).where(eq(groupTemplates.id, groupId)).all())[0];
  if (!group) return { ok: false, code: 'NOT_FOUND', message: 'Group not found' };

  const memberRows = await db
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      guestName: groupMembers.guestName,
      preferredRoomId: groupMembers.preferredRoomId,
      preferredBedId: groupMembers.preferredBedId,
      userName: users.name,
      userEmail: users.email,
      userIsAdmin: users.isAdmin,
      userIsManager: users.isManager,
    })
    .from(groupMembers)
    .leftJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.position), asc(groupMembers.createdAt))
    .all();

  return {
    ok: true,
    data: {
      id: group.id,
      name: group.name,
      members: memberRows.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userId ? m.userName ?? m.userEmail ?? null : null,
        userIsAdmin: Boolean(m.userIsAdmin),
        userIsManager: Boolean(m.userIsManager),
        guestName: m.guestName,
        preferredRoomId: m.preferredRoomId,
        preferredBedId: m.preferredBedId,
      })),
    },
  };
}

/* -------------------------------------------------- *
 * Mutations
 * -------------------------------------------------- */

export async function createGroup(input: { name: string }): Promise<GroupActionResult<{ id: string }>> {
  const guard = await requireUser();
  if (typeof guard !== 'string') return guard;

  const name = NameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, code: 'VALIDATION', message: 'Invalid name' };

  const inserted = (await db
    .insert(groupTemplates)
    .values({ name: name.data, createdBy: guard })
    .returning({ id: groupTemplates.id })
    .all())[0]!;
  // Creator becomes the first member so they can edit.
  await db.insert(groupMembers).values({ groupId: inserted.id, userId: guard, position: 0 }).run();

  revalidatePath('/groups');
  return { ok: true, data: { id: inserted.id } };
}

export async function renameGroup(groupId: string, name: string): Promise<GroupActionResult> {
  const guard = await requireMember(groupId);
  if ('ok' in guard && !guard.ok) return guard;
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: 'Invalid name' };
  await db.update(groupTemplates).set({ name: parsed.data }).where(eq(groupTemplates.id, groupId)).run();
  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, data: undefined };
}

export async function deleteGroup(groupId: string): Promise<GroupActionResult> {
  const guard = await requireMember(groupId);
  if ('ok' in guard && !guard.ok) return guard;
  await db.delete(groupTemplates).where(eq(groupTemplates.id, groupId)).run();
  revalidatePath('/groups');
  return { ok: true, data: undefined };
}

export async function addGroupMember(
  groupId: string,
  member: z.input<typeof MemberSchema>,
): Promise<GroupActionResult> {
  const guard = await requireMember(groupId);
  if ('ok' in guard && !guard.ok) return guard;
  const parsed = MemberSchema.safeParse(member);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  const v = parsed.data;

  if (v.preferredRoomId) {
    const room = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, v.preferredRoomId)).all();
    if (room.length === 0) return { ok: false, code: 'NOT_FOUND', message: 'Room not found' };
  }
  if (v.userId) {
    const dup = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, v.userId)))
      .all();
    if (dup.length > 0) {
      return { ok: false, code: 'VALIDATION', message: 'That user is already in the group' };
    }
  }

  const positionRows = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .all();
  await db.insert(groupMembers)
    .values({
      groupId,
      userId: v.userId ?? null,
      guestName: v.userId ? null : v.guestName ?? null,
      preferredRoomId: v.preferredRoomId ?? null,
      preferredBedId: v.preferredRoomId ? v.preferredBedId ?? null : null,
      position: positionRows.length,
    })
    .run();
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, data: undefined };
}

export async function updateGroupMember(
  memberId: string,
  patch: { preferredRoomId?: string | null; preferredBedId?: string | null },
): Promise<GroupActionResult> {
  const guard = await requireUser();
  if (typeof guard !== 'string') return guard;
  const row = (await db.select().from(groupMembers).where(eq(groupMembers.id, memberId)).all())[0];
  if (!row) return { ok: false, code: 'NOT_FOUND', message: 'Member not found' };
  const member = await requireMember(row.groupId);
  if ('ok' in member && !member.ok) return member;

  const set: Partial<typeof groupMembers.$inferInsert> = {};
  if (patch.preferredRoomId !== undefined) {
    // Changing the room invalidates any previously-chosen bed.
    set.preferredRoomId = patch.preferredRoomId;
    set.preferredBedId = null;
  }
  if (patch.preferredBedId !== undefined) {
    set.preferredBedId = patch.preferredBedId;
  }
  if (Object.keys(set).length > 0) {
    await db.update(groupMembers).set(set).where(eq(groupMembers.id, memberId)).run();
  }
  revalidatePath(`/groups/${row.groupId}`);
  return { ok: true, data: undefined };
}

export async function removeGroupMember(memberId: string): Promise<GroupActionResult> {
  const guard = await requireUser();
  if (typeof guard !== 'string') return guard;
  const row = (await db.select().from(groupMembers).where(eq(groupMembers.id, memberId)).all())[0];
  if (!row) return { ok: false, code: 'NOT_FOUND', message: 'Member not found' };
  const member = await requireMember(row.groupId);
  if ('ok' in member && !member.ok) return member;

  if (row.userId) {
    const remainingOwners = (await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, row.groupId))
      .all())
      .filter((m) => m.id !== memberId && row.userId !== null);
    if (remainingOwners.length === 0) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'Removing this member leaves the group with no registered owners',
      };
    }
  }

  await db.delete(groupMembers).where(eq(groupMembers.id, memberId)).run();
  revalidatePath(`/groups/${row.groupId}`);
  return { ok: true, data: undefined };
}
