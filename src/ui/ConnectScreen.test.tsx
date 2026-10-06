import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { ConnectScreen } from './ConnectScreen';

const origin = vi.hoisted(() => ({ shared: false }));
vi.mock('../auth/sharedOrigin', () => ({ isSharedOrigin: () => origin.shared }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  origin.shared = false;
});

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function renderConnectScreen(onConnected: (token: string, remember: boolean, login: string) => void = vi.fn()) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <ConnectScreen onConnected={onConnected} />
    </BrandProvider>,
  );
}

async function submitToken(token = 'a-token') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('GitHub token'), token);
  await user.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('ConnectScreen — checked-token outcomes (§5.10)', () => {
  it('a working token shows "Connected as <user>" and calls onConnected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/user')) return jsonResponse({ login: 'bo' });
        return jsonResponse({ permissions: { push: true } });
      }),
    );
    const onConnected = vi.fn();
    renderConnectScreen(onConnected);

    await submitToken('a-real-token');

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Connected as bo');
    expect(onConnected).toHaveBeenCalledWith('a-real-token', false, 'bo', false);
  });

  it('a pasted token is checked without pressing Connect, with the Remember me choice as it stands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/user') ? jsonResponse({ login: 'bo' }) : jsonResponse({ permissions: { push: true } }))),
    );
    const onConnected = vi.fn();
    renderConnectScreen(onConnected);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Remember me on this device' }));

    await user.click(screen.getByLabelText('GitHub token'));
    await user.paste('pasted-token');

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith('pasted-token', true, 'bo', false));
  });

  it('a classic token connects and tells the app to raise the warning', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/user')
          ? jsonResponse({ login: 'bo' }, 200, { 'X-OAuth-Scopes': 'repo' })
          : jsonResponse({ permissions: { push: true } }),
      ),
    );
    const onConnected = vi.fn();
    renderConnectScreen(onConnected);

    await submitToken('classic-token');

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith('classic-token', false, 'bo', true));
  });

  it('a token that cannot see the repository names it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/user') ? jsonResponse({ login: 'bo' }) : jsonResponse({ message: 'Not Found' }, 404))));
    renderConnectScreen();

    await submitToken();

    const repo = `${defaultBrandPack.github.owner}/${defaultBrandPack.github.repo}`;
    expect((await screen.findByRole('alert')).textContent).toBe(`This token can't see ${repo}. Create it with access to that repository.`);
  });

  it('a 401 shows "GitHub doesn\'t accept this token." as an alert, in the alarm styling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Bad credentials' }, 401)));
    renderConnectScreen();

    await submitToken();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("GitHub doesn't accept this token. It has probably expired or been revoked");
    expect(within(alert).getByRole('link', { name: /Create a new token/ })).toBeInTheDocument();
    expect(alert.className).toContain('bg-alarm-tint');
  });

  it('a network failure shows the unreachable message as an alert, in the warning styling, and keeps the token and Connect usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    renderConnectScreen();

    await submitToken('a-token');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't reach GitHub to check the token. Check your connection and try again.");
    expect(alert.className).toContain('bg-warning-tint');
    expect(screen.getByLabelText('GitHub token')).toHaveValue('a-token');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('a 502 on the token check shows the same unreachable message, not a rejected-token message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Bad Gateway' }, 502)));
    renderConnectScreen();

    await submitToken();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't reach GitHub to check the token. Check your connection and try again.");
  });

  it('a rate-limited token check says GitHub is limiting requests, in the warning styling, and keeps the token (slice 043)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'You have exceeded a secondary rate limit.' }, 403)));
    renderConnectScreen();

    await submitToken('a-token');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('GitHub is limiting requests; try again shortly.');
    expect(alert.className).toContain('bg-warning-tint');
    expect(screen.getByLabelText('GitHub token')).toHaveValue('a-token');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });
});

describe('ConnectScreen — Remember me on a shared origin (§3, §5.10)', () => {
  it('on its own origin, Remember me is offered and the card says the browser keeps it unencrypted', () => {
    renderConnectScreen();

    expect(screen.getByRole('checkbox', { name: 'Remember me on this device' })).toBeEnabled();
    expect(screen.queryByText(/Not available here/)).toBeNull();
    expect(screen.getByText(/The browser keeps it unencrypted/)).toBeInTheDocument();
  });

  it('on github.io, Remember me is disabled with the reason, and the card explains why', () => {
    origin.shared = true;
    renderConnectScreen();

    const checkbox = screen.getByRole('checkbox', { name: 'Remember me on this device' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAccessibleDescription(
      "Not available here: this copy runs on github.io, where other sites can read what it saves. It’s kept for this tab only.",
    );
    expect(screen.getByText('Why there is no Remember me here.')).toBeInTheDocument();
    expect(screen.queryByText(/The browser keeps it unencrypted/)).toBeNull();
    expect(screen.queryByText(/unless you tick/)).toBeNull();
  });
});
