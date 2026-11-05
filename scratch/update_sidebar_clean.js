const fs = require('fs');
const path = require('path');
const filePath = path.resolve(__dirname, '../../vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
const eol = content.includes('\r\n') ? '\r\n' : '\n';

// 1. Replace lines 41 to 54 (0-indexed) with the two arrays
const newMenuArrays = [
  "const mainMenuItems = [",
  "  { icon: LayoutDashboard, label: 'Dashboard', href: '/owner/dashboard', color: 'text-amber-600', bg: 'bg-amber-100/70' },",
  "  { icon: Store, label: 'Cafe Management', href: '/owner/cafes', color: 'text-indigo-600', bg: 'bg-indigo-100/70' },",
  "  { icon: Armchair, label: 'Table Seating', href: '/owner/tables', color: 'text-amber-700', bg: 'bg-amber-100/70' },",
  "  { icon: CalendarCheck, label: 'Bookings', href: '/owner/bookings', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },",
  "  { icon: CalendarDays, label: 'Availability Calendar', href: '/owner/bookings/calendar', color: 'text-amber-700', bg: 'bg-amber-100/70' },",
  "  { icon: CalendarDays, label: 'Events', href: '/owner/events', color: 'text-cyan-600', bg: 'bg-cyan-100/70' },",
  "];",
  "",
  "const foodOrderMenuItems = [",
  "  { icon: ShoppingBag, label: 'Food Orders', href: '/owner/orders', color: 'text-rose-600', bg: 'bg-rose-100/70' },",
  "  { icon: UtensilsCrossed, label: 'Menu Management', href: '/owner/menu', color: 'text-[#E50914]', bg: 'bg-[#FFF5F5]' },",
  "  { icon: BadgePercent, label: 'Discounts & Offers', href: '/owner/offers', color: 'text-[#FF6B00]', bg: 'bg-[#FFF5F5]' },",
  "  { icon: Bike, label: 'Delivery Staff', href: '/owner/delivery-staff', color: 'text-emerald-600', bg: 'bg-emerald-100/70' },",
  "  { icon: SlidersHorizontal, label: 'Fulfilment Settings', href: '/owner/fulfilment', color: 'text-blue-600', bg: 'bg-blue-100/70' },",
  "  { icon: ExternalLink, label: 'Driver App Portal', href: '/delivery', color: 'text-purple-600', bg: 'bg-purple-100/70' },",
  "];"
];

lines.splice(41, 14, ...newMenuArrays);

let updatedCode = lines.join(eol);

// 2. Add visibleFoodOrderMenuItems after visibleMainMenuItems
const targetVisible = `  const visibleMainMenuItems = mainMenuItems.filter(item => {
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

const replacementVisible = targetVisible + eol + eol + '  const visibleFoodOrderMenuItems = foodOrderMenuItems;';

if (updatedCode.includes(targetVisible)) {
  updatedCode = updatedCode.replace(targetVisible, replacementVisible);
} else {
  const targetVisibleCRLF = targetVisible.replace(/\n/g, '\r\n');
  const replacementVisibleCRLF = replacementVisible.replace(/\n/g, '\r\n');
  if (updatedCode.includes(targetVisibleCRLF)) {
    updatedCode = updatedCode.replace(targetVisibleCRLF, replacementVisibleCRLF);
  } else {
    console.error('Failed to find visibleMainMenuItems block');
    process.exit(1);
  }
}

// 3. Add Orders & Delivery group in the JSX
const targetJsx = `          <SidebarGroup label="Main Menu">
            {visibleMainMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>`;

const replacementJsx = `          <SidebarGroup label="Main Menu">
            {visibleMainMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>

          <SidebarGroup label="Orders & Delivery">
            {visibleFoodOrderMenuItems.map((item) => (
              <SidebarItem key={item.label} {...item} isLocked={!isSubActive && !item.isUnlockedAlways} />
            ))}
          </SidebarGroup>`;

if (updatedCode.includes(targetJsx)) {
  updatedCode = updatedCode.replace(targetJsx, replacementJsx);
} else {
  const targetJsxCRLF = targetJsx.replace(/\n/g, '\r\n');
  const replacementJsxCRLF = replacementJsx.replace(/\n/g, '\r\n');
  if (updatedCode.includes(targetJsxCRLF)) {
    updatedCode = updatedCode.replace(targetJsxCRLF, replacementJsxCRLF);
  } else {
    console.error('Failed to find SidebarGroup block');
    process.exit(1);
  }
}

fs.writeFileSync(filePath, updatedCode, 'utf8');
console.log('Successfully updated Sidebar.jsx with 2 clean categories!');

