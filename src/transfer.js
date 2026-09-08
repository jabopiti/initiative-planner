/**
 * Export and import (SPEC §8, DESIGN.md §3).
 *
 * Pure: shaping, validation, diffing and merging only. Reading and writing
 * the browser's storage, and handing the user a file, live in store.js — the
 * one module that touches anything outside itself.
 */

import { SCHEMA_VERSION } from './lifecycle.js';

/** Top-level keys an export must carry to be worth looking at. */
const REQUIRED_KEYS = [
  'schemaVersion',
  'GENERAL',
  'PROCESS',
  'ROLES',
  'COUNTRIES',
  'PEOPLE',
  'TEAMS',
  'BANDS',
  'INITIATIVES',
];

/** Entity collections keyed by id, for diffing. */
const KEYED = ['ROLES', 'COUNTRIES', 'PEOPLE', 'TEAMS'];

/** The whole APP object, pretty-printed. */
export function serialize(app) {
  return JSON.stringify(app, null, 2);
}

/** `initiative-planner-YYYY-MM-DD.json` */
export function exportFilename(now = new Date()) {
  return `initiative-planner-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Validate before offering any choice, so a bad file never reaches a preview.
 * An unrecognised schema version is rejected outright — there is no migration
 * path, by design (AGENTS.md).
 *
 * @returns {{ ok: boolean, error: string|null, data: object|null }}
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.', data: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'That file does not contain an export.', data: null };
  }

  const missing = REQUIRED_KEYS.filter((key) => data[key] === undefined);
  if (missing.length > 0) {
    return { ok: false, error: `That export is missing: ${missing.join(', ')}.`, data: null };
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `That export uses schema version ${data.schemaVersion}; this build reads ` +
        `version ${SCHEMA_VERSION}. There is no migration path for it.`,
      data: null,
    };
  }
  return { ok: true, error: null, data };
}

/**
 * Added / changed / removed for one keyed collection.
 *
 * `removed` depends on the mode, and must: a Replace discards whatever the
 * import omits, a Merge keeps it. Reporting removals under Merge would tell
 * the user something the apply step does not do.
 */
function diffKeyed(current, incoming, mode) {
  const currentIds = Object.keys(current ?? {});
  const incomingIds = Object.keys(incoming ?? {});
  const added = incomingIds.filter((id) => !currentIds.includes(id));
  const changed = incomingIds.filter(
    (id) => currentIds.includes(id) && JSON.stringify(current[id]) !== JSON.stringify(incoming[id]),
  );
  const removed =
    mode === 'replace' ? currentIds.filter((id) => !incomingIds.includes(id)) : [];
  return { added, changed, removed };
}

/**
 * What an import would do, per entity type, plus the thing worth pausing over:
 * which approval records a Merge would overwrite (SPEC §7.7).
 *
 * @param {object} current @param {object} incoming
 * @param {'replace'|'merge'} mode
 */
export function importPreview(current, incoming, mode) {
  const entities = {};
  for (const key of KEYED) {
    entities[key] = diffKeyed(current[key], incoming[key], mode);
  }

  const currentInitiatives = current.INITIATIVES ?? [];
  const incomingInitiatives = incoming.INITIATIVES ?? [];
  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const currentById = byId(currentInitiatives);
  const incomingById = byId(incomingInitiatives);

  entities.INITIATIVES = {
    added: incomingInitiatives.filter((i) => !currentById.has(i.id)).map((i) => i.id),
    changed: incomingInitiatives
      .filter((i) => currentById.has(i.id))
      .filter((i) => JSON.stringify(currentById.get(i.id)) !== JSON.stringify(i))
      .map((i) => i.id),
    // A Replace discards anything the import doesn't carry; a Merge keeps it.
    removed:
      mode === 'replace'
        ? currentInitiatives.filter((i) => !incomingById.has(i.id)).map((i) => i.id)
        : [],
  };

  // An approval is a record of a decision someone made. Overwriting one
  // silently would be the worst thing an import could do, so it is called out
  // separately rather than buried in a "changed" count.
  const approvalCollisions = [];
  for (const incomingInitiative of incomingInitiatives) {
    const existing = currentById.get(incomingInitiative.id);
    if (!existing) continue;
    for (const field of ['gateAApproval', 'gateBApproval']) {
      const before = existing[field];
      const after = incomingInitiative[field];
      if (before && JSON.stringify(before) !== JSON.stringify(after)) {
        approvalCollisions.push({
          initiativeId: existing.id,
          name: existing.name,
          field,
          wouldBeCleared: !after,
        });
      }
    }
  }

  // A person's record is replaced wholesale, memberships included, rather
  // than reconciled one membership at a time (SPEC §7.7).
  const peopleReplaced = entities.PEOPLE.changed;

  return { mode, entities, approvalCollisions, peopleReplaced };
}

/**
 * Apply an import. Replace-all swaps the dataset outright; Merge overlays
 * incoming records onto the current ones, keeping anything the import doesn't
 * mention.
 */
export function applyImport(current, incoming, mode) {
  if (mode === 'replace') return structuredClone(incoming);

  const merged = structuredClone(current);
  merged.schemaVersion = incoming.schemaVersion;
  merged.GENERAL = { ...merged.GENERAL, ...incoming.GENERAL };
  merged.PROCESS = structuredClone(incoming.PROCESS);
  merged.BANDS = structuredClone(incoming.BANDS);

  for (const key of KEYED) {
    merged[key] = { ...merged[key], ...structuredClone(incoming[key]) };
  }

  const byId = new Map(merged.INITIATIVES.map((i) => [i.id, i]));
  for (const incomingInitiative of incoming.INITIATIVES ?? []) {
    byId.set(incomingInitiative.id, structuredClone(incomingInitiative));
  }
  merged.INITIATIVES = [...byId.values()];
  return merged;
}
