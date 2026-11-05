const fs = require('fs');

let service = fs.readFileSync('vexatech-fahara-fd-cafe/services/customer.service.js', 'utf8');

if (!service.includes('getCustomerFoodOrders')) {
  const code = [
    '  // Get customer food orders',
    '  getCustomerFoodOrders: async (id) => {',
    '    try {',
    '      const response = await axiosInstance.get(`/customers/owner/${id}/orders`);',
    '      return response.data;',
    '    } catch (error) {',
    '      if (error.response?.status === 404) return { data: [] };',
    '      throw error;',
    '    }',
    '  },',
    ''
  ].join('\n');

  service = service.replace('  // Get customer bookings', code + '  // Get customer bookings');
  fs.writeFileSync('vexatech-fahara-fd-cafe/services/customer.service.js', service, 'utf8');
  console.log('Customer service updated with getCustomerFoodOrders');
}

let hook = fs.readFileSync('vexatech-fahara-fd-cafe/hooks/customer/index.js', 'utf8');
if (!hook.includes('useCustomerFoodOrders')) {
  const hookCode = [
    'export const useCustomerFoodOrders = (id) => {',
    '  return useQuery({',
    "    queryKey: ['customer-food-orders', id],",
    '    queryFn: () => customerService.getCustomerFoodOrders(id),',
    '    enabled: !!id,',
    '  });',
    '};',
    ''
  ].join('\n');

  hook = hook.replace('export const useCustomerBookings = (id) => {', hookCode + 'export const useCustomerBookings = (id) => {');
  fs.writeFileSync('vexatech-fahara-fd-cafe/hooks/customer/index.js', hook, 'utf8');
  console.log('Customer hook updated with useCustomerFoodOrders');
}

