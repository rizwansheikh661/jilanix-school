'use client';

import Image from 'next/image';
import { type ReactNode } from 'react';

/**
 * AuthCard — inner surface for every auth form.
 *
 * LOCKED to the approved mockup: centered 100 px logo, tight title +
 * subtitle stack, form slot, centered footer link. Compact padding so
 * the whole page fits inside 100vh with no scroll.
 */
interface AuthCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly showBrand?: boolean;
}

export function AuthCard({ title, subtitle, children, footer, showBrand = true }: AuthCardProps) {
  return (
    <div className="jlx-auth-card">
      {showBrand ? (
        <div className="jlx-auth-card__brand">
          <Image
            src="/assets/branding/logo-dark.png"
            width={100}
            height={100}
            alt=""
            priority
          />
        </div>
      ) : null}

      <div className="jlx-auth-card__header">
        <h2 className="jlx-auth-card__title">{title}</h2>
        {subtitle ? <p className="jlx-auth-card__subtitle">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div className="jlx-auth-card__footer">{footer}</div> : null}
    </div>
  );
}
