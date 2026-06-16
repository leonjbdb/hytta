'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { updateNotificationPrefs } from '@/server/actions/user';

interface Props {
  initialEnabled: boolean;
  initialBooking: boolean;
  initialRequests: boolean;
  /** Whether to show the manager-only "booking requests" option. */
  isManager: boolean;
}

/**
 * Email-notification preferences. A master switch reveals one or two sub-toggles
 * (booking emails for everyone; booking requests for managers). Each change
 * saves immediately and reports a small status line. Shared by the desktop and
 * mobile Settings screens so the behaviour stays identical.
 */
export function NotificationsForm({
  initialEnabled,
  initialBooking,
  initialRequests,
  isManager,
}: Props) {
  const t = useTranslations('Settings');
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [booking, setBooking] = React.useState(initialBooking);
  const [requests, setRequests] = React.useState(initialRequests);
  const [, startTransition] = React.useTransition();

  // Optimistic: the switch flips instantly and we persist in the background.
  const persist = (next: { enabled: boolean; booking: boolean; requests: boolean }) => {
    startTransition(async () => {
      await updateNotificationPrefs(next);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">{t('notificationsHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleRow
          label={t('notifyEnabledLabel')}
          hint={t('notifyEnabledHint')}
          checked={enabled}
          onChange={() => {
            const v = !enabled;
            setEnabled(v);
            persist({ enabled: v, booking, requests });
          }}
        />

        {enabled && (
          <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-4">
            <ToggleRow
              label={t('notifyBookingLabel')}
              hint={t('notifyBookingHint')}
              checked={booking}
              onChange={() => {
                const v = !booking;
                setBooking(v);
                persist({ enabled, booking: v, requests });
              }}
            />
            {isManager && (
              <ToggleRow
                label={t('notifyRequestsLabel')}
                hint={t('notifyRequestsHint')}
                checked={requests}
                onChange={() => {
                  const v = !requests;
                  setRequests(v);
                  persist({ enabled, booking, requests: v });
                }}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  // The whole row is the switch: a single role="switch" button (named by its
  // text content) rather than a <label> wrapping a separate button — a <label>
  // can't associate with a custom switch widget, so it was orphaned.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full cursor-pointer items-start justify-between gap-4 text-left"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs font-normal text-[var(--muted-foreground)]">{hint}</span>
      </span>
      <span
        aria-hidden
        className={
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
          (checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)] border border-[var(--border)]')
        }
      >
        <span
          className={
            'inline-block size-5 transform rounded-full bg-white shadow transition-transform ' +
            (checked ? 'translate-x-5' : 'translate-x-0.5')
          }
        />
      </span>
    </button>
  );
}
