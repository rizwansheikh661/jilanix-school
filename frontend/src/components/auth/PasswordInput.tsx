'use client';

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * PasswordInput — clean password field with:
 *   - trailing eye/eye-off toggle that flips `type` between
 *     `password` and `text`
 *   - accessible label + inline error line
 */
interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: string;
  readonly leadingIcon?: ReactNode;
  readonly errorMessage?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, leadingIcon, errorMessage, id, className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const inputId = id ?? rest.name;
    const invalid = Boolean(errorMessage);
    const classes = [
      'jlx-field__input',
      'jlx-field__input--no-icon',
      'jlx-field__input--with-trailing',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="jlx-field">
        <label htmlFor={inputId} className="jlx-field__label">
          {label}
        </label>
        <div className="jlx-field__control">
          <input
            {...rest}
            id={inputId}
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={classes}
            aria-invalid={invalid || rest['aria-invalid']}
            aria-describedby={errorMessage ? `${inputId}-error` : rest['aria-describedby']}
          />
          <button
            type="button"
            className="jlx-field__trailing"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        {errorMessage ? (
          <p id={`${inputId}-error`} className="jlx-field__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  },
);
