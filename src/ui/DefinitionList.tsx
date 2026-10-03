import type { ReactNode } from 'react';

/** A bordered card of label / value rows (Settings → Connection and About, §5.9). */
export function DefinitionList({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="m-0 rounded-card bg-surface-card shadow-card px-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex border-b border-border-default py-2.5 last:border-b-0">
          <dt className="w-48 shrink-0 text-text-secondary">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
