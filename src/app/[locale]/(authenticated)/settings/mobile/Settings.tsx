'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword, updateName } from '@/server/actions/user';
import { NotificationsForm } from '../NotificationsForm';
import { DeleteAccountForm } from '../DeleteAccountForm';
import type { SettingsProps } from '../shared';

/**
 * Mobile settings: tighter heading, full-width submit buttons, status text
 * stacks under the button instead of beside it (no horizontal real estate).
 */
export function Settings({
  firstName,
  lastName,
  email,
  hasPassword,
  isAdmin,
  isManager,
  notifyEnabled,
  notifyBooking,
  notifyRequests,
}: SettingsProps) {
  const t = useTranslations('Settings');
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{email}</p>
      </header>
      <NameForm initialFirstName={firstName} initialLastName={lastName} />
      <NotificationsForm
        initialEnabled={notifyEnabled}
        initialBooking={notifyBooking}
        initialRequests={notifyRequests}
        isManager={isManager}
      />
      {isAdmin && <PasswordForm hasPassword={hasPassword} />}
      <DeleteAccountForm />
    </div>
  );
}

function NameForm({
  initialFirstName,
  initialLastName,
}: {
  initialFirstName: string;
  initialLastName: string;
}) {
  const t = useTranslations('Settings');
  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [lastName, setLastName] = React.useState(initialLastName);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('nameHeading')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          action={(fd) => {
            setStatus(null);
            startTransition(async () => {
              const r = await updateName(fd);
              if (!r.ok) setStatus({ kind: 'error', msg: r.message });
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="settings-first-name">{t('firstNameLabel')}</Label>
            <Input
              id="settings-first-name"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="settings-last-name">{t('lastNameLabel')}</Label>
            <Input
              id="settings-last-name"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={80}
            />
          </div>
          <Button type="submit" disabled={pending || !firstName.trim()} className="w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('saveName')}
          </Button>
          {status && (
            <span
              className={
                status.kind === 'ok'
                  ? 'text-xs text-[var(--color-moss-700)]'
                  : 'text-xs text-[var(--destructive)]'
              }
            >
              {status.msg}
            </span>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('Settings');
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {hasPassword ? t('passwordHeading') : t('passwordSetHeading')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasPassword && (
          <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('passwordSetHint')}</p>
        )}
        <form
          ref={formRef}
          className="flex flex-col gap-3"
          action={(fd) => {
            setStatus(null);
            startTransition(async () => {
              const r = await changePassword(fd);
              if (r.ok) {
                setStatus({
                  kind: 'ok',
                  msg: hasPassword ? t('passwordChanged') : t('passwordSet'),
                });
                formRef.current?.reset();
              } else {
                setStatus({ kind: 'error', msg: r.message });
              }
            });
          }}
        >
          {hasPassword && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="current-password">{t('currentPassword')}</Label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-password">{t('newPassword')}</Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <p className="text-xs text-[var(--muted-foreground)]">{t('passwordHelp')}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {hasPassword ? t('savePassword') : t('setPasswordCta')}
          </Button>
          {status && (
            <span
              className={
                status.kind === 'ok'
                  ? 'text-xs text-[var(--color-moss-700)]'
                  : 'text-xs text-[var(--destructive)]'
              }
            >
              {status.msg}
            </span>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
