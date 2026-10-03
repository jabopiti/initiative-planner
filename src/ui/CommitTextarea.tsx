import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';
import type { FieldConflict } from '../state/ConflictUi';
import type { FieldFailure } from '../state/DataContext';
import { CommitFieldMessages } from './CommitInput';
import { useCommitField } from './commitField';
import { Textarea } from '@/components/ui/textarea';

/** Sizes a textarea to its text, border included. */
function fitHeight(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

/**
 * A plain-text field that wraps to two lines and commits on Enter, never on a line break (§5.4, §10.3):
 * Enter commits, Shift+Enter does nothing, and a pasted line break becomes a space. Fixed at two rows with
 * overflow hidden, so a longer description wraps within that height rather than growing the field; with `autoGrow`
 * it starts at one line and grows to fit its text instead (the initiative name, §5.4). Shares
 * `CommitInput`'s commit state machine, failed-save, changed-by-others and conflict wiring via `useCommitField`.
 */
export function CommitTextarea({
  value,
  onCommit,
  errorClassName = '',
  changed = false,
  failure = null,
  conflict = null,
  retryLabel,
  autoGrow = false,
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
  /** A same-field conflict at this field's path (§3, §9.9), shown under it. */
  conflict?: FieldConflict | null;
  /** One line that grows to fit its text, rather than a fixed two rows. */
  autoGrow?: boolean;
}) {
  const { draft, setDraft, error, errorId, failureId, commit, cancel } = useCommitField(value, onCommit);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Measured here rather than left to `field-sizing: content`, which not every browser supports: on every change to
  // its text, and when the window's width wraps it onto more or fewer lines.
  useLayoutEffect(() => {
    if (autoGrow && ref.current) fitHeight(ref.current);
  }, [autoGrow, draft]);
  useEffect(() => {
    if (!autoGrow) return;
    const refit = () => ref.current && fitHeight(ref.current);
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [autoGrow]);

  // Not while actively drafting something else: a fresh, uncommitted edit takes over the field's message slot.
  const showFailure = !error && draft === value ? failure : null;

  return (
    <>
      <Textarea
        {...props}
        ref={ref}
        rows={autoGrow ? 1 : 2}
        className={`resize-none overflow-hidden transition-colors duration-500 motion-reduce:transition-none ${className ?? ''} ${changed ? 'bg-met-tint' : ''}`}
        value={draft}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? errorId : showFailure !== null ? failureId : (conflict?.id ?? props['aria-describedby'])}
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
        conflict={conflict}
        label={props['aria-label'] ?? 'this field'}
      />
    </>
  );
}
