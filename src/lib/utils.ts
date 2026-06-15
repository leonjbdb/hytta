import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Inclusive-day count between two ISO dates (e.g. start = end yields 1, not 0).
 * Matches the reservation model where both endpoints are inclusive.
 */
export function daysInRange(startDate: string, endDate: string): number {
  const a = new Date(startDate + 'T00:00:00Z').getTime();
  const b = new Date(endDate + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
