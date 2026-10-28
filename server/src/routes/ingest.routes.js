import { Router } from 'express';
import express from 'express';
import { ingest } from '../controllers/ingest.controller.js';

const router = Router();
// sendBeacon sends text/plain, json is for everything else
router.post('/', express.text({ type: 'text/plain', limit: '64kb' }), express.json({ limit: '64kb' }), ingest);
export default router;
