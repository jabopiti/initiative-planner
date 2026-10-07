import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamsOverview } from './TeamsOverview';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const teams = [{ id: 't1', name: 'Payments', active: true }];

fakeOnDemand((fake) => seedFiles(fake, { teams }));

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

afterEach(cleanup);

describe('name inputs take keyboard focus (shadcn Input receives ref, React 19)', () => {
  it('Teams overview: New team focuses the name field', async () => {
    const user = userEvent.setup();
    renderWith(<TeamsOverview />);
    await user.click(await screen.findByRole('button', { name: 'New team' }));
    await vi.waitFor(() => expect(screen.getByRole('textbox', { name: 'Team name' })).toHaveFocus());
  });

  it('People overview: adding a person returns focus to the quick-add name field', async () => {
    const user = userEvent.setup();
    renderWith(<PeopleOverview />);
    const nameField = await screen.findByPlaceholderText('Add a person by name');
    await user.type(nameField, 'Ada');
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(nameField).toHaveFocus();
  });
});
