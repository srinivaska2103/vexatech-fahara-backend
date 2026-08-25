require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'event_management_profiles_verification_status_check'")
  .then(res => { console.log(res.rows[0].pg_get_constraintdef); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
