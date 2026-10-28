'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function Sites() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: () => api('/projects') });
  const create = useMutation({
    mutationFn: (body) => api('/projects', { method: 'POST', body }),
    onSuccess: () => {
      setName('');
      setDomain('');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const projects = data?.projects ?? [];

  return (
    <Shell>
      <h1 className="text-3xl">Your sites</h1>

      {isLoading && <p className="mt-6 text-muted">Loading your sites</p>}
      {error && <p role="alert" className="mt-6 text-poor">{error.message}</p>}
      {!isLoading && !error && projects.length === 0 && (
        <p className="mt-6 text-muted">No sites yet. Add one below to get your install snippet.</p>
      )}
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {projects.map((p) => (
          <li key={p._id}>
            <Link href={`/dashboard/${p._id}`} className="flex items-baseline justify-between gap-4 py-4 hover:text-accent">
              <span className="font-display text-xl">{p.name}</span>
              <span className="text-sm text-muted">{p.domain || 'Accepts data from any domain'}</span>
            </Link>
          </li>
        ))}
      </ul>

      <form
        className="mt-10 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, ...(domain.trim() ? { domain } : {}) });
        }}
      >
        <h2 className="text-xl">Add a site</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="site-name">Name</label>
            <input id="site-name" className="field" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="site-domain">Domain (optional)</label>
            <input id="site-domain" className="field" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">If you set a domain, Fieldwork only accepts data sent from that domain and its subdomains.</p>
        {create.error && <p role="alert" className="mt-3 text-sm text-poor">{create.error.message}</p>}
        <button className="btn-primary mt-4" disabled={create.isPending}>{create.isPending ? 'Adding' : 'Add site'}</button>
      </form>
    </Shell>
  );
}
