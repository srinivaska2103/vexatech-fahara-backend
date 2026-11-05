const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Require Tag or BadgePercent icon if needed
if (!content.includes('BadgePercent')) {
  content = content.replace(
    '  UtensilsCrossed,',
    '  UtensilsCrossed,\n  BadgePercent,'
  );
}

// Add Discounts & Offers right under Menu Management in mainMenuItems
const menuLine = "{ icon: UtensilsCrossed, label: 'Menu Management', href: '/owner/menu', color: 'text-[#E50914]', bg: 'bg-[#FFF5F5]' },";
const offerLine = "{ icon: UtensilsCrossed, label: 'Menu Management', href: '/owner/menu', color: 'text-[#E50914]', bg: 'bg-[#FFF5F5]' },\n  { icon: BadgePercent, label: 'Discounts & Offers', href: '/owner/offers', color: 'text-[#FF6B00]', bg: 'bg-[#FFF5F5]' },";

if (!content.includes("label: 'Discounts & Offers'")) {
  content = content.replace(menuLine, offerLine);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Sidebar.jsx updated with Discounts & Offers menu item!');
} else {
  console.log('Discounts & Offers already present in Sidebar');
}

