export interface AdminRoom {
  id: string;
  nameNb: string;
  nameEn: string;
  icon: string;
  color: string;
  capacityMode: 'BEDS' | 'SLOTS';
  slotCount: number | null;
}

export interface AdminBed {
  id: string;
  roomId: string;
  kind: 'DOUBLE' | 'SINGLE';
  label: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  isManager: boolean;
  isInvitee: boolean;
}

export interface AdminProps {
  cottageName: string;
  /** Link-preview description; empty string when the operator hasn't set one. */
  cottageDescription: string;
  /** Physical address (calendar LOCATION); empty string when unset. */
  cottageAddress: string;
  rooms: AdminRoom[];
  beds: AdminBed[];
  users: AdminUser[];
  adminCount: number;
  /** The signed-in admin — used to hide the "remove" action on their own row. */
  viewerId: string;
}
