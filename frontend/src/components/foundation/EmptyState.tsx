import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('so-empty', compact && 'so-empty--compact', className)} role="status">
      <div className="so-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={32} />}
      </div>
      <h3 className="so-empty__title">{title}</h3>
      {description ? <p className="so-empty__description">{description}</p> : null}
      {action ? <div className="so-empty__action">{action}</div> : null}
    </div>
  );
}
