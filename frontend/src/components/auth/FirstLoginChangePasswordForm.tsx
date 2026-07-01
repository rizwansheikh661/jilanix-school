'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { describeError } from '@/lib/api/errors';
import { AuthLayout } from './AuthLayout';
import { AuthCard } from './AuthCard';
import { AuthButton } from './AuthButton';
import { PasswordInput } from './PasswordInput';

/**
 * Posts to the frozen `/auth/first-login/change-password` endpoint.
 * Authenticated call; verifies current password and revokes sibling
 * sessions. Backend enforces 12-char minimum on `newPassword`.
 */
const PASSWORD_MIN_LENGTH = 12;

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
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

export function FirstLoginChangePasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const { changeFirstLoginPassword, logout } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    try {
      await changeFirstLoginPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password updated', 'Your password has been changed.');
      router.replace('/dashboard');
    } catch (err) {
      const message = describeError(err);
      toast.danger('Could not change password', message);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Change your password"
        subtitle="Your account requires a password change before you can continue."
        footer={
          <>
            Not you?{' '}
            <Link
              href="/login"
              className="jlx-link-accent"
              onClick={(e) => {
                e.preventDefault();
                void logout();
              }}
            >
              Sign out
            </Link>
          </>
        }
      >
        <form className="jlx-auth-card__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            placeholder="Enter your current password"
            errorMessage={errors.currentPassword?.message}
            {...register('currentPassword')}
          />

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

          <AuthButton type="submit" loading={isSubmitting}>
            Change password
          </AuthButton>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
