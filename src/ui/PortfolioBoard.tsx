import { useMemo } from 'react';
import { useRepositoryState } from '../state/DataContext';
import { useNewInitiativeUI } from '../state/NewInitiativeUIContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import type { Initiative } from '../data/types';
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
  const brand = useBrand();
  const { teams, initiatives } = useRepositoryState();
  const { setOpen } = useNewInitiativeUI();

  const initiativesByPhase = useMemo(() => {
    const byPhase = new Map<string, Initiative[]>(brand.process.map((phase) => [phase.id, []]));
    for (const initiative of initiatives) {
      if (initiative.status !== 'Active') continue;
      byPhase.get(currentPhaseId(initiative, brand.process))?.push(initiative);
    }
    return byPhase;
  }, [brand.process, initiatives]);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

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

  return (
    <div className={styles.page}>
      <div className={styles.board}>
        {brand.process.map((phase) => {
          const phaseInitiatives = initiativesByPhase.get(phase.id) ?? [];
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
