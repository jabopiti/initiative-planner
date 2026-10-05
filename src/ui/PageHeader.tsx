import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A page's title row (§9.8): the h1 at the display size, with the page's actions at the right. */
export function PageHeader({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex items-center justify-between gap-4', className)}>
      <h1 className="m-0 flex min-w-0 items-center gap-2 text-display">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A section's heading row (§9.8): the h2 at the title size, an optional `tag` beside it (outside the heading, so not
 * part of the section's name), and the section's actions at the right. Sections are told apart by heading and spacing, not a box.
 */
export function SectionHeader({ id, title, tag, actions }: { id?: string; title: ReactNode; tag?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <h2 id={id} className="m-0 flex min-w-0 items-center gap-2 text-title">
          {title}
        </h2>
        {tag}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
