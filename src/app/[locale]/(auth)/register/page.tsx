import { redirect } from 'next/navigation';

/**
 * Self-service registration is removed — accounts are created via invite
 * links only. Old `/register` traffic (bookmarks, bots) lands here and is
 * redirected to the login page.
 */
export default function RegisterPage() {
  redirect('/login');
}
