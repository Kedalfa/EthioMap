import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { seedAdmin } from './utils/seedAdmin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const corsOriginEnv = process.env.CORS_ORIGIN;
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);
if (corsOriginEnv && corsOriginEnv !== '*') {
  corsOriginEnv.split(',').map(o => o.trim()).filter(Boolean).forEach(o => allowedOrigins.add(o));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOriginEnv === '*' || allowedOrigins.has(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));

// Health Check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', database: 'disconnected', details: error.message });
  }
});

// Routes
import layersRouter   from './routes/layers.js';
import datasetsRouter from './routes/datasets.js';
import authRouter     from './routes/auth.js';
import usersRouter    from './routes/users.js';
import logsRouter     from './routes/logs.js';

app.use('/api/layers',   layersRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/auth',     authRouter);
app.use('/api/users',    usersRouter);
app.use('/api/logs',     logsRouter);

// Start server, migrate schema and seed admin
app.listen(PORT, async () => {
  console.log(`Ethio-Map backend API server listening on http://localhost:${PORT}`);
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
  } catch (e) {
    console.error('Database migration check failed:', e);
  }
  await seedAdmin();
});

export default app;
