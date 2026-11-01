'use client';

export default function Tabs({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded border border-rule">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`border-l border-rule px-3 py-1.5 text-sm first:border-l-0 ${o.value === value ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-panel'}`}
        >
          {o.fullLabel ? (
            <>
              <span className="sm:hidden">{o.label}</span>
              <span className="hidden sm:inline">{o.fullLabel}</span>
            </>
          ) : (
            o.label
          )}
        </button>
      ))}
    </div>
  );
}
