import { useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { freeCapacity, overflowSpans, shownLoadMonth, type LoadBarModel, type NotCountedReason } from '../data/capacity';
import { formatMonth } from '../data/dates';
import { scalePct } from '../data/keyFigures';
import { useHoldWhileEditing } from '../state/DataContext';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/** The bar's scale runs past 100% so overflow shows (§5.4); load past it is clipped with an end mark. */
const SCALE = 150;
const STOPS = [25, 50, 75, 100];
const REASON: Record<NotCountedReason, string> = {
  provisional: 'Provisional',
  onHold: 'On hold',
  closed: 'Closed',
  cancelled: 'Cancelled',
  teamInactive: 'Team inactive',
  personInactive: 'Inactive',
};

const at = (pct: number) => `${scalePct(pct, SCALE)}%`;
const span = (from: number, to: number) => ({ left: at(from), width: `calc(${at(to)} - ${at(from)})` });

/**
 * An allocation's Allocation %, set against the person's load (§5.4, §9.5): this allocation in Accent, their other
 * counted work on this team and on other teams in two neutral shades, overflow past a ceiling hatched in Warning, and
 * a labelled line per ceiling. Dragged (saved on release), stepped with the arrow keys, Home and End, or typed into
 * once focused (saved on Enter or blur, Esc reverts); the stops and Fill free save on click. While a value is unsaved,
 * another user's change waits (§3). `ref` focuses the bar, for a fix that removes its own button.
 */
export function LoadBar({
  name,
  value,
  model,
  changed = false,
  describedBy,
  onChange,
  ref,
}: {
  /** The person's name, for the accessible names. */
  name: string;
  value: number;
  model: LoadBarModel;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  /** The ids of the row's messages about this value: a failed save, a same-field conflict (§9.9). */
  describedBy?: string;
  onChange: (value: number) => void;
  ref?: Ref<{ focus: () => void }>;
}) {
  const [draft, setDraftState] = useState<number | null>(null);
  /** The draft as of the latest event, for a release that comes before the re-render. */
  const latest = useRef<number | null>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  /** Digits typed since focus or the last commit (§9.5), or null when not typing. */
  const typed = useRef<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => thumb.current?.focus() }), []);
  useHoldWhileEditing(draft !== null);

  const setDraft = (next: number | null) => {
    latest.current = next;
    setDraftState(next);
  };
  const shown = draft ?? value;
  const month = shownLoadMonth(model, shown);
  const onTeam = month?.onTeam ?? 0;
  const otherTeams = month?.otherTeams ?? 0;
  const total = shown + onTeam + otherTeams;
  const reason = model.notCounted && REASON[model.notCounted];
  const fill = freeCapacity(model.months, model)?.pct;
  const showFill = fill !== undefined && fill !== shown;
  const { teamFtePct: fte, capacityPct: cap } = model;

  const commit = (next: number | null) => {
    typed.current = null;
    setDraft(null);
    if (next !== null && next !== value) onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const text = (typed.current ?? '') + e.key;
      if (Number(text) > 100) return; // a digit that would pass 100 is ignored
      typed.current = text;
      setDraft(Number(text));
    } else if (e.key === 'Backspace' && typed.current !== null) {
      e.preventDefault();
      typed.current = typed.current.slice(0, -1);
      setDraft(Number(typed.current || '0'));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(latest.current);
    } else if (e.key === 'Escape') {
      typed.current = null;
      setDraft(null);
    } else {
      typed.current = null;
    }
  };

  const valueText = reason
    ? `${shown}%, ${reason.toLowerCase()}, not counted`
    : month
      ? `${shown}%, total load ${Math.round(total)}%${cap !== undefined ? ` of ${cap}%` : ''}`
      : `${shown}%`;

  // One line when the two ceilings are equal (§5.4); otherwise the lower one's label ends at its line and the higher one's starts there.
  const lines: { pct: number; label: string; end: boolean }[] = [];
  if (fte !== undefined && fte === cap) lines.push({ pct: cap, label: `Capacity and Team FTE ${cap}%`, end: true });
  else {
    if (fte !== undefined) lines.push({ pct: fte, label: `Team FTE ${fte}%`, end: cap === undefined || fte < cap });
    if (cap !== undefined) lines.push({ pct: cap, label: `Capacity ${cap}%`, end: fte !== undefined && cap < fte });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-end gap-3">
        <div className="relative flex-1">
          {/* Ceiling labels, above the bar. */}
          <div className="relative h-4" aria-hidden="true">
            {lines.map((line) => (
              <span
                key={line.label}
                className={cn('absolute top-0 text-label whitespace-nowrap text-text-secondary', line.end ? '-translate-x-full pr-1' : 'pl-1')}
                style={{ left: at(line.pct) }}
              >
                {line.label}
              </span>
            ))}
          </div>
          <div className="relative h-5">
            {/* The drawn bar: segments, overflow and ceiling lines on the 0–150% scale. */}
            <div className="absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-sm bg-surface-subtle" aria-hidden="true">
              <div
                data-testid="load-this"
                className={cn('absolute inset-y-0', reason ? 'rounded-l-sm border-[1.5px] border-dashed border-brand-accent' : 'bg-brand-accent')}
                data-range={`0-${shown}`}
                style={span(0, shown)}
              />
              <div data-testid="load-team" data-range={`${shown}-${shown + onTeam}`} className="absolute inset-y-0 bg-border-input" style={span(shown, shown + onTeam)} />
              <div data-testid="load-other-teams" className="absolute inset-y-0 bg-border-strong" style={span(shown + onTeam, total)} />
              {overflowSpans(model, month, shown).map(([from, to]) => (
                <div
                  key={`${from}-${to}`}
                  data-testid="load-overflow"
                  data-range={`${from}-${to}`}
                  className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--warning)_0_3px,var(--surface-card)_3px_6px)] outline outline-1 -outline-offset-1 outline-warning"
                  style={span(from, to)}
                />
              ))}
            </div>
            {lines.map((line) => (
              <div key={line.label} data-testid="load-ceiling" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-text-primary" style={{ left: at(line.pct) }} aria-hidden="true" />
            ))}
            {total > SCALE && (
              <div data-testid="load-clipped" className="absolute top-1/2 left-full -translate-y-1/2 border-y-[5px] border-l-[5px] border-y-transparent border-l-warning" aria-hidden="true" />
            )}
            {/* The control covers 0–100% of the scale. */}
            <Slider
              className="absolute inset-y-0 left-0 w-2/3"
              bare
              min={0}
              max={100}
              step={5}
              value={[shown]}
              onValueChange={([next]) => setDraft(next)}
              // Keys and typing save on Enter or blur; a drag or a click on the bar saves on release.
              onPointerUp={() => commit(latest.current)}
              thumbProps={{ ref: thumb, 'aria-label': `Allocation % for ${name}`, 'aria-valuetext': valueText, 'aria-describedby': describedBy, onKeyDown, onBlur: () => commit(latest.current) }}
            />
          </div>
        </div>
        <span className={cn('w-12 rounded-sm text-right font-medium tabular-nums transition-colors duration-500 motion-reduce:transition-none', changed && 'bg-met-tint')}>{shown}%</span>
      </div>
      <div className="relative mr-15 h-4">
        {STOPS.map((stop) => (
          <button
            key={stop}
            type="button"
            tabIndex={-1}
            className="absolute top-0 -translate-x-1/2 cursor-pointer border-0 bg-transparent p-0 text-label text-text-secondary tabular-nums hover:text-text-primary"
            style={{ left: at(stop) }}
            aria-label={`Set ${name} to ${stop}%`}
            onClick={() => commit(stop)}
          >
            {stop}
          </button>
        ))}
      </div>
      {(month || reason || showFill) && (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-caption text-text-secondary tabular-nums">
          {reason ? (
            <span>
              {reason}, not counted
              {month && onTeam + otherTeams > 0 && ` · ${Math.round(onTeam + otherTeams)}% elsewhere in ${formatMonth(month.month)}`}
            </span>
          ) : (
            month && (
              <span>
                {Math.round(total)}%{cap !== undefined && ` of ${cap}%`} in {formatMonth(month.month)}
              </span>
            )
          )}
          {showFill && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-brand-accent-text hover:underline"
              aria-label={`Fill free ${fill}% for ${name}`}
              onClick={() => {
                commit(fill);
                // The button goes once the value fills, so focus stays on the row's bar.
                thumb.current?.focus();
              }}
            >
              Fill free {fill}%
            </button>
          )}
        </p>
      )}
    </div>
  );
}
