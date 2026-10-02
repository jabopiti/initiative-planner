import { describe, expect, it } from 'vitest';
import { GithubApiError, shortCause, toReadOnlyState } from './errors';

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
