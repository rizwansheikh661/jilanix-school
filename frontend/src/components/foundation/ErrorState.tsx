import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  requestId?: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not complete this request. Please try again.',
  requestId,
  action,
  onRetry,
  retryLabel = 'Try again',
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div className={cn('so-error', compact && 'so-error--compact', className)} role="alert">
      <div className="so-error__icon" aria-hidden="true">
        <AlertTriangle size={32} />
      </div>
      <h3 className="so-error__title">{title}</h3>
      {description ? <p className="so-error__description">{description}</p> : null}
      {requestId ? (
        <p className="so-error__trace">
          Request ID: <code>{requestId}</code>
        </p>
      ) : null}
      <div className="so-error__actions">
        {onRetry ? (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
