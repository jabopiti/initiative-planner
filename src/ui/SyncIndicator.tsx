import { shortCause } from '../github/errors';
import { useRepositoryState } from '../state/DataContext';
import { CheckIcon, SyncingIcon, WarningIcon } from './icons';

/** The sync indicator (§5.1, §3 Sync failures): a small icon, with a label while syncing or read-only. */
export function SyncIndicator() {
  const state = useRepositoryState();

  if (state.readOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-warning-text" title={state.readOnly.message}>
        <WarningIcon />
        Read-only · {shortCause(state.readOnly)}
      </span>
    );
  }

  if (state.syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <SyncingIcon className="animate-spin" />
        Syncing…
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={state.updatedByOthers ? 'Synced, updated by others' : 'Synced'}
      className="inline-flex items-center gap-1.5 text-sm text-met-text"
      title={state.updatedByOthers ? 'Updated by others' : 'Synced'}
    >
      <CheckIcon />
    </span>
  );
}
