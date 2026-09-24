import type { BrandPack } from '../brand/types';
import { fileCache } from '../cache/db';
import { buildBaselineDataset } from '../data/baseline';
import { newId } from '../data/ids';
import {
  FILE_PATHS,
  SCHEMA_VERSION,
  type Country,
  type DatasetFlags,
  type Initiative,
  type Membership,
  type Person,
  type Role,
  type Team,
} from '../data/types';
import { toReadOnlyState, type GithubFailureCause, type ReadOnlyState } from '../github/errors';
import { GithubClient, parseJsonFile } from '../github/client';
import { unclaimedCapacityPct } from '../data/capacity';
import { DebouncedFileWriter, type FileConflict } from './DebouncedFileWriter';
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
  conflicts: FileConflict<MasterRecord>[];
}

export type MasterRecord = Team | Person | Membership;

/** New people (§5.5) take these; country and role default to the last values used. */
export interface NewPersonInput {
  name: string;
  countryId: string;
  roleId: string;
}

type Listener = () => void;

/**
 * The single source of truth for dataset state and GitHub sync (§3, §10.2,
 * §10.3). Owns the debounced-write pipeline for master list files and the
 * one-shot create path for per-initiative files.
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
  private teamsWriter: DebouncedFileWriter<Team> | null = null;
  private peopleWriter: DebouncedFileWriter<Person> | null = null;
  private membershipsWriter: DebouncedFileWriter<Membership> | null = null;

  constructor(
    private readonly brand: BrandPack,
    token: string,
  ) {
    this.github = new GithubClient(brand.github, () => token);
  }

  getState(): RepositoryState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<RepositoryState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private goReadOnly(cause: GithubFailureCause, message: string): void {
    this.setState({ readOnly: { cause, message } });
  }

  async initialize(): Promise<void> {
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
    const [[rolesFile, countriesFile, teamsFile, peopleFile, membershipsFile], initiatives] = await Promise.all([
      Promise.all([
        this.github.getFile({ path: FILE_PATHS.roles, branch }),
        this.github.getFile({ path: FILE_PATHS.countries, branch }),
        this.github.getFile({ path: FILE_PATHS.teams, branch }),
        this.github.getFile({ path: FILE_PATHS.people, branch }),
        this.github.getFile({ path: FILE_PATHS.memberships, branch }),
      ]),
      this.pullInitiatives(branch),
    ]);

    const roles = parseJsonFile(rolesFile, [] as Role[]);
    const countries = parseJsonFile(countriesFile, [] as Country[]);
    const teams = parseJsonFile(teamsFile, [] as Team[]);
    const people = parseJsonFile(peopleFile, [] as Person[]);
    const memberships = parseJsonFile(membershipsFile, [] as Membership[]);
    const teamsSha = teamsFile?.sha ?? '';

    // Fire-and-forget: nothing downstream reads from the cache before "ready" (DebouncedFileWriter
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

  /** One debounced writer per master file (§10.3); each reports through the same sync/conflict state. */
  private createWriter<T extends MasterRecord>(
    path: string,
    branch: string,
    key: 'teams' | 'people' | 'memberships',
    initial: { content: T[]; sha: string },
  ): DebouncedFileWriter<T> {
    return new DebouncedFileWriter<T>(
      path,
      branch,
      this.github,
      this.queue,
      (status) => {
        if (status === 'synced') this.setState({ syncing: false, readOnly: null });
        else if (status === 'syncing') this.setState({ syncing: true });
        else this.setState({ syncing: false, readOnly: status.readOnly });
      },
      (conflict) => this.setState({ conflicts: [...this.state.conflicts, conflict as FileConflict<MasterRecord>] }),
      (content) => this.setState({ [key]: content } as Partial<RepositoryState>),
      initial,
    );
  }

  private async pullInitiatives(branch: string): Promise<Initiative[]> {
    const entries = await this.github.listDirectory({ path: 'initiatives', branch });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.name.endsWith('.json'))
        .map((entry) => this.github.getFile({ path: entry.path, branch })),
    );
    return files.filter((f): f is NonNullable<typeof f> => f !== null).map((f) => JSON.parse(f.content) as Initiative);
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
    const next = [...this.state.teams, team];
    this.setState({ teams: next });
    this.teamsWriter?.schedule(next, { key: team.id, text: `${name}: team created` });
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

  /** In-place edit from the person panel (§5.6): no save button, so every change commits. */
  updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void {
    const current = this.state.people.find((p) => p.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.commitPeople(
      this.state.people.map((p) => (p.id === id ? next : p)),
      { key: `${id}:${Object.keys(patch).sort().join(',')}`, text: `${next.name}: ${this.describePersonChange(current, patch)}` },
    );
  }

  private describePersonChange(current: Person, patch: Partial<Omit<Person, 'id'>>): string {
    const parts: string[] = [];
    if (patch.name !== undefined) parts.push(`renamed from ${current.name}`);
    if (patch.countryId !== undefined) {
      parts.push(`country set to ${this.state.countries.find((c) => c.id === patch.countryId)?.name ?? 'unknown'}`);
    }
    if (patch.roleId !== undefined) {
      parts.push(`role set to ${this.state.roles.find((r) => r.id === patch.roleId)?.name ?? 'unknown'}`);
    }
    if (patch.capacityPct !== undefined) parts.push(`capacity set to ${patch.capacityPct}%`);
    if (patch.active !== undefined) parts.push(patch.active ? 'reactivated' : 'deactivated');
    return parts.join(', ') || 'updated';
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
    const what =
      patch.active !== undefined && patch.teamFtePct === undefined
        ? `${patch.active ? 'reactivated' : 'deactivated'} on ${where}`
        : `Team FTE % on ${where} set to ${next.teamFtePct}%`;
    this.commitMemberships(
      this.state.memberships.map((m) => (m.id === id ? next : m)),
      { key: `${id}:${patch.active !== undefined && patch.teamFtePct === undefined ? 'active' : 'pct'}`, text: `${who}: ${what}` },
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

  private commitPeople(next: Person[], note?: { key: string; text: string }): void {
    this.setState({ people: next });
    this.peopleWriter?.schedule(next, note);
  }

  private commitMemberships(next: Membership[], note?: { key: string; text: string }): void {
    this.setState({ memberships: next });
    this.membershipsWriter?.schedule(next, note);
  }

  /** New initiative (§5.1, §6): name + team required; written as its own file. */
  async createInitiative(name: string, teamId: string): Promise<Initiative> {
    const initiative: Initiative = { id: newId(), name, teamId, status: 'Active' };
    this.setState({ initiatives: [...this.state.initiatives, initiative], syncing: true });

    try {
      await this.queue.run(() =>
        this.github.putFile({
          path: FILE_PATHS.initiative(initiative.id),
          branch: this.brand.github.dataBranch,
          content: JSON.stringify(initiative),
          message: `${name}: created`,
        }),
      );
      this.setState({ syncing: false, readOnly: null });
    } catch (error) {
      this.setState({ syncing: false, readOnly: toReadOnlyState(error, 'Could not create the initiative.') });
    }

    return initiative;
  }

  /** Resolve a surfaced conflict (§10.5, "Keep theirs" / "Use mine") and clear it from state. */
  async resolveConflict(conflict: FileConflict<MasterRecord>, choice: 'mine' | 'theirs'): Promise<void> {
    await conflict.resolve(choice);
    this.setState({ conflicts: this.state.conflicts.filter((c) => c !== conflict) });
  }

  /** Flush any pending debounced write immediately (page unload). */
  async flushPending(): Promise<void> {
    await Promise.all([this.teamsWriter?.flush(), this.peopleWriter?.flush(), this.membershipsWriter?.flush()]);
  }
}
