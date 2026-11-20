const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app.js');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes("'/api/v1/marketing'")) {
  s = s.replace(
    "app.use('/api/v1/gift-rewards', require('./routes/giftRewardRoutes'));",
    "app.use('/api/v1/gift-rewards', require('./routes/giftRewardRoutes'));\napp.use('/api/v1/marketing', require('./routes/marketingRoutes'));"
  );
  fs.writeFileSync(filePath, s, 'utf8');
  console.log('marketingRoutes mounted in app.js! 🌐✅');
} else {
  console.log('Already mounted.');
}
