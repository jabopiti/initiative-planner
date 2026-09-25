import { useEffect, useState } from 'react';
import { formatMonth, MONTHS, monthKey, parseMonthText } from '../data/dates';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { PopoverTextField } from './PopoverTextField';

const yearOf = (key: string) => Number(key.slice(0, 4));

/**
 * Month input (§9.11): one compact control. Click the field to type a month such as "Sep 2026" or to pick from
 * the popover that opens beneath it, a year stepper over the twelve months (the shell is {@link PopoverTextField}).
 * A month field that is `required` refuses an empty field; otherwise clearing the text clears the month.
 */
export function MonthInput({
  value,
  label,
  required,
  changed,
  onChange,
}: {
  /** A month key, `YYYY-MM`. */
  value: string | undefined;
  label: string;
  required?: boolean;
  /** Another user's change just updated this month (§9.9). */
  changed?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const [year, setYear] = useState(() => yearOf(value ?? monthKey(new Date().getFullYear(), 0)));
  useEffect(() => {
    if (value) setYear(yearOf(value));
  }, [value]);

  return (
    <PopoverTextField
      value={value}
      label={label}
      placeholder="Sep 2026"
      refusal="Enter a month such as Sep 2026."
      required={required}
      changed={changed}
      widthClassName="w-36"
      format={formatMonth}
      parse={parseMonthText}
      onChange={onChange}
      onTyped={(parsed) => setYear(yearOf(parsed))}
      // The selected month, or the first while none is.
      pickerFocus={['[aria-pressed="true"]', '[data-month]']}
      pickerClassName="w-64 p-2"
    >
      {(select) => (
        <>
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear(year - 1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm font-medium tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button type="button" variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear(year + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((name, index) => {
              const key = monthKey(year, index);
              return (
                <Button
                  key={key}
                  type="button"
                  data-month={key}
                  variant={key === value ? 'default' : 'ghost'}
                  size="sm"
                  aria-pressed={key === value}
                  aria-label={formatMonth(key)}
                  onClick={() => select(key)}
                >
                  {name}
                </Button>
              );
            })}
          </div>
          <p className="m-0 mt-2 px-1 text-xs text-text-muted">Or type a month, e.g. Sep 2026</p>
        </>
      )}
    </PopoverTextField>
  );
}
