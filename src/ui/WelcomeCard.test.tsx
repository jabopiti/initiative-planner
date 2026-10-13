import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import type { RepositoryState } from '../sync/Repository';
import { BrandProvider } from '../state/BrandContext';
import { WelcomeCard } from './WelcomeCard';

let state: Partial<RepositoryState>;
vi.mock('../state/DataContext', () => ({ useRepositoryState: () => state }));

const flags = (ratesReviewed: boolean) => ({ schemaVersion: 1, processIdentity: { id: 'p', structureVersion: 1 }, ratesReviewed });
const row = (name: string) => screen.getByText(name, { selector: 'li > span' }).closest('li')!;
const renderCard = () =>
  render(
    <BrandProvider brand={defaultBrandPack}>
      <WelcomeCard />
    </BrandProvider>,
  );

beforeEach(() => {
  state = { datasetFlags: flags(false), teams: [], people: [], memberships: [], initiatives: [] };
});
afterEach(cleanup);

describe('Welcome card (§9.4)', () => {
  it('welcomes with the four steps, Create a team as its only button and a link to review rates', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: `Welcome to ${defaultBrandPack.productName}` })).toBeInTheDocument();
    expect(screen.getByText('Four steps to your first costed initiative.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(within(row('Create a team')).getByRole('button', { name: 'Create a team' })).toBeInTheDocument();
    expect(within(row('Review rates')).getByRole('link', { name: 'Review rates' })).toHaveAttribute('href', '#/settings/countries');
    expect(within(row('Add people to the team')).queryByRole('link')).toBeNull();
    expect(within(row('Create your first initiative')).queryByRole('link')).toBeNull();
  });

  it('ticks reviewed rates and drops their link', () => {
    state = { ...state, datasetFlags: flags(true) };
    renderCard();
    expect(within(row('Review rates')).getByText('(done)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review rates' })).toBeNull();
  });
});
