const fs = require('fs');

const sidebarPath = 'vexatech-fahara-fd-admin/src/components/AdminSidebar.jsx';
let content = fs.readFileSync(sidebarPath, 'utf8');

if (!content.includes('/admin/food-orders')) {
  // Add ShoppingBag to lucide imports if needed
  if (!content.includes('ShoppingBag,')) {
    content = content.replace('  LayoutDashboard,', '  LayoutDashboard,\n  ShoppingBag,');
  }

  // Add Food Orders to bookings section
  const anchor = "{ name: 'All Bookings', href: '/admin/bookings', icon: Calendar },";
  const newLink = `${anchor}\n      { name: 'Food Orders', href: '/admin/food-orders', icon: ShoppingBag },`;
  
  content = content.replace(anchor, newLink);
  fs.writeFileSync(sidebarPath, content, 'utf8');
  console.log('Added Food Orders to Admin Sidebar navigation!');
} else {
  console.log('Food Orders already present in Admin Sidebar');
}

