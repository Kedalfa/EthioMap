import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/logs — paginated activity log (admin only)
// Query params: ?page=1&limit=50&action=login&username=kaleb
router.get('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(String(req.query.page  || '1'), 10));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const offset = (page - 1) * limit;

    const action   = req.query.action   ? String(req.query.action)   : null;
    const username = req.query.username ? String(req.query.username) : null;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(action);
    }
    if (username) {
      conditions.push(`username ILIKE $${paramIndex++}`);
      values.push(`%${username}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM activity_logs ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const logsResult = await pool.query(
      `SELECT id, user_id, username, action, resource_type, resource_id,
              resource_name, details, ip_address, created_at
       FROM activity_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...values, limit, offset]
    );

    res.json({
      logs: logsResult.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ error: 'Could not load activity logs.' });
  }
});

// GET /api/logs/stats — summary counts for dashboard
router.get('/stats', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [datasets, users, logs, recentLogs] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM datasets'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active = TRUE'),
      pool.query('SELECT COUNT(*) FROM activity_logs'),
      pool.query(
        `SELECT username, action, resource_name, created_at
         FROM activity_logs ORDER BY created_at DESC LIMIT 5`
      ),
    ]);
    res.json({
      totalDatasets: parseInt(datasets.rows[0].count, 10),
      totalUsers:    parseInt(users.rows[0].count, 10),
      totalActions:  parseInt(logs.rows[0].count, 10),
      recentActivity: recentLogs.rows,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

export default router;
