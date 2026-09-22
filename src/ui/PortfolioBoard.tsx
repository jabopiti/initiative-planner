import { useRepositoryState } from '../state/DataContext';
import { useNewInitiativeUI } from '../state/NewInitiativeUIContext';
import { defaultBrandPack } from '../brand/defaultBrand';
import { currentPhaseId } from '../data/processState';
import { navigate } from '../router/useHashRoute';
import { EmptyState } from './EmptyState';
import styles from './PortfolioBoard.module.css';

/**
 * Portfolio overview (§5.2), scoped to slice 003: the board and its two
 * empty states. Filters, key metrics, the Getting started strip and the
 * Needs attention strip are later work (§8.5 and richer §5.2 depend on
 * data slice 003 doesn't create yet).
 */
export function PortfolioBoard() {
  const { teams, initiatives } = useRepositoryState();
  const { setOpen } = useNewInitiativeUI();

  if (teams.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState line="No initiatives yet" actionLabel="Create a team" onAction={() => navigate('/teams')} />
      </div>
    );
  }

  if (initiatives.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState line="No initiatives yet" actionLabel="Create your first initiative" onAction={() => setOpen(true)} />
      </div>
    );
  }

  const teamsById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className={styles.page}>
      <div className={styles.board}>
        {defaultBrandPack.process.map((phase) => {
          const phaseInitiatives = initiatives.filter(
            (i) => i.status === 'Active' && currentPhaseId(i, defaultBrandPack.process) === phase.id,
          );
          return (
            <div key={phase.id} className={styles.column}>
              <div className={styles.columnHeader}>
                <span>{phase.label}</span>
                <span className={styles.columnCount}>{phaseInitiatives.length}</span>
              </div>
              <div className={styles.columnBody}>
                {phaseInitiatives.map((initiative) => (
                  <a key={initiative.id} className={styles.card} href={`#/initiatives/${initiative.id}`}>
                    <div className={styles.cardName}>{initiative.name}</div>
                    <div className={styles.cardMeta}>
                      <span>{teamsById.get(initiative.teamId)?.name ?? 'Unknown team'}</span>
                      <span className={styles.badge}>Not yet known</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
