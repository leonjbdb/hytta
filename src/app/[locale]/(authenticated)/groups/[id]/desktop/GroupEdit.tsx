'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarPlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoomIcon } from '@/components/booking/RoomIcon';
import { SearchableSelect } from '@/components/booking/SearchableSelect';
import { PersonBadge } from '@/components/PersonBadge';
import { useConfirm } from '@/components/ConfirmDialog';
import { roomLabel } from '@/lib/booking/room-label';
import { bedDisplayName } from '@/lib/booking/bed-display';
import {
  addGroupMember,
  deleteGroup,
  removeGroupMember,
  renameGroup,
  updateGroupMember,
  type GroupDetail,
} from '@/server/actions/groups';

interface RoomMeta {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: 'BEDS' | 'SLOTS';
  slotCount: number | null;
}
interface UserPick {
  id: string;
  name: string;
}
interface BedMeta {
  id: string;
  roomId: string;
  kind: 'DOUBLE' | 'SINGLE';
  label: string;
}

const GUEST_PREFIX = 'guest:';

export function GroupEdit({
  group,
  rooms,
  beds,
  users,
  currentUserId,
}: {
  group: GroupDetail;
  rooms: RoomMeta[];
  beds: BedMeta[];
  users: UserPick[];
  currentUserId: string;
}) {
  const t = useTranslations('Groups');
  const tBook = useTranslations('Book');
  const router = useRouter();
  const locale = useLocale();
  const confirm = useConfirm();

  // The "owner pool" is every group member who is a registered user. We
  // never let it drop to zero — if you're the only owner, your remove
  // button is disabled. If there are other owners, we still warn before
  // letting you walk away from the group.
  const registeredOwnerIds = group.members
    .filter((m) => m.userId)
    .map((m) => m.userId as string);

  const [name, setName] = React.useState(group.name);
  const [savingName, startSaveName] = React.useTransition();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [adding, startAdd] = React.useTransition();

  // Capacity-aware preferences: a bed holds 1 (single) or 2 (double); a room
  // holds the sum of its beds (or its slot count). A bed/room that's already
  // full of *other* members' preferences can't take another.
  const bedCap = (kind: 'DOUBLE' | 'SINGLE') => (kind === 'DOUBLE' ? 2 : 1);
  const bedFull = (bedId: string, kind: 'DOUBLE' | 'SINGLE', exceptId?: string) =>
    group.members.filter((m) => m.id !== exceptId && m.preferredBedId === bedId).length >=
    bedCap(kind);
  const roomCapacityOf = (roomId: string): number | null => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return null;
    if (room.capacityMode === 'SLOTS') return room.slotCount;
    return beds.filter((b) => b.roomId === roomId).reduce((n, b) => n + bedCap(b.kind), 0);
  };
  const roomFull = (roomId: string, exceptId?: string) => {
    const cap = roomCapacityOf(roomId);
    if (cap == null) return false;
    return group.members.filter((m) => m.id !== exceptId && m.preferredRoomId === roomId).length >= cap;
  };
  // Hide people already in the group from the add list.
  const availableUsers = users.filter((u) => !registeredOwnerIds.includes(u.id));

  const saveName = () => {
    if (name.trim() === group.name) return;
    startSaveName(async () => {
      const r = await renameGroup(group.id, name);
      if (!r.ok) toast.error(r.message);
    });
  };

  const remove = async (memberId: string) => {
    const isSelf =
      group.members.find((m) => m.id === memberId)?.userId === currentUserId;
    const otherOwners = registeredOwnerIds.filter((id) => id !== currentUserId);

    if (isSelf && otherOwners.length === 0) {
      toast.error(t('cannotRemoveLastSelf'));
      return;
    }
    const message = isSelf ? t('confirmRemoveSelf') : t('confirmRemoveMember');
    if (!(await confirm({ message, confirmLabel: t('removeMember'), destructive: true }))) return;
    setPendingId(memberId);
    (async () => {
      const r = await removeGroupMember(memberId);
      setPendingId(null);
      if (!r.ok) toast.error(r.message);
      else if (isSelf) router.push('/groups');
    })();
  };

  const updateRoom = (memberId: string, roomId: string | null) => {
    setPendingId(memberId);
    (async () => {
      const r = await updateGroupMember(memberId, { preferredRoomId: roomId });
      setPendingId(null);
      if (!r.ok) toast.error(r.message);
    })();
  };

  const updateBed = (memberId: string, bedId: string | null) => {
    setPendingId(memberId);
    (async () => {
      const r = await updateGroupMember(memberId, { preferredBedId: bedId });
      setPendingId(null);
      if (!r.ok) toast.error(r.message);
    })();
  };

  const addMember = (raw: string, room: string | null, bed: string | null) => {
    if (!raw) return;
    const isGuest = raw.startsWith(GUEST_PREFIX);
    startAdd(async () => {
      const r = await addGroupMember(group.id, {
        ...(isGuest ? { guestName: raw.slice(GUEST_PREFIX.length) } : { userId: raw }),
        preferredRoomId: room,
        preferredBedId: bed,
      });
      if (!r.ok) toast.error(r.message);
    });
  };

  const removeGroup = async () => {
    if (
      !(await confirm({
        message: t('confirmDeleteGroup', { name: group.name }),
        confirmLabel: t('deleteGroup'),
        destructive: true,
      }))
    )
      return;
    startAdd(async () => {
      const r = await deleteGroup(group.id);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      router.push('/groups');
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
            <Link href="/groups" className="hover:underline">
              {t('breadcrumb')}
            </Link>{' '}
            / {group.name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/book?group=${group.id}`}>
            <Button>
              <CalendarPlus className="size-4" /> {t('useGroup')}
            </Button>
          </Link>
          <Button variant="outline" onClick={removeGroup}>
            <Trash2 className="size-4" /> {t('deleteGroup')}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t('settingsHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="group-name">{t('groupName')}</Label>
            <div className="flex gap-2">
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
              />
              <Button onClick={saveName} disabled={savingName || name.trim() === group.name}>
                {savingName && <Loader2 className="size-4 animate-spin" />}
                {t('save')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t('membersHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {group.members.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">{t('noMembers')}</p>
          )}
          <ul className="flex flex-col gap-2">
            {group.members.map((m) => {
              const label = m.userName ?? m.guestName ?? '—';
              const roomBeds = m.preferredRoomId
                ? beds.filter((b) => b.roomId === m.preferredRoomId)
                : [];
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-md bg-[var(--muted)]/30 p-2 text-sm"
                >
                  <PersonBadge
                    name={label}
                    isGuest={!m.userId}
                    isAdmin={m.userIsAdmin}
                    isManager={m.userIsManager}
                  />
                  <span className="ml-auto flex items-center gap-2">
                    {roomBeds.length > 0 && (
                      <select
                        aria-label={t('memberBedFor', { name: label })}
                        value={m.preferredBedId ?? ''}
                        onChange={(e) => updateBed(m.id, e.target.value || null)}
                        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
                      >
                        <option value="">{t('anyBed')}</option>
                        {roomBeds.map((b) => (
                          <option
                            key={b.id}
                            value={b.id}
                            disabled={b.id !== m.preferredBedId && bedFull(b.id, b.kind, m.id)}
                          >
                            {bedDisplayName(b.kind, (k) => tBook(k), {
                              allBedsInRoom: roomBeds,
                              bedId: b.id,
                            })}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      aria-label={t('memberRoomFor', { name: label })}
                      value={m.preferredRoomId ?? ''}
                      onChange={(e) => updateRoom(m.id, e.target.value || null)}
                      className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
                    >
                      <option value="">{t('noRoom')}</option>
                      {rooms.map((r) => (
                        <option
                          key={r.id}
                          value={r.id}
                          disabled={r.id !== m.preferredRoomId && roomFull(r.id, m.id)}
                        >
                          {roomLabel(r, locale)}
                        </option>
                      ))}
                    </select>
                    {m.preferredRoomId && (
                      <RoomIcon
                        name={rooms.find((r) => r.id === m.preferredRoomId)?.icon ?? 'square'}
                        color={rooms.find((r) => r.id === m.preferredRoomId)?.color}
                        size={14}
                      />
                    )}
                  </span>
                  {(() => {
                    const isSelf = m.userId === currentUserId;
                    const isLastOwner =
                      isSelf && registeredOwnerIds.filter((id) => id !== currentUserId).length === 0;
                    return (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === m.id || isLastOwner}
                        title={isLastOwner ? t('cannotRemoveLastSelf') : undefined}
                        onClick={() => remove(m.id)}
                      >
                        {pendingId === m.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    );
                  })()}
                </li>
              );
            })}
          </ul>

          <AddMemberRow
            users={availableUsers}
            rooms={rooms}
            beds={beds}
            adding={adding}
            onAdd={addMember}
            roomFull={(id) => roomFull(id)}
            bedFull={(id, kind) => bedFull(id, kind)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AddMemberRow({
  users,
  rooms,
  beds,
  adding,
  onAdd,
  roomFull,
  bedFull,
}: {
  users: UserPick[];
  rooms: RoomMeta[];
  beds: BedMeta[];
  adding: boolean;
  onAdd: (raw: string, room: string | null, bed: string | null) => void;
  roomFull: (roomId: string) => boolean;
  bedFull: (bedId: string, kind: 'DOUBLE' | 'SINGLE') => boolean;
}) {
  const t = useTranslations('Groups');
  const tBook = useTranslations('Book');
  const locale = useLocale();
  const [picked, setPicked] = React.useState<string>('');
  const [room, setRoom] = React.useState<string>('');
  const [bed, setBed] = React.useState<string>('');
  const roomBeds = room ? beds.filter((b) => b.roomId === room) : [];

  const submit = () => {
    if (!picked) return;
    onAdd(picked, room || null, bed || null);
    setPicked('');
    setRoom('');
    setBed('');
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-[var(--border)] p-3">
      <div className="min-w-[14rem] flex-1">
        <SearchableSelect
          label={t('addMemberLabel')}
          options={users.map((u) => ({ id: u.id, name: u.name }))}
          value={picked}
          onChange={setPicked}
          placeholder={t('addMemberPlaceholder')}
          allowCustom={(query) => {
            const trimmed = query.trim();
            if (!trimmed) return null;
            const match = users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
            if (match) return match.id;
            return `${GUEST_PREFIX}${trimmed}`;
          }}
        />
      </div>
      {roomBeds.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-member-bed" className="text-xs text-[var(--muted-foreground)]">
            {t('preferredBed')}
          </Label>
          <select
            id="add-member-bed"
            value={bed}
            onChange={(e) => setBed(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
          >
            <option value="">{t('anyBed')}</option>
            {roomBeds.map((b) => (
              <option key={b.id} value={b.id} disabled={bedFull(b.id, b.kind)}>
                {bedDisplayName(b.kind, (k) => tBook(k), {
                  allBedsInRoom: roomBeds,
                  bedId: b.id,
                })}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-member-room" className="text-xs text-[var(--muted-foreground)]">
          {t('preferredRoom')}
        </Label>
        <select
          id="add-member-room"
          value={room}
          onChange={(e) => {
            setRoom(e.target.value);
            setBed('');
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
        >
          <option value="">{t('noRoom')}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id} disabled={roomFull(r.id)}>
              {roomLabel(r, locale)}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={submit} disabled={adding || !picked} className="self-end">
        {adding && <Loader2 className="size-4 animate-spin" />}
        <Plus className="size-4" /> {t('addMember')}
      </Button>
    </div>
  );
}
