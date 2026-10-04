import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryState } from '../sync/Repository';
import { NewInitiativeControl } from './NewInitiativeControl';

let state: Partial<RepositoryState>;
vi.mock('../state/DataContext', () => ({ useRepositoryState: () => state }));

beforeEach(() => {
  state = { teams: [], initiatives: [] };
});
afterEach(cleanup);

describe('Top bar create button with no team (§9.4)', () => {
  it('is hidden on the Portfolio, where the welcome card has Create a team, and shown elsewhere', () => {
    const { container } = render(<NewInitiativeControl onPortfolio />);
    expect(container).toBeEmptyDOMElement();
    render(<NewInitiativeControl />);
    expect(screen.getByRole('button', { name: 'Create a team' })).toBeInTheDocument();
  });

  it('stays on the Portfolio once a team exists', () => {
    state = { ...state, teams: [{ id: 't1', name: 'Platform', active: true }] };
    render(<NewInitiativeControl onPortfolio />);
    expect(screen.getByRole('button', { name: 'New initiative' })).toBeInTheDocument();
  });
});
