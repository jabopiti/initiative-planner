import type { ReactNode } from 'react';
import { useBrand } from '../state/BrandContext';
import { formatAmount, formatCompactAmount } from './formatAmount';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A compact amount with the full amount as its tooltip (§9.11); `prefix` leads the compact text, as a column's count does. */
export function CompactAmount({ value, prefix, className }: { value: number; prefix?: ReactNode; className?: string }) {
  const { currencySymbol } = useBrand();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>
          {prefix}
          {formatCompactAmount(value, currencySymbol)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatAmount(value, currencySymbol)}</TooltipContent>
    </Tooltip>
  );
}
