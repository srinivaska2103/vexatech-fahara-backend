const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase'
});

async function main() {
  try {
    const res = await pool.query("SELECT id, name, email, bank_name, account_holder, account_number, ifsc_code FROM users WHERE email='infotrixsolutions82@gmail.com';");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

main();
