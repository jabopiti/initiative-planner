import { useEffect, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/**
 * A text or number field that commits when it loses focus or Enter is pressed, never on each keystroke
 * (§10.3), so typing a value is one edit and one commit. `onCommit` returns `false` to reject the text,
 * which puts the last committed value back in the field. Esc cancels an edit in progress (§9.5) and,
 * having used the key, keeps it from also closing a panel around the field; with nothing typed it passes on.
 */
export function CommitInput({
  value,
  onCommit,
  onDraftChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (text: string) => boolean | void;
  /** Every keystroke, for feedback that must not wait for the commit (a limit warning). */
  onDraftChange?: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft === value) return;
    if (onCommit(draft) === false) setDraft(value);
  };

  return (
    <Input
      {...props}
      value={draft}
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
          e.stopPropagation();
        }
      }}
    />
  );
}
