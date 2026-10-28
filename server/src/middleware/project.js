import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// 404 (not 403) for other people's projects so ids can't be guessed. Admins can open any.
export const loadProject = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Site not found');
  const project = await Project.findById(id);
  const allowed = project && (req.user.role === 'admin' || String(project.owner) === req.user.id);
  if (!allowed) throw new AppError(404, 'Site not found');
  req.project = project;
  next();
});
