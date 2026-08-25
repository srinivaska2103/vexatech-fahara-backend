const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src', 'repositories');
const files = fs.readdirSync(dir);
files.forEach(file => {
  if (!file.endsWith('.js')) return;
  const p = path.join(dir, file);
  let code = fs.readFileSync(p, 'utf8');
  code = code.replace(/const \{ PrismaClient \} = require\('@prisma\/client'\);\r?\n/, '');
  code = code.replace(/const \{ PrismaPg \} = require\('@prisma\/adapter-pg'\);\r?\n/, '');
  code = code.replace(/const \{ Pool \} = require\('pg'\);\r?\n/, '');
  code = code.replace(/const pool = new Pool\(\{ connectionString: process\.env\.DATABASE_URL \}\);\r?\n/, '');
  code = code.replace(/const adapter = new PrismaPg\(pool\);\r?\n/, '');
  code = code.replace(/const prisma = new PrismaClient\(\{ adapter \}\);\r?\n/, '');
  code = code.replace(/^(\s*)/, 'const prisma = require(\'../config/prisma\');\n');
  fs.writeFileSync(p, code);
});
