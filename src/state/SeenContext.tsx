import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cacheScope, SeenCache } from '../cache/db';
import { hasChangedSince, keyFigureSnapshot, previousFigures, seenRecord, type KeyFigureSnapshot, type SeenRecord } from '../data/seen';
import type { Initiative } from '../data/types';
import { useBrand } from './BrandContext';
import { useRepositoryState } from './DataContext';

/** An initiative that changed since the user last opened it (§9.9), with when they last looked. */
export interface ChangedInitiative {
  id: string;
  since: number;
}

interface Seen {
  /** The store was read and can be written; without it nothing is marked (§10.4). */
  available: boolean;
  records: ReadonlyMap<string, SeenRecord>;
  /** Every opened initiative that changed since, by id. */
  changed: ReadonlyMap<string, number>;
  record: (initiative: Initiative, figures: KeyFigureSnapshot) => void;
  /** Mark as seen (§9.9): every changed initiative's record is rewritten as of now. */
  markAllSeen: () => void;
  /** Forgets everything, as Reset does (§5.9). */
  clear: () => void;
}

const NOTHING: Seen = { available: false, records: new Map(), changed: new Map(), record: () => {}, markAllSeen: () => {}, clear: () => {} };

const SeenContext = createContext<Seen>(NOTHING);

/**
 * What the user last looked at, per initiative opened (§9.9, §10.4): read from IndexedDB once, kept in memory and
 * written through. An unreadable store leaves nothing marked and fails nothing. Without this provider (a screen
 * rendered alone) every hook below reads as "nothing changed".
 */
export function SeenProvider({ children }: { children: ReactNode }) {
  const brand = useBrand();
  const { initiatives, people, roles, countries } = useRepositoryState();
  const cache = useMemo(() => new SeenCache(cacheScope(brand.github)), [brand]);
  const [records, setRecords] = useState<ReadonlyMap<string, SeenRecord>>(new Map());
  const [available, setAvailable] = useState(false);

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

  const store = useCallback(
    (entries: [string, SeenRecord][]) => {
      setRecords((now) => new Map([...now, ...entries]));
      // A write that fails only means the next visit marks nothing for it.
      cache.putMany(entries).catch(() => {});
    },
    [cache],
  );

  const changed = useMemo(() => {
    const found = new Map<string, number>();
    if (!available) return found;
    const data = { roles, countries };
    for (const initiative of initiatives) {
      const record = records.get(initiative.id);
      if (record && hasChangedSince(record, initiative, keyFigureSnapshot(initiative, brand.process, people, data))) found.set(initiative.id, record.at);
    }
    return found;
  }, [available, records, initiatives, people, roles, countries, brand.process]);

  const value = useMemo<Seen>(
    () => ({
      available,
      records,
      changed,
      record: (initiative, figures) => {
        if (available) store([[initiative.id, seenRecord(initiative, figures, Date.now())]]);
      },
      markAllSeen: () => {
        const data = { roles, countries };
        const now = Date.now();
        store(
          initiatives
            .filter((i) => changed.has(i.id))
            .map((i): [string, SeenRecord] => [i.id, seenRecord(i, keyFigureSnapshot(i, brand.process, people, data), now)]),
        );
      },
      clear: () => {
        setRecords(new Map());
        cache.clear().catch(() => {});
      },
    }),
    [available, records, changed, store, initiatives, people, roles, countries, brand.process, cache],
  );

  return <SeenContext.Provider value={value}>{children}</SeenContext.Provider>;
}

export const useSeen = (): Seen => useContext(SeenContext);

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
  const seen = useSeen();
  const { status, syncing, people, roles, countries } = useRepositoryState();
  const [previous, setPrevious] = useState<Partial<KeyFigureSnapshot> | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!seen.available || status !== 'ready' || !initiative) return;
    // The first look waits for the pull of the day to land, so a change it brings is seen here, not recorded as seen.
    if (!opened.current && syncing) return;
    const figures = keyFigureSnapshot(initiative, brand.process, people, { roles, countries });
    const recorded = seen.records.get(initiative.id);
    if (!opened.current) {
      opened.current = true;
      setPrevious(recorded ? previousFigures(recorded, figures) : {});
    }
    if (!recorded || hasChangedSince(recorded, initiative, figures)) seen.record(initiative, figures);
  }, [seen, status, syncing, initiative, brand.process, people, roles, countries]);

  return previous;
}
