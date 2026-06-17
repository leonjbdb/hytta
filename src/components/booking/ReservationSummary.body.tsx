'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bedDisplayName } from '@/lib/booking/bed-display';
import { formatStay } from '@/lib/booking/format-stay';
import { daysInRange } from '@/lib/utils';
import { FullCottageShape, RoomIcon } from './RoomIcon';
import {
  buildSummaryModel,
  targetCount,
  type ReservationSummaryProps,
} from './ReservationSummary.shared';

/**
 * Shared innards of the confirm-booking summary, used verbatim by both the
 * desktop (sticky card) and mobile (bottom sheet) wrappers. Renders:
 *   - a header row that doubles as an accordion toggle (default *closed*),
 *     showing the night count and a short "N rooms · M people" summary;
 *   - a collapsible panel listing every room, bed and person in full;
 *   - the confirm button.
 */
export function ReservationSummaryBody({
  startDate,
  endDate,
  selection,
  rooms,
  beds,
  users,
  isPending,
  onConfirm,
  submitLabel,
}: ReservationSummaryProps) {
  const t = useTranslations('Book');
  const locale = useLocale();

  const [open, setOpen] = React.useState(false);
  const detailsId = React.useId();

  const days = startDate && endDate ? daysInRange(startDate, endDate) : 0;
  const count = targetCount(selection);
  const ready = !!startDate && !!endDate && days > 0 && count > 0 && !isPending;

  const model = React.useMemo(
    () => buildSummaryModel(selection, rooms, users, t('fullCottage'), locale),
    [selection, rooms, users, locale, t],
  );

  const showToggle = ready && model.groups.length > 0;

  /** Friendly bed name (e.g. "Single bed 2") or `null` for SLOTS / cottage. */
  const bedName = (roomId: string, bedId: string | null): string | null => {
    if (!bedId) return null;
    const bed = beds.find((b) => b.id === bedId);
    if (!bed) return null;
    return bedDisplayName(bed.kind, (k) => t(k), {
      allBedsInRoom: beds.filter((b) => b.roomId === roomId),
      bedId,
    });
  };

  const dateRange =
    startDate && endDate ? formatStay({ startDate, endDate }, locale) : '';
  const eyebrow = ready
    ? `${t('daysCount', { days })} · ${dateRange}`
    : t('summaryTitle');
  const shortSummary = !ready
    ? t('summaryNoSelection')
    : model.mode === 'FULL_COTTAGE'
      ? `${t('fullCottage')} · ${t('summaryPeople', { count: model.peopleCount })}`
      : `${t('summaryRooms', { count: model.roomCount })} · ${t('summaryPeople', {
          count: model.peopleCount,
        })}`;

  const header = (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
        <CalendarCheck className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold capitalize tracking-wide text-[var(--muted-foreground)]">
          {eyebrow}
        </p>
        <p className="truncate text-sm font-medium">{shortSummary}</p>
      </div>
      {showToggle && (
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      )}
    </>
  );

  return (
    <div>
      {showToggle ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-3">{header}</div>
      )}

      {showToggle && (
        <div
          id={detailsId}
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <ul className="mt-3 max-h-[40vh] space-y-3 overflow-y-auto border-t border-[var(--border)] pr-1 pt-3">
              {model.groups.map((group) => (
                <li key={group.key}>
                  <div className="flex items-center gap-2">
                    {group.icon ? (
                      <RoomIcon name={group.icon} color={group.color ?? undefined} size={14} />
                    ) : (
                      <FullCottageShape size={14} />
                    )}
                    <span className="truncate text-sm font-medium">{group.label}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                      {t('summaryPeople', { count: group.peopleCount })}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 pl-6 text-sm text-[var(--muted-foreground)]">
                    {group.beds.map((bg, i) => {
                      const name = bedName(group.key, bg.bedId);
                      return (
                        <li key={bg.bedId ?? `loose-${i}`}>
                          {name && (
                            <span className="text-[var(--foreground)]/70">{name}: </span>
                          )}
                          {bg.people.join(', ')}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Button className="mt-3 w-full" size="lg" disabled={!ready} onClick={onConfirm}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitLabel ?? t('confirmCta')}
      </Button>
    </div>
  );
}
