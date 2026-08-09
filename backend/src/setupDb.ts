import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  try {
    console.log('Connecting to PostgreSQL database...');
    // Test base query
    await pool.query('SELECT 1');
    console.log('Database connection verified.');

    // Resolve file paths
    const schemaPath = path.resolve(__dirname, '../schema.sql');
    const seedPath = path.resolve(__dirname, '../seed.sql');

    // 1. Run schema commands
    console.log(`Reading schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Applying PostGIS schema (tables & indexes)...');
    await pool.query(schemaSql);
    console.log('Schema applied successfully.');

    // 2. Run seed commands
    console.log(`Reading seed data from: ${seedPath}`);
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    console.log('Inserting seed records (regions, cities, corridors)...');
    await pool.query(seedSql);
    console.log('Database seeded successfully.');

    console.log('Database setup complete. Closing pool.');
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Database setup failed:', error.message || error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

setup();
