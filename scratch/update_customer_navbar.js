const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../vexa-fahara-user/app/components/layout/CustomerNavbar.jsx');
let code = fs.readFileSync(file, 'utf8');

// 1. Add Utensils to lucide imports if not present
if (!code.includes('Utensils')) {
  code = code.replace("Compass \n} from 'lucide-react';", "Compass, Utensils \n} from 'lucide-react';");
  if (!code.includes('Utensils')) {
    code = code.replace("Compass", "Compass, Utensils");
  }
}

// 2. Add Desktop Nav links next to the Logo
const logoBlock = `            <Link href="/customer/cafe" className="flex items-center gap-2 sm:gap-2.5 hover:scale-105 active:scale-95 transition-transform duration-300">
              <Image 
                src="/grab-it-logo.png" 
                alt="Grab2GO Logo" 
                width={36} 
                height={36} 
                className="object-contain drop-shadow-xs rounded-xl border border-[#EF5350]/40" 
                priority 
              />
              <div className="flex flex-col">
                <span className="text-base sm:text-xl font-black text-[#B71C1C] leading-none tracking-wide">Grab2GO</span>
                <span className="text-[8px] sm:text-[10px] font-extrabold text-stone-400 mt-0.5 tracking-wider uppercase hidden sm:block">Cafe & Event Booking</span>
              </div>
            </Link>`;

const replacementLogoBlock = `            <Link href="/" className="flex items-center gap-2 sm:gap-2.5 hover:scale-105 active:scale-95 transition-transform duration-300">
              <Image 
                src="/grab-it-logo.png" 
                alt="Grab2GO Logo" 
                width={36} 
                height={36} 
                className="object-contain drop-shadow-xs rounded-xl border border-[#EF5350]/40" 
                priority 
              />
              <div className="flex flex-col">
                <span className="text-base sm:text-xl font-black text-[#B71C1C] leading-none tracking-wide">Grab2GO</span>
                <span className="text-[8px] sm:text-[10px] font-extrabold text-stone-400 mt-0.5 tracking-wider uppercase hidden sm:block">Food & Places</span>
              </div>
            </Link>

            {/* Main Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 ml-6 bg-stone-50 p-1 rounded-2xl border border-stone-200/80">
              <Link 
                href="/" 
                className={\`px-3 py-1.5 rounded-xl text-xs font-black transition-all \${pathname === '/' ? 'bg-[#E50914] text-white shadow-2xs' : 'text-stone-600 hover:text-[#E50914] hover:bg-white'}\`}
              >
                Home
              </Link>
              <Link 
                href="/customer/food" 
                className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all \${pathname.startsWith('/customer/food') ? 'bg-[#E50914] text-white shadow-2xs' : 'text-[#E50914] hover:bg-white'}\`}
              >
                <Utensils size={13} /> Food
              </Link>
              <Link 
                href="/customer/cafe" 
                className={\`px-3 py-1.5 rounded-xl text-xs font-black transition-all \${(pathname.startsWith('/customer/cafe') || pathname.startsWith('/customer/discover')) ? 'bg-[#E50914] text-white shadow-2xs' : 'text-stone-600 hover:text-[#E50914] hover:bg-white'}\`}
              >
                Discover & Book
              </Link>
              <Link 
                href="/customer/orders" 
                className={\`px-3 py-1.5 rounded-xl text-xs font-black transition-all \${pathname.startsWith('/customer/orders') ? 'bg-[#E50914] text-white shadow-2xs' : 'text-stone-600 hover:text-[#E50914] hover:bg-white'}\`}
              >
                My Orders
              </Link>
            </nav>`;

if (code.includes(logoBlock)) {
  code = code.replace(logoBlock, replacementLogoBlock);
} else {
  const logoBlockCRLF = logoBlock.replace(/\n/g, '\r\n');
  const replacementLogoBlockCRLF = replacementLogoBlock.replace(/\n/g, '\r\n');
  if (code.includes(logoBlockCRLF)) {
    code = code.replace(logoBlockCRLF, replacementLogoBlockCRLF);
  } else {
    console.error('Could not find logoBlock in CustomerNavbar.jsx');
    process.exit(1);
  }
}

fs.writeFileSync(file, code, 'utf8');
console.log('Successfully updated CustomerNavbar navigation!');

