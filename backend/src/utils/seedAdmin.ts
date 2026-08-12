import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const SALT_ROUNDS = 12;

export async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const email = process.env.ADMIN_EMAIL || 'admin@ethiomap.local';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.warn('[seedAdmin] ADMIN_PASSWORD not set in .env — skipping admin seed.');
    return;
  }

  try {
    // Only create if no admin exists at all
    const existing = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log('[seedAdmin] Admin account already exists — skipping seed.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [username, email, passwordHash]
    );
    console.log(`[seedAdmin] Admin account created: ${username} <${email}>`);
  } catch (err) {
    console.error('[seedAdmin] Failed to seed admin account:', err);
  }
}
