'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function InstallPanel({ project }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [origin, setOrigin] = useState('https://your-fieldwork-host');
  const [threshold, setThreshold] = useState(project.errorThreshold);
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const refresh = () => qc.invalidateQueries({ queryKey: ['project', project._id] });
  const save = useMutation({ mutationFn: () => api(`/projects/${project._id}`, { method: 'PATCH', body: { errorThreshold: Number(threshold) } }), onSuccess: refresh });
  const rotate = useMutation({ mutationFn: () => api(`/projects/${project._id}/rotate-key`, { method: 'POST' }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api(`/projects/${project._id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.replace('/dashboard');
    },
  });

  const snippet = `<script defer src="${origin}/rum.min.js" data-key="${project.key}" data-release="1.0.0"></script>`;

  return (
    <section aria-labelledby="install-h">
      <h2 id="install-h" className="text-2xl">Install and settings</h2>
      <p className="mt-1 text-sm text-muted">Paste this into the &lt;head&gt; of every page you want to measure. Change data-release whenever you ship, so you can compare versions.</p>
      <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded border border-rule bg-panel p-3 text-sm">{snippet}</pre>
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-quiet"
          onClick={() => navigator.clipboard.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        >
          {copied ? 'Copied' : 'Copy snippet'}
        </button>
        <a className="btn-quiet" href={`/demo.html?key=${project.key}`} target="_blank" rel="noreferrer">Open the demo page</a>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="label" htmlFor="threshold">Alert when errors in 5 minutes reach</label>
          <div className="flex gap-2">
            <input id="threshold" type="number" min="0" className="field" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <button className="btn-quiet" disabled={save.isPending}>{save.isSuccess && !save.isPending ? 'Saved' : 'Save'}</button>
          </div>
          <p className="mt-1 text-sm text-muted">Set to 0 to turn alerts off.</p>
        </form>
        <div>
          <p className="label">Site key</p>
          <code className="block break-all rounded border border-rule bg-panel px-3 py-2 text-sm">{project.key}</code>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => confirm('Replace the key? The old snippet stops working immediately.') && rotate.mutate()}
            >
              Replace key
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => confirm(`Delete ${project.name} and all its data? This cannot be undone.`) && remove.mutate()}
            >
              Delete site
            </button>
          </div>
        </div>
      </div>
      {(save.error || rotate.error || remove.error) && (
        <p role="alert" className="mt-3 text-sm text-poor">{(save.error || rotate.error || remove.error).message}</p>
      )}
    </section>
  );
}
