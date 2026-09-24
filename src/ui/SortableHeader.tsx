import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TableSort } from './tableSort';

interface Props {
  label: string;
  sortKey: string;
  sort: TableSort;
  align?: 'left' | 'right';
}

/** A column header that sorts on click or Enter/Space and announces its direction via aria-sort (§9.11). */
export function SortableHeader({ label, sortKey, sort, align = 'left' }: Props) {
  const active = sortKey === sort.key;
  const Chevron = sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`border-b border-border-default px-3 py-2 font-medium ${align === 'right' ? 'text-right' : ''}`}
    >
      <button
        type="button"
        className="group inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 font-medium text-inherit"
        onClick={() => sort.toggle(sortKey)}
      >
        {label}
        <Chevron
          size={14}
          aria-hidden="true"
          className={active ? '' : 'opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40'}
        />
      </button>
    </th>
  );
}
