import type { BrandPack } from '../brand/types';
import { cacheScope, FileCache, type CacheMeta } from '../cache/db';
import { buildBaselineDataset, type BaselineDataset } from '../data/baseline';
import { buildExampleData } from '../data/exampleDataset';
import { newId } from '../data/ids';
import {
  FILE_PATHS,
  SCHEMA_VERSION,
  type Allocation,
  type CostItem,
  type Country,
  type CountryYearRateRecord,
  type DatasetFlags,
  type Initiative,
  type Membership,
  type PhasePlan,
  type Person,
  type Role,
  type Team,
} from '../data/types';
import { allocationRefusal, trackedYears } from '../data/cost';
import { formatDate, formatMonth, monthKey } from '../data/dates';
import { countriesRolledForward, newCountryRates, peopleRolledForward, weekdaysByMonth } from '../data/rates';
import { localToday } from '../data/dates';
import { buildDefaultPlan, extendByOneMonth } from '../data/defaultPlan';
import { frozenPaths, hasPassedGate, isInitiativeFrozen, isPhaseFrozen } from '../data/frozen';
import { startAtPhase as evaluateStartAtPhase } from '../data/startingPhase';
import { currentPhaseId, passGate as evaluatePassGate, reopenGate as evaluateReopenGate, skipGate as evaluateSkipGate, withChecklistItem, type GateRecorded } from '../data/gate';
import type { ChecklistStatus, InitiativeStatus } from '../data/types';
import { AUTOMATIC_RETRY_CAUSES, toReadOnlyState, type ReadOnlyState } from '../github/errors';
import { GithubClient, parseJsonFile, type BranchHead } from '../github/client';
import { checkToken, type TokenCheckResult } from '../auth/validateToken';
import { unclaimedCapacityPct } from '../data/capacity';
import { activeMembership } from '../data/teamMembers';
import { copySource, planCopy } from '../data/copyAllocations';
import { allocationCount, planTeamChange, type RemovedAllocation, type TeamChangePlan } from '../data/teamChange';
import { FileWriter, type CommitNote, type DeleteResult, type EntityKind, type FileConflict, type Received, type WriteStatus } from './FileWriter';
import { mergeDocument, pathKey, sameValue, type Path } from './merge';
import { WriteQueue } from './WriteQueue';

export type { ReadOnlyState } from '../github/errors';

/** GitHub's request budget for the hour, from the latest response's headers (§5.9); `resetsAt` is epoch milliseconds. */
export interface RateLimit {
  remaining: number;
  limit: number;
  resetsAt: number;
}

export interface RepositoryState {
  status: 'loading' | 'ready';
  readOnly: ReadOnlyState | null;
  syncing: boolean;
  datasetFlags: DatasetFlags | null;
  roles: Role[];
  countries: Country[];
  teams: Team[];
  people: Person[];
  memberships: Membership[];
  initiatives: Initiative[];
  conflicts: FileConflict[];
  /** Files with a failed, unsaved edit (§3, §9.9), by path: the read-only banner's cause is `readOnly`, but a
   * field needs its own file's cause, since more than one file can be failing for different reasons at once. */
  fileFailures: ReadonlyMap<string, ReadOnlyState>;
  /** Values with a failed, unsaved edit, as `changeKey`s (§9.9): a field maps its own path to this to show
   * "Not saved" and its own Retry, instead of looking like a normal committed field. */
  failedFields: ReadonlySet<string>;
  /** Values another user's change updated a moment ago, as `changeKey`s, to tint (§9.9 Changed by others). */
  changed: ReadonlySet<string>;
  /** Others' changes arrived a moment ago: the sync indicator's tooltip says so (§9.9). */
  updatedByOthers: boolean;
  /** Initiatives someone else deleted while an edit to them waited to be saved, by id, with their names (§3): their
   * page says the change wasn't saved. */
  deletedWithLostEdit: ReadonlyMap<string, string>;
}

/** The key by which a value at `path` of a data-branch file is reported as changed by others. */
export const changeKey = (file: string, path: Path): string => `${file}#${pathKey(path)}`;

/** Whether the value at `inner` is `outer` itself or lies inside it, comparing whole path segments: `phases.dev` does not cover `phases.development`. */
export function changeCovers(outer: string, inner: string): boolean {
  if (!inner.startsWith(outer)) return false;
  const next = inner[outer.length];
  return next === undefined || outer.endsWith('#') || next === '.' || next === '[';
}

/** How long a change from others stays tinted, and the indicator says "Updated by others" (§9.9: a few seconds). */
export const CHANGE_TINT_MS = 4000;
/** §3: a pull at least this often while the tab is visible. */
export const PULL_INTERVAL_MS = 5 * 60 * 1000;
/** A tab that regains focus again within this pulls only once. */
export const FOCUS_PULL_MIN_GAP_MS = 15 * 1000;
/** After a failed pull, or one that had to leave a file alone, the next attempt comes this soon. */
export const PULL_RETRY_MS = 30 * 1000;
/** How many files a pull reads at once: a dataset of hundreds of initiatives must not fire hundreds of requests together. */
const PULL_READS_AT_ONCE = 8;

/** A file a pull read: its text, which the cache keeps, and what it says, parsed once. A file that is not JSON fails the read. */
interface PulledFile {
  raw: string;
  sha: string;
  value: unknown;
}

/** The commit message deleting an initiative (§10.3). */
const deletedMessage = (initiative: Initiative): string => `${initiative.name}: deleted`;

/** The master files of a fresh-install baseline (§2), as written. */
const baselineFiles = (baseline: BaselineDataset) => [
  { path: FILE_PATHS.datasetFlags, content: JSON.stringify(baseline.datasetFlags) },
  { path: FILE_PATHS.roles, content: JSON.stringify(baseline.roles) },
  { path: FILE_PATHS.countries, content: JSON.stringify(baseline.countries) },
  { path: FILE_PATHS.teams, content: JSON.stringify(baseline.teams) },
  { path: FILE_PATHS.people, content: JSON.stringify(baseline.people) },
  { path: FILE_PATHS.memberships, content: JSON.stringify(baseline.memberships) },
];

/** How Load example data ended (§5.9): loaded, stopped because the dataset has data, or failed with the cause. */
export type LoadExampleResult = 'loaded' | 'not-empty' | { failed: ReadOnlyState };

/** How Reset ended (§5.9): reset, or failed with the cause. */
export type ResetResult = 'reset' | { failed: ReadOnlyState };

const pulledFile = ({ content, sha }: { content: string; sha: string }): PulledFile => ({ raw: content, sha, value: JSON.parse(content) });

/** Everything one pull found: the files it read, and the versions on screen it compared them with. */
interface Pulled {
  head: BranchHead | null;
  files: Map<string, PulledFile>;
  /** Which paths the repository lists, with their versions: an initiative not in it has been removed. */
  listing: Map<string, string>;
  /** The version each path had on screen when the pull compared, so a save that lands meanwhile is not undone. */
  compared: Map<string, string>;
}

const MASTER_FILES: string[] = [
  FILE_PATHS.datasetFlags,
  FILE_PATHS.roles,
  FILE_PATHS.countries,
  FILE_PATHS.teams,
  FILE_PATHS.people,
  FILE_PATHS.memberships,
];


/** New people (§5.5) take these; country and role default to the last values used. */
export interface NewPersonInput {
  name: string;
  countryId: string;
  roleId: string;
}

/** What Copy from <previous phase> did: how many allocations were added and who was skipped (§5.11). */
export type CopyAllocationsResult = { copied: number; skipped: Person[] };

/** Why an allocation wasn't added (§7.2), in words the page can show as is. */
export type AddAllocationResult = { ok: true; allocation: Allocation } | { ok: false; reason: string };

/** What a team change did, kept by the page for the 10 seconds it can be undone (§5.11). */
export interface TeamChange {
  fromTeamId: string;
  toTeamId: string;
  removed: RemovedAllocation[];
}

/** `item` put back at `index` (or last, when the list has since shrunk): where an Undo restores a removed list item. */
function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

/** One change to a cost item, of the one field the commit note names. */
export type CostItemChange = { label: string } | { amount: number } | { timing: 'spread' } | { timing: 'month'; month: string } | { month: string };

/** The phase lists whose items are removed with an Undo (§5.11). */
type PhaseList = 'allocations' | 'costItems';

/** A phase list's items as the caller knows them; `list` says which, so the one cast is here. */
const itemsOf = <T extends { id: string }>(plan: PhasePlan | undefined, list: PhaseList): T[] => (plan?.[list] ?? []) as unknown as T[];

type Listener = () => void;

/**
 * The single source of truth for dataset state and GitHub sync (§3, §10.2,
 * §10.3). Every file, master or initiative, is saved by its own FileWriter; a new
 * initiative's file is that writer's first save.
 */
export class Repository {
  private state: RepositoryState = {
    status: 'loading',
    readOnly: null,
    syncing: false,
    datasetFlags: null,
    roles: [],
    countries: [],
    teams: [],
    people: [],
    memberships: [],
    initiatives: [],
    conflicts: [],
    fileFailures: new Map(),
    failedFields: new Set(),
    changed: new Set(),
    updatedByOthers: false,
    deletedWithLostEdit: new Map(),
  };

  private readonly listeners = new Set<Listener>();
  private readonly github: GithubClient;
  private readonly queue = new WriteQueue();
  private teamsWriter: FileWriter<Team[]> | null = null;
  private peopleWriter: FileWriter<Person[]> | null = null;
  private membershipsWriter: FileWriter<Membership[]> | null = null;
  private rolesWriter: FileWriter<Role[]> | null = null;
  private countriesWriter: FileWriter<Country[]> | null = null;
  private flagsWriter: FileWriter<DatasetFlags> | null = null;
  /** Today, for the §7.2 rollover, while {@link keepTrackedYears} runs; null otherwise. */
  private rolloverToday: (() => Date) | null = null;
  private readonly initiativeWriters = new Map<string, FileWriter<Initiative>>();
  private readonly cache: FileCache;
  /** What the last complete pull saw; null when a file was left alone or the cache lost one, so the next pull compares everything. */
  private meta: CacheMeta | null = null;
  private pulling: Promise<void> | null = null;
  private lastPullAt = 0;
  /** The first pull is still running: the sync indicator shows syncing until then (§9.9 Opening). */
  private opening = true;
  private markFirstPullDone: () => void = () => {};
  private readonly firstPullDone = new Promise<void>((resolve) => (this.markFirstPullDone = resolve));
  /** Why the last pull failed, until one succeeds (§3 Sync failures). */
  private pullFailure: ReadOnlyState | null = null;
  /** Fields with unsaved typing: a pull that arrives meanwhile is held until they are left (§3). */
  private editing = 0;
  private held: Pulled | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Why the last delete failed (§9.9): shown in the read-only banner until a pull succeeds. */
  private deleteFailure: ReadOnlyState | null = null;
  private tintTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pull running brings in this client's own Reset or Load (§5.9): nothing it changes is "updated by others". */
  private ownCommitPull = false;

  constructor(
    private readonly brand: BrandPack,
    private token: string,
  ) {
    this.github = new GithubClient(brand.github, () => this.token, (headers) => this.noteRateLimit(headers));
    this.cache = new FileCache(cacheScope(brand.github));
  }

  // Arrow properties, so React's useSyncExternalStore gets the same functions on every render and never resubscribes.
  readonly getState = (): RepositoryState => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<RepositoryState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private initialising: Promise<void> | null = null;

  /**
   * Opens the dataset (§3, §9.9 Opening). With a cache of an earlier complete pull, it shows at once and the
   * pull runs in the background, so this resolves before any response; with none, it resolves when the first
   * pull has loaded the dataset. A second call (React StrictMode runs the effect twice in dev) shares the first.
   */
  initialize(): Promise<void> {
    return (this.initialising ??= this.open());
  }

  private async open(): Promise<void> {
    const cached = await this.readCache();
    if (cached) this.build(cached);
    this.publishStatus();
    const firstPull = this.pull().finally(() => {
      this.opening = false;
      this.publishStatus();
      this.markFirstPullDone();
    });
    if (!cached) await firstPull;
  }

  /** Resolves when the pull that is running, if any, has finished and its cache writes have. */
  async whenPulled(): Promise<void> {
    await this.pulling;
    await this.cache.idle();
  }

  /** The cached dataset, or null when there is none to trust: never pulled completely, foreign, or damaged (§3 Damaged data). */
  private async readCache(): Promise<Pulled | null> {
    try {
      const [cached, meta] = await Promise.all([this.cache.all(), this.cache.getMeta()]);
      if (!meta || !cached.has(FILE_PATHS.datasetFlags)) return null;
      // A file that cannot be read makes the whole cache untrustworthy.
      const files = new Map([...cached].map(([path, file]) => [path, pulledFile(file)]));
      const flags = files.get(FILE_PATHS.datasetFlags)!.value as DatasetFlags;
      if (flags.processIdentity.id !== this.brand.processIdentity.id || flags.schemaVersion !== SCHEMA_VERSION) {
        throw new Error('The cache is from another dataset.');
      }
      this.meta = meta;
      return { head: null, files, listing: new Map(), compared: new Map() };
    } catch {
      await this.cache.clear().catch(() => {});
      return null;
    }
  }

  /** Why a dataset may not be used by this build (§3 Data integrity), or null. */
  private refusal(flags: DatasetFlags): string | null {
    if (flags.processIdentity.id !== this.brand.processIdentity.id) {
      return 'This dataset belongs to a different process build. Use the matching build.';
    }
    if (flags.schemaVersion > SCHEMA_VERSION) return 'Dataset is newer than this version — reload to update.';
    return null;
  }

  /** The dataset from what was read: every file, with a writer for each that can be saved. */
  private build({ files }: Pulled): void {
    const branch = this.brand.github.dataBranch;
    /** What a file says, or `fallback` when it does not exist (§10.2: a missing master file means "empty"). */
    const parsed = <T>(path: string, fallback: T): T => (files.has(path) ? (files.get(path)!.value as T) : fallback);
    const initiatives: Initiative[] = [];
    for (const [path, file] of files) {
      if (!path.startsWith('initiatives/')) continue;
      const initiative = file.value as Initiative;
      initiatives.push(initiative);
      this.createInitiativeWriter(initiative, file.sha);
    }
    const roles = parsed(FILE_PATHS.roles, [] as Role[]);
    const teams = parsed(FILE_PATHS.teams, [] as Team[]);
    const people = parsed(FILE_PATHS.people, [] as Person[]);
    const memberships = parsed(FILE_PATHS.memberships, [] as Membership[]);
    const countries = parsed(FILE_PATHS.countries, [] as Country[]);
    const datasetFlags = parsed(FILE_PATHS.datasetFlags, null as DatasetFlags | null);
    const shaOf = (path: string) => files.get(path)?.sha ?? '';

    this.rolesWriter = this.createWriter(FILE_PATHS.roles, branch, 'roles', { content: roles, sha: shaOf(FILE_PATHS.roles) }, []);
    this.countriesWriter = this.createWriter(FILE_PATHS.countries, branch, 'countries', { content: countries, sha: shaOf(FILE_PATHS.countries) }, []);
    this.flagsWriter = datasetFlags && this.createWriter(FILE_PATHS.datasetFlags, branch, 'datasetFlags', { content: datasetFlags, sha: shaOf(FILE_PATHS.datasetFlags) }, null);
    this.teamsWriter = this.createWriter(FILE_PATHS.teams, branch, 'teams', { content: teams, sha: shaOf(FILE_PATHS.teams) }, []);
    this.peopleWriter = this.createWriter(FILE_PATHS.people, branch, 'people', { content: people, sha: shaOf(FILE_PATHS.people) }, []);
    this.membershipsWriter = this.createWriter(FILE_PATHS.memberships, branch, 'memberships', {
      content: memberships,
      sha: shaOf(FILE_PATHS.memberships),
    }, []);

    this.setState({
      status: 'ready',
      datasetFlags,
      roles,
      countries,
      teams,
      people,
      memberships,
      initiatives,
    });
  }

  /**
   * Pulls the repository's changes (§3): on load, when the tab regains focus, and at least every 5 minutes
   * while it is visible. One pull at a time. It never rejects: a failure is the read-only state, with its cause,
   * and the data on screen stays (§3 Failure: refuse writes).
   */
  pull(): Promise<void> {
    if (this.pulling) return this.pulling;
    if (this.held) return Promise.resolve();
    this.lastPullAt = Date.now();
    const pulling = this.runPull().finally(() => {
      if (this.pulling === pulling) this.pulling = null;
    });
    this.pulling = pulling;
    return pulling;
  }

  private async runPull(): Promise<void> {
    let complete = true;
    try {
      const pulled = await this.fetchPull();
      this.pullFailure = null;
      this.deleteFailure = null;
      if (pulled) {
        if (this.editing > 0 && this.state.status === 'ready') this.held = pulled;
        else complete = this.applyPulled(pulled);
      }
    } catch (error) {
      this.pullFailure = toReadOnlyState(error, 'Something went wrong loading the dataset.');
    }
    this.settlePull(complete);
  }

  /** What changed in the repository since what is on screen: null when nothing did, else the files that did. */
  private async fetchPull(): Promise<Pulled | null> {
    const branch = this.brand.github.dataBranch;
    const head = await this.github.getBranchHead({ branch, etag: this.state.status === 'ready' ? (this.meta?.etag ?? null) : null });
    if (head === 'not-modified') return null;
    if (head && this.meta && this.state.status === 'ready' && head.sha === this.meta.head) return null;

    let listing = await this.listDataset(branch);
    if (!listing.has(FILE_PATHS.datasetFlags)) {
      // No dataset anywhere: the first write-capable client creates it (§3). Never over a dataset already on screen.
      if (this.state.status === 'ready') throw new Error('Dataset damaged — its files are gone from the repository.');
      await this.bootstrapBaseline(branch);
      listing = await this.listDataset(branch);
      if (!listing.has(FILE_PATHS.datasetFlags)) throw new Error('Dataset damaged — could not read it after creating it.');
    }

    const compared = this.knownShas();
    const changed = [...listing].filter(([path, sha]) => compared.get(path) !== sha).map(([path]) => path);
    const files = new Map<string, PulledFile>();
    const waiting = [...changed];
    const worker = async () => {
      for (let path = waiting.shift(); path !== undefined; path = waiting.shift()) {
        const file = await this.github.getFile({ path, branch });
        if (file) files.set(path, pulledFile(file));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PULL_READS_AT_ONCE, changed.length) }, worker));
    return { head: head ?? null, files, listing, compared };
  }

  /** The master files and the initiative files the repository lists, by path, with their versions (§10.2). */
  private async listDataset(branch: string): Promise<Map<string, string>> {
    const [root, initiatives] = await Promise.all([
      this.github.listDirectory({ path: '', branch }),
      this.github.listDirectory({ path: 'initiatives', branch }),
    ]);
    const listing = new Map<string, string>();
    for (const entry of root) if (entry.type === 'file' && MASTER_FILES.includes(entry.path)) listing.set(entry.path, entry.sha);
    for (const entry of initiatives) if (entry.name.endsWith('.json')) listing.set(entry.path, entry.sha);
    return listing;
  }

  /** The writer of each master file that has one, by path. */
  private masterWriters() {
    return [
      [FILE_PATHS.datasetFlags, this.flagsWriter],
      [FILE_PATHS.roles, this.rolesWriter],
      [FILE_PATHS.countries, this.countriesWriter],
      [FILE_PATHS.teams, this.teamsWriter],
      [FILE_PATHS.people, this.peopleWriter],
      [FILE_PATHS.memberships, this.membershipsWriter],
    ] as const;
  }

  /** Every file's writer, by path, master and initiative alike — for the read-only banner and Retry (§9.9), which
   * treat every file the same regardless of what document type it holds. */
  private allWriters(): [string, FileWriter<unknown>][] {
    const master = this.masterWriters().filter((entry) => entry[1] !== null) as unknown as [string, FileWriter<unknown>][];
    const initiatives = [...this.initiativeWriters].map(
      ([id, writer]): [string, FileWriter<unknown>] => [FILE_PATHS.initiative(id), writer as FileWriter<unknown>],
    );
    return [...master, ...initiatives];
  }

  /** The version of each file as it is on screen. */
  private knownShas(): Map<string, string> {
    const known = new Map<string, string>();
    for (const [path, writer] of this.allWriters()) if (writer.sha != null) known.set(path, writer.sha);
    return known;
  }

  /** {@link finishPull}, but a file that cannot be applied is the read-only state, as for a failed read, rather than an exception. */
  private applyPulled(pulled: Pulled): boolean {
    try {
      return this.finishPull(pulled);
    } catch (error) {
      this.pullFailure = toReadOnlyState(error, 'Something went wrong loading the dataset.');
      return false;
    }
  }

  /** Puts a pull on screen and in the cache. True when every file it read was applied, so the pull is complete. */
  private finishPull(pulled: Pulled): boolean {
    const flagsFile = pulled.files.get(FILE_PATHS.datasetFlags);
    const refusal = flagsFile ? this.refusal(flagsFile.value as DatasetFlags) : null;
    if (refusal) {
      this.pullFailure = { cause: 'unknown', message: refusal };
      return false;
    }
    const complete = this.state.status === 'ready' ? this.mergeIn(pulled) : (this.build(pulled), true);
    this.remember(pulled, complete);
    return complete;
  }

  /** A pull's changes into the dataset on screen; each file goes through its writer, which merges it with any edit not yet saved. */
  private mergeIn({ files, listing, compared }: Pulled): boolean {
    let complete = true;
    const changed: string[] = [];
    const applied = (path: string, received: Received) => {
      if ('left' in received) complete &&= received.left === 'writer';
      else changed.push(...received.changed.map((p) => changeKey(path, p)));
    };
    for (const [path, writer] of this.masterWriters()) {
      const file = files.get(path);
      // Each writer takes its own file's type; the paths pair them up, which the union of writers cannot say.
      if (file && writer) applied(path, writer.receive({ content: file.value as never, sha: file.sha }, compared.get(path) ?? null));
    }

    const added: Initiative[] = [];
    for (const [path, file] of files) {
      if (!path.startsWith('initiatives/')) continue;
      const initiative = file.value as Initiative;
      const writer = this.initiativeWriters.get(initiative.id);
      if (writer) {
        applied(path, writer.receive({ content: initiative, sha: file.sha }, compared.get(path) ?? null));
      } else {
        this.createInitiativeWriter(initiative, file.sha);
        added.push(initiative);
        changed.push(changeKey(path, []));
      }
    }

    // Removed by others: only a file this client saw unchanged and that has nothing waiting. A new initiative
    // whose first save is still on its way is not in the listing yet, and stays.
    const removed = new Set<string>();
    for (const [id, writer] of this.initiativeWriters) {
      const path = FILE_PATHS.initiative(id);
      if (!listing.has(path) && compared.has(path) && writer.sha === compared.get(path) && writer.idle) removed.add(id);
    }
    if (removed.size > 0) this.forgetInitiatives(removed);
    if (added.length > 0) this.setState({ initiatives: [...this.state.initiatives, ...added] });

    if (changed.length > 0 && !this.ownCommitPull) this.markChanged(changed);
    return complete;
  }

  /** Keeps a pull in the cache for the next open (§10.4), and what it saw, unless a file was left alone. Failures are survivable. */
  private remember({ files, head }: Pulled, complete: boolean): void {
    const meta = complete && head ? { head: head.sha, etag: head.etag } : null;
    const kept = [...files].map(([path, file]): [string, { content: string; sha: string }] => [path, { content: file.raw, sha: file.sha }]);
    this.cache.commitPull(kept, meta).then(
      (recorded) => {
        this.meta = recorded ? meta : null;
      },
      () => {
        // The cache is a local convenience: losing it only means the next open pulls everything.
      },
    );
  }

  /** Values changed by others are tinted, and the indicator says so, for a few seconds (§9.9). */
  private markChanged(keys: string[]): void {
    this.setState({ changed: new Set([...this.state.changed, ...keys]), updatedByOthers: true });
    if (this.tintTimer) clearTimeout(this.tintTimer);
    this.tintTimer = setTimeout(() => {
      this.tintTimer = null;
      this.setState({ changed: new Set(), updatedByOthers: false });
    }, CHANGE_TINT_MS);
  }

  /**
   * A field with unsaved typing calls this and releases when it is left (§3): a pull that arrives in between is
   * held, and applied after the field's edit has been handed to its writer, so it merges like a save that found
   * the file changed, and a clash is a conflict for the user to choose.
   */
  holdWhileEditing(): () => void {
    this.editing += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.editing -= 1;
      if (this.editing > 0 || !this.held) return;
      const held = this.held;
      this.held = null;
      const complete = this.applyPulled(held);
      this.settlePull(complete);
    };
  }

  /** Shows how the pull ended, and arms the shared retry loop unless everything it found was applied. */
  private settlePull(complete: boolean): void {
    const recoverable = this.publishStatus();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.armRetry(!complete, recoverable);
    if (complete && this.pullFailure === null) this.rollForward();
  }

  /**
   * The §7.2 rollover, from now until the returned function is called: after every complete pull, a tracked year
   * that a country or a custom role has no entry for gets one (a system write, §3). Idempotent — nothing missing
   * is no write — and two clients doing it at once write the same values, which merge without a conflict.
   */
  keepTrackedYears(today: () => Date = () => new Date()): () => void {
    this.rolloverToday = today;
    if (this.state.status === 'ready') this.rollForward();
    return () => {
      this.rolloverToday = null;
    };
  }

  private rollForward(): void {
    if (!this.rolloverToday || this.state.status !== 'ready') return;
    const tracked = trackedYears(this.rolloverToday());
    // A system write over the whole file (§3), not an edit of one country or person: it notes the dataset.
    const note = () => this.note('dataset', 'rates', 'rollover', undefined, tracked, () => `Rates copied into ${tracked[tracked.length - 1]}`);
    const countries = countriesRolledForward(this.state.countries, tracked);
    if (countries) this.commitCountries(countries, note());
    const people = peopleRolledForward(this.state.people, tracked);
    if (people) this.commitPeople(people, note());
  }

  /**
   * One shared timer for the pull's own retry and the automatic recovery of a failed write (§3, §9.9): the
   * same 30s cadence and tab-visibility gate, so a failed write never fires its own separate loop. Arms only
   * when there is something to retry: the pull itself, or a writer whose cause auto-retries. `hasRecoverableFailure`
   * comes from the same {@link publishStatus} pass that just built `fileFailures`, so arming never re-walks
   * every writer a second time for the same status event.
   */
  private armRetry(pullIncomplete: boolean, hasRecoverableFailure: boolean): void {
    if (this.retryTimer) return;
    if (!pullIncomplete && this.pullFailure === null && this.deleteFailure === null && !hasRecoverableFailure) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (document.visibilityState !== 'visible') return;
      for (const [, writer] of this.allWriters()) if (this.autoRetries(writer)) void writer.retry();
      void this.pull();
    }, PULL_RETRY_MS);
  }

  /** Whether `writer`'s failure, if any, is one of the two causes §3 marks "Automatic" (§9.9). */
  private autoRetries(writer: FileWriter<unknown>): boolean {
    const failure = writer.failure;
    return failure !== null && AUTOMATIC_RETRY_CAUSES.includes(failure.cause);
  }

  /** Resends one file's failed edit now, rather than waiting for the shared retry loop (§9.9: a field's own Retry). */
  retryFile(file: string): void {
    void this.allWriters().find(([path]) => path === file)?.[1].retry();
  }

  private rateLimit: RateLimit | null = null;
  private readonly rateLimitListeners = new Set<Listener>();

  /** The budget the latest response reported (§5.9), or null before any response carried it. */
  getRateLimit = (): RateLimit | null => this.rateLimit;

  subscribeRateLimit = (listener: Listener): (() => void) => {
    this.rateLimitListeners.add(listener);
    return () => this.rateLimitListeners.delete(listener);
  };

  private noteRateLimit(headers: Headers): void {
    const remaining = Number(headers.get('x-ratelimit-remaining'));
    const limit = Number(headers.get('x-ratelimit-limit'));
    const reset = Number(headers.get('x-ratelimit-reset'));
    // Number(null) is 0, so every header must be present, not just parse.
    const complete = ['x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-reset'].every((name) => headers.has(name));
    if (!complete || !Number.isFinite(remaining) || !Number.isFinite(limit) || !Number.isFinite(reset)) return;
    if (this.rateLimit?.remaining === remaining && this.rateLimit.limit === limit && this.rateLimit.resetsAt === reset * 1000) return;
    this.rateLimit = { remaining, limit, resetsAt: reset * 1000 };
    for (const listener of this.rateLimitListeners) listener();
  }

  /**
   * How many edits would be lost by dropping this session (§5.9 Disconnect): fields whose save failed, plus a file
   * still waiting to be saved that has no failed field of its own.
   */
  unsavedChangeCount(): number {
    let count = 0;
    for (const [, writer] of this.allWriters()) {
      const failed = writer.failedPaths.length;
      count += failed > 0 ? failed : writer.hasPending ? 1 : 0;
    }
    return count;
  }

  /** The GitHub login of the token in use, for a session that never recorded it (§5.9 Connection): one request. */
  async fetchLogin(): Promise<string | null> {
    try {
      return (await this.github.checkToken()).login;
    } catch {
      return null;
    }
  }

  /** The §5.10 token check for the token in use: the read-only banner's diagnosis of an access-denied failure (§3). */
  checkAccess(): Promise<TokenCheckResult> {
    return checkToken(this.brand.github, this.token);
  }

  /**
   * Swaps the token in place (§3 Sync failures): the repository, its pending and failed edits and their typed
   * values stay, and everything failed is resent under the new token.
   */
  setToken(token: string): void {
    this.token = token;
    this.retryAll();
  }

  /**
   * The read-only banner's Retry (§9.9): uniform across every cause, unlike the automatic loop — a pull now,
   * and every currently-failed file resent, instead of waiting for the next tick.
   */
  retryAll(): void {
    void this.pull();
    for (const [, writer] of this.allWriters()) if (writer.failure) void writer.retry();
  }

  /** Pulls on the schedule of §3, from now until the returned function is called: on focus, and every 5 minutes while visible. */
  startPulling(): () => void {
    const visible = () => document.visibilityState === 'visible';
    const onFocus = () => {
      if (visible() && Date.now() - this.lastPullAt >= FOCUS_PULL_MIN_GAP_MS) void this.pull();
    };
    const interval = setInterval(() => {
      if (visible()) void this.pull();
    }, PULL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      for (const timer of [this.retryTimer, this.tintTimer]) if (timer) clearTimeout(timer);
      this.retryTimer = this.tintTimer = null;
    };
  }

  /** Each file's latest status, by path. */
  private readonly writerStatus = new Map<string, WriteStatus>();

  /**
   * What one file's writer reports. The top bar shows syncing while any writer is, and read-only while
   * any writer has failed, so a file that saved cannot hide another file's failure or pending write.
   */
  private statusOf(file: string): (status: WriteStatus) => void {
    return (status) => {
      this.writerStatus.set(file, status);
      // A write can fail independently of any pull, so the shared retry loop must arm here too.
      this.armRetry(false, this.publishStatus());
    };
  }

  /** Publishes the aggregate state from every writer's current status, and reports whether any of their
   * failures is a cause {@link armRetry} should auto-retry — computed in this same pass, so arming never
   * has to walk every writer again for the same status event. */
  private publishStatus(): boolean {
    const all = [...this.writerStatus.values()];
    const fileFailures = new Map<string, ReadOnlyState>();
    const failedFields = new Set<string>();
    let recoverable = false;
    for (const [path, writer] of this.allWriters()) {
      const failure = writer.failure;
      if (!failure) continue;
      fileFailures.set(path, failure);
      for (const p of writer.failedPaths) failedFields.add(changeKey(path, p));
      if (AUTOMATIC_RETRY_CAUSES.includes(failure.cause)) recoverable = true;
    }
    // Read from fileFailures, not from `writerStatus`'s own strings: a writer reports 'syncing' the moment
    // a retry starts, before its own `failed` flag clears, and the banner must not blink off while the
    // field it belongs to still shows "Not saved" (§3, §9.9) — both come from the same writer state here.
    this.setState({
      syncing: this.opening || all.some((s) => s === 'syncing'),
      readOnly: fileFailures.values().next().value ?? this.pullFailure ?? this.deleteFailure,
      fileFailures,
      failedFields,
    });
    return recoverable;
  }

  /** Any conflict a file's writer finds, to resolve in the banner. */
  private readonly onConflict = (conflict: FileConflict): void =>
    this.setState({ conflicts: [...this.state.conflicts, conflict] });

  /** A conflict that closed without a choice: a pull settled it, or a new edit to its field replaced it (§3). */
  private readonly onConflictClosed = (conflict: FileConflict): void =>
    this.setState({ conflicts: this.state.conflicts.filter((c) => c !== conflict) });

  /** The writer of one master file (§10.2): a list of records, or `dataset.json`'s one record, which merges by field. */
  private createWriter<D>(
    path: string,
    branch: string,
    key: 'datasetFlags' | 'roles' | 'countries' | 'teams' | 'people' | 'memberships',
    initial: { content: D; sha: string },
    whenMissing: D | null,
  ): FileWriter<D> {
    return new FileWriter<D>({
      path,
      branch,
      github: this.github,
      queue: this.queue,
      cache: this.cache,
      gate: () => this.firstPullDone,
      merge: mergeDocument,
      whenMissing,
      initial,
      onStatus: this.statusOf(path),
      onConflict: this.onConflict,
      onConflictClosed: this.onConflictClosed,
      onDocument: (content) => this.setState({ [key]: content } as Partial<RepositoryState>),
    });
  }

  /** The writer of one initiative's file; `sha` is null until the file exists (its first save creates it). */
  private createInitiativeWriter(initiative: Initiative, sha: string | null): FileWriter<Initiative> {
    const path = FILE_PATHS.initiative(initiative.id);
    const writer = new FileWriter<Initiative>({
      path,
      branch: this.brand.github.dataBranch,
      github: this.github,
      queue: this.queue,
      cache: this.cache,
      gate: () => this.firstPullDone,
      merge: (base, mine, theirs) => mergeDocument(base, mine, theirs, { frozen: frozenPaths }),
      whenMissing: null,
      whenGone: {
        message: deletedMessage,
        tell: () => {
          const name = this.state.initiatives.find((i) => i.id === initiative.id)?.name ?? initiative.name;
          this.forgetInitiatives(new Set([initiative.id]), { deletedWithLostEdit: new Map(this.state.deletedWithLostEdit).set(initiative.id, name) });
        },
      },
      initial: sha === null ? null : { content: initiative, sha },
      creationFailure: 'Could not create the initiative.',
      onStatus: this.statusOf(path),
      onConflict: this.onConflict,
      onConflictClosed: this.onConflictClosed,
      onDocument: (doc) => this.replaceInitiative(doc),
    });
    this.initiativeWriters.set(initiative.id, writer);
    return writer;
  }

  private replaceInitiative(next: Initiative): void {
    this.setState({ initiatives: this.state.initiatives.map((i) => (i.id === next.id ? next : i)) });
  }

  /** First-write-capable-client baseline bootstrap (§2, §3 "System writes"): one commit, idempotent. */
  private async bootstrapBaseline(branch: string): Promise<void> {
    const baseline = buildBaselineDataset(this.brand);
    await this.queue.run(() =>
      this.github.createFilesCommit({
        branch,
        message: 'Initialize dataset from fresh-install baseline',
        files: baselineFiles(baseline),
      }),
    );
  }

  /** New role (§5.9): created from a name, abbreviation and cost factor, active. */
  createRole(input: { name: string; abbreviation: string; costFactor: number }): Role {
    const role: Role = { id: newId(), ...input, active: true };
    this.commitRoles([...this.state.roles, role], this.note('role', role.id, 'record', undefined, role, (f, t) => this.describeRole(f, t)));
    return role;
  }

  /** In-place edit from the Roles table (§5.9): name, abbreviation, cost factor, or deactivate/reactivate; roles are never deleted (§9.3). */
  updateRole(id: string, patch: Partial<Omit<Role, 'id'>>): void {
    const current = this.state.roles.find((r) => r.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if ((Object.keys(patch) as (keyof typeof patch)[]).every((key) => next[key] === current[key])) return;
    this.commitRoles(
      this.state.roles.map((r) => (r.id === id ? next : r)),
      this.note('role', id, 'record', current, next, (f, t) => this.describeRole(f, t)),
    );
  }

  /** The net change of a role, in plain words (§10.3); the subject is the name it was saved under. */
  private describeRole(from: Role | undefined, to: Role | undefined): string {
    if (!from) return `Roles: ${to?.name} added`;
    if (!to) return `Roles: ${from.name} removed`;
    const parts: string[] = [];
    if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
    if (to.abbreviation !== from.abbreviation) parts.push(`abbreviation set to ${to.abbreviation}`);
    if (to.costFactor !== from.costFactor) parts.push(`cost factor set to ${to.costFactor}`);
    if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
    return `Roles: ${from.name} ${parts.join(', ') || 'updated'}`;
  }

  /** New country (§5.9): its one day rate copied to every tracked year, working days prefilled with weekdays. */
  createCountry(input: { name: string; dayRate: number }, today: Date = new Date()): Country {
    const country: Country = { id: newId(), name: input.name, active: true, ratesByYear: newCountryRates(input.dayRate, trackedYears(today)) };
    this.commitCountries([...this.state.countries, country], this.note('country', country.id, 'record', undefined, country, (f, t) => this.describeCountry(f, t)));
    return country;
  }

  /** Rename, deactivate or reactivate a country; countries are never deleted (§9.3). */
  updateCountry(id: string, patch: Partial<Pick<Country, 'name' | 'active'>>): void {
    const current = this.state.countries.find((c) => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (next.name === current.name && next.active === current.active) return;
    this.commitCountries(
      this.state.countries.map((c) => (c.id === id ? next : c)),
      this.note('country', id, 'record', current, next, (f, t) => this.describeCountry(f, t)),
    );
  }

  private describeCountry(from: Country | undefined, to: Country | undefined): string {
    if (!from) return `Countries: ${to?.name} added`;
    if (!to) return `Countries: ${from.name} removed`;
    const parts: string[] = [];
    if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
    if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
    return `Countries: ${from.name} ${parts.join(', ') || 'updated'}`;
  }

  /** A country's day rate for one year (§5.9, §7.2). Any rate edit also marks the rates reviewed (§5.2). */
  setCountryDayRate(id: string, year: number, dayRate: number): void {
    this.editYear(id, year, `dayRate:${year}`, (r) => r.dayRate, (r) => ({ ...r, dayRate }), (name, to) => `${name}: ${year} day rate set to ${this.money(to as number)}`);
  }

  /** One month's working days for one year of a country (`month` 0-based). */
  setCountryWorkingDays(id: string, year: number, month: number, days: number): void {
    const key = monthKey(year, month);
    this.editYear(
      id,
      year,
      `workingDays:${key}`,
      (r) => r.workingDaysByMonth[month],
      (r) => ({ ...r, workingDaysByMonth: r.workingDaysByMonth.map((d, i) => (i === month ? days : d)) }),
      (name, to) => `${name}: working days in ${formatMonth(key)} set to ${to}`,
    );
  }

  /** Reset to weekdays: all twelve months of one year back to their weekday counts. */
  resetCountryWorkingDays(id: string, year: number): void {
    this.editYear(
      id,
      year,
      `workingDays:${year}`,
      (r) => r.workingDaysByMonth,
      (r) => ({ ...r, workingDaysByMonth: weekdaysByMonth(year) }),
      (name) => `${name}: working days in ${year} reset to weekdays`,
    );
  }

  /**
   * One year entry of one country: `set` makes the edit, `get` reads the value the commit note names (§10.3),
   * and `words` phrases it with the country's name. No write when that value is unchanged.
   */
  private editYear(
    id: string,
    year: number,
    field: string,
    get: (record: CountryYearRateRecord) => unknown,
    set: (record: CountryYearRateRecord) => CountryYearRateRecord,
    words: (name: string, to: unknown) => string,
  ): void {
    const country = this.state.countries.find((c) => c.id === id);
    const record = country?.ratesByYear.find((r) => r.year === year);
    if (!country || !record) return;
    const next = set(record);
    if (sameValue(get(next), get(record))) return;
    const updated = { ...country, ratesByYear: country.ratesByYear.map((r) => (r.year === year ? next : r)) };
    this.commitCountries(
      this.state.countries.map((c) => (c.id === id ? updated : c)),
      this.note('country', id, field, get(record), get(next), (_, to) => words(country.name, to)),
    );
    this.markRatesReviewed('Rates marked as reviewed');
  }

  /** Rates are correct (§5.9): confirms the rates without editing them, which clears Review rates (§5.2). */
  confirmRates(): void {
    this.markRatesReviewed('Rates confirmed as correct');
  }

  private markRatesReviewed(words: string): void {
    const flags = this.state.datasetFlags;
    if (!flags || flags.ratesReviewed || !this.flagsWriter) return;
    const next = { ...flags, ratesReviewed: true };
    this.setState({ datasetFlags: next });
    this.flagsWriter.schedule(next, this.note('dataset', 'flags', 'ratesReviewed', false, true, () => words));
  }

  private commitCountries(next: Country[], note?: CommitNote): void {
    this.setState({ countries: next });
    this.countriesWriter?.schedule(next, note);
  }

  /** A note for one field of one entity: what it was before the edit and what it is now (§10.3); `undefined` is "did not exist". */
  private note<T>(kind: EntityKind, id: string, field: string, from: T | undefined, to: T | undefined, words: (from: T | undefined, to: T | undefined) => string): CommitNote {
    return { entity: { kind, id }, field, from, to, words: words as CommitNote['words'] };
  }

  /** New team (§5.7): created from a name only. */
  createTeam(name: string): Team {
    const team: Team = { id: newId(), name, active: true };
    this.commitTeams([...this.state.teams, team], this.note('team', team.id, 'record', undefined, team, (f, t) => this.describeTeam(f, t)));
    return team;
  }

  /** New person (§5.5): Capacity % defaults to 100, active. */
  createPerson(input: NewPersonInput): Person {
    const person: Person = {
      id: newId(),
      name: input.name,
      countryId: input.countryId,
      roleId: input.roleId,
      capacityPct: 100,
      active: true,
    };
    this.commitPeople([...this.state.people, person], this.note('person', person.id, 'record', undefined, person, (f, t) => this.describePerson(f, t)));
    return person;
  }

  /** Deactivate or reactivate a team (§5.8, §9.3): teams are never deleted, so the record stays. */
  updateTeam(id: string, patch: Pick<Team, 'active'>): void {
    const current = this.state.teams.find((t) => t.id === id);
    if (!current || current.active === patch.active) return;
    this.commitTeams(
      this.state.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      this.note('team', id, 'record', current, { ...current, ...patch }, (f, t) => this.describeTeam(f, t)),
    );
  }

  private describeTeam(from: Team | undefined, to: Team | undefined): string {
    if (!from) return `${to?.name}: team created`;
    return `${from.name}: team ${to?.active ? 'reactivated' : 'deactivated'}`;
  }

  /** In-place edit from the person panel (§5.6): no save button, so every change commits. */
  updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void {
    const current = this.state.people.find((p) => p.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.commitPeople(
      this.state.people.map((p) => (p.id === id ? next : p)),
      this.note('person', id, 'record', current, next, (f, t) => this.describePerson(f, t)),
    );
  }

  /** The net change of a person, in plain words (§10.3): one subject, the name it was saved under, then each change. */
  private describePerson(from: Person | undefined, to: Person | undefined): string {
    if (!from) return `${to?.name}: person added`;
    if (!to) return `${from.name}: person removed`;
    const parts: string[] = [];
    if (to.name !== from.name) parts.push(`renamed to ${to.name}`);
    if (to.countryId !== from.countryId) {
      parts.push(`country set to ${this.state.countries.find((c) => c.id === to.countryId)?.name ?? 'unknown'}`);
    }
    if (to.roleId !== from.roleId) {
      parts.push(`role set to ${this.state.roles.find((r) => r.id === to.roleId)?.name ?? 'unknown'}`);
    }
    parts.push(...this.describeCustomRoleChange(from, to));
    if (to.capacityPct !== from.capacityPct) parts.push(`capacity set to ${to.capacityPct}%`);
    if (to.active !== from.active) parts.push(to.active ? 'reactivated' : 'deactivated');
    return `${from.name}: ${parts.join(', ') || 'updated'}`;
  }

  private describeCustomRoleChange(current: Person, next: Person): string[] {
    const before = current.customRole;
    const after = next.customRole;
    if (!after) return [];
    const parts: string[] = [];
    if (after.active && !before?.active) parts.push(`custom role set to ${after.label.trim() || 'Custom role'}`);
    if (!after.active && before?.active) {
      parts.push(`back to standard role ${this.state.roles.find((r) => r.id === next.roleId)?.name ?? 'unknown'}`);
    }
    if (before && after.label !== before.label) parts.push(`custom role renamed to ${after.label.trim() || 'Custom role'}`);
    if (before && after.costFactor !== before.costFactor) parts.push(`custom role cost factor set to ${after.costFactor}`);
    const years = new Set([...(before?.dayRatesByYear ?? []), ...after.dayRatesByYear].map((r) => r.year));
    for (const year of [...years].sort()) {
      const was = before?.dayRatesByYear.find((r) => r.year === year)?.dayRate;
      const now = after.dayRatesByYear.find((r) => r.year === year)?.dayRate;
      if (was === now) continue;
      parts.push(now === undefined ? `${year} custom day rate cleared` : `${year} custom day rate set to ${now}`);
    }
    return parts;
  }

  /**
   * Add a person to a team (§5.6, §5.8). Team FTE % defaults to the person's
   * unclaimed capacity; a requested value is capped at it unless `allowOver`
   * (the team detail, where the over-capacity warning is visible).
   */
  addMembership(personId: string, teamId: string, requestedPct?: number, allowOver = false): Membership | null {
    const person = this.state.people.find((p) => p.id === personId);
    if (!person) return null;
    const existing = this.state.memberships.find((m) => m.personId === personId && m.teamId === teamId);
    if (existing) return existing;
    const unclaimed = unclaimedCapacityPct(person, this.state.memberships);
    const teamFtePct = requestedPct === undefined ? unclaimed : allowOver ? requestedPct : Math.min(requestedPct, unclaimed);
    const membership: Membership = { id: newId(), personId, teamId, teamFtePct, active: true };
    this.commitMemberships([...this.state.memberships, membership], this.membershipNote(membership.id, undefined, membership));
    return membership;
  }

  /** Edit a membership's Team FTE %; `allowOver` is set only by the team detail (§5.6). */
  updateMembership(id: string, patch: Partial<Pick<Membership, 'teamFtePct' | 'active'>>, allowOver = false): void {
    const current = this.state.memberships.find((m) => m.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (patch.teamFtePct !== undefined && !allowOver) {
      const person = this.state.people.find((p) => p.id === current.personId);
      if (person) {
        const cap = unclaimedCapacityPct(person, this.state.memberships, id);
        next.teamFtePct = Math.min(patch.teamFtePct, cap);
      }
    }
    this.commitMemberships(
      this.state.memberships.map((m) => (m.id === id ? next : m)),
      this.membershipNote(id, current, next),
    );
  }

  /** A membership's note; the person and team are named as they are now, since a removal leaves no record to ask. */
  private membershipNote(id: string, from: Membership | undefined, to: Membership | undefined): CommitNote {
    const of = (m: Membership | undefined) => (m ? { who: this.personName(m.personId), where: this.teamName(m.teamId) } : undefined);
    const names = of(from ?? to) as { who: string; where: string };
    return this.note('membership', id, 'record', from, to, (f, t) => {
      if (!f) return `${names.who}: added to ${names.where} at ${t?.teamFtePct}%`;
      if (!t) return `${names.who}: removed from ${names.where}`;
      const parts: string[] = [];
      if (t.teamFtePct !== f.teamFtePct) parts.push(`Team FTE % on ${names.where} set to ${t.teamFtePct}%`);
      if (t.active !== f.active) parts.push(`${t.active ? 'reactivated' : 'deactivated'} on ${names.where}`);
      return `${names.who}: ${parts.join(', ') || 'updated'}`;
    });
  }

  private personName(id: string): string {
    return this.state.people.find((p) => p.id === id)?.name ?? 'Unknown person';
  }

  private teamName(id: string): string {
    return this.state.teams.find((t) => t.id === id)?.name ?? 'unknown team';
  }

  /** Memberships are removable (§9.3); nothing points at them. */
  removeMembership(id: string): void {
    const removed = this.state.memberships.find((m) => m.id === id);
    this.commitMemberships(
      this.state.memberships.filter((m) => m.id !== id),
      removed && this.membershipNote(id, removed, undefined),
    );
  }

  private commitRoles(next: Role[], note?: CommitNote): void {
    this.setState({ roles: next });
    this.rolesWriter?.schedule(next, note);
  }

  private commitTeams(next: Team[], note?: CommitNote): void {
    this.setState({ teams: next });
    this.teamsWriter?.schedule(next, note);
  }

  private commitPeople(next: Person[], note?: CommitNote): void {
    this.setState({ people: next });
    this.peopleWriter?.schedule(next, note);
  }

  private commitMemberships(next: Membership[], note?: CommitNote): void {
    this.setState({ memberships: next });
    this.membershipsWriter?.schedule(next, note);
  }

  /**
   * Create an initiative with its default plan (§5.11), chained from `today` (injectable for tests). Its
   * file is its writer's first save, so edits never go to a missing writer. `id` is the draft's, kept
   * across retries so a failed creation is the same file when it is tried again.
   */
  async createInitiative(name: string, teamId: string, today: string = localToday(), id: string = newId()): Promise<Initiative> {
    const phases = buildDefaultPlan(this.brand.process, today);
    const hasPlan = Object.keys(phases).length > 0;
    const initiative: Initiative = { id, name, teamId, status: 'Active', ...(hasPlan && { phases, defaultPlan: true }) };
    this.setState({ initiatives: [...this.state.initiatives, initiative] });

    const writer = this.createInitiativeWriter(initiative, null);
    writer.schedule(initiative, this.note('initiative', id, 'record', undefined, initiative, () => `${name}: created`));
    if ((await writer.flush()) !== 'saved') {
      // No file exists, so nothing would ever save edits to it: take it back out rather than leave a page that only looks saved.
      this.initiativeWriters.delete(id);
      this.setState({ initiatives: this.state.initiatives.filter((i) => i.id !== id) });
      throw new Error('Could not create the initiative.');
    }
    return initiative;
  }

  /**
   * A draft was left after its creation failed (§5.1): nothing will retry that file, so the failure no
   * longer counts against sync. A creation that did save keeps its writer and is left alone.
   */
  discardFailedCreation(id: string): void {
    if (this.initiativeWriters.has(id)) return;
    if (this.writerStatus.delete(FILE_PATHS.initiative(id))) this.publishStatus();
  }

  /** Rename an initiative in place (§5.4). An empty name is refused (returns false) and the old one stays. */
  renameInitiative(initiativeId: string, name: string): boolean {
    const initiative = this.editableInitiative(initiativeId);
    const trimmed = name.trim();
    if (!initiative || !trimmed) return false;
    if (trimmed === initiative.name) return true;
    const next: Initiative = { ...initiative, name: trimmed };
    this.replaceInitiative(next);
    this.initiativeWriters.get(initiativeId)?.schedule(
      next,
      this.note('initiative', initiativeId, 'name', initiative.name, trimmed, (f, t) => `${f}: renamed to ${t}`),
    );
    return true;
  }

  /** Set or clear the initiative's description in place (§5.4). Trimmed; empty clears it. */
  setDescription(initiativeId: string, text: string): boolean {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return false;
    const trimmed = text.trim();
    if (trimmed === (initiative.description ?? '')) return true;
    const next: Initiative = { ...initiative, description: trimmed };
    if (!trimmed) delete next.description;
    this.replaceInitiative(next);
    this.initiativeWriters.get(initiativeId)?.schedule(
      next,
      this.note('initiative', initiativeId, 'description', initiative.description, next.description, () => `${initiative.name}: description changed`),
    );
    return true;
  }

  /** Set or clear (`undefined`) the initiative's owner in place (§5.4). */
  setOwner(initiativeId: string, ownerId: string | undefined): void {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative || ownerId === initiative.ownerId) return;
    const next: Initiative = { ...initiative, ownerId };
    if (ownerId === undefined) delete next.ownerId;
    this.replaceInitiative(next);
    const words = (_: unknown, to: string | undefined) => (to ? `${initiative.name}: owner set to ${this.personName(to)}` : `${initiative.name}: owner cleared`);
    this.initiativeWriters.get(initiativeId)?.schedule(next, this.note('initiative', initiativeId, 'ownerId', initiative.ownerId, ownerId, words));
  }

  /**
   * The initiative, unless it is missing or frozen (§8.4): every edit starts here, so a Closed or Cancelled
   * initiative refuses it in the data layer, not only in the page. Notes and actuals bypass it on purpose.
   */
  private editableInitiative(initiativeId: string): Initiative | undefined {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    return initiative && !isInitiativeFrozen(initiative) ? initiative : undefined;
  }

  private phaseLabel(phaseId: string): string {
    return this.brand.process.find((p) => p.id === phaseId)?.label ?? phaseId;
  }

  /** Apply one edit to a phase's plan (§5.4: edited in place) and schedule its commit under `note`. */
  private editPhase<T>(
    initiativeId: string,
    phaseId: string,
    change: (plan: PhasePlan) => PhasePlan,
    note: { field: string; from: T | undefined; to: T | undefined; words: (from: T | undefined, to: T | undefined, initiativeName: string, phase: string) => string },
    /** Only a recorded actual is still accepted on a frozen initiative (§8.4). */
    { allowFrozen = false }: { allowFrozen?: boolean } = {},
  ): boolean {
    const initiative = allowFrozen ? this.state.initiatives.find((i) => i.id === initiativeId) : this.editableInitiative(initiativeId);
    if (!initiative) return false;
    const plan = initiative.phases?.[phaseId] ?? { allocations: [] };
    // The first edit to the plan ends the suggestion: from here on the dates are the user's (§8.2).
    const next: Initiative = { ...initiative, phases: { ...initiative.phases, [phaseId]: change(plan) } };
    delete next.defaultPlan;
    this.replaceInitiative(next);
    const name = initiative.name;
    this.initiativeWriters
      .get(initiativeId)
      ?.schedule(next, this.note('initiative', initiativeId, `${phaseId}:${note.field}`, note.from, note.to, (f, t) => note.words(f, t, name, this.phaseLabel(phaseId))));
    return true;
  }

  /** Set or clear (`undefined`) one end of a phase's period. Any dates are accepted: an inverted period only warns (§7.2). */
  setPhaseDate(initiativeId: string, phaseId: string, which: 'startDate' | 'endDate', value: string | undefined): void {
    const word = which === 'startDate' ? 'start date' : 'end date';
    const before = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.[which];
    this.editPhase<string>(
      initiativeId,
      phaseId,
      (plan) => {
        const next = { ...plan };
        if (value === undefined) delete next[which];
        else next[which] = value;
        return next;
      },
      {
        field: which,
        from: before,
        to: value,
        words: (_, to, name, phase) => `${name}: ${phase} ${word} ${to === undefined ? 'cleared' : `set to ${formatDate(to)}`}`,
      },
    );
  }

  /** Move a phase's end date a month later (§5.11 Extend on overrun), keeping its allocations; later phases do not move. */
  extendPhase(initiativeId: string, phaseId: string): void {
    const endDate = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.endDate;
    if (!endDate) return;
    const next = extendByOneMonth(endDate);
    this.editPhase<string>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, endDate: next }),
      { field: 'endDate', from: endDate, to: next, words: (_, to, name, phase) => `${name}: ${phase} extended to ${formatDate(to as string)}` },
    );
  }

  /**
   * Allocate a person to a phase (§5.4). Only the initiative team's members can be allocated
   * (§7.2), and a refusal says why. Allocation % is `allocationPct` when the caller has worked out what fits (the
   * phase picker passes the person's free capacity, §5.11), else the person's Team FTE % on the team.
   */
  addAllocation(initiativeId: string, phaseId: string, personId: string, allocationPct?: number): AddAllocationResult {
    const initiative = this.editableInitiative(initiativeId);
    const person = this.state.people.find((p) => p.id === personId);
    const team = initiative && this.state.teams.find((t) => t.id === initiative.teamId);
    if (!initiative || !person || !team) return { ok: false, reason: 'That person or initiative could not be found.' };

    const reason = allocationRefusal(person, team, this.state.memberships);
    if (reason) return { ok: false, reason };
    if (initiative.phases?.[phaseId]?.allocations.some((a) => a.personId === personId)) {
      return { ok: false, reason: `${person.name} is already allocated to this phase.` };
    }

    const membership = activeMembership(personId, team.id, this.state.memberships);
    const allocation: Allocation = { id: newId(), personId, allocationPct: allocationPct ?? membership?.teamFtePct ?? 0 };
    this.editPhase<Allocation>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: [...plan.allocations, allocation] }),
      { field: `allocations:${allocation.id}`, from: undefined, to: allocation, words: this.describeItem('allocations') },
    );
    return { ok: true, allocation };
  }

  /**
   * Copy the previous costed phase's allocations into an empty phase in one commit (§5.11): each active team member
   * with the same Allocation %. Nothing is written when the phase has people already, is frozen, or nobody can be copied.
   */
  copyAllocations(initiativeId: string, phaseId: string, fromPhaseId: string): CopyAllocationsResult | null {
    const initiative = this.editableInitiative(initiativeId);
    const team = initiative && this.state.teams.find((t) => t.id === initiative.teamId);
    if (!initiative || !team || isPhaseFrozen(initiative, phaseId)) return null;
    if ((initiative.phases?.[phaseId]?.allocations.length ?? 0) > 0) return null;

    const { copy, skipped } = planCopy(copySource(initiative, fromPhaseId), team, this.state.people, this.state.memberships);
    if (copy.length === 0) return { copied: 0, skipped };
    const allocations: Allocation[] = copy.map((c) => ({ id: newId(), ...c }));
    const fromLabel = this.phaseLabel(fromPhaseId);
    this.editPhase<Allocation[]>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations }),
      {
        field: 'allocations:copied',
        from: undefined,
        to: allocations,
        words: (_, to, name, phase) => `${name}: ${to?.length} ${to?.length === 1 ? 'person' : 'people'} copied to ${phase} from ${fromLabel}`,
      },
    );
    return { copied: allocations.length, skipped };
  }

  updateAllocation(initiativeId: string, phaseId: string, allocationId: string, allocationPct: number): void {
    const allocation = this.state.initiatives
      .find((i) => i.id === initiativeId)
      ?.phases?.[phaseId]?.allocations.find((a) => a.id === allocationId);
    if (!allocation) return;
    this.editPhase<Allocation>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: plan.allocations.map((a) => (a.id === allocationId ? { ...a, allocationPct } : a)) }),
      { field: `allocations:${allocationId}`, from: allocation, to: { ...allocation, allocationPct }, words: this.describeItem('allocations') },
    );
  }

  /**
   * Remove an item from a phase's list; its position comes back so an Undo can put it where it was (§5.11).
   */
  private removeFromList<T extends { id: string }>(list: PhaseList, initiativeId: string, phaseId: string, itemId: string): { item: T; index: number } | null {
    const items = itemsOf<T>(this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId], list);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return null;
    const item = items[index];
    const removed = this.editPhase<T>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, [list]: itemsOf<T>(plan, list).filter((other) => other.id !== itemId) }),
      { field: `${list}:${itemId}`, from: item, to: undefined, words: this.describeItem(list) },
    );
    return removed ? { item, index } : null;
  }

  /** Undo of {@link removeFromList}: the same item, same id, back in its place, as a normal edit. Nothing happens when it is already there again. */
  private restoreToList<T extends { id: string }>(list: PhaseList, initiativeId: string, phaseId: string, item: T, index: number): void {
    const present = itemsOf<T>(this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId], list);
    if (present.some((other) => other.id === item.id)) return;
    this.editPhase<T>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, [list]: insertAt(itemsOf<T>(plan, list), item, index) }),
      { field: `${list}:${item.id}`, from: undefined, to: item, words: this.describeItem(list) },
    );
  }

  /** Remove an allocation; the position comes back so an Undo can put it where it was (§5.11). */
  removeAllocation(initiativeId: string, phaseId: string, allocationId: string): { allocation: Allocation; index: number } | null {
    const removed = this.removeFromList<Allocation>('allocations', initiativeId, phaseId, allocationId);
    return removed && { allocation: removed.item, index: removed.index };
  }

  /** Undo of {@link removeAllocation}: the same allocation, same id, back in its place, as a normal edit. */
  restoreAllocation(initiativeId: string, phaseId: string, allocation: Allocation, index: number): void {
    this.restoreToList('allocations', initiativeId, phaseId, allocation, index);
  }

  /**
   * A phase list item's net change in plain words (§10.3): added, removed, or what changed in it. The person or label
   * is the one the item was saved under, so the message never names a state that was not saved.
   */
  private describeItem(list: PhaseList): (from: unknown, to: unknown, name: string, phase: string) => string {
    return (from, to, name, phase) => {
      if (list === 'allocations') {
        const [before, after] = [from as Allocation | undefined, to as Allocation | undefined];
        const who = this.personName((before ?? after)?.personId as string);
        if (!before) return `${name}: ${who} added to ${phase} at ${after?.allocationPct}%`;
        if (!after) return `${name}: ${who} removed from ${phase}`;
        return `${name}: ${who} set to ${after.allocationPct}% in ${phase}`;
      }
      const [before, after] = [from as CostItem | undefined, to as CostItem | undefined];
      if (!before) return `${name}: ${after?.label} added to ${phase} at ${this.money(after?.amount as number)}`;
      if (!after) return `${name}: ${before.label} removed from ${phase}`;
      const parts: string[] = [];
      if (after.label !== before.label) parts.push(`renamed to ${after.label}`);
      if (after.amount !== before.amount) parts.push(`amount set to ${this.money(after.amount)}`);
      if (after.timing !== before.timing || after.month !== before.month) {
        parts.push(after.timing === 'spread' || !after.month ? 'spread over the phase' : `timed to ${formatMonth(after.month)}`);
      }
      return `${name}: ${phase} cost item ${before.label} ${parts.join(', ') || 'updated'}`;
    };
  }

  /** An amount as a commit message reads it, in the deployment's currency (§9.7). */
  private money(amount: number): string {
    return `${this.brand.currencySymbol}${amount.toLocaleString('en', { maximumFractionDigits: 2 })}`;
  }

  /** Add a cost item to a phase (§5.4); it is one commit, made once the draft row is complete. */
  addCostItem(initiativeId: string, phaseId: string, draft: Omit<CostItem, 'id'>): CostItem | null {
    const item: CostItem = { id: newId(), ...draft };
    const added = this.editPhase<CostItem>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, costItems: [...(plan.costItems ?? []), item] }),
      { field: `costItems:${item.id}`, from: undefined, to: item, words: this.describeItem('costItems') },
    );
    return added ? item : null;
  }

  /** Change a cost item's label, amount or timing; the commit note names the one field changed. */
  updateCostItem(initiativeId: string, phaseId: string, itemId: string, change: CostItemChange): void {
    const item = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.costItems?.find((c) => c.id === itemId);
    if (!item) return;
    this.editPhase<CostItem>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, costItems: (plan.costItems ?? []).map((c) => (c.id === itemId ? { ...c, ...change } : c)) }),
      { field: `costItems:${itemId}`, from: item, to: { ...item, ...change }, words: this.describeItem('costItems') },
    );
  }

  /** Remove a cost item; the position comes back so an Undo can put it where it was (§5.11). */
  removeCostItem(initiativeId: string, phaseId: string, itemId: string): { item: CostItem; index: number } | null {
    return this.removeFromList<CostItem>('costItems', initiativeId, phaseId, itemId);
  }

  /** Undo of {@link removeCostItem}. */
  restoreCostItem(initiativeId: string, phaseId: string, item: CostItem, index: number): void {
    this.restoreToList('costItems', initiativeId, phaseId, item, index);
  }

  /**
   * Record a month's actual for a phase (§7.3): the estimate confirmed as-is, or an override — either way a
   * single act, and recordable again later to correct it (§6).
   */
  setActual(initiativeId: string, phaseId: string, month: string, amount: number): void {
    const before = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.actualMonths?.[month];
    this.editPhase<number>(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, actualMonths: { ...plan.actualMonths, [month]: amount } }),
      {
        field: `actual:${month}`,
        from: before,
        to: amount,
        words: (_, to, name, phase) => `${name}: ${phase} actual for ${formatMonth(month)} recorded (${this.brand.currencySymbol}${Math.round(to as number)})`,
      },
      { allowFrozen: true },
    );
  }

  /** A checklist item's name, for the commit note, as its gate defines it. */
  private checklistItemName(phaseId: string, itemId: string): string {
    return this.brand.process.find((p) => p.id === phaseId)?.exitGate.checklistItems.find((i) => i.id === itemId)?.name ?? 'checklist item';
  }

  /**
   * Set a checklist item's status and note together (§5.4, §8.1): Incomplete and Complete commit as soon as
   * they're clicked; Tentative is saved together with its (required) note in one act.
   */
  setChecklistItem(initiativeId: string, phaseId: string, itemId: string, status: ChecklistStatus, note: string): void {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return;
    const before = initiative.checklist?.[phaseId]?.[itemId];
    this.writeChecklistItem(initiative, phaseId, itemId, { status, note }, '', before, { status, note }, (name, item, _, to) =>
      `${name}: "${item}" set to ${to ? to.status[0].toUpperCase() + to.status.slice(1) : 'Incomplete'}`,
    );
  }

  /**
   * Change a checklist item's note alone, keeping its status (§8.4): the one checklist edit a Closed or Cancelled
   * initiative still accepts. Trimmed; a Tentative item's note is required, so clearing it is refused (false).
   */
  setChecklistNote(initiativeId: string, phaseId: string, itemId: string, note: string): boolean {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative) return false;
    const entry = initiative.checklist?.[phaseId]?.[itemId];
    const status = entry?.status ?? 'incomplete';
    const trimmed = note.trim();
    if (status === 'tentative' && !trimmed) return false;
    if (trimmed === (entry?.note ?? '')) return true;
    this.writeChecklistItem(initiative, phaseId, itemId, { status, note: trimmed }, ':note', entry?.note ?? '', trimmed, (name, item) => `${name}: note on "${item}" changed`);
    return true;
  }

  /** Write one checklist entry and schedule its commit; `fieldSuffix` keeps a note-only change its own field (§10.3). */
  private writeChecklistItem<T>(
    initiative: Initiative,
    phaseId: string,
    itemId: string,
    entry: { status: ChecklistStatus; note: string },
    fieldSuffix: string,
    from: T | undefined,
    to: T,
    words: (initiativeName: string, itemName: string, from: T | undefined, to: T | undefined) => string,
  ): void {
    const next = withChecklistItem(initiative, phaseId, itemId, entry.status, entry.note);
    this.replaceInitiative(next);
    const name = initiative.name;
    this.initiativeWriters
      .get(initiative.id)
      ?.schedule(next, this.note('initiative', initiative.id, `checklist:${phaseId}:${itemId}${fieldSuffix}`, from, to, (f, t) => words(name, this.checklistItemName(phaseId, itemId), f, t)));
  }

  /**
   * Pass the initiative's current gate (§8.1): refused with its blockers when it isn't ready. On success, the
   * exited phase is frozen if costed, the gate record is written, and the initiative moves on (or Closes, on
   * the final gate).
   */
  passGate(initiativeId: string, takenAt: string = localToday()): { ok: true } | { ok: false; blockers: string[] } {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return { ok: false, blockers: ['This initiative could not be found.'] };
    const result = evaluatePassGate(this.brand.process, initiative, this.state.people, this.state, this.brand.approvalTracks, takenAt);
    if (!result.ok) return result;

    const approved = result.record.recordedGrandEstimate !== undefined ? `, approved at ${this.money(result.record.recordedGrandEstimate)}` : '';
    this.commitGateOutcome(initiative.name, result, `passed${approved}`);
    return { ok: true };
  }

  /** Skip the initiative's current gate with a reason (§8.2): skippable gates only, no checks, nothing frozen, one commit. */
  skipGate(initiativeId: string, reason: string): { ok: true } | { ok: false; reason: string } {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return { ok: false, reason: 'This initiative could not be found.' };
    const result = evaluateSkipGate(this.brand.process, initiative, reason);
    if (!result.ok) return result;

    this.commitGateOutcome(initiative.name, result, 'skipped');
    return { ok: true };
  }
  /**
   * Start an untouched initiative at a later phase, or change that choice (§8.2): one reason recorded as a
   * starting-phase skip on every gate behind it, the default plan re-chained from `today`, in one commit
   * "<name>: starts at <phase>".
   */
  startAtPhase(initiativeId: string, phaseId: string, reason: string, today: string = localToday()): { ok: true } | { ok: false; reason: string } {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return { ok: false, reason: 'This initiative could not be found.' };
    const result = evaluateStartAtPhase(this.brand.process, initiative, phaseId, reason, today);
    if (!result.ok) return result;

    this.replaceInitiative(result.initiative);
    // The periods are part of the change: changed back to the same phase on a later day, they still start today.
    const name = initiative.name;
    const from = { phase: this.phaseLabel(currentPhaseId(initiative, this.brand.process)), phases: initiative.phases };
    const to = { phase: result.phase.label, phases: result.initiative.phases };
    this.initiativeWriters.get(initiativeId)?.schedule(result.initiative, this.note('initiative', initiativeId, 'startingPhase', from, to, (_, t) => `${name}: starts at ${t?.phase}`));
    return { ok: true };
  }

  /** Writes a passed or skipped gate record in one commit, "<name>: <gate> <what>" (§10.3). */
  private commitGateOutcome(name: string, result: GateRecorded, what: string): void {
    const { initiative, phase, record } = result;
    this.replaceInitiative(initiative);
    this.initiativeWriters
      .get(initiative.id)
      ?.schedule(initiative, this.note('initiative', initiative.id, `gate:${phase.id}`, 'open', record.outcome, () => `${name}: ${phase.exitGate.label} ${what}`));
  }

  /**
   * Reopen the initiative's most recently passed gate (§8.3): reversible only one transition at a time. A no-op when
   * there is none, including on a Cancelled initiative, whose way back is {@link reopen} (§8.4).
   */
  reopenGate(initiativeId: string): void {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative) return;
    const result = evaluateReopenGate(this.brand.process, initiative);
    if (!result) return;
    this.replaceInitiative(result.initiative);
    const [name, gateLabel] = [initiative.name, result.phase.exitGate.label];
    this.initiativeWriters
      .get(initiativeId)
      ?.schedule(result.initiative, this.note('initiative', initiativeId, `gate:${result.phase.id}`, result.record.outcome, 'open', () => `${name}: ${gateLabel} reopened`));
  }

  /** Put an Active initiative On Hold (§8.4): a plain status change, one click and no reason. A no-op for any other status. */
  putOnHold(initiativeId: string): void {
    this.changeStatus(initiativeId, ['Active'], 'On Hold', (name) => `${name}: put on hold`);
  }

  /** Resume an On Hold initiative (§8.4): back to Active. A no-op for any other status. */
  resume(initiativeId: string): void {
    this.changeStatus(initiativeId, ['On Hold'], 'Active', (name) => `${name}: resumed`);
  }

  /** Cancel an Active or On Hold initiative (§8.4): a plain status change, one click, no reason; it freezes the initiative. */
  cancel(initiativeId: string): void {
    this.changeStatus(initiativeId, ['Active', 'On Hold'], 'Cancelled', (name) => `${name}: cancelled`);
  }

  /** Reopen a Cancelled initiative (§8.4): always back to Active, even if it was On Hold before. A no-op for any other status. */
  reopen(initiativeId: string): void {
    this.changeStatus(initiativeId, ['Cancelled'], 'Active', (name) => `${name}: reopened`);
  }

  private changeStatus(initiativeId: string, from: InitiativeStatus[], to: InitiativeStatus, words: (name: string) => string): void {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative || !from.includes(initiative.status)) return;
    const next: Initiative = { ...initiative, status: to };
    this.replaceInitiative(next);
    this.initiativeWriters
      .get(initiativeId)
      ?.schedule(next, this.note('initiative', initiativeId, 'status', initiative.status, to, () => words(initiative.name)));
  }

  /**
   * What moving an initiative to another team would remove (§7.2), for the confirmation; nothing changes. Null when
   * nothing can change: an unknown initiative or team, the team it already has, or a Closed or Cancelled
   * initiative. `isLocked` is the phase-locked predicate (§8.1), replaceable so a test can supply a locked phase.
   */
  previewTeamChange(initiativeId: string, teamId: string, isLocked?: (phaseId: string) => boolean): TeamChangePlan | null {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative || initiative.teamId === teamId || isInitiativeFrozen(initiative)) return null;
    if (!this.state.teams.some((t) => t.id === teamId)) return null;
    return planTeamChange({
      initiative,
      newTeamId: teamId,
      process: this.brand.process,
      people: this.state.people,
      memberships: this.state.memberships,
      rateData: this.state,
      isLocked: isLocked ?? ((phaseId) => isPhaseFrozen(initiative, phaseId)),
    });
  }

  /**
   * Move an initiative to another team (§5.4, §7.2): from every phase that is not locked, the allocations of
   * people who are not active members of the new team go, in the same single commit. Null when
   * {@link previewTeamChange} is.
   */
  changeTeam(initiativeId: string, teamId: string, isLocked?: (phaseId: string) => boolean): TeamChange | null {
    const plan = this.previewTeamChange(initiativeId, teamId, isLocked);
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!plan || !initiative) return null;

    const { removed } = plan;
    const gone = new Set(removed.map((r) => r.allocation.id));
    const next: Initiative = { ...initiative, teamId };
    if (initiative.phases && gone.size > 0) {
      // Only the phases that lose something are rebuilt; the others keep their objects.
      const phases = { ...initiative.phases };
      for (const phaseId of new Set(removed.map((r) => r.phaseId))) {
        phases[phaseId] = { ...phases[phaseId], allocations: phases[phaseId].allocations.filter((a) => !gone.has(a.id)) };
      }
      next.phases = phases;
    }
    this.commitTeam(next, initiative, `${initiative.name}: team changed`);
    return { fromTeamId: initiative.teamId, toTeamId: teamId, removed };
  }

  /**
   * Undo of {@link changeTeam}: the previous team, and each removed allocation back in its place with its
   * own id, as a normal edit. A phase locked since then keeps what it has (§8.1), and an allocation that is
   * already there is not added twice.
   */
  restoreTeam(initiativeId: string, change: TeamChange, isLocked?: (phaseId: string) => boolean): void {
    const initiative = this.editableInitiative(initiativeId);
    if (!initiative) return;
    const locked = isLocked ?? ((phaseId) => isPhaseFrozen(initiative, phaseId));
    const phases = { ...initiative.phases };
    // Ascending by index, so each insert lands where the allocation was once the ones before it are back.
    for (const { phaseId, allocation, index } of [...change.removed].sort((a, b) => a.index - b.index)) {
      const plan = phases[phaseId];
      if (!plan || locked(phaseId) || plan.allocations.some((a) => a.id === allocation.id)) continue;
      phases[phaseId] = { ...plan, allocations: insertAt(plan.allocations, allocation, index) };
    }
    const next: Initiative = { ...initiative, teamId: change.fromTeamId, ...(initiative.phases && { phases }) };
    this.commitTeam(next, initiative, `${initiative.name}: team changed back`);
  }

  /**
   * A team change is a note from the team and allocation count it started with to those it ends with, so out and
   * back again leaves none, and two moves in a window read as one with the allocations lost or regained overall.
   */
  private commitTeam(next: Initiative, before: Initiative, subject: string): void {
    this.replaceInitiative(next);
    const state = (i: Initiative) => ({ teamId: i.teamId, allocations: Object.values(i.phases ?? {}).reduce((n, plan) => n + plan.allocations.length, 0) });
    const words = (from: ReturnType<typeof state> | undefined, to: ReturnType<typeof state> | undefined) => {
      const lost = (from?.allocations ?? 0) - (to?.allocations ?? 0);
      const tail = lost > 0 ? `, ${allocationCount(lost)} removed` : lost < 0 ? `, ${allocationCount(-lost)} restored` : '';
      return `${subject} from ${this.teamName(from?.teamId as string)} to ${this.teamName(to?.teamId as string)}${tail}`;
    };
    this.initiativeWriters.get(next.id)?.schedule(next, this.note('initiative', next.id, 'team', state(before), state(next), words));
  }

  /**
   * Resolve a surfaced conflict (§10.5, "Keep theirs" / "Use mine"). It leaves the banner only once the
   * choice is saved; a failed write leaves it there to choose again. Resolves whether the choice was saved.
   */
  async resolveConflict(conflict: FileConflict, choice: 'mine' | 'theirs'): Promise<boolean> {
    const saved = await conflict.resolve(choice);
    if (saved) this.setState({ conflicts: this.state.conflicts.filter((c) => c !== conflict) });
    return saved;
  }

  /**
   * Delete an initiative no gate has passed (§9.3), in one commit "<name>: deleted" (§10.3). It waits for a save
   * in flight; an edit not saved yet is dropped once the delete lands. Refused when a gate was passed, also when a
   * conflict shows another user passed one meanwhile; any other change meanwhile is deleted with it. Nothing leaves
   * this client until GitHub confirms; a failure shows in the read-only banner until the next pull succeeds.
   * `beforeForget` runs once it is deleted, and is waited for before it leaves the lists: the page can move on
   * without first showing it missing.
   */
  async deleteInitiative(id: string, beforeForget?: () => void | Promise<void>): Promise<DeleteResult> {
    const initiative = this.state.initiatives.find((i) => i.id === id);
    const writer = this.initiativeWriters.get(id);
    if (!initiative || !writer) return 'deleted';
    if (hasPassedGate(initiative)) return 'refused';
    const result = await writer.deleteFile(deletedMessage(initiative), hasPassedGate);
    if (result === 'deleted') {
      this.deleteFailure = null;
      await beforeForget?.();
      this.forgetInitiatives(new Set([id]));
    } else if (result !== 'refused') {
      this.deleteFailure = result.failed;
      this.armRetry(false, this.publishStatus());
    }
    return result;
  }

  /**
   * Take initiatives out of this client (§9.3): their writers with any edit still waiting and any choice open,
   * their sync status, their cached files and their place in every list, in one update with `patch`. Nothing is
   * written to GitHub.
   */
  private forgetInitiatives(ids: ReadonlySet<string>, patch: Partial<RepositoryState> = {}): void {
    const paths = new Set([...ids].map((id) => FILE_PATHS.initiative(id)));
    for (const id of ids) this.initiativeWriters.delete(id);
    for (const path of paths) {
      this.writerStatus.delete(path);
      void this.cache.delete(path).catch(() => {});
    }
    this.setState({
      initiatives: this.state.initiatives.filter((i) => !ids.has(i.id)),
      conflicts: this.state.conflicts.filter((c) => !paths.has(c.file)),
      ...patch,
    });
    this.publishStatus();
  }

  /**
   * Load example data (§2, §5.9): the brand pack's example people, teams and initiatives in one commit "Example data
   * loaded" (§10.3), after every edit waiting to be saved has been. It never overwrites: it stops when the data
   * branch, read at the head the commit builds on, has any person, team, membership or initiative.
   */
  async loadExampleData(today: Date = new Date()): Promise<LoadExampleResult> {
    const branch = this.brand.github.dataBranch;
    await Promise.all(this.allWriters().map(([, writer]) => writer.flush()));
    try {
      const result = await this.queue.run(() =>
        this.github.commitOnHead({
          branch,
          message: 'Example data loaded',
          build: async (at) => {
            const read = async <T>(path: string, fallback: T): Promise<T> => parseJsonFile(await this.github.getFile({ path, branch: at }), fallback);
            const [teams, people, memberships, initiatives, roles, countries] = await Promise.all([
              read<Team[]>(FILE_PATHS.teams, []),
              read<Person[]>(FILE_PATHS.people, []),
              read<Membership[]>(FILE_PATHS.memberships, []),
              this.github.listDirectory({ path: 'initiatives', branch: at }),
              read<Role[]>(FILE_PATHS.roles, []),
              read<Country[]>(FILE_PATHS.countries, []),
            ]);
            if (teams.length + people.length + memberships.length + initiatives.length > 0) return null;
            const data = buildExampleData(this.brand, { roles, countries }, today);
            return {
              files: [
                { path: FILE_PATHS.teams, content: JSON.stringify(data.teams) },
                { path: FILE_PATHS.people, content: JSON.stringify(data.people) },
                { path: FILE_PATHS.memberships, content: JSON.stringify(data.memberships) },
                ...(data.addedRoles ? [{ path: FILE_PATHS.roles, content: JSON.stringify(data.roles) }] : []),
                ...(data.addedCountries ? [{ path: FILE_PATHS.countries, content: JSON.stringify(data.countries) }] : []),
                ...data.initiatives.map((i) => ({ path: FILE_PATHS.initiative(i.id), content: JSON.stringify(i) })),
              ],
              deletes: [],
            };
          },
        }),
      );
      await this.pullOwnCommit();
      return result === 'stopped' ? 'not-empty' : 'loaded';
    } catch (error) {
      return { failed: toReadOnlyState(error, 'Something went wrong loading the example data.') };
    }
  }

  /**
   * Reset (§5.9): the dataset back to the fresh-install baseline (§2) in one commit "Dataset reset" (§10.3) — roles,
   * countries and rates from the brand pack, `ratesReviewed` false, no people, teams, memberships or initiatives.
   * Every edit not saved yet is dropped first (it would bring data back); a save in flight finishes. The initiative
   * files removed are those the data branch lists at the head the commit builds on, so one created meanwhile goes too.
   */
  async resetDataset(): Promise<ResetResult> {
    const branch = this.brand.github.dataBranch;
    await Promise.all(this.allWriters().map(([, writer]) => writer.drop()));
    try {
      await this.queue.run(() =>
        this.github.commitOnHead({
          branch,
          message: 'Dataset reset',
          build: async (at) => {
            const listed = await this.github.listDirectory({ path: 'initiatives', branch: at });
            return {
              files: baselineFiles(buildBaselineDataset(this.brand)),
              deletes: listed.filter((entry) => entry.type === 'file').map((entry) => entry.path),
            };
          },
        }),
      );
    } catch (error) {
      return { failed: toReadOnlyState(error, 'Something went wrong resetting the dataset.') };
    }
    await this.pullOwnCommit();
    return 'reset';
  }

  /** Brings in this client's own many-file commit at once, through the ordinary pull (§3), without the "updated by others" tint. */
  private async pullOwnCommit(): Promise<void> {
    await this.pulling;
    this.ownCommitPull = true;
    try {
      await this.pull();
    } finally {
      this.ownCommitPull = false;
    }
  }

  /** Flush any pending debounced write immediately (page unload). */
  async flushPending(): Promise<void> {
    await Promise.all([
      ...this.masterWriters().map(([, writer]) => writer?.flush()),
      ...[...this.initiativeWriters.values()].map((w) => w.flush()),
    ]);
  }
}
