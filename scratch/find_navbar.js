const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../vexa-fahara-user/app/components/layout/CustomerNavbar.jsx');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
lines.forEach((l, idx) => {
  if (l.includes('bookings')) {
    console.log(idx, JSON.stringify(l));
  }
});

