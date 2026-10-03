/** The brand pack's team colours (§2, §9.8) as static class strings, so Tailwind sees them. */
const TEAM_COLORS = ['bg-team-1', 'bg-team-2', 'bg-team-3', 'bg-team-4', 'bg-team-5', 'bg-team-6'];

/**
 * A team's colour: the one at its position in the teams file, inactive teams included, so it never shifts when a
 * team is deactivated; wraps after six (§2). `teamIds` is every team's id in file order.
 */
export function teamColorClass(teamIds: string[], teamId: string): string {
  const index = Math.max(0, teamIds.indexOf(teamId));
  return TEAM_COLORS[index % TEAM_COLORS.length];
}
