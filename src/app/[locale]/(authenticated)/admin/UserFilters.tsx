'use client';

import { Funnel, FunnelPlus, FunnelX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminUser } from './shared';

/**
 * Tri-state role filter for the admin user list. Each role button cycles
 * off → include → exclude → off:
 *  - off: no constraint (normal colour)
 *  - include: keep only users who hold the role (green)
 *  - exclude: drop users who hold the role (wine red)
 * Several filters combine with AND, so "include Admin + exclude Manager" lists
 * admins who aren't managers.
 */
export type FilterState = 'off' | 'include' | 'exclude';
export type RoleKey = 'admin' | 'manager' | 'inviter';
export type RoleFilters = Record<RoleKey, FilterState>;

export const EMPTY_ROLE_FILTERS: RoleFilters = {
  admin: 'off',
  manager: 'off',
  inviter: 'off',
};

/** off → include → exclude → off. */
export function cycleFilterState(state: FilterState): FilterState {
  return state === 'off' ? 'include' : state === 'include' ? 'exclude' : 'off';
}

const ROLE_HOLDS: Record<RoleKey, (u: AdminUser) => boolean> = {
  admin: (u) => u.isAdmin,
  manager: (u) => u.isManager,
  inviter: (u) => u.isInvitee,
};

/** True when the user satisfies every active (non-off) role filter. */
export function userMatchesRoleFilters(u: AdminUser, filters: RoleFilters): boolean {
  return (Object.keys(filters) as RoleKey[]).every((role) => {
    const state = filters[role];
    if (state === 'off') return true;
    return ROLE_HOLDS[role](u) === (state === 'include');
  });
}

const ICON: Record<FilterState, typeof Funnel> = {
  off: Funnel,
  include: FunnelPlus,
  exclude: FunnelX,
};

// Mirrors RoleToggle's inactive look for `off`; include/exclude tint border,
// text and a faint background fill with the brand green / wine red.
const STYLE: Record<FilterState, string> = {
  off: 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
  include:
    'border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary),transparent_88%)] text-[var(--primary)]',
  exclude:
    'border-[var(--wine)] bg-[color-mix(in_oklch,var(--wine),transparent_88%)] text-[var(--wine)]',
};

function RoleFilterButton({
  label,
  state,
  hint,
  onClick,
}: {
  label: string;
  state: FilterState;
  hint: string;
  onClick: () => void;
}) {
  const Icon = ICON[state];
  return (
    <button
      type="button"
      aria-label={hint}
      title={hint}
      onClick={onClick}
      className={
        'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ' +
        STYLE[state]
      }
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

/** The three role-filter buttons shown above the user list. */
export function RoleFilterBar({
  filters,
  onCycle,
}: {
  filters: RoleFilters;
  onCycle: (role: RoleKey) => void;
}) {
  const t = useTranslations('Admin');
  const roles: { key: RoleKey; label: string }[] = [
    { key: 'admin', label: t('roleAdmin') },
    { key: 'manager', label: t('roleManager') },
    { key: 'inviter', label: t('roleInviter') },
  ];
  const hintKey = {
    off: 'filterStateOff',
    include: 'filterStateInclude',
    exclude: 'filterStateExclude',
  } as const;
  return (
    <div className="grid grid-cols-3 gap-2">
      {roles.map(({ key, label }) => (
        <RoleFilterButton
          key={key}
          label={label}
          state={filters[key]}
          hint={t(hintKey[filters[key]], { role: label })}
          onClick={() => onCycle(key)}
        />
      ))}
    </div>
  );
}
