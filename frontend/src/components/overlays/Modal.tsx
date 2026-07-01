'use client';

import type { ReactNode } from 'react';
import BsModal from 'react-bootstrap/Modal';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  show: boolean;
  onHide: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  centered?: boolean;
  scrollable?: boolean;
  staticBackdrop?: boolean;
  closeButton?: boolean;
  ariaLabel?: string;
}

const SIZE_MAP: Record<ModalSize, 'sm' | undefined | 'lg' | 'xl'> = {
  sm: 'sm',
  md: undefined,
  lg: 'lg',
  xl: 'xl',
};

export function Modal({
  show,
  onHide,
  title,
  children,
  footer,
  size = 'md',
  centered = true,
  scrollable,
  staticBackdrop,
  closeButton = true,
  ariaLabel,
}: ModalProps) {
  return (
    <BsModal
      show={show}
      onHide={onHide}
      size={SIZE_MAP[size]}
      centered={centered}
      scrollable={scrollable}
      backdrop={staticBackdrop ? 'static' : true}
      aria-label={ariaLabel}
    >
      {title ? (
        <BsModal.Header closeButton={closeButton}>
          <BsModal.Title>{title}</BsModal.Title>
        </BsModal.Header>
      ) : null}
      <BsModal.Body>{children}</BsModal.Body>
      {footer ? <BsModal.Footer>{footer}</BsModal.Footer> : null}
    </BsModal>
  );
}
