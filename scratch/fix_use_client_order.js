const fs = require('fs');

const files = [
  'vexa-fahara-user/app/components/common/FaharaLoadingSystem.jsx',
  'vexatech-fahara-fd-cafe/components/common/FaharaLoadingSystem.jsx',
  'vexatech-fahara-fd-admin/src/components/common/FaharaLoadingSystem.jsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Remove all 'use client' and FoodLoadingScreen imports from top
    content = content.replace(/import FoodLoadingScreen from '\.\/FoodLoadingScreen';\r?\n?/g, '');
    content = content.replace(/'use client';\r?\n?/g, '');
    // Prepend 'use client' and import at the very top
    content = `'use client';\n\nimport FoodLoadingScreen from './FoodLoadingScreen';\n` + content.trimStart();
    fs.writeFileSync(f, content, 'utf8');
    console.log('Fixed ' + f);
  }
});

