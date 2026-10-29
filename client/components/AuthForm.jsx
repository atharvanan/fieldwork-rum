'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AuthForm({ mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('error');
  const isDeleted = searchParams.get('deleted') === 'true';

  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: () =>
      api(`/auth/${mode}`, {
        method: 'POST',
        body: isRegister ? form : { email: form.email, password: form.password },
      }),
    onSuccess: () => {
      router.replace('/dashboard');
      router.refresh();
    },
  });

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-5 py-10">
      <Link href="/" className="font-display text-xl">
        Fieldwork
      </Link>
      <h1 className="mt-8 text-3xl">{isRegister ? 'Create your account' : 'Sign in'}</h1>

      {oauthError && (
        <div role="alert" className="mt-6 rounded border border-poor/40 bg-poor/5 px-3 py-2.5 text-sm text-poor">
          {oauthError}
        </div>
      )}

      {isDeleted && (
        <div role="status" className="mt-6 rounded border border-good/40 bg-good/5 px-3 py-2.5 text-sm text-good">
          Your account and all associated telemetry data have been permanently deleted.
        </div>
      )}

      <div className="mt-6">
        <a
          href="/api/auth/google"
          className="btn-quiet flex w-full items-center justify-center gap-3 border border-rule bg-panel py-2.5 font-medium hover:border-ink hover:text-ink"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.98 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </a>
      </div>

      <div className="relative my-6 text-center text-xs">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-rule" />
        </div>
        <span className="relative bg-canvas px-3 text-muted">or continue with email</span>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {isRegister && (
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="field"
              autoComplete="name"
              required
              value={form.name}
              onChange={set('name')}
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 8 : 1}
            required
            value={form.password}
            onChange={set('password')}
          />
          {isRegister && <p className="mt-1 text-sm text-muted">Use at least 8 characters.</p>}
        </div>

        {submit.error && (
          <p role="alert" className="rounded border border-poor/40 bg-poor/5 px-3 py-2 text-sm text-poor">
            {submit.error.message}
          </p>
        )}

        <button className="btn-primary w-full" disabled={submit.isPending}>
          {submit.isPending ? 'Please wait' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {isRegister ? 'Already have an account? ' : 'New to Fieldwork? '}
        <Link className="text-accent underline underline-offset-4" href={isRegister ? '/login' : '/register'}>
          {isRegister ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </main>
  );
}
