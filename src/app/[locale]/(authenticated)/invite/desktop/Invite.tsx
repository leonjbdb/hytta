'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Copy, Check, Trash2, Mail, Link as LinkIcon } from 'lucide-react';

const EXPIRES_FORMAT = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
} as const;
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ConfirmDialog';
import { createInvite, revokeInvite } from '@/server/actions/invitations';
import type { InviteListItem, InviteProps } from '../shared';

const DURATION_OPTIONS = [24, 48, 72, 96, 120, 144, 168];

/** Status-pill tint by invite state: live links are accented, revoked ones are
 *  red, and spent/expired ones fade to muted. */
const STATUS_BADGE: Record<'active' | 'revoked' | 'inactive', string> = {
  active:
    'border-transparent bg-[color-mix(in_oklch,var(--primary),transparent_85%)] text-[var(--primary)]',
  revoked:
    'border-transparent bg-[color-mix(in_oklch,var(--color-taken),transparent_85%)] text-[var(--color-taken)]',
  inactive: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
};

/** Shared muted-badge style for an invite's destination — its link or email.
 *  `text-sm` overrides the Badge's default `text-xs` so the URL stays legible. */
const IDENTITY_BADGE = 'gap-1.5 bg-[var(--muted)] text-sm font-normal text-[var(--muted-foreground)]';

export function Invite({ origin, invites, demo }: InviteProps) {
  const t = useTranslations('Invite');
  const [list, setList] = React.useState<InviteListItem[]>(invites);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
      </header>

      <CreateForm
        origin={origin}
        demo={demo}
        onCreated={(i) => setList((cur) => [i, ...cur])}
      />
      <ListSection invites={list} origin={origin} setList={setList} />
    </div>
  );
}

function CreateForm({
  origin,
  demo,
  onCreated,
}: {
  origin: string;
  demo: boolean;
  onCreated: (i: InviteListItem) => void;
}) {
  const t = useTranslations('Invite');
  const [mode, setMode] = React.useState<'link' | 'email'>('link');
  const [maxUses, setMaxUses] = React.useState<'1' | 'multi'>('1');
  const [duration, setDuration] = React.useState<number>(24);
  const [email, setEmail] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [lastUrl, setLastUrl] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  // Associate each group caption with its radiogroup via aria-labelledby — a
  // <label> over a set of custom radio buttons is orphaned (no single control).
  const modeLabelId = React.useId();
  const usesLabelId = React.useId();

  const fmt = useFormatter();

  const submit = () => {
    setLastUrl(null);
    setSentTo(null);
    setCopied(false);
    const trimmedEmail = email.trim();
    if (mode === 'email' && !trimmedEmail) {
      toast.error(t('errorEmailRequired'));
      return;
    }
    startTransition(async () => {
      const r = await createInvite({
        maxUses: mode === 'email' ? 1 : maxUses === '1' ? 1 : null,
        durationHours: duration,
        email: mode === 'email' ? trimmedEmail : null,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      const url = `${origin}/invite/${r.invitation.token}`;
      if (r.emailed && r.invitation.email) {
        setSentTo(r.invitation.email);
        setEmail('');
      } else {
        setLastUrl(url);
      }
      const expiresAt = new Date(r.invitation.expiresAt);
      onCreated({
        id: r.invitation.id,
        token: r.invitation.token,
        maxUses: r.invitation.maxUses,
        useCount: r.invitation.useCount,
        email: r.invitation.email,
        expiresAt: expiresAt.getTime(),
        // Newly-created rows are inserted post-hydration, so client-side
        // formatting is safe here (no SSR pair to mismatch against).
        expiresAtLabel: fmt.dateTime(expiresAt, EXPIRES_FORMAT),
        revokedAt: r.invitation.revokedAt
          ? new Date(r.invitation.revokedAt).getTime()
          : null,
        createdAt: r.invitation.createdAt,
      });
    });
  };

  const copy = async () => {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(lastUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can long-press the URL */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">{t('createHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id={modeLabelId} className="text-sm font-medium leading-none text-[var(--foreground)]">
            {t('modeHeading')}
          </span>
          <div role="radiogroup" aria-labelledby={modeLabelId} className="inline-flex w-fit overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'link'}
              onClick={() => setMode('link')}
              className={`inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'link'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <LinkIcon className="size-3.5" />
              {t('modeLink')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'email'}
              disabled={demo}
              onClick={() => setMode('email')}
              className={`inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'email'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : demo
                    ? 'text-[var(--muted-foreground)] opacity-50'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Mail className="size-3.5" />
              {t('modeEmail')}
            </button>
          </div>
        </div>

        {mode === 'email' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">{t('emailLabel')}</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-[var(--muted-foreground)]">{t('emailHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span id={usesLabelId} className="text-sm font-medium leading-none text-[var(--foreground)]">
              {t('usesHeading')}
            </span>
            <div role="radiogroup" aria-labelledby={usesLabelId} className="inline-flex w-fit overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
              <button
                type="button"
                role="radio"
                aria-checked={maxUses === '1'}
                onClick={() => setMaxUses('1')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                  maxUses === '1'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {t('singleUse')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={maxUses === 'multi'}
                onClick={() => setMaxUses('multi')}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                  maxUses === 'multi'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {t('multiUse')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="duration">{t('durationLabel')}</Label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
          >
            {DURATION_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {t('durationHours', { hours: h })}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={submit} disabled={pending} className="self-start">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode === 'email' ? t('sendCta') : t('createCta')}
        </Button>

        {sentTo && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-sm">
            <Mail className="mt-0.5 size-4 text-[var(--muted-foreground)]" />
            <p>{t('sentTo', { email: sentTo })}</p>
          </div>
        )}

        {lastUrl && (
          <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <Label htmlFor="new-invite-url" className="text-xs">{t('newInviteUrl')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-invite-url"
                value={lastUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t('copied') : t('copyLink')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListSection({
  invites,
  origin,
  setList,
}: {
  invites: InviteListItem[];
  origin: string;
  setList: React.Dispatch<React.SetStateAction<InviteListItem[]>>;
}) {
  const t = useTranslations('Invite');
  const confirm = useConfirm();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const status = (i: InviteListItem) => {
    if (i.revokedAt) return t('statusRevoked');
    if (i.expiresAt <= Date.now()) return t('statusExpired');
    if (i.maxUses != null && i.useCount >= i.maxUses) return t('statusUsed');
    return t('statusActive');
  };

  const statusKind = (i: InviteListItem): keyof typeof STATUS_BADGE => {
    if (i.revokedAt) return 'revoked';
    if (i.expiresAt <= Date.now()) return 'inactive';
    if (i.maxUses != null && i.useCount >= i.maxUses) return 'inactive';
    return 'active';
  };

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — the URL is still selectable */
    }
  };

  const usesLabel = (i: InviteListItem) =>
    i.maxUses == null
      ? t('usesUnlimited', { count: i.useCount })
      : t('usesCapped', { count: i.useCount, total: i.maxUses });

  const revoke = async (id: string) => {
    if (!(await confirm({ message: t('confirmRevoke'), confirmLabel: t('revoke'), destructive: true }))) return;
    setPendingId(id);
    (async () => {
      const r = await revokeInvite(id);
      setPendingId(null);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setList((cur) =>
        cur.map((i) => (i.id === id ? { ...i, revokedAt: Date.now() } : i)),
      );
    })();
  };

  if (invites.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          {t('myInvites')}
        </h2>
        <Card>
          <CardContent className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            {t('emptyMyInvites')}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
        {t('myInvites')}
      </h2>
      <div className="flex flex-col gap-2">
        {invites.map((i) => {
          const url = `${origin}/invite/${i.token}`;
          const isActive = !i.revokedAt && i.expiresAt > Date.now() && (i.maxUses == null || i.useCount < i.maxUses);
          return (
            <Card key={i.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge className={STATUS_BADGE[statusKind(i)]}>{status(i)}</Badge>
                <span className="text-xs text-[var(--muted-foreground)]">{usesLabel(i)}</span>
                <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                  {t('expiresAt', { when: i.expiresAtLabel })}
                </span>
              </div>
              {(i.email || isActive) && (
                <div className="flex items-center gap-2">
                  {i.email ? (
                    <Badge className={`w-fit max-w-full ${IDENTITY_BADGE}`}>
                      <Mail className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{i.email}</span>
                    </Badge>
                  ) : (
                    <Badge className={`min-w-0 flex-1 font-mono ${IDENTITY_BADGE}`}>
                      <LinkIcon className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{url}</span>
                    </Badge>
                  )}
                  {isActive && !i.email && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copyUrl(i.id, url)}
                    >
                      {copiedId === i.id ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedId === i.id ? t('copied') : t('copyLink')}
                    </Button>
                  )}
                  {isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto shrink-0"
                      disabled={pendingId === i.id}
                      onClick={() => revoke(i.id)}
                    >
                      {pendingId === i.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {t('revoke')}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
