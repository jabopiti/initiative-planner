import { useRepository, useRepositoryState } from '../state/DataContext';
import { Button } from '@/components/ui/button';
import { WarningIcon } from './icons';

/**
 * The full-storage notice (§3 Storage limits): the browser refused to keep a local copy, but GitHub has every
 * edit, so this only warns that the next open loads everything again. It shows once per session, until dismissed.
 */
export function CacheFullBanner() {
  const repository = useRepository();
  const { cacheFull } = useRepositoryState();
  if (!cacheFull) return null;
  return (
    <div role="status" className="flex items-start gap-2 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text">
      <span className="flex flex-1 items-center gap-1.5">
        <WarningIcon />
        <span>
          Browser storage is full. Your changes are saved in GitHub, but this browser can&apos;t keep a local copy, so the next open loads everything
          again.
        </span>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => repository.dismissCacheFull()}>
        Dismiss
      </Button>
    </div>
  );
}
