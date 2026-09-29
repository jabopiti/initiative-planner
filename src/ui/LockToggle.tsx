import { LockedIcon, UnlockedIcon } from './icons';
import type { SectionLock } from './useSectionLock';
import { Toggle } from '@/components/ui/toggle';

/** A lockable section's labelled lock toggle (§2, §9.9): pressed when unlocked, announced to screen readers. */
export function LockToggle({ lock }: { lock: SectionLock }) {
  return (
    <Toggle
      type="button"
      variant="outline"
      size="sm"
      pressed={!lock.locked}
      onPressedChange={lock.toggle}
      className="data-[state=on]:border-brand-accent data-[state=on]:bg-brand-accent-tint data-[state=on]:text-brand-accent-text"
    >
      {lock.locked ? <LockedIcon width={16} height={16} /> : <UnlockedIcon width={16} height={16} />}
      {lock.locked ? 'Locked' : 'Unlocked'}
    </Toggle>
  );
}
