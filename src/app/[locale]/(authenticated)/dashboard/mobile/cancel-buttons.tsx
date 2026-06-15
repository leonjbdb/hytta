'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ConfirmDialog';
import { cancelBooking, cancelReservation } from '@/server/actions/reservations';

export function CancelRowButton({ id, own }: { id: string; own: boolean }) {
  const t = useTranslations('Dashboard');
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={async () => {
        if (!(await confirm({ message: t('confirmCancelRow'), destructive: true }))) return;
        startTransition(async () => {
          await cancelReservation(id);
        });
      }}
    >
      <Trash2 className="size-3.5" />
      {own ? t('cancelRow') : t('cancelRowOther')}
    </Button>
  );
}

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Dashboard');
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={async () => {
        if (!(await confirm({ message: t('confirmCancelBooking'), destructive: true }))) return;
        startTransition(async () => {
          await cancelBooking(bookingId);
        });
      }}
    >
      <Trash2 className="size-3.5" />
      {t('cancelBooking')}
    </Button>
  );
}
