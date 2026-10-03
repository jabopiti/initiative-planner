import { initiativeCount } from './impactNote';
import { joinList } from '../data/joinList';
import { plural } from '../data/plural';

/** What Reset says it removes (§9.9): the counts from the dataset, inactive ones included, a zero left out. */
export function resetLine(initiatives: number, people: number, teams: number): string {
  const parts = [
    initiatives > 0 && initiativeCount(initiatives),
    people > 0 && plural(people, 'person', 'people'),
    teams > 0 && plural(teams, 'team', 'teams'),
  ].filter((p): p is string => p !== false);
  const removes = parts.length > 0 ? `This removes ${joinList(parts)}, and sets` : 'This sets';
  return `${removes} roles, countries and rates back to their defaults. This can't be undone.`;
}
