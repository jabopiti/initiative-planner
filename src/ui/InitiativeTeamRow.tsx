import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { isInitiativeFrozen } from '../data/frozen';
import { allocationCount, describeTeamChange } from '../data/teamChange';
import { causeText } from '../github/errors';
import { navigate, normalizeHash } from '../router/useHashRoute';
import type { Initiative, Team } from '../data/types';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { DeleteConfirmation, type DeleteStep } from './DeleteConfirmation';
import { formatAmount } from './formatAmount';
import { InitiativeActionsMenu } from './InitiativeActionsMenu';
import { FrozenStrip } from './FrozenStrip';
import { headerFieldClass } from './headerFieldClass';
import { OwnerSelect } from './OwnerSelect';
import { TeamSelect } from './TeamSelect';
import { StatusLabel } from './StatusLabel';
import { Button } from '@/components/ui/button';

/**
 * The initiative header's meta row (§5.4): team, owner, status badge and approval track badge. The team is a
 * dropdown of the active teams; choosing another one that would take allocations out of the open phases asks
 * first, in place under the header (no modal), naming who goes and who stays (§7.2). The dropdown keeps
 * showing the current team until the change is confirmed. A Closed or Cancelled initiative keeps its team,
 * shown as text. Delete, from the Actions menu, asks in the same place (§9.9); once deleted, the Initiatives table
 * replaces the page in history.
 */
export function InitiativeTeamRow({ initiative }: { initiative: Initiative }) {
  const repository = useRepository();
  const { currencySymbol } = useBrand();
  const { teams, people, memberships } = useRepositoryState();
  const frozen = isInitiativeFrozen(initiative);
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [deleteStep, setDeleteStep] = useState<DeleteStep | null>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const deleteFocusRef = useRef<HTMLButtonElement>(null);

  const currentTeam = teams.find((t) => t.id === initiative.teamId);

  // Worked out on every render, so the names and figures shown are the ones that would be removed now.
  const pendingTeam = teams.find((t) => t.id === pendingTeamId);
  const plan = pendingTeam && repository.previewTeamChange(initiative.id, pendingTeam.id);
  // Null once the initiative is frozen, since previewTeamChange refuses then: an open confirmation closes (§8.4).
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

  const closeDelete = () => {
    setDeleteStep(null);
    actionsRef.current?.focus();
  };
  const confirmDelete = async () => {
    setDeleteStep('deleting');
    // Only from this initiative's page: a delete that lands after the user has gone elsewhere leaves them there.
    // The route changes first, so the page never shows the initiative missing on the way out.
    const result = await repository.deleteInitiative(initiative.id, () => {
      if (normalizeHash(window.location.hash).split('?')[0] !== `/initiatives/${initiative.id}`) return;
      const left = new Promise<void>((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }));
      navigate('/initiatives', { replace: true });
      return left;
    });
    if (result === 'deleted') return;
    setDeleteStep(result === 'refused' ? 'refused' : { failed: causeText(result.failed) });
  };

  const choose = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    if (repository.previewTeamChange(initiative.id, team.id)?.removed.length === 0) return apply(team);
    if (deleteStep !== 'deleting') setDeleteStep(null);
    setPendingTeamId(team.id);
  };

  return (
    <div className="mb-6">
      {/* Pulled back by the fields' own padding, so their text lines up with the cards below (§5.4). */}
      <div className="-ml-3 flex items-center gap-3 text-text-secondary">
        {!frozen ? (
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
            className={`text-text-secondary ${headerFieldClass}`}
          />
        ) : (
          <span className="px-3">{currentTeam?.name ?? 'Unknown team'}</span>
        )}
        <OwnerSelect
          people={people}
          memberships={memberships}
          teamId={initiative.teamId}
          teamName={currentTeam?.name ?? 'Unknown team'}
          value={initiative.ownerId}
          onValueChange={(ownerId) => repository.setOwner(initiative.id, ownerId)}
          readOnly={frozen}
          className={`text-text-secondary ${headerFieldClass}`}
        />
        <StatusLabel status={initiative.status} className="text-caption" />
        <ApprovalTrackBadge initiative={initiative} />
        <InitiativeActionsMenu
          initiative={initiative}
          triggerRef={actionsRef}
          ui={{
            confirmDelete: () => {
              // A delete already running keeps its confirmation: asking again would offer a Cancel that can't stop it.
              if (deleteStep === 'deleting') return () => actionsRef.current?.focus();
              setPendingTeamId(null);
              setDeleteStep('asking');
              return () => deleteFocusRef.current?.focus();
            },
          }}
        />
      </div>

      <FrozenStrip initiative={initiative} />

      {deleteStep && <DeleteConfirmation initiative={initiative} step={deleteStep} focusRef={deleteFocusRef} onConfirm={() => void confirmDelete()} onClose={closeDelete} />}

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel();
          }}
          className="mt-3 rounded-lg border border-border-strong bg-surface-card p-3 text-body text-text-primary"
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
