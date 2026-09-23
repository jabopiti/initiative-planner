/**
 * Field-level three-way merge (§10.5). No merge library: the shape is
 * narrow enough — flat fields on typed records, plus lists identified by
 * id — that a small, purpose-built function is more auditable, and it can
 * enforce the one rule a generic library wouldn't: a same-field conflict is
 * always surfaced, never auto-resolved.
 */

export interface FieldConflict<T> {
  field: keyof T;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

export interface MergeOutcome<T> {
  /** Non-conflicting fields merged; conflicting fields hold `theirs` until the user resolves them. */
  merged: T;
  conflicts: FieldConflict<T>[];
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Merge one record's top-level fields, three-way. */
export function mergeRecordFields<T extends object>(base: T, mine: T, theirs: T): MergeOutcome<T> {
  const merged = { ...mine };
  const conflicts: FieldConflict<T>[] = [];

  for (const key of Object.keys(mine) as (keyof T)[]) {
    const b = base[key];
    const m = mine[key];
    const t = theirs[key];

    if (shallowEqual(m, t)) {
      merged[key] = m;
    } else if (shallowEqual(m, b)) {
      // Only the repository's version changed it.
      merged[key] = t;
    } else if (shallowEqual(t, b)) {
      // Only the user changed it.
      merged[key] = m;
    } else {
      // Both changed it, to different values: a real conflict.
      conflicts.push({ field: key, base: b, mine: m, theirs: t });
      merged[key] = t;
    }
  }

  return { merged, conflicts };
}

export interface Identified {
  id: string;
}

/** A same-field conflict on one item of a merged list, named by the item's own id. */
export interface ItemConflict<T> {
  itemId: string;
  base: unknown;
  mine: T;
  theirs: T;
}

export interface ListMergeOutcome<T> {
  merged: T[];
  conflicts: ItemConflict<T>[];
}

/**
 * Union a list field by id (§10.5 step 4): an item added on one side is
 * kept; an item removed on one side and unchanged on the other is removed;
 * an item present on both sides is merged field by field.
 */
export function mergeListField<T extends Identified>(base: T[], mine: T[], theirs: T[]): ListMergeOutcome<T> {
  const byId = (list: T[]) => new Map(list.map((item) => [item.id, item]));
  const baseMap = byId(base);
  const mineMap = byId(mine);
  const theirsMap = byId(theirs);

  const allIds = new Set([...baseMap.keys(), ...mineMap.keys(), ...theirsMap.keys()]);
  const merged: T[] = [];
  const conflicts: ItemConflict<T>[] = [];

  for (const id of allIds) {
    const b = baseMap.get(id);
    const m = mineMap.get(id);
    const t = theirsMap.get(id);

    if (!m && !t) continue; // removed on both sides, or never existed
    if (m && !t) {
      // Present in mine, absent from theirs: either the user added it, the
      // repository removed it while unchanged locally (an item removed on one
      // side and unchanged on the other is removed — §10.5), or the user
      // edited it locally while the repository removed it. An id absent from
      // `base` means it's a genuine addition, always kept. Present in `base`
      // and unchanged from it means the removal wins. Present in `base` but
      // changed from it is an edit the removal must not silently discard —
      // "never auto-resolved" (this module's own rule) applies here too, and
      // without a UI to surface a deletion-conflict yet, keeping the edit is
      // the safer of the two silent choices.
      if (!b || !shallowEqual(m, b)) merged.push(m);
      continue;
    }
    if (!m && t) {
      if (!b || !shallowEqual(t, b)) merged.push(t);
      continue;
    }
    if (m && t) {
      if (shallowEqual(m, t)) {
        merged.push(m);
      } else if (b && shallowEqual(m, b)) {
        merged.push(t);
      } else if (b && shallowEqual(t, b)) {
        merged.push(m);
      } else {
        const { merged: mergedItem, conflicts: itemConflicts } = mergeRecordFields(
          (b ?? m) as unknown as Record<string, unknown>,
          m as unknown as Record<string, unknown>,
          t as unknown as Record<string, unknown>,
        );
        merged.push(mergedItem as unknown as T);
        if (itemConflicts.length > 0) {
          conflicts.push({ itemId: id, base: b, mine: m, theirs: t });
        }
      }
    }
  }

  return { merged, conflicts };
}
