import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Cuts a long name with an ellipsis and shows the full text in a tooltip (§9.11). */
export function TruncatedText({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block max-w-56 truncate">{children ?? text}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
