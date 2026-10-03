import { Fragment, useMemo, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useFieldConflict, useRevealTarget, type FieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState, type FieldFailure } from '../state/DataContext';
import { lostEditKey } from '../sync/Repository';
import type { PhaseDef } from '../brand/types';
import { activeLoads, allocationWarnings, raiseFix, reduceFix, type Load } from '../data/capacity';
import { actualOrEstimate, allocationFigures } from '../data/cost';
import { RaiseFixButton, ReduceFixButton } from './CapacityFixButtons';
import { formatDate, formatMonth, formatMonthRanges, formatPeriod, localToday } from '../data/dates';
import { allocationsWithCost, currentPhaseId } from '../data/gate';
import { copySource, skippedNote } from '../data/copyAllocations';
import { isInitiativeFrozen, isPhaseFrozen, skipReason } from '../data/frozen';
import { allocatablePeople } from '../data/personLoad';
import { nextStepPhase, overlapWithPrevious, phaseSummary, planningGap } from '../data/phaseSummary';
import { roleLabel } from '../data/roleLabel';
import { FILE_PATHS, type FrozenAllocation, type FrozenPhaseSnapshot, type Initiative, type PhasePlan, type Person, type Role, type Team } from '../data/types';
import { AmountInput } from './AmountInput';
import { ConflictRow, inRow } from './ConflictBlock';
import { CostItemsTable } from './CostItemsTable';
import { TIMING_LABELS } from './costItemTiming';
import { DateInput } from './DateInput';
import { formatAmount } from './formatAmount';
import { GateChecklistPanel } from './GateChecklistPanel';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, DismissIcon, FrozenIcon, InfoIcon, SkippedIcon, OverCapacityIcon, OverTeamFteIcon, PlusIcon, RemoveIcon, WarningIcon } from './icons';
import { InlineWarning } from './InlineWarning';
import { PercentInput } from './PercentInput';
import { TruncatedText } from './TruncatedText';
import { undoToast } from './undoToast';
import { Button } from '@/components/ui/button';
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
  // The banner's Show opens the phase its conflict is in (§9.9).
  useRevealTarget(FILE_PATHS.initiative(initiative.id), (path) => {
    if (path[0] === 'phases' && typeof path[1] === 'string') setOpen((current) => new Set(current).add(path[1] as string));
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
                <GateMarker frozen={isPhaseFrozen(initiative, phase.id)} skipped={skipReason(initiative, phase.id) !== undefined} />
                <span className="font-medium">{phase.label}</span>
                <span className="text-text-muted">· not costed</span>
                <SkippedLabel gateLabel={phase.exitGate.label} reason={skipReason(initiative, phase.id)} withReason />
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
  const conflict = useFieldConflict();
  const file = FILE_PATHS.initiative(initiative.id);
  const { currencySymbol, process } = useBrand();
  const { people, roles, countries, memberships, initiatives, teams, frozenWithLostEdit } = useRepositoryState();
  const [refusal, setRefusal] = useState<string | null>(null);
  // Who the last Copy skipped (§5.11): shown until this phase's plan next changes, never stored.
  const [notCopied, setNotCopied] = useState<{ text: string; plan: PhasePlan } | null>(null);

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

  const copyFrom = !frozen && !initiativeFrozen && previous && plan.allocations.length === 0 && copySource(initiative, previous.id).length > 0 ? previous : undefined;
  const copyButton = copyFrom && (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const result = repository.copyAllocations(initiative.id, phase.id, copyFrom.id);
        if (!result) return;
        const now = repository.getState().initiatives.find((i) => i.id === initiative.id)?.phases?.[phase.id] ?? UNPLANNED;
        setNotCopied(team && result.skipped.length > 0 ? { text: skippedNote(result.skipped, result.copied, team), plan: now } : null);
      }}
    >
      Copy from {copyFrom.label}
    </Button>
  );

  const picker =
    team && teamMembers.length === 0 ? (
      <p className="m-0 text-sm text-text-secondary">
        {team.name} has no active members yet. Add people on <a href={`#/teams/${team.id}`} className="underline">the team&apos;s page</a>.
      </p>
    ) : addable.length > 0 ? (
      <div className="flex items-center gap-2">
        <PlusIcon width={16} height={16} className={needsPeople ? 'text-brand-accent-text' : 'text-text-secondary'} />
        <Select
          value=""
          onValueChange={(personId) => {
            const result = repository.addAllocation(initiative.id, phase.id, personId, free?.get(personId));
            setRefusal(result.ok ? null : (result.reason ?? null));
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
        <GateMarker frozen={frozen} skipped={skipped !== undefined} />
        <span className="font-medium">{phase.label}</span>
        {hasPeriod ? (
          <span className="text-text-secondary">{formatPeriod(plan.startDate!, plan.endDate!)}</span>
        ) : (
          !initiativeFrozen && <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>Set period</span>
        )}
        <SkippedLabel gateLabel={phase.exitGate.label} reason={skipped} />
        {overlap && <WarningIcon width={16} height={16} className="shrink-0 text-warning-text" role="img" aria-hidden={false} aria-label={`Overlaps ${previous!.label}`} />}
        {plan.allocations.length === 0 && !initiativeFrozen && (
          <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>· Add people</span>
        )}
        <span className="ml-auto font-medium tabular-nums">{costed && hasCost ? formatAmount(total, currencySymbol) : '—'}</span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary">{coverageLabel}</span>
      </button>

      {frozen && frozenWithLostEdit.has(lostEditKey(initiative.id, phase.id)) && (
        <LostEditMessage gateLabel={phase.exitGate.label} phaseLabel={phase.label} onDismiss={() => repository.dismissLostEdit(initiative.id, phase.id)} />
      )}

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
                      conflict={conflict(file, ['phases', phase.id, 'startDate'])}
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
                      conflict={conflict(file, ['phases', phase.id, 'endDate'])}
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
                  {(picker || copyButton) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {picker}
                      {copyButton}
                    </div>
                  )}
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
                      const pctConflict = conflict(file, ['phases', phase.id, 'allocations', { id: allocation.id }, 'allocationPct']);
                      return (
                        <Fragment key={allocation.id}>
                        <tr className="border-t border-border-default">
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
                              conflict={inRow(pctConflict)}
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
                                undoToast(() => repository.restoreAllocation(initiative.id, phase.id, removed.allocation, removed.index), { repository, initiativeId: initiative.id, phaseId: phase.id });
                              }}
                            >
                              <RemoveIcon />
                            </Button>
                          </td>
                        </tr>
                        <ConflictRow conflict={pctConflict} label={`Allocation % for ${name}`} colSpan={5} />
                        </Fragment>
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
              {notCopied && notCopied.plan === plan && (
                <p className="m-0 flex items-start gap-2 rounded-md bg-surface-subtle px-2.5 py-2 text-sm text-text-secondary">
                  <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
                  <span>{notCopied.text}</span>
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
                  {months.map((month) => {
                    const actualConflict = conflict(file, ['phases', phase.id, 'actualMonths', month]);
                    return (
                    <Fragment key={month}>
                    <tr id={actualCellAnchor(phase.id, month)} className="border-t border-border-default">
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
                          conflict={inRow(actualConflict)}
                          onChange={(amount) => repository.setActual(initiative.id, phase.id, month, amount)}
                        />
                      </td>
                    </tr>
                    <ConflictRow conflict={actualConflict} label={`Actual for ${phase.label} ${formatMonth(month)}`} colSpan={3} />
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** A change of this user's that a gate pass overtook, and so wasn't saved (§8.1); an error, so it stays until dismissed (§9.9). */
function LostEditMessage({ gateLabel, phaseLabel, onDismiss }: { gateLabel: string; phaseLabel: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-warning-tint px-2.5 py-2 text-sm text-warning-text">
      <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">
        {gateLabel} was passed while you were editing, so your last change to {phaseLabel} wasn&apos;t saved.
      </span>
      <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0 text-warning-text" aria-label="Dismiss" onClick={onDismiss}>
        <DismissIcon width={16} height={16} />
      </Button>
    </div>
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
              // A gate's snapshot names who it costed and as what (§8.1); an older snapshot, or a Closed or Cancelled
              // initiative's live plan, falls back to the person as they are now.
              const person = people.find((p) => p.id === allocation.personId);
              const role = allocation.roleName ?? (person && roleLabel(person, roles));
              return (
                <tr key={allocation.id} className="border-t border-border-default">
                  <td className="py-1.5 pr-2 text-text-muted">
                    <div>{allocation.personName ?? person?.name ?? 'Unknown person'}</div>
                    {role && <div className="text-xs text-text-muted">{role}</div>}
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
  conflict,
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
  /** A same-field conflict on this month's actual (§3, §9.9), shown in the row under it. */
  conflict: FieldConflict | null;
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
          conflict={conflict}
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
          conflict={conflict}
          onChange={onChange}
        />
      </div>
    );
  }
  return <span className="flex justify-end text-text-secondary">not closed yet</span>;
}

/** The lock icon on a phase behind a passed gate, the skip icon in its place behind a skipped one (§8.1, §8.2, §9.10). */
function GateMarker({ frozen, skipped }: { frozen: boolean; skipped: boolean }) {
  if (frozen) return <FrozenIcon width={16} height={16} className="shrink-0 text-text-secondary" />;
  if (skipped) return <SkippedIcon width={16} height={16} className="shrink-0 text-text-secondary" role="img" aria-hidden={false} aria-label="Skipped" />;
  return null;
}

/**
 * "· Skipped G2" on a phase line, the reason as its tooltip (§8.2). A phase that can't expand (not costed) shows the
 * reason inline as well, truncated, since the line is the only place it appears (§9.8).
 */
function SkippedLabel({ gateLabel, reason, withReason = false }: { gateLabel: string; reason: string | undefined; withReason?: boolean }) {
  if (reason === undefined) return null;
  return (
    <TruncatedText text={reason} className="min-w-0 text-text-secondary">
      · Skipped {gateLabel}
      {withReason && <span className="text-text-muted"> · {reason}</span>}
    </TruncatedText>
  );
}
