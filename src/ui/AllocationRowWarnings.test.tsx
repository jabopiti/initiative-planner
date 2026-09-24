import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderView, installCapacityFixture } from './capacityTestKit';
import { InitiativeDetail } from './InitiativeDetail';

installCapacityFixture();

describe('allocation rows on the initiative page (§5.4)', () => {
  it('say in words when the person is over a ceiling in a month of the phase, or no longer on the team', async () => {
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    const ana = table.getByRole('row', { name: /Ana Ruiz/ });
    expect(ana).toHaveTextContent('Over Team FTE % in Sep – Nov 2026');
    expect(ana).toHaveTextContent('Over Capacity % in Oct 2026');
    expect(table.getByRole('row', { name: /Cy Ode/ })).toHaveTextContent('No longer a member of Payments');
    const bo = table.getByRole('row', { name: /Bo Lind/ });
    expect(bo).not.toHaveTextContent('Over');
    expect(bo).not.toHaveTextContent('No longer');
  });
});
