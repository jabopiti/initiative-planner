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
  type Role,
  type Team,
} from '../data/types';
import { GithubApiError, type GithubFailureCause } from '../github/errors';
import { GithubClient } from '../github/client';
import { DebouncedFileWriter, type FileConflict } from './DebouncedFileWriter';
import { WriteQueue } from './WriteQueue';

export interface ReadOnlyState {
  cause: GithubFailureCause;
  message: string;
}

export interface RepositoryState {
  status: 'loading' | 'ready';
  readOnly: ReadOnlyState | null;
  syncing: boolean;
  datasetFlags: DatasetFlags | null;
  roles: Role[];
  countries: Country[];
  teams: Team[];
  initiatives: Initiative[];
  conflicts: FileConflict<Team>[];
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
    initiatives: [],
    conflicts: [],
  };

  private readonly listeners = new Set<Listener>();
  private readonly github: GithubClient;
  private readonly queue = new WriteQueue();
  private teamsWriter: DebouncedFileWriter<Team> | null = null;

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

    const [rolesFile, countriesFile, teamsFile] = await Promise.all([
      this.github.getFile({ path: FILE_PATHS.roles, branch }),
      this.github.getFile({ path: FILE_PATHS.countries, branch }),
      this.github.getFile({ path: FILE_PATHS.teams, branch }),
    ]);

    const roles = rolesFile ? (JSON.parse(rolesFile.content) as Role[]) : [];
    const countries = countriesFile ? (JSON.parse(countriesFile.content) as Country[]) : [];
    const teams = teamsFile ? (JSON.parse(teamsFile.content) as Team[]) : [];
    const teamsSha = teamsFile?.sha ?? '';

    await fileCache.set(FILE_PATHS.teams, { content: JSON.stringify(teams), sha: teamsSha });

    const initiatives = await this.pullInitiatives(branch);

    this.teamsWriter = new DebouncedFileWriter<Team>(
      FILE_PATHS.teams,
      branch,
      this.github,
      this.queue,
      (status) => {
        if (status === 'synced') this.setState({ syncing: false, readOnly: null });
        else if (status === 'syncing') this.setState({ syncing: true });
        else this.setState({ syncing: false, readOnly: status.readOnly });
      },
      (conflict) => this.setState({ conflicts: [...this.state.conflicts, conflict] }),
      (content) => this.setState({ teams: content }),
      { content: teams, sha: teamsSha },
    );

    this.setState({
      status: 'ready',
      readOnly: null,
      datasetFlags,
      roles,
      countries,
      teams,
      initiatives,
    });
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
    if (error instanceof GithubApiError) {
      this.goReadOnly(error.cause_, error.message);
    } else {
      this.goReadOnly('unknown', 'Something went wrong loading the dataset.');
    }
  }

  /** New team (§5.7): created from a name only. */
  createTeam(name: string): Team {
    const team: Team = { id: newId(), name, active: true };
    const next = [...this.state.teams, team];
    this.setState({ teams: next });
    this.teamsWriter?.schedule(next);
    return team;
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
      if (error instanceof GithubApiError) {
        this.setState({ syncing: false, readOnly: { cause: error.cause_, message: error.message } });
      } else {
        this.setState({ syncing: false, readOnly: { cause: 'unknown', message: 'Could not create the initiative.' } });
      }
    }

    return initiative;
  }

  /** Resolve a surfaced conflict (§10.5, "Keep theirs" / "Use mine") and clear it from state. */
  async resolveConflict(conflict: FileConflict<Team>, choice: 'mine' | 'theirs'): Promise<void> {
    await conflict.resolve(choice);
    this.setState({ conflicts: this.state.conflicts.filter((c) => c !== conflict) });
  }

  /** Flush any pending debounced write immediately (page unload). */
  async flushPending(): Promise<void> {
    await this.teamsWriter?.flush();
  }
}
