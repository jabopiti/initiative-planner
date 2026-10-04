import type { ReactNode } from 'react';
import { cn } from 'cn';

/** The page shell (§9.8): every screen sits in one centred container of at most 1280 px with 32 px gutters. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-page px-8 py-6', className)}>{children}</div>;
}

/**
 * A screen's toolbar row (§9.8): its filters at the left; the count, Clear filters and Copy table at the right (§9.2).
 * Either side may be empty; the right side stays at the right end.
 */
export function Toolbar({ filters, children, className }: { filters?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      {children && <div className="ml-auto flex items-center gap-3 text-text-secondary">{children}</div>}
    </div>
  );
}
