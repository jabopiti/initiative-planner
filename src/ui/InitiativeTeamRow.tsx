import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { isPhaseLocked } from '../data/processState';
import { planTeamChange } from '../data/teamChange';
import type { Initiative } from '../data/types';
import { formatAmount } from './formatAmount';
import { TeamSelect } from './TeamSelect';
import { Button } from '@/components/ui/button';

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The initiative header's team and status (§5.4). The team is a dropdown of the active teams; choosing another one
 * that would take allocations out of the open phases asks first, in place under the header (no modal), naming who
 * goes and who stays (§7.2). The dropdown keeps showing the current team until the change is confirmed. A Closed or
 * Cancelled initiative keeps its team, shown as text.
 */
export function InitiativeTeamRow({ initiative }: { initiative: Initiative }) {
  const repository = useRepository();
  const { currencySymbol, process } = useBrand();
  const { teams, people, memberships, roles, countries } = useRepositoryState();
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const currentTeam = teams.find((t) => t.id === initiative.teamId);
  const newTeam = teams.find((t) => t.id === pendingTeamId);
  const canChange = initiative.status === 'Active' || initiative.status === 'On Hold';

  const planFor = (teamId: string) =>
    planTeamChange({
      initiative,
      newTeamId: teamId,
      process,
      people,
      memberships,
      rateData: { roles, countries },
      isLocked: (phaseId) => isPhaseLocked(initiative, phaseId),
    });
  // Worked out on every render, so the names and figures shown are the ones that would be removed now.
  const plan = pendingTeamId ? planFor(pendingTeamId) : null;
  const confirming = newTeam && plan && plan.removed.length > 0 ? { team: newTeam, plan } : null;

  const apply = (teamId: string) => {
    setPendingTeamId(null);
    const change = repository.changeTeam(initiative.id, teamId);
    triggerRef.current?.focus();
    if (!change || change.removed.length === 0) return;
    const count = change.removed.length;
    toast(`Team changed to ${teams.find((t) => t.id === teamId)?.name}, ${count} allocation${count === 1 ? '' : 's'} removed.`, {
      duration: 10_000,
      action: { label: 'Undo', onClick: () => repository.restoreTeam(initiative.id, change) },
    });
  };
  const cancel = () => {
    setPendingTeamId(null);
    triggerRef.current?.focus();
  };

  const choose = (teamId: string) => {
    if (teamId === initiative.teamId) return setPendingTeamId(null);
    if (planFor(teamId).removed.length === 0) return apply(teamId);
    setPendingTeamId(teamId);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 text-text-secondary">
        {canChange ? (
          <TeamSelect
            ref={triggerRef}
            teams={teams}
            // While a change waits for confirmation the list has no selection, so choosing the current team is a
            // change the dropdown reports (it never reports a re-pick), and closes the confirmation. The trigger
            // still reads as the current team.
            value={confirming ? '' : initiative.teamId}
            placeholder={currentTeam?.name}
            onValueChange={choose}
            // The list closing would put focus back on the trigger; with a confirmation open it belongs on its first action.
            onCloseAutoFocus={(event) => {
              if (!confirming) return;
              event.preventDefault();
              applyRef.current?.focus();
            }}
            className="border-transparent bg-transparent text-text-secondary shadow-none hover:border-border-default data-[placeholder]:text-text-secondary"
          />
        ) : (
          <span className="px-3">{currentTeam?.name ?? 'Unknown team'}</span>
        )}
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs">{initiative.status}</span>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel();
          }}
          className="mt-3 rounded-lg border border-border-strong bg-surface-card p-3 text-sm text-text-primary"
        >
          <p id={titleId} className="m-0 mb-1 font-medium">
            Change team to {confirming.team.name}?
          </p>
          <p id={bodyId} className="m-0">
            {confirmationText(confirming.team.name, confirming.plan, currencySymbol)}
          </p>
          <div className="mt-3 flex gap-2">
            <Button ref={applyRef} size="sm" onClick={() => apply(confirming.team.id)}>
              Change team
            </Button>
            <Button size="sm" variant="outline" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function confirmationText(teamName: string, plan: ReturnType<typeof planTeamChange>, currencySymbol: string): string {
  const one = plan.removedPeople.length === 1;
  const count = plan.removed.length;
  const cost = plan.cost > 0 ? ` (planned cost ${formatAmount(plan.cost, currencySymbol)})` : '';
  const goes =
    `${joinNames(plan.removedPeople.map((p) => p.name))} ${one ? "isn't an active member" : "aren't active members"} of ${teamName}. ` +
    `Their ${count === 1 ? 'allocation' : `${count} allocations`} in ${joinNames(plan.phaseLabels)} will be removed${cost}.`;
  const stays = plan.stayingPeople.length;
  if (stays === 0) return goes;
  return `${goes} ${joinNames(plan.stayingPeople.map((p) => p.name))} ${stays === 1 ? 'is' : 'are'} on both teams and ${stays === 1 ? 'stays' : 'stay'}.`;
}
