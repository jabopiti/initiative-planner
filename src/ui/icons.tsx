/**
 * Icon set (§9.10): generic icons are thin re-exports of Lucide (shadcn/ui's
 * default), sized to match the app's 18px icon convention. LogoMark is the
 * brand mark (§2), not a Tabler/Lucide glyph, so it stays hand-drawn.
 */
import { Archive, ArchiveRestore, CalendarClock, CalendarDays, ChartPie, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, ClipboardCheck, Hammer, CircleDashed, ClipboardList, Flame, Gauge, Info, Lock, Plus, RefreshCw, Rocket, Search, Trash2, TrendingUp, TriangleAlert, Unlock, User, UserCheck, UserX, Users, type LucideIcon } from 'lucide-react';
import type { SVGProps } from 'react';
import type { PhaseIconName } from '../brand/types';

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
/** The owner select's trigger icon (§5.4, §9.10). */
export const OwnerIcon = iconWrapper(User);
export const RemoveIcon = iconWrapper(Trash2);
export const DeactivateIcon = iconWrapper(UserX);
export const ReactivateIcon = iconWrapper(UserCheck);
export const DeactivateTeamIcon = iconWrapper(Archive);
export const ReactivateTeamIcon = iconWrapper(ArchiveRestore);
export const CalendarIcon = iconWrapper(CalendarDays);
export const ChevronDownIcon = iconWrapper(ChevronDown);
export const ChevronLeftIcon = iconWrapper(ChevronLeft);
export const ChevronRightIcon = iconWrapper(ChevronRight);
/** The two capacity warnings each have their own icon (§9.10): the team's share of a person, and their overall ceiling. */
export const OverTeamFteIcon = iconWrapper(ChartPie);
export const OverCapacityIcon = iconWrapper(Gauge);
/** A checklist item's three statuses (§5.4, §8.1): distinct icons, never colour alone (§9.5). */
export const IncompleteIcon = iconWrapper(Circle);
export const TentativeIcon = iconWrapper(CircleDashed);
export const CompleteIcon = iconWrapper(CircleCheck);
/** A frozen phase, and a Closed or Cancelled initiative (§9.9, §9.10). */
export const FrozenIcon = iconWrapper(Lock);
/** A locked Settings section's toggle (§2, §9.9, §9.10), and its unlocked counterpart. */
export const LockedIcon = iconWrapper(Lock);
export const UnlockedIcon = iconWrapper(Unlock);
/** The one thing worth real alarm colour (§8.1, §9.8): the phase behind the current gate running past its own estimated end date. */
export const OverrunIcon = iconWrapper(Flame);
/** Needs attention's remaining four kinds (§8.5, §9.10), distinct from Overrun's Flame and Complete's CircleCheck. */
export const EscalatedIcon = iconWrapper(TrendingUp);
export const OverdueIcon = iconWrapper(CalendarClock);
export const DueIcon = iconWrapper(ClipboardList);
export const ReadyIcon = iconWrapper(Rocket);

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

/** The icon a brand pack names for a phase (§2, §9.10). */
const PHASE_ICONS: Record<PhaseIconName, LucideIcon> = { search: Search, 'clipboard-check': ClipboardCheck, hammer: Hammer, rocket: Rocket };

export function PhaseIcon({ name, ...props }: { name: PhaseIconName } & SVGProps<SVGSVGElement>) {
  const Icon = PHASE_ICONS[name];
  return <Icon size={18} strokeWidth={2} aria-hidden="true" {...props} />;
}
