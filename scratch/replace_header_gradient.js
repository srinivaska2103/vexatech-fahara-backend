const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/components/dashboard/DashboardHeader.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace gradient with pure red color #E50914 (bg-[#E50914]) and remove decorative gradient blurs
const oldBanner = `    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#E50914] via-[#B81D24] to-[#141414] text-white p-5 sm:p-7 md:p-8 mb-6 shadow-xl shadow-[#252525]/15 border border-white/10">
      {/* Background Decorative Accents */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-[#E50914]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 -mb-16 w-56 h-56 bg-[#E50914]/30 rounded-full blur-2xl pointer-events-none" />`;

const newBanner = `    <div className="relative overflow-hidden rounded-3xl bg-[#E50914] text-white p-5 sm:p-7 md:p-8 mb-6 shadow-lg shadow-[#E50914]/20 border border-[#B71C1C]/20">`;

if (content.includes(oldBanner)) {
  content = content.replace(oldBanner, newBanner);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully replaced gradient with pure red #E50914!');
} else {
  // If formatting differs slightly, replace the className line
  console.log('Exact match not found, replacing via regex...');
  content = content.replace(
    /bg-gradient-to-r from-\[#E50914\][^\"]*/g,
    'bg-[#E50914]'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Regex replacement completed!');
}

