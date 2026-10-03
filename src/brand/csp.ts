/**
 * The production Content-Security-Policy (§10.1, §10.9). `connect-src` names the brand pack's GitHub API host and
 * nothing else, so a fork on GitHub Enterprise (its own `apiBaseUrl`) is not blocked and `api.github.com` is not
 * allowed where it isn't used.
 */
export function buildCsp(apiBaseUrl: string): string {
  const apiOrigin = new URL(apiBaseUrl).origin;
  return (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
    `connect-src 'self' ${apiOrigin}; base-uri 'self'; form-action 'self'; object-src 'none'; ` +
    "frame-ancestors 'self'"
  );
}
