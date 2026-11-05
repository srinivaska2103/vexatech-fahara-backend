const fs = require('fs');
const path = require('path');

// 1. Update globals.css to globally hide the scrollbar thumb in the sidebar and make custom-scrollbar completely hidden
const cssPath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/globals.css');
let css = fs.readFileSync(cssPath, 'utf8');

const scrollbarRules = `
/* Hide scrollbars across sidebar and custom-scrollbar */
.custom-scrollbar,
.custom-scrollbar::-webkit-scrollbar,
aside,
aside *::-webkit-scrollbar,
.scrollbar-none,
.scrollbar-none::-webkit-scrollbar {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}

.custom-scrollbar::-webkit-scrollbar,
aside::-webkit-scrollbar,
aside *::-webkit-scrollbar,
.scrollbar-none::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
}
`;

if (!css.includes('/* Hide scrollbars across sidebar and custom-scrollbar */')) {
  css += scrollbarRules;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('globals.css updated successfully with global scrollbar hiding!');
} else {
  console.log('globals.css already contains scrollbar rules');
}

// 2. Update Sidebar.jsx to explicitly use scrollbar-none
const sidebarPath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/components/layout/Sidebar.jsx');
let sidebar = fs.readFileSync(sidebarPath, 'utf8');
if (sidebar.includes('custom-scrollbar')) {
  sidebar = sidebar.replace(/custom-scrollbar/g, 'scrollbar-none');
  fs.writeFileSync(sidebarPath, sidebar, 'utf8');
  console.log('Sidebar.jsx updated to scrollbar-none!');
} else {
  console.log('Sidebar.jsx already clean');
}

