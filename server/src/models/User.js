import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, sparse: true, index: true },
    avatarUrl: { type: String, trim: true },
    role: { type: String, enum: ['admin', 'developer'], default: 'developer' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
