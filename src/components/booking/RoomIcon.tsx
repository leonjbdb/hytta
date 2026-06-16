import {
  BedDouble,
  BedSingle,
  Castle,
  Circle,
  DoorOpen,
  Dumbbell,
  Flower,
  Heart,
  House,
  Mountain,
  Snowflake,
  Sofa,
  Sparkles,
  Square,
  Star,
  Sun,
  Tent,
  TreePine,
  Triangle,
  Waves,
  type LucideIcon,
} from 'lucide-react';

export { House };

/**
 * Curated icon catalogue for rooms. Admins pick one of these when configuring
 * a room. Adding a new option is a one-line edit here — no migration needed.
 */
export interface RoomIconChoice {
  name: string;
  label: string;
  icon: LucideIcon;
}

export const ROOM_ICONS: readonly RoomIconChoice[] = [
  { name: 'circle', label: 'Circle', icon: Circle },
  { name: 'square', label: 'Square', icon: Square },
  { name: 'triangle', label: 'Triangle', icon: Triangle },
  { name: 'house', label: 'House', icon: House },
  { name: 'door', label: 'Door', icon: DoorOpen },
  { name: 'bed-double', label: 'Double bed', icon: BedDouble },
  { name: 'bed-single', label: 'Single bed', icon: BedSingle },
  { name: 'sofa', label: 'Sofa', icon: Sofa },
  { name: 'tree', label: 'Tree', icon: TreePine },
  { name: 'mountain', label: 'Mountain', icon: Mountain },
  { name: 'tent', label: 'Tent', icon: Tent },
  { name: 'castle', label: 'Castle', icon: Castle },
  { name: 'sun', label: 'Sun', icon: Sun },
  { name: 'snow', label: 'Snow', icon: Snowflake },
  { name: 'star', label: 'Star', icon: Star },
  { name: 'sparkles', label: 'Sparkles', icon: Sparkles },
  { name: 'flower', label: 'Flower', icon: Flower },
  { name: 'heart', label: 'Heart', icon: Heart },
  { name: 'waves', label: 'Waves', icon: Waves },
  { name: 'gym', label: 'Gym', icon: Dumbbell },
];

/** House silhouette — used wherever a FULL_COTTAGE row needs an icon. */
export function FullCottageShape({ size = 12 }: { size?: number }) {
  return (
    <House
      width={size}
      height={size}
      strokeWidth={2.25}
      className="text-[var(--color-moss-600)]"
      aria-hidden
    />
  );
}

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ROOM_ICONS.map((i) => [i.name, i.icon]),
);

export function RoomIcon({
  name,
  size = 16,
  className,
  color,
  filled = true,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Optional CSS colour applied to both stroke and (when filled) fill. */
  color?: string;
  /** Render the icon as a solid shape (default) instead of outline-only. */
  filled?: boolean;
}) {
  const Icon = ICON_MAP[name] ?? Square;
  return (
    <Icon
      size={size}
      className={className}
      style={color ? { color } : undefined}
      fill={filled ? color ?? 'currentColor' : 'none'}
      strokeWidth={filled ? 1.25 : 2}
      aria-hidden
    />
  );
}

export interface RoomColorChoice {
  name: string;
  label: string;
  value: string;
}

/**
 * Curated colour palette for rooms. Admins pick one when creating/editing a
 * room; the value is stored verbatim in `room.color` and re-used everywhere
 * the room is rendered (icon tint, calendar marker, dashboard chip).
 */
export const ROOM_COLOR_PALETTE: readonly RoomColorChoice[] = [
  { name: 'sky', label: 'Sky', value: '#3b82f6' },
  { name: 'forest', label: 'Forest', value: '#16a34a' },
  { name: 'sun', label: 'Sun', value: '#eab308' },
  { name: 'coral', label: 'Coral', value: '#f97316' },
  { name: 'rose', label: 'Rose', value: '#e11d48' },
  { name: 'plum', label: 'Plum', value: '#7c3aed' },
  { name: 'lilac', label: 'Lilac', value: '#a78bfa' },
  { name: 'pink', label: 'Pink', value: '#ec4899' },
  { name: 'mint', label: 'Mint', value: '#14b8a6' },
  { name: 'aqua', label: 'Aqua', value: '#06b6d4' },
  { name: 'sand', label: 'Sand', value: '#a16207' },
  { name: 'moss', label: 'Moss', value: '#65a30d' },
  { name: 'slate', label: 'Slate', value: '#64748b' },
];
