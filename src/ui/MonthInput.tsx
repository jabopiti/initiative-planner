import { useEffect, useId, useRef, useState } from 'react';
import { useHoldWhileEditing } from '../state/DataContext';
import { formatMonth, MONTH_ABBREVIATIONS, monthKey, parseMonthText } from '../data/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

const REFUSAL = 'Enter a month such as Sep 2026.';

/**
 * Month input (§9.11): one compact control. Click the field to type a month such as "Sep 2026" or to pick from the
 * popover that opens beneath it, a year stepper over the twelve months; the cursor stays in the field. ↓ moves into
 * the months, Esc closes the popover. Commits when the typed text reads as a month (on Enter or when focus leaves).
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
  const [draft, setDraft] = useState(value ? formatMonth(value) : '');
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((value ?? monthKey(new Date().getFullYear(), 0)).slice(0, 4)));
  const errorId = useId();
  useHoldWhileEditing(draft !== (value ? formatMonth(value) : ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(value ? formatMonth(value) : '');
    setUnreadable(false);
    if (value) setYear(Number(value.slice(0, 4)));
  }, [value]);

  const commit = () => {
    if (draft.trim() === '') {
      if (required) {
        setUnreadable(true);
        return;
      }
      setUnreadable(false);
      if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = parseMonthText(draft);
    if (!parsed) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setDraft(formatMonth(parsed));
    if (parsed !== value) onChange(parsed);
  };

  const select = (key: string) => {
    setUnreadable(false);
    setDraft(formatMonth(key));
    if (key !== value) onChange(key);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative w-36">
            <Input
              ref={inputRef}
              type="text"
              className={`w-full pr-9 transition-colors duration-500 ${changed ? 'bg-met-tint' : ''}`}
              aria-label={label}
              aria-invalid={unreadable || undefined}
              aria-describedby={unreadable ? errorId : undefined}
              placeholder="Sep 2026"
              value={draft}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setDraft(e.target.value);
                const parsed = parseMonthText(e.target.value);
                if (parsed) setYear(Number(parsed.slice(0, 4)));
                setOpen(true);
              }}
              onBlur={(e) => {
                // Focus moving into the popover is not leaving the control.
                if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
                commit();
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit();
                  setOpen(false);
                } else if (e.key === 'Escape' || e.key === 'Tab') {
                  // Tab moves on to the next field, not into the months (↓ does that), so the typed month commits as focus leaves.
                  setOpen(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOpen(true);
                  // The popover mounts on the next frame; the selected month (or the first) takes the focus.
                  requestAnimationFrame(() =>
                    (popoverRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? popoverRef.current?.querySelector<HTMLElement>('[data-month]'))?.focus(),
                  );
                }
              }}
            />
            <CalendarIcon width={16} height={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-secondary" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          ref={popoverRef}
          className="w-64 p-2"
          align="start"
          // Opening must not steal the cursor from the field, and clicking the field is not "outside".
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault();
          }}
          onEscapeKeyDown={() => inputRef.current?.focus()}
        >
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
            {MONTH_ABBREVIATIONS.map((name, index) => {
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
        </PopoverContent>
      </Popover>
      {unreadable && (
        <p id={errorId} role="alert" className="m-0 text-xs text-warning-text">
          {REFUSAL}
        </p>
      )}
    </div>
  );
}
