import type { ComponentProps, ReactNode } from 'react';
import type { FieldConflict } from '../state/ConflictUi';
import type { FieldFailure } from '../state/DataContext';
import { ConflictBlock } from './ConflictBlock';
import { useCommitField } from './commitField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The tinted, announced message box under a field (§9.9): a refusal (alarm) or a failed save (warning) share
 * this one shape, differing only in tone and content. */
function MessageBox({ id, tone, className = '', children }: { id?: string; tone: 'alarm' | 'warning'; className?: string; children: ReactNode }) {
  const toneClass = tone === 'alarm' ? 'bg-alarm-tint text-alarm-text' : 'bg-warning-tint text-warning-text';
  // No gap/justify class here: Refusal and FailedEdit need different ones, and each supplies its own via
  // `className` below rather than fighting the base's over an already-present utility of the same kind.
  return (
    <p id={id} role="alert" className={`m-0 flex items-center rounded-md px-2 py-1 text-caption ${toneClass} ${className}`}>
      {children}
    </p>
  );
}

/** The quiet line under a field that says what an entry will save as (§9.11); announced politely as the entry changes. */
export function AmountNote({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <p id={id} aria-live="polite" className={`m-0 text-caption text-text-secondary ${className}`}>
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

/** The refusal/failed-save messages under a commit field (§9.9), in the precedence a fresh edit takes over the
 * field's message slot from a stale failure, then the field's same-field conflict, unless its table shows that
 * in a row of its own. */
export function CommitFieldMessages({
  error,
  errorId,
  showFailure,
  failureId,
  errorClassName,
  retryLabel,
  conflict = null,
  label,
}: {
  conflict?: FieldConflict | null;
  /** The field's name, for the conflict's accessible names. */
  label: string;
  error: string | null;
  errorId: string;
  showFailure: FieldFailure | null;
  failureId: string;
  errorClassName: string;
  retryLabel: string;
}) {
  return (
    <>
      {error && (
        <Refusal id={errorId} className={errorClassName}>
          {error}
        </Refusal>
      )}
      {showFailure && <FailedEdit id={failureId} className={errorClassName} failure={showFailure} retryLabel={retryLabel} />}
      {conflict && !conflict.inRow && <ConflictBlock conflict={conflict} label={label} className={errorClassName} />}
    </>
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
 * when another user's change just updated its value (§9.9). `locked` shows the value as plain text instead, not a
 * disabled field (§5.9, §9.9), at a field's height so rows keep their size.
 */
export function CommitInput({
  value,
  locked = false,
  onCommit,
  onDraftChange,
  errorClassName = '',
  changed = false,
  failure = null,
  conflict = null,
  conflictLabel,
  retryLabel,
  className,
  suffix,
  prefix,
  note,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  value: string;
  /** A locked Settings section's field (§5.9): the value as text, not editable. */
  locked?: boolean;
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
  /** A same-field conflict at this field's path (§3, §9.9): shown under it, or in its table's row when `inRow`. */
  conflict?: FieldConflict | null;
  /** The field's name in the conflict's accessible names, when it has a visible label rather than an `aria-label`. */
  conflictLabel?: string;
  /** A unit shown inside the field's right edge (the % of a percent field); `className` should leave room for it. */
  suffix?: string;
  /** A unit shown inside the field's left edge (the currency of an amount); `className` should leave room for it. */
  prefix?: string;
  /** A line under the field about the draft being typed ("Saves as €12,000", §9.11), until a refusal or failed save takes its place. */
  note?: (draft: string) => string | null;
}) {
  const { draft, setDraft, error, errorId, failureId, commit, cancel } = useCommitField(value, onCommit);
  if (locked) return <span className="inline-flex h-9 items-center">{value}</span>;

  // Not while actively drafting something else: a fresh, uncommitted edit takes over the field's message slot.
  const showFailure = !error && draft === value ? failure : null;
  const noteText = !error && !showFailure ? (note?.(draft) ?? null) : null;
  const noteId = `${errorId}-note`;
  const describedBy = error ? errorId : showFailure !== null ? failureId : [noteText ? noteId : null, conflict?.id ?? props['aria-describedby']].filter(Boolean).join(' ') || undefined;

  const input = (
      <Input
        {...props}
        className={`transition-colors duration-500 motion-reduce:transition-none ${className ?? ''} ${changed ? 'bg-met-tint' : ''}`}
        value={draft}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={describedBy}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape' && draft !== value) {
            cancel();
            e.stopPropagation();
          }
        }}
      />
  );

  return (
    <>
      {suffix || prefix ? (
        <span className="relative inline-flex items-center">
          {prefix && (
            <span aria-hidden="true" className="pointer-events-none absolute left-3 text-caption text-text-secondary">
              {prefix}
            </span>
          )}
          {input}
          {suffix && (
            <span aria-hidden="true" className="pointer-events-none absolute right-3 text-caption text-text-secondary">
              {suffix}
            </span>
          )}
        </span>
      ) : (
        input
      )}
      {noteText && <AmountNote id={noteId} className={errorClassName}>{noteText}</AmountNote>}
      <CommitFieldMessages
        error={error}
        errorId={errorId}
        showFailure={showFailure}
        failureId={failureId}
        errorClassName={errorClassName}
        retryLabel={retryLabel ?? `Retry saving ${props['aria-label'] ?? 'this field'}`}
        conflict={conflict}
        label={conflictLabel ?? props['aria-label'] ?? 'this field'}
      />
    </>
  );
}
