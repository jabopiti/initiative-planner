import type { PhaseDef } from '../brand/types';
import { grandDeviation, grandEstimate, type RateData } from './cost';
import { daysBetween, localIso } from './dates';
import { currentPhaseId, GATE_ALL_PASSED, GATE_NOTHING_TO_CHECK, gateProgress, gateProgressText, gateRequirements } from './gate';
import type { Initiative, Person } from './types';

/** The four key figures of §5.4 as the user last saw them, in the form that is compared (§9.9, §10.4). */
export interface KeyFigureSnapshot {
  estimate: number;
  deviation: number;
  /** The current phase's label, or "Closed". */
  phase: string;
  /** The gate tile's text: "X of Y complete", "Nothing to check" or "All passed". */
  gate: string;
}

/** What is kept for one initiative the user opened (§10.4): when, its key figures then, and a fingerprint of its file. */
export interface SeenRecord {
  at: number;
  figures: KeyFigureSnapshot;
  fingerprint: string;
}

/** The key figures as the cost summary shows them (§5.4). */
export function keyFigureSnapshot(initiative: Initiative, process: PhaseDef[], people: Person[], data: RateData): KeyFigureSnapshot {
  const closed = initiative.status === 'Closed';
  const phase = process.find((p) => p.id === currentPhaseId(initiative, process))!;
  const requirements = gateRequirements(process, initiative, phase.id);
  return {
    estimate: grandEstimate(initiative, process, people, data),
    deviation: grandDeviation(initiative, process, people, data),
    phase: closed ? 'Closed' : phase.label,
    gate: closed ? GATE_ALL_PASSED : requirements.length === 0 ? GATE_NOTHING_TO_CHECK : gateProgressText(gateProgress(requirements)),
  };
}

/** The same text for the same content whatever order its keys were written in, so a re-serialised file is not a change. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const fingerprints = new WeakMap<Initiative, string>();

/**
 * A short fingerprint of an initiative's content (the file's version, §10.4): FNV-1a over its stable text. Kept per
 * object: the repository replaces an initiative with a new object on every change and never edits one in place, so only
 * an edited initiative is hashed again.
 */
export function fingerprint(initiative: Initiative): string {
  const known = fingerprints.get(initiative);
  if (known !== undefined) return known;
  let hash = 0x811c9dc5;
  for (const char of stable(initiative)) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const found = hash.toString(16);
  fingerprints.set(initiative, found);
  return found;
}

/** The record to keep for an initiative now. */
export function seenRecord(initiative: Initiative, figures: KeyFigureSnapshot, at: number): SeenRecord {
  return { at, figures, fingerprint: fingerprint(initiative) };
}

/** Whether an initiative opened before has changed since: its file or its key figures differ from what was recorded (§9.9). */
export function hasChangedSince(record: SeenRecord, initiative: Initiative, figures: KeyFigureSnapshot): boolean {
  return record.fingerprint !== fingerprint(initiative) || Object.keys(previousFigures(record, figures)).length > 0;
}

/** An opened initiative that changed since (§9.9): when it was last looked at, and its key figures now. */
export interface ChangedEntry {
  since: number;
  figures: KeyFigureSnapshot;
}

/** Every initiative with a record that has changed since, by id. */
export function changedInitiatives(
  records: ReadonlyMap<string, SeenRecord>,
  initiatives: Initiative[],
  process: PhaseDef[],
  people: Person[],
  data: RateData,
): Map<string, ChangedEntry> {
  const found = new Map<string, ChangedEntry>();
  for (const initiative of initiatives) {
    const record = records.get(initiative.id);
    if (!record) continue;
    const figures = keyFigureSnapshot(initiative, process, people, data);
    if (hasChangedSince(record, initiative, figures)) found.set(initiative.id, { since: record.at, figures });
  }
  return found;
}

/** The figures that differ from `record`, with their earlier values: the previous values the page shows struck through (§9.9). */
export function previousFigures(record: SeenRecord, figures: KeyFigureSnapshot): Partial<KeyFigureSnapshot> {
  const previous: Partial<KeyFigureSnapshot> = {};
  for (const key of Object.keys(figures) as (keyof KeyFigureSnapshot)[]) {
    if (record.figures[key] !== figures[key]) (previous as Record<string, unknown>)[key] = record.figures[key];
  }
  return previous;
}

const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The day the Portfolio line names (§9.9): "today", "yesterday", else "Tuesday 29 Sep". */
export function formatSince(at: number, now: Date): string {
  const day = new Date(at);
  const days = daysBetween(localIso(day), localIso(now));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${WEEKDAYS_EN[day.getDay()]} ${day.getDate()} ${MONTHS_SHORT_EN[day.getMonth()]}`;
}
