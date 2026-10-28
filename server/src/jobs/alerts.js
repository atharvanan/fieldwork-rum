import cron from 'node-cron';
import { Event } from '../models/Event.js';
import { Project } from '../models/Project.js';
import { Alert } from '../models/Alert.js';

// runs every minute: one aggregation for all projects, max one alert per project per 15 min
export async function runAlertCheck() {
  const since = new Date(Date.now() - 5 * 60_000);
  const rows = await Event.aggregate([
    { $match: { type: 'error', ts: { $gte: since } } },
    { $group: { _id: '$project', count: { $sum: 1 } } },
  ]);
  if (!rows.length) return;

  const projects = await Project.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('errorThreshold')
    .lean();
  const byId = new Map(projects.map((p) => [String(p._id), p]));

  for (const row of rows) {
    const project = byId.get(String(row._id));
    if (!project?.errorThreshold || row.count < project.errorThreshold) continue;
    const recent = await Alert.exists({ project: row._id, createdAt: { $gte: new Date(Date.now() - 15 * 60_000) } });
    if (recent) continue;
    await Alert.create({
      project: row._id,
      count: row.count,
      message: `${row.count} errors in the last 5 minutes (limit is ${project.errorThreshold}).`,
    });
  }
}

export function startAlertJob() {
  cron.schedule('* * * * *', () => runAlertCheck().catch((e) => console.error('[alerts]', e.message)));
}
