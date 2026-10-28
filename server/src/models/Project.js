import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    domain: { type: String, trim: true, lowercase: true },
    key: { type: String, required: true, unique: true },
    errorThreshold: { type: Number, default: 20, min: 0 }, // errors per 5 minutes that raise an alert
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
