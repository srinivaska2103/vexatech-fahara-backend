require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function check() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('PG TABLES:', res.rows.map(r => r.table_name));
  } catch (err) {
    console.error('PG ERROR:', err);
  } finally {
    await pool.end();
  }
}

check();

