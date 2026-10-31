import { z } from 'zod';
import { Audit } from '../models/Audit.js';
import { auditPage } from '../services/accessibility.js';
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
  targetLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
});

export const runAudit = asyncHandler(async (req, res) => {
  const { url: rawUrl, targetLevel } = auditInputSchema.parse(req.body);
  const url = validateAuditUrl(rawUrl);

  let result;
  try {
    result = await auditPage(url, { targetLevel });
  } catch (err) {
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

