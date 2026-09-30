import { parseAmount } from '../data/cost';
import type { FieldFailure } from '../state/DataContext';
import { CommitInput } from './CommitInput';

const REFUSAL = 'Enter an amount, 0 or more.';

/**
 * A currency amount, edited in place: commits on blur or Enter, like the other inline fields (§9.9). Anything
 * but a non-negative number is refused inline. `value` is `undefined` for a month with nothing recorded yet.
 */
export function AmountInput({
  value,
  currencySymbol,
  label,
  placeholder,
  changed,
  failure = null,
  refusal = REFUSAL,
  retryLabel,
  className = 'w-28',
  errorClassName,
  onChange,
}: {
  value: number | undefined;
  currencySymbol: string;
  label: string;
  placeholder?: string;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure?: FieldFailure | null;
  /** The refusal for anything but a non-negative number, when the field names what it holds (a day rate). */
  refusal?: string;
  retryLabel?: string;
  /** The field's width and alignment. */
  className?: string;
  errorClassName?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-text-secondary">{currencySymbol}</span>
      <CommitInput
        changed={changed}
        failure={failure}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        className={className}
        errorClassName={errorClassName}
        retryLabel={retryLabel}
        aria-label={label}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onCommit={(text) => {
          const parsed = parseAmount(text);
          if (parsed === null) return refusal;
          if (parsed === value) return false;
          onChange(parsed);
        }}
      />
    </div>
  );
}
