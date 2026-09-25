import { parseAmount } from '../data/cost';
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
  onChange,
}: {
  value: number | undefined;
  currencySymbol: string;
  label: string;
  placeholder?: string;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-text-secondary">{currencySymbol}</span>
      <CommitInput
        changed={changed}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        className="w-28"
        aria-label={label}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onCommit={(text) => {
          const parsed = parseAmount(text);
          if (parsed === null) return REFUSAL;
          if (parsed === value) return false;
          onChange(parsed);
        }}
      />
    </div>
  );
}
