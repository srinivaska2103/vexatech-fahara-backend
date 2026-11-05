const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexa-fahara-user/app/components/home/HomeNavbar.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Insert Offers link into HomeNavbar
const oldNav = `<Link href="/register" className="hover:text-[#E50914] transition-colors py-1">
            Discover
          </Link>`;

const newNav = `<Link href="/register" className="hover:text-[#E50914] transition-colors py-1">
            Discover
          </Link>
          <Link href="/offers" className="text-[#FF6B00] hover:text-[#E50914] font-black transition-colors py-1 flex items-center gap-1">
            <span>Offers</span>
            <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse" />
          </Link>`;

if (!content.includes('href="/offers"')) {
  content = content.replace(oldNav, newNav);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('HomeNavbar updated with Offers link!');
} else {
  console.log('Offers link already in HomeNavbar');
}

