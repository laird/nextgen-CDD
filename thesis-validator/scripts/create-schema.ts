#!/usr/bin/env npx tsx
/**
 * Create Database Schema
 *
 * Creates a fresh PostgreSQL schema by running create-schema.sql
 * WARNING: This drops all existing tables!
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function main(): Promise<void> {
  const DATABASE_URL = process.env['DATABASE_URL'];

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will DROP ALL EXISTING TABLES and create a fresh schema.\n');
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  const confirmed = await confirm('Are you sure you want to continue? (yes/no): ');

  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\n🚀 Creating database schema...\n');

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const schemaPath = path.join(__dirname, 'create-schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    await pool.query(sql);

    console.log('✅ Schema created successfully!\n');
    console.log('Tables created:');
    console.log('  - engagements');
    console.log('  - hypotheses');
    console.log('  - hypothesis_edges');
    console.log('  - documents');
    console.log('  - evidence');
    console.log('  - evidence_hypotheses');
    console.log('  - contradictions');
    console.log('  - stress_tests');
    console.log('  - research_metrics');
    console.log('  - research_jobs');
    console.log('  - schema_migrations');
  } catch (error) {
    console.error('❌ Schema creation failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
