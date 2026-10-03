import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeControl } from './ThemeControl';

let osDark = false;
let listeners: (() => void)[] = [];

beforeEach(() => {
  osDark = false;
  listeners = [];
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => (listeners = listeners.filter((l) => l !== fn)),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderControl = () =>
  render(
    <TooltipProvider>
      <ThemeControl />
    </TooltipProvider>,
  );
const isDark = () => document.documentElement.classList.contains('dark');

describe('Theme control (§9.1)', () => {
  it('is named for the current theme and offers System, Light and Dark with a check on the current one', async () => {
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }));
    expect(screen.getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('System follows the OS, live; Light and Dark force the class off and on', async () => {
    osDark = true;
    renderControl();
    expect(isDark()).toBe(true);
    osDark = false;
    listeners.forEach((l) => l());
    expect(isDark()).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    expect(isDark()).toBe(true);
    expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument();
    expect(localStorage.getItem('theme')).toBe('dark');
    osDark = false;
    listeners.forEach((l) => l());
    expect(isDark()).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Theme: Dark' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));
    expect(isDark()).toBe(false);
  });

  it('restores the saved mode, and falls back to System when storage is blocked or holds nonsense', () => {
    localStorage.setItem('theme', 'dark');
    renderControl();
    expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument();
    expect(isDark()).toBe(true);
    cleanup();

    localStorage.setItem('theme', 'purple');
    renderControl();
    expect(screen.getByRole('button', { name: 'Theme: System' })).toBeInTheDocument();
    cleanup();

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderControl();
    expect(screen.getByRole('button', { name: 'Theme: System' })).toBeInTheDocument();
  });

  it('works by keyboard', async () => {
    renderControl();
    screen.getByRole('button', { name: 'Theme: System' }).focus();
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowDown}{Enter}');
    expect(isDark()).toBe(true);
  });
});
