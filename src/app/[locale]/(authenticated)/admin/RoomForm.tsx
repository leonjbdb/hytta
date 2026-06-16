'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROOM_COLOR_PALETTE, ROOM_ICONS, RoomIcon } from '@/components/booking/RoomIcon';
import { createRoom } from '@/server/actions/admin';
import { BedRows, type BedItem } from './BedRows';

/** Summary of a freshly created room, handed to `onCreated`. */
export interface CreatedRoom {
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
}

/** Shared room form fields: names, icon, colour, capacity mode, slot count. */
export function RoomFormFields({
  nameNb,
  nameEn,
  icon,
  color,
  mode,
  unlimited,
  slotCount,
  onNameNb,
  onNameEn,
  onIcon,
  onColor,
  onMode,
  onUnlimited,
  onSlotCount,
}: {
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  mode: 'BEDS' | 'SLOTS';
  unlimited: boolean;
  slotCount: number;
  onNameNb: (v: string) => void;
  onNameEn: (v: string) => void;
  onIcon: (v: string) => void;
  onColor: (v: string) => void;
  onMode: (v: 'BEDS' | 'SLOTS') => void;
  onUnlimited: (v: boolean) => void;
  onSlotCount: (v: number) => void;
}) {
  const t = useTranslations('Admin');
  // Unique per instance so labels associate correctly even when several copies
  // of this form render at once (e.g. an inline edit plus the "add room" form).
  const fieldId = React.useId();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-name-nb`}>{t('roomNameNb')}</Label>
          <Input
            id={`${fieldId}-name-nb`}
            value={nameNb}
            onChange={(e) => onNameNb(e.target.value)}
            placeholder={t('roomNameNbPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-name-en`}>{t('roomNameEn')}</Label>
          <Input
            id={`${fieldId}-name-en`}
            value={nameEn}
            onChange={(e) => onNameEn(e.target.value)}
            placeholder={t('roomNameEnPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span
            id={`${fieldId}-icon-label`}
            className="text-sm font-medium leading-none text-[var(--foreground)]"
          >
            {t('roomIcon')}
          </span>
          <div
            role="group"
            aria-labelledby={`${fieldId}-icon-label`}
            className="flex flex-wrap gap-1"
          >
            {ROOM_ICONS.map((opt) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => onIcon(opt.name)}
                aria-pressed={icon === opt.name}
                title={opt.label}
                className={`inline-flex size-8 items-center justify-center rounded-md border ${
                  icon === opt.name
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                }`}
              >
                <RoomIcon name={opt.name} size={16} color={color} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span
            id={`${fieldId}-color-label`}
            className="text-sm font-medium leading-none text-[var(--foreground)]"
          >
            {t('roomColor')}
          </span>
          <div
            role="group"
            aria-labelledby={`${fieldId}-color-label`}
            className="flex flex-wrap gap-1.5"
          >
            {ROOM_COLOR_PALETTE.map((opt) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => onColor(opt.value)}
                aria-pressed={color === opt.value}
                title={opt.label}
                className={`inline-flex size-7 items-center justify-center rounded-full border ${
                  color === opt.value
                    ? 'border-[var(--foreground)] ring-2 ring-[var(--foreground)]/20'
                    : 'border-[var(--border)]'
                }`}
                style={{ backgroundColor: opt.value }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          {t('capacityMode')}
        </span>
        <div role="radiogroup" className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
          {(['BEDS', 'SLOTS'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              className={`px-3 py-1.5 text-xs font-medium ${
                mode === m
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {m === 'BEDS' ? t('modeBeds') : t('modeSlots')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'SLOTS' && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => onUnlimited(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {t('unlimited')}
          </label>
          {!unlimited && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`${fieldId}-slot-count`} className="text-xs">
                {t('slotCount')}
              </Label>
              <Input
                id={`${fieldId}-slot-count`}
                type="number"
                min={1}
                max={50}
                value={slotCount}
                onChange={(e) => onSlotCount(Math.max(1, Number(e.target.value)))}
                className="h-8 w-20 text-center"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The "add a room" tile. Used both on the Admin page and in first-run room
 * setup. On success it resets and calls `onCreated` with the new room's summary
 * (the setup flow uses this to track progress; the Admin page relies on
 * `revalidatePath` instead and can ignore it).
 */
export function NewRoomForm({
  onCreated,
}: {
  onCreated?: (room: CreatedRoom) => void;
}) {
  const t = useTranslations('Admin');
  const [pending, startTransition] = React.useTransition();
  const [nameNb, setNameNb] = React.useState('');
  const [nameEn, setNameEn] = React.useState('');
  const [icon, setIcon] = React.useState<string>(ROOM_ICONS[0]!.name);
  const [color, setColor] = React.useState<string>(ROOM_COLOR_PALETTE[0]!.value);
  const [mode, setMode] = React.useState<'BEDS' | 'SLOTS'>('BEDS');
  const [unlimited, setUnlimited] = React.useState(false);
  const [slotCount, setSlotCount] = React.useState<number>(2);
  const [newBeds, setNewBeds] = React.useState<BedItem[]>([]);

  const reset = () => {
    setNameNb('');
    setNameEn('');
    setIcon(ROOM_ICONS[0]!.name);
    setColor(ROOM_COLOR_PALETTE[0]!.value);
    setMode('BEDS');
    setUnlimited(false);
    setSlotCount(2);
    setNewBeds([]);
  };

  // A bed-mode room needs at least one bed; a slot-mode room always has
  // capacity (a positive number, or unlimited). Mirrors the server guard so the
  // operator can't submit an empty room.
  const needsBed = mode === 'BEDS' && newBeds.length === 0;

  const submit = () => {
    startTransition(async () => {
      const r = await createRoom({
        nameNb,
        nameEn,
        icon,
        color,
        capacityMode: mode,
        slotCount: mode === 'SLOTS' ? (unlimited ? null : slotCount) : null,
        beds: mode === 'BEDS' ? newBeds.map((b) => ({ kind: b.kind })) : undefined,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      onCreated?.({ nameNb, nameEn, icon, color });
      reset();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('newRoom')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RoomFormFields
          nameNb={nameNb}
          nameEn={nameEn}
          icon={icon}
          color={color}
          mode={mode}
          unlimited={unlimited}
          slotCount={slotCount}
          onNameNb={setNameNb}
          onNameEn={setNameEn}
          onIcon={setIcon}
          onColor={setColor}
          onMode={setMode}
          onUnlimited={setUnlimited}
          onSlotCount={setSlotCount}
        />

        {mode === 'BEDS' && (
          <BedRows
            beds={newBeds}
            onAdd={(kind) => setNewBeds((bs) => [...bs, { id: crypto.randomUUID(), kind }])}
            onRemove={(id) => setNewBeds((bs) => bs.filter((b) => b.id !== id))}
          />
        )}

        {needsBed && (
          <p className="text-xs text-[var(--muted-foreground)]">{t('roomNeedsBed')}</p>
        )}

        <Button
          onClick={submit}
          disabled={pending || !nameNb.trim() || !nameEn.trim() || needsBed}
          className="self-start"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t('createRoom')}
        </Button>
      </CardContent>
    </Card>
  );
}
