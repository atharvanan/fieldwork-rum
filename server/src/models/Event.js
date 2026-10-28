import mongoose from 'mongoose';
import { env } from '../config/env.js';

const eventSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['vital', 'error', 'pageview'], required: true },
    name: String, // LCP, CLS, ... (vitals only)
    value: Number,
    rating: { type: String, enum: ['good', 'needs-improvement', 'poor'] },
    path: String,
    sessionId: String,
    message: String,
    stack: String,
    release: String,
    browser: String,
    os: String,
    device: String,
    ts: { type: Date, required: true },
  },
  { versionKey: false }
);

// dashboard queries filter by project, then type/name, then time
eventSchema.index({ project: 1, type: 1, name: 1, ts: -1 });
eventSchema.index({ project: 1, ts: -1 });
// old events expire on their own
eventSchema.index({ ts: 1 }, { expireAfterSeconds: env.retentionDays * 86400 });

export const Event = mongoose.model('Event', eventSchema);
