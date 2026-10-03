import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cell, fixture, grid, member, puts, renderView, setupUser, installCapacityFixture } from './capacityTestKit';
import { InitiativeDetail } from './InitiativeDetail';
import { TeamDetail } from './TeamDetail';

installCapacityFixture();

/** The commit messages written so far, first line only (the rest are trailers). */
const messages = () => puts.map((p) => p.message.split('\n')[0]);

describe('fix suggestions on an allocation row (§5.11, §5.4)', () => {
  it('offers the reduce that fits every month, and no raise past Capacity % minus other teams\' Team FTE %s', async () => {
    // Ana: 70% on Payments (Team FTE 60%), plus 40% on Platform in Oct; Platform claims 40% of her 100%.
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    const ana = within(table.getByRole('row', { name: /Ana Ruiz/ }));
    expect(ana.getByRole('button', { name: 'Set Ana Ruiz to 60% in Validation' })).toHaveTextContent('Set to 60%');
    expect(ana.queryByRole('button', { name: /Raise/ })).not.toBeInTheDocument();
    // Bo has no warning, so no fix; Cy is no longer a member, which has no fix.
    expect(within(table.getByRole('row', { name: /Bo Lind/ })).queryByRole('button', { name: /^Set/ })).not.toBeInTheDocument();
    expect(within(table.getByRole('row', { name: /Cy Ode/ })).queryByRole('button', { name: /^Set|Raise/ })).not.toBeInTheDocument();
  });

  it('sets the allocation in one click and one commit; the warnings and the fixes clear', async () => {
    const user = setupUser();
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    await user.click(table.getByRole('button', { name: 'Set Ana Ruiz to 60% in Validation' }));
    const ana = table.getByRole('row', { name: /Ana Ruiz/ });
    expect(ana).not.toHaveTextContent('Over');
    expect(within(ana).queryByRole('button', { name: /^Set/ })).not.toBeInTheDocument();
    expect(within(ana).getByRole('spinbutton', { name: 'Allocation % for Ana Ruiz' })).toHaveFocus();
    await vi.waitFor(() => expect(messages()).toEqual(['Payments API: Ana Ruiz set to 60% in Validation']), { timeout: 3000 });
  });

  it('raises Team FTE % to cover the peak when it fits, in one commit', async () => {
    fixture.memberships = [member('ana', 't1', 60), member('ana', 't2', 30), member('bo', 't1', 50)];
    const user = setupUser();
    renderView(<InitiativeDetail id="i1" />);
    const table = within(await screen.findByRole('table', { name: 'Validation allocations' }));
    const raise = table.getByRole('button', { name: "Raise Ana Ruiz's Team FTE % on Payments to 70%" });
    expect(raise).toHaveTextContent('Raise Team FTE % to 70%');
    await user.click(raise);
    const ana = table.getByRole('row', { name: /Ana Ruiz/ });
    expect(ana).not.toHaveTextContent('Over Team FTE %');
    // 70% + 40% on Platform is still over her Capacity % in Oct: that warning and its reduce stay.
    expect(ana).toHaveTextContent('Over Capacity % in Oct 2026');
    expect(within(ana).getByRole('button', { name: /^Set Ana Ruiz to 60%/ })).toBeInTheDocument();
    await vi.waitFor(() => expect(messages()).toEqual(['Ana Ruiz: Team FTE % on Payments set to 70%']), { timeout: 3000 });
  });
});

describe('fix suggestions in the capacity grid\'s detail (§5.11, §5.8)', () => {
  it('offers the reduce beside this team\'s allocations and names other teams\' without a fix; applying it updates the grid', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Oct 2026'));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    const payments = detail.getByRole('link', { name: 'Payments API' }).closest('li')!;
    const dataLake = detail.getByRole('link', { name: 'Data lake' }).closest('li')!;
    expect(within(dataLake).queryByRole('button')).not.toBeInTheDocument();
    await user.click(within(payments).getByRole('button', { name: 'Set Ana Ruiz to 60% in Payments API, Validation' }));
    expect(cell(g, 'Ana Ruiz', 'Oct 2026')).toHaveAccessibleName('Ana Ruiz, Oct 2026: 60%');
    expect(detail.getByRole('heading', { name: /Ana Ruiz · Oct 2026/ })).toHaveFocus();
    await vi.waitFor(() => expect(messages()).toEqual(['Payments API: Ana Ruiz set to 60% in Validation']), { timeout: 3000 });
  });

  it('offers the raise once under the warnings, in the cell and the row detail', async () => {
    fixture.memberships = [member('ana', 't1', 60), member('ana', 't2', 30), member('bo', 't1', 50)];
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Sept 2026'));
    const detail = () => within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail().getAllByRole('button', { name: /Raise/ })).toHaveLength(1);
    await user.click(g.getByRole('button', { name: 'All months for Ana Ruiz' }));
    await user.click(detail().getByRole('button', { name: "Raise Ana Ruiz's Team FTE % on Payments to 70%" }));
    expect(g.getByRole('rowheader', { name: /Ana Ruiz/ })).toHaveTextContent('Team FTE 70%');
    expect(detail().queryByRole('button', { name: /Raise/ })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(messages()).toEqual(['Ana Ruiz: Team FTE % on Payments set to 70%']), { timeout: 3000 });
  });
});
