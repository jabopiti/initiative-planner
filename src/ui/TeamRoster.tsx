import { useState, type ReactNode } from 'react';
import { otherLoadMonths, warningMonths, type Load } from '../data/capacity';
import type { Period } from '../data/cost';
import { formatMonth } from '../data/dates';
import { roleLabel } from '../data/roleLabel';
import type { Person, Role, Team } from '../data/types';
import { PlusIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Above this many people the chips give way to the searchable picker (§5.4). */
export const MAX_CHIPS = 12;

/**
 * Where a person's other counted work is in the month that limits their free capacity (§5.4, §5.11), after their role:
 * "Developer · 100% on Checkout Redesign (Platform) in Oct 2026". The role alone when nothing else is allocated.
 */
export function rosterDetail(person: Person, role: string, team: Team, teams: Team[], period: Period, loads: Load[], today: string): string {
  const months = otherLoadMonths(person.id, team.id, warningMonths(period.startDate, period.endDate, today), loads);
  let limiting = months[0];
  for (const m of months) if (m.onTeam + m.otherTeams > limiting.onTeam + limiting.otherTeams) limiting = m;
  if (!limiting || limiting.loads.length === 0) return role;
  const where = limiting.loads.map((l) => `${Math.round(l.allocationPct)}% on ${l.initiativeName} (${teams.find((t) => t.id === l.teamId)?.name ?? 'another team'})`);
  return `${role} · ${where.join(', ')} in ${formatMonth(limiting.month)}`;
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
  detail,
  highlight,
  copy,
  onAdd,
}: {
  phaseLabel: string;
  addable: Person[];
  /** Free capacity per person; undefined without a valid period (§5.11). */
  free: Map<string, number> | undefined;
  roles: Role[];
  /** The role and where the person's load is, for the chip's tooltip and accessible name. */
  detail: (person: Person) => string;
  /** This phase's missing people are the highlighted next step. */
  highlight: boolean;
  copy?: ReactNode;
  onAdd: (personId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (addable.length === 0 && !copy) return null;
  const freeText = (p: Person) => {
    const pct = free?.get(p.id);
    return pct === undefined ? null : <span className={cn('tabular-nums', pct === 0 ? 'text-warning-text' : 'text-text-secondary')}>· {pct}% free</span>;
  };
  const freeLabel = (p: Person) => (free?.get(p.id) === undefined ? '' : `, ${free.get(p.id)}% free`);

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
                      {freeText(p)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        addable.map((p) => (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-input bg-surface-card py-0.5 pr-2.5 pl-2 text-caption text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  highlight && 'border-brand-accent',
                )}
                aria-label={`Add ${p.name}${freeLabel(p)}. ${detail(p)}`}
                onClick={() => onAdd(p.id)}
              >
                <PlusIcon width={14} height={14} className={highlight ? 'text-brand-accent-text' : 'text-text-secondary'} />
                {p.name}
                {freeText(p)}
              </button>
            </TooltipTrigger>
            <TooltipContent>{detail(p)}</TooltipContent>
          </Tooltip>
        ))
      )}
      {copy && <span className="ml-auto">{copy}</span>}
    </div>
  );
}
