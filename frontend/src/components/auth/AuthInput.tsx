'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * AuthInput — text/email input used by every auth form.
 *
 * Renders `<label>` + `<input>` + optional leading icon + inline error
 * text. The visual is owned by the `.jlx-field*` classes; this
 * component keeps forwarding refs to `react-hook-form`'s `register`.
 */
interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly leadingIcon?: ReactNode;
  readonly errorMessage?: string;
  readonly hint?: string;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
  { label, leadingIcon, errorMessage, hint, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const invalid = Boolean(errorMessage);
  const classes = [
    'jlx-field__input',
    leadingIcon ? '' : 'jlx-field__input--no-icon',
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
        {leadingIcon ? <span className="jlx-field__icon">{leadingIcon}</span> : null}
        <input
          {...rest}
          id={inputId}
          ref={ref}
          className={classes}
          aria-invalid={invalid || rest['aria-invalid']}
          aria-describedby={errorMessage ? `${inputId}-error` : rest['aria-describedby']}
        />
      </div>
      {errorMessage ? (
        <p id={`${inputId}-error`} className="jlx-field__error" role="alert">
          {errorMessage}
        </p>
      ) : hint ? (
        <p className="jlx-field__hint">{hint}</p>
      ) : null}
    </div>
  );
});
