'use client';

import { Search } from 'lucide-react';

import { useCommandPalette } from '@/components/overlays/CommandPalette';

export function SearchBar() {
  const { show } = useCommandPalette();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button type="button" className="so-search-trigger" onClick={show} aria-label="Open search">
      <Search size={16} aria-hidden="true" />
      <span className="so-search-trigger__placeholder">Search students, classes, fees...</span>
      <span className="so-search-trigger__hint" aria-hidden="true">
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  );
}
