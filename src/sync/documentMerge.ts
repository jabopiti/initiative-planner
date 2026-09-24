import { mergeListField, type Identified } from './merge';

/** A same-field conflict in a merged document; `apply` writes a chosen side into any version of that document. */
export interface DocumentConflict<D> {
  itemId: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
  apply: (doc: D, chosen: unknown) => D;
}

export interface DocumentMergeOutcome<D> {
  /** Non-conflicting changes from both sides; a conflicting field holds `theirs` until the user chooses. */
  merged: D;
  conflicts: DocumentConflict<D>[];
}

/** How a file's document is merged (§10.5): what the one writer is parameterised by. */
export type DocumentMerge<D> = (base: D, mine: D, theirs: D) => DocumentMergeOutcome<D>;

/** The merge of a master file: a list of records, merged per item by id. */
export function mergeListDocument<T extends Identified>(base: T[], mine: T[], theirs: T[]): DocumentMergeOutcome<T[]> {
  const { merged, conflicts } = mergeListField(base, mine, theirs);
  return {
    merged,
    conflicts: conflicts.map((c) => ({
      itemId: c.itemId,
      base: c.base,
      mine: c.mine,
      theirs: c.theirs,
      // Only the conflicting fields take the chosen side; the rest of the item keeps its clean merge.
      apply: (doc, chosen) =>
        doc.map((item) =>
          item.id === c.itemId
            ? { ...item, ...Object.fromEntries(c.fields.map((f) => [f, (chosen as Record<string, unknown>)[f]])) }
            : item,
        ),
    })),
  };
}
