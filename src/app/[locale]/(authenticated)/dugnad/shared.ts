export interface DugnadRow {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName: string | null;
  createdByEmail: string | null;
  createdByIsAdmin: boolean | null;
  createdByIsManager: boolean | null;
  createdAt: number;
  completedBy: string | null;
  completedByName: string | null;
  completedByEmail: string | null;
  completedByIsAdmin: boolean | null;
  completedByIsManager: boolean | null;
  completedAt: number | null;
}

export interface DugnadProps {
  open: DugnadRow[];
  completed: DugnadRow[];
  viewerId: string;
  isAdmin: boolean;
}

/** Person label that prefers full name and falls back to the email local-part. */
export function personLabel(
  name: string | null,
  email: string | null,
): string {
  if (name && name.trim().length > 0) return name;
  if (email) return email.split('@')[0] ?? email;
  return '—';
}
