/** Single import surface for every renderer the app supports. */
export {
  magicLinkEmail,
  inviteEmail,
  resetPasswordEmail,
  emailChangeEmail,
  emailChangedNoticeEmail,
} from './auth';
export {
  bookingStatusEmail,
  bookingRequestEmail,
  roleChangedEmail,
  type BookingStatus,
  type Role,
} from './notifications';
