export interface SettingsProps {
  firstName: string;
  lastName: string;
  email: string;
  hasPassword: boolean;
  /** Only admins may set a password; everyone else signs in with a magic link. */
  isAdmin: boolean;
  /** Managers see the extra "booking requests" notification option. */
  isManager: boolean;
  notifyEnabled: boolean;
  notifyBooking: boolean;
  notifyRequests: boolean;
}
