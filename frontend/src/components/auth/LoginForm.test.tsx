import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const SCHOOL_UUID = '11111111-1111-4111-8111-111111111111';

const hoisted = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  loginMock: vi.fn(async (_payload: Record<string, unknown>) => undefined),
  fetchSessionMock: vi.fn(async () => ({
    userId: 'u1',
    schoolId: '11111111-1111-4111-8111-111111111111',
    actorScope: 'tenant' as const,
    roleIds: ['role-1'],
    sessionId: 's1',
    roles: ['school_admin'],
    permissions: [],
    featureFlags: {},
    mustChangePassword: false,
  })),
  toastMock: {
    show: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    danger: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: hoisted.replaceMock,
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ login: hoisted.loginMock }),
}));

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => hoisted.toastMock,
}));

vi.mock('@/lib/api/clients/auth', () => ({
  fetchSession: () => hoisted.fetchSessionMock(),
}));

import { LoginForm } from '@/components/auth/LoginForm';

describe('LoginForm', () => {
  it('does not render a School ID input', () => {
    render(<LoginForm />);
    expect(screen.queryByLabelText(/school id/i)).not.toBeInTheDocument();
  });

  it('does not render social sign-in buttons', () => {
    render(<LoginForm />);
    expect(screen.queryByLabelText(/sign in with google/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sign in with facebook/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sign in with apple/i)).not.toBeInTheDocument();
  });

  it('sends only { email, password, rememberMe } — no schoolId in the body', async () => {
    void SCHOOL_UUID; // legacy fixture kept to document the dropped field
    hoisted.loginMock.mockClear();
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'school.admin@canary.local');
    await user.type(screen.getByLabelText(/^password$/i), 'Admin@123');
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(hoisted.loginMock).toHaveBeenCalledTimes(1);
    expect(hoisted.loginMock).toHaveBeenCalledWith({
      email: 'school.admin@canary.local',
      password: 'Admin@123',
      rememberMe: true,
    });
    expect(hoisted.loginMock.mock.calls[0]?.[0]).not.toHaveProperty('schoolId');
  });
});
