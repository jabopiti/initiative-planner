import type { ReactNode } from 'react';
import { useBrand } from '../state/BrandContext';
import { formatAmount, formatCompactAmount, formatCompactSignedAmount, formatSignedAmount } from './formatAmount';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A compact amount with the full amount as its tooltip (§9.11); `prefix` leads the compact text, as a column's count
 * does, and `signed` shows a deviation's sign in both.
 */
export function CompactAmount({ value, prefix, className, signed }: { value: number; prefix?: ReactNode; className?: string; signed?: boolean }) {
  const { currencySymbol } = useBrand();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`tabular-nums ${className ?? ''}`}>
          {prefix}
          {(signed ? formatCompactSignedAmount : formatCompactAmount)(value, currencySymbol)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{(signed ? formatSignedAmount : formatAmount)(value, currencySymbol)}</TooltipContent>
    </Tooltip>
  );
}
