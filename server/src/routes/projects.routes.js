import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loadProject } from '../middleware/project.js';
import * as p from '../controllers/projects.controller.js';
import * as s from '../controllers/stats.controller.js';
import * as a from '../controllers/audit.controller.js';

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
router.post('/:id/audits', a.runAudit);
router.get('/:id/audits', a.listAudits);
router.get('/:id/audits/:auditId', a.getAudit);
router.delete('/:id/audits/:auditId', a.deleteAudit);

export default router;
