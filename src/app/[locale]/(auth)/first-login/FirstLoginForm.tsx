'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeFirstLogin } from '@/server/actions/user';

interface Props {
  email: string;
  initialFirstName: string;
  initialLastName: string;
  initialNotifyEnabled: boolean;
  initialNotifyBooking: boolean;
  initialNotifyRequests: boolean;
  isManager: boolean;
}

export function FirstLoginForm({
  email,
  initialFirstName,
  initialLastName,
  initialNotifyEnabled,
  initialNotifyBooking,
  initialNotifyRequests,
  isManager,
}: Props) {
  const router = useRouter();
  const t = useTranslations('FirstLogin');
  const tSettings = useTranslations('Settings');
  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [lastName, setLastName] = React.useState(initialLastName);
  const [notifyEnabled, setNotifyEnabled] = React.useState(initialNotifyEnabled);
  const [notifyBooking, setNotifyBooking] = React.useState(initialNotifyBooking);
  const [notifyRequests, setNotifyRequests] = React.useState(initialNotifyRequests);
  const [pending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await completeFirstLogin({
        firstName,
        lastName,
        notifyEnabled,
        notifyBooking,
        notifyRequests,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-xl items-center py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle', { email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={submit}>
            <section className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="first-login-first-name">
                    {tSettings('firstNameLabel')}
                  </Label>
                  <Input
                    id="first-login-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    maxLength={80}
                    autoComplete="given-name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="first-login-last-name">
                    {tSettings('lastNameLabel')}
                  </Label>
                  <Input
                    id="first-login-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    maxLength={80}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-5">
              <div>
                <h2 className="text-base font-semibold">
                  {tSettings('notificationsHeading')}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {t('notificationsHint')}
                </p>
              </div>
              <ToggleRow
                label={tSettings('notifyEnabledLabel')}
                hint={tSettings('notifyEnabledHint')}
                checked={notifyEnabled}
                onChange={() => setNotifyEnabled((value) => !value)}
              />

              {notifyEnabled && (
                <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-4">
                  <ToggleRow
                    label={tSettings('notifyBookingLabel')}
                    hint={tSettings('notifyBookingHint')}
                    checked={notifyBooking}
                    onChange={() => setNotifyBooking((value) => !value)}
                  />
                  {isManager && (
                    <ToggleRow
                      label={tSettings('notifyRequestsLabel')}
                      hint={tSettings('notifyRequestsHint')}
                      checked={notifyRequests}
                      onChange={() => setNotifyRequests((value) => !value)}
                    />
                  )}
                </div>
              )}
            </section>

            <Button
              type="submit"
              size="lg"
              disabled={pending || !firstName.trim()}
              className="self-start"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t('continue')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
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
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ' +
          (checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)] border border-[var(--border)]')
        }
      >
        <span
          className={
            'inline-block size-5 transform rounded-full bg-white shadow transition-transform ' +
            (checked ? 'translate-x-5' : 'translate-x-0.5')
          }
        />
      </button>
    </label>
  );
}
