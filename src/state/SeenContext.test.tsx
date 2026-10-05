import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheScope, SeenCache } from '../cache/db';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { SeenRecord } from '../data/seen';
import { BrandProvider } from './BrandContext';
import { SeenProvider } from './SeenContext';

let state: { initiatives: never[]; people: never[]; roles: never[]; countries: never[]; datasetResets: number };
let listeners: Set<() => void>;
vi.mock('./DataContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useRepositoryState: () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state) };
});

const scope = cacheScope(defaultBrandPack.github);
const record: SeenRecord = { at: 1, fingerprint: 'f', figures: { estimate: 0, deviation: 0, phase: 'Ideation', gate: 'Nothing to check' } };

afterEach(async () => {
  await new SeenCache(scope).clear();
});

describe('SeenProvider (§5.9, §10.4)', () => {
  it('forgets every record, in the store too, when the dataset is reset', async () => {
    state = { initiatives: [], people: [], roles: [], countries: [], datasetResets: 0 };
    listeners = new Set();
    await new SeenCache(scope).putMany([['a', record]]);
    render(
      <BrandProvider brand={defaultBrandPack}>
        <SeenProvider>{null}</SeenProvider>
      </BrandProvider>,
    );
    await waitFor(async () => expect((await new SeenCache(scope).all()).size).toBe(1));

    state = { ...state, datasetResets: 1 };
    act(() => listeners.forEach((l) => l()));

    await waitFor(async () => expect((await new SeenCache(scope).all()).size).toBe(0));
  });
});
