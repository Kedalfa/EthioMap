import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { requireAuth, requireAdmin, logActivity } from '../middleware/auth.js';
const router = Router();
const SALT_ROUNDS = 12;
// All user routes require authentication
router.use(requireAuth);
// GET /api/users — list all users (admin only)
router.get('/', requireAdmin, async (_req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, email, role, is_active, created_at, avatar_url
       FROM users ORDER BY created_at DESC`);
        res.json(result.rows);
    }
    catch (err) {
        console.error('Error listing users:', err);
        res.status(500).json({ error: 'Could not load users.' });
    }
});
import { validatePassword } from '../utils/passwordPolicy.js';
// POST /api/users — create a new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email and password are required.' });
    }
    // Enforce strong password policy (8+ digits/chars, upper, lower, number, special char)
    const validation = validatePassword(String(password));
    if (!validation.valid) {
        return res.status(400).json({ error: validation.message });
    }
    const allowedRoles = ['admin', 'user'];
    const userRole = allowedRoles.includes(role) ? role : 'user';
    try {
        const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
        const result = await pool.query(`INSERT INTO users (username, email, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, is_active, created_at`, [String(username).trim(), String(email).trim().toLowerCase(), passwordHash, userRole, req.user.id]);
        const newUser = result.rows[0];
        await logActivity({
            userId: req.user.id, username: req.user.username,
            action: 'create_user', resourceType: 'user',
            resourceId: newUser.id, resourceName: newUser.username,
        });
        res.status(201).json(newUser);
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists.' });
        }
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Could not create user.' });
    }
});
// PUT /api/users/:id — update role or active status (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    const { role, is_active } = req.body;
    const allowedRoles = ['admin', 'user'];
    try {
        const result = await pool.query(`UPDATE users
       SET role = COALESCE(CASE WHEN $1 = ANY($2::text[]) THEN $1 ELSE role END, role),
           is_active = COALESCE($3, is_active),
           failed_attempts = CASE WHEN $3 = TRUE THEN 0 ELSE failed_attempts END,
           locked_until = CASE WHEN $3 = TRUE THEN NULL ELSE locked_until END
       WHERE id = $4
       RETURNING id, username, email, role, is_active, created_at`, [role || null, allowedRoles, is_active !== undefined ? is_active : null, req.params.id]);
        if (!result.rowCount)
            return res.status(404).json({ error: 'User not found.' });
        const updated = result.rows[0];
        const action = is_active === false ? 'deactivate_user' : is_active === true ? 'activate_user' : 'update_user';
        await logActivity({
            userId: req.user.id, username: req.user.username,
            action, resourceType: 'user',
            resourceId: updated.id, resourceName: updated.username,
            details: { role, is_active }
        });
        res.json(updated);
    }
    catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Could not update user.' });
    }
});
// DELETE /api/users/:id — soft delete (deactivate) a user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    try {
        const result = await pool.query(`UPDATE users SET is_active = FALSE WHERE id = $1
       RETURNING id, username`, [req.params.id]);
        if (!result.rowCount)
            return res.status(404).json({ error: 'User not found.' });
        const deactivated = result.rows[0];
        await logActivity({
            userId: req.user.id, username: req.user.username,
            action: 'deactivate_user', resourceType: 'user',
            resourceId: deactivated.id, resourceName: deactivated.username,
        });
        res.status(204).end();
    }
    catch (err) {
        console.error('Error deactivating user:', err);
        res.status(500).json({ error: 'Could not deactivate user.' });
    }
});
export default router;
