'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: readonly BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="so-breadcrumb">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <Fragment key={`${item.label}-${idx}`}>
              <li className="so-breadcrumb__item">
                {isLast || !item.href ? (
                  <span className="so-breadcrumb__current" aria-current={isLast ? 'page' : undefined}>
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="so-breadcrumb__link">
                    {item.label}
                  </Link>
                )}
              </li>
              {!isLast ? (
                <li className="so-breadcrumb__separator" aria-hidden="true">
                  <ChevronRight size={14} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
