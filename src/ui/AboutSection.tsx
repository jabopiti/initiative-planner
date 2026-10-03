import { SCHEMA_VERSION } from '../data/types';
import { useBrand } from '../state/BrandContext';
import { DefinitionList } from './DefinitionList';

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
      <h2 id="about-heading" className="m-0 mb-4 text-title font-medium">
        About
      </h2>
      <DefinitionList rows={rows} />
    </section>
  );
}
