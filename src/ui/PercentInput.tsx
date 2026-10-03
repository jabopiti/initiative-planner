import { useState } from 'react';
import { parseAmount } from '../data/cost';
import type { FieldConflict } from '../state/ConflictUi';
import type { FieldFailure } from '../state/DataContext';
import { CommitInput } from './CommitInput';
import { InlineWarning } from './InlineWarning';

const REFUSAL = 'Enter a percentage from 0 to 100.';

/**
 * Bare number field, edited in place (§5.6): commits on blur or Enter. Anything but 0 to 100 (or, with `max`, a
 * value over it) is handled per §9.9: text, an empty field and negatives are refused inline; a value over
 * `max` is a deliberate cap, so it is set to `max` and the note saying so stays until the field is edited again.
 */
export function PercentInput({
  value,
  max,
  label,
  id,
  disabled,
  flat,
  changed,
  failure = null,
  conflict = null,
  initialCappedAt = null,
  onChange,
}: {
  value: number;
  max?: number;
  label: string;
  /** The id a visible `<Label htmlFor>` points at. */
  id?: string;
  disabled?: boolean;
  /** Lays the field and its message out as items of the parent flex-wrap row; the message wraps below it. */
  flat?: boolean;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure?: FieldFailure | null;
  /** A same-field conflict at this field's path (§3, §9.9). */
  conflict?: FieldConflict | null;
  /** The value was already set down to this cap before the field appeared (a rejoin); its note shows from the start. */
  initialCappedAt?: number | null;
  onChange: (value: number) => void;
}) {
  const [over, setOver] = useState(false);
  const [cappedAt, setCappedAt] = useState<number | null>(initialCappedAt);
  const limit = max ?? 100;
  const parse = (text: string) => parseAmount(text) ?? NaN;
  const messageClass = 'mt-1 order-last w-full';

  return (
    <div className={flat ? 'contents' : 'flex flex-wrap items-center'}>
      <CommitInput
        changed={changed}
        failure={failure}
        conflict={conflict}
        type="number"
        inputMode="numeric"
        min={0}
        max={limit}
        suffix="%"
        className="w-[4.5rem] pr-7 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        errorClassName={messageClass}
        id={id}
        aria-label={label}
        disabled={disabled}
        value={String(value)}
        onDraftChange={(text) => {
          setCappedAt(null);
          setOver(parse(text) > limit);
        }}
        onCommit={(text) => {
          setOver(false);
          const parsed = parse(text);
          if (Number.isNaN(parsed)) return REFUSAL;
          if (parsed > limit) return max === undefined ? REFUSAL : capTo(max);
          if (parsed === value) return false;
          onChange(parsed);
        }}
      />
      {max !== undefined && cappedAt !== null && (
        <InlineWarning className={messageClass}>Set to {cappedAt}%, the most left. Other teams hold the rest.</InlineWarning>
      )}
      {max !== undefined && cappedAt === null && over && (
        <InlineWarning className={messageClass}>Max {max}%. Other teams hold the rest.</InlineWarning>
      )}
    </div>
  );

  /** Applies the cap; returns `false` so the field shows the capped number even when it did not change. */
  function capTo(cap: number) {
    setCappedAt(cap);
    if (cap !== value) onChange(cap);
    return cap === value ? false : undefined;
  }
}
