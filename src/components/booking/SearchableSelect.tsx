'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboOption {
  id: string;
  name: string;
}

interface Props {
  label?: string;
  options: ComboOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  inputClassName?: string;
  /**
   * Text to pre-fill the input with when the field is opened, so a free-form
   * value (e.g. a guest name) can be edited instead of retyped from scratch.
   * Omit to open with an empty filter (the default for list selections).
   */
  editText?: string;
  /**
   * When set, allow committing a value that is not in `options`. The callback
   * receives the raw query and returns either a normalized value (string) to
   * commit, or `null` to reject. Useful for free-form numeric inputs like a
   * year picker where the suggestion list is just the next few years but the
   * user may type any value.
   */
  allowCustom?: (query: string) => string | null;
}

/**
 * Lightweight searchable select. Renders a text input that doubles as a
 * filter; clicking or focusing reveals the matching options. Used for the
 * participant pickers in the booking flow so the user can either pick from
 * the list or just type a name.
 */
export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  inputClassName,
  allowCustom,
  editText,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // -1 means "nothing highlighted" — Enter commits what you typed (a guest, or
  // an exact-name member via allowCustom) rather than the first suggestion. You
  // pick a suggestion explicitly with ArrowDown/Tab to highlight it, then Enter.
  const [highlight, setHighlight] = React.useState(-1);
  // Associates the (optional) label with the trigger/input via aria-labelledby.
  // A wrapping <label> would be orphaned here — the control is a composite
  // button/input combobox, not a single labelable form element.
  const labelId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Always-fresh "what to do when leaving the field" — read by the document
  // mousedown listener, which is subscribed once and would otherwise capture a
  // stale query.
  const leaveRef = React.useRef<() => void>(() => {});

  const selected = options.find((o) => o.id === value);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) leaveRef.current();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlight]);

  // The text input only exists while open — focus it when it appears.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  // Leaving the field (click outside, Tab, blur) keeps whatever was typed: an
  // explicitly-highlighted suggestion if the user navigated to one, otherwise
  // exactly what was typed (a guest name, or an exact-name member resolved by
  // allowCustom). Only discard when there's nothing usable.
  const commitOnLeave = (): boolean => {
    if (highlight >= 0 && filtered[highlight]) {
      commit(filtered[highlight].id);
      return true;
    }
    if (allowCustom && query.trim()) {
      const next = allowCustom(query.trim());
      if (next !== null) {
        commit(next);
        return true;
      }
    }
    return false;
  };
  leaveRef.current = () => {
    if (!commitOnLeave()) {
      setOpen(false);
      setQuery('');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) {
        // An explicitly-highlighted suggestion wins.
        commit(filtered[highlight].id);
      } else if (allowCustom && query.trim()) {
        // Nothing highlighted — commit exactly what was typed.
        const next = allowCustom(query.trim());
        if (next !== null) commit(next);
      } else if (filtered[0]) {
        // Plain list select (no free-form) — fall back to the top match.
        commit(filtered[0].id);
      }
    } else if (e.key === 'Tab') {
      // Tab leaves the field — commit the highlighted suggestion if one was
      // navigated to, else the typed value (guest). Focus moves on naturally.
      commitOnLeave();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  // What the closed trigger shows (wraps if long). When open, the input shows
  // the live query instead.
  const closedDisplay = selected?.name ?? (allowCustom ? value : '');

  const onBlurCommit = () => {
    commitOnLeave();
  };

  const field = (
    <div ref={rootRef} className={cn('relative', open && 'z-50')}>
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder ?? selected?.name ?? ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlurCommit}
          aria-labelledby={label ? labelId : undefined}
          aria-autocomplete="list"
          aria-expanded
          className={cn(
            'w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 pr-7 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
            inputClassName,
          )}
        />
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-labelledby={label ? labelId : undefined}
          onClick={() => {
            setOpen(true);
            // Seed the filter with the current free-form text so it can be
            // edited in place (e.g. fixing a typo in a guest name).
            setQuery(editText ?? '');
            setHighlight(-1);
          }}
          className={cn(
            'flex w-full cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 pr-7 text-left text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
            inputClassName,
          )}
        >
          <span className="min-w-0 whitespace-normal break-words">
            {closedDisplay || (
              <span className="text-[var(--muted-foreground)]">{placeholder ?? ''}</span>
            )}
          </span>
        </button>
      )}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-3 size-3.5 text-[var(--muted-foreground)]"
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-[var(--muted-foreground)]">—</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o.id);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex cursor-pointer items-start justify-between gap-2 px-2 py-1.5 text-sm text-[var(--foreground)]',
                  highlight === i && 'bg-[var(--muted)]',
                )}
              >
                <span className="min-w-0 whitespace-normal break-words">{o.name}</span>
                {o.id === value && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );

  if (!label) return field;

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
      <span id={labelId}>{label}</span>
      {field}
    </div>
  );
}
