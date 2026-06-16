'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { roomLabel } from '@/lib/booking/room-label';
import { Loader2, Pencil, Search, Trash2, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ConfirmDialog';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { PersonBadge } from '@/components/PersonBadge';
import { RoomIcon } from '@/components/booking/RoomIcon';
import { CottageNameForm } from '../CottageNameForm';
import {
  deleteRoom,
  deleteUser,
  setUserAdmin,
  setUserInvitee,
  setUserManager,
  updateRoom,
  type AdminResult,
} from '@/server/actions/admin';
import { BedsEditor } from '../BedsEditor';
import { NewRoomForm, RoomFormFields } from '../RoomForm';
import { RoleToggle } from '../RoleToggle';

import type { AdminBed, AdminProps, AdminRoom, AdminUser } from '../shared';

type UserRole = 'admin' | 'manager' | 'inviter';

export type { AdminBed, AdminRoom, AdminUser };

export function Admin({ cottageName, rooms, beds, users, adminCount, viewerId }: AdminProps) {
  const t = useTranslations('Admin');
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
      </header>

      <CottageNameForm initialName={cottageName} />
      <RoomsSection rooms={rooms} beds={beds} />
      <UsersSection users={users} adminCount={adminCount} viewerId={viewerId} />
    </div>
  );
}

function RoomsSection({ rooms, beds }: { rooms: AdminRoom[]; beds: AdminBed[] }) {
  const t = useTranslations('Admin');
  const [editingId, setEditingId] = React.useState<string | null>(null);

  return (
    <CollapsibleSection title={t('roomsHeading')} right={rooms.length}>
      <div className="flex flex-col gap-3">
        {rooms.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              {t('noRooms')}
            </CardContent>
          </Card>
        )}
        {rooms.map((room) =>
          editingId === room.id ? (
            <RoomEditCard
              key={room.id}
              room={room}
              beds={beds.filter((b) => b.roomId === room.id)}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <RoomViewCard
              key={room.id}
              room={room}
              beds={beds.filter((b) => b.roomId === room.id)}
              onEdit={() => setEditingId(room.id)}
            />
          ),
        )}
      </div>

      <NewRoomForm />
    </CollapsibleSection>
  );
}

function RoomViewCard({
  room,
  beds,
  onEdit,
}: {
  room: AdminRoom;
  beds: AdminBed[];
  onEdit: () => void;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  const capacity =
    room.capacityMode === 'SLOTS'
      ? room.slotCount == null
        ? t('unlimited')
        : `${room.slotCount} ${t('slots')}`
      : `${beds.length} ${t('beds')}`;

  const bedSummary =
    beds.length === 0
      ? null
      : beds
          .map((b) =>
            b.kind === 'DOUBLE' ? t('bedDoubleShort') : t('bedSingleShort'),
          )
          .join(' · ');

  return (
    <Card className="flex flex-row items-center gap-3 p-4">
      <RoomIcon name={room.icon} size={20} color={room.color} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{roomLabel(room, locale)}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {room.capacityMode === 'BEDS' ? t('modeBeds') : t('modeSlots')} · {capacity}
        </p>
        {bedSummary && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{bedSummary}</p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="size-3.5" /> {t('edit')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (
            !(await confirm({
              message: t('confirmDeleteRoom', { name: roomLabel(room, locale) }),
              confirmLabel: t('delete'),
              destructive: true,
            }))
          )
            return;
          startTransition(async () => {
            const r = await deleteRoom(room.id);
            if (!r.ok) toast.error(r.message);
          });
        }}
      >
        <Trash2 className="size-3.5" /> {t('delete')}
      </Button>
    </Card>
  );
}

function RoomEditCard({
  room,
  beds,
  onClose,
}: {
  room: AdminRoom;
  beds: AdminBed[];
  onClose: () => void;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const [pending, startTransition] = React.useTransition();
  const [nameNb, setNameNb] = React.useState(room.nameNb);
  const [nameEn, setNameEn] = React.useState(room.nameEn);
  const [icon, setIcon] = React.useState(room.icon);
  const [color, setColor] = React.useState(room.color);
  const [mode, setMode] = React.useState<'BEDS' | 'SLOTS'>(room.capacityMode);
  const [unlimited, setUnlimited] = React.useState(room.slotCount == null);
  const [slotCount, setSlotCount] = React.useState<number>(room.slotCount ?? 2);

  const save = () => {
    startTransition(async () => {
      const r = await updateRoom({
        id: room.id,
        nameNb,
        nameEn,
        icon,
        color,
        capacityMode: mode,
        slotCount: mode === 'SLOTS' ? (unlimited ? null : slotCount) : null,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      onClose();
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RoomIcon name={icon} size={18} color={color} />
          <span className="font-medium">{roomLabel(room, locale)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-3.5" /> {t('cancelEdit')}
        </Button>
      </div>

      <RoomFormFields
        nameNb={nameNb}
        nameEn={nameEn}
        icon={icon}
        color={color}
        mode={mode}
        unlimited={unlimited}
        slotCount={slotCount}
        onNameNb={setNameNb}
        onNameEn={setNameEn}
        onIcon={setIcon}
        onColor={setColor}
        onMode={setMode}
        onUnlimited={setUnlimited}
        onSlotCount={setSlotCount}
      />

      {mode === 'BEDS' && <BedsEditor roomId={room.id} beds={beds} />}

      <Button onClick={save} disabled={pending || !nameNb.trim() || !nameEn.trim()} className="self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t('saveRoom')}
      </Button>
    </Card>
  );
}

function UsersSection({
  users,
  adminCount,
  viewerId,
}: {
  users: AdminUser[];
  adminCount: number;
  viewerId: string;
}) {
  const t = useTranslations('Admin');
  const confirm = useConfirm();
  const [pending, setPending] = React.useState<{ id: string; role: UserRole } | null>(null);
  const [kicking, setKicking] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const q = query.trim().toLowerCase();
  const matched = q
    ? users.filter(
        (u) =>
          (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
    : users;
  // Pin yourself to the top; everyone else keeps their original order (stable sort).
  const filtered = [...matched].sort((a, b) =>
    a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0,
  );

  const run = (u: AdminUser, role: UserRole, fn: () => Promise<AdminResult>) => {
    setPending({ id: u.id, role });
    (async () => {
      const r = await fn();
      setPending(null);
      if (!r.ok) toast.error(r.message);
    })();
  };
  const toggleAdmin = (u: AdminUser, next: boolean) =>
    run(u, 'admin', () => setUserAdmin(u.id, next));
  const toggleManager = (u: AdminUser, next: boolean) =>
    run(u, 'manager', () => setUserManager(u.id, next));
  const toggleInvitee = (u: AdminUser, next: boolean) =>
    run(u, 'inviter', () => setUserInvitee(u.id, next));

  // Kicking is irreversible — force a 3-second wait even for admins.
  const kick = async (u: AdminUser) => {
    const ok = await confirm({
      message: t('confirmKickUser', { name: u.name ?? u.email }),
      confirmLabel: t('kickUser'),
      destructive: true,
      delaySeconds: 3,
    });
    if (!ok) return;
    setKicking(u.id);
    const r = await deleteUser(u.id);
    setKicking(null);
    if (!r.ok) toast.error(r.message);
  };

  return (
    <CollapsibleSection title={t('usersHeading')} right={users.length}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchUsers')}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          {filtered.length === 0 && (
            <p className="py-2 text-center text-sm text-[var(--muted-foreground)]">
              {t('noUserMatches')}
            </p>
          )}
          {filtered.map((u) => {
            const isLastAdmin = u.isAdmin && adminCount <= 1;
            const rowPending = pending?.id === u.id;
            return (
              <div
                key={u.id}
                className="flex flex-col gap-3 rounded-md bg-[var(--muted)]/30 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <PersonBadge
                    name={u.name ?? u.email}
                    isGuest={false}
                    highlight={u.id === viewerId}
                    isAdmin={u.isAdmin}
                    isManager={u.isManager}
                  />
                  {u.id !== viewerId && (
                    <button
                      type="button"
                      aria-label={t('kickUser')}
                      title={t('kickUser')}
                      disabled={kicking === u.id}
                      onClick={() => kick(u)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--destructive)] transition-colors active:bg-[color-mix(in_oklch,var(--destructive),transparent_85%)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {kicking === u.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserX className="size-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <RoleToggle
                    label={t('roleAdmin')}
                    active={u.isAdmin}
                    disabled={rowPending || (u.isAdmin && isLastAdmin)}
                    pending={rowPending && pending?.role === 'admin'}
                    onToggle={() => toggleAdmin(u, !u.isAdmin)}
                  />
                  <RoleToggle
                    label={t('roleManager')}
                    active={u.isManager}
                    disabled={rowPending}
                    pending={rowPending && pending?.role === 'manager'}
                    onToggle={() => toggleManager(u, !u.isManager)}
                  />
                  <RoleToggle
                    label={t('roleInviter')}
                    active={u.isInvitee}
                    disabled={rowPending}
                    pending={rowPending && pending?.role === 'inviter'}
                    onToggle={() => toggleInvitee(u, !u.isInvitee)}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}
