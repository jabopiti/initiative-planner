/** One colour per team (dot beside the team row, matching its segment of the capacity bar). Static class strings so Tailwind sees them. */
const TEAM_COLORS = ['bg-violet-600', 'bg-teal-600', 'bg-amber-500', 'bg-rose-500', 'bg-sky-600', 'bg-lime-600'];

export function teamColorClass(teamIds: string[], teamId: string): string {
  const index = Math.max(0, teamIds.indexOf(teamId));
  return TEAM_COLORS[index % TEAM_COLORS.length];
}
