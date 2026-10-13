import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import templates from 'virtual:brand-prompts';
import { localToday } from '../data/dates';
import type { Initiative } from '../data/types';
import { slotBlocks } from '../prompts/slots';
import { fillTemplate } from '../prompts/template';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { copyPrompt } from './copyPrompt';
import { readIncludeNames, writeIncludeNames } from './promptPreferences';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Copy for AI (§9.12) in a key-figure tile beside Copy cost summary (§5.4): a sparkles icon opening a small menu with
 * the copy itself and the Include names checkbox, so whether names go out is in view at the moment of copying. The
 * prompt is built from the brand pack's template when chosen, from what the page shows, and goes nowhere but the
 * clipboard.
 */
export function CopyForAiMenu({ initiative }: { initiative: Initiative }) {
  const brand = useBrand();
  const { people, roles, countries, teams } = useRepositoryState();
  const [includeNames, setIncludeNames] = useState(readIncludeNames);
  // The tooltip must not open when the menu hands focus back to its button; only a hover or the user's own focus opens it.
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const returningFocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  function copy() {
    const blocks = slotBlocks({
      initiative,
      productName: brand.productName,
      process: brand.process,
      approvalTracks: brand.approvalTracks,
      currencySymbol: brand.currencySymbol,
      people,
      teams,
      data: { roles, countries },
      today: localToday(),
      includeNames,
    });
    void copyPrompt(fillTemplate(templates.copyForAi, blocks), `Copied ${initiative.name} for AI`);
  }

  return (
    <DropdownMenu>
      <Tooltip open={tooltipOpen} onOpenChange={(open) => !(open && returningFocus.current) && setTooltipOpen(open)}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={button} type="button" variant="ghost" size="icon-sm" aria-label="Copy for AI">
              <Sparkles size={18} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Copy for AI</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returningFocus.current = true;
          button.current?.focus();
          returningFocus.current = false;
        }}
      >
        <DropdownMenuItem onSelect={copy}>
          <Sparkles aria-hidden="true" />
          Copy for AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={includeNames}
          // Stays open, so the copy can follow with the choice in view.
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) => {
            setIncludeNames(checked);
            writeIncludeNames(checked);
          }}
        >
          Include names
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
