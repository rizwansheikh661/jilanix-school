import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Spinner } from '@/components/foundation/Spinner';
import { LoadingSkeleton } from '@/components/foundation/LoadingSkeleton';
import { EmptyState } from '@/components/foundation/EmptyState';
import { ErrorState } from '@/components/foundation/ErrorState';

describe('Foundation components', () => {
  it('Spinner exposes ARIA status with label', () => {
    render(<Spinner label="Loading data" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading data');
  });

  it('LoadingSkeleton renders count of skeletons inside status region', () => {
    render(<LoadingSkeleton count={3} variant="row" />);
    const region = screen.getByRole('status');
    expect(region.querySelectorAll('.so-skeleton')).toHaveLength(3);
  });

  it('EmptyState renders title and description', () => {
    render(<EmptyState title="No students" description="Try inviting one." />);
    expect(screen.getByText('No students')).toBeInTheDocument();
    expect(screen.getByText('Try inviting one.')).toBeInTheDocument();
  });

  it('ErrorState exposes alert role and request ID', () => {
    render(<ErrorState requestId="web-abc" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('web-abc')).toBeInTheDocument();
  });
});
