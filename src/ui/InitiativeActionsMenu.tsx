import { Fragment, useRef, type Ref } from 'react';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { ActionsIcon } from './icons';
import { initiativeActions, type InitiativeActionUi } from './initiativeActions';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The "⋯" Actions menu at the end of the header's meta row (§5.4): only the actions that apply to the initiative's
 * status. While none does, the button is absent rather than opening an empty menu. An irreversible action comes
 * last, after a separator, in the destructive style; choosing it opens its inline confirmation, which takes focus.
 */
export function InitiativeActionsMenu({ initiative, ui, triggerRef }: { initiative: Initiative; ui: InitiativeActionUi; triggerRef?: Ref<HTMLButtonElement> }) {
  const repository = useRepository();
  const { process } = useBrand();
  // Where an action that opened a confirmation wants focus once the menu has closed, instead of the button.
  const afterClose = useRef<(() => void) | void>(undefined);
  const applicable = initiativeActions.filter((action) => action.applies(initiative, process));
  const actions = [...applicable.filter((a) => !a.destructive), ...applicable.filter((a) => a.destructive)];
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={triggerRef} type="button" variant="ghost" size="icon-sm" aria-label="Actions" className="text-text-secondary">
              <ActionsIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => {
          const focus = afterClose.current;
          afterClose.current = undefined;
          if (!focus) return;
          event.preventDefault();
          focus();
        }}
      >
        {actions.map(({ id, label, icon: Icon, run, destructive }, index) => (
          <Fragment key={id}>
            {destructive && index > 0 && !actions[index - 1].destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={destructive ? 'destructive' : 'default'} onSelect={() => (afterClose.current = run(repository, initiative, ui))}>
              <Icon />
              {label(initiative, process)}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
