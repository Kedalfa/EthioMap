import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { signToken, requireAuth, logActivity, getClientIp } from '../middleware/auth.js';

const router = Router();

// Rate-limit state (in-memory per IP — lightweight, works without Redis)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10;                     // max 10 attempts per window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true; // allowed
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) return false; // blocked
  return true;
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
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
    const result = await pool.query(
      `SELECT id, username, email, password_hash, role, is_active, failed_attempts, locked_until
       FROM users WHERE username = $1`,
      [String(username).trim()]
    );

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
      await pool.query(
        `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
        [newAttempts, lockedUntil, user.id]
      );
      if (lockedUntil) {
        await logActivity({ userId: user.id, username: user.username, action: 'account_locked', resourceType: 'session', ipAddress: ip });
        return res.status(423).json({ error: 'Account locked for 15 minutes after 5 failed attempts.' });
      }
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Successful login — reset counters
    await pool.query(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );
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
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  await logActivity({
    userId: req.user!.id, username: req.user!.username,
    action: 'logout', resourceType: 'session', ipAddress: ip
  });
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me — return current user info
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
