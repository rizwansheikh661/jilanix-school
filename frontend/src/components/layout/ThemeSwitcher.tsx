'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { useTheme, type ThemeMode } from '@/providers/ThemeProvider';

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
  system: 'Switch to light theme',
};

const ICON_FOR: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const { mode, toggle } = useTheme();
  const Icon = ICON_FOR[mode];
  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? 'app-header__icon-btn'}
      aria-label={NEXT_LABEL[mode]}
      title={NEXT_LABEL[mode]}
    >
      <Icon size={18} />
    </button>
  );
}
