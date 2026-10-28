'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function Shell({ children }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') });

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    router.replace('/login');
  }

  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="font-display text-xl">Fieldwork</Link>
          <div className="flex items-center gap-4 text-sm">
            {data?.user && <span className="text-muted">{data.user.name}{data.user.role === 'admin' ? ' (admin)' : ''}</span>}
            <button type="button" onClick={signOut} className="underline underline-offset-4 hover:text-accent">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </>
  );
}
