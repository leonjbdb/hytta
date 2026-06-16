'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoomIcon } from '@/components/booking/RoomIcon';
import { PublicPreferences } from '@/components/PublicPreferences';
import { NewRoomForm, type CreatedRoom } from '../../(authenticated)/admin/RoomForm';

/**
 * First-run room setup for admins: the same "add a room" tile used on the Admin
 * page, repeated as many times as the operator likes, with a running list of
 * what's been added and a Finish button once there's at least one room.
 */
export function RoomsSetup({ initialHasRooms }: { initialHasRooms: boolean }) {
  const t = useTranslations('RoomSetup');
  const locale = useLocale();
  const router = useRouter();
  const [created, setCreated] = React.useState<CreatedRoom[]>([]);
  const canFinish = initialHasRooms || created.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <PublicPreferences />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t('subtitle')}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{t('editLater')}</p>
      </header>

      {created.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('roomsAdded', { count: created.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {created.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <RoomIcon name={r.icon} size={18} color={r.color} />
                <span>{locale === 'en-GB' ? r.nameEn || r.nameNb : r.nameNb || r.nameEn}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <NewRoomForm onCreated={(r) => setCreated((c) => [...c, r])} />

      <Button
        disabled={!canFinish}
        onClick={() => {
          router.replace('/');
          router.refresh();
        }}
        className="self-end"
      >
        {t('finish')}
      </Button>
    </div>
  );
}
