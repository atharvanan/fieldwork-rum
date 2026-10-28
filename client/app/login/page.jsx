import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Sign in | Fieldwork' };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
