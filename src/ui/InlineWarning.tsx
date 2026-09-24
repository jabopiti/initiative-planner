import type { ReactNode } from 'react';
import { WarningIcon } from './icons';

/** A warning that sits beside what caused it and never blocks (§9.7): tinted, with the warning icon, announced politely. */
export function InlineWarning({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <p
      className={`m-0 flex items-center gap-1 rounded-md bg-warning-tint px-2 py-1 text-xs text-warning-text ${className}`}
      role="status"
    >
      <WarningIcon width={14} height={14} />
      {children}
    </p>
  );
}
