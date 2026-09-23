import { createContext, useContext, type ReactNode } from 'react';
import type { BrandPack } from '../brand/types';

const BrandContext = createContext<BrandPack | null>(null);

/**
 * The one place the concrete brand pack is injected (§2: a deployment's
 * brand pack is meant to be swappable). Everything that needs product name,
 * process, colours or GitHub location reads it from here via `useBrand()`
 * rather than importing `defaultBrand.ts` directly — including the Connect
 * screen, which renders before a `Repository` exists to carry it.
 */
export function BrandProvider({ brand, children }: { brand: BrandPack; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandPack {
  const brand = useContext(BrandContext);
  if (!brand) throw new Error('useBrand must be used within a BrandProvider');
  return brand;
}
