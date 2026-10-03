import { FILE_PATHS } from '../data/types';
import { DamagedDataError } from '../github/errors';

/** Keys that would reach an object's prototype if assigned: a dataset holding one is damaged, never applied (§3, §10.8). */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * A data-branch file's JSON, or {@link DamagedDataError} naming the file: text that isn't JSON, or a forbidden key
 * anywhere in it. `JSON.parse` makes `__proto__` an own property rather than a prototype, and the reviver sees it.
 */
export function parseDataFile(path: string, text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text, (key, v: unknown) => {
      if (FORBIDDEN_KEYS.has(key)) throw new DamagedDataError(path, `contains the forbidden key "${key}"`);
      return v;
    });
  } catch (error) {
    if (error instanceof DamagedDataError) throw error;
    throw new DamagedDataError(path, "isn't valid JSON");
  }
  return value;
}

export type Plain = Record<string, unknown>;

export const isRecord = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasId = (value: unknown): value is Plain & { id: string } => isRecord(value) && typeof value.id === 'string' && value.id !== '';

/** The master files (§10.2), in the order their problems are reported. */
export const MASTER_FILES: string[] = [FILE_PATHS.datasetFlags, FILE_PATHS.roles, FILE_PATHS.countries, FILE_PATHS.teams, FILE_PATHS.people, FILE_PATHS.memberships];

/**
 * Checks a whole dataset, by path, before any of it is used (§3 Damaged data): file shapes, ids present and unique,
 * and references (membership → person and team, person → role and country, initiative → team and owner, allocation
 * → person). The first problem found, master files first, is thrown as {@link DamagedDataError}. A master file
 * other than dataset.json may be absent: it reads as empty (§10.2). Unknown phase or gate ids are not checked.
 */
export function validateDataset(files: ReadonlyMap<string, unknown>): void {
  const flags = files.get(FILE_PATHS.datasetFlags);
  if (flags === undefined) throw new DamagedDataError(FILE_PATHS.datasetFlags, 'is missing');
  const identity = isRecord(flags) ? flags.processIdentity : undefined;
  if (!isRecord(flags) || typeof flags.schemaVersion !== 'number' || !isRecord(identity) || typeof identity.id !== 'string' || typeof identity.structureVersion !== 'number') {
    throw new DamagedDataError(FILE_PATHS.datasetFlags, 'should hold the schema version and process identity');
  }
  validateRecords(files);
}

/**
 * {@link validateDataset} without dataset.json: the records in `files`, their ids and the references between them.
 * A write checks the dataset it would leave with this (§3 Damaged data), so it never sends a reference to a record
 * that is not on GitHub yet.
 */
export function validateRecords(files: ReadonlyMap<string, unknown>): void {
  const ids = new Map<string, Set<string>>();
  for (const [path, kind] of [
    [FILE_PATHS.roles, 'role'],
    [FILE_PATHS.countries, 'country'],
    [FILE_PATHS.teams, 'team'],
    [FILE_PATHS.people, 'person'],
    [FILE_PATHS.memberships, 'membership'],
  ] as const) {
    ids.set(kind, listIds(path, kind, files.get(path) ?? []));
  }

  const refers = (path: string, item: string, kind: string, id: unknown) => {
    if (typeof id !== 'string' || !ids.get(kind)!.has(id)) throw new DamagedDataError(path, `${item} refers to ${kind} ${String(id)}, which doesn't exist`);
  };

  for (const person of files.get(FILE_PATHS.people) as Plain[] | undefined ?? []) {
    refers(FILE_PATHS.people, `person ${person.id as string}`, 'role', person.roleId);
    refers(FILE_PATHS.people, `person ${person.id as string}`, 'country', person.countryId);
  }
  for (const membership of files.get(FILE_PATHS.memberships) as Plain[] | undefined ?? []) {
    refers(FILE_PATHS.memberships, `membership ${membership.id as string}`, 'person', membership.personId);
    refers(FILE_PATHS.memberships, `membership ${membership.id as string}`, 'team', membership.teamId);
  }

  const initiatives = [...files.keys()].filter((path) => !MASTER_FILES.includes(path)).sort();
  for (const path of initiatives) {
    const initiative = files.get(path);
    if (!hasId(initiative)) throw new DamagedDataError(path, 'initiative has no id');
    if (path !== FILE_PATHS.initiative(initiative.id)) throw new DamagedDataError(path, `initiative file holds id ${initiative.id}`);
    refers(path, `initiative ${initiative.id}`, 'team', initiative.teamId);
    if (initiative.ownerId !== undefined) refers(path, `initiative ${initiative.id}`, 'person', initiative.ownerId);
    const phases = initiative.phases;
    if (phases === undefined) continue;
    if (!isRecord(phases)) throw new DamagedDataError(path, 'phases should be a record');
    for (const [phaseId, plan] of Object.entries(phases)) {
      if (!isRecord(plan)) throw new DamagedDataError(path, `phase ${phaseId} should be a record`);
      for (const allocation of listItems(path, `phase ${phaseId} allocations`, 'allocation', plan.allocations ?? [])) {
        refers(path, `allocation ${allocation.id}`, 'person', allocation.personId);
      }
      if (plan.costItems !== undefined) listItems(path, `phase ${phaseId} cost items`, 'cost item', plan.costItems);
    }
  }
}

/** A master file's ids: it must be a list of items each with an id of its own. */
function listIds(path: string, kind: string, value: unknown): Set<string> {
  return new Set(listItems(path, path, kind, value).map((item) => item.id));
}

/** `value` as a list of items with unique ids, or {@link DamagedDataError}. `what` names the list ("people.json"). */
function listItems(path: string, what: string, kind: string, value: unknown): (Plain & { id: string })[] {
  if (!Array.isArray(value)) throw new DamagedDataError(path, what === path ? 'should be a list' : `${what} should be a list`);
  const seen = new Set<string>();
  value.forEach((item: unknown, index) => {
    if (!hasId(item)) throw new DamagedDataError(path, `${kind} ${index + 1} has no id`);
    if (seen.has(item.id)) throw new DamagedDataError(path, `id ${item.id} appears twice`);
    seen.add(item.id);
  });
  return value as (Plain & { id: string })[];
}
