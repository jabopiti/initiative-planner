import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderView, installCapacityFixture } from './capacityTestKit';
import { InitiativeDetail } from './InitiativeDetail';

installCapacityFixture();

describe('allocation rows on the initiative page (§5.4)', () => {
  it('say in words when the person is over a ceiling in a month of the phase, or no longer on the team', async () => {
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    // The warnings sit in a full-width row under the person's row, so no column moves (§5.4).
    const under = (name: RegExp) => table.getByRole('row', { name }).nextElementSibling as HTMLElement;
    const ana = under(/^Ana Ruiz/);
    expect(within(ana).getByRole('cell')).toHaveAttribute('colspan', '5');
    expect(ana).toHaveTextContent('Over Team FTE % in Sept – Nov 2026');
    expect(ana).toHaveTextContent('Over Capacity % in Oct 2026');
    expect(under(/^Cy Ode/)).toHaveTextContent('No longer a member of Payments');
    // Bo has no warnings: the next row is the next person's own.
    expect(within(under(/^Bo Lind/)).getByRole('slider')).toBeInTheDocument();
  });
});
