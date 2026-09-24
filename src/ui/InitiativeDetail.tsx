import { useRepository, useRepositoryState } from '../state/DataContext';
import { CommitInput } from './CommitInput';
import { InitiativeTeamRow } from './InitiativeTeamRow';
import { PhasesSection } from './PhasesSection';

/**
 * The initiative page (§5.4), built up slice by slice: header and the Phases
 * section (period, allocations) so far. Header actions, cost summary, gate
 * panel and magic bar land with later slices.
 */
export function InitiativeDetail({ id }: { id: string }) {
  const repository = useRepository();
  const { initiatives, teams } = useRepositoryState();
  const initiative = initiatives.find((i) => i.id === id);
  const team = initiative ? teams.find((t) => t.id === initiative.teamId) : undefined;

  if (!initiative) {
    return (
      <div className="max-w-[720px] p-8">
        <p>This initiative couldn&apos;t be found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] p-8">
      <h1 className="m-0 mb-2">
        <CommitInput
          className="h-auto border-transparent bg-transparent px-3 py-1.5 text-2xl font-semibold shadow-none hover:border-border-default md:text-2xl"
          aria-label="Initiative name"
          value={initiative.name}
          onCommit={(text) => repository.renameInitiative(initiative.id, text)}
        />
      </h1>
      <InitiativeTeamRow initiative={initiative} />
      <PhasesSection initiative={initiative} team={team} />
    </div>
  );
}
