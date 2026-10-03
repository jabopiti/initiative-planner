import { useRepository, useRepositoryState } from '../state/DataContext';
import { DismissibleWarning } from './DismissibleWarning';

/**
 * The full-storage notice (§3 Storage limits): the browser refused to keep a local copy, but GitHub has every
 * edit, so this only warns that the next open loads everything again. It shows once per session, until dismissed.
 */
export function CacheFullBanner() {
  const repository = useRepository();
  const { cacheFull } = useRepositoryState();
  if (!cacheFull) return null;
  return (
    <DismissibleWarning onDismiss={() => repository.dismissCacheFull()}>
      Browser storage is full. Your changes are saved in GitHub, but this browser can&apos;t keep a local copy, so the next open loads everything
      again.
    </DismissibleWarning>
  );
}
