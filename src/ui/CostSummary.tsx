import { grandDeviation, grandEstimate, phaseEffectiveTotal } from '../data/cost';
import { lastCostedPassedGate } from '../data/gate';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { CopyButton } from './CopyButton';
import type { CopyTableData } from './copyTable';
import { formatAmount } from './formatAmount';

/** `+€9,200` / `−€1,300` / `€0`: a difference or deviation reads its sign, an amount on its own never does. */
function formatSigned(value: number, currencySymbol: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatAmount(Math.abs(value), currencySymbol)}`;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`font-medium tabular-nums ${warn ? 'text-warning-text' : ''}`}>{value}</span>
    </div>
  );
}

/** The initiative's cost summary (§5.4): the grand estimate, what it was last approved at, the difference, and the deviation of actuals from estimate. */
export function CostSummary({ initiative }: { initiative: Initiative }) {
  const { process, currencySymbol } = useBrand();
  const { people, roles, countries } = useRepositoryState();
  const data = { roles, countries };

  const costedPhases = process.filter((p) => p.costed);
  if (costedPhases.length === 0) return null;

  const estimate = grandEstimate(initiative, process, people, data);
  const approved = lastCostedPassedGate(process, initiative);
  const approvedFigure = approved?.record.recordedGrandEstimate;
  const deviation = grandDeviation(initiative, process, people, data);
  const difference = approvedFigure === undefined ? 0 : estimate - approvedFigure;

  const getData = (): CopyTableData => {
    const rows = [['Grand estimate', formatAmount(estimate, currencySymbol)]];
    if (approvedFigure !== undefined) {
      rows.push([`Approved at (${approved!.phase.exitGate.label})`, formatAmount(approvedFigure, currencySymbol)]);
      rows.push(['Difference', formatSigned(difference, currencySymbol)]);
    }
    rows.push(['Deviation', formatSigned(deviation, currencySymbol)]);
    for (const phase of costedPhases) {
      rows.push([phase.label, formatAmount(phaseEffectiveTotal(initiative, phase.id, people, data), currencySymbol)]);
    }
    return { headers: ['Metric', 'Amount'], rows };
  };

  return (
    <section id="cost-summary-section" aria-labelledby="cost-summary-heading" className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border-default bg-surface-card px-4 py-3 text-sm">
      <h2 id="cost-summary-heading" className="sr-only">
        Cost summary
      </h2>
      <Stat label="Grand estimate" value={formatAmount(estimate, currencySymbol)} />
      {approvedFigure !== undefined && (
        <>
          <Stat label={`Approved at (${approved!.phase.exitGate.label})`} value={formatAmount(approvedFigure, currencySymbol)} />
          <Stat label="Difference" value={formatSigned(difference, currencySymbol)} />
        </>
      )}
      <Stat label="Deviation" value={formatSigned(deviation, currencySymbol)} warn={deviation > 0} />
      <CopyButton getData={getData} noun={['line', 'lines']} label="Copy cost summary" />
    </section>
  );
}
