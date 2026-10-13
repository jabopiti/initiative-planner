import { logoUrl } from 'virtual:brand-assets';

/** The brand pack's logo (§2). Decorative: the product name beside it is its text alternative. */
export function BrandLogo({ size }: { size: number }) {
  return <img src={logoUrl} alt="" className="w-auto shrink-0" style={{ height: size }} />;
}
