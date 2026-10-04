import type { ReactNode } from 'react';
import { cn } from 'cn';
import { PageHeader } from './PageHeader';

/** The page container (§9.8): centred, at most 1280 px, 32 px gutters. The top bar's content uses it too, so the two line up. */
export const pageContainerClass = 'mx-auto w-full max-w-page px-8';

/**
 * The page shell (§9.8): every screen sits in one centred container, with its title row when it has a title. The
 * initiative page and its draft are one centred column of at most 960 px instead (§5.4) — `width="detail"` keeps
 * the same 32 px gutters around it.
 */
export function Page({ title, actions, width = 'page', className, children }: { title?: ReactNode; actions?: ReactNode; width?: 'page' | 'detail'; className?: string; children: ReactNode }) {
  return (
    <div className={cn(pageContainerClass, width === 'detail' && 'max-w-[calc(var(--container-detail)+4rem)]', 'py-6', className)}>
      {title !== undefined && <PageHeader title={title} actions={actions} />}
      {children}
    </div>
  );
}

/**
 * A screen's toolbar row (§9.8): its filters at the left; the count, Clear filters and Copy table at the right (§9.2).
 * The right side stays at the right end with or without filters.
 */
export function Toolbar({ filters, children, className }: { filters?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {children && <div className="ml-auto flex items-center gap-3 text-text-secondary">{children}</div>}
    </div>
  );
}

/** Clear filters (§9.11): the same text button wherever filters can be cleared. */
export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-brand-accent-text underline" onClick={onClick}>
      Clear filters
    </button>
  );
}
