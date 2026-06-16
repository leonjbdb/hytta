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

/** Scatter positions (with size + rotation) for the demo-login notes. */
const DEMO_NOTE_POSITIONS = [
  'left-[31.5rem] top-0 w-56 -rotate-[5deg]',
  'right-0 top-10 w-56 rotate-[3deg]',
  'left-[29rem] top-[11.5rem] w-60 rotate-[1.5deg]',
  'right-3 top-[15.25rem] w-56 -rotate-[4deg]',
  'left-[32rem] top-[24rem] w-56 rotate-[5deg]',
  'right-1 top-[28rem] w-60 rotate-[1deg]',
  'left-16 top-[31.5rem] w-56 -rotate-[3deg]',
  'left-[26rem] top-[35.5rem] w-56 rotate-[4deg]',
] as const;

function demoNotePosition(index: number): string {
  return DEMO_NOTE_POSITIONS[index % DEMO_NOTE_POSITIONS.length] ?? DEMO_NOTE_POSITIONS[0]!;
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
  const demoMode = demoAccounts.length > 0;

  return (
    <div className="flex w-full justify-center px-2 py-4">
      <div
        className={
          demoMode
            ? 'relative min-h-[48rem] w-full max-w-5xl'
            : 'flex w-full max-w-md justify-center'
        }
      >
        <Card
          className={
            demoMode
              ? 'absolute left-0 top-[8.75rem] z-20 w-full max-w-md'
              : 'w-full max-w-md'
          }
        >
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
            {!demoMode && (
              <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
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
        {demoMode && (
          <div className="absolute inset-0">
            {demoAccounts.map((account, index) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                style={demoNoteStyle(index)}
                className={[
                  'absolute min-h-36 hover:z-30',
                  demoNotePosition(index),
                  DEMO_NOTE_PAPER_CLASS,
                ].join(' ')}
              >
                <span aria-hidden className={DEMO_NOTE_FOLD_CLASS} />
                <span className="relative block font-mono text-[10px] uppercase tracking-normal text-[#80661e]">
                  {account.role === 'adminManager'
                    ? t('demoRoleAdminManager')
                    : t('demoRoleMember')}
                </span>
                <span className="relative mt-1 block text-base font-semibold leading-tight">
                  {account.name}
                </span>
                <span className="relative mt-3 block break-all font-mono text-xs leading-snug">
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
    </div>
  );
}
