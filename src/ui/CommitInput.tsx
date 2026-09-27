import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { useHoldWhileEditing, type FieldFailure } from '../state/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The tinted, announced message box under a field (§9.9): a refusal (alarm) or a failed save (warning) share
 * this one shape, differing only in tone and content. */
function MessageBox({ id, tone, className = '', children }: { id?: string; tone: 'alarm' | 'warning'; className?: string; children: ReactNode }) {
  const toneClass = tone === 'alarm' ? 'bg-alarm-tint text-alarm-text' : 'bg-warning-tint text-warning-text';
  // No gap/justify class here: Refusal and FailedEdit need different ones, and each supplies its own via
  // `className` below rather than fighting the base's over an already-present utility of the same kind.
  return (
    <p id={id} role="alert" className={`m-0 flex items-center rounded-md px-2 py-1 text-xs ${toneClass} ${className}`}>
      {children}
    </p>
  );
}

/** The message under a field that refused its text (§9.9), announced when it appears. */
export function Refusal({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <MessageBox id={id} tone="alarm" className={`gap-1 ${className}`}>
      {children}
    </MessageBox>
  );
}

/** A field whose edit failed to save stays in edit and shows this instead of looking identical to a saved field
 * (§3, §9.9): the cause and its own Retry, with an accessible name distinct from every other Retry on screen. */
export function FailedEdit({ id, retryLabel, failure, className = '' }: { id?: string; retryLabel: string; failure: FieldFailure; className?: string }) {
  return (
    <MessageBox id={id} tone="warning" className={`justify-between gap-2 ${className}`}>
      <span>{failure.message}</span>
      <Button type="button" variant="outline" size="xs" aria-label={retryLabel} onClick={failure.retry}>
        Retry
      </Button>
    </MessageBox>
  );
}

/**
 * A text or number field that commits when it loses focus or Enter is pressed, never on each keystroke
 * (§10.3), so typing a value is one edit and one commit. `onCommit` returns `false` to reject the text,
 * which puts the last committed value back in the field, or a string to refuse it with that message (§9.9):
 * the field then stays in edit with what was typed, marked invalid, and the message sits under it, linked
 * to the field and announced. Enter or leaving the field repeats the refusal until the text is fixed.
 * Esc cancels an edit in progress (§9.5), clears the message and, having used the key, keeps it from also
 * closing a panel around the field; with nothing typed it passes on. While text is typed and not yet committed,
 * a change another user made is held back from the page (§3), and `changed` tints the field for a few seconds
 * when another user's change just updated its value (§9.9).
 */
export function CommitInput({
  value,
  onCommit,
  onDraftChange,
  errorClassName = '',
  changed = false,
  failure = null,
  retryLabel,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (text: string) => boolean | string | void;
  /** Every keystroke, for feedback that must not wait for the commit (a limit warning). */
  onDraftChange?: (text: string) => void;
  /** Layout for the refusal message, which renders right after the field as a sibling. */
  errorClassName?: string;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure?: FieldFailure | null;
  /** The failed edit's Retry button's accessible name, distinct from every other Retry on screen (§9.5, §9.9). */
  retryLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const failureId = useId();
  useHoldWhileEditing(draft !== value);
  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  const commit = () => {
    if (draft === value) {
      setError(null);
      return;
    }
    const result = onCommit(draft);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    setError(null);
    if (result === false) setDraft(value);
  };

  // Not while actively drafting something else: a fresh, uncommitted edit takes over the field's message slot.
  const showFailure = !error && draft === value ? failure : null;

  return (
    <>
      <Input
        {...props}
        className={`transition-colors duration-500 ${className ?? ''} ${changed ? 'bg-met-tint' : ''}`}
        value={draft}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? errorId : showFailure !== null ? failureId : props['aria-describedby']}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape' && draft !== value) {
            setDraft(value);
            setError(null);
            e.stopPropagation();
          }
        }}
      />
      {error && (
        <Refusal id={errorId} className={errorClassName}>
          {error}
        </Refusal>
      )}
      {showFailure && (
        <FailedEdit id={failureId} className={errorClassName} failure={showFailure} retryLabel={retryLabel ?? `Retry saving ${props['aria-label'] ?? 'this field'}`} />
      )}
    </>
  );
}
