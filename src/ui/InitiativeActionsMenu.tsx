import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { ActionsIcon } from './icons';
import { initiativeActions } from './initiativeActions';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The "⋯" Actions menu at the end of the header's meta row (§5.4): only the actions that apply to the initiative's
 * status. While none does, the button is absent rather than opening an empty menu.
 */
export function InitiativeActionsMenu({ initiative }: { initiative: Initiative }) {
  const repository = useRepository();
  const actions = initiativeActions.filter((action) => action.applies(initiative));
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Actions" className="text-text-secondary">
              <ActionsIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {actions.map(({ id, label, icon: Icon, run }) => (
          <DropdownMenuItem key={id} onSelect={() => run(repository, initiative)}>
            <Icon />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
