import { grandEstimate, resolveApprovalTrack } from '../data/cost';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The live approval track for the initiative's grand estimate (§5.4, §7.4): the track's name, with its
 * requirement text as the tooltip. A total no band covers reads "No approval track" with no tooltip, since
 * that is a statement about band configuration, not something to hover for more detail. A neutral pill,
 * matching the status badge beside it — §9.8's colour roles are a closed set and this fits none of them, so
 * giving it its own colour would be decoration, which §9.8 forbids.
 */
export function ApprovalTrackBadge({ initiative }: { initiative: Initiative }) {
  const { process, approvalTracks } = useBrand();
  const { people, roles, countries } = useRepositoryState();
  const total = grandEstimate(initiative, process, people, { roles, countries });
  const track = resolveApprovalTrack(approvalTracks, total);

  const badge = <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-caption">{track ? track.name : 'No approval track'}</span>;
  if (!track) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{track.requirementText}</TooltipContent>
    </Tooltip>
  );
}
