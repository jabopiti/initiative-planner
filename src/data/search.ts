import type { Initiative, Person, Team } from './types';

/** How many results one group of the search overlay shows (§5.1). */
export const SEARCH_GROUP_LIMIT = 5;

/** Text folded for matching: lower case, accents removed, each folded character mapped back to its place in the original. */
interface Folded {
  text: string;
  origin: number[];
}

function fold(source: string): Folded {
  let text = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of source) {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const unit of folded) {
      text += unit;
      origin.push(index);
    }
    index += char.length;
  }
  return { text, origin };
}

/** Where the folded query sits in `text`, as a range of the original text; null when it does not. */
export function findMatch(text: string, query: string): [number, number] | null {
  const needle = fold(query.trim()).text;
  if (!needle) return null;
  const haystack = fold(text);
  const at = haystack.text.indexOf(needle);
  if (at < 0) return null;
  const last = at + needle.length - 1;
  const lastChar = String.fromCodePoint(text.codePointAt(haystack.origin[last]) ?? 0);
  return [haystack.origin[at], haystack.origin[last] + lastChar.length];
}

export interface InitiativeHit {
  initiative: Initiative;
  /** Which text matched: a name match ranks before a description match. */
  field: 'name' | 'description';
  range: [number, number];
}

export interface NamedHit<T> {
  item: T;
  range: [number, number];
}

export interface Group<T> {
  hits: T[];
  /** Every match, not only the ones shown. */
  total: number;
}

export interface SearchResults {
  initiatives: Group<InitiativeHit>;
  people: Group<NamedHit<Person>>;
  teams: Group<NamedHit<Team>>;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function cap<T>(hits: T[]): Group<T> {
  return { hits: hits.slice(0, SEARCH_GROUP_LIMIT), total: hits.length };
}

function named<T extends { name: string }>(items: T[], query: string): NamedHit<T>[] {
  return items
    .flatMap((item) => {
      const range = findMatch(item.name, query);
      return range ? [{ item, range }] : [];
    })
    .sort((a, b) => byName(a.item.name, b.item.name));
}

/** The matches for a typed query (§5.1): initiatives by name then description, people and teams by name. */
export function searchAll(query: string, data: { initiatives: Initiative[]; people: Person[]; teams: Team[] }): SearchResults {
  const empty = { hits: [], total: 0 };
  if (!query.trim()) return { initiatives: empty, people: empty, teams: empty };
  const initiativeHits = data.initiatives.flatMap((initiative): InitiativeHit[] => {
    const inName = findMatch(initiative.name, query);
    if (inName) return [{ initiative, field: 'name', range: inName }];
    const inDescription = findMatch(initiative.description ?? '', query);
    return inDescription ? [{ initiative, field: 'description', range: inDescription }] : [];
  });
  initiativeHits.sort((a, b) => (a.field === b.field ? byName(a.initiative.name, b.initiative.name) : a.field === 'name' ? -1 : 1));
  return { initiatives: cap(initiativeHits), people: cap(named(data.people, query)), teams: cap(named(data.teams, query)) };
}
