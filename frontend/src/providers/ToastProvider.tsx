'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import type { ToastContextValue, ToastInstance, ToastOptions, ToastVariant } from '@/types/toast';
import { uuid } from '@/lib/utils/uuid';

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  default: 4000,
  success: 4000,
  info: 4000,
  warning: 6000,
  danger: 8000,
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const ToastListContext = createContext<readonly ToastInstance[]>([]);

interface Props {
  children: ReactNode;
}

export function ToastProvider({ children }: Props) {
  const [toasts, setToasts] = useState<readonly ToastInstance[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (options: ToastOptions): string => {
      const variant = options.variant ?? 'default';
      const id = options.id ?? uuid();
      const durationMs = options.durationMs ?? DEFAULT_DURATIONS[variant];
      const instance: ToastInstance = {
        id,
        variant,
        title: options.title,
        durationMs,
        description: options.description,
        requestId: options.requestId,
      };
      setToasts((prev) => [...prev.filter((t) => t.id !== id), instance]);
      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ variant: 'success', title, description }),
      info: (title, description) => show({ variant: 'info', title, description }),
      warning: (title, description) => show({ variant: 'warning', title, description }),
      danger: (title, description) => show({ variant: 'danger', title, description }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function useToastList(): readonly ToastInstance[] {
  return useContext(ToastListContext);
}
