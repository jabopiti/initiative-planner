import { useEffect, useId, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/**
 * A text or number field that commits when it loses focus or Enter is pressed, never on each keystroke
 * (§10.3), so typing a value is one edit and one commit. `onCommit` returns `false` to reject the text,
 * which puts the last committed value back in the field, or a string to refuse it with that message (§9.9):
 * the field then stays in edit with what was typed, marked invalid, and the message sits under it, linked
 * to the field and announced. Enter or leaving the field repeats the refusal until the text is fixed.
 * Esc cancels an edit in progress (§9.5), clears the message and, having used the key, keeps it from also
 * closing a panel around the field; with nothing typed it passes on.
 */
export function CommitInput({
  value,
  onCommit,
  onDraftChange,
  errorClassName = '',
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (text: string) => boolean | string | void;
  /** Every keystroke, for feedback that must not wait for the commit (a limit warning). */
  onDraftChange?: (text: string) => void;
  /** Layout for the refusal message, which renders right after the field as a sibling. */
  errorClassName?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
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

  return (
    <>
      <Input
        {...props}
        value={draft}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? errorId : props['aria-describedby']}
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
        <p id={errorId} role="alert" className={`m-0 flex items-center gap-1 rounded-md bg-alarm-tint px-2 py-1 text-xs text-alarm-text ${errorClassName}`}>
          {error}
        </p>
      )}
    </>
  );
}
