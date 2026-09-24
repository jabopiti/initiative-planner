import { useRepository, useRepositoryState } from '../state/DataContext';
import { Button } from '@/components/ui/button';

/**
 * A same-field conflict (§3 "Conflict edge cases", §10.5): never
 * auto-resolved. Master list files and initiative files both report them here.
 */
export function ConflictBanner() {
  const repository = useRepository();
  const { conflicts } = useRepositoryState();

  if (conflicts.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text"
      role="alert"
    >
      {conflicts.map((conflict, index) => (
        <div key={`${conflict.itemId}-${index}`} className="flex items-center justify-between gap-3">
          <span>
            Someone else changed this at the same time. Yours: <strong>{JSON.stringify(conflict.mine)}</strong>. Theirs:{' '}
            <strong>{JSON.stringify(conflict.theirs)}</strong>.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void repository.resolveConflict(conflict, 'theirs')}
            >
              Keep theirs
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void repository.resolveConflict(conflict, 'mine')}
            >
              Use mine
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
