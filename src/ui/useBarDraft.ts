import { useRef, useState, type KeyboardEvent } from 'react';
import { useHoldWhileEditing } from '../state/DataContext';

/**
 * A bar's unsaved value while it is dragged, stepped or typed into (§9.5), shared by the load bar and the split bar.
 * While a draft is unsaved, other users' changes wait (§3). `commit` saves the latest draft through `onCommit` (on
 * release, Enter or blur); Esc drops it. `typingKeyDown` handles digits, Backspace, Enter and Esc, handing a typed
 * number to `apply`; it returns false for any other key, which ends typing.
 */
export function useBarDraft<T>(onCommit: (next: T) => void) {
  const [draft, setDraftState] = useState<T | null>(null);
  /** The draft as of the latest event, for a release that comes before the re-render. */
  const latest = useRef<T | null>(null);
  /** Digits typed since focus or the last commit, or null when not typing. */
  const typed = useRef<string | null>(null);
  useHoldWhileEditing(draft !== null);

  const setDraft = (next: T | null) => {
    latest.current = next;
    setDraftState(next);
  };
  const revert = () => {
    typed.current = null;
    setDraft(null);
  };
  const commit = () => {
    const next = latest.current;
    revert();
    if (next !== null) onCommit(next);
  };

  const typingKeyDown = (e: KeyboardEvent, apply: (typedValue: number) => void): boolean => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const text = (typed.current ?? '') + e.key;
      if (Number(text) > 100) return true; // a digit that would pass 100 is ignored
      typed.current = text;
      apply(Number(text));
    } else if (e.key === 'Backspace' && typed.current !== null) {
      e.preventDefault();
      typed.current = typed.current.slice(0, -1);
      apply(Number(typed.current || '0'));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      revert();
    } else {
      typed.current = null;
      return false;
    }
    return true;
  };

  return { draft, setDraft, commit, typingKeyDown };
}
