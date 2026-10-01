import { useEffect, useId, type RefObject } from 'react';
import { hasPassedGate } from '../data/frozen';
import type { Initiative } from '../data/types';
import { WarningIcon } from './icons';
import { Button } from '@/components/ui/button';

/** Where the delete confirmation is: asked, running, failed with the cause, or refused because a gate was passed. */
export type DeleteStep = 'asking' | 'deleting' | 'refused' | { failed: string };

/**
 * The inline delete confirmation under the initiative's header (§5.4, §9.9), in the team-change confirmation's
 * place. Focus starts on Cancel. Refused once a gate turns out passed, by another user meanwhile (§9.3): then it
 * only says so, with Close. Esc, Cancel and Close all close it.
 */
export function DeleteConfirmation({
  initiative,
  step,
  onConfirm,
  onClose,
  focusRef,
}: {
  initiative: Initiative;
  step: DeleteStep;
  onConfirm: () => void;
  onClose: () => void;
  /** Set to the control that takes focus — Cancel, or Close when refused — for the menu to focus once it has closed. */
  focusRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const bodyId = useId();
  const refused = step === 'refused' || hasPassedGate(initiative);
  const deleting = step === 'deleting';

  // On opening, on a refusal, and back on Cancel once a failed delete re-enables it.
  const failed = typeof step === 'object' ? step.failed : null;
  useEffect(() => {
    focusRef.current?.focus();
  }, [refused, failed, focusRef]);

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={refused ? undefined : bodyId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !deleting) onClose();
      }}
      className="mt-3 rounded-lg border border-border-strong bg-surface-card p-3 text-sm text-text-primary"
    >
      {refused ? (
        <>
          <p id={titleId} className="m-0">
            A gate was passed meanwhile, so {initiative.name} can&apos;t be deleted.
            {initiative.status !== 'Cancelled' && ' Cancel it instead.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button ref={focusRef} size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <p id={titleId} className="m-0 mb-1 font-medium">
            Delete {initiative.name}?
          </p>
          <p id={bodyId} className="m-0">
            This can&apos;t be undone.
          </p>
          {failed !== null && (
            <p role="alert" className="m-0 mt-2 flex items-center gap-1 text-xs text-alarm-text">
              <WarningIcon width={13} height={13} />
              Not deleted: {failed}.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="destructive" disabled={deleting} onClick={onConfirm}>
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </Button>
            <Button ref={focusRef} size="sm" variant="outline" disabled={deleting} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
