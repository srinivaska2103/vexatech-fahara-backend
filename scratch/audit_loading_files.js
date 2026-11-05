const fs = require('fs');
const path = require('path');

function checkLoadingFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== '.next') checkLoadingFiles(full);
    } else if (f === 'loading.jsx') {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.trim().split(/\r?\n/);
      const firstLine = lines[0].trim();
      const hasFoodLoading = content.includes('FoodLoadingScreen');
      console.log(full, 'firstLine:', firstLine, 'hasFoodLoading:', hasFoodLoading);
    }
  }
}

['vexa-fahara-user', 'vexatech-fahara-fd-cafe', 'vexatech-fahara-fd-admin'].forEach(d => checkLoadingFiles(d));

