'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Search } from 'lucide-react';

interface CommandPaletteContextValue {
  open: boolean;
  show(): void;
  hide(): void;
  toggle(): void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: Props) {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(() => ({ open, show, hide, toggle }), [open, show, hide, toggle]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {open ? <CommandPaletteDialog onClose={hide} /> : null}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>');
  return ctx;
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');

  return (
    <div
      className="so-cmdk-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="so-cmdk-dialog" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="so-cmdk-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            className="so-cmdk-input"
            placeholder="Search or jump to..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label="Search commands"
          />
        </div>
        <div className="so-cmdk-list">
          <p className="text-muted text-center py-4 mb-0" style={{ fontSize: 'var(--text-small)' }}>
            Type to search. (Results will appear here.)
          </p>
        </div>
        <div className="so-cmdk-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
