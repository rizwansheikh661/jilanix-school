import { cn } from '@/lib/utils/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  centered?: boolean;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Loading', centered = false, className }: SpinnerProps) {
  const node = (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('so-spinner', `so-spinner--${size}`, className)}
    />
  );
  if (centered) {
    return <div className="so-spinner--centered">{node}</div>;
  }
  return node;
}
