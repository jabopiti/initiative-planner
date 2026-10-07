import type { BrandPack } from '../brand/types';
import { cacheScope, FileCache, isQuotaError, type CacheMeta } from '../cache/db';
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
import { allocationRefusal, trackedYears, type Period } from '../data/cost';
import { formatDateEn, formatMonthEn, monthKey } from '../data/dates';
import { periodMonthsEn } from '../data/period';
import { countriesRolledForward, newCountryRates, peopleRolledForward, weekdaysByMonth } from '../data/rates';
import { localToday } from '../data/dates';
import { duplicateInitiative, type DuplicateResult } from '../data/duplicate';
import { buildDefaultPlan, extendByOneMonth } from '../data/defaultPlan';
import { FROZEN_PHASE_FIELDS, frozenPaths, hasPassedGate, isInitiativeFrozen, isPhaseFrozen } from '../data/frozen';
import { startAtPhase as evaluateStartAtPhase } from '../data/startingPhase';
import { currentPhaseId, passGate as evaluatePassGate, reopenGate as evaluateReopenGate, skipGate as evaluateSkipGate, withChecklistItem, type GateRecorded } from '../data/gate';
import type { ChecklistStatus, InitiativeStatus } from '../data/types';
import { AUTOMATIC_RETRY_CAUSES, DamagedDataError, GithubApiError, REFUSED_DATASET_CAUSES, toReadOnlyState, type ReadOnlyState } from '../github/errors';
import { FILES_PER_QUERY, GithubClient, TRUNCATED, type BranchHead, type CommitLink, type CommitOnHeadArgs, type CommitResult, type GetFileResult } from '../github/client';
import { checkToken, type TokenCheckResult } from '../auth/validateToken';
import { WriteBudget } from '../github/writeBudget';
import { unclaimedCapacityPct } from '../data/capacity';
import { activeMembership } from '../data/teamMembers';
import { copySource, planCopy } from '../data/copyAllocations';
import { allocationCount, planTeamChange, type RemovedAllocation, type TeamChangePlan } from '../data/teamChange';
import { distinctEntities, FileWriter, renderMessage, type JointPart, type CommitMessage, type CommitNote, type DeleteResult, type EntityKind, type FileConflict, type Received, type WriteStatus } from './FileWriter';
import { mergeDocument, pathKey, sameValue, type Path } from './merge';
import { MASTER_FILES, parseDataFile, validateDataset, validateRecords } from './validateDataset';
import { WriteQueue } from './WriteQueue';
import { allocationWords, costItemWords, countryWords, membershipWords, personWords, roleWords, teamWords } from './commitWords';

/** A file a commit of this client's wrote, with its version. */
type WrittenFile = CommitResult['written'][number];

/**
 * A commit of this client's own (§10.2), recorded by the commit it sits on. `written` holds what a many-file commit
 * (§5.9's Reset or Load) wrote, with the versions computed locally (§10.3), for a pull to apply as it is; `saved` names
 * the files a single save or a joint commit wrote, already on screen; `deleted` the files it removed.
 */
interface OwnCommit {
  sha: string;
  written: WrittenFile[];
  saved: string[];
  deleted: string[];
}

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
  /** How many times this client reset the dataset (§5.9): what is kept per user about it, such as what was last looked at, is forgotten on a change. */
  datasetResets: number;
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
  /** The browser's storage is full, so the local cache could not keep a write (§3 Storage limits): a banner says so until dismissed. */
  cacheFull: boolean;
  /** Initiatives someone else deleted while an edit to them waited to be saved, by id, with their names (§3): their
   * page says the change wasn't saved. */
  deletedWithLostEdit: ReadonlyMap<string, string>;
  /** Phases, as {@link lostEditKey}s, that a gate pass froze over an edit of this user's (§8.1): the edit was not
   * saved, and the phase says so until dismissed. Kept in memory only. */
  frozenWithLostEdit: ReadonlySet<string>;
}

/** The key by which {@link RepositoryState.frozenWithLostEdit} names one phase of one initiative. */
export const lostEditKey = (initiativeId: string, phaseId: string): string => `${initiativeId}:${phaseId}`;

/**
 * The phases a freeze in `theirs` overtook an edit of `mine` to (§8.1): frozen there but in neither base nor mine,
 * with mine having changed what the freeze holds. The merge keeps the frozen version, so that edit is lost.
 */
function phasesFrozenOverEdit(base: Initiative, mine: Initiative, theirs: Initiative): string[] {
  return Object.keys(theirs.gates ?? {}).filter(
    (phaseId) =>
      isPhaseFrozen(theirs, phaseId) &&
      !isPhaseFrozen(base, phaseId) &&
      !isPhaseFrozen(mine, phaseId) &&
      FROZEN_PHASE_FIELDS.some((field) => !sameValue(base.phases?.[phaseId]?.[field], mine.phases?.[phaseId]?.[field])),
  );
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
/** How many reads a pull runs at once, each up to {@link FILES_PER_QUERY} files (§10.2). */
const PULL_READS_AT_ONCE = 8;

/** A file a pull read: its text, which the cache keeps, and what it says, parsed once. A file that is not JSON fails the read. */
interface PulledFile {
  raw: string;
  sha: string;
  value: unknown;
  /** Written by this client's own commit: nothing it changes is "updated by others" (§9.9). */
  own: boolean;
}

/** The commit message deleting an initiative (§10.3). */
const deletedMessage = (initiative: Initiative): CommitMessage => ({
  subject: `${initiative.name}: deleted`,
  entities: [{ kind: 'initiative', id: initiative.id }],
});

const jsonFile = (path: string, value: unknown) => ({ path, content: JSON.stringify(value) });

/** The master files of a fresh-install baseline (§2), as written. */
const baselineFiles = (baseline: BaselineDataset) => [
  jsonFile(FILE_PATHS.datasetFlags, baseline.datasetFlags),
  jsonFile(FILE_PATHS.roles, baseline.roles),
  jsonFile(FILE_PATHS.countries, baseline.countries),
  jsonFile(FILE_PATHS.teams, baseline.teams),
  jsonFile(FILE_PATHS.people, baseline.people),
  jsonFile(FILE_PATHS.memberships, baseline.memberships),
];

/** How Load example data ended (§5.9): loaded, stopped because the dataset has data, or failed with the cause. */
export type LoadExampleResult = 'loaded' | 'not-empty' | { failed: ReadOnlyState };

/** How Reset ended (§5.9): reset, or failed with the cause. */
export type ResetResult = 'reset' | { failed: ReadOnlyState };

const pulledFile = (path: string, { content, sha }: { content: string; sha: string }, own = false): PulledFile => ({
  raw: content,
  sha,
  value: parseDataFile(path, content),
  own,
});

/** Everything one pull found: the files it read, and the versions on screen it compared them with. */
interface Pulled {
  head: BranchHead | null;
  files: Map<string, PulledFile>;
  /** Which paths the repository lists, with their versions: an initiative not in it has been removed. */
  listing: Map<string, string>;
  /** The version each path had on screen when the pull compared, so a save that lands meanwhile is not undone. */
  compared: Map<string, string>;
}


/** New people (§5.5) take these; country and role default to the last values used. */
export interface NewPersonInput {
  name: string;
  countryId: string;
  roleId: string;
}

/** What Copy from <previous phase> did: how many allocations were added and who was skipped (§5.11). */
export type CopyAllocationsResult = { copied: number; skipped: Person[] };

/** Why an allocation wasn't added (§7.2), in words the page can show as is. */
export type AddAllocationResult = { ok: true; allocation: Allocation } | { ok: false; reason?: string };

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
    datasetResets: 0,
    conflicts: [],
    fileFailures: new Map(),
    failedFields: new Set(),
    changed: new Set(),
    updatedByOthers: false,
    cacheFull: false,
    deletedWithLostEdit: new Map(),
    frozenWithLostEdit: new Set(),
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
  /** Why the dataset may not be written (§3 Data integrity, Damaged data): set by a pull that refused it, kept
   * through pulls that fail for another reason (GitHub unreachable), and cleared only by one that applies. */
  private datasetRefusal: ReadOnlyState | null = null;
  /** Files whose save was held back by another file's failed save it refers to, by that file: sent again once it lands. */
  private readonly waitingOn = new Map<string, string>();
  /** Fields with unsaved typing: a pull that arrives meanwhile is held until they are left (§3). */
  private editing = 0;
  private held: Pulled | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Why the last delete failed (§9.9): shown in the read-only banner until a pull succeeds. */
  private deleteFailure: ReadOnlyState | null = null;
  private tintTimer: ReturnType<typeof setTimeout> | null = null;
  /** This client's own commits, by the commit each sits on (§10.2): a pull whose head they lead to from the last
   * complete pull's reads nothing, and one that reads anyway takes what they wrote rather than downloading it again
   * (§10.3). Kept for this page's lifetime only, and only those that lead on from the last complete pull. */
  private readonly ownCommits = new Map<string, OwnCommit>();
  private readonly recordSave = (paths: string[], { sha, parent }: CommitLink): void =>
    void this.ownCommits.set(parent, { sha, written: [], saved: paths, deleted: [] });

  constructor(
    private readonly brand: BrandPack,
    private token: string,
  ) {
    this.writeBudget = new WriteBudget(brand.github.apiBaseUrl);
    this.github = new GithubClient(brand.github, () => this.token, (headers) => this.noteRateLimit(headers), {
      budget: this.writeBudget,
      onPause: () => this.rearmRetry(),
    });
    this.cache = new FileCache(cacheScope(brand.github));
  }

  /** The content-creating requests this browser sent, counted against the lines of §10.3. */
  readonly writeBudget: WriteBudget;

  // Arrow properties, so React's useSyncExternalStore gets the same functions on every render and never resubscribes.
  readonly getState = (): RepositoryState => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<RepositoryState>): void {
    const before = this.state.initiatives;
    this.state = { ...this.state, ...patch };
    if (patch.initiatives) this.pruneLostEdits(before);
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
      const files = new Map([...cached].map(([path, file]) => [path, pulledFile(path, file)]));
      validateDataset(new Map([...files].map(([path, file]) => [path, file.value])));
      if (this.refusal(files.get(FILE_PATHS.datasetFlags)!.value as DatasetFlags)) throw new Error('The cache is from another dataset.');
      this.meta = meta;
      return { head: null, files, listing: new Map(), compared: new Map() };
    } catch {
      await this.cache.clear().catch(() => {});
      return null;
    }
  }

  /** Why a dataset may not be used by this build (§3 Data integrity), or null. */
  private refusal(flags: DatasetFlags): ReadOnlyState | null {
    // Flags without this shape are damaged, which validation names (§3 Damaged data).
    if (typeof flags?.schemaVersion !== 'number' || typeof flags.processIdentity?.structureVersion !== 'number') return null;
    if (flags.processIdentity.id !== this.brand.processIdentity.id) {
      return { cause: 'process-mismatch', message: 'This dataset belongs to a different process build. Use the matching build.' };
    }
    const structure = this.brand.processIdentity.structureVersion;
    if (flags.schemaVersion > SCHEMA_VERSION || flags.processIdentity.structureVersion > structure) {
      return { cause: 'dataset-newer', message: 'Dataset is newer than this version — reload to update.' };
    }
    // Migration is out of scope for v1 (§3 Versioning and migration): an older dataset is refused, not migrated.
    if (flags.schemaVersion < SCHEMA_VERSION || flags.processIdentity.structureVersion < structure) {
      return { cause: 'dataset-older', message: "Dataset is older than this version and can't be opened by it." };
    }
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
      if (error instanceof DamagedDataError) this.datasetRefusal = this.pullFailure;
    }
    this.settlePull(complete);
  }

  /** What changed in the repository since what is on screen: null when nothing did, else the files that did. */
  private async fetchPull(): Promise<Pulled | null> {
    const branch = this.brand.github.dataBranch;
    // While the dataset is refused, the head on screen is no proof the repository is fine: the owner may restore it by
    // moving the branch back to exactly that commit, so the pull reads and validates it again rather than stop here.
    const unchangedEndsPull = this.state.status === 'ready' && this.datasetRefusal === null;
    const head = await this.github.getBranchHead({ branch, etag: unchangedEndsPull ? (this.meta?.etag ?? null) : null });
    if (head === 'not-modified') return null;
    if (head && this.meta && unchangedEndsPull && head.sha === this.meta.head) return null;
    // Moved only through this client's own commits: nothing is listed or read (§10.2). What single saves wrote is on
    // screen and in the cache already, so only the head is recorded; what a many-file commit wrote is applied as it is.
    const own = head && this.meta && unchangedEndsPull ? this.ownCommitsTo(this.meta.head, head.sha) : null;
    if (head && own) {
      if (own.some((commit) => commit.written.length > 0 || commit.deleted.length > 0)) return { head, ...this.ownPull(own) };
      this.remember({ head, files: new Map() }, true);
      return null;
    }

    // Listing and files are read at the head just checked, so they are one commit's snapshot: validation across
    // files (§3 Damaged data) never sees half of another user's change, such as a membership without its person.
    let at = head?.sha ?? branch;
    // Files this client's own commits wrote: not read again at the version the listing gives.
    const written = new Map([...this.ownCommits.values()].flatMap((commit) => commit.written.map((file): [string, WrittenFile] => [file.path, file])));
    let listing = await this.listDataset(at);
    if (!listing.has(FILE_PATHS.datasetFlags)) {
      // No dataset anywhere: the first write-capable client creates it (§3). Never over a dataset that has any file
      // left, nor one already on screen: that dataset is damaged, and the owner restores it (§3 Damaged data).
      if (listing.size > 0 || this.state.status === 'ready') throw new DamagedDataError(FILE_PATHS.datasetFlags, 'is missing');
      for (const file of await this.bootstrapBaseline(branch)) written.set(file.path, file);
      at = branch;
      listing = await this.listDataset(at);
      if (!listing.has(FILE_PATHS.datasetFlags)) throw new DamagedDataError(FILE_PATHS.datasetFlags, 'is missing');
    }

    const compared = this.knownShas();
    const changed = [...listing].filter(([path, sha]) => compared.get(path) !== sha).map(([path]) => path);
    const files = new Map<string, PulledFile>();
    const keep = (path: string, file: GetFileResult | null) => file && files.set(path, pulledFile(path, file));
    const toRead: string[] = [];
    for (const path of changed) {
      const own = written.get(path);
      if (own && own.sha === listing.get(path)) files.set(path, pulledFile(path, own, true));
      else toRead.push(path);
    }
    // About a hundred files per GraphQL query; those too large for it are read on their own afterwards (§10.2).
    const batches = Array.from({ length: Math.ceil(toRead.length / FILES_PER_QUERY) }, (_, i) => toRead.slice(i * FILES_PER_QUERY, (i + 1) * FILES_PER_QUERY));
    const tooLarge: string[] = [];
    const worker = async () => {
      for (let batch = batches.shift(); batch !== undefined; batch = batches.shift()) {
        for (const [path, file] of await this.github.readFiles({ ref: at, paths: batch })) {
          if (file === TRUNCATED) tooLarge.push(path);
          else keep(path, file);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PULL_READS_AT_ONCE, batches.length) }, worker));
    await Promise.all(tooLarge.map(async (path) => keep(path, await this.github.getFile({ path, branch: at }))));
    return { head: head ?? null, files, listing, compared };
  }

  /** This client's own commits from commit `from` on, in order, as far as they go. */
  private ownCommitsFrom(from: string): [string, OwnCommit][] {
    const chain: [string, OwnCommit][] = [];
    for (let at = from, next = this.ownCommits.get(at); next !== undefined && chain.length < this.ownCommits.size; at = next.sha, next = this.ownCommits.get(at)) {
      chain.push([at, next]);
    }
    return chain;
  }

  /** Keeps only the own commits that lead on from `head`: no later pull starts from a commit before it. */
  private forgetCommitsBefore(head: string): void {
    const ahead = this.ownCommitsFrom(head);
    this.ownCommits.clear();
    for (const [parent, commit] of ahead) this.ownCommits.set(parent, commit);
  }

  /** This client's own commits from commit `from` to commit `to`, in order; null when they don't lead there. */
  private ownCommitsTo(from: string, to: string): OwnCommit[] | null {
    const chain = this.ownCommitsFrom(from).map(([, commit]) => commit);
    const last = chain.findIndex((commit) => commit.sha === to);
    return last < 0 ? null : chain.slice(0, last + 1);
  }

  /** The pull made of what this client's own commits recorded rather than read: what a many-file commit wrote, over the versions on screen. */
  private ownPull(chain: OwnCommit[]): Omit<Pulled, 'head'> {
    const compared = this.knownShas();
    const listing = new Map(compared);
    const files = new Map<string, PulledFile>();
    for (const commit of chain) {
      for (const file of commit.written) {
        files.set(file.path, pulledFile(file.path, file, true));
        listing.set(file.path, file.sha);
      }
      // A later save's content is on screen already, at the version it holds.
      for (const path of commit.saved) {
        files.delete(path);
        const sha = compared.get(path);
        if (sha === undefined) listing.delete(path);
        else listing.set(path, sha);
      }
      for (const path of commit.deleted) {
        files.delete(path);
        listing.delete(path);
      }
    }
    return { files, listing, compared };
  }

  /** The master files and the initiative files the repository lists, by path, with their versions (§10.2). */
  private async listDataset(ref: string): Promise<Map<string, string>> {
    // `ref` is the data branch, or one commit of it. One request lists every file, unless there are too many for it.
    const tree = await this.github.listTree({ ref });
    if (tree.truncated) return this.listDatasetByFolder(ref);
    const listing = new Map<string, string>();
    for (const entry of tree.entries) {
      if (entry.type === 'blob' && (MASTER_FILES.includes(entry.path) || /^initiatives\/[^/]+\.json$/.test(entry.path))) listing.set(entry.path, entry.sha);
    }
    return listing;
  }

  /** {@link listDataset} by the two folders, for a tree too large for one listing. */
  private async listDatasetByFolder(branch: string): Promise<Map<string, string>> {
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
    const refusal = (flagsFile ? this.refusal(flagsFile.value as DatasetFlags) : null) ?? this.damage(pulled);
    if (refusal) {
      this.pullFailure = refusal;
      this.datasetRefusal = refusal;
      return false;
    }
    const lifted = this.datasetRefusal !== null;
    this.datasetRefusal = null;
    const complete = this.state.status === 'ready' ? this.mergeIn(pulled) : (this.build(pulled), true);
    this.remember(pulled, complete);
    // Edits refused while the dataset could not be written are sent now it can (§3).
    if (lifted) for (const [, writer] of this.allWriters()) if (writer.failure && REFUSED_DATASET_CAUSES.includes(writer.failure.cause)) void writer.retry();
    return complete;
  }

  /**
   * Why the dataset a pull would leave on screen is damaged (§3 Damaged data), or null: the pulled files, over what
   * this client last read of every other file the repository still lists. Nothing of a damaged pull is applied.
   */
  private damage({ files, listing }: Pulled): ReadOnlyState | null {
    const whole = new Map<string, unknown>();
    const known = new Map(this.allWriters());
    for (const path of listing.keys()) {
      const value = files.has(path) ? files.get(path)!.value : known.get(path)?.syncedContent;
      if (value !== undefined && value !== null) whole.set(path, value);
    }
    try {
      validateDataset(whole);
      return null;
    } catch (error) {
      if (error instanceof DamagedDataError) return { cause: 'damaged', message: error.message };
      throw error;
    }
  }

  /** A pull's changes into the dataset on screen; each file goes through its writer, which merges it with any edit not yet saved. */
  private mergeIn({ files, listing, compared }: Pulled): boolean {
    let complete = true;
    const changed: string[] = [];
    // What this client's own commits wrote is not "updated by others" (§9.9).
    const applied = (path: string, received: Received) => {
      if ('left' in received) complete &&= received.left === 'writer';
      else if (!files.get(path)?.own) changed.push(...received.changed.map((p) => changeKey(path, p)));
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
        if (!file.own) changed.push(changeKey(path, []));
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

    if (changed.length > 0) this.markChanged(changed);
    return complete;
  }

  /** Keeps a pull in the cache for the next open (§10.4), and what it saw, unless a file was left alone. Failures are survivable. */
  private remember({ files, head }: Pick<Pulled, 'files' | 'head'>, complete: boolean): void {
    const meta = complete && head ? { head: head.sha, etag: head.etag } : null;
    const kept = [...files].map(([path, file]): [string, { content: string; sha: string }] => [path, { content: file.raw, sha: file.sha }]);
    this.cache.commitPull(kept, meta).then(
      (recorded) => {
        this.meta = recorded ? meta : null;
        if (meta) this.forgetCommitsBefore(meta.head);
      },
      (error) => {
        // The cache is a local convenience: losing it only means the next open pulls everything.
        if (isQuotaError(error)) this.onCacheFull();
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
    this.jointly(() => {
      const countries = countriesRolledForward(this.state.countries, tracked);
      if (countries) this.commitCountries(countries, note());
      const people = peopleRolledForward(this.state.people, tracked);
      if (people) this.commitPeople(people, note());
    });
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
    // While GitHub limits requests, the retry waits for the time it named rather than the usual 30 s (§3).
    const pausedUntil = this.github.pausedUntil;
    if (!pullIncomplete && this.pullFailure === null && this.deleteFailure === null && !hasRecoverableFailure && pausedUntil === null) return;
    const delay = pausedUntil === null ? PULL_RETRY_MS : pausedUntil - Date.now();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (document.visibilityState !== 'visible') return;
      for (const [, writer] of this.allWriters()) if (this.autoRetries(writer)) void writer.retry();
      void this.pull();
    }, delay);
  }

  /** GitHub started limiting requests: the retry is moved to the time it named. */
  private rearmRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.armRetry(false, false);
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

  /** An edit is waiting or being saved, or a save failed: closing the tab now would lose or cut short a change (§10.3). */
  hasUnsavedWork(): boolean {
    if (this.unsavedChangeCount() > 0) return true;
    for (const [, writer] of this.allWriters()) if (writer.busy) return true;
    return false;
  }

  private cacheFullDismissed = false;

  /** The banner is raised once per session (§3 Storage limits): never again after it was dismissed. */
  private readonly onCacheFull = (): void => {
    if (!this.cacheFullDismissed && !this.state.cacheFull) this.setState({ cacheFull: true });
  };

  dismissCacheFull(): void {
    this.cacheFullDismissed = true;
    this.setState({ cacheFull: false });
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
      if (status === 'synced') {
        for (const [waiting, on] of this.waitingOn) {
          if (on !== file) continue;
          this.waitingOn.delete(waiting);
          this.retryFile(waiting);
        }
      }
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

  /**
   * The files `path` may refer to (§3 Damaged data): a master file those before it in {@link MASTER_FILES} (a
   * membership its person and team), an initiative every master file.
   */
  private referenced(path: string): [string, FileWriter<unknown>][] {
    const index = MASTER_FILES.indexOf(path);
    const master = this.masterWriters().filter((entry) => entry[1] !== null) as unknown as [string, FileWriter<unknown>][];
    return index === -1 ? master : master.filter(([other]) => MASTER_FILES.indexOf(other) < index);
  }

  /** A save of `path` waits for the first pull, then for the saves of the files it refers to: a new person lands
   * before the membership that names them, so no pull ever sees one without the other (§3 Damaged data). */
  private gate(path: string): () => Promise<unknown> {
    return () => this.firstPullDone.then(() => Promise.all(this.referenced(path).map(([, writer]) => writer.settled())));
  }

  /**
   * Why `content` may not be written to `path` now (§3), or null: the dataset was refused, or `content` refers to a
   * record whose own save failed, so it is not on GitHub. This save then fails the same way and is sent again once
   * that one lands: sent now, it would leave the dataset damaged for every client that pulls meanwhile.
   */
  private refused(path: string): (content: unknown) => ReadOnlyState | null {
    return (content) => {
      if (this.datasetRefusal) return this.datasetRefusal;
      const failed = this.referenced(path).find(([, writer]) => writer.failure !== null);
      if (!failed) return null;
      const files = new Map<string, unknown>();
      for (const [file, writer] of this.referenced(path)) if (writer.syncedContent !== null) files.set(file, writer.syncedContent);
      files.set(path, content);
      try {
        validateRecords(files);
        return null;
      } catch (error) {
        if (!(error instanceof DamagedDataError)) throw error;
        this.waitingOn.set(path, failed[0]);
        return failed[1].failure;
      }
    };
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
      gate: this.gate(path),
      refused: this.refused(path),
      merge: mergeDocument,
      whenMissing,
      initial,
      onStatus: this.statusOf(path),
      onSchedule: () => this.writtenByAction?.add(path),
      onCommitted: (commit) => this.recordSave([path], commit),
      onCacheFull: this.onCacheFull,
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
      gate: this.gate(path),
      refused: this.refused(path),
      merge: (base, mine, theirs) => {
        const lost = phasesFrozenOverEdit(base, mine, theirs);
        if (lost.length > 0) this.noteLostEdits(initiative.id, lost);
        return mergeDocument(base, mine, theirs, { frozen: frozenPaths });
      },
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
      onSchedule: () => this.writtenByAction?.add(path),
      onCommitted: (commit) => this.recordSave([path], commit),
      onCacheFull: this.onCacheFull,
      onConflict: this.onConflict,
      onConflictClosed: this.onConflictClosed,
      onDocument: (doc) => this.replaceInitiative(doc),
    });
    this.initiativeWriters.set(initiative.id, writer);
    return writer;
  }

  /** Edits of this user's to these phases were overtaken by a gate pass (§8.1): the phases say so until dismissed. */
  private noteLostEdits(initiativeId: string, phaseIds: string[]): void {
    const keys = phaseIds.map((phaseId) => lostEditKey(initiativeId, phaseId)).filter((key) => !this.state.frozenWithLostEdit.has(key));
    if (keys.length > 0) this.setState({ frozenWithLostEdit: new Set([...this.state.frozenWithLostEdit, ...keys]) });
  }

  /**
   * A lost-edit message ends with its freeze: a phase frozen in `before` and not now (its gate reopened, §8.3, or
   * its initiative deleted) drops it, so a later pass can't revive it. Only that transition counts: a message is
   * noted while the merge that freezes the phase here is still being saved.
   */
  private pruneLostEdits(before: Initiative[]): void {
    const lost = this.state.frozenWithLostEdit;
    if (lost.size === 0) return;
    const frozenNow = (initiativeId: string, phaseId: string) => {
      const initiative = this.state.initiatives.find((i) => i.id === initiativeId);
      return initiative !== undefined && isPhaseFrozen(initiative, phaseId);
    };
    const ended = before.flatMap((initiative) =>
      Object.keys(initiative.gates ?? {})
        .filter((phaseId) => lost.has(lostEditKey(initiative.id, phaseId)) && isPhaseFrozen(initiative, phaseId) && !frozenNow(initiative.id, phaseId))
        .map((phaseId) => lostEditKey(initiative.id, phaseId)),
    );
    if (ended.length === 0) return;
    this.state = { ...this.state, frozenWithLostEdit: new Set([...lost].filter((key) => !ended.includes(key))) };
  }

  /** Dismiss a phase's "your last change wasn't saved" message (§8.1, §9.9). */
  dismissLostEdit(initiativeId: string, phaseId: string): void {
    const key = lostEditKey(initiativeId, phaseId);
    if (!this.state.frozenWithLostEdit.has(key)) return;
    const next = new Set(this.state.frozenWithLostEdit);
    next.delete(key);
    this.setState({ frozenWithLostEdit: next });
  }

  private replaceInitiative(next: Initiative): void {
    this.setState({ initiatives: this.state.initiatives.map((i) => (i.id === next.id ? next : i)) });
  }

  /** First-write-capable-client baseline bootstrap (§2, §3 "System writes"): one commit, idempotent. Returns the files
   * it wrote, none when another client's bootstrap won. */
  private async bootstrapBaseline(branch: string): Promise<WrittenFile[]> {
    const baseline = buildBaselineDataset(this.brand);
    const result = await this.queue.run(() =>
      this.github.createFilesCommit({
        branch,
        message: 'Initialize dataset from fresh-install baseline',
        files: baselineFiles(baseline),
      }),
    );
    return result.written;
  }

  /** New role (§5.9): created from a name, abbreviation and cost factor, active. */
  createRole(input: { name: string; abbreviation: string; costFactor: number }): Role {
    const role: Role = { id: newId(), ...input, active: true };
    this.commitRoles([...this.state.roles, role], this.note('role', role.id, 'record', undefined, role, roleWords));
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
      this.note('role', id, 'record', current, next, roleWords),
    );
  }

  /** New country (§5.9): its one day rate copied to every tracked year, working days prefilled with weekdays. */
  createCountry(input: { name: string; code: string; dayRate: number }, today: Date = new Date()): Country {
    const country: Country = { id: newId(), name: input.name, code: input.code, active: true, ratesByYear: newCountryRates(input.dayRate, trackedYears(today)) };
    this.commitCountries([...this.state.countries, country], this.note('country', country.id, 'record', undefined, country, countryWords));
    return country;
  }

  /** Rename, recode, deactivate or reactivate a country; countries are never deleted (§9.3). */
  updateCountry(id: string, patch: Partial<Pick<Country, 'name' | 'code' | 'active'>>): void {
    const current = this.state.countries.find((c) => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (next.name === current.name && next.code === current.code && next.active === current.active) return;
    this.commitCountries(
      this.state.countries.map((c) => (c.id === id ? next : c)),
      this.note('country', id, 'record', current, next, countryWords),
    );
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
      (name, to) => `${name}: working days in ${formatMonthEn(key)} set to ${to}`,
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
    // The first rate edit also marks the rates reviewed: both files in one commit (§10.3).
    this.jointly(() => {
      this.commitCountries(
        this.state.countries.map((c) => (c.id === id ? updated : c)),
        this.note('country', id, field, get(record), get(next), (_, to) => words(country.name, to)),
      );
      this.markRatesReviewed('Rates marked as reviewed');
    });
  }

  /** Rates are correct (§5.9): confirms the rates without editing them, which clears Review rates (§5.2). */
  confirmRates(): void {
    this.markRatesReviewed('Rates confirmed as correct');
  }

  /** Marks the rates reviewed (§5.2) unless they already are. */
  private markRatesReviewed(words: string): void {
    const flags = this.state.datasetFlags;
    if (!flags || flags.ratesReviewed || !this.flagsWriter) return;
    const next = { ...flags, ratesReviewed: true };
    this.setState({ datasetFlags: next });
    this.flagsWriter.schedule(next, this.note('dataset', 'flags', 'ratesReviewed', false, true, () => words));
  }

  /** The files the action {@link jointly} runs has written so far; null outside one. */
  private writtenByAction: Set<string> | null = null;

  /**
   * Runs a user action that may write several files (§10.3): a new person with their membership, a rate edit that marks
   * the rates reviewed, the roll-forward of rates. When it writes more than one, they go as one commit, sent at once.
   */
  private jointly(action: () => void): void {
    const written = new Set<string>();
    this.writtenByAction = written;
    try {
      action();
    } finally {
      this.writtenByAction = null;
    }
    if (written.size > 1) this.commitJointly([...written]);
  }

  /**
   * One commit of the files' pending edits (§10.3). It goes ahead only while every file is still at the version its
   * edit was made on, read at the head the commit is pinned to, and is made again on a new head when another commit
   * lands first; otherwise each file saves on its own and merges with the newer version as any save does (§10.5).
   */
  private commitJointly(paths: string[]): void {
    void this.firstPullDone.then(() =>
      this.queue.run(async () => {
        const writers = paths.map((path) => this.allWriters().find(([p]) => p === path)?.[1]);
        const parts: [FileWriter<unknown>, JointPart<unknown>][] = [];
        for (const writer of writers) {
          const part = writer?.takeJoint();
          if (writer && part) parts.push([writer, part]);
        }
        // Each file given back saves on its own.
        const giveBack = () => {
          for (const [writer, part] of parts) writer.jointReturned(part);
        };
        if (parts.length < paths.length) {
          giveBack();
          for (const writer of writers) if (writer && !parts.some(([taken]) => taken === writer)) void writer.flush();
          return;
        }
        const message = renderMessage({
          subject: [...new Set(parts.map(([, part]) => part.message.subject))].join('; '),
          entities: distinctEntities(parts.flatMap(([, part]) => part.message.entities)),
        });
        const files = parts.map(([, part]) => ({ path: part.path, content: part.content }));
        try {
          const result = await this.github.commitOnHead({
            branch: this.brand.github.dataBranch,
            message,
            build: async (at) => {
              const root = await this.github.listDirectory({ path: '', branch: at });
              const unchanged = parts.every(([, part]) => root.find((entry) => entry.path === part.path)?.sha === part.sha);
              return unchanged ? { files, deletes: [] } : null;
            },
          });
          if (result === 'stopped') return giveBack();
          parts.forEach(([writer, part], i) => writer.jointLanded(part, result.written[i].sha));
          if (result.parent) this.recordSave(paths, { sha: result.commitSha, parent: result.parent });
        } catch (error) {
          // The branch kept moving, or its head can't be read: each file saves on its own, as it would without this commit.
          if (error instanceof GithubApiError && (error.cause_ === 'conflict' || error.cause_ === 'not-found')) return giveBack();
          const cause = toReadOnlyState(error, 'Something went wrong saving this change.');
          for (const [writer, part] of parts) writer.jointFailed(part, cause);
        }
      }),
    );
  }

  private commitCountries(next: Country[], note?: CommitNote): void {
    this.setState({ countries: next });
    this.countriesWriter?.schedule(next, note);
  }

  /** A note for one field of one entity: what it was before the edit and what it is now (§10.3); `undefined` is "did not exist". */
  private note<T>(kind: EntityKind, id: string, field: string, from: T | undefined, to: T | undefined, words: (from: T | undefined, to: T | undefined) => string): CommitNote {
    return { entity: { kind, id }, field, from, to, words: words as CommitNote['words'] };
  }

  /** Why a team name is refused (§5.8): empty, or another team already has it (case-insensitive). */
  teamNameRefusal(name: string, exceptId?: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a name.';
    const taken = this.state.teams.find((t) => t.id !== exceptId && t.name.trim().toLowerCase() === trimmed.toLowerCase());
    return taken ? `A team named ${taken.name} already exists.` : null;
  }

  /** New team (§5.7): created from a name only. Callers ask `teamNameRefusal` first; a refused name here is a bug. */
  createTeam(name: string): Team {
    const refusal = this.teamNameRefusal(name);
    if (refusal) throw new Error(refusal);
    const team: Team = { id: newId(), name: name.trim(), active: true };
    this.commitTeams([...this.state.teams, team], this.note('team', team.id, 'record', undefined, team, teamWords));
    return team;
  }

  /** A new person added straight to a team (§5.8): the person and the membership in one commit (§10.3). */
  createPersonInTeam(input: NewPersonInput, teamId: string): Person {
    let person!: Person;
    this.jointly(() => {
      person = this.createPerson(input);
      this.addMembership(person.id, teamId);
    });
    return person;
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
    this.commitPeople([...this.state.people, person], this.note('person', person.id, 'record', undefined, person, this.personWords()));
    return person;
  }

  /** Rename, deactivate or reactivate a team (§5.8, §9.3): teams are never deleted, so the record stays. */
  updateTeam(id: string, patch: Partial<Pick<Team, 'name' | 'active'>>): void {
    const current = this.state.teams.find((t) => t.id === id);
    if (!current) return;
    if (patch.name !== undefined && this.teamNameRefusal(patch.name, id)) return;
    const next = { ...current, ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }) };
    if (next.name === current.name && next.active === current.active) return;
    this.commitTeams(
      this.state.teams.map((t) => (t.id === id ? next : t)),
      this.note('team', id, 'record', current, next, teamWords),
    );
  }

  /** In-place edit from the person panel (§5.6): no save button, so every change commits. */
  updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void {
    const current = this.state.people.find((p) => p.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.commitPeople(
      this.state.people.map((p) => (p.id === id ? next : p)),
      this.note('person', id, 'record', current, next, this.personWords()),
    );
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
    if (existing?.active) return existing;
    if (existing) {
      // Rejoining (§5.6): the same record comes back, keeping its Team FTE % unless the person no longer has room.
      this.updateMembership(existing.id, { active: true, teamFtePct: existing.teamFtePct });
      return this.state.memberships.find((m) => m.id === existing.id) ?? null;
    }
    const unclaimed = unclaimedCapacityPct(person, this.state.memberships);
    const teamFtePct = requestedPct === undefined ? unclaimed : allowOver ? requestedPct : Math.min(requestedPct, unclaimed);
    const membership: Membership = { id: newId(), personId, teamId, teamFtePct, active: true };
    this.commitMemberships([...this.state.memberships, membership], this.membershipNote(membership.id, undefined, membership));
    return membership;
  }

  /** Edit a membership's Team FTE %; `allowOver` is set only by the team detail (§5.6). */
  updateMembership(id: string, patch: Partial<Pick<Membership, 'teamFtePct' | 'active'>>, allowOver = false): void {
    this.updateMemberships([{ id, ...patch }], allowOver);
  }

  /**
   * Edit several memberships as one edit, a note each (§10.3): a split bar divider moves Team FTE % from one team to
   * the next (§5.6). Unless `allowOver`, each Team FTE % is capped at what the person has unclaimed; lowered values go
   * first, so the room they free counts for the raised ones.
   */
  updateMemberships(changes: ({ id: string } & Partial<Pick<Membership, 'teamFtePct' | 'active'>>)[], allowOver = false): void {
    const before = new Map(this.state.memberships.map((m) => [m.id, m]));
    const rise = (c: (typeof changes)[number]) => (c.teamFtePct ?? 0) - (before.get(c.id)?.teamFtePct ?? 0);
    let next = this.state.memberships;
    for (const { id, ...patch } of [...changes].sort((x, y) => rise(x) - rise(y))) {
      next = next.map((m) => {
        if (m.id !== id) return m;
        const person = this.state.people.find((p) => p.id === m.personId);
        const capped = patch.teamFtePct === undefined || allowOver || !person ? patch : { ...patch, teamFtePct: Math.min(patch.teamFtePct, unclaimedCapacityPct(person, next, id)) };
        return { ...m, ...capped };
      });
    }
    const notes = this.state.memberships.flatMap((m, i) => (next[i] !== m ? [this.membershipNote(m.id, m, next[i])] : []));
    if (notes.length > 0) this.commitMemberships(next, notes);
  }

  /** A membership's note; the person and team are named as they are now, since a removal leaves no record to ask. */
  private membershipNote(id: string, from: Membership | undefined, to: Membership | undefined): CommitNote {
    const of = (m: Membership | undefined) => (m ? { who: this.personName(m.personId), where: this.teamName(m.teamId) } : undefined);
    const names = of(from ?? to) as { who: string; where: string };
    const note = this.note('membership', id, 'record', from, to, membershipWords(names.where));
    return { ...note, subject: names.who };
  }

  private personWords() {
    return personWords({
      countryName: (id) => this.state.countries.find((c) => c.id === id)?.name,
      roleName: (id) => this.state.roles.find((r) => r.id === id)?.name,
    });
  }

  private personName(id: string): string {
    return this.state.people.find((p) => p.id === id)?.name ?? 'Unknown person';
  }

  private teamName(id: string): string {
    return this.state.teams.find((t) => t.id === id)?.name ?? 'unknown team';
  }

  /** Memberships are removable (§9.3); nothing points at them. The record and position come back for an Undo (§5.11). */
  removeMembership(id: string): { membership: Membership; index: number } | null {
    const index = this.state.memberships.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const membership = this.state.memberships[index];
    this.commitMemberships(
      this.state.memberships.filter((m) => m.id !== id),
      this.membershipNote(id, membership, undefined),
    );
    return { membership, index };
  }

  /** Undo of {@link removeMembership}: the same record back in its place, or why it can't be (§5.11). */
  restoreMembership(membership: Membership, index: number): { ok: true } | { ok: false; message: string } {
    const person = this.state.people.find((p) => p.id === membership.personId);
    const team = this.state.teams.find((t) => t.id === membership.teamId);
    if (!person || !team) return { ok: false, message: "Can't undo: the person or team is no longer there." };
    if (this.state.memberships.some((m) => m.id === membership.id || (m.personId === membership.personId && m.teamId === membership.teamId))) {
      return { ok: false, message: `Can't undo: ${person.name} is on ${team.name} again.` };
    }
    const next = [...this.state.memberships];
    next.splice(Math.min(index, next.length), 0, membership);
    this.commitMemberships(next, this.membershipNote(membership.id, undefined, membership));
    return { ok: true };
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

  private commitMemberships(next: Membership[], note?: CommitNote | CommitNote[]): void {
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
    return this.saveNewInitiative(initiative, `${name}: created`);
  }

  /**
   * Duplicate an initiative of any status (§5.11): a new Active one named "<name> copy", re-planned from `today`, in one
   * commit "<copy>: created from <name>". Returns the copy with the people left out of its allocations, or null when
   * the initiative is not there. Throws like a failed creation when the file could not be saved.
   */
  async duplicateInitiative(id: string, today: string = localToday()): Promise<DuplicateResult | null> {
    const source = this.state.initiatives.find((i) => i.id === id);
    if (!source) return null;
    // The source's own edits are committed first (§10.3), so its file and the copy agree.
    void this.initiativeWriters.get(id)?.flushApart();
    const result = duplicateInitiative(source, {
      process: this.brand.process,
      people: this.state.people,
      memberships: this.state.memberships,
      teams: this.state.teams,
      existingNames: this.state.initiatives.map((i) => i.name),
      today,
    });
    await this.saveNewInitiative(result.initiative, `${result.initiative.name}: created from ${source.name}`);
    return result;
  }

  /** Add a new initiative and save its file (its writer's first save), taking it back out when that fails. */
  private async saveNewInitiative(initiative: Initiative, message: string): Promise<Initiative> {
    const { id } = initiative;
    this.setState({ initiatives: [...this.state.initiatives, initiative] });

    const writer = this.createInitiativeWriter(initiative, null);
    writer.schedule(initiative, this.note('initiative', id, 'record', undefined, initiative, () => message));
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
    /** Only a recorded actual is still accepted on a frozen initiative or phase (§8.4). An Undo is refused
     * silently on a frozen phase, as its offer is withdrawn once the phase freezes (§5.11); any other edit the
     * freeze overtook is reported in the phase (§8.1). */
    { allowFrozen = false, undo = false }: { allowFrozen?: boolean; undo?: boolean } = {},
  ): boolean {
    const initiative = allowFrozen ? this.state.initiatives.find((i) => i.id === initiativeId) : this.editableInitiative(initiativeId);
    if (!initiative) return false;
    if (!allowFrozen && isPhaseFrozen(initiative, phaseId)) {
      if (!undo) this.noteLostEdits(initiative.id, [phaseId]);
      return false;
    }
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

  /**
   * Set a phase's whole period at once (§9.11 period picker, saved on Done): one write and one commit, "Payments API:
   * Development period set to Apr–Sep". An `undefined` end clears it, and any dates are accepted: an inverted period
   * only warns (§7.2). Nothing is written when neither date changes.
   */
  setPhasePeriod(initiativeId: string, phaseId: string, period: Period): void {
    const plan = this.state.initiatives.find((i) => i.id === initiativeId)?.phases?.[phaseId];
    const before = { startDate: plan?.startDate, endDate: plan?.endDate };
    if (before.startDate === period.startDate && before.endDate === period.endDate) return;
    const to = { startDate: period.startDate, endDate: period.endDate };
    this.editPhase<Period>(
      initiativeId,
      phaseId,
      (current) => {
        const next = { ...current };
        for (const which of ['startDate', 'endDate'] as const) {
          if (to[which] === undefined) delete next[which];
          else next[which] = to[which];
        }
        return next;
      },
      {
        field: 'period',
        from: before,
        to,
        words: (_, after, name, phase) => {
          const { startDate, endDate } = after ?? {};
          if (startDate && endDate) return `${name}: ${phase} period set to ${periodMonthsEn(startDate, endDate)}`;
          if (startDate) return `${name}: ${phase} start date set to ${formatDateEn(startDate)}, no end date`;
          if (endDate) return `${name}: ${phase} end date set to ${formatDateEn(endDate)}, no start date`;
          return `${name}: ${phase} period cleared`;
        },
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
      { field: 'endDate', from: endDate, to: next, words: (_, to, name, phase) => `${name}: ${phase} extended to ${formatDateEn(to as string)}` },
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
    // Refused by a freeze, which the phase itself reports (§8.1), so no reason here.
    if (isPhaseFrozen(initiative, phaseId)) {
      this.noteLostEdits(initiative.id, [phaseId]);
      return { ok: false };
    }

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
      { undo: true },
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
    const lookups = { personName: (id: string) => this.personName(id), money: (amount: number) => this.money(amount) };
    return (list === 'allocations' ? allocationWords(lookups) : costItemWords(lookups)) as (from: unknown, to: unknown, name: string, phase: string) => string;
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
        words: (_, to, name, phase) => `${name}: ${phase} actual for ${formatMonthEn(month)} recorded (${this.brand.currencySymbol}${Math.round(to as number)})`,
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
    this.commitAtOnce(initiative.id, initiative, this.note('initiative', initiative.id, `gate:${phase.id}`, 'open', record.outcome, () => `${name}: ${phase.exitGate.label} ${what}`));
  }

  /**
   * An action that reads or replaces the saved file (§10.3): the edits waiting in the file's commit window are sent
   * first, as their own commit, and the action's own write follows at once instead of opening a new window.
   */
  private commitAtOnce(initiativeId: string, next: Initiative, note: CommitNote): void {
    const writer = this.initiativeWriters.get(initiativeId);
    if (!writer) return;
    void writer.flushApart();
    writer.schedule(next, note);
    void writer.flush();
  }

  /** Sends the initiative's pending edits now (§10.3): the user left its page. */
  flushInitiative(initiativeId: string): void {
    void this.initiativeWriters.get(initiativeId)?.flush();
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
    this.commitAtOnce(initiativeId, result.initiative, this.note('initiative', initiativeId, `gate:${result.phase.id}`, result.record.outcome, 'open', () => `${name}: ${gateLabel} reopened`));
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
    this.commitAtOnce(initiativeId, next, this.note('initiative', initiativeId, 'status', initiative.status, to, () => words(initiative.name)));
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
    this.commitAtOnce(next.id, next, this.note('initiative', next.id, 'team', state(before), state(next), words));
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
    if (this.datasetRefusal) return { failed: this.datasetRefusal };
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
    if (this.datasetRefusal) return { failed: this.datasetRefusal };
    await this.flushPending();
    const result = await this.commitDataset('Example data loaded', 'Something went wrong loading the example data.', async (at) => {
      const read = async <T>(path: string, fallback: T): Promise<T> => {
        const file = await this.github.getFile({ path, branch: at });
        return file ? (parseDataFile(path, file.content) as T) : fallback;
      };
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
          jsonFile(FILE_PATHS.teams, data.teams),
          jsonFile(FILE_PATHS.people, data.people),
          jsonFile(FILE_PATHS.memberships, data.memberships),
          // Roles and countries only grow when one the example needs was added from the baseline.
          ...(data.roles.length > roles.length ? [jsonFile(FILE_PATHS.roles, data.roles)] : []),
          ...(data.countries.length > countries.length ? [jsonFile(FILE_PATHS.countries, data.countries)] : []),
          ...data.initiatives.map((i) => jsonFile(FILE_PATHS.initiative(i.id), i)),
        ],
        deletes: [],
      };
    });
    if (typeof result === 'object') return result;
    return result === 'stopped' ? 'not-empty' : 'loaded';
  }

  /**
   * Reset (§5.9): the dataset back to the fresh-install baseline (§2) in one commit "Dataset reset" (§10.3) — roles,
   * countries and rates from the brand pack, `ratesReviewed` false, no people, teams, memberships or initiatives.
   * Every edit not saved yet is dropped first (it would bring data back); a save in flight finishes. The initiative
   * files removed are those the data branch lists at the head the commit builds on, so one created meanwhile goes too.
   */
  async resetDataset(): Promise<ResetResult> {
    if (this.datasetRefusal) return { failed: this.datasetRefusal };
    await Promise.all(this.allWriters().map(([, writer]) => writer.drop()));
    const result = await this.commitDataset('Dataset reset', 'Something went wrong resetting the dataset.', async (at) => {
      const listed = await this.github.listDirectory({ path: 'initiatives', branch: at });
      return {
        files: baselineFiles(buildBaselineDataset(this.brand)),
        deletes: listed.filter((entry) => entry.type === 'file').map((entry) => entry.path),
      };
    });
    if (typeof result === 'object') return result;
    this.setState({ datasetResets: this.state.datasetResets + 1 });
    return 'reset';
  }

  /** One many-file commit on the data branch through the write queue (§10.3), then this client pulls it in. */
  private async commitDataset(
    message: string,
    failureText: string,
    build: CommitOnHeadArgs['build'],
  ): Promise<'done' | 'stopped' | { failed: ReadOnlyState }> {
    let result: CommitResult | 'stopped';
    try {
      result = await this.queue.run(() => this.github.commitOnHead({ branch: this.brand.github.dataBranch, message, build }));
    } catch (error) {
      return { failed: toReadOnlyState(error, failureText) };
    }
    if (result !== 'stopped' && result.parent) this.ownCommits.set(result.parent, { sha: result.commitSha, written: result.written, saved: [], deleted: result.deleted });
    // A pull already running may have read the branch before the commit: the one after it brings the commit in.
    await this.pulling;
    await this.pull();
    return result === 'stopped' ? 'stopped' : 'done';
  }

  /**
   * Disconnect (§3, §5.10): every edit not saved yet is dropped, so no debounced save goes out later under the
   * removed token. The Disconnect button has already offered to keep them.
   */
  discardUnsaved(): void {
    for (const [, writer] of this.allWriters()) writer.discardUnsaved();
  }

  /** Sends every pending edit now (§10.3's flush points), and settles once every save in flight has. */
  async flushPending(): Promise<void> {
    await Promise.all(this.allWriters().map(([, writer]) => (writer.busy ? writer.flush() : undefined)));
  }
}
