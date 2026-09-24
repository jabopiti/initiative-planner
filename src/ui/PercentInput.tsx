import { useState } from 'react';
import { CommitInput } from './CommitInput';
import { InlineWarning } from './InlineWarning';

/** Bare number field, edited in place (§5.6): commits on blur or Enter, with a live warning while the typed value is over its limit. */
export function PercentInput({
  value,
  max,
  label,
  disabled,
  flat,
  onChange,
}: {
  value: number;
  max?: number;
  label: string;
  disabled?: boolean;
  /** Lays the field and its message out as items of the parent flex-wrap row; the message wraps below it. */
  flat?: boolean;
  onChange: (value: number) => void;
}) {
  const [capped, setCapped] = useState(false);
  const limit = max ?? 100;
  const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

  return (
    <div className={flat ? 'contents' : undefined}>
      <div className="flex items-center gap-1">
        <CommitInput
          type="number"
          inputMode="numeric"
          min={0}
          max={limit}
          className="w-16"
          aria-label={label}
          disabled={disabled}
          value={String(value)}
          onDraftChange={(text) => setCapped(parse(text) > limit)}
          onCommit={(text) => {
            setCapped(false);
            const parsed = parse(text);
            if (Number.isNaN(parsed) || parsed < 0) return false;
            const next = Math.min(parsed, limit);
            if (next === value) return false;
            onChange(next);
          }}
        />
        <span className="text-sm text-text-secondary">%</span>
      </div>
      {capped && max !== undefined && (
        <InlineWarning className={`mt-1 ${flat ? 'order-last w-full' : ''}`}>Max {max}%. Other teams hold the rest.</InlineWarning>
      )}
    </div>
  );
}
