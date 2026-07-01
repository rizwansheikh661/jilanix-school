'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Modal } from './Modal';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmContextValue {
  confirm(options: ConfirmOptions): Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface Props {
  children: ReactNode;
}

export function ConfirmationProvider({ children }: Props) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((curr) => {
      curr?.resolve(result);
      return null;
    });
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  const tone = pending?.tone ?? 'default';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        show={pending !== null}
        onHide={() => close(false)}
        title={pending?.title}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => close(false)}>
              {pending?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={() => close(true)}
              autoFocus
            >
              {pending?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        {pending?.message}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmationProvider>');
  return ctx.confirm;
}
