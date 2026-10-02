import { useEffect } from 'react';
import { isInitiativeFrozen } from '../data/frozen';
import { FILE_PATHS } from '../data/types';
import { useFieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { CommitInput } from './CommitInput';
import { CommitTextarea } from './CommitTextarea';
import { CostSummary } from './CostSummary';
import { InitiativeTeamRow } from './InitiativeTeamRow';
import { jumpTo } from './jumpTo';
import { MagicBar } from './MagicBar';
import { PhasesSection } from './PhasesSection';

/**
 * The initiative page (§5.4): header, cost summary, Phases (with the current gate's checklist panel beneath
 * the current phase) and the sticky magic bar. A Closed or Cancelled initiative shows it all read-only (§8.4). `focus`/`openPhaseId` arrive from a Needs attention strip link
 * (§5.2, §8.5): the place to scroll and focus on arrival, and, for an Overdue link into a collapsed phase, the
 * phase to open first so that place exists in the DOM.
 */
export function InitiativeDetail({ id, focus, openPhaseId }: { id: string; focus?: string | null; openPhaseId?: string | null }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const conflict = useFieldConflict();
  const { initiatives, teams, deletedWithLostEdit } = useRepositoryState();
  const initiative = initiatives.find((i) => i.id === id);
  const team = initiative ? teams.find((t) => t.id === initiative.teamId) : undefined;

  useEffect(() => {
    if (focus) jumpTo(focus);
  }, [focus]);

  if (!initiative) {
    return (
      <div className="max-w-page p-8">
        <p>This initiative couldn&apos;t be found.</p>
        {/* Deleted by someone else while an edit here waited to be saved (§3): the edit is not lost silently. */}
        {deletedWithLostEdit.has(id) && (
          <p className="text-sm text-text-secondary">{deletedWithLostEdit.get(id)} was deleted, so your last change to it wasn&apos;t saved.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="max-w-page flex-1 p-8 pb-24">
        {isInitiativeFrozen(initiative) ? (
          // A Closed or Cancelled initiative is a record (§8.4): name and description read-only and muted, an empty description hidden.
          <>
            <h1 className="m-0 mb-2 px-3 py-1.5 text-2xl font-semibold text-text-secondary">{initiative.name}</h1>
            {initiative.description && <p className="m-0 mb-2 px-3 py-1.5 text-sm text-text-muted">{initiative.description}</p>}
          </>
        ) : (
          <>
            <h1 className="m-0 mb-2">
              <CommitInput
                className="h-auto border-transparent bg-transparent px-3 py-1.5 text-2xl font-semibold shadow-none hover:border-border-default md:text-2xl"
                aria-label="Initiative name"
                changed={changed(FILE_PATHS.initiative(initiative.id), ['name'])}
                failure={failure(FILE_PATHS.initiative(initiative.id), ['name'])}
                conflict={conflict(FILE_PATHS.initiative(initiative.id), ['name'])}
                value={initiative.name}
                onCommit={(text) => repository.renameInitiative(initiative.id, text)}
              />
            </h1>
            <CommitTextarea
              className="mb-2 min-h-0 border-transparent bg-transparent px-3 py-1.5 text-sm text-text-secondary shadow-none hover:border-border-default"
              aria-label="Description"
              placeholder="Add a description"
              changed={changed(FILE_PATHS.initiative(initiative.id), ['description'])}
              failure={failure(FILE_PATHS.initiative(initiative.id), ['description'])}
              conflict={conflict(FILE_PATHS.initiative(initiative.id), ['description'])}
              value={initiative.description ?? ''}
              onCommit={(text) => repository.setDescription(initiative.id, text)}
            />
          </>
        )}
        <InitiativeTeamRow initiative={initiative} />
        <CostSummary initiative={initiative} />
        <PhasesSection initiative={initiative} team={team} openPhaseId={openPhaseId} />
      </div>
      {/* Keyed so its own state (a selected Pass gate, "Passed <gate>") never carries over when the route moves to another initiative. */}
      <MagicBar key={initiative.id} initiative={initiative} />
    </div>
  );
}
