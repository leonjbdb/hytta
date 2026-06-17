'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Users } from 'lucide-react';

export interface GroupOption {
  id: string;
  name: string;
}

interface Props {
  groups: GroupOption[];
  value: string | null;
  onApply: (groupId: string) => void;
  onClear: () => void;
}

/**
 * Compact group selector shown above the room picker. Picking a group fires
 * `onApply(id)`, which the parent turns into a draft selection (via
 * `applyGroupToSelection`). Picking the empty option fires `onClear` so the
 * parent can restore the layout from before the group was applied. The select
 * fills the row and carries a chevron at its right edge so it matches the
 * participant pickers' look.
 */
export function GroupPicker({ groups, value, onApply, onClear }: Props) {
  const t = useTranslations('Book');
  const selectId = React.useId();
  if (groups.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
      <Users className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      <label htmlFor={selectId} className="shrink-0 text-[var(--muted-foreground)]">
        {t('groupLabel')}
      </label>
      <div className="relative flex-1">
        <select
          id={selectId}
          value={value ?? ''}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) onClear();
            else onApply(next);
          }}
          className="w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 pr-7 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <option value="">{t('groupNone')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
      </div>
    </div>
  );
}
