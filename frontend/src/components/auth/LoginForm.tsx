'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { describeError } from '@/lib/api/errors';
import { fetchSession } from '@/lib/api/clients/auth';
import { resolveLandingPath } from '@/lib/auth/landing';
import { AuthLayout } from './AuthLayout';
import { AuthCard } from './AuthCard';
import { AuthInput } from './AuthInput';
import { AuthButton } from './AuthButton';
import { PasswordInput } from './PasswordInput';

/**
 * Tenant-agnostic login form. Tenant resolution stays in the shared
 * axios layer (`lib/api/client.ts`); this form only submits
 * `{ email, password, rememberMe }`.
 */
const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false },
  });

  async function onSubmit(values: FormValues) {
    try {
      await login({
        email: values.email,
        password: values.password,
        rememberMe: values.remember ?? false,
      });
      const me = await fetchSession();
      const next = params.get('next') ?? resolveLandingPath(me);
      router.replace(next);
    } catch (err) {
      const message = describeError(err);
      toast.danger('Sign-in failed', message);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to your school portal"
      >
        <form className="jlx-auth-card__form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthInput
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@school.edu"
            errorMessage={errors.email?.message}
            {...register('email')}
          />

          <PasswordInput
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            errorMessage={errors.password?.message}
            {...register('password')}
          />

          <div className="jlx-auth-card__row">
            <label className="jlx-check">
              <input type="checkbox" {...register('remember')} />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" className="jlx-link-accent">Forgot password?</Link>
          </div>

          <AuthButton type="submit" loading={isSubmitting}>
            Sign in
          </AuthButton>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
