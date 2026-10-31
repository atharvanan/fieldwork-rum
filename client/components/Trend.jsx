'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useStat } from '@/lib/hooks';
import { VITALS, fmt } from '@/lib/vitals';

export default function Trend({ id, range, metric }) {
  const { data, isLoading, error } = useStat(id, 'timeseries', { range, metric });
  const [good, poor] = VITALS[metric].t;
  const points = (data?.points ?? []).map((p) => ({ ...p, t: new Date(p.t).getTime() }));
  const tick = (t) =>
    new Date(t).toLocaleString([], range === '7d' || range === '30d' ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' });

  return (
    <section aria-labelledby="trend-h">
      <h2 id="trend-h" className="text-2xl">{VITALS[metric].title} over time</h2>
      <p className="text-sm text-muted">75th percentile per time bucket. The dashed lines mark the Good and Poor limits.</p>
      <div className="mt-4 h-[260px] min-w-0 w-full overflow-hidden">
        {isLoading && <p className="text-muted">Loading chart</p>}
        {error && <p role="alert" className="text-poor">{error.message}</p>}
        {!isLoading && !error && points.length === 0 && <p className="text-muted">No {metric} readings in this range.</p>}
        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#C8D0C9" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickCount={range === '1h' || range === '24h' ? 6 : 7} tickFormatter={tick} stroke="#5B6E72" fontSize={12} tickLine={false} />
              <YAxis stroke="#5B6E72" fontSize={12} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => fmt(metric, v)} domain={[0, (max) => Math.max(max * 1.1, poor * 1.1)]} />
              <Tooltip
                formatter={(v) => [fmt(metric, v), '75th percentile']}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                contentStyle={{ background: '#F8F9F6', border: '1px solid #C8D0C9', borderRadius: 4, fontSize: 13 }}
              />
              <ReferenceLine y={good} stroke="#1F8A5B" strokeDasharray="4 4" />
              <ReferenceLine y={poor} stroke="#C23B22" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="p75" stroke="#12303B" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
