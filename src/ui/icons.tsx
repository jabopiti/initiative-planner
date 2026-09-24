/**
 * Icon set (§9.10): generic icons are thin re-exports of Lucide (shadcn/ui's
 * default), sized to match the app's 18px icon convention. LogoMark is the
 * brand mark (§2), not a Tabler/Lucide glyph, so it stays hand-drawn.
 */
import { Archive, ArchiveRestore, CalendarDays, ChartPie, Check, ChevronDown, ChevronRight, Gauge, Info, Plus, RefreshCw, Search, Trash2, TriangleAlert, UserCheck, UserX, Users, type LucideIcon } from 'lucide-react';
import type { SVGProps } from 'react';

function iconWrapper(Lucide: LucideIcon) {
  return function WrappedIcon(props: SVGProps<SVGSVGElement>) {
    return <Lucide size={18} strokeWidth={2} aria-hidden="true" {...props} />;
  };
}

export const SearchIcon = iconWrapper(Search);
export const CheckIcon = iconWrapper(Check);
export const SyncingIcon = iconWrapper(RefreshCw);
export const WarningIcon = iconWrapper(TriangleAlert);
export const InfoIcon = iconWrapper(Info);
export const PlusIcon = iconWrapper(Plus);
export const TeamsIcon = iconWrapper(Users);
export const RemoveIcon = iconWrapper(Trash2);
export const DeactivateIcon = iconWrapper(UserX);
export const ReactivateIcon = iconWrapper(UserCheck);
export const DeactivateTeamIcon = iconWrapper(Archive);
export const ReactivateTeamIcon = iconWrapper(ArchiveRestore);
export const CalendarIcon = iconWrapper(CalendarDays);
export const ChevronDownIcon = iconWrapper(ChevronDown);
export const ChevronRightIcon = iconWrapper(ChevronRight);
/** The two capacity warnings each have their own icon (§9.10): the team's share of a person, and their overall ceiling. */
export const OverTeamFteIcon = iconWrapper(ChartPie);
export const OverCapacityIcon = iconWrapper(Gauge);

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
