/** A filter chip's pill trigger (§9.11), highlighted while the chip filters. */
export const chipTriggerClass = (active: boolean) =>
  `inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${active ? 'border-brand-accent bg-brand-accent-tint font-medium text-brand-accent-text' : 'border-border-strong bg-surface-card text-text-primary'}`;
