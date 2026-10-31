'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function AccountPanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') });

  const deleteMutation = useMutation({
    mutationFn: () => api('/auth/me', { method: 'DELETE' }),
    onSuccess: () => {
      qc.clear();
      if (typeof window !== 'undefined') {
        window.location.assign('/register?deleted=true');
      }
    },
  });

  const user = data?.user;
  if (!user) return null;

  return (
    <section aria-labelledby="account-danger-zone" className="mt-14 max-w-xl border-t border-rule pt-8">
      <h2 id="account-danger-zone" className="text-xl font-medium text-ink">
        Account & Data Privacy
      </h2>
      <p className="mt-1 text-sm text-muted">
        Signed in as <strong>{user.email}</strong> ({user.name}).
      </p>

      <div className="mt-6 rounded border border-poor/40 bg-poor/5 p-5">
        <h3 className="text-base font-semibold text-poor">Danger Zone</h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          Permanently delete your account and execute a cascading purge of all your sites, telemetry data, Core Web Vitals
          history, runtime error logs, and accessibility reports. This action is irreversible.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-danger mt-4 text-xs"
          >
            Delete Account and All Data
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded border border-poor/50 bg-panel p-4">
            <p className="text-xs font-medium text-ink">
              To confirm irreversible deletion, type <span className="font-mono font-bold text-poor">DELETE</span> below:
            </p>
            <input
              type="text"
              className="field font-mono text-xs uppercase"
              placeholder="Type DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />

            {deleteMutation.error && (
              <p role="alert" className="text-xs text-poor">
                {deleteMutation.error.message}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={confirmText !== 'DELETE' || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className="btn border-poor bg-poor text-paper hover:bg-poor/90 text-xs font-semibold"
              >
                {deleteMutation.isPending ? 'Purging all data...' : 'Permanently Delete Everything'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
                className="btn-quiet text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

