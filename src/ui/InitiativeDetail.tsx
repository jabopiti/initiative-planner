import { useRepositoryState } from '../state/DataContext';

/**
 * A minimal initiative page: enough for "the initiative's page opens"
 * (slice 003's acceptance criteria) to be real. The full page — header
 * actions, cost summary, phases, gate panel, magic bar — is §5.4, not in
 * slice 003's spec_sections; it lands with slice 005 onward.
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
      <p className="text-sm text-text-muted">
        Planning (phases, allocations, cost, gates) isn&apos;t built yet — that starts with slice 005.
      </p>
    </div>
  );
}
