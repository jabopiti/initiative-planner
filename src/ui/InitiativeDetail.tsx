import { useEffect, useState } from 'react';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { isInitiativeFrozen } from '../data/frozen';
import { FILE_PATHS } from '../data/types';
import { useFieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { CommitTextarea } from './CommitTextarea';
import { CostSummary } from './CostSummary';
import { headerFieldClass } from './headerFieldClass';
import { InitiativeTeamRow } from './InitiativeTeamRow';
import { JumpContext, jumpTo, type Jump } from './jumpTo';
import { MagicBar } from './MagicBar';
import { PhasesSection } from './PhasesSection';

/**
 * The initiative page (§5.4): header, cost summary, Phases (with the current gate's checklist panel beneath
 * the current phase) and the sticky magic bar. A Closed or Cancelled initiative shows it all read-only (§8.4). `focus`/`openPhaseId` arrive from a Needs attention strip link
 * (§5.2, §8.5): the place to scroll and focus on arrival, and, for a link into a collapsed phase, the phase to open
 * first so that place exists in the DOM. A jump from the page itself (Go to <phase>, a blocker) works the same way.
 */
export function InitiativeDetail({ id, focus, openPhaseId }: { id: string; focus?: string | null; openPhaseId?: string | null }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const conflict = useFieldConflict();
  const { initiatives, teams, deletedWithLostEdit } = useRepositoryState();
  const initiative = initiatives.find((i) => i.id === id);
  const team = initiative ? teams.find((t) => t.id === initiative.teamId) : undefined;

  // The latest jump: the Phases section opens its phase while rendering, so once committed its place is in the DOM.
  const arrival = (): Jump | null => (focus ? { id: focus, phaseId: openPhaseId ?? undefined } : null);
  const [jump, setJump] = useState(arrival);
  // A new link into the page already open (the same initiative, another place) jumps again.
  const [linked, setLinked] = useState({ focus, openPhaseId });
  if (linked.focus !== focus || linked.openPhaseId !== openPhaseId) {
    setLinked({ focus, openPhaseId });
    setJump(arrival());
  }
  useEffect(() => {
    if (jump) jumpTo(jump.id);
  }, [jump]);

  if (!initiative) {
    return (
      <div className="max-w-page p-8">
        <p>This initiative couldn&apos;t be found.</p>
        {/* Deleted by someone else while an edit here waited to be saved (§3): the edit is not lost silently. */}
        {deletedWithLostEdit.has(id) && (
          <p className="text-sm text-text-secondary">{deletedWithLostEdit.get(id)} was deleted, so your last change to it wasn&apos;t saved.</p>
        )}
        <Button type="button" className="mt-3" onClick={() => navigate('/portfolio')}>
          Back to Portfolio
        </Button>
      </div>
    );
  }

  return (
    <JumpContext.Provider value={setJump}>
      <div className="flex min-h-full flex-col">
        <div className="max-w-page flex-1 p-8 pb-24">
          {/* Pulled back by the fields' own padding, so their text lines up with the cards below (§5.4). */}
          <div className="-mx-3">
            {isInitiativeFrozen(initiative) ? (
              // A Closed or Cancelled initiative is a record (§8.4): name and description read-only and muted, an empty description hidden.
              <>
                <h1 className="m-0 mb-2 px-3 text-2xl font-semibold break-words text-text-secondary">{initiative.name}</h1>
                {initiative.description && <p className="m-0 mb-2 px-3 text-sm text-text-muted">{initiative.description}</p>}
              </>
            ) : (
              <>
                <h1 className="m-0 mb-2">
                  {/* Wraps to a second line rather than clipping a long name (F09), growing to fit it. */}
                  <CommitTextarea
                    autoGrow
                    className={`min-h-0 px-3 py-1.5 text-2xl font-semibold md:text-2xl ${headerFieldClass}`}
                    aria-label="Initiative name"
                    changed={changed(FILE_PATHS.initiative(initiative.id), ['name'])}
                    failure={failure(FILE_PATHS.initiative(initiative.id), ['name'])}
                    conflict={conflict(FILE_PATHS.initiative(initiative.id), ['name'])}
                    value={initiative.name}
                    onCommit={(text) => repository.renameInitiative(initiative.id, text)}
                  />
                </h1>
                <CommitTextarea
                  className={`mb-2 min-h-0 px-3 py-1.5 text-sm text-text-secondary ${headerFieldClass}`}
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
          </div>
          <InitiativeTeamRow initiative={initiative} />
          <CostSummary initiative={initiative} />
          <PhasesSection initiative={initiative} team={team} reveal={jump} />
        </div>
        {/* Keyed so its own state (a selected Pass gate, "Passed <gate>") never carries over when the route moves to another initiative. */}
        <MagicBar key={initiative.id} initiative={initiative} />
      </div>
    </JumpContext.Provider>
  );
}
