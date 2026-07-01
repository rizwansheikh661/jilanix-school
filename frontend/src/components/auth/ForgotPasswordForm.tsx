'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';

import { describeError } from '@/lib/api/errors';
import { requestPasswordReset } from '@/lib/api/clients/auth';
import { useToast } from '@/providers/ToastProvider';
import { AuthLayout } from './AuthLayout';
import { AuthCard } from './AuthCard';
import { AuthInput } from './AuthInput';
import { AuthButton } from './AuthButton';

/**
 * Posts to the frozen `/auth/password-reset/request` endpoint. Backend
 * always returns `{ accepted: true }` regardless of whether the email
 * matches — the UI shows the same success state either way to avoid
 * leaking account-existence signal.
 */
const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    try {
      await requestPasswordReset({ email: values.email });
      setSubmitted(true);
      toast.success(
        'Reset link sent',
        'If the email matches an account, a password reset link will arrive shortly.',
      );
    } catch (err) {
      const message = describeError(err);
      toast.danger('Could not send reset link', message);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Forgot password?"
        subtitle="Enter the email tied to your account and we'll send instructions to reset your password."
        footer={
          <>
            Return to <Link href="/login" className="jlx-link-accent">Login</Link>
          </>
        }
      >
        <form className="jlx-auth-card__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthInput
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            leadingIcon={<Mail size={18} aria-hidden="true" />}
            errorMessage={errors.email?.message}
            {...register('email')}
          />

          <AuthButton type="submit" loading={isSubmitting} disabled={submitted}>
            {submitted ? 'Reset link sent' : 'Send reset link'}
          </AuthButton>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
