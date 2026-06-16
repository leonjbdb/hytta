'use client';

import * as React from 'react';
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
import { completeCottageSetup } from '@/server/actions/cottage';

const NAME_MAX = 60;
const PART_MAX = 80;

/**
 * First-run setup, in two steps:
 *   1. Name the app (cottage).
 *   2. Who's the admin — their email + first/last name.
 */
export function SetupForm() {
  const t = useTranslations('Setup');
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState<{ emailed: boolean } | null>(null);

  function goNext() {
    if (!name.trim()) return;
    setStep(2);
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name);
      fd.set('adminEmail', adminEmail);
      fd.set('firstName', firstName);
      fd.set('lastName', lastName);
      const r = await completeCottageSetup(fd);
      if (r.ok) {
        // Don't bounce to the login page — the admin signs in via the magic
        // link we just emailed, so show a "check your email" confirmation.
        setDone({ emailed: r.emailed ?? false });
      } else {
        toast.error(r.message);
      }
    });
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('sentTitle')}</CardTitle>
          <CardDescription>
            {done.emailed ? t('sentBody') : t('sentBodyNoEmail')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {step === 1 ? t('subtitle') : t('adminSubtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) goNext();
            else submit();
          }}
        >
          {step === 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="cottage-name">{t('nameLabel')}</Label>
              <Input
                id="cottage-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                required
                maxLength={NAME_MAX}
                autoFocus
                autoComplete="off"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="admin-email">{t('adminLabel')}</Label>
                <Input
                  id="admin-email"
                  name="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder={t('adminPlaceholder')}
                  required
                  autoFocus
                  autoComplete="email"
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  {t('adminHint')}
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="first-name">{t('firstNameLabel')}</Label>
                  <Input
                    id="first-name"
                    name="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('firstNamePlaceholder')}
                    required
                    maxLength={PART_MAX}
                    autoComplete="given-name"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="last-name">{t('lastNameLabel')}</Label>
                  <Input
                    id="last-name"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('lastNamePlaceholder')}
                    maxLength={PART_MAX}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            {step === 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep(1);
                }}
                disabled={pending}
              >
                {t('back')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                pending ||
                (step === 1 ? !name.trim() : !adminEmail.trim() || !firstName.trim())
              }
              className={step === 1 ? 'self-start' : undefined}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {step === 1 ? t('next') : pending ? t('saving') : t('submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
