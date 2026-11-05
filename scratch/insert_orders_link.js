const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../vexa-fahara-user/app/components/layout/CustomerNavbar.jsx');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split(/\r?\n/);
const eol = content.includes('\r\n') ? '\r\n' : '\n';

// Line 363 has href="/customer/bookings"
// Look at lines 360-370
console.log(lines.slice(360, 372));

const insertIndex = 362; // Before <Link href="/customer/bookings"
const newLinks = [
  '                    <Link ',
  '                      href="/customer/orders" ',
  '                      onClick={() => setIsProfileMenuOpen(false)}',
  '                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-[#FFF5F5] hover:text-[#E50914] transition-colors"',
  '                    >',
  '                      <ShoppingBag size={14} /> My Food Orders',
  '                    </Link>',
  ''
];

lines.splice(insertIndex, 0, ...newLinks);
fs.writeFileSync(file, lines.join(eol), 'utf8');
console.log('Successfully injected My Food Orders link!');

