import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Cuts a long name with an ellipsis and shows the full text in a tooltip (§9.11). */
export function TruncatedText({ text, children, className = 'max-w-56' }: { text: string; children?: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`block truncate ${className}`}>{children ?? text}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
