import { Fragment, useMemo, useRef, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useFieldConflict, useRevealTarget } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { lostEditKey } from '../sync/Repository';
import type { PhaseDef } from '../brand/types';
import { activeLoads, allocationRow, raiseFix, type Load } from '../data/capacity';
import { allocationFigures } from '../data/cost';
import { RaiseFixButton } from './CapacityFixButtons';
import { formatDate, formatMonth, formatMonthRanges, formatPeriod, localToday } from '../data/dates';
import { allocationsWithCost, costedPhasesFrom, currentPhaseId } from '../data/gate';
import { copySource, skippedNote } from '../data/copyAllocations';
import { isInitiativeFrozen, isPhaseFrozen, skipReason } from '../data/frozen';
import { overdueActualMonths } from '../data/needsAttention';
import { allocatablePeople } from '../data/personLoad';
import { nextStepPhase, overlapWithPrevious, phaseSummary, planningGap } from '../data/phaseSummary';
import { teamCountries, workingDaysByCountry } from '../data/period';
import { roleLabel } from '../data/roleLabel';
import { FILE_PATHS, type FrozenAllocation, type FrozenPhaseSnapshot, type Initiative, type PhasePlan, type Person, type Role, type Team } from '../data/types';
import { ActualsTable } from './ActualsTable';
import { ConflictRow } from './ConflictBlock';
import { FailedEdit } from './CommitInput';
import { CostItemsTable } from './CostItemsTable';
import { TIMING_LABELS } from './costItemTiming';
import { RecalcTint } from './motion';
import { overlapWarning, PeriodPicker, type NeighbourPhase } from './PeriodPicker';
import { formatAmount } from './formatAmount';
import { GateChecklistPanel } from './GateChecklistPanel';
import { ChevronDownIcon, ChevronRightIcon, DismissIcon, FrozenIcon, InfoIcon, OverdueIcon, SkippedIcon, OverCapacityIcon, OverTeamFteIcon, RemoveIcon, WarningIcon } from './icons';
import { InlineWarning } from './InlineWarning';
import { LoadBar } from './LoadBar';
import { TeamRoster } from './TeamRoster';
import { TruncatedText } from './TruncatedText';
import type { Jump } from './jumpTo';
import { undoToast } from './undoToast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cardClass } from './cardClass';
import { cn } from '@/lib/utils';

/** The phase that opens with the page (§5.4): the current one, or without cost of its own the next costed phase ahead. */
function phaseToOpen(process: PhaseDef[], currentId: string): string | undefined {
  return costedPhasesFrom(process, currentId)[0]?.id;
}

/** A phase's overdue actuals as its header chip says them (§5.4): the month for one, a count for more. */
function overdueChipText(months: string[]): string {
  return months.length === 1 ? `No actual for ${formatMonth(months[0])}` : `${months.length} actuals overdue`;
}

/** A phase row's line: its marker, label and summary (§5.4). */
export const PHASE_ROW_CLASS = 'flex items-center gap-2 px-3 py-2.5 text-body';
export const NOT_COSTED = 'not costed';

/** A phase nobody has planned yet. One shared object, so the picker's memo isn't invalidated on every render. */
const UNPLANNED: PhasePlan = { allocations: [] };

/** The initiative page's Phases section (§5.4): every phase in order, costed ones expandable, with the current phase's Gate / Checklist panel directly beneath it. */
export function PhasesSection({ initiative, team, reveal = null }: { initiative: Initiative; team: Team | undefined; reveal?: Jump | null }) {
  const { process } = useBrand();
  const { initiatives, teams } = useRepositoryState();
  // One portfolio-wide pass for every allocation row of every phase (§5.4 warnings).
  const today = localToday();
  const loads = useMemo(() => activeLoads({ initiatives, teams, process, today }), [initiatives, teams, process, today]);
  const costedPhases = process.filter((p) => p.costed);
  const currentId = currentPhaseId(initiative, process);
  // The current phase opens; the others are one line until clicked (§5.4). Without cost of its own, the next costed
  // phase ahead opens instead, so a new initiative still lands on its period and people. Once a gate moves the
  // current phase on, the new one opens too, leaving whatever the user opened as it is. A jump into a collapsed phase
  // (Go to <phase>, a Needs attention deep link, §5.4, §8.5) opens it, while rendering, so its place exists to focus.
  const [open, setOpen] = useState<Set<string>>(() => new Set([phaseToOpen(process, currentId), reveal?.phaseId].filter((id) => id !== undefined)));
  const [openedFor, setOpenedFor] = useState({ currentId, reveal });
  if (openedFor.currentId !== currentId || openedFor.reveal !== reveal) {
    const next = new Set(open);
    const phaseId = phaseToOpen(process, currentId);
    if (openedFor.currentId !== currentId && phaseId) next.add(phaseId);
    if (openedFor.reveal !== reveal && reveal?.phaseId) next.add(reveal.phaseId);
    setOpenedFor({ currentId, reveal });
    if (next.size !== open.size) setOpen(next);
  }
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

  return (
    <section aria-labelledby="phases-heading">
      <h2 id="phases-heading" className="m-0 mb-3 text-title">
        Phases
      </h2>
      {initiative.defaultPlan && !initiativeFrozen && (
        <p
          className="m-0 mb-3 flex items-start gap-2 rounded-md border border-brand-accent bg-brand-accent-tint p-3 text-body text-brand-accent-text"
          data-testid="suggested-dates-note"
        >
          <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
          Suggested dates, starting today. Adjust them, then add people to see the cost.
        </p>
      )}
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {process.map((phase) => {
          const index = costedPhases.indexOf(phase);
          return (
            // A phase that isn't costed has no control of its own, so its row takes focus when the time strip jumps to it (§5.4).
            <li key={phase.id} id={`phase-row-${phase.id}`} tabIndex={phase.costed ? undefined : -1} className="flex flex-col gap-2">
              <div className={cardClass}>
                {phase.costed ? (
                  <CostedPhase
                    phase={phase}
                    previous={costedPhases[index - 1]}
                    next={costedPhases[index + 1]}
                    isNextStep={phase.id === nextStepId}
                    initiative={initiative}
                    team={team}
                    loads={loads}
                    today={today}
                    expanded={open.has(phase.id)}
                    onToggle={() => toggle(phase.id)}
                  />
                ) : (
                  <div className={PHASE_ROW_CLASS}>
                    <GateMarker frozen={isPhaseFrozen(initiative, phase.id)} skipped={skipReason(initiative, phase.id) !== undefined} />
                    <span className="font-medium">{phase.label}</span>
                    <span className="text-text-muted">· {NOT_COSTED}</span>
                    <SkippedLabel gateLabel={phase.exitGate.label} reason={skipReason(initiative, phase.id)} withReason />
                  </div>
                )}
              </div>
              {/* The gate leaving the current phase sits directly beneath it (§5.4). */}
              {phase.id === currentId && <GateChecklistPanel initiative={initiative} phase={phase} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CostedPhase({
  phase,
  previous,
  next,
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
  /** The costed phase after this one, marked faintly in the period picker (§9.11). */
  next: PhaseDef | undefined;
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
  /** Each allocation row's load bar, for a fix that removes its own button to hand focus back to. */
  const bars = useRef(new Map<string, { focus: () => void }>());

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
  const overlap = previous && overlapEnd ? overlapWarning(previous.label, overlapEnd) : null;
  // The period picker's neighbours and the countries its footer counts working days in (§9.11).
  const neighbour = (p: PhaseDef | undefined): NeighbourPhase | undefined =>
    p && { label: p.label, startDate: initiative.phases?.[p.id]?.startDate, endDate: initiative.phases?.[p.id]?.endDate };
  const countriesOfTeam = useMemo(() => (team ? teamCountries(team.id, { memberships, people, countries }) : []), [team, memberships, people, countries]);
  // The period is one control over two stored dates: either date's change, failure or conflict is the period's.
  const periodPaths = (['startDate', 'endDate'] as const).map((which) => ['phases', phase.id, which]);
  // A phase behind a skipped gate stays editable, and says so with its reason (§8.2).
  const skipped = skipReason(initiative, phase.id);
  // Closed months still owing an actual (§8.5 Overdue), named on the header row so a collapsed phase says so (§5.4).
  const overdueMonths = overdueActualMonths(initiative, phase, today);
  const coverageLabel = { frozen: 'Frozen', actual: 'Actual', forecast: 'Forecast', estimate: 'Estimate' }[coverage];

  // Who can still be added, and what each has free for the phase's months (§5.11), most free first. Free capacity
  // is undefined without a valid period (the list is then by name) and while the phase is closed: only the open
  // phase's roster shows it. It scans the portfolio's loads, so it is kept across renders that don't change its inputs.
  const { teamMembers, addable, free } = useMemo(
    () => allocatablePeople({ plan, team, withFree: expanded && !frozen, people, memberships, today, loads }),
    [expanded, team, memberships, people, plan, frozen, today, loads],
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

  const add = (personId: string) => {
    const result = repository.addAllocation(initiative.id, phase.id, personId, free?.get(personId)?.pct);
    setRefusal(result.ok ? null : (result.reason ?? null));
  };
  const picker =
    team && teamMembers.length === 0 ? (
      <div className="flex flex-col items-start gap-2">
        <p className="m-0 text-caption text-text-secondary">
          {team.name} has no active members yet. Add people on <a href={`#/teams/${team.id}`} className="underline">the team&apos;s page</a>.
        </p>
        {copyButton}
      </div>
    ) : team && (addable.length > 0 || copyButton) ? (
      <div className="flex flex-col gap-1">
        <TeamRoster
          phaseLabel={phase.label}
          addable={addable}
          free={free}
          roles={roles}
          teams={teams}
          highlight={needsPeople}
          copy={copyButton}
          onAdd={add}
        />
        {addable.length > 0 && !free && <p className="m-0 text-caption text-text-secondary">{inverted ? 'Fix the period to see who has room.' : 'Set the period to see who has room.'}</p>}
      </div>
    ) : null;

  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const bodyId = `phase-${phase.id}`;

  return (
    <>
      <button
        type="button"
        className={cn(PHASE_ROW_CLASS, 'w-full cursor-pointer rounded-lg border-0 bg-transparent text-left text-text-primary')}
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
        {overdueMonths.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-caption text-warning-text">
            <OverdueIcon width={14} height={14} className="shrink-0" />
            {overdueChipText(overdueMonths)}
          </span>
        )}
        {overlap && <WarningIcon width={16} height={16} className="shrink-0 text-warning-text" role="img" aria-hidden={false} aria-label={`Overlaps ${previous!.label}`} />}
        {plan.allocations.length === 0 && !initiativeFrozen && (
          <span className={`font-medium ${isNextStep ? 'text-brand-accent-text' : 'text-text-secondary'}`}>· Add people</span>
        )}
        {/* The phase total tints briefly when it recalculates (slice 059). */}
        <RecalcTint value={total} className="ml-auto font-medium tabular-nums">
          {costed && hasCost ? formatAmount(total, currencySymbol) : '—'}
        </RecalcTint>
        <Badge variant="subtle">{coverageLabel}</Badge>
      </button>

      {frozen && frozenWithLostEdit.has(lostEditKey(initiative.id, phase.id)) && (
        <LostEditMessage gateLabel={phase.exitGate.label} phaseLabel={phase.label} onDismiss={() => repository.dismissLostEdit(initiative.id, phase.id)} />
      )}

      {expanded && (
        <div id={bodyId} className="flex flex-col gap-4 border-t border-border-default px-3 py-3 motion-safe:animate-reveal">
          {skipped !== undefined && (
            <p className="m-0 flex items-start gap-2 rounded-md bg-surface-subtle px-2.5 py-2 text-caption text-text-secondary">
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
                {needsPeriod && <p className="m-0 text-body font-medium text-brand-accent-text">Set the period to calculate cost.</p>}
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-text-secondary">Period</span>
                  <PeriodPicker
                    phaseLabel={phase.label}
                    value={{ startDate: plan.startDate, endDate: plan.endDate }}
                    previous={neighbour(previous)}
                    next={neighbour(next)}
                    workingDays={(startIso, endIso) => workingDaysByCountry(startIso, endIso, countriesOfTeam)}
                    highlight={needsPeriod}
                    changed={periodPaths.some((path) => changed(file, path))}
                    failure={periodPaths.map((path) => failure(file, path)).find(Boolean) ?? null}
                    conflict={periodPaths.map((path) => conflict(file, path)).find(Boolean) ?? null}
                    onSave={(period) => repository.setPhasePeriod(initiative.id, phase.id, period)}
                  />
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
                  <p className={`m-0 text-caption ${needsPeople ? 'font-medium text-brand-accent-text' : 'text-text-secondary'}`}>
                    Who works on {phase.label}? Add a team member to see this phase&apos;s cost.
                  </p>
                  {picker && <div className="w-full">{picker}</div>}
                </div>
              ) : (
                <table className="tabular-nums w-full table-fixed border-collapse text-body">
                  <caption className="sr-only">{phase.label} allocations</caption>
                  {/* Fixed widths: a message never moves a column (F02); it sits in a full-width row under its row. */}
                  <colgroup>
                    <col className="w-[30%]" />
                    <col />
                    <col className="w-16" />
                    <col className="w-28" />
                    <col className="w-10" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-label text-text-secondary">
                      <th className="py-1 pr-2 font-medium">Person</th>
                      <th className="py-1 pr-4 font-medium">Allocation %</th>
                      <th className="py-1 pr-2 text-right font-medium">Days</th>
                      <th className="py-1 pr-2 text-right font-medium">Cost</th>
                      <th className="py-1">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.allocations.map((allocation) => {
                      const person = people.find((p) => p.id === allocation.personId);
                      const figures = person ? allocationFigures(plan, person, allocation.allocationPct, rateData) : null;
                      const name = person?.name ?? 'Unknown person';
                      const { bar, warnings } = allocationRow(initiative, phase.id, allocation.personId, capacityData, loads);
                      // The raise fix sits under the warnings; the reduce is the load bar's Fill free (§5.11).
                      const raise = warnings.overTeamFteMonths.length > 0 ? raiseFix(allocation.personId, initiative.teamId, capacityData, loads) : null;
                      const pctPath = ['phases', phase.id, 'allocations', { id: allocation.id }, 'allocationPct'];
                      const pctConflict = conflict(file, pctPath);
                      const pctFailure = failure(file, pctPath);
                      const failureId = `allocation-failure-${allocation.id}`;
                      const messages = [
                        warnings.notMember && <InlineWarning key="member">No longer a member of {team?.name ?? 'the team'}</InlineWarning>,
                        warnings.overTeamFteMonths.length > 0 && (
                          <InlineWarning key="fte" icon={OverTeamFteIcon}>
                            Over Team FTE % in {formatMonthRanges(warnings.overTeamFteMonths)}
                          </InlineWarning>
                        ),
                        warnings.overCapacityMonths.length > 0 && (
                          <InlineWarning key="capacity" icon={OverCapacityIcon}>
                            Over Capacity % in {formatMonthRanges(warnings.overCapacityMonths)}
                          </InlineWarning>
                        ),
                        raise && (
                          <RaiseFixButton
                            key="raise"
                            name={name}
                            teamName={team?.name ?? 'the team'}
                            to={raise.teamFtePct}
                            onClick={() => {
                              repository.updateMembership(raise.membershipId, { teamFtePct: raise.teamFtePct });
                              // Its button is gone after the raise, so focus goes back to the row's load bar.
                              bars.current.get(allocation.id)?.focus();
                            }}
                          />
                        ),
                        pctFailure && <FailedEdit key="failure" id={failureId} className="w-full" retryLabel={`Retry Allocation % for ${name}`} failure={pctFailure} />,
                      ].filter(Boolean);
                      return (
                        <Fragment key={allocation.id}>
                        <tr className="border-t border-border-default align-top">
                          <td className="py-2 pr-2">
                            <TruncatedText text={name} />
                            {person && <div className="truncate text-caption text-text-muted">{roleLabel(person, roles)}</div>}
                          </td>
                          <td className="py-1.5 pr-4">
                            <LoadBar
                              name={name}
                              value={allocation.allocationPct}
                              model={bar}
                              ref={(handle) => {
                                if (handle) bars.current.set(allocation.id, handle);
                                return () => {
                                  bars.current.delete(allocation.id);
                                };
                              }}
                              changed={changed(file, pctPath)}
                              describedBy={[pctFailure && failureId, pctConflict?.id].filter(Boolean).join(' ') || undefined}
                              onChange={(pct) => repository.updateAllocation(initiative.id, phase.id, allocation.id, pct)}
                            />
                          </td>
                          <td className="py-2 pr-2 text-right">{costed && figures ? figures.personDays.toFixed(1) : '—'}</td>
                          <td className="py-2 pr-2 text-right">
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
                        {messages.length > 0 && (
                          <tr>
                            <td colSpan={5} className="pr-2 pb-2">
                              <div className="flex flex-col items-start gap-1">{messages}</div>
                            </td>
                          </tr>
                        )}
                        <ConflictRow conflict={pctConflict} label={`Allocation % for ${name}`} colSpan={5} />
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {plan.allocations.length > 0 && picker}
              {team && teamMembers.length > 0 && <p className="m-0 text-caption text-text-muted">Only members of {team.name} can be allocated.</p>}
              {refusal && (
                <p className="m-0 text-body text-warning-text" role="alert">
                  {refusal}
                </p>
              )}
              {notCopied && notCopied.plan === plan && (
                <p className="m-0 flex items-start gap-2 rounded-md bg-surface-subtle px-2.5 py-2 text-caption text-text-secondary">
                  <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
                  <span>{notCopied.text}</span>
                </p>
              )}

              <CostItemsTable initiativeId={initiative.id} phase={phase} plan={plan} />
            </>
          )}

          {costed && months.length > 0 && (
            <ActualsTable initiativeId={initiative.id} phase={phase} plan={plan} months={months} estimateByMonth={estimateByMonth} today={today} />
          )}
        </div>
      )}
    </>
  );
}

/** A change of this user's that a gate pass overtook, and so wasn't saved (§8.1); an error, so it stays until dismissed (§9.9). */
function LostEditMessage({ gateLabel, phaseLabel, onDismiss }: { gateLabel: string; phaseLabel: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-warning-tint px-2.5 py-2 text-body text-warning-text">
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
          <span className="text-caption text-text-secondary">Start date</span>
          <span className="text-text-muted">{phase.startDate ? formatDate(phase.startDate) : '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-caption text-text-secondary">End date</span>
          <span className="text-text-muted">{phase.endDate ? formatDate(phase.endDate) : '—'}</span>
        </div>
      </div>
      {phase.allocations.length > 0 && (
        <table className="tabular-nums w-full border-collapse text-body">
          <caption className="sr-only">Frozen allocations</caption>
          <thead>
            <tr className="text-left text-label text-text-secondary">
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
                    {role && <div className="text-caption text-text-muted">{role}</div>}
                  </td>
                  <td className="py-1.5 pr-2 text-text-muted">{allocation.allocationPct}%</td>
                  <td className="py-1.5 pr-2 text-right text-text-muted">{allocation.cost === undefined ? '—' : formatAmount(allocation.cost, currencySymbol)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {phase.costItems.length > 0 && (
        <table className="tabular-nums w-full border-collapse text-body">
          <caption className="sr-only">Frozen cost items</caption>
          <thead>
            <tr className="text-left text-label text-text-secondary">
              <th className="py-1 pr-2 font-medium">Label</th>
              <th className="py-1 pr-2 font-medium">Amount</th>
              <th className="py-1 pr-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {phase.costItems.map((item) => (
              <tr key={item.id} className="border-t border-border-default">
                <td className="py-1.5 pr-2 text-text-muted">{item.label}</td>
                <td className="py-1.5 pr-2 text-text-muted">{formatAmount(item.amount, currencySymbol)}</td>
                <td className="py-1.5 pr-2 text-text-muted">{item.timing === 'month' && item.month ? `${TIMING_LABELS.month} (${formatMonth(item.month)})` : TIMING_LABELS[item.timing]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
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
