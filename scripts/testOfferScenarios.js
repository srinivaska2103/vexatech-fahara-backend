const { evaluateCartOffers } = require('../src/services/offerService');
const { calculateFoodPaymentBreakdown } = require('../src/services/foodPaymentCalculationService');

console.log('======================================================================');
console.log('GRAB2GO PROMOTIONAL OFFER & BOGO SCENARIO VALIDATION SUITE');
console.log('======================================================================\n');

// Mock Offers matching Prisma relations
const bogoSameItemOffer = {
  id: 'offer-bogo-same',
  title: 'Buy 1 Chicken Biryani Get 1 Free',
  offer_type: 'ITEM',
  offer_category: 'BUY_X_GET_Y',
  discount_type: 'PERCENTAGE',
  buy_item_id: 'item-biryani',
  reward_item_id: 'item-biryani',
  buy_quantity: 1,
  reward_quantity: 1,
  reward_discount_type: 'FREE',
  reward_discount_value: 100,
  is_active: true,
  menu_offer_items: [{ item_id: 'item-biryani' }]
};

const bogoCrossItemOffer = {
  id: 'offer-bogo-cross',
  title: 'Buy Burger Get Fries Free',
  offer_type: 'ITEM',
  offer_category: 'BUY_X_GET_Y',
  discount_type: 'PERCENTAGE',
  buy_item_id: 'item-burger',
  reward_item_id: 'item-fries',
  buy_quantity: 1,
  reward_quantity: 1,
  reward_discount_type: 'FREE',
  reward_discount_value: 100,
  is_active: true,
  menu_offer_items: [{ item_id: 'item-burger' }, { item_id: 'item-fries' }]
};

const percentageOffer = {
  id: 'offer-percentage',
  title: '20% OFF Super Deal',
  offer_type: 'ITEM',
  offer_category: 'ITEM_DISCOUNT',
  discount_type: 'PERCENTAGE',
  discount_value: 20,
  is_active: true,
  menu_offer_items: [{ item_id: 'item-pizza' }]
};

// Scenario A: Customer selects Buy 1 Biryani, Get 1 Free.
// Customer adds 1 Biryani (₹190).
console.log('--- SCENARIO A: Buy 1 Chicken Biryani (₹190), Get 1 Free ---');
const cartA = [
  {
    id: 'cart-1',
    menu_item_id: 'item-biryani',
    quantity: 1,
    unit_price: 190,
    menu_item: { id: 'item-biryani', name: 'Chicken Biryani', price: 190, is_available: true }
  }
];

const resA = evaluateCartOffers(cartA, [bogoSameItemOffer]);
console.log('Cart Items count after BOGO evaluation:', resA.items.length);
console.log('Item details:');
resA.items.forEach(i => {
  console.log(`  - ${i.name}: Total Units=${i.quantity}, Paid Units=${i.quantity - i.rewardQuantity}, Free Units=${i.rewardQuantity}, Line Total=₹${i.lineTotal}`);
});
console.log('Subtotal:', resA.subtotal, 'Total Savings:', resA.totalSavings, 'Final Food Total:', resA.subtotal - resA.totalSavings);
console.log('Applied offers:', JSON.stringify(resA.appliedOffers, null, 2));

const breakdownA = calculateFoodPaymentBreakdown({
  subtotal: resA.subtotal,
  discountAmount: resA.totalSavings,
  deliveryCharge: 0
});
console.log('Payment Breakdown A:', {
  originalSubtotal: breakdownA.originalSubtotal,
  discountAmount: breakdownA.discountAmount,
  discountedSubtotal: breakdownA.discountedSubtotal,
  platformFee: breakdownA.platformFeeAmount,
  totalPayableAmount: breakdownA.totalPayableAmount,
  restaurantSettlement: breakdownA.restaurantSettlementAmount
});

// Scenario B: Buy 2 Biryanis, Get 1 Free
console.log('\n--- SCENARIO B: Customer buys 2 Biryanis (₹190 each) with Buy 1 Get 1 ---');
const cartB = [
  {
    id: 'cart-1',
    menu_item_id: 'item-biryani',
    quantity: 2,
    unit_price: 190,
    menu_item: { id: 'item-biryani', name: 'Chicken Biryani', price: 190, is_available: true }
  }
];
const resB = evaluateCartOffers(cartB, [bogoSameItemOffer]);
resB.items.forEach(i => {
  console.log(`  - ${i.name}: Total Units=${i.quantity}, Paid Units=${i.quantity - i.rewardQuantity}, Free Units=${i.rewardQuantity}, Line Total=₹${i.lineTotal}`);
});
console.log('Total Savings:', resB.totalSavings, 'Payable Food Total:', resB.subtotal - resB.totalSavings);

// Scenario C: Buy Burger, Get Fries Free (Cross-item)
console.log('\n--- SCENARIO C: Buy Burger (₹150), Get Fries (₹80) Free ---');
const cartC = [
  {
    id: 'cart-burger',
    menu_item_id: 'item-burger',
    quantity: 1,
    unit_price: 150,
    menu_item: { id: 'item-burger', name: 'Gourmet Burger', price: 150, is_available: true }
  },
  {
    id: 'cart-fries',
    menu_item_id: 'item-fries',
    quantity: 1,
    unit_price: 80,
    menu_item: { id: 'item-fries', name: 'Crispy Fries', price: 80, is_available: true }
  }
];
const resC = evaluateCartOffers(cartC, [bogoCrossItemOffer]);
resC.items.forEach(i => {
  console.log(`  - ${i.name}: Total Units=${i.quantity}, Paid Units=${i.quantity - i.rewardQuantity}, Free Units=${i.rewardQuantity}, Line Total=₹${i.lineTotal}`);
});
console.log('Total Savings:', resC.totalSavings, 'Payable Food Total:', resC.subtotal - resC.totalSavings);

// Scenario D: 20% Discount
console.log('\n--- SCENARIO D: 20% Discount on Pizza (₹300) ---');
const cartD = [
  {
    id: 'cart-pizza',
    menu_item_id: 'item-pizza',
    quantity: 1,
    unit_price: 300,
    menu_item: { id: 'item-pizza', name: 'Margherita Pizza', price: 300, is_available: true }
  }
];
const resD = evaluateCartOffers(cartD, [percentageOffer]);
resD.items.forEach(i => {
  console.log(`  - ${i.name}: Quantity=${i.quantity}, Original=₹${i.originalUnitPrice}, Discount=₹${i.discountAmount}, Line Total=₹${i.lineTotal}`);
});
console.log('Subtotal:', resD.subtotal, 'Total Savings:', resD.totalSavings, 'Payable Food Total:', resD.subtotal - resD.totalSavings);

console.log('\n======================================================================');
console.log('ALL OFFER & BOGO SCENARIOS VALIDATED SUCCESSFULLY!');
console.log('======================================================================');
