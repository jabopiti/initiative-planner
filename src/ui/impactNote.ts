import { plural } from '../data/plural';

/** "N initiative(s)": the one spelling of the impact note's count (§5.9). */
export function initiativeCount(n: number): string {
  return plural(n, 'initiative', 'initiatives');
}
