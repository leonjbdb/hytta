'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LoginForm } from './login-form';

export function Login() {
  const t = useTranslations('Auth');
  return (
    <div className="mt-6 flex flex-col gap-4 px-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('loginTitle')}</CardTitle>
          <CardDescription>{t('magicLinkSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            <Link
              href="/login/credentials"
              className="underline-offset-4 hover:underline"
            >
              {t('passwordLoginLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
