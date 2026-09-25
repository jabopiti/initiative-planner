import { useState } from 'react';
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
  disabled,
  flat,
  changed,
  onChange,
}: {
  value: number;
  max?: number;
  label: string;
  disabled?: boolean;
  /** Lays the field and its message out as items of the parent flex-wrap row; the message wraps below it. */
  flat?: boolean;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  onChange: (value: number) => void;
}) {
  const [over, setOver] = useState(false);
  const [cappedAt, setCappedAt] = useState<number | null>(null);
  const limit = max ?? 100;
  const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));
  const messageClass = 'mt-1 order-last w-full';

  return (
    <div className={flat ? 'contents' : 'flex flex-wrap items-center gap-x-1'}>
      <CommitInput
        changed={changed}
        type="number"
        inputMode="numeric"
        min={0}
        max={limit}
        className="w-16"
        errorClassName={messageClass}
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
          if (Number.isNaN(parsed) || parsed < 0) return REFUSAL;
          if (parsed > limit) return max === undefined ? REFUSAL : capTo(max);
          if (parsed === value) return false;
          onChange(parsed);
        }}
      />
      <span className={`text-sm text-text-secondary ${flat ? '-ml-1' : ''}`}>%</span>
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
