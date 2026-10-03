import { useRepositoryState } from '../state/DataContext';
import { teamColorClass } from './teamColors';

/**
 * A team's colour as a small square beside its name (§9.8), only where the team is the subject: the Teams overview,
 * the team page title and the person panel. Decorative next to the name it marks, so hidden from assistive tech.
 */
export function TeamSwatch({ teamId, large = false }: { teamId: string; large?: boolean }) {
  const { teams } = useRepositoryState();
  const size = large ? 'size-3.5 rounded-[3px]' : 'size-2.5 rounded-[2px]';
  return <span data-testid="team-swatch" className={`inline-block shrink-0 ${size} ${teamColorClass(teams.map((t) => t.id), teamId)}`} aria-hidden="true" />;
}
