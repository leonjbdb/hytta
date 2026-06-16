'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * An accordion section: a tappable heading that expands/collapses its body.
 * Heading matches the app's uppercase section-label style; an optional `right`
 * slot shows a count or summary. Used to tidy long admin lists.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="flex flex-col gap-4">
      {/* Heading wraps the toggle (WAI-ARIA accordion pattern) so the section
          gets a real h2 and we don't skip a level under the page's h1. */}
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span>{title}</span>
          {right != null && (
            <span className="ml-auto text-xs font-normal normal-case tracking-normal text-[var(--muted-foreground)]">
              {right}
            </span>
          )}
        </button>
      </h2>
      {open && <div className="flex flex-col gap-4">{children}</div>}
    </section>
  );
}
