import { cn } from '@/lib/utils';
import { useBrand } from '../state/BrandContext';
import { ghostCardClass } from './cardClass';
import { Figure, Tile } from './CostSummary';
import { PhaseIcon } from './icons';
import { NOT_COSTED, PHASE_ROW_CLASS } from './PhasesSection';
import { BLOCK_CLASS, BLOCK_TEXT, SEGMENT_CLASS, SegmentFace } from './TimeStrip';

/**
 * Under the new-initiative draft (§5.4): greyed previews of what its page will show once created — the time strip as
 * hatched blocks, the key figures reading "—" and one row per phase. Only a picture of what is to come, so hidden from
 * screen readers and not interactive.
 */
export function DraftPreview() {
  const { process } = useBrand();
  const tiles = [
    ...(process.some((p) => p.costed) ? ['Grand estimate', 'Deviation'] : []),
    'Current phase',
    `Gate ${process[0].exitGate.label}`,
  ];

  return (
    // Greyed by colour, not opacity: the secondary text keeps its contrast (§9.5).
    <div aria-hidden="true" data-testid="draft-preview" className="pointer-events-none mt-6 text-text-secondary select-none">
      <div className="mb-4 flex gap-1 py-5">
        {process.map((phase) => (
          <div key={phase.id} className={cn(SEGMENT_CLASS, 'flex-1', BLOCK_CLASS.done)}>
            <SegmentFace label={phase.label} detail={BLOCK_TEXT[phase.costed ? 'no-period' : 'not-costed']} />
          </div>
        ))}
      </div>
      <div className="mb-6 flex gap-3">
        {tiles.map((label) => (
          <Tile key={label} label={label} ghost>
            <Figure>—</Figure>
          </Tile>
        ))}
      </div>
      <p className="m-0 mb-3 text-title">Phases</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {process.map((phase) => (
          <li key={phase.id} className={cn(ghostCardClass, PHASE_ROW_CLASS)}>
            <PhaseIcon name={phase.icon} width={16} height={16} className="shrink-0" />
            <span className="font-medium">{phase.label}</span>
            {phase.costed ? (
              <>
                <span>{BLOCK_TEXT['no-period']}</span>
                <span className="ml-auto">—</span>
              </>
            ) : (
              <span>· {NOT_COSTED}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
