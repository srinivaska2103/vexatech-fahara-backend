const fs = require('fs');
const path = require('path');
const filePath = path.resolve(__dirname, '../../vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
console.log('Lines 41-56:');
for (let i = 41; i <= 56; i++) {
  console.log(i + ':', JSON.stringify(lines[i]));
}

