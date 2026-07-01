'use client';

import type { ReactNode } from 'react';

import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { PermissionProvider } from '@/providers/PermissionProvider';
import { FeatureFlagProvider } from '@/providers/FeatureFlagProvider';
import { TenantProvider } from '@/providers/TenantProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { AppLayout } from '@/components/layout/AppLayout';

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <PermissionProvider>
            <FeatureFlagProvider>
              <TenantProvider>
                <ToastProvider>
                  <AppLayout>{children}</AppLayout>
                </ToastProvider>
              </TenantProvider>
            </FeatureFlagProvider>
          </PermissionProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
