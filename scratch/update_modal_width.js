const fs = require('fs');
const filePath = 'vexatech-fahara-fd-cafe/app/owner/(dashboard)/offers/page.jsx';
let code = fs.readFileSync(filePath, 'utf8');

// Upgrade modal container max-w-lg to max-w-xl
if (code.includes('max-w-lg w-full border border-[#FEE2E2]')) {
  code = code.replace(
    'max-w-lg w-full border border-[#FEE2E2]',
    'max-w-xl w-full border border-[#FEE2E2]'
  );
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully upgraded modal width to max-w-xl!');
} else {
  console.log('Already updated or pattern not found');
}

