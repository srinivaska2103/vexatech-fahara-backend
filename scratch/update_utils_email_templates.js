const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/utils/emailTemplates.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace support emails
content = content.replace(/info@fahara\.in/g, 'vexatech.connect@gmail.com');
content = content.replace(/support@fahara\.in/g, 'vexatech.connect@gmail.com');

// Set Grab2Go branding
content = content.replace(/alt="Fahara"/gi, 'alt="Grab2GO"');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated src/utils/emailTemplates.js');

