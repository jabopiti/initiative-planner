import type { ComponentType, SVGProps } from 'react';
import type { InitiativeStatus } from '../data/types';
import { StatusActiveIcon, StatusCancelledIcon, StatusClosedIcon, StatusOnHoldIcon } from './icons';

/** Each status's glyph (§9.10), the same on cards, in the header, in tables and in search. */
export const STATUS_GLYPH: Record<InitiativeStatus, ComponentType<SVGProps<SVGSVGElement>>> = {
  Active: StatusActiveIcon,
  'On Hold': StatusOnHoldIcon,
  Cancelled: StatusCancelledIcon,
  Closed: StatusClosedIcon,
};

/** A status as the UI writes it: sentence case ("On hold"); the stored value keeps its own spelling (§6). */
export function statusText(status: InitiativeStatus): string {
  return status === 'On Hold' ? 'On hold' : status;
}

/** Status as a neutral glyph plus its name (§9.8, §9.10): never a coloured badge, so colour stays for meaning. */
export function StatusLabel({ status, className = '' }: { status: InitiativeStatus; className?: string }) {
  const Glyph = STATUS_GLYPH[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-text-secondary ${className}`}>
      <Glyph width={14} height={14} />
      {statusText(status)}
    </span>
  );
}
