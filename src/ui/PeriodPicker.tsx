import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { hasValidPeriod, type Period } from '../data/cost';
import { formatDate, formatDateField, formatPeriod, localIso, localToday, parseDateText, parseIso } from '../data/dates';
import { addDays } from '../data/defaultPlan';
import { endAfterMonths, periodLength } from '../data/period';
import { overlapWithPrevious } from '../data/phaseSummary';
import { plural } from '../data/plural';
import type { FieldConflict } from '../state/ConflictUi';
import { useHoldWhileEditing, type FieldFailure } from '../state/DataContext';
import { FieldMessages, fieldMessageId, focusIntoPicker } from './FieldMessages';
import { InlineWarning } from './InlineWarning';
import { CalendarIcon } from './icons';
import { neighbourSwatch, rangeCell } from './rangeCells';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

type Half = 'startDate' | 'endDate';
type Texts = Record<Half, string>;
/** A neighbouring phase, marked faintly in the calendar (§9.11). */
export interface NeighbourPhase extends Period {
  label: string;
}

const REFUSAL = "Couldn't read that date. Try 26.06.2026.";
const LENGTHS = [1, 2, 3, 6] as const;
const WIDE = '(min-width: 40rem)';

const toDate = (isoDate: string) => {
  const [y, m, d] = parseIso(isoDate);
  return new Date(y, m - 1, d);
};
const show = (isoDate: string | undefined) => (isoDate ? formatDateField(isoDate) : '');
const textsOf = (period: Period): Texts => ({ startDate: show(period.startDate), endDate: show(period.endDate) });
/** A typed half as a date: empty is no date, and text that doesn't read as one is none yet (Done refuses it). */
const readText = (text: string) => (text.trim() === '' ? undefined : (parseDateText(text) ?? undefined));
const range = (period: Period) => (hasValidPeriod(period) ? { from: toDate(period.startDate!), to: toDate(period.endDate!) } : undefined);

/** The §5.4 overlap warning, the same in the phase and in its period picker. */
export const overlapWarning = (previousLabel: string, previousEnd: string) => `Starts before ${previousLabel} ends (${formatDate(previousEnd)}). The two phases overlap.`;

const subscribeWide = (onChange: () => void) => {
  if (!window.matchMedia) return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isWide = () => (window.matchMedia ? window.matchMedia(WIDE).matches : true);

/**
 * The period picker (§9.11): one control split into Start and End, each typed into, with a two-month calendar
 * popover (one month below `sm`) where the range is previewed as it is chosen, the neighbouring phases are marked
 * faintly, and a footer names the period, its length and the working days per team country. A change saves only on
 * Done (or Enter in a half), as one write; Esc, a click outside or Tab out of it discards it.
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
  // What is typed in each half while the picker is open; null while it is closed, when the saved period shows.
  const [texts, setTexts] = useState<Texts | null>(null);
  const [active, setActive] = useState<Half>('startDate');
  const [unreadable, setUnreadable] = useState<Half | null>(null);
  const [hover, setHover] = useState<string | undefined>();
  const [month, setMonth] = useState<Date>(() => toDate(value.startDate ?? value.endDate ?? localToday()));
  const wide = useSyncExternalStore(subscribeWide, isWide);
  const errorId = useId();
  const failureId = useId();
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const open = texts !== null;
  const draft: Period = texts ? { startDate: readText(texts.startDate), endDate: readText(texts.endDate) } : value;
  const saved = textsOf(value);
  useHoldWhileEditing(open && (texts.startDate !== saved.startDate || texts.endDate !== saved.endDate));

  const inputOf = (half: Half) => (half === 'startDate' ? startRef : endRef);

  const begin = (half: Half) => {
    setActive(half);
    if (open) return;
    setTexts(saved);
    setMonth(toDate(value[half] ?? value.startDate ?? value.endDate ?? localToday()));
  };

  /** Closes the picker; whatever was not saved is gone. */
  const close = () => {
    setTexts(null);
    setHover(undefined);
    setUnreadable(null);
  };

  const done = () => {
    const unread = (['startDate', 'endDate'] as const).find((half) => texts![half].trim() !== '' && !parseDateText(texts![half]));
    if (unread) {
      setUnreadable(unread);
      inputOf(unread).current?.focus();
      return;
    }
    onSave(draft);
    close();
  };

  const set = (next: Period, nextActive: Half = active) => {
    setTexts(textsOf(next));
    setUnreadable(null);
    setActive(nextActive);
  };

  const pick = (day: string) => {
    if (active === 'startDate') {
      set({ startDate: day, endDate: draft.endDate && draft.endDate >= day ? draft.endDate : undefined }, 'endDate');
    } else if (!draft.startDate || day < draft.startDate) {
      // A day before the start, while setting the end, starts the range again.
      set({ startDate: day }, 'endDate');
    } else {
      set({ ...draft, endDate: day });
    }
  };

  const type = (half: Half, text: string) => {
    setTexts((current) => ({ ...(current ?? saved), [half]: text }));
    setUnreadable(null);
    const parsed = readText(text);
    if (parsed) setMonth(toDate(parsed));
  };

  /** Focus leaving the inputs and the popover together is Tab out: the change is discarded (§9.11). */
  const leave = (e: React.FocusEvent) => {
    if (!open) return;
    const to = e.relatedTarget as Node | null;
    if (to && (anchorRef.current?.contains(to) || pickerRef.current?.contains(to))) return;
    if (!to && !document.hasFocus()) return; // the window lost focus; the user is coming back
    close();
  };

  // What the footer and the shading show: the draft, with the hovered or focused day standing in for the half being set.
  const shown: Period = { ...draft };
  if (hover && active === 'endDate' && draft.startDate && hover >= draft.startDate) shown.endDate = hover;
  if (hover && active === 'startDate' && (!draft.endDate || hover <= draft.endDate)) shown.startDate = hover;
  const inverted = Boolean(shown.startDate && shown.endDate) && !hasValidPeriod(shown);
  const overlapEnd = overlapWithPrevious(previous, shown);
  const neighbours = [previous, next].filter((p): p is NeighbourPhase => Boolean(p && hasValidPeriod(p)));

  const summary = () => {
    const { startDate, endDate } = shown;
    if (!startDate) return 'Pick a start date, or type one.';
    if (!endDate) return `From ${formatDate(startDate)} · pick an end date`;
    if (inverted) return null;
    const counts = workingDays(startDate, endDate);
    const days = counts.length === 0 ? '' : ` · ${counts.map((c, i) => (i === 0 ? `${c.days} working days (${c.label})` : `${c.days} (${c.label})`)).join(' / ')}`;
    return `${formatPeriod(startDate, endDate)} · ${periodLength(startDate, endDate)}${days}`;
  };
  // Only the open picker shows it.
  const summaryText = open ? summary() : null;
  // Not while the picker is open: the edit in it takes over the message slot.
  const shownFailure = open ? null : failure;

  const half = (which: Half) => {
    const ref = inputOf(which);
    const word = which === 'startDate' ? 'start' : 'end';
    return (
      <Input
          ref={ref}
          type="text"
          aria-label={`${phaseLabel} ${word} date`}
          aria-invalid={unreadable === which || undefined}
          aria-describedby={fieldMessageId({ refusal: unreadable === which ? REFUSAL : null, refusalId: errorId, failure: shownFailure, failureId, conflict })}
          placeholder={which === 'startDate' ? 'Start' : 'End'}
          className={`h-8 w-36 rounded-md border-0 bg-transparent shadow-none dark:bg-transparent ${open && active === which ? 'outline-2 -outline-offset-2 outline-brand-accent' : ''}`}
          value={texts ? texts[which] : saved[which]}
          onClick={() => begin(which)}
          // Tab between the halves moves the outline.
          onFocus={() => open && setActive(which)}
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
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              begin(which);
              focusIntoPicker(pickerRef, ['[role="grid"] button[tabindex="0"]']);
            }
          }}
      />
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
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
                {plural(n, 'month', 'months')}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={wide ? 2 : 1}
            month={month}
            onMonthChange={setMonth}
            today={toDate(localToday())}
            selected={range(shown) ?? (shown.startDate ? { from: toDate(shown.startDate), to: undefined } : undefined)}
            // The picker decides what a click means (the half being set), so only the clicked day is taken from here.
            onSelect={(_, day) => pick(localIso(day))}
            onDayMouseEnter={(day) => setHover(localIso(day))}
            onDayMouseLeave={() => setHover(undefined)}
            onDayFocus={(day) => setHover(localIso(day))}
            onDayBlur={() => setHover(undefined)}
            modifiers={{ neighbour: neighbours.map((p) => range(p)!) }}
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
            {overlapEnd && previous && <InlineWarning>{overlapWarning(previous.label, overlapEnd)}</InlineWarning>}
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
      <FieldMessages
        refusal={unreadable ? REFUSAL : null}
        refusalId={errorId}
        failure={shownFailure}
        failureId={failureId}
        retryLabel={`Retry saving the ${phaseLabel} period`}
        conflict={conflict}
        label={`${phaseLabel} period`}
      />
    </div>
  );
}
