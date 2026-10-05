import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryState } from '../sync/Repository';
import { GettingStartedChip, GettingStartedStrip } from './GettingStartedStrip';
import { resetGettingStartedDismissal } from './gettingStartedDismissal';
import { useArrival } from './arrival';

let state: Partial<RepositoryState>;
let listeners: Set<() => void>;
vi.mock('../state/DataContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRepositoryState: () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state),
  };
});

const flags = (ratesReviewed: boolean) => ({ schemaVersion: 1, processIdentity: { id: 'p', structureVersion: 1 }, ratesReviewed });
const team = { id: 't1', name: 'Platform', active: true };
const mara = { id: 'p1', name: 'Mara Voss', countryId: 'c', roleId: 'r', capacityPct: 100, active: true };
const membership = { id: 'm1', personId: 'p1', teamId: 't1', teamFtePct: 50, active: true };
const checkout = { id: 'i1', name: 'Checkout Redesign', teamId: 't1', status: 'Active' };
const update = (next: Partial<RepositoryState>) => {
  state = { ...state, ...next };
  act(() => listeners.forEach((l) => l()));
};
const link = (name: string) => screen.getByRole('link', { name: new RegExp(name) });
const isDone = (name: string) => within(link(name).closest('li')!).queryByText('(done)') !== null;

beforeEach(() => {
  listeners = new Set();
  state = { datasetFlags: flags(false), teams: [], people: [], memberships: [], initiatives: [] };
  resetGettingStartedDismissal();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Getting started strip (§5.2)', () => {
  it('shows four open steps and Dismiss for now on a fresh dataset', () => {
    render(<GettingStartedStrip />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('(done)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss for now' })).toBeInTheDocument();
  });

  it('links each step to where it is done', () => {
    update({ teams: [team] });
    render(<GettingStartedStrip />);
    expect(link('Review rates')).toHaveAttribute('href', '#/settings/countries');
    expect(link('Create a team')).toHaveAttribute('href', '#/teams');
    expect(link('Add people to the team')).toHaveAttribute('href', '#/teams/t1');
    expect(link('Create your first initiative')).toHaveAttribute('href', '#/initiatives/new');
  });

  it('highlights the place a followed step leads to, but not when the link opens in a new tab', () => {
    function RatesCorrect() {
      return (
        <button {...useArrival<HTMLButtonElement>('rates')} type="button">
          Rates are correct
        </button>
      );
    }
    const arrived = () => {
      const { unmount } = render(<RatesCorrect />);
      const highlighted = screen.getByRole('button', { name: 'Rates are correct' }).classList.contains('ring-brand-accent');
      unmount();
      return highlighted;
    };
    render(<GettingStartedStrip />);
    fireEvent.click(link('Review rates'), { ctrlKey: true });
    expect(arrived()).toBe(false);
    fireEvent.click(link('Review rates'));
    expect(arrived()).toBe(true);
  });

  it('checks each step as the data shows it done, including a change pulled in from another user, then disappears', () => {
    render(<GettingStartedStrip />);
    update({ datasetFlags: flags(true) });
    expect(isDone('Review rates')).toBe(true);
    update({ teams: [team] });
    expect(isDone('Create a team')).toBe(true);
    update({ people: [mara], memberships: [membership] });
    expect(isDone('Add people to the team')).toBe(true);
    expect(isDone('Create your first initiative')).toBe(false);
    update({ initiatives: [checkout] as RepositoryState['initiatives'] });
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
  });

  it('hides on Dismiss for now and stays hidden for the session', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GettingStartedStrip />);
    await user.click(screen.getByRole('button', { name: 'Dismiss for now' }));
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
    unmount();
    render(<GettingStartedStrip />);
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
  });

  it('returns in a new session while steps remain', () => {
    sessionStorage.setItem('getting-started-dismissed', '1');
    resetGettingStartedDismissal(); // a new session: nothing stored, nothing in memory
    render(<GettingStartedStrip />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('still renders, and Dismiss hides it for the page lifetime, when session storage throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<GettingStartedStrip />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss for now' }));
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
  });

  it('counts the steps done beside a progress bar, cleared ones struck through', () => {
    update({ datasetFlags: flags(true), teams: [team] });
    render(<GettingStartedStrip />);
    expect(screen.getByText('2 of 4 done')).toBeInTheDocument();
    expect(link('Review rates')).toHaveClass('line-through');
    expect(link('Add people to the team')).not.toHaveClass('line-through');
  });

  it('stays expanded at three of four unless it may collapse', () => {
    update({ datasetFlags: flags(true), teams: [team], people: [mara], memberships: [membership] });
    render(<GettingStartedStrip />);
    expect(screen.getByText('3 of 4 done')).toBeInTheDocument();
    cleanup();
    render(<GettingStartedStrip collapsible />);
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull();
  });
});

describe('Getting started chip (§5.2)', () => {
  it('shows only at three of four done', () => {
    update({ datasetFlags: flags(true), teams: [team] });
    render(<GettingStartedChip />);
    expect(screen.queryByRole('button', { name: /Getting started/ })).toBeNull();
    update({ people: [mara], memberships: [membership] });
    expect(screen.getByRole('button', { name: 'Getting started · 3 of 4 done' })).toBeInTheDocument();
  });

  it('opens the remaining step in a popover, with Dismiss for now', async () => {
    const user = userEvent.setup();
    update({ teams: [team], people: [mara], memberships: [membership], initiatives: [checkout] as RepositoryState['initiatives'] });
    render(<GettingStartedChip />);
    await user.click(screen.getByRole('button', { name: 'Getting started · 3 of 4 done' }));
    expect(screen.getByText('One step left')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review rates' })).toHaveAttribute('href', '#/settings/countries');
    await user.click(screen.getByRole('button', { name: 'Dismiss for now' }));
    expect(screen.queryByRole('button', { name: /Getting started/ })).toBeNull();
  });
});
