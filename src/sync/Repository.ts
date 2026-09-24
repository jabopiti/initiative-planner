import type { BrandPack } from '../brand/types';
import { fileCache } from '../cache/db';
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
import { toReadOnlyState, type GithubFailureCause, type ReadOnlyState } from '../github/errors';
import { GithubClient, parseJsonFile } from '../github/client';
import { unclaimedCapacityPct } from '../data/capacity';
import { activeMembership } from '../data/teamMembers';
import { allocationCount, planTeamChange, type RemovedAllocation, type TeamChangePlan } from '../data/teamChange';
import { FileWriter, type FileConflict, type WriteStatus } from './FileWriter';
import { mergeDocument } from './merge';
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
}

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
  };

  private readonly listeners = new Set<Listener>();
  private readonly github: GithubClient;
  private readonly queue = new WriteQueue();
  private teamsWriter: FileWriter<Team[]> | null = null;
  private peopleWriter: FileWriter<Person[]> | null = null;
  private membershipsWriter: FileWriter<Membership[]> | null = null;
  private readonly initiativeWriters = new Map<string, FileWriter<Initiative>>();

  constructor(
    private readonly brand: BrandPack,
    token: string,
  ) {
    this.github = new GithubClient(brand.github, () => token);
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

  private goReadOnly(cause: GithubFailureCause, message: string): void {
    this.setState({ readOnly: { cause, message } });
  }

  private initialising: Promise<void> | null = null;

  /** Loads the dataset once; a second call (React StrictMode runs the effect twice in dev) shares the first. */
  initialize(): Promise<void> {
    return (this.initialising ??= this.load().catch((error) => this.handleReadFailure(error)));
  }

  private async load(): Promise<void> {
    const branch = this.brand.github.dataBranch;

    let datasetFile;
    try {
      datasetFile = await this.github.getFile({ path: FILE_PATHS.datasetFlags, branch });
    } catch (error) {
      this.handleReadFailure(error);
      return;
    }

    if (!datasetFile) {
      try {
        await this.bootstrapBaseline(branch);
      } catch (error) {
        this.handleReadFailure(error);
        return;
      }
      datasetFile = await this.github.getFile({ path: FILE_PATHS.datasetFlags, branch });
    }

    if (!datasetFile) {
      this.goReadOnly('unknown', 'Dataset damaged — could not read it after creating it.');
      return;
    }

    const datasetFlags = JSON.parse(datasetFile.content) as DatasetFlags;

    // Data integrity (§3): a foreign process or a dataset newer than this build refuses the sync.
    if (datasetFlags.processIdentity.id !== this.brand.processIdentity.id) {
      this.goReadOnly('unknown', 'This dataset belongs to a different process build. Use the matching build.');
      return;
    }
    if (datasetFlags.schemaVersion > SCHEMA_VERSION) {
      this.goReadOnly('unknown', 'Dataset is newer than this version — reload to update.');
      return;
    }

    // Master files and initiative files don't depend on each other — pull both concurrently.
    const [[rolesFile, countriesFile, teamsFile, peopleFile, membershipsFile], initiativeFiles] = await Promise.all([
      Promise.all([
        this.github.getFile({ path: FILE_PATHS.roles, branch }),
        this.github.getFile({ path: FILE_PATHS.countries, branch }),
        this.github.getFile({ path: FILE_PATHS.teams, branch }),
        this.github.getFile({ path: FILE_PATHS.people, branch }),
        this.github.getFile({ path: FILE_PATHS.memberships, branch }),
      ]),
      this.pullInitiatives(branch),
    ]);

    const initiatives = initiativeFiles.map((f) => f.initiative);
    for (const f of initiativeFiles) this.createInitiativeWriter(f.initiative, f.sha);

    const roles = parseJsonFile(rolesFile, [] as Role[]);
    const countries = parseJsonFile(countriesFile, [] as Country[]);
    const teams = parseJsonFile(teamsFile, [] as Team[]);
    const people = parseJsonFile(peopleFile, [] as Person[]);
    const memberships = parseJsonFile(membershipsFile, [] as Membership[]);
    const teamsSha = teamsFile?.sha ?? '';

    // Fire-and-forget: nothing downstream reads from the cache before "ready" (FileWriter
    // takes `initial` directly), so there's no reason to block the ready transition on this write.
    // The cache is a local convenience, not the source of truth, so a failure here is silently fine.
    void fileCache.set(FILE_PATHS.teams, { content: JSON.stringify(teams), sha: teamsSha }).catch(() => {});

    this.teamsWriter = this.createWriter<Team>(FILE_PATHS.teams, branch, 'teams', { content: teams, sha: teamsSha });
    this.peopleWriter = this.createWriter<Person>(FILE_PATHS.people, branch, 'people', {
      content: people,
      sha: peopleFile?.sha ?? '',
    });
    this.membershipsWriter = this.createWriter<Membership>(FILE_PATHS.memberships, branch, 'memberships', {
      content: memberships,
      sha: membershipsFile?.sha ?? '',
    });

    this.setState({
      status: 'ready',
      readOnly: null,
      datasetFlags,
      roles,
      countries,
      teams,
      people,
      memberships,
      initiatives,
    });
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
    this.setState({ syncing: all.some((s) => s === 'syncing'), readOnly: failed?.readOnly ?? null });
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
      merge: mergeDocument,
      whenMissing: [],
      initial,
      onStatus: this.statusOf(path),
      onConflict: this.onConflict,
      onDocument: (content) => this.setState({ [key]: content } as Partial<RepositoryState>),
    });
  }

  private async pullInitiatives(branch: string): Promise<{ initiative: Initiative; sha: string }[]> {
    const entries = await this.github.listDirectory({ path: 'initiatives', branch });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.name.endsWith('.json'))
        .map((entry) => this.github.getFile({ path: entry.path, branch })),
    );
    return files
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .map((f) => ({ initiative: JSON.parse(f.content) as Initiative, sha: f.sha }));
  }

  /** The writer of one initiative's file; `sha` is null until the file exists (its first save creates it). */
  private createInitiativeWriter(initiative: Initiative, sha: string | null): FileWriter<Initiative> {
    const path = FILE_PATHS.initiative(initiative.id);
    const writer = new FileWriter<Initiative>({
      path,
      branch: this.brand.github.dataBranch,
      github: this.github,
      queue: this.queue,
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

  private handleReadFailure(error: unknown): void {
    this.setState({ readOnly: toReadOnlyState(error, 'Something went wrong loading the dataset.') });
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
