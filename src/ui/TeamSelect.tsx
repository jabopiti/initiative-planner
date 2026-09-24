import type { Ref } from 'react';
import type { Team } from '../data/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamSelectProps {
  teams: Team[];
  /** The chosen team's id, or '' for none, which shows the placeholder. */
  value: string;
  onValueChange: (teamId: string) => void;
  /** The chosen team was chosen again. The dropdown itself only reports a change, so this is for callers that need the re-pick. */
  onReselect?: () => void;
  /** Runs when the list closes, before focus returns to the trigger; `preventDefault` keeps it where the caller put it. */
  onCloseAutoFocus?: (event: Event) => void;
  'aria-describedby'?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The team dropdown (§5.1, §5.4): lists the active teams, with none preselected. A chosen team
 * that has since been deactivated stays listed, so an initiative that already has it still shows it.
 */
export function TeamSelect({ teams, value, onValueChange, onReselect, onCloseAutoFocus, className, ref, ...rest }: TeamSelectProps) {
  const options = teams.filter((t) => t.active || t.id === value);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger ref={ref} size="sm" aria-label="Team" className={className} {...rest}>
        <SelectValue placeholder="Select team" />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={onCloseAutoFocus}>
        {options.map((team) => (
          <SelectItem
            key={team.id}
            value={team.id}
            // Mouse selects on release, touch on click, the keyboard on Enter or Space; only the chosen one is a re-pick.
            {...(team.id === value && {
              onPointerUp: onReselect,
              onClick: onReselect,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') onReselect?.();
              },
            })}
          >
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
