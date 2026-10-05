import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cacheScope, SeenCache } from '../cache/db';
import { changedInitiatives, hasChangedSince, keyFigureSnapshot, previousFigures, seenRecord, type ChangedEntry, type KeyFigureSnapshot, type SeenRecord } from '../data/seen';
import type { Initiative } from '../data/types';
import { useBrand } from './BrandContext';
import { useRepositoryState } from './DataContext';

/** An initiative that changed since the user last opened it (§9.9), with when they last looked. */
export interface ChangedInitiative {
  id: string;
  since: number;
}

/** What changes with the data: the changed set. */
interface SeenState {
  /** The store was read and can be written; without it nothing is marked (§10.4). */
  available: boolean;
  /** Every opened initiative that changed since, by id, with when the user last looked. */
  changed: ReadonlyMap<string, number>;
}

/** What never changes identity, so a component that only acts does not render with the data. */
interface SeenActions {
  /** What was recorded for an initiative, as of now. */
  recordOf: (initiativeId: string) => SeenRecord | undefined;
  record: (initiative: Initiative, figures: KeyFigureSnapshot) => void;
  /** Mark as seen (§9.9): every changed initiative's record is rewritten as of now. */
  markAllSeen: () => void;
}

const NOTHING_STATE: SeenState = { available: false, changed: new Map() };
const NOTHING_ACTIONS: SeenActions = { recordOf: () => undefined, record: () => {}, markAllSeen: () => {} };

const SeenStateContext = createContext<SeenState>(NOTHING_STATE);
const SeenActionsContext = createContext<SeenActions>(NOTHING_ACTIONS);

/** The same map again when nothing in it differs, so consumers do not render for a recomputation that found no change. */
function sameEntries<T>(a: ReadonlyMap<string, T>, b: ReadonlyMap<string, T>, equal: (x: T, y: T) => boolean): boolean {
  return a.size === b.size && [...a].every(([id, x]) => b.has(id) && equal(x, b.get(id)!));
}

/**
 * What the user last looked at, per initiative opened (§9.9, §10.4): read from IndexedDB once, kept in memory and
 * written through. An unreadable store leaves nothing marked and fails nothing. Reset empties it (the repository's
 * `datasetResets`). Without this provider (a screen rendered alone) every hook below reads as "nothing changed".
 */
export function SeenProvider({ children }: { children: ReactNode }) {
  const brand = useBrand();
  const { initiatives, people, roles, countries, datasetResets } = useRepositoryState();
  const scope = cacheScope(brand.github);
  const cache = useMemo(() => new SeenCache(scope), [scope]);
  const [records, setRecords] = useState<ReadonlyMap<string, SeenRecord>>(new Map());
  const [available, setAvailable] = useState(false);
  // What the actions read, so they stay the same functions while it moves on.
  const latest = useRef({ records, initiatives, changedEntries: new Map<string, ChangedEntry>() });
  latest.current.records = records;
  latest.current.initiatives = initiatives;

  useEffect(() => {
    let cancelled = false;
    cache.all().then(
      (found) => {
        if (cancelled) return;
        // An initiative recorded before this read finished keeps its newer record.
        setRecords((now) => new Map([...found, ...now]));
        setAvailable(true);
      },
      () => {
        if (!cancelled) setAvailable(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cache]);

  // A reset (§5.9) forgets everything, here and in the store.
  const resets = useRef(datasetResets);
  useEffect(() => {
    if (resets.current === datasetResets) return;
    resets.current = datasetResets;
    setRecords(new Map());
    cache.clear().catch(() => {});
  }, [datasetResets, cache]);

  const changedEntries = useMemo(
    () => (available ? changedInitiatives(records, initiatives, brand.process, people, { roles, countries }) : new Map<string, ChangedEntry>()),
    [available, records, initiatives, people, roles, countries, brand.process],
  );
  latest.current.changedEntries = changedEntries;

  const lastChanged = useRef<ReadonlyMap<string, number>>(new Map());
  const changed = useMemo(() => {
    const next = new Map([...changedEntries].map(([id, entry]) => [id, entry.since]));
    if (!sameEntries(lastChanged.current, next, (x, y) => x === y)) lastChanged.current = next;
    return lastChanged.current;
  }, [changedEntries]);

  const state = useMemo<SeenState>(() => ({ available, changed }), [available, changed]);

  const actions = useMemo<SeenActions>(() => {
    const store = (entries: [string, SeenRecord][]) => {
      setRecords((now) => new Map([...now, ...entries]));
      // A write that fails only means the next visit marks nothing for it.
      cache.putMany(entries).catch(() => {});
    };
    return {
      recordOf: (id) => latest.current.records.get(id),
      record: (initiative, figures) => store([[initiative.id, seenRecord(initiative, figures, Date.now())]]),
      markAllSeen: () => {
        const now = Date.now();
        const entries = [...latest.current.changedEntries];
        const byId = new Map(latest.current.initiatives.map((i) => [i.id, i]));
        store(entries.map(([id, { figures }]): [string, SeenRecord] => [id, seenRecord(byId.get(id)!, figures, now)]));
      },
    };
  }, [cache]);

  return (
    <SeenStateContext.Provider value={state}>
      <SeenActionsContext.Provider value={actions}>{children}</SeenActionsContext.Provider>
    </SeenStateContext.Provider>
  );
}

export const useSeen = (): SeenState => useContext(SeenStateContext);
export const useSeenActions = (): SeenActions => useContext(SeenActionsContext);

/** The changed initiatives, earliest last visit first (§9.9). */
export function useChangedInitiatives(): ChangedInitiative[] {
  const { changed } = useSeen();
  return useMemo(() => [...changed].map(([id, since]) => ({ id, since })).sort((a, b) => a.since - b.since), [changed]);
}

/**
 * The page of one initiative was opened (§9.9): the figures that differ from what the user last saw, read once when the
 * page has the latest data and kept for the visit, so a figure the user's own edit moves later shows no previous value.
 * The record is rewritten whenever the initiative changes while the page is open, so what is seen here, the user's own
 * edits included, is never marked. `null` until read, and for good when nothing is recorded.
 */
export function useInitiativeVisit(initiative: Initiative | undefined): Partial<KeyFigureSnapshot> | null {
  const brand = useBrand();
  const { available } = useSeen();
  const { recordOf, record } = useSeenActions();
  const { status, syncing, people, roles, countries } = useRepositoryState();
  const [previous, setPrevious] = useState<Partial<KeyFigureSnapshot> | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!available || status !== 'ready' || !initiative) return;
    // The first look waits for the pull of the day to land, so a change it brings is seen here, not recorded as seen.
    if (!opened.current && syncing) return;
    const figures = keyFigureSnapshot(initiative, brand.process, people, { roles, countries });
    const recorded = recordOf(initiative.id);
    if (!opened.current) {
      opened.current = true;
      setPrevious(recorded ? previousFigures(recorded, figures) : {});
    }
    if (!recorded || hasChangedSince(recorded, initiative, figures)) record(initiative, figures);
  }, [available, recordOf, record, status, syncing, initiative, brand.process, people, roles, countries]);

  return previous;
}
