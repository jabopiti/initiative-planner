import { cn } from '@/lib/utils';
import { useBrand } from '../state/BrandContext';
import { Figure, Tile } from './CostSummary';
import { PhaseIcon } from './icons';
import { BLOCK_CLASS, BLOCK_TEXT } from './TimeStrip';

/**
 * Under the new-initiative draft (§5.4): greyed previews of what its page will show once created — the time strip as
 * hatched blocks, the key figures reading "—" and one row per phase. Only a picture of what is to come, so hidden from
 * screen readers and not interactive.
 */
// A flat, dashed outline in place of a raised card, so the preview never passes for the page itself.
const GHOST = 'rounded-card border border-dashed border-border-input bg-transparent shadow-none';

export function DraftPreview() {
  const { process } = useBrand();
  const phaseText = (costed: boolean) => (costed ? BLOCK_TEXT['no-period'] : BLOCK_TEXT['not-costed']);

  return (
    // Greyed by colour, not opacity: the secondary text keeps its contrast (§9.5).
    <div aria-hidden="true" data-testid="draft-preview" className="pointer-events-none mt-6 text-text-secondary select-none">
      <div className="mb-4 flex gap-1 py-5">
        {process.map((phase) => (
          <div key={phase.id} className={cn('flex h-12 min-w-0 flex-1 flex-col justify-center rounded-md border px-2', BLOCK_CLASS.done)}>
            <span className="truncate text-caption font-medium">{phase.label}</span>
            <span className="truncate text-label">{phaseText(phase.costed)}</span>
          </div>
        ))}
      </div>
      <div className="mb-6 flex gap-3">
        {process.some((p) => p.costed) && (
          <>
            <Tile label="Grand estimate" className={GHOST}>
              <Figure>—</Figure>
            </Tile>
            <Tile label="Deviation" className={GHOST}>
              <Figure>—</Figure>
            </Tile>
          </>
        )}
        <Tile label="Current phase" className={GHOST}>
          <Figure>—</Figure>
        </Tile>
        <Tile label={`Gate ${process[0].exitGate.label}`} className={GHOST}>
          <Figure>—</Figure>
        </Tile>
      </div>
      <p className="m-0 mb-3 text-title">Phases</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {process.map((phase) => (
          <li key={phase.id} className={cn(GHOST, 'flex items-center gap-2 px-3 py-2.5 text-body')}>
            <PhaseIcon name={phase.icon} width={16} height={16} className="shrink-0" />
            <span className="flex-1 font-medium">{phase.label}</span>
            <span className="text-caption">{phase.costed ? `${phaseText(true)} · —` : phaseText(false)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
