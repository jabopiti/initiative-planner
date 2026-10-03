import { shortCause } from '../github/errors';
import { useRepositoryState } from '../state/DataContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckIcon, SyncingIcon, WarningIcon } from './icons';

/** The sync indicator (§5.1, §3 Sync failures): a small icon, with "Saving…" while writes are pending, and a label in read-only mode; the synced check says "Saved" on hover and focus. */
export function SyncIndicator() {
  const state = useRepositoryState();

  if (state.readOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 text-body text-warning-text" title={state.readOnly.message}>
        <WarningIcon />
        Read-only · {shortCause(state.readOnly)}
      </span>
    );
  }

  if (state.syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
        <SyncingIcon className="animate-spin" />
        Saving…
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          aria-label={state.updatedByOthers ? 'Synced, updated by others' : 'Synced'}
          className="inline-flex items-center gap-1.5 rounded-sm text-body text-met-text"
        >
          <CheckIcon />
        </span>
      </TooltipTrigger>
      <TooltipContent>{state.updatedByOthers ? 'Saved · updated by others' : 'Saved'}</TooltipContent>
    </Tooltip>
  );
}
