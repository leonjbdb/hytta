export interface InviteListItem {
  id: string;
  token: string;
  maxUses: number | null;
  useCount: number;
  /** Pre-bound recipient when the invite was sent by email; null for shareable links. */
  email: string | null;
  /** ms-since-epoch (serialised from Date for client-side use). */
  expiresAt: number;
  /**
   * Pre-formatted, locale-correct expiry label. Computed server-side to avoid
   * Node ↔ browser ICU divergence (e.g. en-GB renders "4 May 2026 at 16:18"
   * vs "4 May 2026, 16:18" on different runtimes), which manifests as a
   * hydration mismatch when formatted on the client.
   */
  expiresAtLabel: string;
  revokedAt: number | null;
  createdAt: number;
}

export interface InviteProps {
  origin: string;
  invites: InviteListItem[];
  demo: boolean;
}
