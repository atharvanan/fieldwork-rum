import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Event } from '../models/Event.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { bufferStats } from '../services/eventBuffer.js';

export const overview = asyncHandler(async (req, res) => {
  const [users, projects, events] = await Promise.all([
    User.countDocuments(),
    Project.countDocuments(),
    Event.estimatedDocumentCount(),
  ]);
  res.json({ users, projects, events, buffer: bufferStats() });
});

export const listUsers = asyncHandler(async (req, res) => {
  res.json({ users: await User.find().sort({ createdAt: -1 }).limit(100).lean() });
});

export const setRole = asyncHandler(async (req, res) => {
  const { role } = z.object({ role: z.enum(['admin', 'developer']) }).parse(req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(404, 'User not found');
  if (req.params.id === req.user.id) throw new AppError(400, 'You cannot change your own role');
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ user: { id: String(user._id), email: user.email, role: user.role } });
});
