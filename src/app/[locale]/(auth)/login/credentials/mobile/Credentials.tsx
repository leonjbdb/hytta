'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { credentialsLogin } from '@/server/actions/auth';
import { DEMO_NOTE_FOLD_CLASS, DEMO_NOTE_PAPER_CLASS, demoNoteStyle } from '../demo-note';

interface DemoLoginAccount {
  name: string;
  email: string;
  password: string;
  role: 'adminManager' | 'member';
}

const MOBILE_NOTE_ROTATIONS = [
  '-rotate-[1.2deg]',
  'rotate-[1.6deg]',
  '-rotate-[0.7deg]',
  'rotate-[0.9deg]',
] as const;

function mobileNoteRotation(index: number): (typeof MOBILE_NOTE_ROTATIONS)[number] {
  return MOBILE_NOTE_ROTATIONS[index % MOBILE_NOTE_ROTATIONS.length] ?? MOBILE_NOTE_ROTATIONS[0]!;
}

export function Credentials({
  demoAccounts,
}: {
  demoAccounts: readonly DemoLoginAccount[];
}) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showDemoLogins, setShowDemoLogins] = useState(false);
  const demoMode = demoAccounts.length > 0;

  return (
    <div className="flex w-full justify-center px-2 py-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            {t('credentialsTitle')}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3"
            action={(fd) => {
              startTransition(async () => {
                const r = await credentialsLogin(fd);
                if (!r.ok) {
                  toast.error(r.message);
                  return;
                }
                router.push('/dashboard');
                router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" size="lg" disabled={isPending} className="mt-1">
              {t('credentialsCta')}
            </Button>
          </form>
          {demoMode && (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                aria-expanded={showDemoLogins}
                aria-controls="demo-login-list"
                onClick={() => setShowDemoLogins((open) => !open)}
              >
                {showDemoLogins ? t('hideDemoLogins') : t('showDemoLogins')}
              </Button>
              {showDemoLogins && (
                <div id="demo-login-list" className="grid gap-2">
                  {demoAccounts.map((account, index) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                      }}
                      style={demoNoteStyle(index)}
                      className={['relative', mobileNoteRotation(index), DEMO_NOTE_PAPER_CLASS].join(' ')}
                    >
                      <span aria-hidden className={DEMO_NOTE_FOLD_CLASS} />
                      <span className="relative block font-mono text-[11px] uppercase tracking-normal text-[#80661e]">
                        {account.role === 'adminManager'
                          ? t('demoRoleAdminManager')
                          : t('demoRoleMember')}
                      </span>
                      <span className="relative mt-1 block text-sm font-semibold leading-tight">
                        {account.name}
                      </span>
                      <span className="relative mt-2 block break-all font-mono text-xs leading-snug">
                        {account.email}
                      </span>
                      <span className="relative mt-1 block font-mono text-xs leading-snug">
                        {account.password}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!demoMode && (
            <div className="flex flex-col gap-1.5 text-center text-xs text-[var(--muted-foreground)]">
              <Link href="/login" className="underline-offset-4 hover:underline">
                {t('magicLinkInsteadLink')}
              </Link>
              <Link href="/forgot-password" className="underline-offset-4 hover:underline">
                {t('forgotPasswordLink')}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
