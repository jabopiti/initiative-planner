import { useRepositoryState } from '../state/DataContext';
import styles from './InitiativeDetail.module.css';

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
      <div className={styles.page}>
        <p>This initiative couldn&apos;t be found.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.name}>{initiative.name}</h1>
      <div className={styles.meta}>
        <span>{team?.name ?? 'Unknown team'}</span>
        <span className={styles.statusBadge}>{initiative.status}</span>
      </div>
      <p className={styles.placeholder}>
        Planning (phases, allocations, cost, gates) isn&apos;t built yet — that starts with slice 005.
      </p>
    </div>
  );
}
