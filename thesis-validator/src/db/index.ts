/**
 * Database Connection Module
 *
 * PostgreSQL connection pool management
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
    });
  }
  return pool;
}

/**
 * Close database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, 'migrations');
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Get already executed migrations
    const { rows: executed } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const executedSet = new Set(executed.map(r => r.filename));

    // Read and execute pending migrations
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (!executedSet.has(file)) {
        console.log(`[DB] Running migration: ${file}`);

        // Wrap each migration in a transaction
        await client.query('BEGIN');
        try {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`[DB] Completed migration: ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    }
  } finally {
    client.release();
  }
}
