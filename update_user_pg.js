const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase'
});

async function main() {
  try {
    await pool.query("UPDATE users SET bank_name='HDFC Bank', account_holder='Test Cafe Two', account_number='123456789012345', ifsc_code='HDFC0001234' WHERE email='infotrixsolutions82@gmail.com'");
    console.log("Updated dummy bank details");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

main();
