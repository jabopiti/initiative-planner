import { useId } from 'react';
import { amountRefusal, parseAmountExpression } from '../data/amountExpression';
import type { FieldConflict } from '../state/ConflictUi';
import type { FieldFailure } from '../state/DataContext';
import { AmountNote, CommitInput, Refusal } from './CommitInput';
import { formatExactAmount } from './formatAmount';
import { Input } from '@/components/ui/input';

const REFUSAL = 'Enter an amount, 0 or more.';

/** The room the field leaves, inside its left edge, for the currency symbol. */
export const symbolPadding = (symbol: string) => (symbol.length > 2 ? 'pl-11' : symbol.length === 2 ? 'pl-9' : 'pl-7');

/** "Saves as €12,000" for an entry that is a valid amount but not a plain number (§9.11); nothing otherwise, an unfinished sum included. */
export function savesAsNote(text: string, currencySymbol: string): string | null {
  const entry = parseAmountExpression(text);
  return entry.ok && !entry.plain ? `Saves as ${formatExactAmount(entry.value, currencySymbol)}` : null;
}

/**
 * A currency amount, edited in place: commits on blur or Enter, like the other inline fields (§9.9). It takes
 * shorthand and simple sums (§9.11) and shows what they will save as; anything that is not an amount of 0 or more
 * is refused on commit with the reason. The currency symbol sits inside the field. `value` is `undefined` for a
 * month with nothing recorded yet.
 */
export function AmountInput({
  value,
  currencySymbol,
  label,
  placeholder,
  changed,
  failure = null,
  conflict = null,
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
  /** A same-field conflict at this field's path (§3, §9.9). */
  conflict?: FieldConflict | null;
  /** The refusal for anything but a non-negative number, when the field names what it holds (a day rate). */
  refusal?: string;
  retryLabel?: string;
  /** The field's width and alignment. */
  className?: string;
  errorClassName?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      <CommitInput
        changed={changed}
        failure={failure}
        conflict={conflict}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        prefix={currencySymbol}
        note={(draft) => savesAsNote(draft, currencySymbol)}
        className={`${className} ${symbolPadding(currencySymbol)}`}
        errorClassName={errorClassName ?? 'mt-1 w-full'}
        retryLabel={retryLabel}
        aria-label={label}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onCommit={(text) => {
          const parsed = parseAmountExpression(text);
          if (!parsed.ok) return amountRefusal(parsed.reason, refusal);
          if (parsed.value === value) return false;
          onChange(parsed.value);
        }}
      />
    </div>
  );
}

/**
 * An amount in an unsaved draft row (Add cost item, Add country): the same field as {@link AmountInput}, with the
 * "Saves as" line, but the text belongs to the form, which reads it with `parseAmountExpression` on Add.
 */
export function AmountDraftInput({
  value,
  currencySymbol,
  error,
  className = 'w-28',
  onChange,
  ...input
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  currencySymbol: string;
  /** The refusal from the form's last Add. */
  error?: string;
  onChange: (text: string) => void;
}) {
  const errorId = useId();
  const noteId = useId();
  const note = error ? null : savesAsNote(value, currencySymbol);
  return (
    <div className="flex flex-col gap-1">
      <span className="relative inline-flex items-center">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 text-caption text-text-secondary">
          {currencySymbol}
        </span>
        <Input
          {...input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`${className} ${symbolPadding(currencySymbol)}`}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errorId : note ? noteId : null, input['aria-describedby'] ?? null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      {error && <Refusal id={errorId}>{error}</Refusal>}
      {note && <AmountNote id={noteId}>{note}</AmountNote>}
    </div>
  );
}
