'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, User as UserIcon } from 'lucide-react';

import { useAuth } from '@/providers/AuthProvider';
import { Avatar } from '@/components/foundation/Avatar';

/**
 * Backend `/auth/me` does not expose email / fullName / avatar. We only
 * have `userId`, `roleIds`, `schoolId`, `actorScope`, `sessionId`. Show a
 * truncated user id + primary role until the backend ships a profile API.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const displayName = user.userId.slice(0, 8);
  const subline = user.roleIds[0] ?? (user.actorScope === 'global' ? 'Platform' : 'School user');

  return (
    <div className="position-relative" ref={ref}>
      <button
        type="button"
        className="app-header__icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={displayName} size="sm" />
      </button>
      {open ? (
        <div
          role="menu"
          className="dropdown-menu show shadow-sm"
          style={{ position: 'absolute', right: 0, top: '100%', minWidth: 220, marginTop: 8 }}
        >
          <div className="px-3 py-2 border-bottom">
            <div className="fw-semibold text-truncate">{displayName}</div>
            <div className="small text-muted text-truncate">{subline}</div>
          </div>
          <button type="button" className="dropdown-item d-flex align-items-center gap-2" role="menuitem">
            <UserIcon size={16} /> Profile
          </button>
          <button type="button" className="dropdown-item d-flex align-items-center gap-2" role="menuitem">
            <Settings size={16} /> Settings
          </button>
          <div className="dropdown-divider" />
          <button
            type="button"
            className="dropdown-item d-flex align-items-center gap-2 text-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
