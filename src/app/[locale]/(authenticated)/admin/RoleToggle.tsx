'use client';

import { Check, Loader2 } from 'lucide-react';

/**
 * A role as a checkable toggle button: the label names the role, the checkbox
 * shows whether it's active, and clicking flips it. Replaces the old
 * make/remove text buttons so a row of roles reads as aligned columns.
 */
export function RoleToggle({
  label,
  active,
  disabled,
  pending,
  onToggle,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  pending?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onToggle}
      className={
        'inline-flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ' +
        (active
          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]') +
        (disabled ? ' cursor-not-allowed opacity-50' : ' cursor-pointer')
      }
    >
      <span
        className={
          'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-current ' +
          (active ? '' : 'opacity-70')
        }
      >
        {pending ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : (
          active && <Check className="size-2.5" />
        )}
      </span>
      {label}
    </button>
  );
}
