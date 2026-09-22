import { useRepository, useRepositoryState } from '../state/DataContext';
import styles from './ConflictBanner.module.css';

/**
 * A same-field conflict (§3 "Conflict edge cases", §10.5): never
 * auto-resolved. Not reachable through slice 003's own screens today (no
 * flow edits an existing shared entity's field concurrently) — wired up as
 * real, tested infrastructure ahead of the slice that first needs it.
 */
export function ConflictBanner() {
  const repository = useRepository();
  const { conflicts } = useRepositoryState();

  if (conflicts.length === 0) return null;

  return (
    <div className={styles.wrap} role="alert">
      {conflicts.map((conflict, index) => (
        <div key={`${conflict.itemId}-${index}`} className={styles.row}>
          <span>
            Someone else changed this at the same time. Yours: <strong>{JSON.stringify(conflict.mine)}</strong>. Theirs:{' '}
            <strong>{JSON.stringify(conflict.theirs)}</strong>.
          </span>
          <div className={styles.actions}>
            <button type="button" onClick={() => void repository.resolveConflict(conflict, 'theirs')}>
              Keep theirs
            </button>
            <button type="button" onClick={() => void repository.resolveConflict(conflict, 'mine')}>
              Use mine
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
