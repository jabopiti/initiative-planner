import { useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: SortValue, b: SortValue): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
}

/**
 * Sorts a copy of `rows` by the chosen column (§9.11). Ties fall back to the default
 * (name) order, and reversing flips only the column comparison, so rows with equal
 * values never swap places.
 */
export function sortRows<T>(
  rows: readonly T[],
  columns: Record<string, (row: T) => SortValue>,
  key: string,
  dir: SortDir,
  defaultKey: string,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const by = columns[key];
  const byDefault = columns[defaultKey];
  return [...rows].sort((a, b) => sign * compare(by(a), by(b)) || compare(byDefault(a), byDefault(b)));
}

/** Sort state for one table: a click sorts ascending, a second click on the same column reverses. */
export function useTableSort(defaultKey: string) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: defaultKey, dir: 'asc' });
  function toggle(key: string) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  }
  return { ...sort, toggle };
}
