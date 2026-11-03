import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { loadProject } from '../middleware/project.js';
import * as p from '../controllers/projects.controller.js';
import * as s from '../controllers/stats.controller.js';
import * as a from '../controllers/audit.controller.js';
import * as pa from '../controllers/perfAudit.controller.js';

const auditLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many audit requests. Please wait a minute before running another audit.' },
});

const router = Router();
router.use(requireAuth);
router.get('/', p.list);
router.post('/', p.create);

router.use('/:id', loadProject); // every route below is scoped to a project the user may open
router.get('/:id', p.get);
router.patch('/:id', p.update);
router.delete('/:id', p.remove);
router.post('/:id/rotate-key', p.rotateKey);
router.get('/:id/alerts', p.alerts);
router.get('/:id/stats/overview', s.overview);
router.get('/:id/stats/vitals', s.vitals);
router.get('/:id/stats/timeseries', s.timeseries);
router.get('/:id/stats/breakdown', s.breakdown);
router.get('/:id/stats/errors', s.errors);

// WCAG Accessibility Audit Endpoints
router.post('/:id/audits', auditLimiter, a.runAudit);
router.get('/:id/audits', a.listAudits);
router.get('/:id/audits/:auditId', a.getAudit);
router.delete('/:id/audits/:auditId', a.deleteAudit);

// Lab Performance Audit Endpoints (URL-based, no snippet needed)
router.post('/:id/perf-audits', auditLimiter, pa.runPerfAudit);
router.get('/:id/perf-audits', pa.listPerfAudits);
router.get('/:id/perf-audits/:auditId', pa.getPerfAudit);
router.delete('/:id/perf-audits/:auditId', pa.deletePerfAudit);

export default router;
