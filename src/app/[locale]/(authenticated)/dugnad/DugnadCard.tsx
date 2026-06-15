'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PersonBadge } from '@/components/PersonBadge';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  completeDugnadAction,
  deleteDugnadAction,
  uncompleteDugnadAction,
  updateDugnadAction,
} from '@/server/actions/dugnad';
import { personLabel, type DugnadRow } from './shared';

interface Props {
  row: DugnadRow;
  viewerId: string;
  isAdmin: boolean;
  /** When `false` the card stacks all action buttons full-width vertically. */
  inlineActions?: boolean;
}

export function DugnadCard({ row, viewerId, isAdmin, inlineActions = true }: Props) {
  const t = useTranslations('Dugnad');
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const isOwner = row.createdBy === viewerId;
  const isCompleted = row.completedAt !== null;
  const isCompleter = row.completedBy === viewerId;
  const canEdit = !isCompleted && (isOwner || isAdmin);
  const canDelete = isOwner || isAdmin;
  const canUndo = isCompleted && (isCompleter || isAdmin);

  const formatDate = (epochSeconds: number) =>
    new Date(epochSeconds * 1000).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const onComplete = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await completeDugnadAction(row.id);
      if (!res.ok) setError(res.message || t('errorGeneric'));
      else router.refresh();
    });
  };

  const onUndo = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await uncompleteDugnadAction(row.id);
      if (!res.ok) setError(res.message || t('errorGeneric'));
      else router.refresh();
    });
  };

  const onDelete = async () => {
    if (pending) return;
    if (
      !(await confirm({
        message: t('confirmDelete', { title: row.title }),
        confirmLabel: t('deleteButton'),
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      const res = await deleteDugnadAction(row.id);
      if (!res.ok) setError(res.message || t('errorGeneric'));
      else router.refresh();
    });
  };

  const buttonsClass = inlineActions
    ? 'flex flex-wrap gap-2'
    : 'flex flex-col gap-2';

  if (editing) {
    return (
      <EditForm
        row={row}
        onCancel={() => {
          setEditing(false);
          setError(null);
        }}
        onSaved={() => {
          setEditing(false);
          setError(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold leading-tight">{row.title}</h3>
        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
          {t.rich('createdBy', {
            date: formatDate(row.createdAt),
            person: () => (
              <PersonBadge
                name={personLabel(row.createdByName, row.createdByEmail)}
                isGuest={false}
                highlight={isOwner}
                isAdmin={!!row.createdByIsAdmin}
                isManager={!!row.createdByIsManager}
              />
            ),
          })}
        </p>
        {isCompleted && row.completedAt !== null && (
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {t.rich('completedBy', {
              date: formatDate(row.completedAt),
              person: () => (
                <PersonBadge
                  name={personLabel(row.completedByName, row.completedByEmail)}
                  isGuest={false}
                  highlight={isCompleter}
                  isAdmin={!!row.completedByIsAdmin}
                  isManager={!!row.completedByIsManager}
                />
              ),
            })}
          </p>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>
      {error && (
        <p className="text-xs text-[var(--destructive)]" role="alert">
          {error}
        </p>
      )}
      <div className={buttonsClass}>
        {!isCompleted && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onComplete}
            disabled={pending}
            className={inlineActions ? '' : 'w-full'}
          >
            <CheckCircle2 className="size-4" />
            {pending ? t('completing') : t('completeButton')}
          </Button>
        )}
        {canUndo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={pending}
            className={inlineActions ? '' : 'w-full'}
          >
            <RotateCcw className="size-4" />
            {pending ? t('undoing') : t('undoButton')}
          </Button>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={pending}
            className={inlineActions ? '' : 'w-full'}
          >
            <Pencil className="size-4" />
            {t('editButton')}
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={pending}
            className={
              inlineActions
                ? 'text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive),transparent_85%)]'
                : 'w-full text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive),transparent_85%)]'
            }
          >
            <Trash2 className="size-4" />
            {t('deleteButton')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function EditForm({
  row,
  onCancel,
  onSaved,
}: {
  row: DugnadRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Dugnad');
  const [title, setTitle] = React.useState(row.title);
  const [description, setDescription] = React.useState(row.description);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const res = await updateDugnadAction(row.id, { title, description });
      if (!res.ok) setError(res.message || t('errorGeneric'));
      else onSaved();
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          maxLength={5000}
          required
          className="resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        {error && (
          <p className="text-xs text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {t('cancelEdit')}
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {t('saveEdit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
