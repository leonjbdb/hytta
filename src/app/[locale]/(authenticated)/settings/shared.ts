export interface SettingsProps {
  firstName: string;
  lastName: string;
  email: string;
  /** New address awaiting email-change confirmation, if any. */
  pendingEmail: string | null;
  /** Demo mode locks the email-change form and disables real email sends. */
  isDemo: boolean;
  hasPassword: boolean;
  /** Only admins may set a password; everyone else signs in with a magic link. */
  isAdmin: boolean;
  /** Managers see the extra "booking requests" notification option. */
  isManager: boolean;
  notifyEnabled: boolean;
  notifyBooking: boolean;
  notifyRequests: boolean;
}
