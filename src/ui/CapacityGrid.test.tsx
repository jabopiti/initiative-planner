import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cell, fixture, grid, member, person, renderView, setupUser, tinted, installCapacityFixture, written } from './capacityTestKit';
import { TeamDetail } from './TeamDetail';

installCapacityFixture();

describe('the capacity grid on the team detail (§5.8)', () => {
  it('shows a column per month from the current month to the last allocation, and each member with their Team FTE %', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Sep 26', 'Oct 26', 'Nov 26', 'Dec 26', 'Jan 27', 'Feb 27', 'Mar 27']);
    const ana = g.getByRole('rowheader', { name: /Ana Ruiz/ });
    expect(ana).toHaveTextContent('Team FTE 60%');
    expect(g.getByRole('rowheader', { name: /Bo Lind/ })).toHaveTextContent('Team FTE 50%');
  });

  it('tints a cell above the Team FTE %, with the ceiling named in its label', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const sep = cell(g, 'Ana Ruiz', 'Sep 2026');
    expect(sep).toHaveTextContent('70%');
    expect(tinted(sep)).toBe(true);
    expect(sep).toHaveAccessibleName(/over Team FTE %/);
    expect(sep).not.toHaveAccessibleName(/over Capacity %/);
    expect(within(sep).getByTestId('over-team-fte')).toBeInTheDocument();
    expect(within(sep).queryByTestId('over-capacity')).not.toBeInTheDocument();
  });

  it('shows the over-Capacity % icon when all teams together are over, and both when both apply', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const oct = cell(g, 'Ana Ruiz', 'Oct 2026');
    expect(tinted(oct)).toBe(true);
    expect(oct).toHaveAccessibleName(/over Team FTE %.*over Capacity %/);
    expect(within(oct).getByTestId('over-team-fte')).toBeInTheDocument();
    expect(within(oct).getByTestId('over-capacity')).toBeInTheDocument();
  });

  it('tints nothing that is within both ceilings, and reads an empty month as a dash', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    for (const month of ['Sep 2026', 'Oct 2026', 'Nov 2026']) expect(tinted(cell(g, 'Bo Lind', month))).toBe(false);
    const dec = cell(g, 'Ana Ruiz', 'Dec 2026');
    expect(dec).toHaveTextContent('–');
    expect(tinted(dec)).toBe(false);
  });

  it('tints no cell at all when nobody is over', async () => {
    fixture.memberships = [member('ana', 't1', 90), member('bo', 't1', 50)];
    fixture.initiatives = [fixture.initiatives[0]];
    fixture.initiatives[0].phases!.validation.allocations = [{ id: 'a1', personId: 'ana', allocationPct: 50 }];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getAllByRole('button').filter((b) => tinted(b))).toEqual([]);
  });

  it('shows a Provisional allocation as a lighter figure that is counted toward nothing', async () => {
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const mar = cell(g, 'Ana Ruiz', 'Mar 2027');
    expect(mar).toHaveTextContent('–');
    expect(mar).toHaveTextContent('+30%');
    expect(mar).toHaveAccessibleName(/\+30% provisional/);
    expect(tinted(mar)).toBe(false);
    expect(g.getByText('Provisional, not counted', { exact: false })).toBeInTheDocument();
  });

  it('lists the contributing initiatives when a warned cell is selected, other teams included', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Oct 2026'));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Over Team FTE %: 70% on Payments initiatives, Team FTE % is 60%.')).toBeInTheDocument();
    expect(detail.getByText('Over Capacity %: 110% across all teams, Capacity % is 100%.')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Payments API' })).toHaveAttribute('href', '#/initiatives/i1');
    const lake = detail.getByRole('link', { name: 'Data lake' });
    expect(lake.closest('li')).toHaveTextContent('Platform');
    expect(lake.closest('li')).toHaveTextContent('40%');
  });

  it('lists the Provisional allocations apart from the counted ones', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Ana Ruiz', 'Mar 2027'));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Not counted (Provisional)')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Payments API' }).closest('li')).toHaveTextContent('30%');
  });

  it('says so when a selected cell is within both ceilings', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Bo Lind', 'Sep 2026'));
    expect(within(screen.getByRole('region', { name: 'Capacity detail' })).getByText('No warnings this month.')).toBeInTheDocument();
  });

  it('shows the months over each ceiling when a row is selected', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(g.getByRole('button', { name: 'All months for Ana Ruiz' }));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText('Over Team FTE % in Sep – Nov 2026.')).toBeInTheDocument();
    expect(detail.getByText('Over Capacity % in Oct 2026.')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Data lake' })).toBeInTheDocument();
  });

  it('names Team FTE %s that add up to more than the Capacity %', async () => {
    const user = setupUser();
    fixture.memberships = [member('ana', 't1', 60), member('ana', 't2', 60), member('bo', 't1', 50)];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(g.getByRole('button', { name: 'All months for Ana Ruiz' }));
    expect(within(screen.getByRole('region', { name: 'Capacity detail' })).getByText("Ana Ruiz's Team FTE %s add up to 120%, more than their 100% Capacity %.")).toBeInTheDocument();
  });

  it('gives an allocation that outlived the membership a row of its own', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const cy = g.getByRole('rowheader', { name: /Cy Ode/ });
    expect(cy).toHaveTextContent('No longer a member');
    expect(cy).not.toHaveTextContent('Team FTE');
    await user.click(g.getByRole('button', { name: 'All months for Cy Ode' }));
    const detail = within(screen.getByRole('region', { name: 'Capacity detail' }));
    expect(detail.getByText(/Cy Ode is no longer a member of Payments/)).toBeInTheDocument();
    expect(detail.getByText(/stay and keep costing/)).toBeInTheDocument();
  });

  it('still names Team FTE %s over the Capacity % when nothing is allocated yet', async () => {
    fixture.initiatives = [];
    fixture.memberships = [member('ana', 't1', 70), member('ana', 't2', 50)];
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    expect(g.getByText("Nothing allocated yet. Allocate members to an initiative's phase and their months appear here.")).toBeInTheDocument();
    expect(g.getByText("Ana Ruiz's Team FTE %s add up to 120%, more than their 100% Capacity %.")).toBeInTheDocument();
  });

  it('moves focus to the detail when a cell is selected, and back to that cell when it is closed', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const oct = cell(g, 'Ana Ruiz', 'Oct 2026');
    await user.click(oct);
    expect(screen.getByRole('heading', { name: 'Ana Ruiz · Oct 2026' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(oct).toHaveFocus();
  });

  it('does the same for a person\'s name, and follows a new selection', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    const name = g.getByRole('button', { name: 'All months for Ana Ruiz' });
    await user.click(name);
    expect(screen.getByRole('heading', { name: 'Ana Ruiz · all months' })).toHaveFocus();
    await user.click(cell(g, 'Bo Lind', 'Sep 2026'));
    expect(screen.getByRole('heading', { name: 'Bo Lind · Sep 2026' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(cell(g, 'Bo Lind', 'Sep 2026')).toHaveFocus();
  });

  it('closes the detail', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    const g = await grid();
    await user.click(cell(g, 'Bo Lind', 'Sep 2026'));
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('region', { name: 'Capacity detail' })).not.toBeInTheDocument();
  });

  it('says so when there are no members, and when nothing is allocated', async () => {
    fixture.memberships = [];
    fixture.initiatives = [];
    fixture.people = [];
    const first = renderView(<TeamDetail id="t1" />);
    expect(await screen.findByText('No members yet. Add members to see their capacity.')).toBeInTheDocument();
    first.unmount();

    fixture.people = [person('ana', 'Ana Ruiz')];
    fixture.memberships = [member('ana', 't1', 60)];
    renderView(<TeamDetail id="t1" />);
    expect(await screen.findByText("Nothing allocated yet. Allocate members to an initiative's phase and their months appear here.")).toBeInTheDocument();
  });

  it('copies the shown months, figures and warning markers', async () => {
    const user = setupUser();
    renderView(<TeamDetail id="t1" />);
    await grid();
    await user.click(screen.getByRole('button', { name: 'Copy capacity' }));
    expect(await screen.findByText('Copied 3 people')).toBeInTheDocument();
    const lines = written['text/plain'].split('\n');
    expect(lines[0]).toBe('Name\tTeam FTE %\tSep 26\tOct 26\tNov 26\tDec 26\tJan 27\tFeb 27\tMar 27');
    expect(lines[1]).toBe('Ana Ruiz\t60%\t70% (over Team FTE %)\t70% (over Team FTE %, over Capacity %)\t70% (over Team FTE %)\t–\t–\t–\t– +30% provisional');
    expect(lines[2]).toBe('Bo Lind\t50%\t40%\t40%\t40%\t–\t–\t–\t–');
    expect(lines[3]).toBe('Cy Ode\tNo longer a member\t20%\t20%\t20%\t–\t–\t–\t–');
    expect(written['text/html']).toContain('<th>Oct 26</th>');
  });
});
