'use client';

import * as React from 'react';
import { User, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

/**
 * A person rendered as a badge with a member/guest icon and a tooltip naming
 * the role. Shared by the dashboard and the groups screens so they stay
 * identical. `highlight` tints it (used to mark "you").
 *
 * Desktop reveals the tooltip on hover; touch devices have no hover, so the
 * badge is also tappable — a tap toggles the tooltip open, and tapping away
 * (blur) or Escape dismisses it.
 */
export function PersonBadge({
  name,
  isGuest,
  highlight,
  isAdmin = false,
  isManager = false,
  when,
}: {
  name: string;
  isGuest: boolean;
  highlight?: boolean;
  /** Member roles shown in the tooltip. Invitee is deliberately never shown. */
  isAdmin?: boolean;
  isManager?: boolean;
  /** Optional second tooltip line — e.g. a stay's date range ("when"). Shown in
   *  addition to the role, not instead of it. */
  when?: string;
}) {
  const t = useTranslations('Common');
  // Guests are always "Guest". Members show their elevated roles (Admin and/or
  // Manager), falling back to plain "Member" when they hold neither.
  const role = isGuest
    ? t('roleGuest')
    : [isAdmin ? t('roleAdmin') : null, isManager ? t('roleManager') : null]
        .filter(Boolean)
        .join(', ') || t('roleMember');
  const [open, setOpen] = React.useState(false);
  // When tapped open, force it visible; otherwise fall back to hover-reveal.
  const tooltipVis = open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
  return (
    <Badge
      role="button"
      tabIndex={0}
      aria-label={`${name} — ${role}${when ? `, ${when}` : ''}`}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((v) => !v);
        } else if (e.key === 'Escape') {
          setOpen(false);
        }
      }}
      className={
        'group relative cursor-pointer select-none ' +
        (highlight
          ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
          : 'text-[var(--muted-foreground)]')
      }
    >
      {isGuest ? (
        <UserRound aria-hidden className="size-3.5 shrink-0 opacity-70" />
      ) : (
        <User aria-hidden className="size-3.5 shrink-0" />
      )}
      {name}
      <span
        role="tooltip"
        className={
          'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-normal text-[var(--foreground)] shadow-md transition-opacity ' +
          tooltipVis
        }
      >
        <span className="block">{role}</span>
        {when && <span className="block text-[var(--muted-foreground)]">{when}</span>}
      </span>
    </Badge>
  );
}
