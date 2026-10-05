import type { ComponentType, SVGProps } from 'react';
import { ActionsIcon, DeactivateIcon, ReactivateIcon } from './icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type RowAction = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  destructive?: boolean;
};

/** The Deactivate / Reactivate item for a row (§9.10): `set` receives the new `active` value. */
export function activeToggleAction(noun: string, active: boolean, set: (active: boolean) => void): RowAction {
  return active
    ? { label: `Deactivate ${noun}`, icon: DeactivateIcon, onSelect: () => set(false) }
    : { label: `Reactivate ${noun}`, icon: ReactivateIcon, onSelect: () => set(true) };
}

/**
 * A list row's actions (§9.10): one "⋯" button whose menu items each carry their icon and a text label, so no row
 * action is an icon alone. `label` names the row for screen readers ("Actions for Mara Voss"). Clicks stop here so
 * a row that opens a panel on click doesn't open it.
 */
export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="text-text-secondary" onClick={(e) => e.stopPropagation()}>
          <ActionsIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map(({ label: text, icon: Icon, onSelect, destructive }) => (
          <DropdownMenuItem key={text} variant={destructive ? 'destructive' : 'default'} onSelect={onSelect}>
            <Icon />
            {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
