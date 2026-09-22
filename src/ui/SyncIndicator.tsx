import { useRepositoryState } from '../state/DataContext';
import { CheckIcon, SyncingIcon, WarningIcon } from './icons';
import styles from './SyncIndicator.module.css';

/** The sync indicator (§5.1, §3 Sync failures): a small icon, with a label while syncing or read-only. */
export function SyncIndicator() {
  const state = useRepositoryState();

  if (state.readOnly) {
    return (
      <span className={styles.readOnly} title={state.readOnly.message}>
        <WarningIcon />
        Read-only
      </span>
    );
  }

  if (state.syncing) {
    return (
      <span className={styles.syncing}>
        <SyncingIcon className={styles.spin} />
        Syncing…
      </span>
    );
  }

  return (
    <span className={styles.synced} title="Synced">
      <CheckIcon />
    </span>
  );
}
