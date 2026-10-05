import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Load } from '../data/capacity';
import type { FreeCapacity } from '../data/personLoad';
import type { Person, Role, Team } from '../data/types';
import { MAX_CHIPS, rosterDetail, TeamRoster } from './TeamRoster';
import { TooltipProvider } from '@/components/ui/tooltip';

const person = (id: string, name: string): Person => ({ id, name, countryId: 'es', roleId: 'dev', capacityPct: 100, active: true });
const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
/** Free capacity with nothing else allocated in October. */
const freeAt = (pct: number, loads: Load[] = []): FreeCapacity => ({ pct, limiting: { month: '2026-10', onTeam: 0, otherTeams: 0, loads } });
afterEach(cleanup);
// cmdk scrolls the highlighted item into view, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

const sofia = person('sofia', 'Sofia Molina');
const paul = person('paul', 'Paul Richter');

function renderRoster(addable: Person[], free: Map<string, FreeCapacity> | undefined, onAdd = vi.fn()) {
  render(
    <TooltipProvider>
      <TeamRoster phaseLabel="Validation" addable={addable} free={free} roles={roles} teams={[]} highlight={false} onAdd={onAdd} />
    </TooltipProvider>,
  );
  return onAdd;
}

describe('TeamRoster (§5.4, §5.11)', () => {
  it('shows a chip per person in the order given, 0% free included, and adds one in a click', async () => {
    const user = userEvent.setup();
    const onAdd = renderRoster([sofia, paul], new Map([['sofia', freeAt(50)], ['paul', freeAt(0)]]));
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

  it('names where the load is in the month that limits the free capacity, after the role', () => {
    expect(rosterDetail('Developer', freeAt(0, [load(100, ['2026-10'])]), [growth, platform])).toBe('Developer · 100% on Checkout Redesign (Platform) in Oct 2026');
  });

  it('joins several loads in running copy', () => {
    const second = { ...load(20, ['2026-10']), initiativeName: 'Search' };
    expect(rosterDetail('Developer', freeAt(0, [load(60, ['2026-10']), second]), [platform])).toBe('Developer · 60% on Checkout Redesign (Platform) and 20% on Search (Platform) in Oct 2026');
  });

  it('is the role alone when nothing else is allocated, or without a period', () => {
    expect(rosterDetail('Developer', freeAt(100), [growth])).toBe('Developer');
    expect(rosterDetail('Developer', undefined, [growth])).toBe('Developer');
  });
});
