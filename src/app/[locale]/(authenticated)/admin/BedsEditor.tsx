'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ConfirmDialog';
import { addBed, removeBed } from '@/server/actions/admin';
import { BedRows, type BedItem } from './BedRows';
import type { AdminBed } from './shared';

/**
 * Beds editor for an existing room: each add/remove persists immediately.
 * Removing a bed confirms first (it may be in use by a reservation, which the
 * server rejects). New rooms use {@link BedRows} directly with local state.
 */
export function BedsEditor({
  roomId,
  beds,
  onError,
}: {
  roomId: string;
  beds: AdminBed[];
  onError: (msg: string | null) => void;
}) {
  const t = useTranslations('Admin');
  const confirm = useConfirm();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [adding, startAdd] = React.useTransition();

  const items: BedItem[] = beds.map((b) => ({ id: b.id, kind: b.kind }));

  const add = (kind: 'SINGLE' | 'DOUBLE') => {
    onError(null);
    startAdd(async () => {
      const r = await addBed(roomId, kind);
      if (!r.ok) onError(r.message);
    });
  };

  const remove = async (bedId: string) => {
    if (!(await confirm({ message: t('confirmRemoveBed'), destructive: true }))) return;
    onError(null);
    setPendingId(bedId);
    const r = await removeBed(bedId);
    setPendingId(null);
    if (!r.ok) onError(r.message);
  };

  return (
    <BedRows beds={items} onAdd={add} onRemove={remove} removingId={pendingId} disabled={adding} />
  );
}
