'use client';

import Link from 'next/link';
import { ErrorState } from '@/components/foundation/ErrorState';

export default function NotFound() {
  return (
    <ErrorState
      title="404 — Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={<Link href="/dashboard" className="btn btn-outline-primary">Back to dashboard</Link>}
    />
  );
}
