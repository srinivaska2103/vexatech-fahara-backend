const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase' });
pool.query("SELECT p.id, p.package_name FROM cafe_packages p JOIN cafes c ON p.cafe_id = c.id WHERE c.name='Test Cafe 2'").then(res => console.log('Packages:', res.rows)).catch(console.error).finally(() => pool.end());
