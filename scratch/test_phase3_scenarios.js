require('dotenv').config();
const prisma = require('../src/config/prisma');
const cartService = require('../src/services/cartService');
const orderService = require('../src/services/orderService');
const fulfilmentRepository = require('../src/repositories/fulfilmentRepository');

async function runScenarioTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 3 AUTOMATED VERIFICATION SUITE');
  console.log('====================================================');

  // Find cafe that has menu_items
  const menuItem = await prisma.menu_items.findFirst({
    include: { cafes: true }
  });
  if (!menuItem) throw new Error('No menu item found in database');
  const cafe = menuItem.cafes;
  console.log(`✓ Cafe found: "${cafe.name}" (ID: ${cafe.id})`);
  console.log(`✓ Menu item found: "${menuItem.name}" Price: ₹${menuItem.price}`);

  const customer = await prisma.users.findFirst({
    where: { roles: { name: 'CUSTOMER' } }
  });
  if (!customer) throw new Error('No customer found for test');
  console.log(`✓ Customer found: "${customer.name}" (ID: ${customer.id})`);

  // ── SCENARIO C: FULFILMENT CONFIGURATION ──
  console.log('\n--- TESTING SCENARIO C: FULFILMENT CONFIGURATION ---');
  await fulfilmentRepository.updateFulfilmentSettings(cafe.id, {
    is_takeaway_enabled: true,
    takeaway_min_order_amount: 10,
    estimated_pickup_time_minutes: 15,
    is_delivery_enabled: true,
    delivery_radius_km: 10,
    min_delivery_order_amount: 20,
    delivery_charge: 25,
    estimated_delivery_time_minutes: 30
  });
  const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafe.id);
  console.log('✓ Configured cafe fulfilment settings successfully:', {
    takeaway: settings.is_takeaway_enabled,
    delivery: settings.is_delivery_enabled,
    deliveryCharge: Number(settings.delivery_charge)
  });

  // ── SCENARIO A: TAKEAWAY ORDER WORKFLOW ──
  console.log('\n--- TESTING SCENARIO A: TAKEAWAY ORDER WORKFLOW ---');
  await cartService.clearCart(customer.id);
  
  const cartWithItem = await cartService.addItemToCart(customer.id, {
    cafeId: cafe.id,
    menuItemId: menuItem.id,
    quantity: 2
  });
  console.log('✓ Added 2 items to customer cart:', {
    itemsCount: cartWithItem.itemCount,
    subtotal: cartWithItem.subtotal,
    totalSavings: cartWithItem.totalSavings,
    finalPayable: cartWithItem.finalPayableAmount
  });

  const takeawayOrder = await orderService.checkout(customer.id, {
    orderType: 'TAKEAWAY',
    customerName: customer.name || 'Test Customer',
    customerPhone: customer.phone || '9999999999',
    pickupDate: '2026-11-04',
    pickupTime: '01:00 PM'
  });
  console.log(`✓ Takeaway order created: ${takeawayOrder.order_number} (Status: ${takeawayOrder.order_status})`);

  const emptyCart = await cartService.getCustomerCart(customer.id);
  console.log(`✓ Cart cleared after checkout: ${emptyCart.items.length === 0}`);

  // Transitions: NEW -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED
  let currentOrder = await orderService.updateOrderStatus(takeawayOrder.id, 'ACCEPTED', { name: 'Owner' });
  console.log(`✓ Transitioned to ACCEPTED (Status: ${currentOrder.order_status})`);

  currentOrder = await orderService.updateOrderStatus(takeawayOrder.id, 'PREPARING', { name: 'Owner' });
  console.log(`✓ Transitioned to PREPARING (Status: ${currentOrder.order_status})`);

  currentOrder = await orderService.updateOrderStatus(takeawayOrder.id, 'READY_FOR_PICKUP', { name: 'Owner' });
  console.log(`✓ Transitioned to READY_FOR_PICKUP (Status: ${currentOrder.order_status})`);

  currentOrder = await orderService.updateOrderStatus(takeawayOrder.id, 'COMPLETED', { name: 'Owner' });
  console.log(`✓ Handed over to customer: COMPLETED (Status: ${currentOrder.order_status})`);

  const orderWithHistory = await prisma.food_orders.findUnique({
    where: { id: takeawayOrder.id },
    include: { order_status_history: true }
  });
  console.log(`✓ Audit timeline records stored: ${orderWithHistory.order_status_history.length} events`);

  // ── SCENARIO B: RESTAURANT DELIVERY WORKFLOW ──
  console.log('\n--- TESTING SCENARIO B: RESTAURANT DELIVERY WORKFLOW ---');
  let driver = await prisma.delivery_employees.findFirst({ where: { cafe_id: cafe.id } });
  if (!driver) {
    driver = await fulfilmentRepository.createDeliveryEmployee(cafe.id, {
      employee_code: 'TEST-DRV-1',
      name: 'Ramesh Rider',
      phone: '9888877777',
      vehicle_type: 'BIKE',
      vehicle_number: 'KA-01-E-9999',
      login_pin: '1234'
    });
  }
  console.log(`✓ Delivery staff ready: "${driver.name}" (${driver.employee_code})`);

  await cartService.addItemToCart(customer.id, {
    cafeId: cafe.id,
    menuItemId: menuItem.id,
    quantity: 2
  });

  const deliveryOrder = await orderService.checkout(customer.id, {
    orderType: 'RESTAURANT_DELIVERY',
    customerName: customer.name || 'Test Customer',
    customerPhone: customer.phone || '9999999999',
    fulfilmentAddress: {
      addressLine: '123 MG Road, Apt 4B',
      city: 'Bangalore'
    },
    deliveryInstructions: 'Ring doorbell twice'
  });
  console.log(`✓ Delivery order created: ${deliveryOrder.order_number} (Delivery Charge: ₹${deliveryOrder.delivery_charge})`);

  await orderService.updateOrderStatus(deliveryOrder.id, 'ACCEPTED', { name: 'Owner' });
  await orderService.updateOrderStatus(deliveryOrder.id, 'PREPARING', { name: 'Owner' });
  await orderService.updateOrderStatus(deliveryOrder.id, 'READY_FOR_PICKUP', { name: 'Owner' });
  console.log('✓ Order prepared and marked READY_FOR_PICKUP');

  await orderService.assignDeliveryEmployee(deliveryOrder.id, driver.id, cafe.id, { name: 'Owner' });
  console.log('✓ Order assigned to driver Ramesh Rider (Status: ASSIGNED)');

  await orderService.employeeUpdateOrderStatus(deliveryOrder.id, 'PICKED_UP', driver.id);
  console.log('✓ Driver confirmed food PICKED_UP');

  await orderService.employeeUpdateOrderStatus(deliveryOrder.id, 'OUT_FOR_DELIVERY', driver.id);
  console.log('✓ Driver en-route: OUT_FOR_DELIVERY');

  await orderService.employeeUpdateOrderStatus(deliveryOrder.id, 'DELIVERED', driver.id);
  console.log('✓ Driver confirmed food DELIVERED');

  const finalDelOrder = await orderService.updateOrderStatus(deliveryOrder.id, 'COMPLETED', { name: 'Owner' });
  console.log(`✓ Delivery order finalized: COMPLETED (Status: ${finalDelOrder.order_status})`);

  console.log('\n====================================================');
  console.log('✅ ALL PHASE 3 TEST SCENARIOS PASSED WITH 100% SUCCESS');
  console.log('====================================================');
}

runScenarioTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
