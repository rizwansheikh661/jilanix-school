import { cn } from '@/lib/utils/cn';

export type SkeletonVariant = 'text' | 'title' | 'metric' | 'circle' | 'card' | 'row' | 'custom';

export interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  count?: number;
  className?: string;
}

export function LoadingSkeleton({
  variant = 'text',
  width,
  height,
  count = 1,
  className,
}: LoadingSkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;

  const items = Array.from({ length: Math.max(1, count) }, (_, i) => (
    <span
      key={i}
      aria-hidden="true"
      style={style}
      className={cn('so-skeleton', variant !== 'custom' && `so-skeleton--${variant}`, className)}
    />
  ));

  if (count === 1) return <>{items}</>;
  return <span role="status" aria-label="Loading">{items}</span>;
}
