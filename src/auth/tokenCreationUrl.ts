import type { GithubLocation } from '../brand/types';

/**
 * The GitHub fine-grained token creation URL, prefilled where GitHub's own
 * page supports it via query string (§5.10). `name` and `description` are
 * documented; `target_name` (resource owner) works for a personal account.
 * Expiry and the Contents Read-and-write permission have no documented
 * query-param prefill as of this build — GitHub's UI doesn't expose one —
 * so those two of the three still need a manual click even with this link
 * (see TODO.md: worth reconfirming against the live page).
 */
export function tokenCreationUrl(location: GithubLocation, productName: string): string {
  const params = new URLSearchParams({
    name: `${productName} (${location.owner}/${location.repo})`,
    description: `Read/write access to ${location.owner}/${location.repo} for ${productName}.`,
    target_name: location.owner,
  });
  const host = location.apiBaseUrl.includes('api.github.com')
    ? 'https://github.com'
    : location.apiBaseUrl.replace(/\/api\/v3\/?$/, '').replace('api.', '');
  return `${host}/settings/personal-access-tokens/new?${params.toString()}`;
}
