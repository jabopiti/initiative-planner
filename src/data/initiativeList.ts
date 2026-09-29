import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { grandEstimate, resolveApprovalTrack, type RateData } from './cost';
import { KIND_ORDER, type NeedsAttentionItem } from './needsAttention';
import { currentPhaseId } from './processState';
import type { Initiative, Person, Team } from './types';

/** The Owner filter's choice for initiatives without an owner, and the Approval track filter's for a total no band covers. */
export const NONE = 'none';

export interface InitiativeRow {
  initiative: Initiative;
  teamName: string;
  ownerName: string;
  phaseId: string;
  phaseLabel: string;
  total: number;
  trackId: string;
  trackName: string;
  trackSeverity: number;
  attention: NeedsAttentionItem | null;
}

/** An owner as a table shows them (§5.4, §9.3): "(inactive)" once deactivated, a dash for none. */
export function ownerLabel(ownerId: string | undefined, people: Person[]): string {
  if (!ownerId) return '—';
  const owner = people.find((p) => p.id === ownerId);
  if (!owner) return 'Unknown person';
  return owner.active ? owner.name : `${owner.name} (inactive)`;
}

/** One row per initiative, whatever its status (§5.3). A Closed initiative's current phase is its final one. */
export function initiativeRows(
  initiatives: Initiative[],
  teams: Team[],
  people: Person[],
  process: PhaseDef[],
  approvalTracks: ApprovalTrackDef[],
  data: RateData,
  attention: NeedsAttentionItem[],
): InitiativeRow[] {
  const attentionById = new Map(attention.map((item) => [item.initiativeId, item]));
  return initiatives.map((initiative) => {
    const phaseId = currentPhaseId(initiative, process);
    const total = grandEstimate(initiative, process, people, data);
    const track = resolveApprovalTrack(approvalTracks, total);
    return {
      initiative,
      teamName: teams.find((t) => t.id === initiative.teamId)?.name ?? 'Unknown team',
      ownerName: ownerLabel(initiative.ownerId, people),
      phaseId,
      phaseLabel: process.find((p) => p.id === phaseId)?.label ?? phaseId,
      total,
      trackId: track?.id ?? NONE,
      trackName: track?.name ?? 'No approval track',
      trackSeverity: track?.severity ?? 0,
      attention: attentionById.get(initiative.id) ?? null,
    };
  });
}

export interface InitiativeFilters {
  team: string[];
  owner: string[];
  phase: string[];
  track: string[];
  status: string[];
}

export const NO_FILTERS: InitiativeFilters = { team: [], owner: [], phase: [], track: [], status: [] };

export function activeFilterCount(filters: InitiativeFilters): number {
  return Object.values(filters).filter((v) => v.length > 0).length;
}

/** AND across the five filters, OR within one (§9.11); an empty filter matches everything. */
export function filterRows(rows: InitiativeRow[], f: InitiativeFilters): InitiativeRow[] {
  const ok = (chosen: string[], value: string) => chosen.length === 0 || chosen.includes(value);
  return rows.filter(
    (r) =>
      ok(f.team, r.initiative.teamId) &&
      ok(f.owner, r.initiative.ownerId ?? NONE) &&
      ok(f.phase, r.phaseId) &&
      ok(f.track, r.trackId) &&
      ok(f.status, r.initiative.status),
  );
}

/** Position in §8.5's priority order; no item sorts after every kind. */
export const attentionRank = (r: InitiativeRow): number => (r.attention ? KIND_ORDER.indexOf(r.attention.kind) : KIND_ORDER.length);
