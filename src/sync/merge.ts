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

/**
 * Merge one record's scalar (non-list) top-level fields, three-way.
 * `listFields` names the keys handled by `mergeListField` instead — this
 * function passes them through from `mine` untouched so callers can merge
 * each list separately and recombine.
 */
export function mergeRecordFields<T extends object>(
  base: T,
  mine: T,
  theirs: T,
  listFields: (keyof T)[] = [],
): MergeOutcome<T> {
  const merged = { ...mine };
  const conflicts: FieldConflict<T>[] = [];

  for (const key of Object.keys(mine) as (keyof T)[]) {
    if (listFields.includes(key)) continue;

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

/**
 * Union a list field by id (§10.5 step 4): an item added on one side is
 * kept; an item removed on one side and unchanged on the other is removed;
 * an item present on both sides is merged field by field.
 */
export function mergeListField<T extends Identified>(
  base: T[],
  mine: T[],
  theirs: T[],
): MergeOutcome<T[]> {
  const byId = (list: T[]) => new Map(list.map((item) => [item.id, item]));
  const baseMap = byId(base);
  const mineMap = byId(mine);
  const theirsMap = byId(theirs);

  const allIds = new Set([...baseMap.keys(), ...mineMap.keys(), ...theirsMap.keys()]);
  const merged: T[] = [];
  const conflicts: FieldConflict<T[]>[] = [];

  for (const id of allIds) {
    const b = baseMap.get(id);
    const m = mineMap.get(id);
    const t = theirsMap.get(id);

    if (!m && !t) continue; // removed on both sides, or never existed
    if (m && !t) {
      // Present in mine, absent from theirs: either the user added it, or the
      // repository removed it while unchanged locally. An id absent from
      // `base` means it's a genuine addition; present in `base` means the
      // repository removed it, so the removal wins (an item removed on one
      // side and unchanged on the other is removed).
      if (!b) merged.push(m);
      continue;
    }
    if (!m && t) {
      if (!b) merged.push(t);
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
          conflicts.push({ field: [id] as unknown as keyof T[], base: b, mine: m, theirs: t });
        }
      }
    }
  }

  return { merged, conflicts };
}
