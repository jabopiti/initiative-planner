import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { allocationCount, describeTeamChange } from '../data/teamChange';
import type { Initiative, Team } from '../data/types';
import { formatAmount } from './formatAmount';
import { TeamSelect } from './TeamSelect';
import { Button } from '@/components/ui/button';

/**
 * The initiative header's team and status (§5.4). The team is a dropdown of the active teams; choosing another one
 * that would take allocations out of the open phases asks first, in place under the header (no modal), naming who
 * goes and who stays (§7.2). The dropdown keeps showing the current team until the change is confirmed. A Closed or
 * Cancelled initiative keeps its team, shown as text.
 */
export function InitiativeTeamRow({ initiative }: { initiative: Initiative }) {
  const repository = useRepository();
  const { currencySymbol } = useBrand();
  const { teams } = useRepositoryState();
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const currentTeam = teams.find((t) => t.id === initiative.teamId);
  const canChange = initiative.status === 'Active' || initiative.status === 'On Hold';

  // Worked out on every render, so the names and figures shown are the ones that would be removed now.
  const pendingTeam = teams.find((t) => t.id === pendingTeamId);
  const plan = pendingTeam && repository.previewTeamChange(initiative.id, pendingTeam.id);
  const confirming = pendingTeam && plan && plan.removed.length > 0 ? { team: pendingTeam, plan } : null;

  const apply = (team: Team) => {
    setPendingTeamId(null);
    const change = repository.changeTeam(initiative.id, team.id);
    triggerRef.current?.focus();
    if (!change || change.removed.length === 0) return;
    toast(`Team changed to ${team.name}, ${allocationCount(change.removed.length)} removed.`, {
      duration: 10_000,
      action: { label: 'Undo', onClick: () => repository.restoreTeam(initiative.id, change) },
    });
  };
  const cancel = () => {
    setPendingTeamId(null);
    triggerRef.current?.focus();
  };

  const choose = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    if (repository.previewTeamChange(initiative.id, team.id)?.removed.length === 0) return apply(team);
    setPendingTeamId(team.id);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 text-text-secondary">
        {canChange ? (
          <TeamSelect
            ref={triggerRef}
            teams={teams}
            value={initiative.teamId}
            onReselect={() => setPendingTeamId(null)}
            onValueChange={choose}
            // The list closing would put focus back on the trigger; with a confirmation open it belongs on its first action.
            onCloseAutoFocus={(event) => {
              if (!confirming) return;
              event.preventDefault();
              applyRef.current?.focus();
            }}
            className="border-transparent bg-transparent text-text-secondary shadow-none hover:border-border-default"
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
            {describeTeamChange(confirming.plan, confirming.team.name, (cost) => formatAmount(cost, currencySymbol))}
          </p>
          <div className="mt-3 flex gap-2">
            <Button ref={applyRef} size="sm" onClick={() => apply(confirming.team)}>
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
