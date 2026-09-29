import { SCHEMA_VERSION } from '../data/types';
import { useBrand } from '../state/BrandContext';

/** Settings' About section (§5.9): which build, schema and process this is, for reporting a problem. Read-only. */
export function AboutSection() {
  const brand = useBrand();
  const rows: [string, string][] = [
    ['Product', brand.productName],
    ['Build version', __BUILD_VERSION__],
    ['Schema version', String(SCHEMA_VERSION)],
    ['Process', `${brand.processIdentity.id}, structure version ${brand.processIdentity.structureVersion}`],
  ];
  return (
    <section aria-labelledby="about-heading">
      <h2 id="about-heading" className="m-0 mb-4 text-lg">
        About
      </h2>
      <dl className="m-0 rounded-xl border border-border-default bg-surface-card px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex border-b border-border-default py-2.5 last:border-b-0">
            <dt className="w-48 shrink-0 text-text-secondary">{label}</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
