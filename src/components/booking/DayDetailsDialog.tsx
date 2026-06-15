'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { roomLabel } from '@/lib/booking/room-label';
import type { DayAssignment } from '@/server/actions/availability';
import { RoomIcon } from './RoomIcon';

interface RoomMeta {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
}

interface Props {
  date: Date;
  assignments: DayAssignment[];
  rooms: RoomMeta[];
  onClose: () => void;
}

/**
 * Read-only popup listing who has reserved a given day. Opens when the user
 * clicks a fully-booked day in the date picker — the picker swallows the
 * range-selection effect so opening this dialog never disturbs the user's
 * pending from/to choice.
 */
export function DayDetailsDialog({ date, assignments, rooms, onClose }: Props) {
  const t = useTranslations('Book');
  const locale = useLocale();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dateLabel = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date),
    [date, locale],
  );

  const cottageNames = assignments.filter((a) => a.fullCottage).map((a) => a.name);
  const byRoom = new Map<string, string[]>();
  for (const a of assignments) {
    if (a.fullCottage || !a.roomId) continue;
    const list = byRoom.get(a.roomId) ?? [];
    list.push(a.name);
    byRoom.set(a.roomId, list);
  }
  const roomGroups = rooms
    .filter((r) => byRoom.has(r.id))
    .map((r) => ({ room: r, names: byRoom.get(r.id) ?? [] }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('dayDetailsTitle')}
    >
      <button
        type="button"
        aria-label={t('closeDialog')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex w-full max-w-md flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <h2 className="text-base font-semibold capitalize">{dateLabel}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('dayDetailsSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeDialog')}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-[var(--muted)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {cottageNames.length > 0 && (
            <section className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)]/60 p-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {t('fullCottage')}
              </h3>
              <ul className="flex flex-col gap-1 text-sm">
                {cottageNames.map((name, i) => (
                  <li key={`cottage-${i}`}>{name}</li>
                ))}
              </ul>
            </section>
          )}
          {roomGroups.map(({ room, names }) => (
            <section
              key={room.id}
              className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)]/60 p-3"
            >
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                <RoomIcon name={room.icon} size={14} color={room.color} />
                {roomLabel(room, locale)}
              </h3>
              <ul className="flex flex-col gap-1 text-sm">
                {names.map((n, i) => (
                  <li key={`${room.id}-${i}`}>{n}</li>
                ))}
              </ul>
            </section>
          ))}
          {assignments.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('dayDetailsEmpty')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
