'use client';

import { type ReactNode } from 'react';

import { BrandingPanel } from './BrandingPanel';

/**
 * AuthLayout — two-column authentication shell shared by every auth
 * route. Left column is the deep-purple Jilanix branding panel, right
 * column hosts the auth card and copyright footer.
 *
 * Below the `lg` breakpoint the branding panel stacks above the card.
 * All chrome layout is CSS-driven (see `_theme-jilanix-auth.scss`) so
 * this component stays declarative.
 */
interface AuthLayoutProps {
  readonly children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="jlx-auth-shell">
      <BrandingPanel />
      <main className="jlx-auth-shell__panel">
        <div className="jlx-auth-shell__panel-body">{children}</div>
        <div className="jlx-auth-shell__panel-footer">
          © {new Date().getFullYear()} Jilanix. All rights reserved.
        </div>
      </main>
    </div>
  );
}
