'use client';

import { useTranslations } from 'next-intl';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BedItem {
  id: string;
  kind: 'SINGLE' | 'DOUBLE';
}

/**
 * The beds-in-a-room editor: a list of beds (each removable) plus "add single"
 * / "add double" buttons. Presentational — the caller decides what add/remove
 * do. Used both for an existing room (persists to the server, confirms removal)
 * and a brand-new room (local list, no confirmation).
 */
export function BedRows({
  beds,
  onAdd,
  onRemove,
  removingId = null,
  disabled = false,
}: {
  beds: BedItem[];
  onAdd: (kind: 'SINGLE' | 'DOUBLE') => void;
  onRemove: (id: string) => void;
  removingId?: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('Admin');
  const sorted = [...beds].sort((a, b) => a.id.localeCompare(b.id));
  const singles = sorted.filter((b) => b.kind === 'SINGLE');
  const doubles = sorted.filter((b) => b.kind === 'DOUBLE');
  const indexFor = (bed: BedItem) => {
    const list = bed.kind === 'SINGLE' ? singles : doubles;
    return list.findIndex((b) => b.id === bed.id) + 1;
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {t('bedsForRoom')}
      </span>

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">{t('noBeds')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((bed) => {
            const idx = indexFor(bed);
            const total = (bed.kind === 'SINGLE' ? singles : doubles).length;
            const labelBase = bed.kind === 'DOUBLE' ? t('bedDoubleShort') : t('bedSingleShort');
            return (
              <li
                key={bed.id}
                className="flex items-center gap-2 rounded-md bg-[var(--card)] px-2 py-1.5 text-sm"
              >
                <span>
                  {labelBase}
                  {total > 1 ? ` ${idx}` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={disabled || removingId === bed.id}
                  onClick={() => onRemove(bed.id)}
                >
                  {removingId === bed.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onAdd('SINGLE')}
        >
          <Plus className="size-3.5" /> {t('addSingle')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onAdd('DOUBLE')}
        >
          <Plus className="size-3.5" /> {t('addDouble')}
        </Button>
      </div>
    </div>
  );
}
