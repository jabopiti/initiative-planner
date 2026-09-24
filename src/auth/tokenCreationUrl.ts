import type { GithubLocation } from '../brand/types';

/** GitHub rejects a token name of 40 characters or more. */
const MAX_TOKEN_NAME_LENGTH = 39;

function tokenName(location: GithubLocation, productName: string): string {
  const withRepo = `${productName} (${location.repo})`;
  const name = withRepo.length <= MAX_TOKEN_NAME_LENGTH ? withRepo : productName;
  return name.slice(0, MAX_TOKEN_NAME_LENGTH);
}

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
    name: tokenName(location, productName),
    description: `Read/write access to ${location.owner}/${location.repo} for ${productName}.`,
    target_name: location.owner,
  });
  return `${githubWebHost(location)}/settings/personal-access-tokens/new?${params.toString()}`;
}

/** Where the user lists, edits and revokes their fine-grained tokens. */
export function tokenManagementUrl(location: GithubLocation): string {
  return `${githubWebHost(location)}/settings/personal-access-tokens`;
}

function githubWebHost(location: GithubLocation): string {
  return location.apiBaseUrl.includes('api.github.com')
    ? 'https://github.com'
    : location.apiBaseUrl.replace(/\/api\/v3\/?$/, '').replace('api.', '');
}
