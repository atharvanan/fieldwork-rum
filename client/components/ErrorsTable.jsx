'use client';
import { useStat } from '@/lib/hooks';
import { ago } from '@/lib/format';

export default function ErrorsTable({ id, range }) {
  const { data, isLoading, error } = useStat(id, 'errors', { range });
  const errors = data?.errors ?? [];

  return (
    <section aria-labelledby="errors-h">
      <h2 id="errors-h" className="text-2xl">JavaScript errors</h2>
      <p className="text-sm text-muted">The same error is grouped into one line. Open a line to see where it happened.</p>
      {isLoading && <p className="mt-4 text-muted">Loading</p>}
      {error && <p role="alert" className="mt-4 text-poor">{error.message}</p>}
      {!isLoading && !error && errors.length === 0 && <p className="mt-4 text-muted">No errors in this range.</p>}
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {errors.map((e) => (
          <li key={e.message}>
            <details className="group py-3">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-4 gap-y-1 marker:hidden">
                <span className="break-words font-medium">{e.message}</span>
                <span className="text-right num">{e.count.toLocaleString()} {e.count === 1 ? 'time' : 'times'}</span>
                <span className="text-sm text-muted">On {e.path}. Last seen {ago(e.lastSeen)}.</span>
                <span className="text-right text-sm text-muted num">{e.sessions.toLocaleString()} {e.sessions === 1 ? 'visitor' : 'visitors'}</span>
              </summary>
              <pre className="mt-3 overflow-x-auto rounded border border-rule bg-panel p-3 text-xs leading-relaxed">{e.stack || 'No stack trace was captured.'}</pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
