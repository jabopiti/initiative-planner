import type { CacheMeta } from '../cache/db';
import { FILE_PATHS } from '../data/types';
import { DamagedDataError } from '../github/errors';
import { FILES_PER_QUERY, TRUNCATED, type BranchHead, type CommitLink, type CommitResult, type GetFileResult, type GithubClient } from '../github/client';
import { MASTER_FILES, parseDataFile } from './validateDataset';

/** A file a commit of this client's wrote, with its version. */
export type WrittenFile = CommitResult['written'][number];

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

/** How many reads a pull runs at once, each up to {@link FILES_PER_QUERY} files (§10.2). */
const PULL_READS_AT_ONCE = 8;

/** A file a pull read: its text, which the cache keeps, and what it says, parsed once. A file that is not JSON fails the read. */
export interface PulledFile {
  raw: string;
  sha: string;
  value: unknown;
  /** Written by this client's own commit: nothing it changes is "updated by others" (§9.9). */
  own: boolean;
}

export const pulledFile = (path: string, { content, sha }: { content: string; sha: string }, own = false): PulledFile => ({
  raw: content,
  sha,
  value: parseDataFile(path, content),
  own,
});

/** Everything one pull found: the files it read, and the versions on screen it compared them with. */
export interface Pulled {
  head: BranchHead | null;
  files: Map<string, PulledFile>;
  /** Which paths the repository lists, with their versions: an initiative not in it has been removed. */
  listing: Map<string, string>;
  /** The version each path had on screen when the pull compared, so a save that lands meanwhile is not undone. */
  compared: Map<string, string>;
}

/** What a fetch needs to know of the dataset on screen, asked when it runs. */
export interface PullContext {
  /** Whether the dataset is on screen and not refused: an unchanged head then ends the pull. While it is refused, the
   * head on screen is no proof the repository is fine: the owner may restore it by moving the branch back to exactly
   * that commit, so the pull reads and validates it again rather than stop here. */
  unchangedEndsPull: boolean;
  /** Whether a dataset is on screen already. */
  ready: boolean;
  /** What the last complete pull saw. Asked when needed, not once: a cache write that lands while the head is being
   * fetched replaces it. */
  meta: () => CacheMeta | null;
  /** The version of each file as it is on screen. */
  knownShas: () => Map<string, string>;
  /** Writes a fresh install's baseline (§3) and returns the files it wrote. */
  bootstrapBaseline: (branch: string) => Promise<WrittenFile[]>;
  /** Records a head reached through this client's own commits alone, with nothing to apply. */
  recordHead: (head: BranchHead) => void;
}

/**
 * Reads the repository for a pull (§3, §10.2): the head, the listing, the files that differ from the screen. It also
 * keeps this client's own commits, by the commit each sits on: a pull whose head they lead to from the last complete
 * pull's reads nothing, and one that reads anyway takes what they wrote rather than downloading it again (§10.3).
 * Kept for this page's lifetime only, and only those that lead on from the last complete pull.
 */
export class PullSource {
  private readonly ownCommits = new Map<string, OwnCommit>();

  constructor(
    private readonly github: GithubClient,
    private readonly branch: string,
  ) {}

  /** A single save or a joint commit of `paths`, already on screen. */
  readonly recordSave = (paths: string[], { sha, parent }: CommitLink): void => void this.ownCommits.set(parent, { sha, written: [], saved: paths, deleted: [] });

  /** A many-file commit: what it wrote and removed, for a pull to apply as it is. */
  recordMany(parent: string, sha: string, written: WrittenFile[], deleted: string[]): void {
    this.ownCommits.set(parent, { sha, written, saved: [], deleted });
  }

  /** Keeps only the own commits that lead on from `head`: no later pull starts from a commit before it. */
  forgetBefore(head: string): void {
    const ahead = this.ownCommitsFrom(head);
    this.ownCommits.clear();
    for (const [parent, commit] of ahead) this.ownCommits.set(parent, commit);
  }

  /** What changed in the repository since what is on screen: null when nothing did, else the files that did. */
  async fetch(context: PullContext): Promise<Pulled | null> {
    const { branch } = this;
    const { unchangedEndsPull } = context;
    const head = await this.github.getBranchHead({ branch, etag: unchangedEndsPull ? (context.meta()?.etag ?? null) : null });
    if (head === 'not-modified') return null;
    const meta = context.meta();
    if (head && meta && unchangedEndsPull && head.sha === meta.head) return null;
    // Moved only through this client's own commits: nothing is listed or read (§10.2). What single saves wrote is on
    // screen and in the cache already, so only the head is recorded; what a many-file commit wrote is applied as it is.
    const own = head && meta && unchangedEndsPull ? this.ownCommitsTo(meta.head, head.sha) : null;
    if (head && own) {
      if (own.some((commit) => commit.written.length > 0 || commit.deleted.length > 0)) return { head, ...this.ownPull(own, context.knownShas()) };
      context.recordHead(head);
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
      if (listing.size > 0 || context.ready) throw new DamagedDataError(FILE_PATHS.datasetFlags, 'is missing');
      for (const file of await context.bootstrapBaseline(branch)) written.set(file.path, file);
      at = branch;
      listing = await this.listDataset(at);
      if (!listing.has(FILE_PATHS.datasetFlags)) throw new DamagedDataError(FILE_PATHS.datasetFlags, 'is missing');
    }

    const compared = context.knownShas();
    const changed = [...listing].filter(([path, sha]) => compared.get(path) !== sha).map(([path]) => path);
    const files = new Map<string, PulledFile>();
    const keep = (path: string, file: GetFileResult | null) => file && files.set(path, pulledFile(path, file));
    const toRead: string[] = [];
    for (const path of changed) {
      const mine = written.get(path);
      if (mine && mine.sha === listing.get(path)) files.set(path, pulledFile(path, mine, true));
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

  /** This client's own commits from commit `from` to commit `to`, in order; null when they don't lead there. */
  private ownCommitsTo(from: string, to: string): OwnCommit[] | null {
    const chain = this.ownCommitsFrom(from).map(([, commit]) => commit);
    const last = chain.findIndex((commit) => commit.sha === to);
    return last < 0 ? null : chain.slice(0, last + 1);
  }

  /** The pull made of what this client's own commits recorded rather than read: what a many-file commit wrote, over the versions on screen. */
  private ownPull(chain: OwnCommit[], compared: Map<string, string>): Omit<Pulled, 'head'> {
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
}
