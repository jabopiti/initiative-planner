import { describe, expect, it } from 'vitest';
import { classifyFailure, GithubApiError, shortCause, toReadOnlyState } from './errors';

describe('toReadOnlyState (§3 Sync failures)', () => {
  it('says what §3 says for an access failure, whatever the API returned', () => {
    const error = new GithubApiError('PUT people.json failed (403)', 'access-denied', 403);
    expect(toReadOnlyState(error, 'fallback')).toEqual({
      cause: 'access-denied',
      message: 'GitHub refused access with this token',
    });
  });

  it('says what §3 says when GitHub is limiting requests', () => {
    const error = new GithubApiError('PUT teams.json failed (429)', 'rate-limited', 429);
    expect(toReadOnlyState(error, 'fallback').message).toBe('GitHub is limiting requests; try again shortly');
  });

  it('keeps the unreachable message the client already words, and the API message for a cause §3 has no wording for', () => {
    expect(toReadOnlyState(new GithubApiError('Cannot reach GitHub; changes are paused.', 'unreachable'), 'fallback').message).toBe(
      'Cannot reach GitHub; changes are paused.',
    );
    expect(toReadOnlyState(new GithubApiError('PUT teams.json failed (500)', 'unknown', 500), 'fallback').message).toBe(
      'PUT teams.json failed (500)',
    );
  });

  it('uses the fallback for a failure that did not come from GitHub', () => {
    expect(toReadOnlyState(new Error('boom'), 'Could not save.')).toEqual({ cause: 'unknown', message: 'Could not save.' });
  });
});

describe('shortCause (§5.1 sync indicator)', () => {
  it.each([
    ['unreachable', 'Cannot reach GitHub'],
    ['rate-limited', 'Rate limited'],
    ['access-denied', 'Access denied'],
    ['dataset-newer', 'Dataset newer than this build'],
    ['process-mismatch', 'Different process build'],
    ['conflict', 'Cannot save'],
    ['not-found', 'Cannot save'],
    ['unknown', 'Cannot save'],
  ] as const)('names %s as "%s"', (cause, label) => {
    expect(shortCause({ cause, message: 'long sentence' })).toBe(label);
  });
});

describe('classifyFailure (§3 Sync failures, slice 043)', () => {
  const headers = (init: HeadersInit = {}) => new Headers(init);

  it.each([
    ['no requests left', headers({ 'x-ratelimit-remaining': '0' }), ''],
    ['a retry-after', headers({ 'retry-after': '60' }), ''],
    ['a body naming a rate limit', headers(), '{"message":"You have exceeded a secondary rate limit."}'],
  ])('reads a 403 with %s as rate-limited', (_, h, body) => {
    expect(classifyFailure(403, h, body)).toBe('rate-limited');
  });

  it('reads a 429 as rate-limited', () => {
    expect(classifyFailure(429, headers(), '')).toBe('rate-limited');
  });

  it('keeps a plain 403, and a 401, as access-denied', () => {
    expect(classifyFailure(403, headers({ 'x-ratelimit-remaining': '4990' }), '{"message":"Resource not accessible by personal access token"}')).toBe(
      'access-denied',
    );
    expect(classifyFailure(401, headers(), '')).toBe('access-denied');
  });

  it('keeps a 403 whose message names a permission as access-denied, even when it spent the last request', () => {
    const body = '{"message":"Resource not accessible by personal access token"}';
    expect(classifyFailure(403, headers({ 'x-ratelimit-remaining': '0' }), body)).toBe('access-denied');
  });

  it.each([500, 502, 503])('reads %i as unreachable', (status) => {
    expect(classifyFailure(status, headers(), '')).toBe('unreachable');
  });

  it('keeps 404, 409 and other statuses as before', () => {
    expect(classifyFailure(404, headers(), '')).toBe('not-found');
    expect(classifyFailure(409, headers(), '')).toBe('conflict');
    expect(classifyFailure(422, headers(), '')).toBe('unknown');
  });

  it('words a server error as §3 words unreachable, not as the failed request', () => {
    expect(toReadOnlyState(new GithubApiError('PUT teams.json failed (503)', 'unreachable', 503), 'fallback').message).toBe(
      'Cannot reach GitHub; changes are paused.',
    );
  });
});
