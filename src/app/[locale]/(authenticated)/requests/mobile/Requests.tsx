'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PersonBadge } from '@/components/PersonBadge';
import { useConfirm } from '@/components/ConfirmDialog';
import { FullCottageShape, RoomIcon } from '@/components/booking/RoomIcon';
import { bedDisplayNameInRoom } from '@/lib/booking/bed-display';
import { roomLabel } from '@/lib/booking/room-label';
import { approveBooking, rejectBooking } from '@/server/actions/requests';
import {
  buildRequestItems,
  groupRequests,
  participantLabel,
  type ConflictReason,
  type RequestGroup,
  type RequestRow,
  type RequestsProps,
} from '../shared';

/**
 * Mobile requests: rows wrap onto their own line; Approve/Reject become
 * full-width stacked buttons so the manager can act with one thumb.
 */
export function Requests({ rows, roomCapacities, beds }: RequestsProps) {
  const t = useTranslations('Requests');
  const tBook = useTranslations('Book');
  const tDash = useTranslations('Dashboard');
  const locale = useLocale();
  const confirm = useConfirm();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const items = React.useMemo(
    () => buildRequestItems(groupRequests(rows), roomCapacities),
    [rows, roomCapacities],
  );
  const reasonLabel = (r: ConflictReason) => t(`conflictReason_${r}`);

  const formatDate = React.useCallback(
    (iso: string) =>
      new Date(iso + 'T00:00:00Z').toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [locale],
  );

  const targetLabel = (r: RequestRow): string => {
    if (r.targetKind === 'FULL_COTTAGE') return tDash('fullCottage');
    if ((r.targetKind === 'ROOM' || r.targetKind === 'SLOT') && (r.roomNameNb || r.roomNameEn)) {
      return roomLabel({ nameNb: r.roomNameNb, nameEn: r.roomNameEn }, locale);
    }
    if (r.targetKind === 'BED' && r.bedKind && r.bedId) {
      return bedDisplayNameInRoom(r.bedKind, r.bedId, beds, (k) => tBook(k));
    }
    return '?';
  };

  const targetIcon = (r: RequestRow) => {
    if (r.targetKind === 'FULL_COTTAGE') return <FullCottageShape size={20} />;
    if (r.roomIcon) {
      return <RoomIcon name={r.roomIcon} size={14} color={r.roomColor ?? undefined} />;
    }
    return null;
  };

  const act = async (
    bookingId: string,
    fn: typeof approveBooking | typeof rejectBooking,
  ) => {
    setPendingId(bookingId);
    try {
      const r = await fn(bookingId);
      if (!r.ok) toast.error(r.message);
    } finally {
      setPendingId(null);
    }
  };

  const approveConfirm = (g: RequestGroup, otherConflicts: number) =>
    otherConflicts > 0
      ? confirm({
          title: t('approveConflictTitle'),
          message: t('approveConflictMessage', { count: otherConflicts }),
          confirmLabel: t('approve'),
          delaySeconds: 3,
        })
      : confirm({ message: t('confirmApprove'), confirmLabel: t('approve') });

  const renderCard = (g: RequestGroup, otherConflicts = 0) => (
    <Card key={g.bookingId} className="p-3">
      <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {formatDate(g.startDate)} → {formatDate(g.endDate)}
          </p>
          <Badge className="ml-auto bg-[color-mix(in_oklch,var(--color-partial),white_60%)] text-[var(--color-clay-800)]">
            {t('badgePending')}
          </Badge>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {tDash.rich('bookedBy', { name: g.bookerName ?? '—', who: (c) => <>{c}</> })}
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {g.rows.map((r) => (
          <li
            key={r.rowId}
            className="flex flex-col gap-1 rounded-lg bg-[var(--muted)]/30 p-2"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center">
                {targetIcon(r)}
              </span>
              <span className="text-sm font-medium">{targetLabel(r)}</span>
            </div>
            <span className="pl-8">
              <PersonBadge
                name={participantLabel(r)}
                isGuest={!r.participantId}
                isAdmin={!!r.participantIsAdmin}
                isManager={!!r.participantIsManager}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2">
        <Button
          className="w-full"
          disabled={pendingId === g.bookingId}
          onClick={async () => {
            if (!(await approveConfirm(g, otherConflicts))) return;
            void act(g.bookingId, approveBooking);
          }}
        >
          {pendingId === g.bookingId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {t('approve')}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={pendingId === g.bookingId}
          onClick={async () => {
            if (!(await confirm({ message: t('confirmReject'), confirmLabel: t('reject'), destructive: true }))) return;
            void act(g.bookingId, rejectBooking);
          }}
        >
          <X className="size-4" />
          {t('reject')}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            {t('empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === 'single' ? (
              renderCard(item.group)
            ) : (
              <section
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-amber-400/60 bg-amber-400/5 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-700">
                    {t('conflictTitle')}
                  </span>
                  {item.reasons.map((r) => (
                    <Badge
                      key={r}
                      className="border border-amber-400/60 bg-amber-400/10 text-amber-700"
                    >
                      {reasonLabel(r)}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-amber-700/90">
                  {t('conflictNote', { count: item.groups.length })}
                </p>
                <div className="flex flex-col gap-3">
                  {item.groups.map((g) => renderCard(g, item.groups.length - 1))}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}
