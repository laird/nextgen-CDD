#!/usr/bin/env npx tsx
/**
 * Run Database Migrations
 *
 * Executes all SQL migration files using the runMigrations function from src/db/index.ts
 */

import 'dotenv/config';
import { runMigrations } from '../src/db/index.js';

async function main(): Promise<void> {
  const DATABASE_URL = process.env['DATABASE_URL'];

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🚀 Running database migrations...\n');

  try {
    await runMigrations();
    console.log('\n✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
