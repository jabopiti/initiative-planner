import type { ComponentProps } from 'react';
import type { FieldFailure } from '../state/DataContext';
import { CommitFieldMessages, useCommitField } from './CommitInput';
import { Textarea } from '@/components/ui/textarea';

/**
 * A plain-text field that wraps to two lines and commits on Enter, never on a line break (§5.4, §10.3):
 * Enter commits, Shift+Enter does nothing, and a pasted line break becomes a space. Fixed at two rows with
 * overflow hidden, so a longer description wraps within that height rather than growing the field. Shares
 * `CommitInput`'s commit state machine, failed-save, changed-by-others and conflict wiring via `useCommitField`.
 */
export function CommitTextarea({
  value,
  onCommit,
  errorClassName = '',
  changed = false,
  failure = null,
  retryLabel,
  className,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (text: string) => boolean | string | void;
  /** Layout for the refusal message, which renders right after the field as a sibling. */
  errorClassName?: string;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure?: FieldFailure | null;
  /** The failed edit's Retry button's accessible name, distinct from every other Retry on screen (§9.5, §9.9). */
  retryLabel?: string;
}) {
  const { draft, setDraft, error, errorId, failureId, commit, cancel } = useCommitField(value, onCommit);

  // Not while actively drafting something else: a fresh, uncommitted edit takes over the field's message slot.
  const showFailure = !error && draft === value ? failure : null;

  return (
    <>
      <Textarea
        {...props}
        rows={2}
        className={`resize-none overflow-hidden transition-colors duration-500 ${className ?? ''} ${changed ? 'bg-met-tint' : ''}`}
        value={draft}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? errorId : showFailure !== null ? failureId : props['aria-describedby']}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData('text').replace(/\r\n|\r|\n/g, ' ');
          const el = e.currentTarget;
          setDraft(draft.slice(0, el.selectionStart) + pasted + draft.slice(el.selectionEnd));
        }}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!e.shiftKey) commit();
          }
          if (e.key === 'Escape' && draft !== value) {
            cancel();
            e.stopPropagation();
          }
        }}
      />
      <CommitFieldMessages
        error={error}
        errorId={errorId}
        showFailure={showFailure}
        failureId={failureId}
        errorClassName={errorClassName}
        retryLabel={retryLabel ?? `Retry saving ${props['aria-label'] ?? 'this field'}`}
      />
    </>
  );
}
