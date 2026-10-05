import type { FieldConflict } from '../state/ConflictUi';
import type { FieldFailure } from '../state/DataContext';
import { ConflictBlock } from './ConflictBlock';
import { FailedEdit } from './CommitInput';

/**
 * What a popover field (§9.11) says under itself, one at a time in the field's `aria-describedby`: text it couldn't
 * read, else a failed, unsaved edit, else a same-field conflict (§3, §9.9). A conflict shown in its table's row
 * (`inRow`) is not repeated here.
 */
export function FieldMessages({
  refusal,
  refusalId,
  failure,
  failureId,
  retryLabel,
  conflict,
  label,
}: {
  /** The refusal for unreadable text, or null while the text reads. */
  refusal: string | null;
  refusalId: string;
  failure: FieldFailure | null;
  failureId: string;
  retryLabel: string;
  conflict: FieldConflict | null;
  label: string;
}) {
  return (
    <>
      {refusal && (
        <p id={refusalId} role="alert" className="m-0 text-caption text-warning-text">
          {refusal}
        </p>
      )}
      {failure && <FailedEdit id={failureId} failure={failure} retryLabel={retryLabel} />}
      {conflict && !conflict.inRow && <ConflictBlock conflict={conflict} label={label} />}
    </>
  );
}

/** The id of the message {@link FieldMessages} shows first, for the field's `aria-describedby`. */
export function fieldMessageId(ids: { refusal: string | null; refusalId: string; failure: FieldFailure | null; failureId: string; conflict: FieldConflict | null }): string | undefined {
  if (ids.refusal) return ids.refusalId;
  if (ids.failure) return ids.failureId;
  return ids.conflict?.id;
}

/** ↓ in a popover field: once the picker has mounted (the next frame), the first element `selectors` find in it takes the focus. */
export function focusIntoPicker(picker: { readonly current: HTMLElement | null }, selectors: string[]): void {
  requestAnimationFrame(() => {
    for (const selector of selectors) {
      const target = picker.current?.querySelector<HTMLElement>(selector);
      if (target) return target.focus();
    }
  });
}
