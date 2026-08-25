const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase' });
pool.query("SELECT * FROM cafes WHERE name='Test Cafe 2'").then(res => console.log(res.rows[0])).catch(console.error).finally(() => pool.end());
