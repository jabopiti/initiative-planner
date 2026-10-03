/**
 * Icon set (§9.10): generic icons are thin re-exports of Lucide (shadcn/ui's
 * default), sized to match the app's 18px icon convention. LogoMark is the
 * brand mark (§2), not a Tabler/Lucide glyph, so it stays hand-drawn.
 */
import { Archive, ArchiveRestore, Ban, CalendarClock, CalendarDays, ChartPie, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, Copy, CirclePause, CircleX, ClipboardCheck, Hammer, CircleDashed, ClipboardList, Flame, Ellipsis, Gauge, Info, Lock, Pause, Play, Plus, RefreshCw, Rocket, RotateCcw, Search, SkipForward, Trash2, TrendingUp, TriangleAlert, Unlock, User, UserCheck, UserX, Users, X, type LucideIcon } from 'lucide-react';
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
export const DismissIcon = iconWrapper(X);
export const DuplicateIcon = iconWrapper(Copy);
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
/** A phase whose exit gate was skipped (§8.2): it stays editable, so it carries no lock. */
export const SkippedIcon = iconWrapper(SkipForward);
/** A locked Settings section's toggle (§2, §9.9, §9.10), and its unlocked counterpart. */
export const LockedIcon = iconWrapper(Lock);
export const UnlockedIcon = iconWrapper(Unlock);
/** On Hold (§8.4, §9.10): the status chip, the Put on hold action and the magic bar's on-hold line; Resume is its counterpart. */
export const OnHoldIcon = iconWrapper(Pause);
export const ResumeIcon = iconWrapper(Play);
/** Cancelled (§8.4, §9.10): the status chip and the Cancel action; Reopen is its way back (also a gate's reopen, §8.3). */
export const CancelledIcon = iconWrapper(Ban);
export const ReopenIcon = iconWrapper(RotateCcw);
/** A non-Active status on a Portfolio card (§5.2, §9.10): one circled icon per status. */
export const StatusOnHoldIcon = iconWrapper(CirclePause);
export const StatusCancelledIcon = iconWrapper(CircleX);
export const StatusClosedIcon = iconWrapper(CircleCheck);
/** The header's Actions menu button (§5.4). */
export const ActionsIcon = iconWrapper(Ellipsis);
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
const PHASE_ICONS: Record<PhaseIconName, ReturnType<typeof iconWrapper>> = {
  search: iconWrapper(Search),
  'clipboard-check': iconWrapper(ClipboardCheck),
  hammer: iconWrapper(Hammer),
  rocket: iconWrapper(Rocket),
};

export function PhaseIcon({ name, ...props }: { name: PhaseIconName } & SVGProps<SVGSVGElement>) {
  const Icon = PHASE_ICONS[name];
  return <Icon {...props} />;
}
