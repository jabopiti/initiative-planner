import { describe, expect, it } from 'vitest';
import type { ApprovalTrackDef } from '../brand/types';
import { defaultBrandPack } from '../brand/defaultBrand';
import { bulletBands, bulletScaleMax, recordedActuals, scalePct } from './keyFigures';
import type { Initiative } from './types';

const track = (id: string, lowerBound: number, upperBound?: number): ApprovalTrackDef => ({ id, name: id, abbreviation: id[0], lowerBound, upperBound, severity: lowerBound, requirementText: '' });

describe('bullet bar scale (§5.2, §5.4)', () => {
  it('ends at twice the highest finite bound, the same for every bar', () => {
    expect(bulletScaleMax(defaultBrandPack.approvalTracks)).toBe(400_000);
  });

  it('has no scale without a finite bound above 0', () => {
    expect(bulletScaleMax([track('all', 0)])).toBeNull();
  });

  it('shades each band lowest first, cuts the open top band at the end and leaves a gap unshaded', () => {
    const bands = bulletBands([track('high', 300_000), track('low', 0, 100_000), track('mid', 150_000, 300_000)], 600_000);
    expect(bands).toEqual([
      { trackId: 'low', from: 0, to: 100_000, open: false },
      { trackId: 'mid', from: 150_000, to: 300_000, open: false },
      { trackId: 'high', from: 300_000, to: 600_000, open: true },
    ]);
  });

  it('clamps a figure past the end to 100%', () => {
    expect(scalePct(612_000, 400_000)).toBe(100);
    expect(scalePct(100_000, 400_000)).toBe(25);
  });
});

describe('recordedActuals (§7.3)', () => {
  it('sums every recorded actual over the costed phases and counts their months', () => {
    const initiative = {
      phases: { development: { actualMonths: { '2026-10': 40_000, '2026-11': 38_000 } }, validation: { actualMonths: { '2026-09': 12_000 } }, discovery: { actualMonths: { '2026-06': 999 } } },
    } as unknown as Initiative;
    const process = defaultBrandPack.process.map((p) => (p.id === 'discovery' ? { ...p, costed: false } : p));
    expect(recordedActuals(initiative, process)).toEqual({ total: 90_000, months: 3 });
  });
});
