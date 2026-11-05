const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// Replace menu arrays
const oldMainDecl = `const mainMenuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/owner/dashboard', color: 'text-amber-600', bg: 'bg-amber-100/70' },
  { icon: Store, label: 'Cafe Management', href: '/owner/cafes', color: 'text-indigo-600', bg: 'bg-indigo-100/70' },
  { icon: UtensilsCrossed, label: 'Menu Management', href: '/owner/menu', color: 'text-[#E50914]', bg: 'bg-[#FFF5F5]' },
  { icon: BadgePercent, label: 'Discounts & Offers', href: '/owner/offers', color: 'text-[#FF6B00]', bg: 'bg-[#FFF5F5]' },
  { icon: ShoppingBag, label: 'Food Orders', href: '/owner/orders', color: 'text-rose-600', bg: 'bg-rose-100/70' },
  { icon: Bike, label: 'Delivery Staff', href: '/owner/delivery-staff', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },
  { icon: ExternalLink, label: 'Driver App Portal', href: '/delivery', color: 'text-purple-600', bg: 'bg-purple-100/70' },
  { icon: SlidersHorizontal, label: 'Fulfilment Settings', href: '/owner/fulfilment', color: 'text-blue-600', bg: 'bg-blue-100/70' },
  { icon: Armchair, label: 'Table Seating', href: '/owner/tables', color: 'text-amber-700', bg: 'bg-amber-100/70' },
  { icon: CalendarCheck, label: 'Bookings', href: '/owner/bookings', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },
  { icon: CalendarDays, label: 'Availability Calendar', href: '/owner/bookings/calendar', color: 'text-amber-700', bg: 'bg-amber-100/70' },
  { icon: CalendarDays, label: 'Events', href: '/owner/events', color: 'text-cyan-600', bg: 'bg-cyan-100/70' },
];`;

const newMenusDecl = `const mainMenuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/owner/dashboard', color: 'text-amber-600', bg: 'bg-amber-100/70' },
  { icon: Store, label: 'Cafe Management', href: '/owner/cafes', color: 'text-indigo-600', bg: 'bg-indigo-100/70' },
  { icon: Armchair, label: 'Table Seating', href: '/owner/tables', color: 'text-amber-700', bg: 'bg-amber-100/70' },
  { icon: CalendarCheck, label: 'Bookings', href: '/owner/bookings', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },
  { icon: CalendarDays, label: 'Availability Calendar', href: '/owner/bookings/calendar', color: 'text-amber-700', bg: 'bg-amber-100/70' },
  { icon: CalendarDays, label: 'Events', href: '/owner/events', color: 'text-cyan-600', bg: 'bg-cyan-100/70' },
];

const foodOrderMenuItems = [
  { icon: ShoppingBag, label: 'Food Orders', href: '/owner/orders', color: 'text-rose-600', bg: 'bg-rose-100/70' },
  { icon: UtensilsCrossed, label: 'Menu Management', href: '/owner/menu', color: 'text-[#E50914]', bg: 'bg-[#FFF5F5]' },
  { icon: BadgePercent, label: 'Discounts & Offers', href: '/owner/offers', color: 'text-[#FF6B00]', bg: 'bg-[#FFF5F5]' },
  { icon: Bike, label: 'Delivery Staff', href: '/owner/delivery-staff', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },
  { icon: SlidersHorizontal, label: 'Fulfilment Settings', href: '/owner/fulfilment', color: 'text-blue-600', bg: 'bg-blue-100/70' },
  { icon: ExternalLink, label: 'Driver App Portal', href: '/delivery', color: 'text-purple-600', bg: 'bg-purple-100/70' },
];`;

if (code.includes(oldMainDecl)) {
  code = code.replace(oldMainDecl, newMenusDecl);
} else {
  const oldMainDeclCRLF = oldMainDecl.replace(/\n/g, '\r\n');
  const newMenusDeclCRLF = newMenusDecl.replace(/\n/g, '\r\n');
  if (code.includes(oldMainDeclCRLF)) {
    code = code.replace(oldMainDeclCRLF, newMenusDeclCRLF);
  } else {
    console.error('Could not find oldMainDecl in Sidebar.jsx');
    process.exit(1);
  }
}

// In component body: add visibleFoodOrderMenuItems
const oldVisibleCode = `  const visibleMainMenuItems = mainMenuItems.filter(item => {
    if (isWalkingCafe) {
      return item.label !== 'Events' && item.label !== 'Table Seating' && item.label !== 'Bookings';
    }
    if (isRestaurantOwner) {
      return item.label !== 'Events';
    }
    return true;
  }).map(item => {
    if (isRestaurantOwner && item.label === 'Cafe Management') {
      return { ...item, label: 'Restaurant Management' };
    }
    return item;
  });`;

const newVisibleCode = `  const visibleMainMenuItems = mainMenuItems.filter(item => {
    if (isWalkingCafe) {
      return item.label !== 'Events' && item.label !== 'Table Seating' && item.label !== 'Bookings';
    }
    if (isRestaurantOwner) {
      return item.label !== 'Events';
    }
    return true;
  }).map(item => {
    if (isRestaurantOwner && item.label === 'Cafe Management') {
      return { ...item, label: 'Restaurant Management' };
    }
    return item;
  });

  const visibleFoodOrderMenuItems = foodOrderMenuItems;`;

if (code.includes(oldVisibleCode)) {
  code = code.replace(oldVisibleCode, newVisibleCode);
} else {
  const oldVisibleCodeCRLF = oldVisibleCode.replace(/\n/g, '\r\n');
  const newVisibleCodeCRLF = newVisibleCode.replace(/\n/g, '\r\n');
  if (code.includes(oldVisibleCodeCRLF)) {
    code = code.replace(oldVisibleCodeCRLF, newVisibleCodeCRLF);
  } else {
    console.error('Could not find oldVisibleCode in Sidebar.jsx');
    process.exit(1);
  }
}

// In JSX render:
const oldJsx = `          <SidebarGroup label="Main Menu">
            {visibleMainMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>`;

const newJsx = `          <SidebarGroup label="Main Menu">
            {visibleMainMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>

          <SidebarGroup label="Orders & Delivery">
            {visibleFoodOrderMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>`;

if (code.includes(oldJsx)) {
  code = code.replace(oldJsx, newJsx);
} else {
  const oldJsxCRLF = oldJsx.replace(/\n/g, '\r\n');
  const newJsxCRLF = newJsx.replace(/\n/g, '\r\n');
  if (code.includes(oldJsxCRLF)) {
    code = code.replace(oldJsxCRLF, newJsxCRLF);
  } else {
    console.error('Could not find oldJsx in Sidebar.jsx');
    process.exit(1);
  }
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated Sidebar.jsx to split menu into 2 categories!');
