'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuth } from './AuthProvider';

interface FeatureFlagContextValue {
  isEnabled(key: string): boolean;
  isDisabled(key: string): boolean;
  list(): Array<{ key: string; enabled: boolean }>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function FeatureFlagProvider({ children }: Props) {
  const { featureFlags } = useAuth();

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      isEnabled(key) {
        return featureFlags.get(key) === true;
      },
      isDisabled(key) {
        return featureFlags.get(key) !== true;
      },
      list() {
        return Array.from(featureFlags.entries()).map(([key, enabled]) => ({ key, enabled }));
      },
    }),
    [featureFlags],
  );

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlag(key?: string): boolean | FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlag must be used inside <FeatureFlagProvider>');
  if (key) return ctx.isEnabled(key);
  return ctx;
}

export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlags must be used inside <FeatureFlagProvider>');
  return ctx;
}
