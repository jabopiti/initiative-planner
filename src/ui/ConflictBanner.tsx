import { useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import type { FileConflict } from '../sync/FileWriter';
import { pathKey } from '../sync/merge';
import { Button } from '@/components/ui/button';
import { describeConflict } from './describeConflict';

/**
 * A same-field conflict (§3 "Conflict edge cases", §10.5): never
 * auto-resolved. Master list files and initiative files both report them here,
 * one row per field, naming the thing and both values as the screen shows them.
 * A conflict leaves only once the choice is saved; if the write fails it stays,
 * with the cause, and choosing again is the retry.
 */
export function ConflictBanner() {
  const repository = useRepository();
  const brand = useBrand();
  const state = useRepositoryState();
  const { conflicts, readOnly } = state;
  const [unsaved, setUnsaved] = useState<FileConflict[]>([]);

  if (conflicts.length === 0) return null;

  async function choose(conflict: FileConflict, choice: 'mine' | 'theirs') {
    setUnsaved((current) => current.filter((c) => c !== conflict));
    const saved = await repository.resolveConflict(conflict, choice);
    if (!saved) setUnsaved((current) => [...current, conflict]);
  }

  const context = { ...state, process: brand.process, currencySymbol: brand.currencySymbol };

  return (
    <div
      className="flex flex-col gap-1 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text"
      role="alert"
    >
      <p className="m-0">Changed by someone else while you were editing. Choose which value to keep.</p>
      {conflicts.map((conflict) => {
        const { entity, field, mine, theirs, labelled } = describeConflict(conflict, context);
        return (
          <div key={`${conflict.file}:${pathKey(conflict.path)}`} className="border-t border-border-default pt-1">
            <div className="flex items-center justify-between gap-3">
              <span>
                <strong>{entity}</strong> · {field}
                {!labelled && <span className="text-text-secondary"> (unlabelled field)</span>} — yours <strong>{mine}</strong>, theirs{' '}
                <strong>{theirs}</strong>
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
        );
      })}
    </div>
  );
}
