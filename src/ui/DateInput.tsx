import { useEffect, useId, useState } from 'react';
import { formatDate, parseDateText } from '../data/dates';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from './icons';

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Date input (§9.11): one compact control. Type a date such as "3 Sep 2026", or open a small
 * calendar; both are operable from the keyboard. Commits when the typed text reads as a date
 * (on blur or Enter), and clearing the text clears the date.
 */
export function DateInput({
  value,
  label,
  onChange,
}: {
  value: string | undefined;
  label: string;
  onChange: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ? formatDate(value) : '');
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const errorId = useId();
  useEffect(() => {
    setDraft(value ? formatDate(value) : '');
    setUnreadable(false);
  }, [value]);

  const commit = () => {
    if (draft.trim() === '') {
      setUnreadable(false);
      if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = parseDateText(draft);
    if (!parsed) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setDraft(formatDate(parsed));
    if (parsed !== value) onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          type="text"
          className="w-32"
          aria-label={label}
          aria-invalid={unreadable || undefined}
          aria-describedby={unreadable ? errorId : undefined}
          placeholder="3 Sep 2026"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`Open calendar for ${label.toLowerCase()}`}>
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value ? fromIso(value) : undefined}
              defaultMonth={value ? fromIso(value) : undefined}
              onSelect={(date) => {
                if (date) onChange(toIso(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {unreadable && (
        <p id={errorId} role="alert" className="m-0 text-xs text-warning-text">
          Couldn&apos;t read that date. Try 3 Sep 2026.
        </p>
      )}
    </div>
  );
}
