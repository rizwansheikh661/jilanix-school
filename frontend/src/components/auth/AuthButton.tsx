'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { Spinner } from '@/components/foundation/Spinner';

/**
 * AuthButton — primary/ghost button used by every auth form.
 *
 * Visual is owned by `.jlx-btn*` classes. When `variant="primary"` and
 * `showArrow` is true (default) a right-arrow glyph rides on the label
 * and nudges on hover — the signature interaction from the approved
 * design.
 *
 * `loading` swaps the arrow for a spinner and disables the button.
 */
type Variant = 'primary' | 'ghost';

interface AuthButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: Variant;
  readonly block?: boolean;
  readonly loading?: boolean;
  readonly showArrow?: boolean;
  readonly children: ReactNode;
}

export const AuthButton = forwardRef<HTMLButtonElement, AuthButtonProps>(function AuthButton(
  {
    variant = 'primary',
    block = true,
    loading = false,
    showArrow = true,
    disabled,
    className,
    children,
    type = 'submit',
    ...rest
  },
  ref,
) {
  const classes = [
    'jlx-btn',
    variant === 'primary' ? 'jlx-btn--primary' : 'jlx-btn--ghost',
    block ? 'jlx-btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span>{children}</span>
      {loading ? (
        <Spinner size="sm" />
      ) : showArrow && variant === 'primary' ? (
        <ArrowRight className="jlx-btn__arrow" size={18} aria-hidden="true" />
      ) : null}
    </button>
  );
});
