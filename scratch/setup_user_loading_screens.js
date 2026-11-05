const fs = require('fs');
const path = require('path');

const userRoutes = [
  'food', 'cart', 'checkout', 'orders', 'bookings', 'favorites',
  'profile', 'payment', 'notifications', 'settings'
];

userRoutes.forEach(r => {
  const dir = path.join('vexa-fahara-user/app/customer', r);
  if (fs.existsSync(dir)) {
    const loadingFile = path.join(dir, 'loading.jsx');
    const title = r.replace('-', ' ');
    const content = `'use client';\n\nimport FoodLoadingScreen from '@/app/components/common/FoodLoadingScreen';\n\nexport default function Loading() {\n  return <FoodLoadingScreen message="Loading ${title}..." fullScreen={true} />;\n}\n`;
    fs.writeFileSync(loadingFile, content, 'utf8');
    console.log('Created ' + loadingFile);
  }
});

