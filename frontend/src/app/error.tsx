'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/foundation/ErrorState';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[app/error]', error);
    }
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      description={error.message || 'An unexpected error occurred.'}
      onRetry={reset}
    />
  );
}
