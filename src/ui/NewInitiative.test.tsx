import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NewInitiativeControl } from './NewInitiativeControl';
import { NewInitiativeDraft } from './NewInitiativeDraft';
import { PortfolioBoard } from './PortfolioBoard';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const ONE_TEAM = [{ id: 't1', name: 'Payments', active: true }];
const TWO_TEAMS = [
  { id: 't1', name: 'Payments', active: true },
  { id: 't2', name: 'Platform', active: true },
];

let teams = ONE_TEAM;

const served = fakeOnDemand((fake) => seedFiles(fake, { teams }));

beforeAll(() => {
  // Radix Select needs these pointer/scroll APIs, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
beforeEach(() => {
  teams = ONE_TEAM;
  localStorage.clear();
  window.location.hash = '';
});

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

/** The initiative files the fake accepted a write to. */
const initiativePuts = () => served.accepted().filter((p) => p.path.startsWith('initiatives/'));
const nameField = () => screen.findByPlaceholderText('Name this initiative');

describe('New initiative: name it on the page (§5.1, §5.4)', () => {
  it('the top-bar button and the Portfolio empty state both open the draft page', async () => {
    const user = userEvent.setup();
    const bar = renderWith(<NewInitiativeControl />);
    const button = await screen.findByRole('button', { name: 'New initiative' });
    await vi.waitFor(() => expect(button).toBeEnabled()); // teams have loaded
    await user.click(button);
    expect(window.location.hash).toBe('#/initiatives/new');
    bar.unmount();

    window.location.hash = '';
    renderWith(<PortfolioBoard />);
    await user.click(await screen.findByRole('button', { name: 'Create your first initiative' }));
    expect(window.location.hash).toBe('#/initiatives/new');
  });

  it('opens with the name field focused and highlighted, Select team even with one team, and Create disabled', async () => {
    renderWith(<NewInitiativeDraft />);
    const field = await nameField();
    expect(field).toHaveFocus();
    expect(field).toHaveClass('border-brand-accent');
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Select team');
    expect(screen.getByRole('button', { name: 'Create initiative' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Next: name the initiative.');
    expect(screen.queryByRole('heading', { name: 'Phases' })).not.toBeInTheDocument();
  });

  it('shows greyed previews of the strip, key figures and phase rows, hidden from screen readers', async () => {
    renderWith(<NewInitiativeDraft />);
    await nameField();
    const preview = screen.getByTestId('draft-preview');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    for (const phase of defaultBrandPack.process) expect(within(preview).getAllByText(phase.label)).toHaveLength(2);
    // Four key figures, then each costed phase's total.
    const costed = defaultBrandPack.process.filter((phase) => phase.costed).length;
    expect(within(preview).getAllByText('—')).toHaveLength(4 + costed);
    expect(within(preview).getByText(`Gate ${defaultBrandPack.process[0].exitGate.label}`)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Phases' })).not.toBeInTheDocument();
  });

  it('lists the active teams with none marked or preselected', async () => {
    const user = userEvent.setup();
    teams = [...TWO_TEAMS, { id: 't3', name: 'Retired', active: false }];
    renderWith(<NewInitiativeDraft />);
    await nameField();
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Payments', 'Platform']);
    expect(options.some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
  });

  it('a name only: leaving the field saves nothing and the team is the next step', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Loyalty pilot');
    await user.click(document.body);
    expect(initiativePuts()).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveClass('border-brand-accent');
    expect(screen.getByRole('status')).toHaveTextContent('Next: choose a team.');
    expect(screen.getByRole('button', { name: 'Create initiative' })).toBeDisabled();
  });

  it('a team only: Create is disabled and the name is the next step', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await nameField();
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    expect(screen.getByRole('button', { name: 'Create initiative' })).toBeDisabled();
    expect(await nameField()).toHaveClass('border-brand-accent');
    expect(screen.getByRole('status')).toHaveTextContent('Next: name the initiative.');
    expect(initiativePuts()).toHaveLength(0);
  });

  it('with a name and a team, Create is enabled and highlighted, and nothing is saved yet', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Data lake');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    const create = screen.getByRole('button', { name: 'Create initiative' });
    expect(create).toBeEnabled();
    expect(create).toHaveClass('ring-brand-accent');
    expect(screen.getByRole('status')).toHaveTextContent('Ready. Create the initiative to start planning.');
    expect(initiativePuts()).toHaveLength(0);
  });

  it('when the initiative cannot be saved the draft stays, with its name and team, and Create can be tried again', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Data lake');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));

    served.fake().fail('initiatives/', 500);
    await user.click(screen.getByRole('button', { name: 'Create initiative' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Create initiative' })).toBeEnabled());
    expect(window.location.hash).toBe('');
    expect(await nameField()).toHaveValue('Data lake');

    await user.click(screen.getByRole('button', { name: 'Create initiative' }));
    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/initiatives\/./));
    expect(initiativePuts()).toHaveLength(1);
  });

  it('Create initiative writes one commit and the initiative page replaces the draft', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Payments API v2');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    await user.click(screen.getByRole('button', { name: 'Create initiative' }));

    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
    const saved = initiativePuts()[0].content as { id: string };
    expect(initiativePuts()[0].message).toBe(`Payments API v2: created\n\nEntity: initiative/${saved.id}`);
    expect(saved).toMatchObject({ name: 'Payments API v2', teamId: 't1', status: 'Active' });
    expect(window.location.hash).toBe(`#/initiatives/${saved.id}`);
  });

  it('Enter in the name field creates once a team is chosen', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    const field = await nameField();
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    await user.click(field);
    await user.type(field, 'Data lake{Enter}');
    await vi.waitFor(() => expect(initiativePuts()).toHaveLength(1));
  });

  it('Enter with no team yet moves focus to the team selector and saves nothing', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Data lake{Enter}');
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveFocus();
    expect(initiativePuts()).toHaveLength(0);
  });

  it('changing the team before creating changes the selection and saves nothing', async () => {
    const user = userEvent.setup();
    teams = TWO_TEAMS;
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Checkout redo');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Platform' }));
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Platform');
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await user.click(await screen.findByRole('option', { name: 'Payments' }));
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Payments');
    expect(initiativePuts()).toHaveLength(0);
  });

  it('Esc discards the draft and returns to the Portfolio, saving nothing', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await user.type(await nameField(), 'Never mind{Escape}');
    expect(window.location.hash).toBe('#/portfolio');
    expect(initiativePuts()).toHaveLength(0);
  });

  it('Esc also discards the draft when focus is on the page body', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await nameField();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');
    expect(window.location.hash).toBe('#/portfolio');
  });

  it('Esc with the team dropdown open only closes the dropdown', async () => {
    const user = userEvent.setup();
    renderWith(<NewInitiativeDraft />);
    await nameField();
    window.location.hash = '#/initiatives/new';
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    await screen.findByRole('option', { name: 'Payments' });
    await user.keyboard('{Escape}');
    expect(window.location.hash).toBe('#/initiatives/new');
  });
});
