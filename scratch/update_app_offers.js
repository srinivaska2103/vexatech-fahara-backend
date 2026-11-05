const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-backend/src/app.js');
let code = fs.readFileSync(filePath, 'utf8');

// Require offerRoutes and offerController
if (!code.includes("const offerRoutes = require('./routes/offerRoutes');")) {
  code = code.replace(
    "const menuRoutes = require('./routes/menuRoutes');",
    "const menuRoutes = require('./routes/menuRoutes');\nconst offerRoutes = require('./routes/offerRoutes');\nconst offerController = require('./controllers/offerController');"
  );
}

// Mount offer routes
const mountPoint = `// Menu Management Routes
app.use('/api/cafe/menu', menuRoutes);
app.use('/api/v1/cafe/menu', menuRoutes);
app.use('/api/v1/menu', menuRoutes);`;

const newMountPoint = `// Menu Management Routes
app.use('/api/cafe/menu', menuRoutes);
app.use('/api/v1/cafe/menu', menuRoutes);
app.use('/api/v1/menu', menuRoutes);

// Discounts & Special Offers Routes
app.use('/api/cafe/offers', offerRoutes);
app.use('/api/v1/cafe/offers', offerRoutes);
app.use('/api/v1/offers', offerRoutes);

// Public Customer Offers API
app.get('/api/public/offers', offerController.getPublicOffers);
app.get('/api/v1/public/offers', offerController.getPublicOffers);
app.get('/api/public/cafes/:cafeId/offers', offerController.getPublicCafeOffers);
app.get('/api/v1/public/cafes/:cafeId/offers', offerController.getPublicCafeOffers);`;

if (!code.includes("app.use('/api/cafe/offers', offerRoutes);")) {
  code = code.replace(mountPoint, newMountPoint);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('app.js updated with offer routes successfully!');

