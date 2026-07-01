import { describe, expect, it, beforeEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ThemeProvider, useTheme } from '@/providers/ThemeProvider';
import { STORAGE_KEYS } from '@/lib/config/app';

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-bs-theme');
  });

  it('defaults to system and resolves to light without dark preference', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('system');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  it('toggle cycles light → dark → system → light', () => {
    window.localStorage.setItem(STORAGE_KEYS.theme, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('light');

    act(() => result.current.toggle());
    expect(result.current.mode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.mode).toBe('system');

    act(() => result.current.toggle());
    expect(result.current.mode).toBe('light');
  });

  it('setMode persists to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setMode('dark'));
    expect(window.localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark');
  });

  it('throws when used outside provider', () => {
    expect(() => render(<HookHost />)).toThrow(/useTheme must be used inside/);
  });
});

function HookHost() {
  useTheme();
  return null;
}
