import { useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import type { FileConflict } from '../sync/FileWriter';
import { Button } from '@/components/ui/button';

/**
 * A same-field conflict (§3 "Conflict edge cases", §10.5): never
 * auto-resolved. Master list files and initiative files both report them here.
 * A conflict leaves only once the choice is saved; if the write fails it stays,
 * with the cause, and choosing again is the retry.
 */
export function ConflictBanner() {
  const repository = useRepository();
  const { conflicts, readOnly } = useRepositoryState();
  const [unsaved, setUnsaved] = useState<FileConflict[]>([]);

  if (conflicts.length === 0) return null;

  async function choose(conflict: FileConflict, choice: 'mine' | 'theirs') {
    setUnsaved((current) => current.filter((c) => c !== conflict));
    const saved = await repository.resolveConflict(conflict, choice);
    if (!saved) setUnsaved((current) => [...current, conflict]);
  }

  return (
    <div
      className="flex flex-col gap-2 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text"
      role="alert"
    >
      {conflicts.map((conflict, index) => (
        <div key={`${conflict.itemId}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <span>
              Someone else changed this at the same time. Yours: <strong>{JSON.stringify(conflict.mine)}</strong>. Theirs:{' '}
              <strong>{JSON.stringify(conflict.theirs)}</strong>.
            </span>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void choose(conflict, 'theirs')}>
                Keep theirs
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void choose(conflict, 'mine')}>
                Use mine
              </Button>
            </div>
          </div>
          {unsaved.includes(conflict) && (
            <p className="mt-1 mb-0">
              Your choice was not saved{readOnly ? `: ${readOnly.message.replace(/[.\s]+$/, '')}` : ''}. Choose again to retry.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
