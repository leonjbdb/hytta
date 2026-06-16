'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LoginForm } from './login-form';

export function Login() {
  const t = useTranslations('Auth');
  return (
    <div className="flex w-full justify-center px-2 py-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            {t('loginTitle')}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
