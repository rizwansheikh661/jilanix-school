'use client';

import { type ReactNode } from 'react';

/**
 * AuthCard — inner surface for every auth form.
 * Clean and minimal: title + subtitle stack, form slot, footer.
 */
interface AuthCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="jlx-auth-card">
      <div className="jlx-auth-card__header">
        <h2 className="jlx-auth-card__title">{title}</h2>
        {subtitle ? <p className="jlx-auth-card__subtitle">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div className="jlx-auth-card__footer">{footer}</div> : null}
    </div>
  );
}
