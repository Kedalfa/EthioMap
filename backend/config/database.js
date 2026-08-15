// Load values from backend/.env into process.env.
import dotenv from 'dotenv';
// PostgreSQL client library used to create the connection pool.
import pg from 'pg';

// Read the local environment file before creating the database connection.
dotenv.config();

// Extract the Pool constructor from the pg package.
const { Pool } = pg;
// DATABASE_URL contains the PostgreSQL host, database, username, and password.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is missing. Create backend/.env from backend/.env.example.');
}

// Application settings are exported for use by server.js.
export const port = Number(process.env.PORT || 5000);
export const corsOrigin = !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN;
// Reuse pooled database connections instead of opening one per request.
export const pool = new Pool({ connectionString });

// Log unexpected idle-client errors so database failures are visible in the API terminal.
pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
