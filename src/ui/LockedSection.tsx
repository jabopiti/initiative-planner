import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EditingIcon, LockedIcon } from './icons';
import { SectionHeader } from './PageHeader';
import type { SectionLock } from './useSectionLock';

/**
 * A lockable Settings section's heading row (§2, §5.9, §9.9): locked, **Unlock to edit**; unlocked, an Accent
 * "Editing" tag beside the title and **Lock**. `actions` sit before the lock button.
 */
export function LockableSectionHeader({ id, title, lock, actions }: { id: string; title: string; lock: SectionLock; actions?: ReactNode }) {
  return (
    <SectionHeader
      id={id}
      title={title}
      tag={
        !lock.locked && (
          <Badge className="bg-brand-accent-tint font-medium text-brand-accent-text">
            <EditingIcon width={12} height={12} />
            Editing
          </Badge>
        )
      }
      actions={
        <>
          {actions}
          <Button type="button" variant="outline" size="sm" onClick={lock.toggle}>
            <LockedIcon width={16} height={16} />
            {lock.locked ? 'Unlock to edit' : 'Lock'}
          </Button>
        </>
      }
    />
  );
}

/** A locked section's value as plain text, not a disabled field (§5.9, §9.9), at a field's height so rows keep their size. */
export function LockedValue({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-9 items-center">{children}</span>;
}

/** A locked row's active state as text, where unlocked its actions menu sits (§9.3). */
export function LockedActive({ active }: { active: boolean }) {
  return <span className="inline-flex h-9 items-center text-caption text-text-secondary">{active ? 'Active' : 'Inactive'}</span>;
}
