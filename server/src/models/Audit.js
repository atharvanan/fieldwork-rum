import mongoose from 'mongoose';

const violationNodeSchema = new mongoose.Schema(
  {
    html: { type: String, required: true },
    target: { type: [String], default: [] },
    failureSummary: { type: String },
  },
  { _id: false }
);

const violationSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true },
    impact: { type: String, enum: ['critical', 'serious', 'moderate', 'minor'], required: true },
    wcagLevel: { type: String, enum: ['A', 'AA', 'AAA'], required: true },
    wcagTags: { type: [String], default: [] },
    description: { type: String, required: true },
    help: { type: String, required: true },
    helpUrl: { type: String },
    nodes: { type: [violationNodeSchema], default: [] },
  },
  { _id: false }
);

const passSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true },
    wcagLevel: { type: String, enum: ['A', 'AA', 'AAA'], required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const auditSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    url: { type: String, required: true, trim: true },
    targetLevel: { type: String, enum: ['A', 'AA', 'AAA'], default: 'AA' },
    score: { type: Number, min: 0, max: 100, required: true },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
    summary: {
      violationsCount: { type: Number, default: 0 },
      passesCount: { type: Number, default: 0 },
      byImpact: {
        critical: { type: Number, default: 0 },
        serious: { type: Number, default: 0 },
        moderate: { type: Number, default: 0 },
        minor: { type: Number, default: 0 },
      },
      byWcag: {
        A: { type: Number, default: 0 },
        AA: { type: Number, default: 0 },
        AAA: { type: Number, default: 0 },
      },
    },
    violations: { type: [violationSchema], default: [] },
    passes: { type: [passSchema], default: [] },
    durationMs: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true }
);

// Compound index for querying recent audits per project
auditSchema.index({ project: 1, createdAt: -1 });

export const Audit = mongoose.model('Audit', auditSchema);

