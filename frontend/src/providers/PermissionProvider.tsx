'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import type { PermissionKey } from '@/types/domain';

interface PermissionContextValue {
  has(permission: PermissionKey): boolean;
  hasAny(permissions: readonly PermissionKey[]): boolean;
  hasAll(permissions: readonly PermissionKey[]): boolean;
}

const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function PermissionProvider({ children }: Props) {
  const { permissions } = useAuth();

  const value = useMemo<PermissionContextValue>(
    () => ({
      has(permission) {
        if (permissions.has('*')) return true;
        return permissions.has(permission);
      },
      hasAny(list) {
        if (permissions.has('*')) return true;
        return list.some((p) => permissions.has(p));
      },
      hasAll(list) {
        if (permissions.has('*')) return true;
        return list.every((p) => permissions.has(p));
      },
    }),
    [permissions],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermission must be used inside <PermissionProvider>');
  return ctx;
}
