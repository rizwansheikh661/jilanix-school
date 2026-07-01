'use client';

import type { ReactNode } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';

export type DrawerSide = 'start' | 'end' | 'top' | 'bottom';

export interface DrawerProps {
  show: boolean;
  onHide: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  scroll?: boolean;
  backdrop?: boolean | 'static';
  ariaLabel?: string;
}

export function Drawer({
  show,
  onHide,
  title,
  children,
  footer,
  side = 'end',
  scroll,
  backdrop = true,
  ariaLabel,
}: DrawerProps) {
  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      placement={side}
      scroll={scroll}
      backdrop={backdrop}
      aria-label={ariaLabel}
    >
      {title ? (
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>{title}</Offcanvas.Title>
        </Offcanvas.Header>
      ) : null}
      <Offcanvas.Body>{children}</Offcanvas.Body>
      {footer ? <div className="offcanvas-footer p-3 border-top">{footer}</div> : null}
    </Offcanvas>
  );
}
