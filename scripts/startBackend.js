const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

// Ensure port 3000
process.env.PORT = process.env.PORT || '3000';

require('../src/server.js');
