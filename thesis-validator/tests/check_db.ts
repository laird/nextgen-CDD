import 'dotenv/config';
import { getPool } from '../src/db/index.js';

async function check() {
    const pool = getPool();

    console.log('Checking tables...');
    const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
    console.log('Tables:', res.rows.map(r => r.table_name));

    console.log('Checking migrations...');
    const migs = await pool.query('SELECT * FROM schema_migrations ORDER BY filename');
    console.log('Migrations:', migs.rows.map(r => r.filename));

    console.log('Checking research_jobs columns...');
    try {
        const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'research_jobs'
    `);
        console.log('Columns:', cols.rows);
    } catch (e) {
        console.log('research_jobs table not found');
    }

    await pool.end();
}

check().catch(console.error);
