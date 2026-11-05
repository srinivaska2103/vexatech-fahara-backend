const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../vexa-fahara-user/app/components/layout/CustomerNavbar.jsx');
let code = fs.readFileSync(file, 'utf8');

const target = `<Link 
                      href="/customer/bookings"`;
const replacement = `<Link 
                      href="/customer/orders" 
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-[#FFF5F5] hover:text-[#E50914] transition-colors"
                    >
                      <ShoppingBag size={14} /> My Food Orders
                    </Link>

                    <Link 
                      href="/customer/bookings"`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(file, code, 'utf8');
  console.log('Successfully added My Food Orders to CustomerNavbar!');
} else {
  console.error('Target not found in CustomerNavbar.jsx');
  process.exit(1);
}

