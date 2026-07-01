'use client';

import { CheckCircle2, Info, AlertTriangle, XCircle, X, type LucideIcon } from 'lucide-react';

import { useToast, useToastList } from '@/providers/ToastProvider';
import type { ToastInstance, ToastVariant } from '@/types/toast';
import { cn } from '@/lib/utils/cn';

const VARIANT_ICON: Record<ToastVariant, LucideIcon> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function ToastRegion() {
  const toasts = useToastList();
  if (toasts.length === 0) return null;
  return (
    <div className="so-toast-region" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastInstance }) {
  const { dismiss } = useToast();
  const Icon = VARIANT_ICON[toast.variant];
  return (
    <div className={cn('so-toast', `so-toast--${toast.variant}`)} role="status">
      <div className="so-toast__icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div className="so-toast__body">
        <p className="so-toast__title">{toast.title}</p>
        {toast.description ? <p className="so-toast__description">{toast.description}</p> : null}
        {toast.requestId ? <span className="so-toast__trace">Request: {toast.requestId}</span> : null}
      </div>
      <button
        type="button"
        className="so-toast__close"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
