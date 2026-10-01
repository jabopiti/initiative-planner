import { activeMembers } from '../data/teamMembers';
import type { Membership, Person } from '../data/types';
import { OwnerIcon } from './icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Radix forbids an empty-string item value, so "No owner" needs its own sentinel, mapped back to `undefined`. */
const NO_OWNER = 'none';

interface OwnerSelectProps {
  people: Person[];
  memberships: Membership[];
  teamId: string;
  teamName: string;
  /** The initiative's owner id, or `undefined` for none. */
  value: string | undefined;
  onValueChange: (ownerId: string | undefined) => void;
  className?: string;
  /** Shown as text, not a select: the owner of a Closed or Cancelled initiative (§8.4). */
  readOnly?: boolean;
}

/**
 * The owner select in the initiative header (§5.4, §9.10): "No owner" first, then the initiative's team's
 * active members, then every other active person, each group by name; inactive people aren't offered. An
 * owner who has since been deactivated stays on the trigger as "<name> (inactive)" (§9.3) even though they
 * are not in the list for a new choice — the label is computed here rather than left to the list's own item
 * text, since that text only exists for the people actually rendered.
 */
export function OwnerSelect({ people, memberships, teamId, teamName, value, onValueChange, className, readOnly }: OwnerSelectProps) {
  const teamMembers = activeMembers(teamId, memberships, people).sort((a, b) => a.name.localeCompare(b.name));
  const teamMemberIds = new Set(teamMembers.map((p) => p.id));
  const others = people.filter((p) => p.active && !teamMemberIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));

  const owner = value ? people.find((p) => p.id === value) : undefined;
  const label = !value ? 'No owner' : owner ? (owner.active ? owner.name : `${owner.name} (inactive)`) : 'Unknown person';

  // A Closed or Cancelled initiative keeps its owner, shown as text (§8.4).
  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" role="img" aria-label="Owner" tabIndex={0}>
              <OwnerIcon />
            </span>
          </TooltipTrigger>
          <TooltipContent>Owner</TooltipContent>
        </Tooltip>
        {label}
      </span>
    );
  }

  return (
    <Select value={value ?? NO_OWNER} onValueChange={(next) => onValueChange(next === NO_OWNER ? undefined : next)}>
      <SelectTrigger size="sm" aria-label="Owner" className={className}>
        <OwnerIcon />
        <SelectValue placeholder="No owner">{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_OWNER}>No owner</SelectItem>
        {teamMembers.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{teamName}</SelectLabel>
              {teamMembers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
        {others.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Everyone else</SelectLabel>
              {others.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
