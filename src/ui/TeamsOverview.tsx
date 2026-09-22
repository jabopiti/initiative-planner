import { useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { defaultBrandPack } from '../brand/defaultBrand';
import { currentPhaseId } from '../data/processState';
import { EmptyState } from './EmptyState';
import { PlusIcon } from './icons';
import styles from './TeamsOverview.module.css';

/** Teams overview (§5.7), scoped to slice 003: name, size, per-phase initiative counts, and New team. */
export function TeamsOverview() {
  const repository = useRepository();
  const { teams, initiatives } = useRepositoryState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startCreating() {
    setCreating(true);
    setName('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    repository.createTeam(name.trim());
    setCreating(false);
    setName('');
  }

  if (teams.length === 0 && !creating) {
    return (
      <div className={styles.page}>
        <EmptyState line="No teams yet" actionLabel="Create a team" onAction={startCreating} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Teams</h1>
        {creating ? (
          <form
            className={styles.newTeamForm}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCreating(false);
            }}
          >
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className={styles.newTeamInput}
            />
            <button type="submit" className={styles.newTeamSubmit} disabled={!name.trim()}>
              Create
            </button>
          </form>
        ) : (
          <button type="button" className={styles.newTeamButton} onClick={startCreating}>
            <PlusIcon />
            New team
          </button>
        )}
      </div>

      <div className={styles.grid}>
        {teams.map((team) => {
          const teamInitiatives = initiatives.filter((i) => i.teamId === team.id && i.status === 'Active');
          const phaseCounts = defaultBrandPack.process.map((phase) => ({
            phase,
            count: teamInitiatives.filter((i) => currentPhaseId(i, defaultBrandPack.process) === phase.id).length,
          }));
          return (
            <div key={team.id} className={team.active ? styles.card : styles.cardInactive}>
              <h2 className={styles.cardName}>{team.name}</h2>
              <p className={styles.cardMeta}>0 members</p>
              <div className={styles.phaseChips}>
                {phaseCounts.map(({ phase, count }) => (
                  <span key={phase.id} className={styles.phaseChip}>
                    {phase.label}: {count}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
