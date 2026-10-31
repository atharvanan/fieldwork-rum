'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function Shell({ children }) {
  const qc = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') });

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      // Clear client-side cookie if readable
      if (typeof document !== 'undefined') {
        document.cookie = 'rum_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0;';
      }
      qc.clear();
      // Hard navigation ensures Next.js in-memory route cache is cleared and redirects cleanly
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  return (
    <>
      <header className="border-b border-rule overflow-x-hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 min-w-0">
          <Link href="/dashboard" className="font-display text-xl shrink-0">
            Fieldwork
          </Link>
          <div className="flex items-center gap-3 text-sm min-w-0">
            {data?.user && (
              <span className="text-muted truncate max-w-[130px] sm:max-w-none">
                {data.user.name}
                {data.user.role === 'admin' ? ' (admin)' : ''}
              </span>
            )}
            <button
              type="button"
              disabled={isSigningOut}
              onClick={signOut}
              className="flex shrink-0 items-center gap-2 underline underline-offset-4 hover:text-accent disabled:opacity-60 transition-opacity"
            >
              {isSigningOut ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Signing you out...</span>
                </>
              ) : (
                <span>Sign out</span>
              )}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 min-w-0 overflow-x-hidden">{children}</main>
    </>
  );
}
