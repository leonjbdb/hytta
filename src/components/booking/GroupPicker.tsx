'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';

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
 * `onApply(id)` which the parent translates into a draft selection (via
 * {@link fetchGroupContribution}). Picking the empty option fires
 * `onClear` so the parent can subtract that group's members from the draft
 * while leaving manual additions intact.
 */
export function GroupPicker({ groups, value, onApply, onClear }: Props) {
  const t = useTranslations('Book');
  if (groups.length === 0) return null;
  return (
    <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
      <Users className="size-4 text-[var(--muted-foreground)]" aria-hidden />
      <span className="text-[var(--muted-foreground)]">{t('groupLabel')}</span>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) onClear();
          else onApply(next);
        }}
        className="flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <option value="">{t('groupNone')}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
