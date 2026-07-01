import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthSkeleton } from '@/components/auth/AuthSkeleton';

export const metadata: Metadata = { title: 'Reset password — Jilanix' };

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <AuthSkeleton />
        </AuthLayout>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
