import { useBrand } from '../state/BrandContext';
import { formatAmount } from './formatAmount';
import { plural } from './plural';
import { ChevronRightIcon, PhaseIcon } from './icons';
import type { ApprovalTrackDef, GateDef } from '../brand/types';

const cell = 'border-b border-border-default px-3 py-2';

/** "€50,000 – €200,000", or "€200,000 and above" for a track with no upper bound (§5.9). */
function trackBounds(track: ApprovalTrackDef, symbol: string): string {
  return track.upperBound === undefined
    ? `${formatAmount(track.lowerBound, symbol)} and above`
    : `${formatAmount(track.lowerBound, symbol)} – ${formatAmount(track.upperBound, symbol)}`;
}

/** One exit gate: its flags and checklist count, and the items with their descriptions behind a disclosure (§5.9). */
function GateCard({ gate }: { gate: GateDef }) {
  return (
    <details className="group rounded-card bg-surface-card shadow-card px-3 py-2">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon width={16} height={16} className="transition-transform group-open:rotate-90" />
        <strong>{gate.label}</strong>
        <span>{gate.requiresEstimates ? 'Requires estimates' : 'No estimates required'}</span>
        <span aria-hidden="true">·</span>
        <span>{gate.skippable ? 'Can be skipped' : 'Cannot be skipped'}</span>
        <span aria-hidden="true">·</span>
        <span className="text-text-secondary">{plural(gate.checklistItems.length, 'checklist item', 'checklist items')}</span>
      </summary>
      <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-9">
        {gate.checklistItems.map((item) => (
          <li key={item.id}>
            {item.name}
            {item.description && <span className="text-text-secondary"> — {item.description}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Settings' Process section (§5.9): the phases, their exit gates and the approval tracks, as the build defines them. Read-only. */
export function ProcessSection() {
  const brand = useBrand();
  return (
    <section aria-labelledby="process-heading">
      <h2 id="process-heading" className="m-0 mb-4 text-title font-medium">
        Process
      </h2>
      <ol className="m-0 flex list-none flex-col p-0">
        {brand.process.map((phase, index) => (
          <li key={phase.id} className="relative pb-3 pl-11">
            {index < brand.process.length - 1 && <span aria-hidden="true" className="absolute top-9 bottom-0 left-[15px] w-0.5 bg-border-default" />}
            <span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full bg-brand-accent-tint text-brand-accent-text">
              <PhaseIcon name={phase.icon} />
            </span>
            <h3 className="m-0 flex items-center gap-1.5 text-heading font-medium">
              {phase.label}
              {phase.costed && phase.defaultDurationMonths !== undefined && (
                <span className="rounded-full bg-surface-subtle px-2 py-px text-caption font-normal text-text-secondary">
                  {plural(phase.defaultDurationMonths, 'month', 'months')}
                </span>
              )}
            </h3>
            <p className="m-0 mt-0.5 mb-2 text-text-secondary">{phase.description}</p>
            <GateCard gate={phase.exitGate} />
          </li>
        ))}
      </ol>

      <h2 className="mt-6 mb-3 text-title font-medium">Approval tracks</h2>
      <table className="tabular-nums w-full border-collapse overflow-hidden rounded-card bg-surface-card shadow-card text-left">
        <thead>
          <tr className="text-label font-medium text-text-secondary">
            <th className={`${cell} font-medium`}>Name</th>
            <th className={`${cell} font-medium`}>Bounds</th>
            <th className={`${cell} font-medium`}>Requirement</th>
            <th className={`${cell} font-medium`}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {brand.approvalTracks.map((track) => (
            <tr key={track.id}>
              <td className={cell}>
                {track.name} ({track.abbreviation})
              </td>
              <td className={cell}>{trackBounds(track, brand.currencySymbol)}</td>
              <td className={cell}>{track.requirementText}</td>
              <td className={cell}>{track.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
