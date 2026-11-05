const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/app.js');
let app = fs.readFileSync(appPath, 'utf8');

const target = "app.use('/api/v1/cafe', cafeOrderRoutes);";
const routesToAdd = `app.use('/api/v1/cafe', cafeOrderRoutes);
app.get('/api/v1/public/cafes/:cafeId/ordering-availability', require('./controllers/fulfilmentController').getPublicCafeAvailability);
app.get('/api/public/cafes/:cafeId/ordering-availability', require('./controllers/fulfilmentController').getPublicCafeAvailability);`;

if (!app.includes('ordering-availability')) {
  app = app.replace(target, routesToAdd);
  fs.writeFileSync(appPath, app, 'utf8');
  console.log('Successfully mounted public ordering-availability route in app.js!');
} else {
  console.log('Already exists');
}

