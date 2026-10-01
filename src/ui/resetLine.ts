import { initiativeCount } from './impactNote';
import { plural } from './plural';

/** "a, b and c", for the parts of the Reset line that are not zero. */
const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** What Reset says it removes (§9.9): the counts from the dataset, inactive ones included, a zero left out. */
export function resetLine(initiatives: number, people: number, teams: number): string {
  const parts = [
    initiatives > 0 && initiativeCount(initiatives),
    people > 0 && plural(people, 'person', 'people'),
    teams > 0 && plural(teams, 'team', 'teams'),
  ].filter((p): p is string => p !== false);
  const removes = parts.length > 0 ? `This removes ${joinAnd(parts)}, and sets` : 'This sets';
  return `${removes} roles, countries and rates back to their defaults. This can't be undone.`;
}
