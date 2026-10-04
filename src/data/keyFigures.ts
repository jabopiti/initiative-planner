import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { lastCostedPassedGate } from './gate';
import type { Initiative, RecordedApprovalTrack } from './types';

/** One shaded range of a bullet bar: an approval track's band, its open top end cut at the scale's end. */
export interface BulletBand {
  trackId: string;
  from: number;
  to: number;
  /** The band has no upper bound in the brand pack, so it fades out at the scale's end rather than stopping there. */
  open: boolean;
}

/**
 * The end of every bullet bar's scale (§5.2, §5.4): twice the highest finite bound in the approval tracks (€400k for
 * bands ending at €200k), the same on every bar so lengths compare. Bounds of 0 don't count; a pack with no finite
 * bound above 0 has no scale to draw against and gets `null`.
 */
export function bulletScaleMax(tracks: ApprovalTrackDef[]): number | null {
  const bounds = tracks.flatMap((t) => [t.lowerBound, t.upperBound ?? 0]).filter((b) => b > 0);
  return bounds.length === 0 ? null : 2 * Math.max(...bounds);
}

/** The bands to shade, lowest first, cut at the scale's end; a gap between two bands is simply not covered (§7.4). */
export function bulletBands(tracks: ApprovalTrackDef[], max: number): BulletBand[] {
  return [...tracks]
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .filter((t) => t.lowerBound < max)
    .map((t) => ({ trackId: t.id, from: t.lowerBound, to: Math.min(t.upperBound ?? max, max), open: t.upperBound === undefined }));
}

/** A figure's position on the scale as a percentage, clamped to 0–100. */
export const scalePct = (value: number, max: number): number => Math.min(100, Math.max(0, (value / max) * 100));

/** Every recorded actual (§7.3) across the initiative's costed phases: their sum (the bullet bar's inner bar) and how many months they cover. */
export function recordedActuals(initiative: Initiative, process: PhaseDef[]): { total: number; months: number } {
  let total = 0;
  let months = 0;
  for (const phase of process) {
    if (!phase.costed) continue;
    for (const value of Object.values(initiative.phases?.[phase.id]?.actualMonths ?? {})) {
      total += value;
      months += 1;
    }
  }
  return { total, months };
}

/**
 * Escalated (§7.4, §8.5): the live approval track — the one the grand estimate now falls in — is stricter than the
 * one recorded at the last passed gate that carried cost. `null` with no such baseline yet, when no band covers the
 * live total, or when the baseline itself carries no recorded track (a gap in the bands at the time it passed) — none
 * of these give a severity to compare.
 */
export function escalation(
  initiative: Initiative,
  process: PhaseDef[],
  live: ApprovalTrackDef | null,
): { live: ApprovalTrackDef; baseline: RecordedApprovalTrack } | null {
  const baseline = lastCostedPassedGate(process, initiative)?.record.recordedApprovalTrack;
  return baseline && live && live.severity > baseline.severity ? { live, baseline } : null;
}
