import { useState, type ReactNode } from 'react';
import { formatMonth } from '../data/dates';
import { joinList } from '../data/joinList';
import type { FreeCapacity } from '../data/personLoad';
import { roleLabel } from '../data/roleLabel';
import type { Person, Role, Team } from '../data/types';
import { PlusIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { focusRing } from '@/components/ui/focus-ring';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Above this many people the chips give way to the searchable picker (§5.4). */
export const MAX_CHIPS = 12;

/**
 * Where a person's other counted work is in the month that limits their free capacity (§5.4, §5.11), after their role:
 * "Developer · 100% on Checkout Redesign (Platform) in Oct 2026". The role alone when nothing else is allocated then.
 */
export function rosterDetail(role: string, free: FreeCapacity | undefined, teams: Team[]): string {
  const loads = free?.limiting.loads ?? [];
  if (loads.length === 0) return role;
  const where = loads.map((l) => `${Math.round(l.allocationPct)}% on ${l.initiativeName} (${teams.find((t) => t.id === l.teamId)?.name ?? 'another team'})`);
  return `${role} · ${joinList(where)} in ${formatMonth(free!.limiting.month)}`;
}

/**
 * The team's active members not yet on the phase (§5.4, §5.11), most free first: one chip each, "Sofia Molina · 50% free",
 * which adds them at that free capacity; with more than {@link MAX_CHIPS}, the searchable Add person picker instead.
 * `copy` (Copy from <previous costed phase>) sits at the end of the same row.
 */
export function TeamRoster({
  phaseLabel,
  addable,
  free,
  roles,
  teams,
  highlight,
  copy,
  onAdd,
}: {
  phaseLabel: string;
  addable: Person[];
  /** Free capacity per person; undefined without a valid period (§5.11). */
  free: Map<string, FreeCapacity> | undefined;
  roles: Role[];
  /** For naming the teams where a person's load is. */
  teams: Team[];
  /** This phase's missing people are the highlighted next step. */
  highlight: boolean;
  copy?: ReactNode;
  onAdd: (personId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const freeText = (pct: number | undefined) =>
    pct === undefined ? null : <span className={cn('tabular-nums', pct === 0 ? 'text-warning-text' : 'text-text-secondary')}>· {pct}% free</span>;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Add people to ${phaseLabel}`}>
      {addable.length > MAX_CHIPS ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className={cn(highlight && 'border-brand-accent font-medium text-brand-accent-text')} aria-label={`Add person to ${phaseLabel}`}>
              <PlusIcon />
              Add person
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <Command label="Search people">
              <CommandInput placeholder="Search people" />
              <CommandList>
                <CommandEmpty>No one matches.</CommandEmpty>
                <CommandGroup>
                  {addable.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${roleLabel(p, roles)}`}
                      onSelect={() => {
                        setOpen(false);
                        onAdd(p.id);
                      }}
                    >
                      <span className="flex-1">
                        {p.name} · {roleLabel(p, roles)}
                      </span>
                      {freeText(free?.get(p.id)?.pct)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        addable.map((p) => {
          const personFree = free?.get(p.id);
          const detail = rosterDetail(roleLabel(p, roles), personFree, teams);
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    `inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-input bg-surface-card py-0.5 pr-2.5 pl-2 text-caption text-text-primary hover:bg-surface-subtle ${focusRing}`,
                    highlight && 'border-brand-accent',
                  )}
                  aria-label={`Add ${p.name}${personFree ? `, ${personFree.pct}% free` : ''}. ${detail}`}
                  onClick={() => onAdd(p.id)}
                >
                  <PlusIcon width={14} height={14} className={highlight ? 'text-brand-accent-text' : 'text-text-secondary'} />
                  {p.name}
                  {freeText(personFree?.pct)}
                </button>
              </TooltipTrigger>
              <TooltipContent>{detail}</TooltipContent>
            </Tooltip>
          );
        })
      )}
      {copy && <span className="ml-auto">{copy}</span>}
    </div>
  );
}
