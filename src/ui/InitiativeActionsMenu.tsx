import { Fragment, useRef, useState, type Ref } from 'react';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { ActionsIcon } from './icons';
import { initiativeActions, type InitiativeAction, type InitiativeActionUi } from './initiativeActions';
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
  // The tooltip must not open when the menu hands focus back to its button; only a hover or the user's own focus opens it.
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const returningFocus = useRef(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const setButton = (node: HTMLButtonElement | null) => {
    button.current = node;
    if (typeof triggerRef === 'function') triggerRef(node);
    else if (triggerRef) triggerRef.current = node;
  };
  const applicable = initiativeActions.filter((action) => action.applies(initiative, process));
  const isLast = (a: InitiativeAction) => a.ending || a.destructive;
  const actions = [...applicable.filter((a) => !isLast(a)), ...applicable.filter((a) => a.ending), ...applicable.filter((a) => a.destructive)];
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip open={tooltipOpen} onOpenChange={(open) => !(open && returningFocus.current) && setTooltipOpen(open)}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={setButton} type="button" variant="ghost" size="icon-sm" aria-label="Actions" className="text-text-secondary">
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
          event.preventDefault();
          if (focus) return focus();
          returningFocus.current = true;
          button.current?.focus();
          returningFocus.current = false;
        }}
      >
        {actions.map((action, index) => {
          const { id, label, icon: Icon, run, destructive } = action;
          return (
          <Fragment key={id}>
            {index > 0 && isLast(action) && !isLast(actions[index - 1]) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={destructive ? 'destructive' : 'default'} onSelect={() => (afterClose.current = run(repository, initiative, ui))}>
              <Icon />
              {label(initiative, process)}
            </DropdownMenuItem>
          </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
