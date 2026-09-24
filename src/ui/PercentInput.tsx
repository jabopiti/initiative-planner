import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { WarningIcon } from './icons';

/** Bare number field that commits on every valid change (§5.6: edits in place, no save button). */
export function PercentInput({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max?: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [capped, setCapped] = useState(false);
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={max ?? 100}
          className="w-16"
          aria-label={label}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = Number(e.target.value);
            if (e.target.value === '' || Number.isNaN(parsed) || parsed < 0) return;
            const limit = max ?? 100;
            setCapped(parsed > limit);
            onChange(Math.min(parsed, limit));
          }}
          onBlur={() => {
            setDraft(String(value));
            setCapped(false);
          }}
        />
        <span className="text-sm text-text-secondary">%</span>
      </div>
      {capped && max !== undefined && (
        <p className="m-0 mt-1 flex items-center gap-1 rounded-md bg-warning-tint px-2 py-1 text-xs text-warning-text" role="status">
          <WarningIcon width={14} height={14} />
          Max {max}%. Other teams hold the rest.
        </p>
      )}
    </div>
  );
}
