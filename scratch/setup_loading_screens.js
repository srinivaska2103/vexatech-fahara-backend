const fs = require('fs');
const path = require('path');

const cafeRoutes = [
  'orders', 'menu', 'offers', 'delivery-staff', 'fulfilment', 'bookings',
  'payments', 'analytics', 'customers', 'reviews', 'settings', 'subscription', 'notifications'
];

cafeRoutes.forEach(r => {
  const dir = path.join('vexatech-fahara-fd-cafe/app/owner/(dashboard)', r);
  if (fs.existsSync(dir)) {
    const loadingFile = path.join(dir, 'loading.jsx');
    const title = r.replace('-', ' ');
    const content = `'use client';\n\nimport FoodLoadingScreen from '@/components/common/FoodLoadingScreen';\n\nexport default function Loading() {\n  return <FoodLoadingScreen message="Loading ${title}..." fullScreen={true} />;\n}\n`;
    fs.writeFileSync(loadingFile, content, 'utf8');
    console.log('Created ' + loadingFile);
  }
});

// Also for Admin app
const adminLoadingPath = 'vexatech-fahara-fd-admin/src/app/loading.jsx';
if (fs.existsSync(path.dirname(adminLoadingPath))) {
  const adminContent = `'use client';\n\nimport FoodLoadingScreen from '@/components/common/FoodLoadingScreen';\n\nexport default function Loading() {\n  return <FoodLoadingScreen message="Loading Grab2GO Admin..." fullScreen={true} />;\n}\n`;
  fs.writeFileSync(adminLoadingPath, adminContent, 'utf8');
  console.log('Created ' + adminLoadingPath);
}

// Also for Event app if exists
const eventLoadingDir = 'vexatech-fahara-fd-event/app';
if (fs.existsSync(eventLoadingDir)) {
  const eventFoodComp = 'vexatech-fahara-fd-event/components/common/FoodLoadingScreen.jsx';
  fs.mkdirSync(path.dirname(eventFoodComp), { recursive: true });
  fs.copyFileSync('vexa-fahara-user/app/components/common/FoodLoadingScreen.jsx', eventFoodComp);
  const eventLoadingPath = path.join(eventLoadingDir, 'loading.jsx');
  const eventContent = `'use client';\n\nimport FoodLoadingScreen from '@/components/common/FoodLoadingScreen';\n\nexport default function Loading() {\n  return <FoodLoadingScreen message="Loading Grab2GO Events..." fullScreen={true} />;\n}\n`;
  fs.writeFileSync(eventLoadingPath, eventContent, 'utf8');
  console.log('Created ' + eventLoadingPath);
}

