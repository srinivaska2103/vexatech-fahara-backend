const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/offers/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace categories extraction
content = content.replace(
  '  const categories = categoriesData || [];',
  '  const categories = Array.isArray(categoriesData?.data) ? categoriesData.data : (Array.isArray(categoriesData) ? categoriesData : []);'
);

// Replace menuItems extraction
content = content.replace(
  '  const menuItems = itemsData || [];',
  '  const menuItems = Array.isArray(itemsData?.data) ? itemsData.data : (Array.isArray(itemsData) ? itemsData : []);'
);

// In OfferModal ensure menuItems & categories are safely defaulted to arrays
content = content.replace(
  'function OfferModal({ isOpen, offer, categories, menuItems, onClose, onSuccess }) {',
  'function OfferModal({ isOpen, offer, categories = [], menuItems = [], onClose, onSuccess }) {\n  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];\n  const safeCategories = Array.isArray(categories) ? categories : [];'
);

// Replace menuItems.map and categories.map in modal with safe variants
content = content.replace(
  'menuItems.map((item) => {',
  'safeMenuItems.map((item) => {'
);
content = content.replace(
  'categories.map((cat) => {',
  'safeCategories.map((cat) => {'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed menuItems.map and categories.map type safety in offers/page.jsx!');

