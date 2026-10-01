import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { causeText } from '../github/errors';
import type { FileConflict } from '../sync/FileWriter';
import { pathKey, type Path } from '../sync/merge';
import { describeConflict } from '../ui/describeConflict';
import { useBrand } from './BrandContext';
import { useRepository, useRepositoryState } from './DataContext';

/** Where a banner's Show asked to go: the conflict's file and path, and its block's id to focus on arrival (§9.9). */
export interface ConflictReveal {
  file: string;
  path: Path;
  id: string;
}

interface Snapshot {
  /** The conflicts an inline block is showing right now, by {@link conflictKey}: the banner leaves these out. */
  shown: ReadonlySet<string>;
  /** The conflicts whose last choice failed to save, so their block says so until chosen again. */
  failed: ReadonlySet<FileConflict>;
  reveal: ConflictReveal | null;
}

/**
 * What the conflict blocks and the banner share on the page (§9.9): which conflicts a mounted block shows, which
 * choices failed, and where Show is taking the user. Kept apart from the repository: it is only about the screen.
 */
export class ConflictUiStore {
  private readonly counts = new Map<string, number>();
  private snapshot: Snapshot = { shown: new Set(), failed: new Set(), reveal: null };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private set(next: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  /** A block showing `key` mounted; the returned function is its unmount. */
  register(key: string): () => void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.set({ shown: new Set(this.counts.keys()) });
    return () => {
      const n = (this.counts.get(key) ?? 1) - 1;
      if (n > 0) this.counts.set(key, n);
      else this.counts.delete(key);
      this.set({ shown: new Set(this.counts.keys()) });
    };
  }

  setFailed(conflict: FileConflict, failed: boolean): void {
    const next = new Set(this.snapshot.failed);
    if (failed) next.add(conflict);
    else next.delete(conflict);
    this.set({ failed: next });
  }

  reveal(target: ConflictReveal | null): void {
    this.set({ reveal: target });
  }
}

const ConflictUiContext = createContext<ConflictUiStore | null>(null);
/** For a field rendered without the app around it (a component test): blocks still show and choose. */
const fallback = new ConflictUiStore();

export function ConflictUiProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new ConflictUiStore());
  return <ConflictUiContext.Provider value={store}>{children}</ConflictUiContext.Provider>;
}

export function useConflictUi(): { store: ConflictUiStore } & Snapshot {
  const store = useContext(ConflictUiContext) ?? fallback;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, ...snapshot };
}

/** One conflict's identity on the page: its file and path. */
export const conflictKey = (file: string, path: Path): string => `${file}:${pathKey(path)}`;

/** The DOM id of a conflict's block, for `aria-describedby` and for Show to focus. */
export const conflictBlockId = (file: string, path: Path): string => `conflict-${conflictKey(file, path).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/** A same-field conflict as its field's block shows it (§3, §9.9). */
export interface FieldConflict {
  conflict: FileConflict;
  /** The block's DOM id. */
  id: string;
  key: string;
  /** Both values as the field formats them. */
  mine: string;
  theirs: string;
  /** Why the last choice was not saved, until chosen again. */
  failure: string | null;
  choose: (choice: 'mine' | 'theirs') => void;
  /** The block goes in a full-width row under the field's table row, not under the field (§9.9). */
  inRow?: boolean;
}

/**
 * A field's open same-field conflict (§3, §9.9), or null. A function rather than a hook per value, so a row of
 * fields can ask inside a loop, like `useFieldFailure`.
 */
export function useFieldConflict(): (file: string, path: Path) => FieldConflict | null {
  const repository = useRepository();
  const brand = useBrand();
  const state = useRepositoryState();
  const { store, failed } = useConflictUi();
  return (file, path) => {
    const key = conflictKey(file, path);
    const conflict = state.conflicts.find((c) => conflictKey(c.file, c.path) === key);
    if (!conflict) return null;
    const { mine, theirs } = describeConflict(conflict, { ...state, process: brand.process, currencySymbol: brand.currencySymbol });
    return {
      conflict,
      id: conflictBlockId(file, path),
      key,
      mine,
      theirs,
      failure: failed.has(conflict) ? `Your choice was not saved${state.readOnly ? `: ${causeText(state.readOnly)}` : ''}. Choose again to retry.` : null,
      choose: (choice) => void chooseConflict(repository, store, conflict, choice),
    };
  };
}

/** Saves a choice (005h's resolution); a failed save leaves the conflict open and says so. */
export async function chooseConflict(
  repository: ReturnType<typeof useRepository>,
  store: ConflictUiStore,
  conflict: FileConflict,
  choice: 'mine' | 'theirs',
): Promise<void> {
  store.setFailed(conflict, false);
  const saved = await repository.resolveConflict(conflict, choice);
  if (!saved) store.setFailed(conflict, true);
}

/** While mounted, tells the banner this conflict is on screen; and focuses it when Show asked for it (§9.5). */
export function useShowConflict(key: string, id: string, focus: (id: string) => void): void {
  const { store, reveal } = useConflictUi();
  useEffect(() => store.register(key), [store, key]);
  useEffect(() => {
    if (reveal?.id !== id) return;
    focus(id);
    store.reveal(null);
  }, [reveal, id, store, focus]);
}

/** Runs `open` when Show targets `file`, so a collapsed part of the page (a phase, a panel) opens to the field. */
export function useRevealTarget(file: string, open: (path: Path) => void): void {
  const { reveal } = useConflictUi();
  // `open` is a fresh closure each render; only a new reveal should run it.
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    if (reveal && reveal.file === file) latest.current(reveal.path);
  }, [reveal, file]);
}
