import { describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  loginRequestMock: vi.fn(async () => ({ mustChangePassword: false })),
  fetchSessionMock: vi.fn(async () => ({
    userId: 'user-1',
    schoolId: 'school-1',
    actorScope: 'tenant' as const,
    roleIds: ['role-1'],
    sessionId: 'sess-1',
  })),
  logoutMock: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/api/clients/auth', () => ({
  login: hoisted.loginRequestMock,
  fetchSession: hoisted.fetchSessionMock,
  logout: hoisted.logoutMock,
}));

vi.mock('@/lib/api/client', () => ({
  registerUnauthorizedHandler: vi.fn(),
}));

vi.mock('@/lib/auth/token-storage', () => ({
  readTokens: () => null,
  clearTokens: vi.fn(),
  writeTokens: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/providers/AuthProvider';

function Probe({ onReady }: { onReady: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  onReady(auth);
  return <span data-testid="flag">{String(auth.mustChangePassword)}</span>;
}

describe('AuthProvider — mustChangePassword', () => {
  it('defaults to false before login', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(a) => (captured = a)} />
      </AuthProvider>,
    );
    expect(captured!.mustChangePassword).toBe(false);
  });

  it('surfaces mustChangePassword: true from the login response', async () => {
    hoisted.loginRequestMock.mockResolvedValueOnce({ mustChangePassword: true });
    let captured: ReturnType<typeof useAuth> | null = null;
    const { getByTestId } = render(
      <AuthProvider>
        <Probe onReady={(a) => (captured = a)} />
      </AuthProvider>,
    );

    await act(async () => {
      await captured!.login({
        email: 'a@b.c',
        password: 'pw',
      });
    });

    await waitFor(() => {
      expect(getByTestId('flag')).toHaveTextContent('true');
    });
  });
});
