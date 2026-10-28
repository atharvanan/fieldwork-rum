import { z } from 'zod';
import { Event } from '../models/Event.js';
import { VITAL_NAMES } from '../utils/rating.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// how far back to look, and the chart bucket size, per range
const RANGES = {
  '1h': { ms: 3600e3, unit: 'minute', binSize: 5 },
  '24h': { ms: 86400e3, unit: 'hour', binSize: 1 },
  '7d': { ms: 7 * 86400e3, unit: 'hour', binSize: 6 },
  '30d': { ms: 30 * 86400e3, unit: 'day', binSize: 1 },
};

const querySchema = z.object({
  range: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  metric: z.enum(VITAL_NAMES).default('LCP'),
  by: z.enum(['browser', 'os', 'device', 'path', 'release']).default('browser'),
});

function scope(req) {
  const q = querySchema.parse(req.query);
  const r = RANGES[q.range];
  return { q, r, match: { project: req.project._id, ts: { $gte: new Date(Date.now() - r.ms) } } };
}

const countIf = (rating) => ({ $sum: { $cond: [{ $eq: ['$rating', rating] }, 1, 0] } });
const p75 = { $percentile: { input: '$value', p: [0.75], method: 'approximate' } };

export const overview = asyncHandler(async (req, res) => {
  const { match } = scope(req);
  const [byType, sessions] = await Promise.all([
    Event.aggregate([{ $match: match }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Event.aggregate([{ $match: match }, { $group: { _id: '$sessionId' } }, { $count: 'n' }]),
  ]);
  const n = (t) => byType.find((x) => x._id === t)?.n ?? 0;
  res.json({ pageviews: n('pageview'), errors: n('error'), vitalSamples: n('vital'), sessions: sessions[0]?.n ?? 0 });
});

// needs mongo 7+ for $percentile
export const vitals = asyncHandler(async (req, res) => {
  const { match } = scope(req);
  const rows = await Event.aggregate([
    { $match: { ...match, type: 'vital' } },
    {
      $group: {
        _id: '$name',
        samples: { $sum: 1 },
        pct: { $percentile: { input: '$value', p: [0.5, 0.75, 0.95], method: 'approximate' } },
        good: countIf('good'),
        ni: countIf('needs-improvement'),
        poor: countIf('poor'),
      },
    },
  ]);
  const byName = new Map(rows.map((r) => [r._id, r]));
  res.json({
    vitals: VITAL_NAMES.map((name) => {
      const r = byName.get(name);
      return {
        name,
        samples: r?.samples ?? 0,
        p50: r?.pct?.[0] ?? null,
        p75: r?.pct?.[1] ?? null,
        p95: r?.pct?.[2] ?? null,
        distribution: { good: r?.good ?? 0, needsImprovement: r?.ni ?? 0, poor: r?.poor ?? 0 },
      };
    }),
  });
});

export const timeseries = asyncHandler(async (req, res) => {
  const { q, r, match } = scope(req);
  const rows = await Event.aggregate([
    { $match: { ...match, type: 'vital', name: q.metric } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$ts', unit: r.unit, binSize: r.binSize } },
        p75,
        samples: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, t: '$_id', samples: 1, p75: { $arrayElemAt: ['$p75', 0] } } },
  ]);
  res.json({ metric: q.metric, points: rows });
});

export const breakdown = asyncHandler(async (req, res) => {
  const { q, match } = scope(req);
  const rows = await Event.aggregate([
    { $match: { ...match, type: 'vital', name: q.metric } },
    { $group: { _id: `$${q.by}`, p75, samples: { $sum: 1 } } },
    { $sort: { samples: -1 } },
    { $limit: 8 },
    { $project: { _id: 0, label: { $ifNull: ['$_id', 'Unknown'] }, samples: 1, p75: { $arrayElemAt: ['$p75', 0] } } },
  ]);
  res.json({ metric: q.metric, by: q.by, rows });
});

export const errors = asyncHandler(async (req, res) => {
  const { r, match } = scope(req);
  const [out] = await Event.aggregate([
    { $match: { ...match, type: 'error' } },
    {
      $facet: {
        list: [
          {
            $group: {
              _id: '$message',
              count: { $sum: 1 },
              sessions: { $addToSet: '$sessionId' },
              firstSeen: { $min: '$ts' },
              lastSeen: { $max: '$ts' },
              stack: { $first: '$stack' },
              path: { $first: '$path' },
            },
          },
          {
            $project: {
              _id: 0,
              message: '$_id',
              count: 1,
              sessions: { $size: '$sessions' },
              firstSeen: 1,
              lastSeen: 1,
              stack: 1,
              path: 1,
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        series: [
          { $group: { _id: { $dateTrunc: { date: '$ts', unit: r.unit, binSize: r.binSize } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, t: '$_id', count: 1 } },
        ],
      },
    },
  ]);
  res.json({ errors: out?.list ?? [], series: out?.series ?? [] });
});
