const fs = require('fs');

const endpointsPath = 'vexatech-fahara-fd-cafe/lib/endpoints.js';
let content = fs.readFileSync(endpointsPath, 'utf8');

if (!content.includes('foodOrders:')) {
  const insertBefore = '  settings: {';
  const foodOrdersEndpoints = `  foodOrders: {
    list: '/cafe/orders',
    stats: '/cafe/orders/stats',
    detail: (id) => \`/cafe/orders/\${id}\`,
    updateStatus: (id) => \`/cafe/orders/\${id}/status\`,
    assignDelivery: (id) => \`/cafe/orders/\${id}/assign-delivery\`,
  },
  fulfilment: {
    getSettings: '/cafe/fulfilment-settings',
    updateSettings: '/cafe/fulfilment-settings',
    employees: '/cafe/delivery-employees',
    employeeDetail: (id) => \`/cafe/delivery-employees/\${id}\`,
    updateEmployeeStatus: (id) => \`/cafe/delivery-employees/\${id}/status\`,
  },
`;
  content = content.replace(insertBefore, foodOrdersEndpoints + insertBefore);
  fs.writeFileSync(endpointsPath, content, 'utf8');
  console.log('Added foodOrders and fulfilment endpoints to endpoints.js!');
} else {
  console.log('foodOrders already present in endpoints.js');
}
