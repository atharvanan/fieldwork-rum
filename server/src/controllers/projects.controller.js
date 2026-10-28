import crypto from 'node:crypto';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Event } from '../models/Event.js';
import { Alert } from '../models/Alert.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { invalidateKey } from '../services/projectCache.js';

const cleanDomain = (v) => (v ? v.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') : undefined);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the site a name').max(60),
  domain: z.string().trim().toLowerCase().max(120).optional().transform(cleanDomain),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  domain: z.string().trim().toLowerCase().max(120).transform(cleanDomain).optional(),
  errorThreshold: z.number().int().min(0).max(100000).optional(),
});

const newKey = () => `rum_${crypto.randomBytes(16).toString('hex')}`;

export const list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { owner: req.user.id };
  res.json({ projects: await Project.find(filter).sort({ createdAt: -1 }).lean() });
});

export const create = asyncHandler(async (req, res) => {
  const { name, domain } = createSchema.parse(req.body);
  const project = await Project.create({ owner: req.user.id, name, domain, key: newKey() });
  res.status(201).json({ project });
});

export const get = (req, res) => res.json({ project: req.project });

export const update = asyncHandler(async (req, res) => {
  Object.assign(req.project, updateSchema.parse(req.body));
  await req.project.save();
  invalidateKey(req.project.key);
  res.json({ project: req.project });
});

export const rotateKey = asyncHandler(async (req, res) => {
  invalidateKey(req.project.key);
  req.project.key = newKey();
  await req.project.save();
  res.json({ project: req.project });
});

export const remove = asyncHandler(async (req, res) => {
  invalidateKey(req.project.key);
  await Promise.all([
    Event.deleteMany({ project: req.project._id }),
    Alert.deleteMany({ project: req.project._id }),
    req.project.deleteOne(),
  ]);
  res.status(204).end();
});

export const alerts = asyncHandler(async (req, res) => {
  res.json({ alerts: await Alert.find({ project: req.project._id }).sort({ createdAt: -1 }).limit(10).lean() });
});
