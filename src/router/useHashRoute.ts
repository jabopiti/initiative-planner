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

/** `replace` swaps the current history entry, so Back skips a page that has served its purpose (a draft). */
export function navigate(path: string, options?: { replace?: boolean }): void {
  if (options?.replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
}
