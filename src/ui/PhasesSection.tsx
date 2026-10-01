import { useMemo, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState, type FieldFailure } from '../state/DataContext';
import type { PhaseDef } from '../brand/types';
import { activeLoads, allocationWarnings, raiseFix, reduceFix, type Load } from '../data/capacity';
import { actualOrEstimate, allocationFigures } from '../data/cost';
import { RaiseFixButton, ReduceFixButton } from './CapacityFixButtons';
import { formatDate, formatMonth, formatMonthRanges, formatPeriod, localToday } from '../data/dates';
import { allocationsWithCost, currentPhaseId } from '../data/gate';
import { isInitiativeFrozen, isPhaseFrozen } from '../data/frozen';
import { allocatablePeople } from '../data/personLoad';
import { nextStepPhase, overlapWithPrevious, phaseSummary, planningGap } from '../data/phaseSummary';
import { roleLabel } from '../data/roleLabel';
import { FILE_PATHS, type FrozenAllocation, type FrozenPhaseSnapshot, type Initiative, type PhasePlan, type Person, type Role, type Team } from '../data/types';
import { AmountInput } from './AmountInput';
import { CostItemsTable } from './CostItemsTable';
import { TIMING_LABELS } from './costItemTiming';
import { DateInput } from './DateInput';
import { formatAmount } from './formatAmount';
import { GateChecklistPanel } from './GateChecklistPanel';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FrozenIcon, InfoIcon, SkippedIcon, OverCapacityIcon, OverTeamFteIcon, PlusIcon, RemoveIcon, WarningIcon } from './icons';
import { InlineWarning } from './InlineWarning';
import { PercentInput } from './PercentInput';
import { undoToast } from './undoToast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

/** A phase nobody has planned yet. One shared object, so the picker's memo isn't invalidated on every render. */
const UNPLANNED: PhasePlan = { allocations: [] };

/** A phase's actuals-table row anchor (§5.2, §8.5), for the Portfolio's Needs attention strip jumping to an Overdue month. */
export const actualCellAnchor = (phaseId: string, month: string) => `actual-${phaseId}-${month}`;

/** The initiative page's Phases section (§5.4): every phase in order, costed ones expandable, with the current phase's Gate / Checklist panel directly beneath it. */
export function PhasesSection({ initiative, team, openPhaseId }: { initiative: Initiative; team: Team | undefined; openPhaseId?: string | null }) {
  const { process } = useBrand();
  const { initiatives, teams } = useRepositoryState();
  // One portfolio-wide pass for every allocation row of every phase (§5.4 warnings).
  const today = localToday();
  const loads = useMemo(() => activeLoads({ initiatives, teams, process, today }), [initiatives, teams, process, today]);
  // The first costed phase opens by default; the others are one line until clicked. Unaffected by which phase
  // is current: a phase ahead stays plannable before its own gate is reached (§5.4 "Guided, not gatekept").
  const costedPhases = process.filter((p) => p.costed);
  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = new Set(costedPhases.slice(0, 1).map((p) => p.id));
    // A Needs attention deep link into a collapsed phase's actuals table (§8.5 Overdue) opens it on arrival.
    if (openPhaseId) initial.add(openPhaseId);
    return initial;
  });
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // One next step at a time: the first costed phase still missing its period or its people. None on a frozen initiative (§8.4).
  const initiativeFrozen = isInitiativeFrozen(initiative);
  const nextStepId = initiativeFrozen ? undefined : nextStepPhase(initiative, process)?.id;
  const currentId = currentPhaseId(initiative, process);

  return (
    <section aria-labelledby="phases-heading">
      <h2 id="phases-heading" className="m-0 mb-3 text-lg">
        Phases
      </h2>
      {initiative.defaultPlan && !initiativeFrozen && (
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
          <li key={phase.id} id={`phase-row-${phase.id}`} className="rounded-lg border border-border-default bg-surface-card">
            {phase.costed ? (
              <CostedPhase
                phase={phase}
                previous={costedPhases[costedPhases.indexOf(phase) - 1]}
                isNextStep={phase.id === nextStepId}
                initiative={initiative}
                team={team}
                loads={loads}
                today={today}
                expanded={open.has(phase.id)}
                onToggle={() => toggle(phase.id)}
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                {isPhaseFrozen(initiative, phase.id) && <FrozenIcon width={16} height={16} className="shrink-0 text-text-secondary" />}
                {skipReason(initiative, phase.id) !== undefined && <SkippedMarker />}
                <span className="font-medium">{phase.label}</span>
                <span className="text-text-muted">· not costed</span>
                <SkippedLabel initiative={initiative} phase={phase} withReason />
              </div>
            )}
          </li>
        ))}
      </ol>
      {process
        .filter((phase) => phase.id === currentId)
        .map((phase) => (
          <div key={phase.id} className="mt-2">
            <GateChecklistPanel initiative={initiative} phase={phase} />
          </div>
        ))}
    </section>
  );
}

function CostedPhase({
  phase,
  previous,
  isNextStep,
  initiative,
  team,
  loads,
  today,
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
  /** Every Active allocation of the portfolio, for the capacity warnings on the rows. */
  loads: Load[];
  today: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const file = FILE_PATHS.initiative(initiative.id);
  const { currencySymbol, process } = useBrand();
  const { people, roles, countries, memberships, initiatives, teams } = useRepositoryState();
  const [refusal, setRefusal] = useState<string | null>(null);

  const plan = initiative.phases?.[phase.id] ?? UNPLANNED;
  const rateData = { roles, countries };
  // A Closed or Cancelled initiative shows every phase read-only (§8.4); its actuals stay recordable.
  const initiativeFrozen = isInitiativeFrozen(initiative);
  // A phase whose own gate passed shows its frozen snapshot: locked, and immune to a later master-data change (§8.1).
  const { hasPeriod, inverted, costed, frozen, snapshot, estimateByMonth, total, hasCost, coverage, months } = phaseSummary(initiative, phase.id, plan, people, rateData);
  // The next missing thing is highlighted, in one phase only: the period first, then the people.
  const gap = isNextStep ? planningGap(plan) : null;
  const needsPeriod = gap === 'period';
  const needsPeople = gap === 'people';
  const overlapEnd = previous ? overlapWithPrevious(initiative.phases?.[previous.id], plan) : null;
  const overlap = previous && overlapEnd ? `Starts before ${previous.label} ends (${formatDate(overlapEnd)}). The two phases overlap.` : null;
  // A phase behind a skipped gate stays editable, and says so with its reason (§8.2).
  const skipped = skipReason(initiative, phase.id);
  const coverageLabel = { frozen: 'Frozen', actual: 'Actual', forecast: 'Forecast', estimate: 'Estimate' }[coverage];

  // Who can still be added, and what each has free for the phase's months (§5.11), most free first. Free capacity
  // is undefined without a valid period (the list is then by name) and while the phase is closed: only the open
  // phase's picker shows it. It rescans every initiative, so it is kept across renders that don't change its inputs.
  const { teamMembers, addable, free } = useMemo(
    () => allocatablePeople({ plan, team, withFree: expanded && !frozen, people, teams, memberships, initiatives, process, today }),
    [expanded, team, teams, memberships, people, plan, initiatives, process, frozen, today],
  );
  const capacityData = { initiatives, teams, people, memberships, process, today };

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
            const result = repository.addAllocation(initiative.id, phase.id, personId, free?.get(personId));
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
            <SelectGroup>
              {!free && <SelectLabel>{inverted ? 'Fix the period to see who has room.' : 'Set the period to see who has room.'}</SelectLabel>}
              {addable.map((p) => {
                const pct = free?.get(p.id);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex-1">
                      {p.name} · {roleLabel(p, roles)}
                    </span>
                    {pct !== undefined && <span className={`ml-4 tabular-nums ${pct === 0 ? 'text-warning-text' : 'text-text-secondary'}`}>{pct}% free</span>}
                  </SelectItem>
                );
              })}
            </SelectGroup>
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
        {frozen && <FrozenIcon width={16} height={16} className="shrink-0 text-text-secondary" />}
        {skipped !== undefined && <SkippedMarker />}
        <span className="font-medium">{phase.label}</span>
        {hasPeriod ? (
          <span className="text-text-secondary">{formatPeriod(plan.startDate!, plan.endDate!)}</span>
        ) : (
          !initiativeFrozen && <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>Set period</span>
        )}
        <SkippedLabel initiative={initiative} phase={phase} />
        {overlap && <WarningIcon width={16} height={16} className="shrink-0 text-warning-text" role="img" aria-hidden={false} aria-label={`Overlaps ${previous!.label}`} />}
        {plan.allocations.length === 0 && !initiativeFrozen && (
          <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>· Add people</span>
        )}
        <span className="ml-auto font-medium tabular-nums">{costed && hasCost ? formatAmount(total, currencySymbol) : '—'}</span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary">{coverageLabel}</span>
      </button>

      {expanded && (
        <div id={bodyId} className="flex flex-col gap-4 border-t border-border-default px-3 py-3">
          {skipped !== undefined && (
            <p className="m-0 flex items-start gap-2 rounded-md bg-surface-subtle px-2.5 py-2 text-sm text-text-secondary">
              <SkippedIcon width={16} height={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">Skipped {phase.exitGate.label}:</span> {skipped}
              </span>
            </p>
          )}
          {frozen && snapshot ? (
            <ReadOnlyPhaseBody phase={snapshot} people={people} roles={roles} currencySymbol={currencySymbol} />
          ) : initiativeFrozen ? (
            <ReadOnlyPhaseBody
              phase={{ ...plan, costItems: plan.costItems ?? [], allocations: costed ? allocationsWithCost(plan, people, rateData) : plan.allocations }}
              people={people}
              roles={roles}
              currencySymbol={currencySymbol}
            />
          ) : (
            <>
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
                      changed={changed(file, ['phases', phase.id, 'startDate'])}
                      failure={failure(file, ['phases', phase.id, 'startDate'])}
                      highlight={needsPeriod}
                      onChange={(v) => repository.setPhaseDate(initiative.id, phase.id, 'startDate', v)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-text-secondary">End date</span>
                    <DateInput
                      label={`${phase.label} end date`}
                      value={plan.endDate}
                      changed={changed(file, ['phases', phase.id, 'endDate'])}
                      failure={failure(file, ['phases', phase.id, 'endDate'])}
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
                      const warnings = allocationWarnings(initiative, phase.id, allocation.personId, capacityData, loads);
                      // Up to two exact fixes for a capacity warning (§5.11), on one line under the warnings.
                      const reduce = warnings.overTeamFteMonths.length + warnings.overCapacityMonths.length > 0 ? reduceFix(initiative, phase.id, allocation.personId, capacityData, loads) : null;
                      const raise = warnings.overTeamFteMonths.length > 0 ? raiseFix(allocation.personId, initiative.teamId, capacityData, loads) : null;
                      /** After a fix its button is gone, so focus goes to the row's Allocation % field. */
                      const focusField = (from: HTMLElement) => from.closest('tr')?.querySelector('input')?.focus();
                      return (
                        <tr key={allocation.id} className="border-t border-border-default">
                          <td className="py-1.5 pr-2">
                            <div>{name}</div>
                            {person && <div className="text-xs text-text-muted">{roleLabel(person, roles)}</div>}
                            {warnings.notMember && <InlineWarning className="mt-1">No longer a member of {team?.name ?? 'the team'}</InlineWarning>}
                            {warnings.overTeamFteMonths.length > 0 && (
                              <InlineWarning icon={OverTeamFteIcon} className="mt-1">
                                Over Team FTE % in {formatMonthRanges(warnings.overTeamFteMonths)}
                              </InlineWarning>
                            )}
                            {warnings.overCapacityMonths.length > 0 && (
                              <InlineWarning icon={OverCapacityIcon} className="mt-1">
                                Over Capacity % in {formatMonthRanges(warnings.overCapacityMonths)}
                              </InlineWarning>
                            )}
                            {(reduce || raise) && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {reduce && (
                                  <ReduceFixButton
                                    name={name}
                                    to={reduce.allocationPct}
                                    where={phase.label}
                                    onClick={(e) => {
                                      repository.updateAllocation(initiative.id, phase.id, reduce.allocationId, reduce.allocationPct);
                                      focusField(e.currentTarget);
                                    }}
                                  />
                                )}
                                {raise && (
                                  <RaiseFixButton
                                    name={name}
                                    teamName={team?.name ?? 'the team'}
                                    to={raise.teamFtePct}
                                    onClick={(e) => {
                                      repository.updateMembership(raise.membershipId, { teamFtePct: raise.teamFtePct });
                                      focusField(e.currentTarget);
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <PercentInput
                              label={`Allocation % for ${name}`}
                              changed={changed(file, ['phases', phase.id, 'allocations', { id: allocation.id }, 'allocationPct'])}
                              failure={failure(file, ['phases', phase.id, 'allocations', { id: allocation.id }, 'allocationPct'])}
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
                                undoToast(() => repository.restoreAllocation(initiative.id, phase.id, removed.allocation, removed.index));
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

              <CostItemsTable initiativeId={initiative.id} phase={phase} plan={plan} />
            </>
          )}

          {costed && months.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-medium text-text-primary">Actuals</h3>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{phase.label} actuals</caption>
                <thead>
                  <tr className="text-left text-xs text-text-secondary">
                    <th className="py-1 pr-2 font-medium">Month</th>
                    <th className="py-1 pr-2 text-right font-medium">Estimate</th>
                    <th className="py-1 pr-2 text-right font-medium">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month} id={actualCellAnchor(phase.id, month)} className="border-t border-border-default">
                      <td className="py-1.5 pr-2">{formatMonth(month)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatAmount(estimateByMonth[month] ?? 0, currencySymbol)}</td>
                      <td className="py-1.5 pr-2">
                        <ActualCell
                          phase={phase}
                          month={month}
                          recorded={plan.actualMonths?.[month]}
                          defaulted={actualOrEstimate(plan, month, today, estimateByMonth)}
                          currencySymbol={currencySymbol}
                          changed={changed(file, ['phases', phase.id, 'actualMonths', month])}
                          failure={failure(file, ['phases', phase.id, 'actualMonths', month])}
                          onChange={(amount) => repository.setActual(initiative.id, phase.id, month, amount)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** What a read-only phase body shows: a gate's frozen snapshot, or the live plan of a Closed or Cancelled initiative's other phases. */
type ReadOnlyPhase = Pick<FrozenPhaseSnapshot, 'costItems'> & {
  startDate?: string;
  endDate?: string;
  allocations: (Omit<FrozenAllocation, 'cost'> & { cost?: number })[];
};

/**
 * A phase's period, allocations and cost items, read-only and muted (§8.1, §8.4, §9.9): a frozen phase from its gate's
 * snapshot, never the live rates, or any other phase of a Closed or Cancelled initiative. Actuals stay outside this —
 * they're rendered by the shared Actuals table below.
 */
function ReadOnlyPhaseBody({ phase, people, roles, currencySymbol }: { phase: ReadOnlyPhase; people: Person[]; roles: Role[]; currencySymbol: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Start date</span>
          <span className="text-text-muted">{phase.startDate ? formatDate(phase.startDate) : '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">End date</span>
          <span className="text-text-muted">{phase.endDate ? formatDate(phase.endDate) : '—'}</span>
        </div>
      </div>
      {phase.allocations.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Frozen allocations</caption>
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th className="py-1 pr-2 font-medium">Person</th>
              <th className="py-1 pr-2 font-medium">Allocation %</th>
              <th className="py-1 pr-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {phase.allocations.map((allocation) => {
              const person = people.find((p) => p.id === allocation.personId);
              return (
                <tr key={allocation.id} className="border-t border-border-default">
                  <td className="py-1.5 pr-2 text-text-muted">
                    <div>{person?.name ?? 'Unknown person'}</div>
                    {person && <div className="text-xs text-text-muted">{roleLabel(person, roles)}</div>}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums text-text-muted">{allocation.allocationPct}%</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-text-muted">{allocation.cost === undefined ? '—' : formatAmount(allocation.cost, currencySymbol)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {phase.costItems.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Frozen cost items</caption>
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th className="py-1 pr-2 font-medium">Label</th>
              <th className="py-1 pr-2 font-medium">Amount</th>
              <th className="py-1 pr-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {phase.costItems.map((item) => (
              <tr key={item.id} className="border-t border-border-default">
                <td className="py-1.5 pr-2 text-text-muted">{item.label}</td>
                <td className="py-1.5 pr-2 tabular-nums text-text-muted">{formatAmount(item.amount, currencySymbol)}</td>
                <td className="py-1.5 pr-2 text-text-muted">{item.timing === 'month' && item.month ? `${TIMING_LABELS.month} (${formatMonth(item.month)})` : TIMING_LABELS[item.timing]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** One actuals-table cell (§7.3): a recorded actual, a defaulted estimate with the confirm check, or "not closed yet". */
function ActualCell({
  phase,
  month,
  recorded,
  defaulted,
  currencySymbol,
  changed,
  failure,
  onChange,
}: {
  phase: PhaseDef;
  month: string;
  /** The recorded actual, if any. */
  recorded: number | undefined;
  /** What §7.3 defaults an unrecorded, closed month to; `undefined` while the month hasn't closed yet. */
  defaulted: number | undefined;
  currencySymbol: string;
  changed: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure: FieldFailure | null;
  onChange: (amount: number) => void;
}) {
  if (recorded !== undefined) {
    return (
      <div className="flex justify-end">
        <AmountInput
          label={`Actual for ${phase.label} ${formatMonth(month)}`}
          currencySymbol={currencySymbol}
          value={recorded}
          changed={changed}
          failure={failure}
          onChange={onChange}
        />
      </div>
    );
  }
  if (defaulted !== undefined) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Record the estimate as the actual for ${phase.label} ${formatMonth(month)}`}
          onClick={() => onChange(defaulted)}
        >
          <CheckIcon />
        </Button>
        <span className="text-text-muted">{formatAmount(defaulted, currencySymbol)} · using the estimate</span>
        <AmountInput
          label={`Override the actual for ${phase.label} ${formatMonth(month)}`}
          currencySymbol={currencySymbol}
          value={undefined}
          placeholder="Enter amount"
          changed={changed}
          failure={failure}
          onChange={onChange}
        />
      </div>
    );
  }
  return <span className="flex justify-end text-text-secondary">not closed yet</span>;
}

/** The reason a phase's exit gate was skipped (§8.2), or undefined when it was not skipped. */
function skipReason(initiative: Initiative, phaseId: string): string | undefined {
  const record = initiative.gates?.[phaseId];
  return record?.outcome === 'skipped' ? (record.skipReason ?? '') : undefined;
}

/** The skip icon in the lock icon's place on a phase line (§8.2, §9.10). */
function SkippedMarker() {
  return <SkippedIcon width={16} height={16} className="shrink-0 text-text-secondary" role="img" aria-hidden={false} aria-label="Skipped" />;
}

/**
 * "· Skipped G2" on a phase line, the reason as its tooltip (§8.2). A phase that can't expand (not costed) shows the
 * reason inline as well, truncated, since the line is the only place it appears (§9.8).
 */
function SkippedLabel({ initiative, phase, withReason = false }: { initiative: Initiative; phase: PhaseDef; withReason?: boolean }) {
  const reason = skipReason(initiative, phase.id);
  if (reason === undefined) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
          <span className="whitespace-nowrap">· Skipped {phase.exitGate.label}</span>
          {withReason && <span className="truncate text-text-muted">· {reason}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
