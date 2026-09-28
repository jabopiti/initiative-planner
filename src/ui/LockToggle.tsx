import { LockedIcon, UnlockedIcon } from './icons';
import type { SectionLock } from './useSectionLock';
import { Button } from '@/components/ui/button';

/** A lockable section's labelled lock toggle (§2, §9.9): pressed when unlocked, announced to screen readers. */
export function LockToggle({ lock }: { lock: SectionLock }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={!lock.locked}
      className={lock.locked ? undefined : 'border-brand-accent bg-brand-accent-tint text-brand-accent-text hover:bg-brand-accent-tint'}
      onClick={lock.toggle}
    >
      {lock.locked ? <LockedIcon width={16} height={16} /> : <UnlockedIcon width={16} height={16} />}
      {lock.locked ? 'Locked' : 'Unlocked'}
    </Button>
  );
}
