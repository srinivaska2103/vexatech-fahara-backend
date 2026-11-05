const fs = require('fs');

// 1. In foodOrderEmailTemplates.js: remove <img> logo, keep stylish Grab2Go typography
const foodFile = 'vexatech-fahara-backend/src/services/email/foodOrderEmailTemplates.js';
let foodTemplates = fs.readFileSync(foodFile, 'utf8');

foodTemplates = foodTemplates.replace(
  /<table role="presentation" cellspacing="0" cellpadding="0" border="0">\s*<tr>\s*<td style="vertical-align: middle; padding-right: 14px;">[\s\S]*?<\/td>\s*<td style="vertical-align: middle;">/,
  '<table role="presentation" cellspacing="0" cellpadding="0" border="0">\n                      <tr>\n                        <td style="vertical-align: middle;">'
);

fs.writeFileSync(foodFile, foodTemplates, 'utf8');
console.log('Removed logo from ' + foodFile);

// 2. In emailTemplates.js: remove <img> logo, keep stylish Grab2GO text
const utilsFile = 'vexatech-fahara-backend/src/utils/emailTemplates.js';
let utilsTemplates = fs.readFileSync(utilsFile, 'utf8');

utilsTemplates = utilsTemplates.replace(
  /<a href="\${FRONTEND_URL}" target="_blank" style="text-decoration: none; display: inline-block;">\s*<img[\s\S]*?\/>\s*<span style="display: block; margin-top: 8px;/,
  '<a href="${FRONTEND_URL}" target="_blank" style="text-decoration: none; display: inline-block;">\n        <span style="display: block; margin-top: 4px;'
);

fs.writeFileSync(utilsFile, utilsTemplates, 'utf8');
console.log('Removed logo from ' + utilsFile);

