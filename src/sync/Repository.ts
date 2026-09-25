import type { BrandPack } from '../brand/types';
import { FileCache, type CacheMeta } from '../cache/db';
import { buildBaselineDataset } from '../data/baseline';
import { newId } from '../data/ids';
import {
  FILE_PATHS,
  SCHEMA_VERSION,
  type Allocation,
  type Country,
  type DatasetFlags,
  type Initiative,
  type Membership,
  type PhasePlan,
  type Person,
  type Role,
  type Team,
} from '../data/types';
import { allocationRefusal } from '../data/cost';
import { formatDate } from '../data/dates';
import { localToday } from '../data/dates';
import { buildDefaultPlan } from '../data/defaultPlan';
import { frozenPaths, isPhaseFrozen } from '../data/frozen';
import { toReadOnlyState, type ReadOnlyState } from '../github/errors';
import { GithubClient, parseJsonFile, type BranchHead, type GetFileResult } from '../github/client';
import { unclaimedCapacityPct } from '../data/capacity';
import { activeMembership } from '../data/teamMembers';
import { allocationCount, planTeamChange, type RemovedAllocation, type TeamChangePlan } from '../data/teamChange';
import { FileWriter, type FileConflict, type Received, type WriteStatus } from './FileWriter';
import { mergeDocument, pathKey, type Path } from './merge';
import { WriteQueue } from './WriteQueue';

export type { ReadOnlyState } from '../github/errors';

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
  /** Values another user's change updated a moment ago, as `changeKey`s, to tint (§9.9 Changed by others). */
  changed: ReadonlySet<string>;
  /** Others' changes arrived a moment ago: the sync indicator's tooltip says so (§9.9). */
  updatedByOthers: boolean;
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

/** Everything one pull found: the files it read, and the versions on screen it compared them with. */
interface Pulled {
  head: BranchHead | null;
  files: Map<string, GetFileResult>;
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

export type MasterRecord = Team | Person | Membership;

/** New people (§5.5) take these; country and role default to the last values used. */
export interface NewPersonInput {
  name: string;
  countryId: string;
  roleId: string;
}

/** Why an allocation wasn't added (§7.2), in words the page can show as is. */
export type AddAllocationResult = { ok: true; allocation: Allocation } | { ok: false; reason: string };

/** What a team change did, kept by the page for the 10 seconds it can be undone (§5.11). */
export interface TeamChange {
  fromTeamId: string;
  toTeamId: string;
  removed: RemovedAllocation[];
}

/** `allocation` put at `index` of `allocations`, or at the end when the list has since become shorter. */
function insertAllocation(allocations: Allocation[], allocation: Allocation, index: number): Allocation[] {
  const next = [...allocations];
  next.splice(Math.min(index, next.length), 0, allocation);
  return next;
}

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
    changed: new Set(),
    updatedByOthers: false,
  };

  private readonly listeners = new Set<Listener>();
  private readonly github: GithubClient;
  private readonly queue = new WriteQueue();
  private teamsWriter: FileWriter<Team[]> | null = null;
  private peopleWriter: FileWriter<Person[]> | null = null;
  private membershipsWriter: FileWriter<Membership[]> | null = null;
  private readonly initiativeWriters = new Map<string, FileWriter<Initiative>>();
  private readonly cache: FileCache;
  /** Versions on screen of the files no writer holds (§10.2: the flags, roles and countries). */
  private readonly shas = new Map<string, string>();
  /** What the last complete pull saw; null when a file was left alone or the cache lost one, so the next pull compares everything. */
  private meta: CacheMeta | null = null;
  private pulling: Promise<void> | null = null;
  private remembering: Promise<void> = Promise.resolve();
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
  private tintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly brand: BrandPack,
    token: string,
  ) {
    this.github = new GithubClient(brand.github, () => token);
    const { owner, repo, dataBranch } = brand.github;
    this.cache = new FileCache(`${owner}/${repo}@${dataBranch}`);
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
    await this.remembering;
  }

  /** The cached dataset, or null when there is none to trust: never pulled completely, foreign, or damaged (§3 Damaged data). */
  private async readCache(): Promise<Pulled | null> {
    try {
      const [cached, meta] = await Promise.all([this.cache.all(), this.cache.getMeta()]);
      if (!meta || !cached.has(FILE_PATHS.datasetFlags)) return null;
      const files = new Map<string, GetFileResult>();
      for (const [path, file] of cached) {
        JSON.parse(file.content); // a file that cannot be read makes the whole cache untrustworthy
        files.set(path, { content: file.content, sha: file.sha });
      }
      const flags = JSON.parse(files.get(FILE_PATHS.datasetFlags)!.content) as DatasetFlags;
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
    const parsed = <T>(path: string, fallback: T): T => parseJsonFile(files.get(path) ?? null, fallback);
    for (const path of [FILE_PATHS.datasetFlags, FILE_PATHS.roles, FILE_PATHS.countries]) {
      const file = files.get(path);
      if (file) this.shas.set(path, file.sha);
    }
    const initiatives: Initiative[] = [];
    for (const [path, file] of files) {
      if (!path.startsWith('initiatives/')) continue;
      const initiative = JSON.parse(file.content) as Initiative;
      initiatives.push(initiative);
      this.createInitiativeWriter(initiative, file.sha);
    }
    const teams = parsed(FILE_PATHS.teams, [] as Team[]);
    const people = parsed(FILE_PATHS.people, [] as Person[]);
    const memberships = parsed(FILE_PATHS.memberships, [] as Membership[]);
    const shaOf = (path: string) => files.get(path)?.sha ?? '';

    this.teamsWriter = this.createWriter<Team>(FILE_PATHS.teams, branch, 'teams', { content: teams, sha: shaOf(FILE_PATHS.teams) });
    this.peopleWriter = this.createWriter<Person>(FILE_PATHS.people, branch, 'people', { content: people, sha: shaOf(FILE_PATHS.people) });
    this.membershipsWriter = this.createWriter<Membership>(FILE_PATHS.memberships, branch, 'memberships', {
      content: memberships,
      sha: shaOf(FILE_PATHS.memberships),
    });

    this.setState({
      status: 'ready',
      datasetFlags: parsed(FILE_PATHS.datasetFlags, null as DatasetFlags | null),
      roles: parsed(FILE_PATHS.roles, [] as Role[]),
      countries: parsed(FILE_PATHS.countries, [] as Country[]),
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
      if (pulled) {
        if (this.editing > 0 && this.state.status === 'ready') this.held = pulled;
        else complete = this.applyPulled(pulled);
      }
    } catch (error) {
      this.pullFailure = toReadOnlyState(error, 'Something went wrong loading the dataset.');
    }
    this.publishStatus();
    this.scheduleRetry(complete && this.pullFailure === null);
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
    const files = new Map<string, GetFileResult>();
    const waiting = [...changed];
    const worker = async () => {
      for (let path = waiting.shift(); path !== undefined; path = waiting.shift()) {
        const file = await this.github.getFile({ path, branch });
        if (file) files.set(path, file);
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

  /** The version of each file as it is on screen. */
  private knownShas(): Map<string, string> {
    const known = new Map(this.shas);
    for (const [path, writer] of [
      [FILE_PATHS.teams, this.teamsWriter],
      [FILE_PATHS.people, this.peopleWriter],
      [FILE_PATHS.memberships, this.membershipsWriter],
    ] as const) {
      if (writer?.sha != null) known.set(path, writer.sha);
    }
    for (const [id, writer] of this.initiativeWriters) if (writer.sha !== null) known.set(FILE_PATHS.initiative(id), writer.sha);
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
    const refusal = flagsFile ? this.refusal(JSON.parse(flagsFile.content) as DatasetFlags) : null;
    if (refusal) {
      this.pullFailure = { cause: 'unknown', message: refusal };
      return false;
    }
    const complete = this.state.status === 'ready' ? this.mergeIn(pulled) : (this.build(pulled), true);
    this.remembering = this.remembering.then(() => this.remember(pulled, complete));
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
    const patch: Partial<RepositoryState> = {};

    for (const [path, key] of [
      [FILE_PATHS.datasetFlags, 'datasetFlags'],
      [FILE_PATHS.roles, 'roles'],
      [FILE_PATHS.countries, 'countries'],
    ] as const) {
      const file = files.get(path);
      if (!file) continue;
      (patch as Record<string, unknown>)[key] = JSON.parse(file.content);
      this.shas.set(path, file.sha);
      if (path !== FILE_PATHS.datasetFlags) changed.push(changeKey(path, []));
    }
    if (Object.keys(patch).length > 0) this.setState(patch);

    for (const [path, writer] of [
      [FILE_PATHS.teams, this.teamsWriter],
      [FILE_PATHS.people, this.peopleWriter],
      [FILE_PATHS.memberships, this.membershipsWriter],
    ] as const) {
      const file = files.get(path);
      if (file && writer) applied(path, writer.receive({ content: JSON.parse(file.content), sha: file.sha }, compared.get(path) ?? null));
    }

    const added: Initiative[] = [];
    for (const [path, file] of files) {
      if (!path.startsWith('initiatives/')) continue;
      const initiative = JSON.parse(file.content) as Initiative;
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
    for (const id of removed) {
      this.initiativeWriters.delete(id);
      this.writerStatus.delete(FILE_PATHS.initiative(id));
      void this.cache.delete(FILE_PATHS.initiative(id)).catch(() => {});
    }
    if (added.length > 0 || removed.size > 0) {
      this.setState({ initiatives: [...this.state.initiatives.filter((i) => !removed.has(i.id)), ...added] });
    }

    if (changed.length > 0) this.markChanged(changed);
    return complete;
  }

  /** Keeps a pull in the cache for the next open (§10.4), and what it saw, unless a file was left alone. Failures are survivable. */
  private async remember({ files, head }: Pulled, complete: boolean): Promise<void> {
    try {
      const evictions = this.cache.evictions;
      await Promise.all([...files].map(([path, file]) => this.cache.set(path, file)));
      // Files dropped for the budget meanwhile: the cache no longer holds the whole dataset, so it is not marked as complete.
      if (complete && head && this.cache.evictions === evictions) {
        this.meta = { head: head.sha, etag: head.etag };
        await this.cache.setMeta(this.meta);
      } else {
        this.meta = null;
        await this.cache.clearMeta();
      }
    } catch {
      // The cache is a local convenience: losing it only means the next open pulls everything.
    }
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
      this.publishStatus();
      this.scheduleRetry(complete && this.pullFailure === null);
    };
  }

  private scheduleRetry(settled: boolean): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (settled) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (document.visibilityState === 'visible') void this.pull();
    }, PULL_RETRY_MS);
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
      this.publishStatus();
    };
  }

  private publishStatus(): void {
    const all = [...this.writerStatus.values()];
    const failed = all.find((s): s is { readOnly: ReadOnlyState } => typeof s === 'object');
    this.setState({ syncing: this.opening || all.some((s) => s === 'syncing'), readOnly: failed?.readOnly ?? this.pullFailure });
  }

  /** Any conflict a file's writer finds, to resolve in the banner. */
  private readonly onConflict = (conflict: FileConflict): void =>
    this.setState({ conflicts: [...this.state.conflicts, conflict] });

  private createWriter<T extends MasterRecord>(
    path: string,
    branch: string,
    key: 'teams' | 'people' | 'memberships',
    initial: { content: T[]; sha: string },
  ): FileWriter<T[]> {
    return new FileWriter<T[]>({
      path,
      branch,
      github: this.github,
      queue: this.queue,
      cache: this.cache,
      gate: () => this.firstPullDone,
      merge: mergeDocument,
      whenMissing: [],
      initial,
      onStatus: this.statusOf(path),
      onConflict: this.onConflict,
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
      initial: sha === null ? null : { content: initiative, sha },
      creationFailure: 'Could not create the initiative.',
      onStatus: this.statusOf(path),
      onConflict: this.onConflict,
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
        files: [
          { path: FILE_PATHS.datasetFlags, content: JSON.stringify(baseline.datasetFlags) },
          { path: FILE_PATHS.roles, content: JSON.stringify(baseline.roles) },
          { path: FILE_PATHS.countries, content: JSON.stringify(baseline.countries) },
          { path: FILE_PATHS.teams, content: JSON.stringify(baseline.teams) },
          { path: FILE_PATHS.people, content: JSON.stringify(baseline.people) },
          { path: FILE_PATHS.memberships, content: JSON.stringify(baseline.memberships) },
        ],
      }),
    );
  }

  /** New team (§5.7): created from a name only. */
  createTeam(name: string): Team {
    const team: Team = { id: newId(), name, active: true };
    this.commitTeams([...this.state.teams, team], { key: team.id, text: `${name}: team created` });
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
    this.commitPeople([...this.state.people, person], { key: person.id, text: `${person.name}: person added` });
    return person;
  }

  /** Deactivate or reactivate a team (§5.8, §9.3): teams are never deleted, so the record stays. */
  updateTeam(id: string, patch: Pick<Team, 'active'>): void {
    const current = this.state.teams.find((t) => t.id === id);
    if (!current || current.active === patch.active) return;
    this.commitTeams(
      this.state.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      { key: `${id}:active`, text: `${current.name}: team ${patch.active ? 'reactivated' : 'deactivated'}` },
    );
  }

  /** In-place edit from the person panel (§5.6): no save button, so every change commits. */
  updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void {
    const current = this.state.people.find((p) => p.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    const change = this.describePersonChange(current, next, patch);
    // Custom role edits are keyed by what changed, so two different years edited together both reach the message.
    const key = patch.customRole ? `${id}:customRole:${change}` : `${id}:${Object.keys(patch).sort().join(',')}`;
    this.commitPeople(
      this.state.people.map((p) => (p.id === id ? next : p)),
      { key, text: `${next.name}: ${change}` },
    );
  }

  private describePersonChange(current: Person, next: Person, patch: Partial<Omit<Person, 'id'>>): string {
    const parts: string[] = [];
    if (patch.name !== undefined) parts.push(`renamed from ${current.name}`);
    if (patch.countryId !== undefined) {
      parts.push(`country set to ${this.state.countries.find((c) => c.id === patch.countryId)?.name ?? 'unknown'}`);
    }
    if (patch.roleId !== undefined) {
      parts.push(`role set to ${this.state.roles.find((r) => r.id === patch.roleId)?.name ?? 'unknown'}`);
    }
    if (patch.customRole !== undefined) parts.push(...this.describeCustomRoleChange(current, next));
    if (patch.capacityPct !== undefined) parts.push(`capacity set to ${patch.capacityPct}%`);
    if (patch.active !== undefined) parts.push(patch.active ? 'reactivated' : 'deactivated');
    return parts.join(', ') || 'updated';
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
    this.commitMemberships([...this.state.memberships, membership], {
      key: membership.id,
      text: `${person.name}: added to ${this.teamName(teamId)} at ${teamFtePct}%`,
    });
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
    const who = this.personName(current.personId);
    const where = this.teamName(current.teamId);
    const activeOnly = patch.active !== undefined && patch.teamFtePct === undefined;
    const what = activeOnly
      ? `${patch.active ? 'reactivated' : 'deactivated'} on ${where}`
      : `Team FTE % on ${where} set to ${next.teamFtePct}%`;
    this.commitMemberships(
      this.state.memberships.map((m) => (m.id === id ? next : m)),
      { key: `${id}:${activeOnly ? 'active' : 'pct'}`, text: `${who}: ${what}` },
    );
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
      removed && { key: id, text: `${this.personName(removed.personId)}: removed from ${this.teamName(removed.teamId)}` },
    );
  }

  private commitTeams(next: Team[], note?: { key: string; text: string }): void {
    this.setState({ teams: next });
    this.teamsWriter?.schedule(next, note);
  }

  private commitPeople(next: Person[], note?: { key: string; text: string }): void {
    this.setState({ people: next });
    this.peopleWriter?.schedule(next, note);
  }

  private commitMemberships(next: Membership[], note?: { key: string; text: string }): void {
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
    writer.schedule(initiative, { key: 'created', text: `${name}: created` });
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
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    const trimmed = name.trim();
    if (!initiative || !trimmed) return false;
    if (trimmed === initiative.name) return true;
    const next: Initiative = { ...initiative, name: trimmed };
    this.replaceInitiative(next);
    this.initiativeWriters.get(initiativeId)?.schedule(next, { key: 'name', text: `${initiative.name}: renamed to ${trimmed}` });
    return true;
  }

  private phaseLabel(phaseId: string): string {
    return this.brand.process.find((p) => p.id === phaseId)?.label ?? phaseId;
  }

  /** Apply one edit to a phase's plan (§5.4: edited in place) and schedule its commit under `note`. */
  private editPhase(
    initiativeId: string,
    phaseId: string,
    change: (plan: PhasePlan) => PhasePlan,
    note: { key: string; text: (initiativeName: string, phase: string) => string },
  ): boolean {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative) return false;
    const plan = initiative.phases?.[phaseId] ?? { allocations: [] };
    // The first edit to the plan ends the suggestion: from here on the dates are the user's (§8.2).
    const next: Initiative = { ...initiative, phases: { ...initiative.phases, [phaseId]: change(plan) } };
    delete next.defaultPlan;
    this.replaceInitiative(next);
    this.initiativeWriters.get(initiativeId)?.schedule(next, {
      key: `${phaseId}:${note.key}`,
      text: note.text(initiative.name, this.phaseLabel(phaseId)),
    });
    return true;
  }

  /** Set or clear (`undefined`) one end of a phase's period. Any dates are accepted: an inverted period only warns (§7.2). */
  setPhaseDate(initiativeId: string, phaseId: string, which: 'startDate' | 'endDate', value: string | undefined): void {
    const word = which === 'startDate' ? 'start date' : 'end date';
    this.editPhase(
      initiativeId,
      phaseId,
      (plan) => {
        const next = { ...plan };
        if (value === undefined) delete next[which];
        else next[which] = value;
        return next;
      },
      {
        key: which,
        text: (name, phase) => `${name}: ${phase} ${word} ${value === undefined ? 'cleared' : `set to ${formatDate(value)}`}`,
      },
    );
  }

  /**
   * Allocate a person to a phase (§5.4). Only the initiative team's members can be allocated
   * (§7.2), and a refusal says why. Allocation % is `allocationPct` when the caller has worked out what fits (the
   * phase picker passes the person's free capacity, §5.11), else the person's Team FTE % on the team.
   */
  addAllocation(initiativeId: string, phaseId: string, personId: string, allocationPct?: number): AddAllocationResult {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
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
    this.editPhase(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: [...plan.allocations, allocation] }),
      {
        key: allocation.id,
        text: (name, phase) => `${name}: ${phase} allocation added (${person.name}, ${allocation.allocationPct}%)`,
      },
    );
    return { ok: true, allocation };
  }

  updateAllocation(initiativeId: string, phaseId: string, allocationId: string, allocationPct: number): void {
    const allocation = this.state.initiatives
      .find((i) => i.id === initiativeId)
      ?.phases?.[phaseId]?.allocations.find((a) => a.id === allocationId);
    if (!allocation) return;
    this.editPhase(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: plan.allocations.map((a) => (a.id === allocationId ? { ...a, allocationPct } : a)) }),
      {
        key: allocationId,
        text: (name, phase) => `${name}: ${phase} allocation of ${this.personName(allocation.personId)} set to ${allocationPct}%`,
      },
    );
  }

  /** Remove an allocation; the position comes back so an Undo can put it where it was (§5.11). */
  removeAllocation(initiativeId: string, phaseId: string, allocationId: string): { allocation: Allocation; index: number } | null {
    const allocations = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId]?.allocations ?? [];
    const index = allocations.findIndex((a) => a.id === allocationId);
    if (index < 0) return null;
    const allocation = allocations[index];
    this.editPhase(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: plan.allocations.filter((a) => a.id !== allocationId) }),
      { key: allocationId, text: (name, phase) => `${name}: ${phase} allocation removed (${this.personName(allocation.personId)})` },
    );
    return { allocation, index };
  }

  /** Undo of {@link removeAllocation}: the same allocation, same id, back in its place, as a normal edit. */
  restoreAllocation(initiativeId: string, phaseId: string, allocation: Allocation, index: number): void {
    this.editPhase(
      initiativeId,
      phaseId,
      (plan) => ({ ...plan, allocations: insertAllocation(plan.allocations, allocation, index) }),
      { key: allocation.id, text: (name, phase) => `${name}: ${phase} allocation restored (${this.personName(allocation.personId)})` },
    );
  }

  /**
   * What moving an initiative to another team would remove (§7.2), for the confirmation; nothing changes. Null when
   * nothing can change: an unknown initiative or team, the team it already has, or a Closed or Cancelled
   * initiative. `isLocked` is the phase-locked predicate (§8.1), replaceable so a test can supply a locked phase.
   */
  previewTeamChange(initiativeId: string, teamId: string, isLocked?: (phaseId: string) => boolean): TeamChangePlan | null {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative || initiative.teamId === teamId || initiative.status === 'Closed' || initiative.status === 'Cancelled') return null;
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
    const tail = removed.length > 0 ? `, ${allocationCount(removed.length)} removed` : '';
    this.commitTeam(next, `${initiative.name}: team changed from ${this.teamName(initiative.teamId)} to ${this.teamName(teamId)}${tail}`);
    return { fromTeamId: initiative.teamId, toTeamId: teamId, removed };
  }

  /**
   * Undo of {@link changeTeam}: the previous team, and each removed allocation back in its place with its
   * own id, as a normal edit. A phase locked since then keeps what it has (§8.1), and an allocation that is
   * already there is not added twice.
   */
  restoreTeam(initiativeId: string, change: TeamChange, isLocked?: (phaseId: string) => boolean): void {
    const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
    if (!initiative) return;
    const locked = isLocked ?? ((phaseId) => isPhaseFrozen(initiative, phaseId));
    const phases = { ...initiative.phases };
    let restored = 0;
    // Ascending by index, so each insert lands where the allocation was once the ones before it are back.
    for (const { phaseId, allocation, index } of [...change.removed].sort((a, b) => a.index - b.index)) {
      const plan = phases[phaseId];
      if (!plan || locked(phaseId) || plan.allocations.some((a) => a.id === allocation.id)) continue;
      phases[phaseId] = { ...plan, allocations: insertAllocation(plan.allocations, allocation, index) };
      restored += 1;
    }
    const next: Initiative = { ...initiative, teamId: change.fromTeamId, ...(initiative.phases && { phases }) };
    const tail = restored > 0 ? `, ${allocationCount(restored)} restored` : '';
    this.commitTeam(next, `${initiative.name}: team changed back from ${this.teamName(change.toTeamId)} to ${this.teamName(change.fromTeamId)}${tail}`);
  }

  private commitTeam(next: Initiative, text: string): void {
    this.replaceInitiative(next);
    this.initiativeWriters.get(next.id)?.schedule(next, { key: 'team', text });
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

  /** Flush any pending debounced write immediately (page unload). */
  async flushPending(): Promise<void> {
    await Promise.all([
      this.teamsWriter?.flush(),
      this.peopleWriter?.flush(),
      this.membershipsWriter?.flush(),
      ...[...this.initiativeWriters.values()].map((w) => w.flush()),
    ]);
  }
}
