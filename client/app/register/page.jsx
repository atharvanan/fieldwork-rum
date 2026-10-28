import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Create an account | Fieldwork' };

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
