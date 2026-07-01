'use client';

import { Bell, Menu } from 'lucide-react';

import { SearchBar } from './SearchBar';
import { ThemeSwitcher } from './ThemeSwitcher';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  return (
    <header className="app-header">
      <button
        type="button"
        className="app-header__hamburger"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} />
      </button>
      <div className="app-header__search">
        <SearchBar />
      </div>
      <div className="app-header__actions">
        <button type="button" className="app-header__icon-btn" aria-label="Notifications">
          <Bell size={18} />
          <span className="app-header__bell-dot" aria-hidden="true" />
        </button>
        <ThemeSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
