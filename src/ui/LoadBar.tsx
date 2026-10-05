import { useRef, useState, type KeyboardEvent } from 'react';
import { fillFreePct, shownLoadMonth, type LoadBarModel, type NotCountedReason } from '../data/capacity';
import { formatMonth } from '../data/dates';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/** The bar's scale runs past 100% so overflow shows (§5.4); load past it is clipped with an end mark. */
const SCALE = 150;
const STOPS = [25, 50, 75, 100];
const REASON: Record<NotCountedReason, string> = { Provisional: 'Provisional', 'On hold': 'On hold', 'Team inactive': 'Team inactive', 'Person inactive': 'Inactive' };

const at = (pct: number) => `${(Math.min(Math.max(pct, 0), SCALE) / SCALE) * 100}%`;
const span = (from: number, to: number) => ({ left: at(from), width: `calc(${at(to)} - ${at(from)})` });
const round = (pct: number) => Math.round(pct);

/**
 * An allocation's Allocation %, set against the person's load (§5.4, §9.5): this allocation in Accent, their other
 * counted work on this team and on other teams in two neutral shades, overflow past a ceiling hatched in Warning, and
 * a labelled line per ceiling. Dragged (saved on release), stepped with the arrow keys, Home and End, or typed into
 * once focused (saved on Enter or blur, Esc reverts); the stops and Fill free save on click.
 */
export function LoadBar({
  name,
  value,
  model,
  changed = false,
  onChange,
}: {
  /** The person's name, for the accessible names. */
  name: string;
  value: number;
  model: LoadBarModel;
  /** Another user's change just updated this value (§9.9). */
  changed?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const pointing = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  /** Digits typed since focus or the last commit (§9.5), or null when not typing. */
  const typed = useRef<string | null>(null);

  const shown = draft ?? value;
  const month = shownLoadMonth(model, shown);
  const onTeam = month?.onTeam ?? 0;
  const otherTeams = month?.otherTeams ?? 0;
  const total = shown + onTeam + otherTeams;
  const counted = !model.notCounted;
  const fill = fillFreePct(model);
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
      commit(draft);
    } else if (e.key === 'Escape') {
      typed.current = null;
      setDraft(null);
    } else {
      typed.current = null;
    }
  };

  const valueText = !counted
    ? `${shown}%, ${REASON[model.notCounted!].toLowerCase()}, not counted`
    : month
      ? `${shown}%, total load ${round(total)}%${cap !== undefined ? ` of ${cap}%` : ''}`
      : `${shown}%`;

  // Overflow, hatched (§5.4): this team's stack past Team FTE %, and the whole bar past Capacity %.
  const overflows: [number, number][] = [];
  if (counted && fte !== undefined && shown + onTeam > fte) overflows.push([fte, shown + onTeam]);
  if (counted && cap !== undefined && total > cap) overflows.push([cap, total]);
  // Merged where they overlap, so a stretch past both ceilings is hatched once.
  overflows.sort((a, b) => a[0] - b[0]);
  for (let i = overflows.length - 1; i > 0; i--) {
    if (overflows[i][0] <= overflows[i - 1][1]) overflows.splice(i - 1, 2, [overflows[i - 1][0], Math.max(overflows[i - 1][1], overflows[i][1])]);
  }
  // One line when the two ceilings are equal (§5.4); the lower one's label ends at its line, the higher one's starts there.
  const lines: { pct: number; label: string; end: boolean }[] =
    fte !== undefined && cap !== undefined && fte === cap
      ? [{ pct: cap, label: `Capacity and Team FTE ${cap}%`, end: true }]
      : [
          ...(fte !== undefined ? [{ pct: fte, label: `Team FTE ${fte}%`, end: cap === undefined || fte < cap }] : []),
          ...(cap !== undefined ? [{ pct: cap, label: `Capacity ${cap}%`, end: fte !== undefined && cap < fte }] : []),
        ];

  return (
    <div ref={root} className="flex flex-col gap-0.5">
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
                className={cn('absolute inset-y-0', counted ? 'bg-brand-accent' : 'rounded-l-sm border-[1.5px] border-dashed border-brand-accent')}
                data-range={`0-${shown}`}
                style={span(0, shown)}
              />
              <div data-testid="load-team" data-range={`${shown}-${shown + onTeam}`} className="absolute inset-y-0 bg-border-input" style={span(shown, shown + onTeam)} />
              <div data-testid="load-other-teams" className="absolute inset-y-0 bg-border-strong" style={span(shown + onTeam, total)} />
              {overflows.map(([from, to]) => (
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
              trackClassName="bg-transparent"
              trackChildren={<span />}
              min={0}
              max={100}
              step={5}
              value={[shown]}
              onPointerDown={() => (pointing.current = true)}
              onValueChange={([next]) => setDraft(next)}
              onValueCommit={([next]) => {
                if (!pointing.current) return; // keys and typing save on Enter or blur
                pointing.current = false;
                commit(next);
              }}
              thumbProps={{ 'aria-label': `Allocation % for ${name}`, 'aria-valuetext': valueText, onKeyDown, onBlur: () => commit(draft) }}
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
      {(month || !counted || (fill !== undefined && fill !== shown)) && (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-caption text-text-secondary tabular-nums">
          {!counted ? (
            <span>
              {REASON[model.notCounted!]}, not counted
              {month && onTeam + otherTeams > 0 && ` · ${round(onTeam + otherTeams)}% elsewhere in ${formatMonth(month.month)}`}
            </span>
          ) : (
            month && (
              <span>
                {round(total)}%{cap !== undefined && ` of ${cap}%`} in {formatMonth(month.month)}
              </span>
            )
          )}
          {fill !== undefined && fill !== shown && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-brand-accent-text hover:underline"
              aria-label={`Fill free ${fill}% for ${name}`}
              onClick={() => {
                commit(fill);
                // The button goes once the value fills, so focus stays on the row's bar.
                root.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
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
