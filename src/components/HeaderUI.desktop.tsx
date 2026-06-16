'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarPlus, ClipboardList, Hammer, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface Props {
  userName: string | null;
  userShortName: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isInvitee: boolean;
  pendingCount: number;
  signOutAction: () => Promise<void>;
}

/**
 * Desktop right-side controls: theme toggle, the inline nav, and the user menu.
 * The shared `Header` owns the bar and brand; this only fills the right slot
 * (shown at `md` and up). Rendered only when a user is present.
 */
export function HeaderDesktopControls({
  userName,
  userShortName,
  isAdmin,
  isManager,
  isInvitee,
  pendingCount,
  signOutAction,
}: Props) {
  const t = useTranslations('Common');

  return (
    <>
      <ThemeToggle />
      {isAdmin && (
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <Shield className="size-4" />
            {t('admin')}
          </Button>
        </Link>
      )}
      {isManager && (
        <Link href="/requests" className="relative">
          <Button variant="ghost" size="sm">
            <ClipboardList className="size-4" />
            {t('requests')}
          </Button>
          {pendingCount > 0 && (
            <span
              aria-label={`${pendingCount}`}
              className="pointer-events-none absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--color-taken)] px-1 text-[10px] font-semibold text-white"
            >
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </Link>
      )}
      <Link href="/groups">
        <Button variant="ghost" size="sm">
          <Users className="size-4" />
          {t('groups')}
        </Button>
      </Link>
      <Link href="/volunteer">
        <Button variant="ghost" size="sm">
          <Hammer className="size-4" />
          {t('dugnad')}
        </Button>
      </Link>
      <Link href="/book">
        <Button variant="ghost" size="sm">
          <CalendarPlus className="size-4" />
          {t('bookStay')}
        </Button>
      </Link>
      <UserMenu
        name={userShortName ?? userName ?? t('account')}
        fullName={userName ?? undefined}
        isInvitee={isInvitee}
        signOutAction={signOutAction}
      />
    </>
  );
}
