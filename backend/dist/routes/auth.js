import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { signToken, requireAuth, logActivity, getClientIp } from '../middleware/auth.js';
const router = Router();
// Rate-limit state (in-memory per IP — lightweight, works without Redis)
const loginAttempts = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10; // max 10 attempts per window
function checkRateLimit(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true; // allowed
    }
    entry.count += 1;
    if (entry.count > RATE_MAX)
        return false; // blocked
    return true;
}
function clearRateLimit(ip) {
    loginAttempts.delete(ip);
}
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const ip = getClientIp(req);
    // IP-level rate limit
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes and try again.' });
    }
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        const result = await pool.query(`SELECT id, username, email, password_hash, role, is_active, failed_attempts, locked_until
       FROM users WHERE username = $1`, [String(username).trim()]);
        const user = result.rows[0];
        if (!user) {
            // Don't reveal whether username exists
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is inactive. Contact an administrator.' });
        }
        // Account lockout check
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
            return res.status(423).json({ error: `Account locked after too many failed attempts. Try again in ${minutesLeft} minute(s).` });
        }
        const passwordMatch = await bcrypt.compare(String(password), user.password_hash);
        if (!passwordMatch) {
            // Increment failed attempts; lock after 5
            const newAttempts = (user.failed_attempts || 0) + 1;
            const lockedUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
            await pool.query(`UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`, [newAttempts, lockedUntil, user.id]);
            if (lockedUntil) {
                await logActivity({ userId: user.id, username: user.username, action: 'account_locked', resourceType: 'session', ipAddress: ip });
                return res.status(423).json({ error: 'Account locked for 15 minutes after 5 failed attempts.' });
            }
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        // Successful login — reset counters
        await pool.query(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id]);
        clearRateLimit(ip);
        const token = signToken({ id: user.id, username: user.username, email: user.email, role: user.role });
        await logActivity({
            userId: user.id, username: user.username,
            action: 'login', resourceType: 'session', ipAddress: ip
        });
        res.json({
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});
// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    await logActivity({
        userId: req.user.id, username: req.user.username,
        action: 'logout', resourceType: 'session', ipAddress: ip
    });
    res.json({ message: 'Logged out successfully.' });
});
import { validatePassword } from '../utils/passwordPolicy.js';
const SALT_ROUNDS = 12;
// GET /api/auth/me — return current user info
router.get('/me', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, email, role, is_active, created_at FROM users WHERE id = $1`, [req.user.id]);
        if (!result.rowCount) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const u = result.rows[0];
        res.json({
            user: {
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
                is_active: u.is_active,
                createdAt: u.created_at
            }
        });
    }
    catch (err) {
        res.json({ user: req.user });
    }
});
// PUT /api/auth/profile — update profile email/username
router.post('/profile', requireAuth, async (req, res) => {
    const { email, username } = req.body;
    if (!email && !username) {
        return res.status(400).json({ error: 'Username or email is required.' });
    }
    try {
        const newEmail = email ? String(email).trim().toLowerCase() : null;
        const newUsername = username ? String(username).trim() : null;
        const result = await pool.query(`UPDATE users
       SET email = COALESCE($1, email),
           username = COALESCE($2, username)
       WHERE id = $3
       RETURNING id, username, email, role, is_active, created_at`, [newEmail, newUsername, req.user.id]);
        if (!result.rowCount) {
            return res.status(404).json({ error: 'User account not found.' });
        }
        const updatedUser = result.rows[0];
        const newToken = signToken({
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role
        });
        await logActivity({
            userId: updatedUser.id, username: updatedUser.username,
            action: 'edit_profile', resourceType: 'user',
            resourceId: updatedUser.id, resourceName: updatedUser.username,
            ipAddress: getClientIp(req)
        });
        res.json({
            token: newToken,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                role: updatedUser.role,
                is_active: updatedUser.is_active,
                createdAt: updatedUser.created_at
            }
        });
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email is already taken by another account.' });
        }
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Could not update profile information.' });
    }
});
// PUT /api/auth/change-password — update user password
router.put('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    // Validate strong password policy (8+ chars, upper, lower, number, special char)
    const validation = validatePassword(String(newPassword));
    if (!validation.valid) {
        return res.status(400).json({ error: validation.message });
    }
    try {
        const userRes = await pool.query(`SELECT id, username, password_hash FROM users WHERE id = $1`, [req.user.id]);
        if (!userRes.rowCount) {
            return res.status(404).json({ error: 'User account not found.' });
        }
        const user = userRes.rows[0];
        const passwordMatch = await bcrypt.compare(String(currentPassword), user.password_hash);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }
        const newHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
        await pool.query(`UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`, [newHash, user.id]);
        await logActivity({
            userId: user.id, username: user.username,
            action: 'change_password', resourceType: 'user',
            resourceId: user.id, resourceName: user.username,
            ipAddress: getClientIp(req)
        });
        res.json({ message: 'Password updated successfully.' });
    }
    catch (err) {
        console.error('Password update error:', err);
        res.status(500).json({ error: 'Could not change password.' });
    }
});
export default router;
