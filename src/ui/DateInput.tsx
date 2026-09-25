import { useEffect, useId, useRef, useState } from 'react';
import { useHoldWhileEditing } from '../state/DataContext';
import { formatDateField, localIso, localToday, parseDateText, parseIso } from '../data/dates';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CalendarIcon } from './icons';

const fromIso = (isoDate: string) => {
  const [y, m, d] = parseIso(isoDate);
  return new Date(y, m - 1, d);
};

/**
 * Date input (§9.11): one compact control. Click the field to type a date such as "26.06.2026" or
 * to pick from the calendar that opens beneath it; the cursor stays in the field, and the calendar
 * follows what is typed. ↓ moves into the calendar, Esc closes it. Commits when the typed text
 * reads as a date (on Enter or when focus leaves), and clearing the text clears the date.
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
  const [draft, setDraft] = useState(value ? formatDateField(value) : '');
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => fromIso(value ?? openOn ?? localToday()));
  const errorId = useId();
  useHoldWhileEditing(draft !== (value ? formatDateField(value) : ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(value ? formatDateField(value) : '');
    setUnreadable(false);
    if (value) setMonth(fromIso(value));
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
    setDraft(formatDateField(parsed));
    if (parsed !== value) onChange(parsed);
  };

  const openCalendar = () => {
    if (open) return;
    if (!value) setMonth(fromIso(parseDateText(draft) ?? openOn ?? localToday()));
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative w-40">
            <Input
              ref={inputRef}
              type="text"
              className={`w-full pr-9 transition-colors duration-500 ${highlight ? 'border-brand-accent bg-brand-accent-tint' : changed ? 'bg-met-tint' : ''}`}
              aria-label={label}
              aria-invalid={unreadable || undefined}
              aria-describedby={unreadable ? errorId : undefined}
              placeholder="dd.mm.yyyy"
              value={draft}
              onClick={openCalendar}
              onChange={(e) => {
                setDraft(e.target.value);
                const parsed = parseDateText(e.target.value);
                if (parsed) setMonth(fromIso(parsed));
                openCalendar();
              }}
              onBlur={(e) => {
                // Focus moving into the calendar is not leaving the control.
                if (calendarRef.current?.contains(e.relatedTarget as Node | null)) return;
                commit();
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit();
                  setOpen(false);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  openCalendar();
                  // The calendar mounts on the next frame; its one tabbable day takes the focus.
                  requestAnimationFrame(() => calendarRef.current?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus());
                }
              }}
            />
            <CalendarIcon width={16} height={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-secondary" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          ref={calendarRef}
          className="w-auto p-0"
          align="start"
          // Opening must not steal the cursor from the field, and clicking the field is not "outside".
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault();
          }}
          onEscapeKeyDown={() => inputRef.current?.focus()}
        >
          <Calendar
            mode="single"
            selected={value ? fromIso(value) : undefined}
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => {
              if (date) onChange(localIso(date));
              setOpen(false);
              inputRef.current?.focus();
            }}
            footer={<p className="m-0 px-1 pb-1 text-xs text-text-muted">Or type a date, e.g. 26.06.2026</p>}
          />
        </PopoverContent>
      </Popover>
      {unreadable && (
        <p id={errorId} role="alert" className="m-0 text-xs text-warning-text">
          Couldn&apos;t read that date. Try 26.06.2026.
        </p>
      )}
    </div>
  );
}
