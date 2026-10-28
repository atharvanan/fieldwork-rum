import Link from 'next/link';
import Gauge from '@/components/Gauge';

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl">Fieldwork</span>
        <nav className="flex gap-3">
          <Link className="btn-quiet" href="/login">Sign in</Link>
          <Link className="btn-primary" href="/register">Create an account</Link>
        </nav>
      </header>

      <section className="mt-14 grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        <div>
          <h1 className="text-4xl leading-[1.1] sm:text-5xl">See your site the way your visitors do.</h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Fieldwork collects Core Web Vitals and JavaScript errors from real browsers. It shows where pages are slow,
            which release made them slower, and what is breaking.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary" href="/register">Create an account</Link>
            <Link className="btn-quiet" href="/login">Sign in</Link>
          </div>
        </div>

        <div className="divide-y divide-rule rounded border border-rule bg-panel px-5">
          <p className="py-3 text-sm text-muted">Sample readings, 75th percentile over 7 days</p>
          <Gauge name="LCP" p75={3100} samples={4210} distribution={{ good: 2300, needsImprovement: 1400, poor: 510 }} />
          <Gauge name="INP" p75={180} samples={3890} distribution={{ good: 3300, needsImprovement: 480, poor: 110 }} />
          <Gauge name="CLS" p75={0.04} samples={4210} distribution={{ good: 3900, needsImprovement: 260, poor: 50 }} />
        </div>
      </section>

      <section className="mt-20 grid gap-10 border-t border-rule pt-10 sm:grid-cols-3">
        <div>
          <h2 className="text-xl">One script tag</h2>
          <p className="mt-2 text-muted">Under 2 KB compressed. It sends data when the page is hidden, so it never competes with your content.</p>
        </div>
        <div>
          <h2 className="text-xl">Real devices and networks</h2>
          <p className="mt-2 text-muted">Lab tests run on your laptop. Fieldwork measures the phones and connections your visitors actually have.</p>
        </div>
        <div>
          <h2 className="text-xl">Errors with context</h2>
          <p className="mt-2 text-muted">Identical errors are grouped, counted by visitor, and shown with the page and stack trace.</p>
        </div>
      </section>
    </main>
  );
}
