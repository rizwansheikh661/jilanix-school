'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import type { Tenant } from '@/types/domain';

interface TenantContextValue {
  tenant: Pick<Tenant, 'id' | 'name'> | null;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

/**
 * Tenant context derives from the authenticated session. Backend resolves
 * tenant from the JWT `tenant_id` claim, not from a header; the client
 * surfaces it for header brand/breadcrumb display. `schoolId` is the
 * canonical tenant identifier on `/auth/me`. No tenant name is exposed
 * yet — UI shows the truncated id until backend ships a tenant endpoint.
 */
export function TenantProvider({ children }: Props) {
  const { user } = useAuth();

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant: user?.schoolId ? { id: user.schoolId, name: user.schoolId } : null,
    }),
    [user],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}
