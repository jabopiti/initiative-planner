import { grandEstimate, resolveApprovalTrack } from '../data/cost';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The live approval track for the initiative's grand estimate (§5.4, §7.4): an outline badge with the track's
 * abbreviation and name ("E Elevated", §9.10), with its requirement text as the tooltip. A total no band covers reads
 * "No approval track" in a dashed outline with no letter and no tooltip, since that is a statement about band
 * configuration, not something to hover for more detail. Neutral, unlike status's glyph beside it — §9.8's colour
 * roles are a closed set and this fits none of them, so giving it its own colour would be decoration.
 */
export function ApprovalTrackBadge({ initiative }: { initiative: Initiative }) {
  const { process, approvalTracks } = useBrand();
  const { people, roles, countries } = useRepositoryState();
  const total = grandEstimate(initiative, process, people, { roles, countries });
  const track = resolveApprovalTrack(approvalTracks, total);

  if (!track)
    return (
      <Badge variant="outline" className="border-dashed font-normal text-text-secondary">
        No approval track
      </Badge>
    );
  const badge = (
    <Badge variant="outline">
      {track.abbreviation} <span className="font-normal">{track.name}</span>
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{track.requirementText}</TooltipContent>
    </Tooltip>
  );
}
