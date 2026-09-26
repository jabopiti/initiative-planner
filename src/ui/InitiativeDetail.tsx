import { useEffect } from 'react';
import { FILE_PATHS } from '../data/types';
import { useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { CommitInput } from './CommitInput';
import { CostSummary } from './CostSummary';
import { InitiativeTeamRow } from './InitiativeTeamRow';
import { jumpTo } from './jumpTo';
import { MagicBar } from './MagicBar';
import { PhasesSection } from './PhasesSection';

/**
 * The initiative page (§5.4): header, cost summary, Phases (with the current gate's checklist panel beneath
 * the current phase) and the sticky magic bar. Header actions beyond the team row (Put on hold, Cancel,
 * Duplicate, Delete) land with later slices. `focus`/`openPhaseId` arrive from a Needs attention strip link
 * (§5.2, §8.5): the place to scroll and focus on arrival, and, for an Overdue link into a collapsed phase, the
 * phase to open first so that place exists in the DOM.
 */
export function InitiativeDetail({ id, focus, openPhaseId }: { id: string; focus?: string | null; openPhaseId?: string | null }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const { initiatives, teams } = useRepositoryState();
  const initiative = initiatives.find((i) => i.id === id);
  const team = initiative ? teams.find((t) => t.id === initiative.teamId) : undefined;

  useEffect(() => {
    if (focus) jumpTo(focus);
  }, [focus]);

  if (!initiative) {
    return (
      <div className="max-w-[720px] p-8">
        <p>This initiative couldn&apos;t be found.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="max-w-[720px] flex-1 p-8 pb-24">
        <h1 className="m-0 mb-2">
          <CommitInput
            className="h-auto border-transparent bg-transparent px-3 py-1.5 text-2xl font-semibold shadow-none hover:border-border-default md:text-2xl"
            aria-label="Initiative name"
            changed={changed(FILE_PATHS.initiative(initiative.id), ['name'])}
            value={initiative.name}
            onCommit={(text) => repository.renameInitiative(initiative.id, text)}
          />
        </h1>
        <InitiativeTeamRow initiative={initiative} />
        <CostSummary initiative={initiative} />
        <PhasesSection initiative={initiative} team={team} openPhaseId={openPhaseId} />
      </div>
      <MagicBar initiative={initiative} />
    </div>
  );
}
