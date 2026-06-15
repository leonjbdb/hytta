'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DateRange } from 'react-day-picker';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/booking/DateRangePicker.desktop';
import {
  RoomBedPicker,
  type PickerBed,
  type PickerRoom,
  type PickerUser,
} from '@/components/booking/RoomBedPicker.desktop';
import { GroupPicker, type GroupOption } from '@/components/booking/GroupPicker';
import { PendingWarning } from '@/components/booking/PendingWarning';
import { ReservationSummary } from '@/components/booking/ReservationSummary.desktop';
import { fetchAvailability } from '@/server/actions/availability';
import { createBooking, updateBooking } from '@/server/actions/reservations';
import { toISODate } from '@/lib/utils';
import { useBookingDraft, type EditBookingState } from '@/lib/booking/use-booking-draft';
import type { AvailabilityTarget } from '@/lib/booking/types';
import type { GroupContribution } from '@/lib/booking/group-preset';

interface Props {
  rooms: PickerRoom[];
  beds: PickerBed[];
  users: PickerUser[];
  groups: GroupOption[];
  currentUserId: string;
  /** Present when editing an existing booking rather than creating one. */
  edit?: EditBookingState;
}

function parseISO(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function Booking({ rooms, beds, users, groups, currentUserId, edit }: Props) {
  const t = useTranslations('Book');
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupParam = searchParams.get('group');
  const { draft, update, clear } = useBookingDraft(currentUserId);
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(groupParam);
  // Tracks exactly which picks the currently-selected group injected. Switching
  // or clearing the group subtracts these so manual additions stick around.
  const prevContribRef = React.useRef<GroupContribution | null>(null);
  const draftRef = React.useRef(draft);
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Entering edit mode loads the booking's current dates + placement into the
  // draft once (keyed by booking id) so it can be modified and saved back.
  const editInitRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (edit && editInitRef.current !== edit.bookingId) {
      editInitRef.current = edit.bookingId;
      update({ startDate: edit.startDate, endDate: edit.endDate, selection: edit.selection });
    }
  }, [edit, update]);

  const applyGroup = React.useCallback(
    async (groupId: string) => {
      const { fetchGroupContribution, subtractContribution, mergeContribution } =
        await import('@/lib/booking/group-preset');
      const contribution = await fetchGroupContribution(groupId, { rooms, beds });
      if (!contribution) return;
      const cleared = subtractContribution(draftRef.current.selection, prevContribRef.current);
      const { selection: next, added } = mergeContribution(cleared, contribution);
      update({ selection: next });
      prevContribRef.current = added;
      setActiveGroupId(groupId);
    },
    [update, rooms, beds],
  );

  const clearGroup = React.useCallback(async () => {
    const { subtractContribution } = await import('@/lib/booking/group-preset');
    const next = subtractContribution(draftRef.current.selection, prevContribRef.current);
    update({ selection: next });
    prevContribRef.current = null;
    setActiveGroupId(null);
  }, [update]);

  // Apply a group preset once per `?group=` value. Loading the group is a
  // separate server action so we only fire it on the page where it matters.
  const appliedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!groupParam || appliedRef.current === groupParam) return;
    appliedRef.current = groupParam;
    void applyGroup(groupParam);
  }, [groupParam, applyGroup]);

  const range: DateRange | undefined = React.useMemo(() => {
    const from = parseISO(draft.startDate);
    const to = parseISO(draft.endDate);
    if (!from) return undefined;
    return { from, to };
  }, [draft.startDate, draft.endDate]);

  const setRange = React.useCallback(
    (next: DateRange | undefined) => {
      update({
        startDate: next?.from ? toISODate(next.from) : null,
        endDate: next?.to ? toISODate(next.to) : null,
      });
    },
    [update],
  );

  const setSelection = React.useCallback(
    (next: typeof draft.selection) => update({ selection: next }),
    [update],
  );

  const [availability, setAvailability] = React.useState<AvailabilityTarget[]>([]);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<null | 'PENDING' | 'CONFIRMED'>(null);
  const [managerNames, setManagerNames] = React.useState<string[]>([]);

  const startDate = range?.from ? toISODate(range.from) : undefined;
  const endDate = range?.to ? toISODate(range.to) : undefined;

  React.useEffect(() => {
    if (!startDate || !endDate) {
      setAvailability([]);
      return;
    }
    let cancelled = false;
    fetchAvailability(startDate, endDate, edit?.bookingId).then((targets) => {
      if (!cancelled) setAvailability(targets);
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, edit?.bookingId]);

  const onConfirm = () => {
    if (!startDate || !endDate) return;
    setError(null);
    startTransition(async () => {
      const selection = draft.selection;
      type ApiParticipant =
        | ({ targetKind: 'FULL_COTTAGE' } & ({ userId: string } | { guestName: string }))
        | ({ targetKind: 'SLOT'; roomId: string } & ({ userId: string } | { guestName: string }))
        | ({ targetKind: 'BED'; bedId: string } & ({ userId: string } | { guestName: string }));
      const participants: ApiParticipant[] = [];

      const toRef = (p: { kind: 'user'; userId: string } | { kind: 'guest'; name: string }) =>
        p.kind === 'user' ? { userId: p.userId } : { guestName: p.name.trim() };

      if (selection.mode === 'FULL_COTTAGE') {
        for (const p of selection.fullCottageParticipants) {
          participants.push({ targetKind: 'FULL_COTTAGE', ...toRef(p) });
        }
      } else {
        for (const [roomId, list] of Object.entries(selection.rooms)) {
          const room = rooms.find((r) => r.id === roomId);
          for (const p of list) {
            // Bed rooms reserve specific beds (a chosen bed is exclusive);
            // slot rooms (e.g. the garden) stay capacity-based.
            if (room?.capacityMode === 'BEDS' && p.bedId) {
              participants.push({ targetKind: 'BED', bedId: p.bedId, ...toRef(p) });
            } else {
              participants.push({ targetKind: 'SLOT', roomId, ...toRef(p) });
            }
          }
        }
      }

      // Sanity-check guest entries — empty names should be flagged before we
      // hit the server.
      for (const p of participants) {
        if ('guestName' in p && !p.guestName) {
          setError('UNKNOWN');
          return;
        }
      }

      if (participants.length === 0) {
        setError('UNKNOWN');
        return;
      }

      const result = edit
        ? await updateBooking({ bookingId: edit.bookingId, startDate, endDate, participants })
        : await createBooking({ startDate, endDate, participants });
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? 'CONFLICT' : 'UNKNOWN');
        return;
      }
      clear();
      setManagerNames(result.data.managerNames ?? []);
      setSuccess(result.data.status);
    });
  };

  if (success) {
    const isPendingApproval = success === 'PENDING';
    const pendingBody =
      managerNames.length === 1
        ? t('pendingBodyOne', { name: managerNames[0]! })
        : managerNames.length === 2
          ? t('pendingBodyTwo', { a: managerNames[0]!, b: managerNames[1]! })
          : t('pendingBodyMany');
    return (
      <div
        className={`mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center ${
          isPendingApproval
            ? 'border-dashed border-[var(--color-partial)] bg-[color-mix(in_oklch,var(--card),var(--color-partial)_8%)]'
            : 'border-[var(--border)] bg-[var(--card)]'
        }`}
      >
        {isPendingApproval ? (
          <Clock3 className="size-10" style={{ color: 'var(--color-partial)' }} />
        ) : (
          <CheckCircle2 className="size-10" style={{ color: 'var(--color-available)' }} />
        )}
        <h2 className="text-xl font-semibold">
          {isPendingApproval
            ? t('pendingTitle')
            : edit
              ? t('editSuccessTitle')
              : t('successTitle')}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {isPendingApproval ? pendingBody : edit ? t('editSuccessBody') : t('successBody')}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => router.push('/dashboard')}>{t('viewDashboard')}</Button>
          <Button
            variant="outline"
            onClick={() => {
              setSuccess(null);
              setManagerNames([]);
              clear();
            }}
          >
            {t('bookAnother')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {edit ? t('editTitle') : t('title')}
        </h1>
        <p className="text-[var(--muted-foreground)]">
          {edit ? t('editSubtitle') : t('subtitle')}
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <DateRangePicker value={range} onChange={setRange} rooms={rooms} />
        </div>

        <div className="flex flex-col gap-4">
          {!startDate || !endDate ? (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8 text-center text-sm text-[var(--muted-foreground)]">
              {t('noDates')}
            </div>
          ) : (
            <>
              <PendingWarning availability={availability} />
              <GroupPicker
                groups={groups}
                value={activeGroupId}
                onApply={applyGroup}
                onClear={() => void clearGroup()}
              />
              <RoomBedPicker
                rooms={rooms}
                beds={beds}
                users={users}
                availability={availability}
                value={draft.selection}
                onChange={setSelection}
                currentUserId={currentUserId}
              />
            </>
          )}

          {startDate && endDate && (
            <ReservationSummary
              startDate={startDate}
              endDate={endDate}
              selection={draft.selection}
              rooms={rooms}
              beds={beds}
              users={users}
              isPending={isPending}
              error={error}
              onConfirm={onConfirm}
              submitLabel={edit ? t('saveChanges') : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
