import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS: allow the static Ethio-map frontend (opened as file:// or via Live Server on :5500),
// the Vite dev server on :5173, and any origin configured via CORS_ORIGIN env variable.
const corsOriginEnv = process.env.CORS_ORIGIN;
const allowedOrigins = new Set([
  'http://localhost:5173',   // Vite dev server (Ethio-map-k frontend)
  'http://127.0.0.1:5173',
  'http://localhost:5500',   // VS Code Live Server (Ethio-map static frontend)
  'http://127.0.0.1:5500',
  'http://localhost:5000',   // Legacy Ethio-map backend port (local references)
]);
if (corsOriginEnv && corsOriginEnv !== '*') {
  corsOriginEnv.split(',').map(o => o.trim()).filter(Boolean).forEach(o => allowedOrigins.add(o));
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (file://, curl, Postman, mobile)
    if (!origin) return callback(null, true);
    if (corsOriginEnv === '*' || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));

// Health Check API
app.get('/api/health', async (req, res) => {
  try {
    // Validate database connection is alive
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    console.error('Health check database query failure:', error);
    res.status(500).json({ status: 'error', database: 'disconnected', details: error.message });
  }
});

// Import and mount layers routes
import layersRouter from './routes/layers.js';
import datasetsRouter from './routes/datasets.js';

app.use('/api/layers', layersRouter);
app.use('/api/datasets', datasetsRouter);

// Start listening for HTTP connections
app.listen(PORT, () => {
  console.log(`Ethio-Map backend API server listening on http://localhost:${PORT}`);
});
export default app;
