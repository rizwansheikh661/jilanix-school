'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastRegion } from '@/components/overlays/ToastRegion';
import { CommandPaletteProvider } from '@/components/overlays/CommandPalette';
import { ConfirmationProvider } from '@/components/overlays/ConfirmationDialog';
import { useAuth } from '@/providers/AuthProvider';
import { Spinner } from '@/components/foundation/Spinner';
import { ErrorBoundary } from '@/components/foundation/ErrorBoundary';
import { cn } from '@/lib/utils/cn';
import { STORAGE_KEYS } from '@/lib/config/app';

const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const { status } = useAuth();

  useEffect(() => {
    if (!isAuthRoute && status === 'unauthenticated') {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [isAuthRoute, status, pathname, router]);

  if (isAuthRoute) {
    return (
      <>
        {children}
        <ToastRegion />
      </>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
        <Spinner size="lg" label="Loading application" />
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      <ConfirmationProvider>
        <AppShell>{children}</AppShell>
      </ConfirmationProvider>
    </CommandPaletteProvider>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => {
        const next = !v;
        try {
          window.localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, next ? '1' : '0');
        } catch {
          // ignore
        }
        return next;
      });
    }
  }

  return (
    <div className="main-wrapper">
      <a href="#main-content" className="app-skip-link so-sr-only">Skip to content</a>
      <Sidebar collapsed={collapsed} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={cn('app-page', collapsed && 'app-page--sidebar-collapsed')}>
        <Header onToggleSidebar={toggleSidebar} />
        <main id="main-content" className="app-content">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <ToastRegion />
    </div>
  );
}

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === '1';
  } catch {
    return false;
  }
}
