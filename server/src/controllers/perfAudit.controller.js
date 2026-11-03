import { z } from 'zod';
import { PerfAudit } from '../models/PerfAudit.js';
import { runPerformanceAudit } from '../services/perfAudit.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

function validateAuditUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new AppError(400, 'Please enter a valid HTTP or HTTPS URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(400, 'Only HTTP and HTTPS URLs can be audited');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (env.isProd) {
    const isRestricted =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^127\./.test(hostname);

    if (isRestricted) {
      throw new AppError(400, 'Internal and cloud metadata network addresses cannot be audited');
    }
  }

  return parsed.toString();
}

const auditInputSchema = z.object({
  url: z.string().trim().url('Please enter a valid HTTP/HTTPS URL'),
  strategy: z.enum(['mobile', 'desktop']).default('mobile'),
});

export const runPerfAudit = asyncHandler(async (req, res) => {
  const { url: rawUrl, strategy } = auditInputSchema.parse(req.body);
  const url = validateAuditUrl(rawUrl);

  const result = await runPerformanceAudit(url, { strategy });

  const audit = await PerfAudit.create({
    project: req.project._id,
    ...result,
  });

  res.status(201).json({ audit });
});

export const listPerfAudits = asyncHandler(async (req, res) => {
  const audits = await PerfAudit.find({ project: req.project._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ audits });
});

export const getPerfAudit = asyncHandler(async (req, res) => {
  const audit = await PerfAudit.findOne({ _id: req.params.auditId, project: req.project._id }).lean();
  if (!audit) throw new AppError(404, 'Performance audit report not found');

  res.json({ audit });
});

export const deletePerfAudit = asyncHandler(async (req, res) => {
  const deleted = await PerfAudit.findOneAndDelete({ _id: req.params.auditId, project: req.project._id });
  if (!deleted) throw new AppError(404, 'Performance audit report not found');

  res.status(204).end();
});

