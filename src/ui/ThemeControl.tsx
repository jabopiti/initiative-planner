import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { THEME_MODES, useTheme, type ThemeMode } from './theme';

const MODES: Record<ThemeMode, { label: string; icon: LucideIcon }> = {
  system: { label: 'System', icon: Monitor },
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
};

/** The theme control at the right end of the top bar (§5.1, §9.1): an icon button opening System, Light, Dark. */
export function ThemeControl() {
  const [mode, setMode] = useTheme();
  const CurrentIcon = MODES[mode].icon;
  const name = `Theme: ${MODES[mode].label}`;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={name} className="text-text-secondary">
              <CurrentIcon size={18} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {THEME_MODES.map((value) => {
          const { label, icon: Icon } = MODES[value];
          return (
            <DropdownMenuItem key={value} role="menuitemradio" aria-checked={value === mode} onSelect={() => setMode(value)}>
              <Icon aria-hidden="true" />
              {label}
              {value === mode && <Check className="ml-auto" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
