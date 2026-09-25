import { useEffect, useState } from 'react';
import { formatDateField, localIso, localToday, parseDateText, parseIso } from '../data/dates';
import { Calendar } from '@/components/ui/calendar';
import { PopoverTextField } from './PopoverTextField';

const fromIso = (isoDate: string) => {
  const [y, m, d] = parseIso(isoDate);
  return new Date(y, m - 1, d);
};

/**
 * Date input (§9.11): one compact control. Click the field to type a date such as "26.06.2026" or
 * to pick from the calendar that opens beneath it; the calendar follows what is typed, and ↓ moves
 * into it (the shell is {@link PopoverTextField}). Clearing the text clears the date.
 */
export function DateInput({
  value,
  label,
  openOn,
  highlight,
  changed,
  onChange,
}: {
  value: string | undefined;
  label: string;
  /** Where an empty field's calendar opens (an end date opens on the start date's month); today otherwise. */
  openOn?: string;
  /** Marks the field as the next thing to fill in. */
  highlight?: boolean;
  /** Another user's change just updated this date (§9.9). */
  changed?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const [month, setMonth] = useState<Date>(() => fromIso(value ?? openOn ?? localToday()));
  useEffect(() => {
    if (value) setMonth(fromIso(value));
  }, [value]);

  return (
    <PopoverTextField
      value={value}
      label={label}
      placeholder="dd.mm.yyyy"
      refusal="Couldn't read that date. Try 26.06.2026."
      highlight={highlight}
      changed={changed}
      widthClassName="w-40"
      format={formatDateField}
      parse={parseDateText}
      onChange={onChange}
      onOpen={(draft) => {
        if (!value) setMonth(fromIso(parseDateText(draft) ?? openOn ?? localToday()));
      }}
      onTyped={(parsed) => setMonth(fromIso(parsed))}
      pickerFocus={['button[tabindex="0"]']}
    >
      {(select) => (
        <Calendar
          mode="single"
          selected={value ? fromIso(value) : undefined}
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => select(date ? localIso(date) : undefined)}
          footer={<p className="m-0 px-1 pb-1 text-xs text-text-muted">Or type a date, e.g. 26.06.2026</p>}
        />
      )}
    </PopoverTextField>
  );
}
