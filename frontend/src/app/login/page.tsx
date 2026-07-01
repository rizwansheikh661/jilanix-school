import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoginForm } from '@/components/auth/LoginForm';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthSkeleton } from '@/components/auth/AuthSkeleton';

export const metadata: Metadata = { title: 'Sign in — Jilanix' };

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <AuthSkeleton />
        </AuthLayout>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
