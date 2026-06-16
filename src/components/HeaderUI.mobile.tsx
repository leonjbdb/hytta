'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ClipboardList,
  Hammer,
  LogOut,
  Mail,
  Menu,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { CalendarExportPanel } from './CalendarExport.shared';
import { LangSwitcher } from './LangSwitcher';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  userName: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isInvitee: boolean;
  pendingCount: number;
  signOutAction: () => Promise<void>;
}

/**
 * A drawer row: either a navigation link or the special "calendar export"
 * action (it swaps the drawer into its sub-view rather than navigating). Rows
 * are grouped into sections rendered with a divider between each group.
 */
type NavEntry =
  | { kind: 'link'; href: string; label: string; icon: React.ReactNode; badge?: number }
  | { kind: 'calendar' };

/**
 * Mobile right-side controls: the manager-pending bell + a hamburger that opens
 * a slide-over drawer. The shared `Header` owns the bar and brand; this fills
 * the right slot (shown below `md`). Rendered only when a user is present.
 *
 * The drawer is portaled to `document.body` rather than rendered in place: the
 * header uses `backdrop-blur-md` (a backdrop-filter), which per spec creates a
 * containing block for `position: fixed` descendants — nesting the drawer would
 * clip it to the 56-px-tall bar instead of the full viewport.
 */
export function HeaderMobileControls({
  userName,
  isAdmin,
  isManager,
  isInvitee,
  pendingCount,
  signOutAction,
}: Props) {
  const t = useTranslations('Common');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the drawer is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Three sections, divider-separated in the drawer:
  //   1. actions on the cottage — book, plus manager/admin tools
  //   2. community — groups + volunteer work
  //   3. account/utility — invite, calendar export, settings
  const primary: NavEntry[] = [
    { kind: 'link', href: '/book', label: t('bookStay'), icon: <CalendarPlus className="size-4" /> },
  ];
  if (isManager) {
    primary.push({
      kind: 'link',
      href: '/requests',
      label: t('requests'),
      icon: <ClipboardList className="size-4" />,
      badge: pendingCount,
    });
  }
  if (isAdmin) {
    primary.push({ kind: 'link', href: '/admin', label: t('admin'), icon: <Shield className="size-4" /> });
  }

  const community: NavEntry[] = [
    { kind: 'link', href: '/groups', label: t('groups'), icon: <Users className="size-4" /> },
    { kind: 'link', href: '/dugnad', label: t('dugnad'), icon: <Hammer className="size-4" /> },
  ];

  const utility: NavEntry[] = [];
  if (isInvitee) {
    utility.push({ kind: 'link', href: '/invite', label: t('invite'), icon: <Mail className="size-4" /> });
  }
  utility.push({ kind: 'calendar' });
  utility.push({ kind: 'link', href: '/settings', label: t('settings'), icon: <Settings className="size-4" /> });

  const navGroups: NavEntry[][] = [primary, community, utility];

  return (
    <>
      <button
        type="button"
        aria-label={t('menu')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-[var(--muted)]"
      >
        <Menu className="size-5" />
        {isManager && pendingCount > 0 && (
          <span
            aria-label={`${pendingCount}`}
            className="pointer-events-none absolute right-1 top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--color-taken)] px-1 text-[10px] font-semibold text-white"
          >
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <Drawer
            name={userName ?? t('account')}
            navGroups={navGroups}
            onClose={() => setOpen(false)}
            signOutAction={signOutAction}
          />,
          document.body,
        )}
    </>
  );
}

function Drawer({
  name,
  navGroups,
  onClose,
  signOutAction,
}: {
  name: string;
  navGroups: NavEntry[][];
  onClose: () => void;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations('Common');
  const tCal = useTranslations('CalendarExport');
  const [view, setView] = React.useState<'main' | 'calendar'>('main');

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onClose}
        className="flex-1 bg-black/40"
      />
      <div className="flex w-72 max-w-[85vw] flex-col bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          {view === 'calendar' ? (
            <button
              type="button"
              onClick={() => setView('main')}
              className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium hover:bg-[var(--muted)]"
            >
              <ChevronLeft className="size-4" />
              {tCal('title')}
            </button>
          ) : (
            <span className="truncate text-sm font-medium">{name}</span>
          )}
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-[var(--muted)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {view === 'main' ? (
          <>
            <nav className="flex-1 overflow-y-auto py-2">
              {navGroups.map((group, gi) => (
                <React.Fragment key={gi}>
                  {gi > 0 && <div className="mx-4 my-2 border-t border-[var(--border)]" />}
                  {group.map((entry) =>
                    entry.kind === 'calendar' ? (
                      <button
                        key="calendar"
                        type="button"
                        onClick={() => setView('calendar')}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-[var(--muted)]"
                      >
                        <Calendar className="size-4" />
                        <span>{tCal('open')}</span>
                      </button>
                    ) : (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        onClick={onClose}
                        className="relative flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--muted)]"
                      >
                        {entry.icon}
                        <span>{entry.label}</span>
                        {entry.badge !== undefined && entry.badge > 0 && (
                          <span className="ml-auto inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--color-taken)] px-1 text-[10px] font-semibold text-white">
                            {entry.badge > 99 ? '99+' : entry.badge}
                          </span>
                        )}
                      </Link>
                    ),
                  )}
                </React.Fragment>
              ))}
            </nav>

            <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <LangSwitcher />
                <ThemeToggle />
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md border border-red-700/40 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <LogOut className="size-4" />
                  {t('signOut')}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <CalendarExportPanel enabled={view === 'calendar'} />
          </div>
        )}
      </div>
    </div>
  );
}
