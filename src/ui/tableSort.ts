import { useState } from 'react';
import type { SortDir } from '../data/sortRows';

/** Sort state for one table: a click sorts ascending, a second click on the same column reverses. */
export function useTableSort(defaultKey: string) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: defaultKey, dir: 'asc' });
  function toggle(key: string) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  }
  return { ...sort, toggle };
}

export type TableSort = ReturnType<typeof useTableSort>;
