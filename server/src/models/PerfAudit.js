import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    url: { type: String },
    snippet: { type: String },
    detail: { type: String },
  },
  { _id: false }
);

const opportunitySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    impact: { type: String, enum: ['critical', 'serious', 'moderate', 'minor'], required: true },
    savings: { type: String },
    description: { type: String, required: true },
    fixGuidance: { type: String },
    items: { type: [itemSchema], default: [] },
  },
  { _id: false }
);

const vitalMetricSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    display: { type: String, required: true },
    rating: { type: String, enum: ['good', 'needs-improvement', 'poor'], required: true },
  },
  { _id: false }
);

const perfAuditSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    url: { type: String, required: true, trim: true },
    score: { type: Number, min: 0, max: 100, required: true },
    status: { type: String, enum: ['completed', 'warning', 'failed'], default: 'completed' },
    statusCode: { type: Number, default: 200 },
    strategy: { type: String, enum: ['mobile', 'desktop'], default: 'mobile' },
    vitals: {
      LCP: vitalMetricSchema,
      FCP: vitalMetricSchema,
      CLS: vitalMetricSchema,
      TBT: vitalMetricSchema,
      TTFB: vitalMetricSchema,
      SpeedIndex: vitalMetricSchema,
    },
    metrics: {
      htmlBytes: { type: Number, default: 0 },
      scriptsCount: { type: Number, default: 0 },
      stylesheetsCount: { type: Number, default: 0 },
      imagesCount: { type: Number, default: 0 },
      renderBlockingCount: { type: Number, default: 0 },
      thirdPartyCount: { type: Number, default: 0 },
    },
    opportunities: { type: [opportunitySchema], default: [] },
    durationMs: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true }
);

// Compound index for querying recent performance audits per project
perfAuditSchema.index({ project: 1, createdAt: -1 });

export const PerfAudit = mongoose.model('PerfAudit', perfAuditSchema);

