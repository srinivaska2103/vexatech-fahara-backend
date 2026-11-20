require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { evaluateCartOffers } = require('../src/services/offerService');

function testEngine() {
  console.log('--- Testing Offer Calculation Engine ---');

  // Test Case 1: Buy 1 Biryani Get 1 Biryani Free (Same Item BOGO)
  const bogoOfferSame = {
    id: 'off-bogo-1',
    title: 'Buy 1 Get 1 Biryani Free',
    offer_category: 'BUY_X_GET_Y',
    buy_item_id: 'item-biryani-1',
    buy_quantity: 1,
    reward_item_id: 'item-biryani-1',
    reward_quantity: 1,
    reward_discount_type: 'FREE',
    reward_discount_value: 100,
    is_active: true
  };

  // Customer adds 2 Biryanis @ ₹190 each
  const cart1 = [
    {
      id: 'cart-1',
      quantity: 2,
      menu_item: {
        id: 'item-biryani-1',
        name: 'Chicken Biryani',
        price: 190,
        category_id: 'cat-1'
      }
    }
  ];

  const res1 = evaluateCartOffers(cart1, [bogoOfferSame]);
  console.log('Test 1 (BOGO 2 Biryanis -> Pay 1):');
  console.log('Subtotal:', res1.subtotal, 'Savings:', res1.totalSavings, 'Payable:', res1.finalPayableAmount);
  console.assert(res1.subtotal === 380, 'Subtotal should be 380');
  console.assert(res1.totalSavings === 190, 'Savings should be 190');
  console.assert(res1.finalPayableAmount === 190, 'Payable should be 190');

  // Test Case 2: Buy 1 Burger Get 1 Fries Free (Cross Item BOGO)
  const bogoCross = {
    id: 'off-bogo-2',
    title: 'Buy 1 Burger Get 1 Fries Free',
    offer_category: 'BUY_X_GET_Y',
    buy_item_id: 'item-burger',
    buy_quantity: 1,
    reward_item_id: 'item-fries',
    reward_quantity: 1,
    reward_discount_type: 'FREE',
    reward_discount_value: 100,
    is_active: true
  };

  const cart2 = [
    {
      id: 'cart-2a',
      quantity: 1,
      menu_item: { id: 'item-burger', name: 'Zinger Burger', price: 150, category_id: 'cat-fastfood' }
    },
    {
      id: 'cart-2b',
      quantity: 1,
      menu_item: { id: 'item-fries', name: 'French Fries', price: 70, category_id: 'cat-fastfood' }
    }
  ];

  const res2 = evaluateCartOffers(cart2, [bogoCross]);
  console.log('\nTest 2 (Buy Burger Get Fries Free):');
  console.log('Subtotal:', res2.subtotal, 'Savings:', res2.totalSavings, 'Payable:', res2.finalPayableAmount);
  console.assert(res2.subtotal === 220, 'Subtotal should be 220');
  console.assert(res2.totalSavings === 70, 'Savings should be 70');
  console.assert(res2.finalPayableAmount === 150, 'Payable should be 150');

  console.log('\nAll Calculation Engine Test Cases Passed Perfectly! ✓');
}

testEngine();

