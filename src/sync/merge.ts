/**
 * Three-way merge by path (§10.5). No merge library: the shape is narrow
 * enough (records, plus lists identified by id) that a small, purpose-built
 * function is more auditable, and it enforces the one rule a generic library
 * wouldn't: a same-field conflict is always surfaced, never auto-resolved.
 *
 * The merge follows the document's shape rather than a list of known fields,
 * so a field no code has heard of merges like any other.
 */

/** One step into a document: a record's key, or a list item named by its id. */
export type PathSegment = string | { id: string };
export type Path = PathSegment[];

/** A value both sides changed, to different values; the merged document holds `theirs` until the user chooses. */
export interface MergeConflict {
  path: Path;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

export interface MergeOutcome<D> {
  merged: D;
  conflicts: MergeConflict[];
}

/** How a file's document is merged: what the one writer is parameterised by. */
export type DocumentMerge<D> = (base: D, mine: D, theirs: D) => MergeOutcome<D>;

export interface MergeOptions<D> {
  /** Paths frozen in a version of the document (§8.1): they keep their snapshot and never merge. */
  frozen?: (doc: D) => Path[];
}

type Plain = Record<string, unknown>;

const isRecord = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A list whose every item carries a distinct string id: merged per item (§10.5 step 4). Any other list is one value. */
function isIdList(value: unknown): value is Plain[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<unknown>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

/** Deep equality, key order ignored; a key holding undefined equals a missing key. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => sameValue(a[key], b[key]));
}

/** A path as one string, for comparing and keying: `phases.validation.allocations[a1].allocationPct`. */
export function pathKey(path: Path): string {
  return path.map((s, i) => (typeof s === 'string' ? `${i === 0 ? '' : '.'}${s}` : `[${s.id}]`)).join('');
}

/** The value at a path, or undefined when anything along it is missing. */
export function getAtPath(doc: unknown, path: Path): unknown {
  let node = doc;
  for (const segment of path) {
    if (typeof segment === 'string') node = isRecord(node) ? node[segment] : undefined;
    else node = Array.isArray(node) ? node.find((item) => isRecord(item) && item.id === segment.id) : undefined;
  }
  return node;
}

/**
 * A copy of `doc` with `value` at `path`, and nothing else changed. Undefined removes the key or the
 * list item; a list item that is missing is added back. A path through an item that is gone is a no-op.
 */
export function setAtPath<D>(doc: D, path: Path, value: unknown): D {
  if (path.length === 0) return value as D;
  if (value === undefined && getAtPath(doc, path) === undefined) return doc;
  const [head, ...rest] = path;
  if (typeof head === 'string') {
    const record: Plain = isRecord(doc) ? { ...doc } : {};
    const next = setAtPath(record[head], rest, value);
    if (next === undefined) delete record[head];
    else record[head] = next;
    return record as D;
  }
  const list: unknown[] = Array.isArray(doc) ? doc : [];
  const index = list.findIndex((item) => isRecord(item) && item.id === head.id);
  if (index === -1) return (rest.length === 0 ? [...list, value] : list) as D;
  const next = setAtPath(list[index], rest, value);
  return (next === undefined ? list.filter((_, i) => i !== index) : list.map((item, i) => (i === index ? next : item))) as D;
}

/**
 * Merge two edits of one document against the version both started from (§10.5). Records merge by
 * key and lists of identified items by id, recursively. Anything else is a value: changed on one side
 * only, that side's value; on both to the same value, kept; on both to different values, a conflict.
 * An item removed on one side and changed on the other is a conflict too, never a silent choice.
 */
export function mergeDocument<D>(base: D, mine: D, theirs: D, options: MergeOptions<D> = {}): MergeOutcome<D> {
  const frozenKeys = (doc: D) => new Set((options.frozen?.(doc) ?? []).map(pathKey));
  const frozen = { base: frozenKeys(base), mine: frozenKeys(mine), theirs: frozenKeys(theirs) };
  const anyFrozen = [...new Set([...frozen.base, ...frozen.mine, ...frozen.theirs])];
  const conflicts: MergeConflict[] = [];

  /** Whether a frozen path lies under this one, so a whole-subtree shortcut would skip it. */
  const frozenBelow = (key: string) =>
    key === '' ? anyFrozen.length > 0 : anyFrozen.some((f) => f.startsWith(`${key}.`) || f.startsWith(`${key}[`));

  function oneSided(b: unknown, m: unknown, t: unknown): { value: unknown } | null {
    if (sameValue(m, t)) return { value: m };
    if (sameValue(m, b)) return { value: t }; // only theirs changed it
    if (sameValue(t, b)) return { value: m }; // only mine changed it
    return null;
  }

  function merge(path: Path, b: unknown, m: unknown, t: unknown): unknown {
    const key = pathKey(path);
    // A frozen snapshot is never merged: it stays as it was frozen, whatever either side holds.
    // Frozen before both edits, it keeps the base; frozen by one side's edit (a gate passed), that side's.
    if (frozen.theirs.has(key)) return frozen.base.has(key) ? b : t;
    if (frozen.mine.has(key)) return frozen.base.has(key) ? t : m;

    // A whole subtree changed on one side only is taken as is, unless a frozen path lies inside it.
    const settled = oneSided(b, m, t);
    if (settled && !frozenBelow(key)) return settled.value;
    if (isRecord(m) && isRecord(t) && (b === undefined || isRecord(b))) return mergeRecord(path, b ?? {}, m, t);
    if (isIdList(m) && isIdList(t) && (b === undefined || isIdList(b))) return mergeList(path, b ?? [], m, t);
    if (settled) return settled.value;

    conflicts.push({ path, base: b, mine: m, theirs: t });
    return t;
  }

  function mergeRecord(path: Path, b: Plain, m: Plain, t: Plain): Plain {
    const merged: Plain = {};
    // Every key from any side: a field present on only one side is kept.
    for (const key of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])) {
      const value = merge([...path, key], b[key], m[key], t[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }

  function mergeList(path: Path, b: Plain[], m: Plain[], t: Plain[]): Plain[] {
    const byId = (list: Plain[]) => new Map(list.map((item) => [item.id as string, item]));
    const [bs, ms, ts] = [byId(b), byId(m), byId(t)];
    const merged: Plain[] = [];
    // An item added on one side is kept; removed on one side and unchanged on the other, removed.
    for (const id of new Set([...bs.keys(), ...ms.keys(), ...ts.keys()])) {
      const item = merge([...path, { id }], bs.get(id), ms.get(id), ts.get(id));
      if (item !== undefined) merged.push(item as Plain);
    }
    return merged;
  }

  return { merged: merge([], base, mine, theirs) as D, conflicts };
}
