import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { scalePct } from '../data/keyFigures';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useBarDraft } from './useBarDraft';

/** The smallest a divider leaves a team's segment, so two dividers never sit on each other (§5.6). */
export const MIN_SEGMENT = 5;

export interface SplitSegment {
  /** The membership's id. */
  id: string;
  name: string;
  pct: number;
  /** The team's colour class (§9.8). */
  colorClass: string;
}

/** Each divider's position: the Team FTE %s added up to the end of its team. */
const cumulative = (pcts: number[]) => pcts.map((_, i) => pcts.slice(0, i + 1).reduce((a, b) => a + b, 0));
/** The Team FTE %s back from the dividers' positions. */
const segments = (dividers: number[]) => dividers.map((d, i) => d - (i === 0 ? 0 : dividers[i - 1]));

/**
 * A person's Team FTE %s as one bar of their Capacity % (§5.6, §9.5): a segment per team in its colour, the
 * unclaimed rest hatched. The divider after each team moves Team FTE % to the next team, or, after the last, claims
 * or releases unclaimed capacity up to Capacity %; no segment goes below {@link MIN_SEGMENT}. Dragged (saved on
 * release), stepped with the arrow keys, Home and End, or typed into (the team to the divider's left; saved on Enter
 * or blur, Esc reverts). While a move is unsaved, other users' changes wait (§3). `onMove` gets the changed memberships' new Team FTE %s.
 */
export function SplitBar({
  segments: teams,
  capacityPct,
  disabled = false,
  onMove,
}: {
  segments: SplitSegment[];
  capacityPct: number;
  disabled?: boolean;
  onMove: (changes: { id: string; teamFtePct: number }[]) => void;
}) {
  const saved = cumulative(teams.map((t) => t.pct));
  const { draft, setDraft, commit, typingKeyDown } = useBarDraft<number[]>((next) => {
    const after = segments(next);
    const changes = teams.flatMap((t, i) => (after[i] !== t.pct ? [{ id: t.id, teamFtePct: after[i] }] : []));
    if (changes.length > 0) onMove(changes);
  });
  const dividers = draft ?? saved;
  const pcts = segments(dividers);
  const claimed = dividers.at(-1) ?? 0;
  const scale = Math.max(capacityPct, 1);
  const at = (pct: number) => `${scalePct(pct, scale)}%`;

  /**
   * The range divider `i` can move in: each team it borders keeps at least the minimum. A team already under it (a
   * join or rejoin capped to what was free) is never pushed further under, nor its neighbour pulled past it: the range
   * always takes in where the divider is.
   */
  const limits = (i: number) => {
    const lo = (i === 0 ? 0 : dividers[i - 1]) + MIN_SEGMENT;
    const hi = i === dividers.length - 1 ? capacityPct : dividers[i + 1] - MIN_SEGMENT;
    return { lo: Math.min(lo, dividers[i]), hi: Math.max(hi, dividers[i]) };
  };

  const moveTo = (i: number, value: number) => {
    const { lo, hi } = limits(i);
    const next = [...dividers];
    next[i] = Math.min(hi, Math.max(lo, value));
    setDraft(next);
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent) => {
    if (typingKeyDown(e, (n) => moveTo(i, (i === 0 ? 0 : dividers[i - 1]) + n))) return;
    if (e.key === 'Home' || e.key === 'End') {
      // The divider's own limits, not the bar's ends (§9.5): Radix would refuse a move past a neighbour.
      e.preventDefault();
      const { lo, hi } = limits(i);
      moveTo(i, e.key === 'Home' ? lo : hi);
    }
  };

  /** The divider the current drag or key presses move, from its first change until the pointer goes down again or it loses focus. */
  const active = useRef<number | null>(null);
  /** A pointer is down: Radix moves focus to whichever thumb it drives, which isn't the user leaving the divider. */
  const dragging = useRef(false);
  const onBlur = () => {
    if (dragging.current) return;
    active.current = null;
    commit();
  };
  /** Saves the drag and leaves focus on the divider that moved, for the arrow keys to carry on from. */
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    dragging.current = false;
    const moved = active.current;
    commit();
    if (moved !== null) e.currentTarget.querySelectorAll<HTMLElement>('[role="slider"]')[moved]?.focus();
  };

  /**
   * Radix moves one divider at a time, within the bar, but sorts its values: a divider dragged past another comes back
   * at the other's index, and Radix drives that index from then on. So the move is read as the one value Radix added,
   * applied to the divider that started the move; each team keeps the minimum, so a move past it is held there.
   */
  const onValueChange = (next: number[]) => {
    const added = [...next];
    const gone = dividers.filter((v) => {
      const k = added.indexOf(v);
      if (k >= 0) added.splice(k, 1);
      return k < 0;
    });
    if (added.length !== 1) return;
    active.current ??= dividers.indexOf(gone[0]);
    moveTo(active.current, added[0]);
  };

  const last = teams.length - 1;
  const valueText = (i: number) =>
    i === last
      ? `${teams[i].name} ${pcts[i]}%, ${Math.max(0, capacityPct - claimed)}% unclaimed`
      : `${teams[i].name} ${pcts[i]}%, ${teams[i + 1].name} ${pcts[i + 1]}%`;

  return (
    <div className="relative h-7">
      {/* The drawn bar: a segment per team, the unclaimed rest hatched. */}
      <div className="absolute inset-0 flex overflow-hidden rounded-md border border-border-default" aria-hidden="true">
        {teams.map((t, i) => (
          <div key={t.id} data-testid="split-segment" data-pct={pcts[i]} className={cn('h-full', t.colorClass)} style={{ width: at(pcts[i]) }} />
        ))}
        {claimed < capacityPct && (
          <div
            data-testid="split-unclaimed"
            data-pct={capacityPct - claimed}
            className="h-full flex-1 bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_3px,var(--surface-card)_3px_7px)]"
          />
        )}
      </div>
      {teams.length > 0 && (
        <Slider
          className="absolute inset-0"
          bare
          min={0}
          max={scale}
          step={MIN_SEGMENT}
          disabled={disabled}
          value={dividers}
          onValueChange={onValueChange}
          // Keys and typing save on Enter or blur; a drag or a click on the bar saves on release.
          onPointerDown={() => {
            active.current = null;
            dragging.current = true;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          thumbsProps={teams.map((t, i) => ({
            className: 'h-8',
            'aria-label': i === last ? `Divider after ${t.name}` : `Divider between ${t.name} and ${teams[i + 1].name}`,
            'aria-valuetext': valueText(i),
            onKeyDown: onKeyDown(i),
            onBlur,
          }))}
        />
      )}
    </div>
  );
}
