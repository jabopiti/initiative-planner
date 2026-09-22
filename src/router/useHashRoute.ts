import { useEffect, useState } from 'react';

/** Hash routes (§10.6): GitHub Pages serves no fallback page for other paths. */
export function normalizeHash(hash: string): string {
  const path = hash.replace(/^#/, '');
  return path || '/portfolio';
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => normalizeHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(normalizeHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
