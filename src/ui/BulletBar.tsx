import { useMemo } from 'react';
import { bulletBands, bulletScaleMax, scalePct } from '../data/keyFigures';
import { useBrand } from '../state/BrandContext';

/** Heights of the band track and the estimate bar, and the clipped end mark's size, per bar size. */
const SIZE = {
  tile: { track: 'h-4.5', bar: 'h-1.5', mark: 'border-y-[5px] border-l-[5px]' },
  card: { track: 'h-2.5', bar: 'h-1', mark: 'border-y-[4px] border-l-[4px]' },
};
/** The estimate bar and its end mark: neutral, or Warning while escalated (§9.8). */
const TONE = {
  neutral: { bar: 'bg-text-muted', mark: 'border-l-text-muted' },
  escalated: { bar: 'bg-warning', mark: 'border-l-warning' },
};

/**
 * The grand estimate against the approval tracks (§5.2, §5.4): each track's band shaded as a range (lightest first,
 * the open top band fading out, a gap left unshaded), the estimate as a bar, the approved-at figure as a tick and the
 * recorded actuals to date as a thinner inner bar. Every bar shares one scale, twice the highest finite band bound,
 * so lengths compare; a bar past the end is clipped with an end mark. In Warning while escalated (§9.8). The figure
 * is always shown as text beside it (§9.5), so the miniature on a card is hidden from assistive technology and the
 * tile's carries its own label.
 */
export function BulletBar({
  estimate,
  approved,
  actuals = 0,
  escalated = false,
  size,
  label,
}: {
  estimate: number;
  approved?: number;
  actuals?: number;
  escalated?: boolean;
  /** `tile`: the Grand estimate key figure; `card`: the miniature on a board card. */
  size: 'tile' | 'card';
  /** The tile's accessible name; the card's bar has none. */
  label?: string;
}) {
  const { approvalTracks } = useBrand();
  // The scale and bands depend on the brand pack's tracks alone, not on this bar's figures.
  const scale = useMemo(() => {
    const max = bulletScaleMax(approvalTracks);
    return max === null ? null : { max, bands: bulletBands(approvalTracks, max).map((band) => ({ ...band, left: scalePct(band.from, max), right: scalePct(band.to, max) })) };
  }, [approvalTracks]);
  if (scale === null) return null;
  const { max, bands } = scale;
  const dims = SIZE[size];
  const tone = escalated ? TONE.escalated : TONE.neutral;

  return (
    <div
      className={`relative w-full ${dims.track}`}
      data-testid="bullet-bar"
      data-escalated={escalated || undefined}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {bands.map((band, index) => (
        <div
          key={band.trackId}
          data-testid="bullet-band"
          className="absolute inset-y-0"
          style={{
            left: `${band.left}%`,
            width: `${band.right - band.left}%`,
            // Neutral shades, a step darker per band (§9.8: the tracks carry no colour role).
            backgroundColor: `color-mix(in oklab, var(--text-muted) ${12 + (bands.length > 1 ? (index * 26) / (bands.length - 1) : 0)}%, var(--surface-card))`,
            maskImage: band.open ? 'linear-gradient(90deg, #000 70%, transparent)' : undefined,
          }}
        />
      ))}
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 ${dims.bar}`}>
        <div data-testid="bullet-estimate" className={`h-full rounded-[1px] ${tone.bar}`} style={{ width: `${scalePct(estimate, max)}%` }} />
        {actuals > 0 && (
          <div data-testid="bullet-actuals" className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-text-primary" style={{ width: `${scalePct(actuals, max)}%` }} />
        )}
      </div>
      {approved !== undefined && (
        <div data-testid="bullet-approved" className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-text-primary" style={{ left: `${scalePct(approved, max)}%` }} />
      )}
      {estimate > max && (
        <div
          data-testid="bullet-clipped"
          className={`absolute top-1/2 left-full -translate-y-1/2 border-y-transparent ${tone.mark} ${dims.mark}`}
        />
      )}
    </div>
  );
}
