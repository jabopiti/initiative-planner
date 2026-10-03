import { useCallback, useEffect, useState } from 'react';

/** How the app looks (§9.1): System follows the OS. Remembered in this browser only, never synced. */
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

// Also read by public/theme-init.js, which applies it before first paint.
const KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stored mode; anything unreadable or unknown is System. */
function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function saveThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Puts the resolved theme on the document root as the single `.dark` class. */
function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** The current mode and a setter; while System is chosen, follows the OS live. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>(readThemeMode);

  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    saveThemeMode(next);
    setModeState(next);
  }, []);

  return [mode, setMode];
}
