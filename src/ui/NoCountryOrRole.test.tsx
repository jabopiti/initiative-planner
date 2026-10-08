import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PeopleOverview } from './PeopleOverview';
import { TeamDetail } from './TeamDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

fakeOnDemand((fake) => seedFiles(fake, { roles: [], countries: [], teams: [{ id: 't1', name: 'Payments', active: true }] }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

const wrap = (view: React.ReactNode) => (
  <BrandProvider brand={defaultBrandPack}>
    <TooltipProvider>
      <RepositoryProvider token="token">{view}</RepositoryProvider>
    </TooltipProvider>
  </BrandProvider>
);

describe('adding a person with no active country or role (slice 054, §9.4)', () => {
  it('disables Add person and links to Settings on the People overview', async () => {
    const user = userEvent.setup();
    render(wrap(<PeopleOverview />));
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Mira Kovac');
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(screen.getByText(/before adding people\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });

  it('offers no Create option on the team page, and says why', async () => {
    const user = userEvent.setup();
    render(wrap(<TeamDetail id="t1" />));
    await user.type(await screen.findByRole('combobox', { name: 'Add member' }), 'Mira Kovac');
    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
    expect(screen.getByText(/before creating people\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });
});
