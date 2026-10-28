import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    type: { type: String, default: 'error_spike' },
    count: Number,
    message: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

export const Alert = mongoose.model('Alert', alertSchema);
