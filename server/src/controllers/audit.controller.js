import { z } from 'zod';
import { Audit } from '../models/Audit.js';
import { auditPage } from '../services/accessibility.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const auditInputSchema = z.object({
  url: z.string().trim().url('Please enter a valid HTTP/HTTPS URL'),
  targetLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
});

export const runAudit = asyncHandler(async (req, res) => {
  const { url, targetLevel } = auditInputSchema.parse(req.body);

  let result;
  try {
    result = await auditPage(url, { targetLevel });
  } catch (err) {
    // If fetching the page failed
    const failedAudit = await Audit.create({
      project: req.project._id,
      url,
      targetLevel,
      score: 0,
      status: 'failed',
      error: err.message,
    });
    return res.status(400).json({ error: `Audit failed: ${err.message}`, audit: failedAudit });
  }

  const audit = await Audit.create({
    project: req.project._id,
    ...result,
  });

  res.status(201).json({ audit });
});

export const listAudits = asyncHandler(async (req, res) => {
  const audits = await Audit.find({ project: req.project._id })
    .select('-violations.nodes.failureSummary')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ audits });
});

export const getAudit = asyncHandler(async (req, res) => {
  const audit = await Audit.findOne({ _id: req.params.auditId, project: req.project._id }).lean();
  if (!audit) throw new AppError(404, 'Audit report not found');

  res.json({ audit });
});

export const deleteAudit = asyncHandler(async (req, res) => {
  const deleted = await Audit.findOneAndDelete({ _id: req.params.auditId, project: req.project._id });
  if (!deleted) throw new AppError(404, 'Audit report not found');

  res.status(204).end();
});

