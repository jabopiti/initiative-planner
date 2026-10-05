import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Load } from '../data/capacity';
import type { Person, Team } from '../data/types';
import { MAX_CHIPS, rosterDetail, TeamRoster } from './TeamRoster';
import { TooltipProvider } from '@/components/ui/tooltip';

const person = (id: string, name: string): Person => ({ id, name, countryId: 'es', roleId: 'dev', capacityPct: 100, active: true });
afterEach(cleanup);
// cmdk scrolls the highlighted item into view, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

const sofia = person('sofia', 'Sofia Molina');
const paul = person('paul', 'Paul Richter');

function renderRoster(addable: Person[], free: Map<string, number> | undefined, onAdd = vi.fn()) {
  render(
    <TooltipProvider>
      <TeamRoster phaseLabel="Validation" addable={addable} free={free} roles={[]} detail={() => 'Developer'} highlight={false} onAdd={onAdd} />
    </TooltipProvider>,
  );
  return onAdd;
}

describe('TeamRoster (§5.4, §5.11)', () => {
  it('shows a chip per person in the order given, 0% free included, and adds one in a click', async () => {
    const user = userEvent.setup();
    const onAdd = renderRoster([sofia, paul], new Map([['sofia', 50], ['paul', 0]]));
    const chips = within(screen.getByRole('group', { name: 'Add people to Validation' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Sofia Molina· 50% free', 'Paul Richter· 0% free']);
    expect(chips[0]).toHaveAccessibleName('Add Sofia Molina, 50% free. Developer');
    await user.click(chips[0]);
    expect(onAdd).toHaveBeenCalledWith('sofia');
  });

  it(`gives way to the searchable Add person picker above ${MAX_CHIPS} people`, async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: MAX_CHIPS + 1 }, (_, i) => person(`p${i}`, `Person ${String(i).padStart(2, '0')}`));
    const onAdd = renderRoster(many, undefined);
    expect(screen.queryByRole('button', { name: /^Add Person/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add person to Validation' }));
    await user.type(screen.getByRole('combobox', { name: 'Search people' }), 'Person 12');
    await user.click(screen.getByRole('option', { name: /Person 12/ }));
    expect(onAdd).toHaveBeenCalledWith('p12');
  });
});

describe('rosterDetail (§5.4)', () => {
  const growth: Team = { id: 'growth', name: 'Growth', active: true };
  const platform: Team = { id: 'platform', name: 'Platform', active: true };
  const load = (pct: number, months: string[]): Load => ({
    personId: 'paul',
    initiativeId: 'checkout',
    initiativeName: 'Checkout Redesign',
    teamId: 'platform',
    phaseId: 'development',
    phaseLabel: 'Development',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    months,
    allocationPct: pct,
    confirmed: true,
  });

  it('names where the load is in the busiest month, after the role', () => {
    const detail = rosterDetail(paul, 'Developer', growth, [growth, platform], { startDate: '2026-10-01', endDate: '2026-11-30' }, [load(100, ['2026-10'])], '2026-10-05');
    expect(detail).toBe('Developer · 100% on Checkout Redesign (Platform) in Oct 2026');
  });

  it('is the role alone when nothing else is allocated', () => {
    expect(rosterDetail(paul, 'Developer', growth, [growth], { startDate: '2026-10-01', endDate: '2026-11-30' }, [], '2026-10-05')).toBe('Developer');
  });
});
