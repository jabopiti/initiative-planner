import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { formatDate, formatDateField, formatPeriod, localIso, localToday, parseDateText, parseIso } from '../data/dates';
import { addDays } from '../data/defaultPlan';
import { endAfterMonths, periodLength } from '../data/period';
import type { FieldConflict } from '../state/ConflictUi';
import { useHoldWhileEditing, type FieldFailure } from '../state/DataContext';
import { ConflictBlock } from './ConflictBlock';
import { FailedEdit } from './CommitInput';
import { InlineWarning } from './InlineWarning';
import { CalendarIcon } from './icons';
import { neighbourSwatch, rangeCell } from './rangeCells';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

type Half = 'startDate' | 'endDate';
export interface Period {
  startDate?: string;
  endDate?: string;
}
/** A neighbouring phase, marked faintly in the calendar (§9.11). */
export interface NeighbourPhase extends Period {
  label: string;
}

const REFUSAL = "Couldn't read that date. Try 26.06.2026.";
const LENGTHS = [1, 2, 3, 6] as const;

const toDate = (isoDate: string) => {
  const [y, m, d] = parseIso(isoDate);
  return new Date(y, m - 1, d);
};
const show = (isoDate: string | undefined) => (isoDate ? formatDateField(isoDate) : '');

/** Two calendar months from `sm` up, one below it (§9.11). */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const query = window.matchMedia('(min-width: 40rem)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => (typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia('(min-width: 40rem)').matches),
  );
}

/**
 * The period picker (§9.11): one control split into Start and End, each typed into, with a two-month calendar
 * popover where the range is previewed as it is chosen, the neighbouring phases are marked faintly, and a footer
 * names the period, its length and the working days per team country. A change saves only on Done (or Enter in a
 * half), as one write; Esc, a click outside or Tab out of it discards it.
 */
export function PeriodPicker({
  phaseLabel,
  value,
  previous,
  next,
  workingDays,
  highlight,
  changed,
  failure = null,
  conflict = null,
  onSave,
}: {
  phaseLabel: string;
  value: Period;
  /** The previous costed phase: its period is marked, "Right after <it>" starts the day after it ends, and a start
   * on or before its end warns (§5.4). */
  previous?: NeighbourPhase;
  next?: NeighbourPhase;
  /** Working days per team country across a period, labelled by code (§7.1). */
  workingDays: (startIso: string, endIso: string) => { label: string; days: number }[];
  /** Marks the control as the next thing to fill in. */
  highlight?: boolean;
  /** Another user's change just updated the period (§9.9). */
  changed?: boolean;
  /** A failed, unsaved edit of either date (§3, §9.9). */
  failure?: FieldFailure | null;
  /** A same-field conflict on either date (§3, §9.9). */
  conflict?: FieldConflict | null;
  onSave: (period: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Half>('startDate');
  const [draft, setDraft] = useState<Period>(value);
  const [texts, setTexts] = useState({ startDate: show(value.startDate), endDate: show(value.endDate) });
  const [unreadable, setUnreadable] = useState<Half | null>(null);
  const [hover, setHover] = useState<string | undefined>();
  const [month, setMonth] = useState<Date>(() => toDate(value.startDate ?? value.endDate ?? localToday()));
  const wide = useWideScreen();
  const errorId = useId();
  const failureId = useId();
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const dirty = draft.startDate !== value.startDate || draft.endDate !== value.endDate || texts.startDate !== show(draft.startDate) || texts.endDate !== show(draft.endDate);
  useHoldWhileEditing(open && dirty);

  // While closed, the control shows the saved period, also after another user's change.
  useEffect(() => {
    if (open) return;
    setDraft(value);
    setTexts({ startDate: show(value.startDate), endDate: show(value.endDate) });
  }, [open, value.startDate, value.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputOf = (half: Half) => (half === 'startDate' ? startRef : endRef);

  const begin = (half: Half) => {
    setActive(half);
    if (open) return;
    setDraft(value);
    setTexts({ startDate: show(value.startDate), endDate: show(value.endDate) });
    setUnreadable(null);
    setMonth(toDate(value[half] ?? value.startDate ?? value.endDate ?? localToday()));
    setOpen(true);
  };

  const discard = () => {
    setOpen(false);
    setHover(undefined);
    setUnreadable(null);
    setDraft(value);
    setTexts({ startDate: show(value.startDate), endDate: show(value.endDate) });
  };

  const done = () => {
    for (const half of ['startDate', 'endDate'] as const) {
      if (texts[half].trim() !== '' && !parseDateText(texts[half])) {
        setUnreadable(half);
        inputOf(half).current?.focus();
        return;
      }
    }
    onSave(draft);
    setOpen(false);
    setHover(undefined);
    setUnreadable(null);
  };

  const set = (next: Period, nextActive: Half = active) => {
    setDraft(next);
    setTexts({ startDate: show(next.startDate), endDate: show(next.endDate) });
    setUnreadable(null);
    setActive(nextActive);
  };

  const pick = (day: string) => {
    if (active === 'startDate') {
      set({ startDate: day, endDate: draft.endDate && draft.endDate >= day ? draft.endDate : undefined }, 'endDate');
    } else if (!draft.startDate || day < draft.startDate) {
      // A day before the start, while setting the end, starts the range again.
      set({ startDate: day, endDate: undefined }, 'endDate');
    } else {
      set({ ...draft, endDate: day });
    }
  };

  const type = (half: Half, text: string) => {
    setTexts((current) => ({ ...current, [half]: text }));
    setUnreadable(null);
    if (text.trim() === '') return setDraft((current) => ({ ...current, [half]: undefined }));
    const parsed = parseDateText(text);
    if (!parsed) return;
    setDraft((current) => ({ ...current, [half]: parsed }));
    setMonth(toDate(parsed));
  };

  /** Focus leaving the inputs and the popover together is Tab out: the change is discarded (§9.11). */
  const leave = (e: React.FocusEvent) => {
    if (!open) return;
    const to = e.relatedTarget as Node | null;
    if (to && (anchorRef.current?.contains(to) || pickerRef.current?.contains(to))) return;
    if (!to && !document.hasFocus()) return; // the window lost focus; the user is coming back
    discard();
  };

  // What the footer and the shading show: the draft, with the hovered or focused day standing in for the half being set.
  const shown: Period = { ...draft };
  if (hover && active === 'endDate' && draft.startDate && hover >= draft.startDate) shown.endDate = hover;
  if (hover && active === 'startDate' && (!draft.endDate || hover <= draft.endDate)) shown.startDate = hover;
  const inverted = Boolean(shown.startDate && shown.endDate && shown.endDate < shown.startDate);
  const overlapEnd = previous?.endDate && shown.startDate && shown.startDate <= previous.endDate ? previous.endDate : null;

  const neighbours = [previous, next].filter((p): p is NeighbourPhase => Boolean(p?.startDate && p.endDate && p.startDate <= p.endDate));
  const range = (from?: string, to?: string) => (from && to && from <= to ? { from: toDate(from), to: toDate(to) } : undefined);

  const summary = () => {
    const { startDate, endDate } = shown;
    if (!startDate) return 'Pick a start date, or type one.';
    if (!endDate) return `From ${formatDate(startDate)} · pick an end date`;
    if (inverted) return null;
    const counts = workingDays(startDate, endDate);
    const days = counts.length === 0 ? '' : ` · ${counts.map((c, i) => (i === 0 ? `${c.days} working days (${c.label})` : `${c.days} (${c.label})`)).join(' / ')}`;
    return `${formatPeriod(startDate, endDate)} · ${periodLength(startDate, endDate)}${days}`;
  };
  const summaryText = summary();

  const half = (which: Half) => {
    const ref = inputOf(which);
    const word = which === 'startDate' ? 'start' : 'end';
    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          aria-label={`${phaseLabel} ${word} date`}
          aria-invalid={unreadable === which || undefined}
          aria-describedby={unreadable === which ? errorId : failure ? failureId : conflict?.id}
          placeholder={which === 'startDate' ? 'Start' : 'End'}
          className={`h-8 w-36 rounded-md border-0 bg-transparent shadow-none dark:bg-transparent ${open && active === which ? 'outline-2 -outline-offset-2 outline-brand-accent' : ''}`}
          value={open ? texts[which] : show(value[which])}
          onClick={() => begin(which)}
          onFocus={(e) => {
            // Tab between the halves moves the outline; focus coming back from the calendar keeps it where it was.
            if (open && !pickerRef.current?.contains(e.relatedTarget as Node | null)) setActive(which);
          }}
          onChange={(e) => {
            begin(which);
            type(which, e.target.value);
          }}
          onBlur={leave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (open) done();
              else begin(which);
            } else if (e.key === 'Escape') {
              if (open) e.preventDefault();
              discard();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              begin(which);
              requestAnimationFrame(() => pickerRef.current?.querySelector<HTMLElement>('[role="grid"] button[tabindex="0"]')?.focus());
            }
          }}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) discard();
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            role="group"
            aria-label={`${phaseLabel} period`}
            className={`flex w-fit items-center rounded-md border transition-colors duration-500 motion-reduce:transition-none ${
              highlight ? 'border-brand-accent bg-brand-accent-tint' : changed ? 'border-input bg-met-tint' : 'border-input bg-transparent dark:bg-input/30'
            }`}
          >
            {half('startDate')}
            <span aria-hidden="true" className="h-5 w-px bg-border-strong" />
            {half('endDate')}
            <CalendarIcon width={16} height={16} className="pointer-events-none mr-3 shrink-0 text-text-secondary" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          ref={pickerRef}
          className="w-auto max-w-[calc(100vw-2rem)] p-0"
          align="start"
          aria-label={`${phaseLabel} period`}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onEscapeKeyDown={() => inputOf(active).current?.focus()}
          onBlur={leave}
          // The field keeps the focus while the picker is clicked.
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('input')) return;
            e.preventDefault();
          }}
        >
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {previous?.endDate && (
              <Button type="button" variant="outline" size="xs" className="rounded-full" onClick={() => pick(addDays(previous.endDate!, 1))}>
                Right after {previous.label}
              </Button>
            )}
            {LENGTHS.map((n) => (
              <Button
                key={n}
                type="button"
                variant="outline"
                size="xs"
                className="rounded-full"
                disabled={!draft.startDate}
                onClick={() => {
                  set({ startDate: draft.startDate, endDate: endAfterMonths(draft.startDate!, n) }, 'endDate');
                  setMonth(toDate(draft.startDate!));
                }}
              >
                {n === 1 ? '1 month' : `${n} months`}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={wide ? 2 : 1}
            month={month}
            onMonthChange={setMonth}
            today={toDate(localToday())}
            selected={range(shown.startDate, shown.endDate) ?? (shown.startDate ? { from: toDate(shown.startDate), to: undefined } : undefined)}
            // The picker decides what a click means (the half being set), so only the clicked day is taken from here.
            onSelect={(_, day) => pick(localIso(day))}
            onDayMouseEnter={(day) => setHover(localIso(day))}
            onDayMouseLeave={() => setHover(undefined)}
            onDayFocus={(day) => setHover(localIso(day))}
            onDayBlur={() => setHover(undefined)}
            modifiers={{ neighbour: neighbours.map((p) => range(p.startDate, p.endDate)!) }}
            modifiersClassNames={{ neighbour: rangeCell.neighbour }}
            classNames={{ today: `relative ${rangeCell.today}` }}
          />
          <div className="flex flex-col gap-2 border-t border-border-default px-3 py-2.5">
            <p className="m-0 flex flex-wrap items-center gap-3 text-label text-text-secondary">
                {neighbours.map((p) => (
                  <span key={p.label} className="inline-flex items-center gap-1">
                    <span aria-hidden="true" className={neighbourSwatch} />
                    {p.label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-brand-accent" />
                  Today
                </span>
              </p>
            {summaryText && (
              <p className="m-0 text-caption text-text-primary" aria-live="polite">
                {summaryText}
              </p>
            )}
            {overlapEnd && previous && (
              <InlineWarning>{`Starts before ${previous.label} ends (${formatDate(overlapEnd)}). The two phases overlap.`}</InlineWarning>
            )}
            {inverted && <InlineWarning>The end date is before the start date, so this phase isn&apos;t costed yet.</InlineWarning>}
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => set({}, 'startDate')}>
                Clear
              </Button>
              <Button type="button" size="sm" onClick={done}>
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {unreadable && (
        <p id={errorId} role="alert" className="m-0 text-caption text-warning-text">
          {REFUSAL}
        </p>
      )}
      {failure && !open && <FailedEdit id={failureId} failure={failure} retryLabel={`Retry saving the ${phaseLabel} period`} />}
      {conflict && !conflict.inRow && <ConflictBlock conflict={conflict} label={`${phaseLabel} period`} />}
    </div>
  );
}
