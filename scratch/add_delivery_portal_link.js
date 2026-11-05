const fs = require('fs');

const sidebarPath = 'vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx';
let content = fs.readFileSync(sidebarPath, 'utf8');

if (!content.includes("href: '/delivery'")) {
  if (!content.includes('ExternalLink,')) {
    content = content.replace('  SlidersHorizontal,', '  SlidersHorizontal,\n  ExternalLink,');
  }

  const staffAnchor = "{ icon: Bike, label: 'Delivery Staff', href: '/owner/delivery-staff', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },";
  const portalItem = `${staffAnchor}\n  { icon: ExternalLink, label: 'Driver App Portal', href: '/delivery', color: 'text-purple-600', bg: 'bg-purple-100/70' },`;
  
  content = content.replace(staffAnchor, portalItem);
  fs.writeFileSync(sidebarPath, content, 'utf8');
  console.log('Added Driver App Portal link to Cafe sidebar!');
}
