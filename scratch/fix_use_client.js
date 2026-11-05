const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/menu/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure 'use client'; is line 1
content = content.replace("import { PageContainer } from '@/components/layout/PageContainer';\n'use client';", "'use client';\n\nimport { PageContainer } from '@/components/layout/PageContainer';");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed use client directive placement!');

