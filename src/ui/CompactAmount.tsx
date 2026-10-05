import { useBrand } from '../state/BrandContext';
import { formatAmount, formatCompactAmount, formatCompactSignedAmount, formatSignedAmount } from './formatAmount';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A compact amount with the full amount as its tooltip (§9.11); `signed` shows a deviation's sign in both.
 */
export function CompactAmount({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  const { currencySymbol } = useBrand();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`tabular-nums ${className ?? ''}`}>
          {(signed ? formatCompactSignedAmount : formatCompactAmount)(value, currencySymbol)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{(signed ? formatSignedAmount : formatAmount)(value, currencySymbol)}</TooltipContent>
    </Tooltip>
  );
}
