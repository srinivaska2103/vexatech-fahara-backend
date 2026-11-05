const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/menu/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Wrap with PageContainer like all other dashboard pages
if (!content.includes("import { PageContainer }")) {
  content = "import { PageContainer } from '@/components/layout/PageContainer';\n" + content;
}

const oldReturn = `<div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">`;
const newReturn = `<PageContainer className="space-y-6">`;

if (content.includes(oldReturn)) {
  content = content.replace(oldReturn, newReturn);
  content = content.replace(/<\/div>\s*\);\s*}\s*\/\/\s*==================== CATEGORY FORM MODAL/, '</PageContainer>\n  );\n}\n\n// ==================== CATEGORY FORM MODAL');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully wrapped menu page with PageContainer!');
} else {
  console.log('oldReturn not found directly, checking...');
}

