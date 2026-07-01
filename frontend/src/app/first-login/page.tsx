import type { Metadata } from 'next';

import { FirstLoginChangePasswordForm } from '@/components/auth/FirstLoginChangePasswordForm';

export const metadata: Metadata = { title: 'Change password — Jilanix' };

export default function FirstLoginPage() {
  return <FirstLoginChangePasswordForm />;
}
