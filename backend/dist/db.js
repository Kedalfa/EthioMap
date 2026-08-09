import pg from 'pg';
import dotenv from 'dotenv';
// Load environmental parameters
dotenv.config();
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('WARNING: DATABASE_URL is not set in environmental variables.');
}
export const pool = new Pool({
    connectionString,
});
pool.on('error', (err) => {
    console.error('Unexpected database client pool error:', err);
});
