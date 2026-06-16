import type { CSSProperties } from 'react';

/**
 * Shared look for the demo-login "post-it" notes (desktop scatter + mobile
 * list). Real sticky-note paper, not a glossy card: matte canary yellow, square
 * corners, NO border, a soft lift shadow, a faint adhesive band along the top,
 * and a genuinely DOG-EARED bottom-right corner — the corner is clipped off the
 * silhouette so the folded flap replaces it (rather than sitting on top of an
 * intact square corner). Each caller layers on its own position/rotation/width.
 */

/** How big the folded corner is. */
const FOLD = '1.75rem';

/**
 * Classic canary yellows kept close together so a wall of them reads as one
 * pad, with a faint top-lit vertical gradient (paper catches more light along
 * its top edge).
 */
const DEMO_NOTE_BACKGROUNDS = [
  'linear-gradient(176deg, #fdf6a0 0%, #fbe87c 100%)',
  'linear-gradient(176deg, #fef8af 0%, #fdec86 100%)',
  'linear-gradient(176deg, #fcf29a 0%, #fae578 100%)',
  'linear-gradient(176deg, #fffabe 0%, #fdef8e 100%)',
] as const;

export function demoNoteStyle(index: number): CSSProperties {
  return {
    background: DEMO_NOTE_BACKGROUNDS[index % DEMO_NOTE_BACKGROUNDS.length],
    // Snip the bottom-right corner off the note's silhouette, so the fold takes
    // the corner's place instead of overlapping a still-square corner.
    clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${FOLD}), calc(100% - ${FOLD}) 100%, 0 100%)`,
    // Lift shadow via `drop-shadow` (not box-shadow) so it follows the clipped
    // shape — box-shadow would be cropped away by the clip-path.
    filter:
      'drop-shadow(0 1px 1px rgba(60,45,12,0.22)) drop-shadow(0 12px 16px rgba(60,45,12,0.38))',
  };
}

/** The paper itself — everything except size, position and rotation. */
export const DEMO_NOTE_PAPER_CLASS = [
  'group cursor-pointer px-4 pb-5 pt-7 text-left text-[#3b2f12]',
  'transition duration-150 hover:-translate-y-0.5',
  // clip-path crops a box-shadow ring, so use an outline for the focus ring.
  'focus-visible:outline-none focus-visible:[outline:2px_solid_var(--ring)] focus-visible:outline-offset-2',
  // Adhesive strip: a barely-there matte band along the very top edge.
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-6 before:bg-[linear-gradient(180deg,rgba(120,90,20,0.08),transparent)]',
].join(' ');

/**
 * The folded-up corner flap. Rendered as a child so the note's clip-path trims
 * it to the crease: the part beyond the crease is clipped away (revealing the
 * page behind the snipped corner), and the part on the note shows the paper's
 * lit underside with a soft crease line.
 */
export const DEMO_NOTE_FOLD_CLASS = [
  'pointer-events-none absolute bottom-0 right-0 h-7 w-7',
  'bg-[linear-gradient(135deg,#fef6ac_0%,#fffbd8_44%,rgba(70,52,14,0.3)_49.5%,transparent_50%)]',
].join(' ');
