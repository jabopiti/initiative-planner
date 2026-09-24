import type { ComponentType, ReactNode, SVGProps } from 'react';
import { WarningIcon } from './icons';

/** A warning that sits beside what caused it and never blocks (§9.7): tinted, with the warning icon (or a more specific one), announced politely. */
export function InlineWarning({ icon: Icon = WarningIcon, className = '', children }: { icon?: ComponentType<SVGProps<SVGSVGElement>>; className?: string; children: ReactNode }) {
  return (
    <p
      className={`m-0 flex items-center gap-1 rounded-md bg-warning-tint px-2 py-1 text-xs text-warning-text ${className}`}
      role="status"
    >
      <Icon width={14} height={14} />
      {children}
    </p>
  );
}
