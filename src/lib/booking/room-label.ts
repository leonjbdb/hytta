/**
 * Pick the room display name appropriate for the current locale. Defaults to
 * Norwegian for `nb-NO` (and any unknown locale) and to English for `en-GB`.
 */
export function roomLabel(
  room: { nameNb: string | null; nameEn: string | null },
  locale: string,
): string {
  if (locale === 'en-GB') {
    return room.nameEn ?? room.nameNb ?? '';
  }
  return room.nameNb ?? room.nameEn ?? '';
}
