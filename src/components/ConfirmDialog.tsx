'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  /** Heading; defaults to a generic "Are you sure?". */
  title?: string;
  /** Body text — usually the question being asked. */
  message: string;
  /** Confirm button label; defaults to Common.confirm. */
  confirmLabel?: string;
  /** Cancel button label; defaults to Common.cancel. */
  cancelLabel?: string;
  /** Style the confirm button as destructive (red) — for deletes/removals. */
  destructive?: boolean;
  /** Per-call countdown override (seconds). Wins over the provider default —
   *  e.g. force a wait on a high-stakes action even for admins. */
  delaySeconds?: number;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = React.createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

/**
 * Returns an async `confirm(opts)` that resolves `true`/`false`. Drop-in
 * replacement for the native `window.confirm`, but rendered as an in-app modal
 * (so it's styled, themable, and identical on desktop + mobile). Must be used
 * under a `<ConfirmProvider>`.
 */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}

/**
 * Hosts a single confirm modal for the subtree. Calls to `useConfirm()` open
 * it and await the user's choice; only one dialog is shown at a time.
 *
 * `delaySeconds` gates the confirm button behind a countdown — a deliberate
 * speed-bump before any confirmation. It's set per-role by the layout (admins
 * get 0; users and managers must wait).
 */
export function ConfirmProvider({
  children,
  delaySeconds = 0,
}: {
  children: React.ReactNode;
  delaySeconds?: number;
}) {
  const [state, setState] = React.useState<{
    opts: ConfirmOptions;
    resolve: Resolver;
  } | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );

  const resolve = React.useCallback((ok: boolean) => {
    setState((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmModal
          opts={state.opts}
          delaySeconds={state.opts.delaySeconds ?? delaySeconds}
          onResolve={resolve}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmModal({
  opts,
  delaySeconds,
  onResolve,
}: {
  opts: ConfirmOptions;
  delaySeconds: number;
  onResolve: (ok: boolean) => void;
}) {
  const t = useTranslations('Common');
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  // Per-call delay (e.g. a forced speed-bump) overrides the provider default.
  const effectiveDelay = opts.delaySeconds ?? delaySeconds;
  // Seconds the user must still wait before confirming (0 = ready now).
  const [remaining, setRemaining] = React.useState(effectiveDelay);
  const waiting = remaining > 0;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false);
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while the dialog is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onResolve]);

  // Tick the countdown down to zero, one second at a time.
  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  // Land focus on the confirm action once it becomes enabled (keyboard users).
  React.useEffect(() => {
    if (!waiting) confirmRef.current?.focus();
  }, [waiting]);

  const title = opts.title ?? t('confirmTitle');
  const confirmText = opts.confirmLabel ?? t('confirm');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={opts.cancelLabel ?? t('cancel')}
        onClick={() => onResolve(false)}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex w-full max-w-sm flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{opts.message}</p>
        </div>
        {/* Cancel pinned far left, confirm far right — maximally separated so a
            destructive confirm is never next to where "cancel" was expected. */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => onResolve(false)}>
            {opts.cancelLabel ?? t('cancel')}
          </Button>
          <Button
            ref={confirmRef}
            variant={opts.destructive ? 'destructive' : 'primary'}
            disabled={waiting}
            onClick={() => onResolve(true)}
          >
            {waiting ? `${confirmText} (${remaining})` : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
