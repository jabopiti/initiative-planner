import type { ReactNode } from 'react';
import { cn } from 'cn';

/** A page's title row (§9.8): the h1 at the display size, with the page's actions at the right. */
export function PageHeader({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex items-center justify-between gap-4', className)}>
      <h1 className="m-0 min-w-0 text-display font-medium">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A section's heading row (§9.8): the h2 at the title size, with the section's actions at the right. Sections are told apart by heading and spacing, not a box. */
export function SectionHeader({ id, title, actions, className }: { id?: string; title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-4', className)}>
      <h2 id={id} className="m-0 flex min-w-0 items-center gap-2 text-title font-medium">
        {title}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
