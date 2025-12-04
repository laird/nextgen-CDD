#!/usr/bin/env npx tsx
/**
 * Run Database Migrations
 *
 * Executes all SQL migration files in the migrations/ directory
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import pg from 'pg';

const { Pool } = pg;

/**
 * Run all migrations
 */
async function runMigrations(): Promise<void> {
  const DATABASE_URL = process.env['DATABASE_URL'];

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🚀 Running database migrations...\n');

  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database\n');

    // Get all migration files
    const migrationsDir = join(process.cwd(), 'migrations');
    const files = await readdir(migrationsDir);
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Sort to ensure correct order (001, 002, 003)

    if (sqlFiles.length === 0) {
      console.log('No migration files found');
      return;
    }

    // Run each migration
    for (const file of sqlFiles) {
      console.log(`Running migration: ${file}`);
      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, 'utf-8');

      await pool.query(sql);
      console.log(`  ✓ ${file} completed\n`);
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
