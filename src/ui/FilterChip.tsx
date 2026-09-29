import { useRef, useState } from 'react';
import { ChevronDownIcon, SearchIcon } from './icons';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/**
 * A filter chip (§9.11): a multi-select dropdown with a search field and checkboxes, applied instantly; an active
 * chip is highlighted and shows its count. Down moves from the search field into the options, Up from the first
 * option back; Space or Enter toggles an option; Esc closes with focus back on the chip.
 */
export function FilterChip({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const active = selected.length > 0;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  /** The search field first, then every option, in order. */
  const stops = () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>('input, [role="checkbox"]') ?? []);

  function move(event: React.KeyboardEvent, step: 1 | -1) {
    const all = stops();
    const next = all[all.indexOf(document.activeElement as HTMLElement) + step];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${active ? 'border-brand-accent bg-brand-accent-tint font-medium text-brand-accent-text' : 'border-border-strong bg-surface-card text-text-primary'}`}
        >
          {active ? `${label}: ${selected.length}` : label}
          <ChevronDownIcon size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        className="w-60 p-1.5"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') move(event, 1);
          else if (event.key === 'ArrowUp') move(event, -1);
        }}
      >
        <div className="mb-1 flex items-center gap-1.5 border-b border-border-default px-2 pb-1.5">
          <SearchIcon size={14} className="shrink-0 text-text-muted" />
          <input
            className="w-full border-0 bg-transparent py-1 text-sm outline-none placeholder:text-text-muted"
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div role="group" aria-label={label} className="max-h-64 overflow-y-auto">
          {shown.length === 0 && <p className="m-0 px-2 py-1.5 text-sm text-text-secondary">No matches</p>}
          {shown.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-subtle">
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    toggle(option.value);
                  }
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
