import { describe, expect, it } from 'vitest';
import { suggestCostItems } from './costItemSuggestions';
import type { CostItem, Initiative } from './types';

const item = (label: string, amount = 100, timing: CostItem['timing'] = 'spread'): CostItem => ({ id: `${label}-${amount}`, label, amount, timing });
const initiative = (id: string, phases: Record<string, { startDate?: string; costItems: CostItem[] }>): Initiative => ({
  id,
  name: id,
  teamId: 't1',
  status: 'Active',
  phases: Object.fromEntries(Object.entries(phases).map(([phase, plan]) => [phase, { ...plan, allocations: [] }])),
});

describe('suggestCostItems (§5.11)', () => {
  it('lists labels containing the text, most used first, then alphabetical, at most 5', () => {
    const initiatives = [
      initiative('a', { p1: { costItems: [item('Test lab'), item('Test lab'), item('Test lab'), item('Retest fee'), item('Retest fee'), item('Contest'), item('Attest'), item('Detest'), item('Zeta test'), item('Unrelated')] } }),
    ];
    expect(suggestCostItems(initiatives, 'te').map((s) => [s.label, s.uses])).toEqual([
      ['Test lab', 3],
      ['Retest fee', 2],
      ['Attest', 1],
      ['Contest', 1],
      ['Detest', 1],
    ]);
  });

  it('groups by trimmed, case-insensitive text and shows the most recent spelling', () => {
    const initiatives = [
      initiative('a', { p1: { startDate: '2026-01-01', costItems: [item('Cloud hosting')] } }),
      initiative('b', { p1: { startDate: '2026-06-01', costItems: [item('cloud hosting ')] } }),
    ];
    expect(suggestCostItems(initiatives, 'cloud')).toEqual([{ label: 'cloud hosting', uses: 2, amount: 100, timing: 'spread' }]);
  });

  it('takes amount and timing from the phase with the latest start date, ties to the later initiative', () => {
    const initiatives = [
      initiative('a', { p1: { startDate: '2026-06-01', costItems: [item('Pen test', 12000, 'month')] } }),
      initiative('b', { p1: { startDate: '2026-02-01', costItems: [item('Pen test', 5000)] } }),
      initiative('c', { p1: { startDate: '2026-06-01', costItems: [item('Pen test', 9000)] } }),
    ];
    expect(suggestCostItems(initiatives, 'pen')[0]).toMatchObject({ uses: 3, amount: 9000, timing: 'spread' });
  });

  it('ranks a phase without a start date lowest', () => {
    const initiatives = [initiative('a', { p1: { startDate: '2026-01-01', costItems: [item('Pen test', 1)] } }), initiative('b', { p1: { costItems: [item('Pen test', 2)] } })];
    expect(suggestCostItems(initiatives, 'pen')[0].amount).toBe(1);
  });

  it('shows nothing for blank text or text no label contains', () => {
    const initiatives = [initiative('a', { p1: { costItems: [item('Pen test')] } })];
    expect(suggestCostItems(initiatives, '')).toEqual([]);
    expect(suggestCostItems(initiatives, '  ')).toEqual([]);
    expect(suggestCostItems(initiatives, 'xyz')).toEqual([]);
  });
});
