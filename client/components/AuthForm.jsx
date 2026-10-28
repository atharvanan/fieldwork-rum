'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: () => api(`/auth/${mode}`, { method: 'POST', body: isRegister ? form : { email: form.email, password: form.password } }),
    onSuccess: () => {
      router.replace('/dashboard');
      router.refresh();
    },
  });

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-5 py-10">
      <Link href="/" className="font-display text-xl">Fieldwork</Link>
      <h1 className="mt-8 text-3xl">{isRegister ? 'Create your account' : 'Sign in'}</h1>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {isRegister && (
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="field" autoComplete="name" required value={form.name} onChange={set('name')} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="field" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
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
