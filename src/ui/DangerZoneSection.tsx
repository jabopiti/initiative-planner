import { useEffect, useId, useRef, useState } from 'react';
import { causeText } from '../github/errors';
import { navigate } from '../router/useHashRoute';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { ActionError } from './ActionError';
import { LockableSectionHeader } from './LockedSection';
import { resetLine } from './resetLine';
import type { SectionLock } from './useSectionLock';
import { Button } from '@/components/ui/button';

type Step = { busy: false; error: string | null } | { busy: true };

/**
 * Settings' Danger zone (§5.9): Load example data into an empty dataset, and Reset to the fresh-install baseline
 * after an inline confirmation (§9.9). Lockable (§2): locked, each action shows its heading and description, its button
 * appearing on unlock. Both are refused while the tool is read-only (§3). Either opens the Portfolio when done, which
 * leaves Settings and so locks the section again.
 */
export function DangerZoneSection({ lock }: { lock: SectionLock }) {
  const repository = useRepository();
  const { teams, people, memberships, initiatives, readOnly } = useRepositoryState();
  const [load, setLoad] = useState<Step>({ busy: false, error: null });
  const [reset, setReset] = useState<Step>({ busy: false, error: null });
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lineId = useId();
  // Locking closes an open confirmation.
  if (confirming && lock.locked && !reset.busy) setConfirming(false);

  const hasData = teams.length + people.length + memberships.length + initiatives.length > 0;
  const busy = load.busy || reset.busy;
  const unavailable = readOnly !== null || busy;

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const loadExample = async () => {
    setLoad({ busy: true });
    const result = await repository.loadExampleData();
    if (result === 'loaded') return navigate('/portfolio');
    setLoad({ busy: false, error: result === 'not-empty' ? 'someone added data meanwhile. Reset first' : causeText(result.failed) });
  };

  const confirmReset = async () => {
    setReset({ busy: true });
    const result = await repository.resetDataset();
    if (result === 'reset') return navigate('/portfolio');
    setReset({ busy: false, error: causeText(result.failed) });
  };

  const closeConfirmation = () => {
    setConfirming(false);
    setReset({ busy: false, error: null });
  };

  return (
    <section aria-labelledby="settings-danger-zone-title" className="flex flex-col gap-1">
      <LockableSectionHeader id="settings-danger-zone-title" title="Danger zone" lock={lock} />

      <div className="rounded-lg border border-alarm bg-surface-card text-body">
        <div className="flex items-center gap-4 border-b border-border-default px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-heading">Load example data</h3>
            <p className="m-0 text-text-secondary">Fills an empty dataset with example teams, people and initiatives.</p>
            {!load.busy && load.error && <ActionError text={`Not loaded: ${load.error}.`} />}
          </div>
          {!lock.locked && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Button size="sm" variant="outline" disabled={unavailable || hasData} onClick={() => void loadExample()}>
                {load.busy ? 'Loading…' : 'Load example data'}
              </Button>
              {hasData && <span className="text-caption text-text-secondary">Reset first</span>}
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-heading">Reset</h3>
              <p className="m-0 text-text-secondary">Returns the dataset to a fresh install.</p>
            </div>
            {!lock.locked && !confirming && (
              <Button size="sm" variant="outline" className="border-alarm text-alarm-text hover:text-alarm-text" disabled={unavailable} onClick={() => setConfirming(true)}>
                Reset
              </Button>
            )}
          </div>
          {confirming && (
            <div
              role="alertdialog"
              aria-label="Reset the dataset"
              aria-describedby={lineId}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !reset.busy) closeConfirmation();
              }}
              className="mt-3 rounded-lg border border-border-strong p-3"
            >
              <p id={lineId} className="m-0">
                {resetLine(initiatives.length, people.length, teams.length)}
              </p>
              {!reset.busy && reset.error && <ActionError text={`Not reset: ${reset.error}.`} />}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="destructive" disabled={reset.busy || readOnly !== null} onClick={() => void confirmReset()}>
                  {reset.busy ? 'Resetting…' : 'Confirm reset'}
                </Button>
                <Button ref={cancelRef} size="sm" variant="outline" disabled={reset.busy} onClick={closeConfirmation}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
