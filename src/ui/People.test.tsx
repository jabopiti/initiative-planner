import { useState } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { buildBaselineDataset } from '../data/baseline';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepository, useRepositoryState } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

/** Opens a list row's "⋯" menu and chooses one of its items (§9.10). */
async function rowAction(user: ReturnType<typeof userEvent.setup>, menu: string, item: string) {
  await user.click(await screen.findByRole('button', { name: menu }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

const baseline = buildBaselineDataset(defaultBrandPack);
const teams = [
  { id: 't1', name: 'Payments', active: true },
  { id: 't2', name: 'Platform', active: true },
];

/** A repository whose data branch already holds the baseline plus two teams. */
fakeOnDemand((fake) => seedFiles(fake, { roles: baseline.roles, countries: baseline.countries, teams }));

let goTo: (view: string) => void = () => {};
let addToTeam: (name: string, teamId: string) => void = () => {};

function Harness() {
  const [view, setView] = useState('people');
  goTo = setView;
  const repository = useRepository();
  const { people } = useRepositoryState();
  addToTeam = (name, teamId) => repository.addMembership(people.find((p) => p.name === name)!.id, teamId);
  return view === 'people' ? <PeopleOverview /> : <TeamDetail id={view} />;
}

async function renderApp() {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <Harness />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await screen.findByPlaceholderText('Add a person by name');
}

async function addPerson(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByPlaceholderText('Add a person by name'), name);
  await user.click(screen.getByRole('button', { name: 'Add person' }));
}

afterEach(cleanup);

describe('People overview and team members (slice 004)', () => {
  it('shows an empty state, then a quick-added person with default country, role and 100% capacity', async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(screen.getByText('No people yet. Type a name above to add the first one.')).toBeInTheDocument();

    await addPerson(user, 'Ada Lovelace');

    const row = screen.getByRole('row', { name: /Ada Lovelace/ });
    expect(within(row).getByText('100%')).toBeInTheDocument();
    expect(within(row).getByText(baseline.countries[0].name)).toBeInTheDocument();
    expect(within(row).getByText(baseline.roles[0].name)).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('hides a deactivated person under the default filter, and Show all brings them back', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Grace Hopper');

    await rowAction(user, 'Actions for Grace Hopper', 'Deactivate person');

    expect(screen.queryByRole('row', { name: /Grace Hopper/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('row', { name: /Grace Hopper/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Grace Hopper' }));
    expect(await screen.findByRole('menuitem', { name: 'Reactivate person' })).toBeInTheDocument();
  });

  it('defaults a first membership to full capacity, then caps a second at what is unclaimed', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Linus Torvalds');

    // Team detail: pick the existing person, who lands at their full 100%.
    goTo('t1');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('option', { name: /Linus Torvalds/ }));
    const fte = await screen.findByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' });
    expect(fte).toHaveValue(100);

    // The team detail may lower it; the second team then gets only the remainder.
    await user.clear(fte);
    await user.type(fte, '60');
    await user.tab(); // a field commits on blur or Enter (§10.3)
    goTo('t2');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('option', { name: /Linus Torvalds/ }));
    expect(await screen.findByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' })).toHaveValue(40);

    // Person panel: the second membership can't be raised past 40%.
    goTo('people');
    await screen.findByRole('heading', { name: 'People' });
    await user.click(await screen.findByRole('button', { name: 'Linus Torvalds' }));
    const panel = await screen.findByRole('dialog', { name: 'Linus Torvalds' });
    expect(within(panel).getByText('100% of 100% claimed')).toBeInTheDocument();
    // The exact value is in the team's legend chip (§5.6, slice 062).
    await user.click(within(panel).getByRole('button', { name: 'Platform 40%' }));
    const second = await screen.findByRole('spinbutton', { name: 'Team FTE % for Platform' });
    await user.clear(second);
    await user.type(second, '90');
    expect(screen.getByText('Max 40%. Other teams hold the rest.')).toBeInTheDocument();
    await user.tab();
    expect(second).toHaveValue(40);
    // The cap is deliberate, so its message stays after the save, until the field is edited again.
    expect(screen.getByText('Set to 40%, the most left. Other teams hold the rest.')).toBeInTheDocument();
    expect(second).not.toBeInvalid();
    await user.type(second, '5');
    expect(screen.queryByText(/Set to 40%/)).not.toBeInTheDocument();
    await user.clear(second);
    await user.type(second, '40');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}'); // closes the popover, not the panel
    expect(within(panel).getByText('No capacity left to add to another team.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('row', { name: /Linus Torvalds/, hidden: true })).toHaveTextContent('Payments, Platform'));
  });

  it('adds a member from the keyboard: arrows move the active option, Enter chooses it, Esc clears', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Felix Brandt');
    await addPerson(user, 'Fenna Berg');
    goTo('t1');
    const field = await screen.findByRole('combobox', { name: 'Add member' });
    await user.type(field, 'fe');
    // Nothing is active until an arrow key is pressed, so Enter alone does nothing.
    expect(field).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('spinbutton', { name: /Team FTE %/ })).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', first.id);
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}'); // wraps to the last, which is Create
    expect(screen.getByRole('option', { name: /Create/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    const added = screen.getAllByRole('spinbutton', { name: /Team FTE % for/ });
    expect(added).toHaveLength(1);

    await user.type(field, 'zz');
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('highlights nothing when the list shrinks past the highlighted option, and Enter does nothing', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Felix Brandt');
    goTo('t1');
    const field = await screen.findByRole('combobox', { name: 'Add member' });
    await user.type(field, 'fe');
    await user.keyboard('{ArrowUp}'); // the last option, Create
    expect(field).toHaveAttribute('aria-activedescendant');
    // Felix joins from elsewhere, so only Create is left and the highlight points past the end.
    act(() => addToTeam('Felix Brandt', 't1'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(field).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('spinbutton', { name: /Team FTE % for/ })).toHaveLength(1);
  });

  it('reaches "Create" by arrow keys and creates the person with Enter', async () => {
    const user = userEvent.setup();
    await renderApp();
    goTo('t1');
    const field = await screen.findByRole('combobox', { name: 'Add member' });
    await user.type(field, 'Nova Quinn');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByRole('spinbutton', { name: 'Team FTE % for Nova Quinn' })).toHaveValue(100);
  });

  it('leaves the field on Tab without walking through the options', async () => {
    const user = userEvent.setup();
    await renderApp();
    goTo('t1');
    const field = await screen.findByRole('combobox', { name: 'Add member' });
    await user.type(field, 'Nobody');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.tab();
    expect(field).not.toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field).toHaveValue('Nobody');
  });

  it('adds a person back to a team they left: the same membership returns, capped at what is unclaimed', async () => {
    // jsdom lacks what Radix Select uses to open its list.
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Lucía Ramos');
    goTo('t2');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Luc');
    await user.click(screen.getByRole('option', { name: /Lucía Ramos/ }));
    const fte = await screen.findByRole('spinbutton', { name: 'Team FTE % for Lucía Ramos' });
    await user.clear(fte);
    await user.type(fte, '70');
    await user.tab();
    await rowAction(user, 'Actions for Lucía Ramos in this team', 'Deactivate in team');
    // Payments takes the 100% that is now unclaimed.
    goTo('t1');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Luc');
    await user.click(screen.getByRole('option', { name: /Lucía Ramos/ }));

    goTo('people');
    await screen.findByRole('heading', { name: 'People' });
    await user.click(await screen.findByRole('button', { name: 'Lucía Ramos' }));
    const panel = await screen.findByRole('dialog', { name: 'Lucía Ramos' });
    expect(within(panel).queryByRole('combobox', { name: 'Add to team' })).not.toBeInTheDocument(); // nothing free

    await user.click(within(panel).getByRole('button', { name: 'Payments 100%' }));
    const only = await screen.findByRole('spinbutton', { name: 'Team FTE % for Payments' });
    await user.clear(only);
    await user.type(only, '60');
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    within(panel).getByRole('combobox', { name: 'Add to team' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'Platform' }));

    // The rejoined team's popover opens by itself, so its cap note is seen (slice 062).
    const back = await screen.findByRole('spinbutton', { name: 'Team FTE % for Platform' });
    expect(back).toHaveValue(40);
    expect(screen.getByText('Set to 40%, the most left. Other teams hold the rest.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    goTo('t2');
    await screen.findByRole('heading', { name: 'Platform' });
    expect(screen.getAllByRole('row', { name: /Lucía Ramos/ })).toHaveLength(1);
  });

  it('lets the team detail raise Team FTE % past the unclaimed capacity and warns, as before', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Linus Torvalds');
    goTo('t1');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('option', { name: /Linus Torvalds/ }));
    const first = await screen.findByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' });
    await user.clear(first);
    await user.type(first, '60');
    await user.tab();
    goTo('t2');
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Linus');
    await user.click(screen.getByRole('option', { name: /Linus Torvalds/ }));

    goTo('t1');
    await screen.findByRole('heading', { name: 'Payments' });
    const raised = screen.getByRole('spinbutton', { name: 'Team FTE % for Linus Torvalds' });
    expect(raised).toHaveValue(60);
    await user.clear(raised);
    await user.type(raised, '90');
    await user.tab();
    expect(raised).toHaveValue(90);
    expect(raised).not.toBeInvalid();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Team FTE % add up to more than their 100% capacity/ })).toBeInTheDocument();
  });

  it('refuses a Capacity % outside 0 to 100 in the person panel and saves one inside it', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Linus Torvalds');
    await user.click(screen.getByRole('button', { name: 'Linus Torvalds' }));
    const panel = await screen.findByRole('dialog', { name: 'Linus Torvalds' });
    const capacity = within(panel).getByRole('spinbutton', { name: 'Capacity %' });

    await user.clear(capacity);
    await user.type(capacity, '101');
    await user.tab();
    expect(within(panel).getByRole('alert')).toHaveTextContent('Enter a percentage from 0 to 100.');
    expect(capacity).toBeInvalid();

    await user.clear(capacity);
    await user.type(capacity, '80');
    await user.tab();
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(capacity).toHaveValue(80);
  });

  it('closes the panel with Escape', async () => {
    const user = userEvent.setup();
    await renderApp();
    await addPerson(user, 'Margaret Hamilton');
    await user.click(screen.getByRole('button', { name: 'Margaret Hamilton' }));
    expect(await screen.findByRole('dialog', { name: 'Margaret Hamilton' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Margaret Hamilton' })).toHaveFocus());
  });
});
