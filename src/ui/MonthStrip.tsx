import { formatMonth, formatMonthName, formatMonthShort } from '../data/dates';
import { formatAmount, formatCompactAmount } from './formatAmount';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** The strip's value for "spread over the phase"; every other value is a month key. */
export const SPREAD = 'spread';

/**
 * A cost item's timing, chosen on the period's months (§5.4): **Spread over the phase** or one month, each month
 * showing the compact amount it receives (the full amount in its tooltip, a dash while there isn't one). One choice
 * at a time, roving focus with the arrow keys. `value` is {@link SPREAD}, a month key, or `undefined` for a month
 * outside the period, which selects no cell.
 */
export function MonthStrip({
  months,
  value,
  amountByMonth,
  currencySymbol,
  label,
  onChange,
}: {
  /** The period's months. */
  months: string[];
  value: string | undefined;
  /** What each month receives under the current timing; a month missing from it receives nothing, or the amount isn't valid yet. */
  amountByMonth: Record<string, number | undefined>;
  currencySymbol: string;
  label: string;
  onChange: (value: string) => void;
}) {
  // A strip over two or more years names the year on every cell, so no month reads as another year's.
  const years = new Set(months.map((key) => key.slice(0, 4))).size;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={1}
      value={value ?? ''}
      aria-label={label}
      className="max-w-full overflow-x-auto"
      // Choosing the chosen one again would deselect it; a timing is always chosen.
      onValueChange={(next) => next && onChange(next)}
    >
      <ToggleGroupItem value={SPREAD} className="shrink-0">
        Spread over the phase
      </ToggleGroupItem>
      {months.map((key) => {
        const amount = amountByMonth[key];
        const when = formatMonth(key);
        const full = amount === undefined ? '' : formatAmount(amount, currencySymbol);
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={key}
                aria-label={`${when}, receives ${full || 'nothing'}`}
                className="h-auto min-w-14 shrink-0 flex-col gap-0 px-2 py-1 leading-tight"
              >
                <span>{years > 1 ? formatMonthShort(key) : formatMonthName(key)}</span>
                <span className="text-caption text-text-secondary">{amount === undefined ? '—' : formatCompactAmount(amount, currencySymbol)}</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{full ? `${when}: ${full}` : when}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
