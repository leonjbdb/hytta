import { sendMail } from './transport';
import {
  bookingRequestEmail,
  bookingStatusEmail,
  emailChangeEmail,
  emailChangedNoticeEmail,
  inviteEmail,
  magicLinkEmail,
  resetPasswordEmail,
  roleChangedEmail,
  type BookingStatus,
  type Role,
} from './templates';
import type { Locale } from './shell';
import { cottageNameOrApp } from '@/lib/cottage';
import { requestOrigin } from '@/lib/origin';

/**
 * High-level mailer facade. Auth/booking/admin code only ever imports
 * `mailer` — they never touch the transport, never construct subject/body
 * strings, never pick a template. New email types add (1) a renderer in
 * `templates/<domain>.ts`, (2) one method here. Everything else stays put.
 *
 * Every message is branded with the cottage name (subject, body, and the From
 * display name), resolved once here so templates and transport stay unaware of
 * where the name comes from.
 */
export const mailer = {
  async sendMagicLink(to: string, url: string, locale: Locale, expiresAt: Date) {
    const cottage = await cottageNameOrApp();
    return sendMail({
      to,
      fromName: cottage,
      ...magicLinkEmail(url, locale, expiresAt, cottage),
    });
  },
  async sendInvite(
    to: string,
    url: string,
    fromName: string,
    locale: Locale,
    expiresAt: Date,
  ) {
    const cottage = await cottageNameOrApp();
    return sendMail({
      to,
      fromName: cottage,
      ...inviteEmail(url, fromName, locale, expiresAt, cottage),
    });
  },
  async sendResetPassword(to: string, url: string, locale: Locale, expiresAt: Date) {
    const cottage = await cottageNameOrApp();
    return sendMail({
      to,
      fromName: cottage,
      ...resetPasswordEmail(url, locale, expiresAt, cottage),
    });
  },
  /** Confirmation link to the NEW address the member wants to switch to. */
  async sendEmailChange(to: string, url: string, locale: Locale, expiresAt: Date) {
    const cottage = await cottageNameOrApp();
    return sendMail({
      to,
      fromName: cottage,
      ...emailChangeEmail(url, locale, expiresAt, cottage),
    });
  },
  /** Heads-up to the OLD address once an email change is confirmed. */
  async sendEmailChangedNotice(to: string, newEmail: string, locale: Locale) {
    const cottage = await cottageNameOrApp();
    const origin = await requestOrigin();
    return sendMail({
      to,
      fromName: cottage,
      ...emailChangedNoticeEmail(newEmail, `${origin}/settings`, locale, cottage),
    });
  },
  /** Booking approved / rejected / cancelled — to the booker. */
  async sendBookingStatus(
    to: string,
    kind: BookingStatus,
    startIso: string,
    endIso: string,
    locale: Locale,
  ) {
    const cottage = await cottageNameOrApp();
    const origin = await requestOrigin();
    return sendMail({
      to,
      fromName: cottage,
      ...bookingStatusEmail(
        kind,
        startIso,
        endIso,
        `${origin}/dashboard`,
        `${origin}/settings`,
        locale,
        cottage,
      ),
    });
  },
  /** A new booking is awaiting approval — to a manager. */
  async sendBookingRequest(
    to: string,
    bookerName: string,
    startIso: string,
    endIso: string,
    locale: Locale,
  ) {
    const cottage = await cottageNameOrApp();
    const origin = await requestOrigin();
    return sendMail({
      to,
      fromName: cottage,
      ...bookingRequestEmail(
        bookerName,
        startIso,
        endIso,
        `${origin}/requests`,
        `${origin}/settings`,
        locale,
      ),
    });
  },
  /** Promoted/demoted to/from admin or manager — to the affected user. */
  async sendRoleChanged(to: string, role: Role, granted: boolean, locale: Locale) {
    const cottage = await cottageNameOrApp();
    const origin = await requestOrigin();
    return sendMail({
      to,
      fromName: cottage,
      ...roleChangedEmail(role, granted, `${origin}/dashboard`, `${origin}/settings`, locale, cottage),
    });
  },
};

export type Mailer = typeof mailer;
