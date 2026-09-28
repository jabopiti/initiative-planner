import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { ConnectScreen } from './ConnectScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function renderConnectScreen(onConnected: (token: string, remember: boolean) => void = vi.fn()) {
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
    expect(onConnected).toHaveBeenCalledWith('a-real-token', false);
  });

  it('a 401 shows "GitHub doesn\'t accept this token." as an alert, in the alarm styling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Bad credentials' }, 401)));
    renderConnectScreen();

    await submitToken();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("GitHub doesn't accept this token.");
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
});
