'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  fetchSession,
  firstLoginChangePassword as firstLoginChangeRequest,
  login as loginRequest,
  logout as logoutRequest,
  logoutAll as logoutAllRequest,
  type FirstLoginChangePasswordPayload,
  type LoginPayload,
} from '@/lib/api/clients/auth';
import { registerUnauthorizedHandler } from '@/lib/api/client';
import { clearTokens, readTokens } from '@/lib/auth/token-storage';
import { ApiError } from '@/lib/api/errors';
import type { PermissionKey, SessionUser } from '@/types/domain';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /**
   * Echoed from the login response (`AuthTokensDto.mustChangePassword`).
   * `/auth/me` also surfaces it for the canonical session view; we keep both
   * paths in sync so a hard reload doesn't drop the flag.
   */
  mustChangePassword: boolean;
  permissions: ReadonlySet<PermissionKey>;
  featureFlags: ReadonlyMap<string, boolean>;
  login(payload: LoginPayload): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  changeFirstLoginPassword(payload: FirstLoginChangePasswordPayload): Promise<void>;
  refreshSession(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

const EMPTY_PERMISSIONS: ReadonlySet<PermissionKey> = new Set();
const EMPTY_FLAGS: ReadonlyMap<string, boolean> = new Map();

export function AuthProvider({ children }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionKey>>(EMPTY_PERMISSIONS);
  const [featureFlags, setFeatureFlags] = useState<ReadonlyMap<string, boolean>>(EMPTY_FLAGS);

  const reset = useCallback(() => {
    setUser(null);
    setMustChangePassword(false);
    setPermissions(EMPTY_PERMISSIONS);
    setFeatureFlags(EMPTY_FLAGS);
  }, []);

  const hydrate = useCallback(async () => {
    setStatus('loading');
    try {
      const me = await fetchSession();
      setUser(me);
      setPermissions(new Set(me.permissions ?? []));
      setFeatureFlags(new Map(Object.entries(me.featureFlags ?? {})));
      if (typeof me.mustChangePassword === 'boolean') {
        setMustChangePassword(me.mustChangePassword);
      }
      setStatus('authenticated');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearTokens();
      }
      reset();
      setStatus('unauthenticated');
    }
  }, [reset]);

  useEffect(() => {
    const tokens = readTokens();
    if (!tokens?.accessToken) {
      setStatus('unauthenticated');
      return;
    }
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      reset();
      setStatus('unauthenticated');
      router.replace('/login');
    });
  }, [reset, router]);

  const login = useCallback<AuthContextValue['login']>(
    async (payload) => {
      setStatus('loading');
      try {
        const result = await loginRequest(payload);
        setMustChangePassword(result.mustChangePassword);
        await hydrate();
      } catch (err) {
        setStatus('unauthenticated');
        throw err;
      }
    },
    [hydrate],
  );

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    try {
      await logoutRequest();
    } finally {
      reset();
      setStatus('unauthenticated');
      router.replace('/login');
    }
  }, [reset, router]);

  const logoutAll = useCallback<AuthContextValue['logoutAll']>(async () => {
    try {
      await logoutAllRequest();
    } finally {
      reset();
      setStatus('unauthenticated');
      router.replace('/login');
    }
  }, [reset, router]);

  const changeFirstLoginPassword = useCallback<AuthContextValue['changeFirstLoginPassword']>(
    async (payload) => {
      await firstLoginChangeRequest(payload);
      setMustChangePassword(false);
      await hydrate();
    },
    [hydrate],
  );

  const refreshSession = useCallback<AuthContextValue['refreshSession']>(async () => {
    await hydrate();
  }, [hydrate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      mustChangePassword,
      permissions,
      featureFlags,
      login,
      logout,
      logoutAll,
      changeFirstLoginPassword,
      refreshSession,
    }),
    [
      status,
      user,
      mustChangePassword,
      permissions,
      featureFlags,
      login,
      logout,
      logoutAll,
      changeFirstLoginPassword,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function useSession(): SessionUser | null {
  return useAuth().user;
}
