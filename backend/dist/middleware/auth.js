import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
const JWT_SECRET = process.env.JWT_SECRET || 'ethiomap-secret';
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
export function signToken(user) {
    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h');
    return jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET, { expiresIn });
}
// Middleware: requires a valid JWT. Attaches req.user on success.
export async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
    // Verify user still exists and is active in DB
    try {
        const result = await pool.query('SELECT id, username, email, role, is_active FROM users WHERE id = $1', [payload.id]);
        const user = result.rows[0];
        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Account is inactive. Please contact an administrator.' });
        }
        req.user = { id: user.id, username: user.username, email: user.email, role: user.role };
        next();
    }
    catch (err) {
        console.error('Auth middleware DB error:', err);
        return res.status(500).json({ error: 'Authentication check failed.' });
    }
}
// Middleware: requires admin role (use after requireAuth)
export function requireAdmin(req, res, next) {
    if (!req.user)
        return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}
// Helper: Extract clean IPv4 address (normalizes ::1 and ::ffff:127.0.0.1 to 127.0.0.1)
export function getClientIp(req) {
    const raw = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    let ip = raw.replace(/^::ffff:/, '');
    if (ip === '::1')
        ip = '127.0.0.1';
    return ip;
}
// Helper: write one row to activity_logs
export async function logActivity(params) {
    try {
        await pool.query(`INSERT INTO activity_logs
         (user_id, username, action, resource_type, resource_id, resource_name, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::inet)`, [
            params.userId || null,
            params.username || null,
            params.action,
            params.resourceType || null,
            params.resourceId || null,
            params.resourceName || null,
            JSON.stringify(params.details || {}),
            params.ipAddress || null,
        ]);
    }
    catch (err) {
        console.error('Failed to write activity log:', err);
        // Non-fatal — never block the main request
    }
}
