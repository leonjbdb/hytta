'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { credentialsLogin } from '@/server/actions/auth';

interface DemoLoginAccount {
  name: string;
  email: string;
  password: string;
  role: 'adminManager' | 'member';
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
  const shellClassName = demoMode
    ? 'grid w-full max-w-5xl grid-cols-[minmax(0,26rem)_minmax(22rem,1fr)] items-start gap-5'
    : 'flex w-full max-w-md justify-center';

  return (
    <div className="flex w-full justify-center px-2 py-4">
      <div className={shellClassName}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-xl font-semibold leading-tight tracking-tight">
              {t('credentialsTitle')}
            </h1>
            <CardDescription>{t('credentialsSubtitle')}</CardDescription>
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
          <div className="grid grid-cols-2 gap-3 pt-2">
            {demoAccounts.map((account, index) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className={[
                  'min-h-32 rounded-sm border border-[#d6bd55] bg-[#fff1a8] p-3 text-left text-[#3a2a12]',
                  'shadow-[0_10px_22px_rgba(58,42,18,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(58,42,18,0.2)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
                  index % 4 === 0 ? '-rotate-1' : '',
                  index % 4 === 1 ? 'rotate-1' : '',
                  index % 4 === 2 ? 'rotate-[0.6deg]' : '',
                  index % 4 === 3 ? '-rotate-[0.6deg]' : '',
                ].join(' ')}
              >
                <span className="block font-mono text-[11px] uppercase tracking-normal text-[#80661e]">
                  {account.role === 'adminManager'
                    ? t('demoRoleAdminManager')
                    : t('demoRoleMember')}
                </span>
                <span className="mt-1 block text-base font-semibold leading-tight">
                  {account.name}
                </span>
                <span className="mt-3 block break-all font-mono text-xs leading-snug">
                  {account.email}
                </span>
                <span className="mt-1 block font-mono text-xs leading-snug">
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
