import { useEffect, useId, useState } from 'react';
import { useHoldWhileEditing } from '../state/DataContext';

/**
 * The commit-on-blur-or-Enter state machine shared by every commit field (§9.9, §10.3): a draft that tracks
 * the committed `value` until it diverges, a refusal message from a string `onCommit` result, reverting the
 * draft on a `false` result, and holding back another user's change while there's an uncommitted edit. Each
 * field supplies its own element and key handling; only this bookkeeping is common to all of them.
 */
export function useCommitField(value: string, onCommit: (text: string) => boolean | string | void) {
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

  const cancel = () => {
    setDraft(value);
    setError(null);
  };

  return { draft, setDraft, error, errorId, failureId, commit, cancel };
}
