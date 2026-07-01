export type ToastVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastOptions {
  id?: string;
  variant?: ToastVariant;
  title: string;
  description?: string;
  requestId?: string;
  durationMs?: number;
}

export interface ToastInstance extends Required<Pick<ToastOptions, 'id' | 'variant' | 'title' | 'durationMs'>> {
  description?: string;
  requestId?: string;
}

export interface ToastContextValue {
  show(options: ToastOptions): string;
  success(title: string, description?: string): string;
  warning(title: string, description?: string): string;
  danger(title: string, description?: string): string;
  info(title: string, description?: string): string;
  dismiss(id: string): void;
}
