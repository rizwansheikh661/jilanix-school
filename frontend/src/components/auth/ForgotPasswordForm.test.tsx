import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const hoisted = vi.hoisted(() => ({
  requestResetMock: vi.fn(async (_payload: { email: string }) => ({
    accepted: true as const,
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
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/forgot-password',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => hoisted.toastMock,
}));

vi.mock('@/lib/api/clients/auth', () => ({
  requestPasswordReset: (payload: { email: string }) => hoisted.requestResetMock(payload),
}));

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  it('renders an email field and a submit button', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('posts only { email } to requestPasswordReset on submit', async () => {
    hoisted.requestResetMock.mockClear();
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), 'someone@canary.local');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(hoisted.requestResetMock).toHaveBeenCalledTimes(1);
    expect(hoisted.requestResetMock).toHaveBeenCalledWith({
      email: 'someone@canary.local',
    });
    expect(hoisted.requestResetMock.mock.calls[0]?.[0]).not.toHaveProperty('schoolId');
  });

  it('keeps a Return to Login link', () => {
    render(<ForgotPasswordForm />);
    const link = screen.getByRole('link', { name: /login/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});
