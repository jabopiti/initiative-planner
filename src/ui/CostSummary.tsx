import type { ReactNode } from 'react';
import { grandDeviation, grandEstimate, hasValidPeriod, phaseEffectiveTotal, resolveApprovalTrack } from '../data/cost';
import { formatPeriod } from '../data/dates';
import { currentPhaseId, gateBlockers, gateProgress, gateProgressText, gateRequirements, lastCostedPassedGate } from '../data/gate';
import { escalation, recordedActuals } from '../data/keyFigures';
import { plural } from '../data/plural';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import type { KeyFigureSnapshot } from '../data/seen';
import type { Initiative } from '../data/types';
import { BulletBar } from './BulletBar';
import { CopyButton } from './CopyButton';
import type { CopyTableData } from './copyTable';
import { formatAmount, formatSignedAmount } from './formatAmount';
import { cardClass, ghostCardClass } from './cardClass';
import { cn } from '@/lib/utils';
import { PhaseIcon } from './icons';
import { TruncatedText } from './TruncatedText';
import { RolledFigure } from './motion';

/** A key figure's tile (§5.4): its label (with an action at the right, if any), the figure, and what's beneath it. `ghost` for a greyed preview's. */
export function Tile({ label, action, ghost = false, children }: { label: string; action?: ReactNode; ghost?: boolean; children: ReactNode }) {
  return (
    <div className={cn(ghost ? ghostCardClass : cardClass, 'flex min-w-0 flex-1 flex-col px-3.5 py-3')}>
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="text-label text-text-secondary">{label}</span>
        {action && <div className="-mr-1.5 flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** The figure itself, display size. */
export function Figure({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-1.5 min-w-0 text-display tabular-nums break-words ${className}`}>{children}</div>;
}

/**
 * A key figure's previous value, struck through before the new one until the page is left (§9.9); screen readers get
 * "was <value>". Without a previous value, just the figure.
 */
function WithPrevious({ previous, children }: { previous: string | undefined; children: ReactNode }) {
  if (previous === undefined) return children;
  return (
    <>
      <s className="mr-2 text-body font-normal text-text-muted" aria-hidden="true">
        {previous}
      </s>
      <span className="sr-only">was {previous}, now </span>
      {children}
    </>
  );
}

/** A key figure that rolls to a new value and tints briefly (slice 059), as a block so a long figure wraps in its tile. */
const Rolled = (props: { value: number; format: (n: number) => string; inline?: boolean }) => (
  <RolledFigure value={props.value} format={props.format} className={props.inline ? '-mx-1' : '-mx-1 block'} />
);

const Sub = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('m-0 mt-1 text-caption tabular-nums text-text-secondary', className)}>{children}</p>
);

/**
 * The initiative's cost summary as four key figures under the header (§5.4): Grand estimate (with its bullet bar, and
 * what it was last approved at once a costed gate has passed), Deviation, the current phase with its period, and the
 * current gate's "X of Y complete". Figures roll to a new value and tint briefly (slice 059). Copy sits in the Grand
 * estimate tile and copies the cost summary and the phase costs (§9.2). With no costed phase in the process, only the
 * phase and gate tiles show.
 */
export function CostSummary({ initiative, previous = {} }: { initiative: Initiative; previous?: Partial<KeyFigureSnapshot> }) {
  const { process, currencySymbol, approvalTracks } = useBrand();
  const { people, roles, countries } = useRepositoryState();
  const data = { roles, countries };

  const costedPhases = process.filter((p) => p.costed);
  const estimate = grandEstimate(initiative, process, people, data);
  const approved = lastCostedPassedGate(process, initiative);
  const approvedFigure = approved?.record.recordedGrandEstimate;
  const deviation = grandDeviation(initiative, process, people, data);
  const difference = approvedFigure === undefined ? 0 : estimate - approvedFigure;
  const escalated = escalation(initiative, process, resolveApprovalTrack(approvalTracks, estimate)) !== null;
  const actuals = recordedActuals(initiative, process);

  const phase = process.find((p) => p.id === currentPhaseId(initiative, process))!;
  const plan = initiative.phases?.[phase.id];
  const closed = initiative.status === 'Closed';
  const requirements = gateRequirements(process, initiative, phase.id);
  const progress = gateProgress(requirements);
  const open = gateBlockers(requirements).length;

  const getData = (): CopyTableData => {
    const rows = [['Grand estimate', formatAmount(estimate, currencySymbol)]];
    if (approvedFigure !== undefined) {
      rows.push([`Approved at (${approved!.phase.exitGate.label})`, formatAmount(approvedFigure, currencySymbol)]);
      rows.push(['Difference', formatSignedAmount(difference, currencySymbol)]);
    }
    rows.push(['Deviation', formatSignedAmount(deviation, currencySymbol)]);
    for (const p of costedPhases) {
      rows.push([p.label, formatAmount(phaseEffectiveTotal(initiative, p.id, people, data), currencySymbol)]);
    }
    return { headers: ['Metric', 'Amount'], rows, numericColumns: [1] };
  };

  const gateLabel = approved?.phase.exitGate.label;
  const deviationSub =
    actuals.months === 0 ? 'No actuals recorded yet' : `${deviation > 0 ? 'Over estimate' : deviation < 0 ? 'Under estimate' : 'On estimate'} · ${plural(actuals.months, 'month', 'months')} recorded`;
  const finalGate = process[process.length - 1].exitGate.label;

  return (
    <section id="cost-summary-section" aria-labelledby="cost-summary-heading" className="mb-6 flex gap-3">
      <h2 id="cost-summary-heading" className="sr-only">
        Cost summary
      </h2>
      {costedPhases.length > 0 && (
        <>
          <Tile label="Grand estimate" action={<CopyButton getData={getData} noun={['line', 'lines']} iconLabel="Copy cost summary" />}>
            <Figure>
              <WithPrevious previous={previous.estimate === undefined ? undefined : formatAmount(previous.estimate, currencySymbol)}>
                <Rolled inline={previous.estimate !== undefined} value={estimate} format={(n) => formatAmount(n, currencySymbol)} />
              </WithPrevious>
            </Figure>
            <BulletBar
              size="tile"
              estimate={estimate}
              approved={approvedFigure}
              actuals={actuals.total}
              escalated={escalated}
              label={[
                `${formatAmount(estimate, currencySymbol)} against the approval tracks`,
                approvedFigure !== undefined && `approved at ${formatAmount(approvedFigure, currencySymbol)}`,
                actuals.total > 0 && `${formatAmount(actuals.total, currencySymbol)} actuals recorded`,
              ]
                .filter(Boolean)
                .join(', ')}
            />
            {approvedFigure !== undefined && (
              <>
                <Sub className="mt-2">
                  Approved at {gateLabel}: {formatAmount(approvedFigure, currencySymbol)}
                </Sub>
                <Sub className={escalated ? 'text-warning-text' : undefined}>
                  {difference === 0 ? `Unchanged since ${gateLabel}` : `${formatSignedAmount(difference, currencySymbol)} since ${gateLabel}`}
                </Sub>
              </>
            )}
          </Tile>
          <Tile label="Deviation">
            <Figure className={deviation > 0 ? 'text-warning-text' : ''}>
              <WithPrevious previous={previous.deviation === undefined ? undefined : formatSignedAmount(previous.deviation, currencySymbol)}>
                <Rolled inline={previous.deviation !== undefined} value={deviation} format={(n) => formatSignedAmount(n, currencySymbol)} />
              </WithPrevious>
            </Figure>
            <Sub>{deviationSub}</Sub>
          </Tile>
        </>
      )}
      <Tile label="Current phase">
        {closed ? (
          <>
            <Figure>
              <WithPrevious previous={previous.phase}>Closed</WithPrevious>
            </Figure>
            <Sub>after {finalGate}</Sub>
          </>
        ) : (
          <>
            <Figure className="flex flex-wrap items-center">
              <WithPrevious previous={previous.phase}>
                {/* A long phase name is cut with an ellipsis, in full in its tooltip (§9.11), rather than overflowing the tile. */}
                <span className="flex min-w-0 items-center gap-1.5">
                  <PhaseIcon name={phase.icon} width={18} height={18} aria-hidden="true" className="shrink-0" />
                  <TruncatedText text={phase.label} className="min-w-0" />
                </span>
              </WithPrevious>
            </Figure>
            <Sub>{plan && hasValidPeriod(plan) ? formatPeriod(plan.startDate!, plan.endDate!) : 'No period yet'}</Sub>
          </>
        )}
      </Tile>
      {closed ? (
        <Tile label="Gates">
          <Figure>
            <WithPrevious previous={previous.gate}>All passed</WithPrevious>
          </Figure>
          <Sub>
            {process[0].exitGate.label} – {finalGate}
          </Sub>
        </Tile>
      ) : (
        <Tile label={`Gate ${phase.exitGate.label}`}>
          {requirements.length === 0 ? (
            <Figure>
              <WithPrevious previous={previous.gate}>Nothing to check</WithPrevious>
            </Figure>
          ) : (
            <>
              <Figure>
                <WithPrevious previous={previous.gate}>
                  <Rolled inline={previous.gate !== undefined} value={progress.complete} format={(complete) => gateProgressText({ ...progress, complete })} />
                </WithPrevious>
              </Figure>
              <Sub>{open === 0 ? 'Ready to pass' : `${open} open`}</Sub>
            </>
          )}
        </Tile>
      )}
    </section>
  );
}
