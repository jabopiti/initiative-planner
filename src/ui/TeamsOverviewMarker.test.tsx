import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixture, member, plan, renderView, installCapacityFixture } from './capacityTestKit';
import { TeamsOverview } from './TeamsOverview';

installCapacityFixture();

describe('the Teams overview marker (§5.7)', () => {
  it('marks a team with a member who has a capacity warning', async () => {
    renderView(<TeamsOverview />);
    const payments = await screen.findByRole('row', { name: /Payments/ });
    expect(within(payments).getByRole('img', { name: 'Capacity warning' })).toBeInTheDocument();
    // Ana is within her Team FTE % on Platform (40% of 40%), but over her Capacity % across both teams.
    expect(within(screen.getByRole('row', { name: /Platform/ })).getByRole('img', { name: 'Capacity warning' })).toBeInTheDocument();
  });

  it('leaves a team without warnings unmarked', async () => {
    fixture.memberships = [member('ana', 't1', 90), member('bo', 't1', 50)];
    fixture.initiatives = [{ ...fixture.initiatives[0], phases: { validation: plan('2026-09-01', '2026-11-30', ['ana', 50], ['bo', 40]) } }];
    renderView(<TeamsOverview />);
    const payments = await screen.findByRole('row', { name: /Payments/ });
    expect(within(payments).queryByRole('img', { name: 'Capacity warning' })).not.toBeInTheDocument();
  });
});
