import { useRepositoryState } from '../state/DataContext';
import { PhasesSection } from './PhasesSection';

/**
 * The initiative page (§5.4), built up slice by slice: header and the Phases
 * section (period, allocations) so far. Header actions, cost summary, gate
 * panel and magic bar land with later slices.
 */
export function InitiativeDetail({ id }: { id: string }) {
  const { initiatives, teams, status } = useRepositoryState();
  const initiative = initiatives.find((i) => i.id === id);
  const team = initiative ? teams.find((t) => t.id === initiative.teamId) : undefined;

  if (status === 'loading') return null;

  if (!initiative) {
    return (
      <div className="max-w-[720px] p-8">
        <p>This initiative couldn&apos;t be found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] p-8">
      <h1 className="m-0 mb-2 text-2xl">{initiative.name}</h1>
      <div className="mb-6 flex items-center gap-3 text-text-secondary">
        <span>{team?.name ?? 'Unknown team'}</span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs">{initiative.status}</span>
      </div>
      <PhasesSection initiative={initiative} team={team} />
    </div>
  );
}
