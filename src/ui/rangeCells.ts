/**
 * How a cell in a range of days or months looks (§9.11 period picker). Shared so a month strip (061b's cost item
 * months) marks its cells the way the period picker marks its days: the period shaded, the range being chosen shaded
 * as it is previewed, a neighbouring phase's period faint, today dotted.
 */
export const rangeCell = {
  /** Inside the chosen period. */
  inRange: 'bg-brand-accent-tint',
  /** Inside the range the pointer or keyboard focus previews, before it is picked. */
  preview: 'bg-brand-accent-tint',
  /** A neighbouring phase's period: faint, so the period being set stands out. */
  neighbour: 'bg-surface-subtle',
  /** Today: a dot under the number. */
  today:
    'after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-brand-accent',
} as const;

/** The legend swatch for {@link rangeCell.neighbour}. */
export const neighbourSwatch = 'inline-block size-3 rounded-sm border border-border-default bg-surface-subtle';
