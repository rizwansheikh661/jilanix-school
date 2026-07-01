'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { describeError } from '@/lib/api/errors';
import { confirmPasswordReset } from '@/lib/api/clients/auth';
import { useToast } from '@/providers/ToastProvider';
import { AuthLayout } from './AuthLayout';
import { AuthCard } from './AuthCard';
import { AuthButton } from './AuthButton';
import { PasswordInput } from './PasswordInput';

/**
 * Posts to the frozen `/auth/password-reset/confirm` endpoint. Token
 * arrives in the URL (`?token=...`). Backend enforces 12-char minimum;
 * we mirror that here for immediate validation.
 */
const PASSWORD_MIN_LENGTH = 12;

const schema = z
  .object({
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
    confirmPassword: z.string().min(1, 'Please confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (token.length === 0) {
      toast.danger(
        'Missing reset token',
        'Reset link is missing a token. Request a new link from the login page.',
      );
    }
  }, [token, toast]);

  async function onSubmit(values: FormValues) {
    if (token.length === 0) return;
    try {
      await confirmPasswordReset({ token, newPassword: values.newPassword });
      toast.success('Password changed', 'You can now sign in with your new password.');
      router.replace('/login');
    } catch (err) {
      const message = describeError(err);
      toast.danger('Could not reset password', message);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Reset password"
        subtitle="Choose a new password to regain access to your account."
        footer={
          <>
            Return to <Link href="/login" className="jlx-link-accent">Login</Link>
          </>
        }
      >
        <form className="jlx-auth-card__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            errorMessage={errors.newPassword?.message}
            {...register('newPassword')}
          />

          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            errorMessage={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <AuthButton type="submit" loading={isSubmitting} disabled={token.length === 0}>
            Change password
          </AuthButton>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
