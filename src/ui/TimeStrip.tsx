import { useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { formatPeriod, localToday } from '../data/dates';
import { stripMonthLabel, timeStrip, type StripPhase, type TimeStrip as Strip } from '../data/timeStrip';
import type { Initiative } from '../data/types';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAmount, formatCompactAmount } from './formatAmount';
import { CheckIcon } from './icons';
import { useJump } from './jumpTo';

// Filled for a dated phase: past neutral, current Accent, future outlined (§5.4).
const AXIS_CLASS = {
  done: 'border-border-strong bg-surface-subtle text-text-secondary',
  current: 'border-brand-accent bg-brand-accent text-text-on-accent',
  ahead: 'border-border-input bg-surface-card text-text-primary',
} as const;
// Hatched and dashed for a phase without a period, the current one in Accent.
const HATCH = 'border-dashed bg-[repeating-linear-gradient(135deg,var(--surface-subtle)_0_5px,var(--surface-card)_5px_10px)]';
export const BLOCK_CLASS = {
  done: `${HATCH} border-border-strong text-text-secondary`,
  current: 'border-dashed border-brand-accent bg-[repeating-linear-gradient(135deg,var(--accent-tint)_0_5px,var(--surface-card)_5px_10px)] text-brand-accent-text',
  ahead: `${HATCH} border-border-input text-text-primary`,
} as const;
export const BLOCK_TEXT = { 'not-costed': 'Not costed', 'no-period': 'No period yet' } as const;

/**
 * The initiative header's time strip (§5.4): each phase over time, dated phases on one month axis and the others as
 * hatched blocks at their place in phase order, with Today marked. Selecting a segment goes to that phase's row.
 */
export function TimeStrip({ initiative }: { initiative: Initiative }) {
  const { process, currencySymbol } = useBrand();
  const { people, roles, countries } = useRepositoryState();
  const today = localToday();
  const strip = useMemo(() => timeStrip(initiative, process, people, { roles, countries }, today), [initiative, process, people, roles, countries, today]);
  const jump = useJump();
  const blocksOnly = strip.axis.length === 0;

  const describe = ({ phase, state, placement, cost }: StripPhase) =>
    [
      phase.label,
      state,
      ...(placement.kind === 'axis' ? [formatPeriod(placement.start, placement.end), formatAmount(cost ?? 0, currencySymbol)] : [BLOCK_TEXT[placement.kind].toLowerCase()]),
    ].join(', ');

  const segment = (p: StripPhase, className: string, style?: CSSProperties) => {
    const label = describe(p);
    return (
      <Tooltip key={p.phase.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            style={style}
            className={cn(
              'flex h-12 min-w-0 cursor-pointer flex-col justify-center overflow-hidden rounded-md border px-2 text-left',
              p.placement.kind === 'axis' ? AXIS_CLASS[p.state] : BLOCK_CLASS[p.state],
              className,
            )}
            onClick={() => jump({ id: `phase-row-${p.phase.id}`, phaseId: p.phase.costed ? p.phase.id : undefined })}
          >
            <span className="flex min-w-0 items-center gap-1 text-caption font-medium">
              {p.state === 'done' && <CheckIcon width={14} height={14} className="shrink-0" />}
              <span className="truncate">{p.phase.label}</span>
            </span>
            <span className="truncate text-label">
              {p.placement.kind === 'axis' ? formatCompactAmount(p.cost ?? 0, currencySymbol) : BLOCK_TEXT[p.placement.kind]}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };

  // A phase without a period, outside the axis: a fixed width beside it, or an equal share when there is no axis.
  const block = (p: StripPhase) => (
    <div key={p.phase.id} className={cn('relative py-5', blocksOnly ? 'min-w-0 flex-1' : 'w-28 shrink-0')}>
      {strip.today.at === 'block' && strip.today.phaseId === p.phase.id && <TodayLine className="left-1/2" />}
      {segment(p, 'w-full')}
    </div>
  );

  return (
    <div role="group" aria-label="Phases over time" className="mb-4 flex gap-1">
      {strip.before.map(block)}
      {!blocksOnly && (
        <div className="relative min-w-0 flex-1 py-5">
          <div className="relative h-12">
            {strip.axis.map((p) => segment(p, 'absolute inset-y-0', { left: pct(p.placement.left), width: pct(p.placement.width) }))}
          </div>
          <MonthLabels months={strip.months} />
          <AxisToday today={strip.today} />
        </div>
      )}
      {strip.after.map(block)}
    </div>
  );
}

const pct = (fraction: number) => `${fraction * 100}%`;

/** Today: a line through the strip with its label above, centred on where it falls. */
function TodayLine({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute top-0 z-10 flex h-[4.25rem] -translate-x-1/2 flex-col items-center', className)} style={style}>
      <span className="text-label font-medium leading-5 text-text-primary">Today</span>
      <span className="w-0.5 flex-1 bg-text-primary" />
    </div>
  );
}

/** Today on the axis, or past an end of it ("Today ›" once every period has passed). */
function AxisToday({ today }: { today: Strip['today'] }) {
  if (today.at === 'axis') return <TodayLine style={{ left: pct(today.position) }} />;
  if (today.at === 'block') return null;
  return (
    <span aria-hidden="true" className={cn('absolute top-0 text-label font-medium leading-5 text-text-primary', today.at === 'after' ? 'right-0' : 'left-0')}>
      {today.at === 'after' ? 'Today ›' : '‹ Today'}
    </span>
  );
}

/** A tick at each month's start, labelled — every month while they fit, else every second or third, the year on the first label of each year. */
function MonthLabels({ months }: { months: Strip['months'] }) {
  const step = Math.ceil(months.length / 12);
  let labelledYear = '';
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-5">
      {months.map(({ key, left }, i) => {
        const labelled = i % step === 0;
        const year = key.slice(0, 4);
        const label = labelled ? stripMonthLabel(key, year !== labelledYear) : '';
        if (labelled) labelledYear = year;
        return (
          <span key={key} className="absolute top-0 h-full whitespace-nowrap border-l border-border-default pl-1 text-label leading-5 text-text-muted" style={{ left: pct(left) }}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
