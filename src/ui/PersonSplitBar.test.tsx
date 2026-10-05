import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRepositoryState } from '../state/DataContext';
import { fixture, installCapacityFixture, member, puts, renderView, setupUser } from './capacityTestKit';
import { PersonPanel } from './PersonPanel';

installCapacityFixture();

/** The panel for Ana Ruiz, kept current from the repository. Ana: Payments 60%, Platform 40% (the kit's fixture). */
function AnaPanel() {
  const { people } = useRepositoryState();
  return <PersonPanel person={people.find((p) => p.id === 'ana') ?? null} onClose={() => {}} />;
}

const panel = () => screen.findByRole('dialog', { name: 'Ana Ruiz' });

describe('person panel split bar (§5.6, slice 062)', () => {
  it('moves Team FTE % between two teams in one commit naming both', async () => {
    const user = setupUser();
    renderView(<AnaPanel />);
    const divider = within(await panel()).getByRole('slider', { name: 'Divider between Payments and Platform' });
    expect(within(await panel()).getByRole('button', { name: 'Payments 60%' })).toBeInTheDocument();
    divider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    await waitFor(() => expect(puts.at(-1)?.message).toMatch(/^Ana Ruiz: Team FTE % on Payments set to 70%, Team FTE % on Platform set to 30%/));
    expect(puts.filter((p) => p.message.includes('Team FTE %'))).toHaveLength(1);
    expect(within(await panel()).getByRole('button', { name: 'Platform 30%' })).toBeInTheDocument();
  });

  it('shows one field per team instead of the bar when Team FTE %s add up to more than Capacity %', async () => {
    fixture.memberships = [member('ana', 't1', 70), member('ana', 't2', 40)];
    renderView(<AnaPanel />);
    const p = await panel();
    expect(within(p).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(p).getByRole('spinbutton', { name: 'Team FTE % for Payments' })).toHaveValue(70);
    expect(within(p).getByRole('spinbutton', { name: 'Team FTE % for Platform' })).toHaveValue(40);
    expect(within(p).getByText('110% of 100% claimed')).toBeInTheDocument();
  });

  it('opens a team’s exact value and Remove from team from its chip; Undo brings the membership back', async () => {
    const user = setupUser();
    renderView(<AnaPanel />);
    await user.click(within(await panel()).getByRole('button', { name: 'Platform 40%' }));
    const popover = await screen.findByRole('dialog', { name: 'Platform' });
    expect(within(popover).getByRole('spinbutton', { name: 'Team FTE % for Platform' })).toHaveValue(40);
    await user.click(within(popover).getByRole('button', { name: 'Remove from team' }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Ana Ruiz' })).queryByRole('button', { name: 'Platform 40%' })).not.toBeInTheDocument());
    await screen.findByText('Removed.', { exact: false });
    // The toast sits outside the modal panel; jsdom lacks sonner's pointer-events: auto, so it is clicked directly.
    act(() => screen.getByRole('button', { name: 'Undo' }).click());
    expect(await within(await panel()).findByRole('button', { name: 'Platform 40%' })).toBeInTheDocument();
  });

  it('disables the dividers of an inactive person', async () => {
    fixture.people = fixture.people.map((p) => (p.id === 'ana' ? { ...p, active: false } : p));
    renderView(<AnaPanel />);
    const p = await panel();
    expect(within(p).getByRole('slider', { name: 'Divider after Platform' })).toHaveAttribute('data-disabled');
  });
});
