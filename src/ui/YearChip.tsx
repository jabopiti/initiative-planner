import { chipTriggerClass } from './chipTriggerClass';
import { ChevronDownIcon } from './icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ALL = 'all';

interface Props {
  years: number[];
  /** The chosen year, or null for All years. */
  selected: number | null;
  onChange: (year: number | null) => void;
}

/**
 * The Portfolio's year filter (§5.2): the one single-select chip (§9.11) — All years, then every year with cost, as
 * radio items. Picking one applies it and closes; Up and Down move between them.
 */
export function YearChip({ years, selected, onChange }: Props) {
  const active = selected !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={chipTriggerClass(active)}
        >
          {active ? `Year: ${selected}` : 'Year'}
          <ChevronDownIcon width={14} height={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-1.5">
        <DropdownMenuRadioGroup value={selected === null ? ALL : String(selected)} onValueChange={(v) => onChange(v === ALL ? null : Number(v))}>
          {[ALL, ...years.map(String)].map((value) => (
            <DropdownMenuRadioItem key={value} value={value} className="cursor-pointer">
              {value === ALL ? 'All years' : value}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
