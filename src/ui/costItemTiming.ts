import type { CostItem } from '../data/types';

/** How a cost item's timing reads (§5.4): on the toggle and in the conflict banner. */
export const TIMING_LABELS: Record<CostItem['timing'], string> = { month: 'One month', spread: 'Spread over the phase' };
