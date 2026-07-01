'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { STORAGE_KEYS } from '@/lib/config/app';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode(mode: ThemeMode): void;
  toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.theme);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-bs-theme', resolved);
}

interface Props {
  children: ReactNode;
}

export function ThemeProvider({ children }: Props) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Initial mount: read stored mode + apply
  useEffect(() => {
    const initial = readStoredMode();
    setModeState(initial);
    const computed: ResolvedTheme = initial === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : initial;
    setResolved(computed);
    applyTheme(computed);
  }, []);

  // Watch system preference when mode === 'system'
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      /* ignore */
    }
    const computed: ResolvedTheme = next === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : next;
    setResolved(computed);
    applyTheme(computed);
  }, []);

  const toggle = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(mode);
    const next = order[(idx + 1) % order.length] ?? 'light';
    setMode(next);
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
