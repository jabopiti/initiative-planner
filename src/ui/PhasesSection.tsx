import { useState } from 'react';
import { toast } from 'sonner';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import type { PhaseDef } from '../brand/types';
import { allocationFigures, phaseTotal } from '../data/cost';
import { formatDate, formatPeriod } from '../data/dates';
import { roleLabel } from '../data/roleLabel';
import { activeMembers } from '../data/teamMembers';
import type { Initiative, Team } from '../data/types';
import { DateInput } from './DateInput';
import { formatAmount } from './formatAmount';
import { ChevronDownIcon, ChevronRightIcon, InfoIcon, PlusIcon, RemoveIcon, WarningIcon } from './icons';
import { InlineWarning } from './InlineWarning';
import { PercentInput } from './PercentInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** The initiative page's Phases section (§5.4): every phase in order, costed ones expandable. */
export function PhasesSection({ initiative, team }: { initiative: Initiative; team: Team | undefined }) {
  const { process } = useBrand();
  // The first costed phase opens by default; the others are one line until clicked.
  const costedPhases = process.filter((p) => p.costed);
  const [open, setOpen] = useState<Set<string>>(() => new Set(costedPhases.slice(0, 1).map((p) => p.id)));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // One next step at a time: the first costed phase still missing its period or its people.
  const isPlanned = (phase: PhaseDef) => {
    const plan = initiative.phases?.[phase.id];
    return Boolean(plan?.startDate && plan.endDate && plan.startDate <= plan.endDate) && plan!.allocations.length > 0;
  };
  const nextStepId = costedPhases.find((p) => !isPlanned(p))?.id;

  return (
    <section aria-labelledby="phases-heading">
      <h2 id="phases-heading" className="m-0 mb-3 text-lg">
        Phases
      </h2>
      {initiative.defaultPlan && (
        <p
          className="m-0 mb-3 flex items-start gap-2 rounded-md border border-brand-accent bg-brand-accent-tint p-3 text-sm text-brand-accent-text"
          data-testid="suggested-dates-note"
        >
          <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
          Suggested dates, starting today. Adjust them, then add people to see the cost.
        </p>
      )}
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {process.map((phase) => (
          <li key={phase.id} className="rounded-lg border border-border-default bg-surface-card">
            {phase.costed ? (
              <CostedPhase
                phase={phase}
                previous={costedPhases[costedPhases.indexOf(phase) - 1]}
                isNextStep={phase.id === nextStepId}
                initiative={initiative}
                team={team}
                expanded={open.has(phase.id)}
                onToggle={() => toggle(phase.id)}
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="font-medium">{phase.label}</span>
                <span className="text-text-muted">· not costed</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CostedPhase({
  phase,
  previous,
  isNextStep,
  initiative,
  team,
  expanded,
  onToggle,
}: {
  phase: PhaseDef;
  /** The costed phase before this one, for the overlap warning. */
  previous: PhaseDef | undefined;
  /** This is the phase whose missing period or people is the highlighted next step. */
  isNextStep: boolean;
  initiative: Initiative;
  team: Team | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const repository = useRepository();
  const { currencySymbol } = useBrand();
  const { people, roles, countries, memberships } = useRepositoryState();
  const [refusal, setRefusal] = useState<string | null>(null);

  const plan = initiative.phases?.[phase.id] ?? { allocations: [] };
  const rateData = { roles, countries };
  const hasPeriod = Boolean(plan.startDate && plan.endDate);
  const inverted = hasPeriod && plan.endDate! < plan.startDate!;
  const costed = hasPeriod && !inverted;
  // The next missing thing is highlighted, in one phase only: the period first, then the people.
  const needsPeriod = isNextStep && !hasPeriod;
  const needsPeople = isNextStep && hasPeriod && plan.allocations.length === 0;
  const previousEnd = previous && initiative.phases?.[previous.id]?.endDate;
  const overlap = previous && previousEnd && plan.startDate && plan.startDate <= previousEnd ? `Starts before ${previous.label} ends (${formatDate(previousEnd)}). The two phases overlap.` : null;
  const total = phaseTotal(plan, people, rateData);

  const teamMembers = team ? activeMembers(team.id, memberships, people) : [];
  const addable = teamMembers.filter((p) => !plan.allocations.some((a) => a.personId === p.id));

  const picker =
    team && teamMembers.length === 0 ? (
      <p className="m-0 text-sm text-text-secondary">
        {team.name} has no active members yet. Add people on <a href={`#/teams/${team.id}`}>the team&apos;s page</a>.
      </p>
    ) : addable.length > 0 ? (
      <div className="flex items-center gap-2">
        <PlusIcon width={16} height={16} className={needsPeople ? 'text-brand-accent-text' : 'text-text-secondary'} />
        <Select
          value=""
          onValueChange={(personId) => {
            const result = repository.addAllocation(initiative.id, phase.id, personId);
            setRefusal(result.ok ? null : result.reason);
          }}
        >
          <SelectTrigger
            className={`w-64 ${needsPeople ? 'border-brand-accent bg-surface-card font-medium text-brand-accent-text' : ''}`}
            aria-label={`Add person to ${phase.label}`}
          >
            <SelectValue placeholder="Add person" />
          </SelectTrigger>
          <SelectContent>
            {addable.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {roleLabel(p, roles)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const bodyId = `phase-${phase.id}`;

  return (
    <>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-sm text-text-primary"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <Chevron width={16} height={16} className="shrink-0 text-text-secondary" />
        <span className="font-medium">{phase.label}</span>
        {hasPeriod ? (
          <span className="text-text-secondary">{formatPeriod(plan.startDate!, plan.endDate!)}</span>
        ) : (
          <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>Set period</span>
        )}
        {overlap && <WarningIcon width={16} height={16} className="shrink-0 text-warning-text" role="img" aria-hidden={false} aria-label={`Overlaps ${previous!.label}`} />}
        {plan.allocations.length === 0 && (
          <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>· Add people</span>
        )}
        <span className="ml-auto font-medium tabular-nums">
          {costed && plan.allocations.length > 0 ? formatAmount(total, currencySymbol) : '—'}
        </span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary">Estimate</span>
      </button>

      {expanded && (
        <div id={bodyId} className="flex flex-col gap-4 border-t border-border-default px-3 py-3">
          <div
            className={`flex flex-col gap-2 rounded-md ${needsPeriod ? 'border border-brand-accent bg-brand-accent-tint p-3' : ''}`}
            data-highlight={needsPeriod || undefined}
          >
            {needsPeriod && <p className="m-0 text-sm font-medium text-brand-accent-text">Set the period to calculate cost.</p>}
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Start date</span>
                <DateInput
                  label={`${phase.label} start date`}
                  value={plan.startDate}
                  highlight={needsPeriod}
                  onChange={(v) => repository.setPhaseDate(initiative.id, phase.id, 'startDate', v)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">End date</span>
                <DateInput
                  label={`${phase.label} end date`}
                  value={plan.endDate}
                  openOn={plan.startDate}
                  highlight={needsPeriod}
                  onChange={(v) => repository.setPhaseDate(initiative.id, phase.id, 'endDate', v)}
                />
              </div>
            </div>
          </div>
          {overlap && (
            <InlineWarning>{overlap}</InlineWarning>
          )}
          {inverted && (
            <InlineWarning>The end date is before the start date, so this phase isn&apos;t costed yet.</InlineWarning>
          )}

          {plan.allocations.length === 0 ? (
            <div
              className={`flex flex-col items-start gap-2 rounded-md border border-dashed p-3 ${needsPeople ? 'border-brand-accent bg-brand-accent-tint' : 'border-border-strong'}`}
              data-highlight={needsPeople || undefined}
            >
              <p className={`m-0 text-sm ${needsPeople ? 'font-medium text-brand-accent-text' : 'text-text-secondary'}`}>
                Who works on {phase.label}? Add a team member to see this phase&apos;s cost.
              </p>
              {picker}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{phase.label} allocations</caption>
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th className="py-1 pr-2 font-medium">Person</th>
                  <th className="py-1 pr-2 font-medium">Allocation %</th>
                  <th className="py-1 pr-2 text-right font-medium">Days</th>
                  <th className="py-1 pr-2 text-right font-medium">Cost</th>
                  <th className="w-8 py-1">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.allocations.map((allocation) => {
                  const person = people.find((p) => p.id === allocation.personId);
                  const figures = person ? allocationFigures(plan, person, allocation.allocationPct, rateData) : null;
                  const name = person?.name ?? 'Unknown person';
                  return (
                    <tr key={allocation.id} className="border-t border-border-default">
                      <td className="py-1.5 pr-2">
                        <div>{name}</div>
                        {person && <div className="text-xs text-text-muted">{roleLabel(person, roles)}</div>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <PercentInput
                          label={`Allocation % for ${name}`}
                          value={allocation.allocationPct}
                          onChange={(pct) => repository.updateAllocation(initiative.id, phase.id, allocation.id, pct)}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{costed && figures ? figures.personDays.toFixed(1) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {costed && figures ? formatAmount(figures.cost, currencySymbol) : '—'}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${name} from ${phase.label}`}
                          onClick={() => {
                            const removed = repository.removeAllocation(initiative.id, phase.id, allocation.id);
                            if (!removed) return;
                            toast('Removed.', {
                              duration: 10_000,
                              action: {
                                label: 'Undo',
                                onClick: () => repository.restoreAllocation(initiative.id, phase.id, removed.allocation, removed.index),
                              },
                            });
                          }}
                        >
                          <RemoveIcon />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {plan.allocations.length > 0 && picker}
          {team && teamMembers.length > 0 && <p className="m-0 text-xs text-text-muted">Only members of {team.name} can be allocated.</p>}
          {refusal && (
            <p className="m-0 text-sm text-warning-text" role="alert">
              {refusal}
            </p>
          )}
        </div>
      )}
    </>
  );
}
