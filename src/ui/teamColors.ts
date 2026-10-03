import { useMemo } from 'react';
import { useRepositoryState } from '../state/DataContext';

/** The brand pack's six team colours (§2, §9.8; the count src/brand/contrast.ts checks) as static class strings, so Tailwind sees them. */
const TEAM_COLORS = ['bg-team-1', 'bg-team-2', 'bg-team-3', 'bg-team-4', 'bg-team-5', 'bg-team-6'];

/**
 * Each team's colour: the one at its position in the teams file, inactive teams included, so it never shifts when a
 * team is deactivated; wraps after six (§2). `teamIds` is every team's id in file order;
 * an unknown id gets the first colour.
 */
export function teamColorClasses(teamIds: string[]): (teamId: string) => string {
  const byId = new Map(teamIds.map((id, i) => [id, TEAM_COLORS[i % TEAM_COLORS.length]]));
  return (teamId) => byId.get(teamId) ?? TEAM_COLORS[0];
}

/** Each team's colour class by team id, rebuilt only when the teams change. */
export function useTeamColors(): (teamId: string) => string {
  const { teams } = useRepositoryState();
  return useMemo(() => teamColorClasses(teams.map((t) => t.id)), [teams]);
}
