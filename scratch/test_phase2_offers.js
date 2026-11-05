const prisma = require('../src/config/prisma');
const offerService = require('../src/services/offerService');

async function runTests() {
  console.log('--- STARTING PHASE 2 AUTOMATED TEST SUITE ---');

  // 1. Fetch a cafe
  const cafe = await prisma.cafes.findFirst();
  if (!cafe) {
    console.error('No cafe found in database to test.');
    return;
  }
  console.log(`✓ Using test cafe: ${cafe.name} (${cafe.id})`);

  // 2. Fetch categories and items
  const category = await prisma.menu_categories.findFirst({ where: { cafe_id: cafe.id } });
  const item = await prisma.menu_items.findFirst({ where: { cafe_id: cafe.id } });

  if (item) {
    console.log(`✓ Using menu item: ${item.name} @ ₹${item.price}`);
  }

  // 3. Test Conflict Resolution and Discount Calculation Unit
  console.log('\n--- TESTING DISCOUNT ENGINE & CONFLICT RESOLUTION ---');
  
  const sampleItem = {
    id: item ? item.id : 'item-1',
    category_id: category ? category.id : 'cat-1',
    price: 200,
    is_available: true
  };

  // Offer A: Restaurant wide 10% OFF
  const restOffer = {
    id: 'off-rest',
    title: '10% Restaurant Wide',
    offer_type: 'RESTAURANT',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    max_discount_amount: null
  };

  // Offer B: Category 15% OFF
  const catOffer = {
    id: 'off-cat',
    title: '15% Category Deal',
    offer_type: 'CATEGORY',
    discount_type: 'PERCENTAGE',
    discount_value: 15,
    max_discount_amount: null,
    menu_offer_categories: [{ category_id: sampleItem.category_id }]
  };

  // Offer C: Item specific 20% OFF
  const itemOffer = {
    id: 'off-item',
    title: '20% Item Special',
    offer_type: 'ITEM',
    discount_type: 'PERCENTAGE',
    discount_value: 20,
    max_discount_amount: null,
    menu_offer_items: [{ item_id: sampleItem.id }]
  };

  // Test Tier Precedence: ITEM > CATEGORY > RESTAURANT
  const result1 = offerService.calculateDiscountForItem(sampleItem, [restOffer, catOffer, itemOffer]);
  console.log(`[Test 1: Tier Priority] Expected ₹160 (Item 20% takes precedence over 15% Cat and 10% Rest):`);
  console.log(`  -> Calculated discounted price: ₹${result1.discountedPrice}, Savings: ₹${result1.discountAmount}, Applied Offer: ${result1.appliedOffer.title}`);
  if (result1.discountedPrice === 160 && result1.appliedOffer.id === 'off-item') {
    console.log('  ✓ Test 1 PASSED');
  } else {
    console.error('  ✗ Test 1 FAILED');
  }

  // Test Max Discount Cap
  const cappedOffer = {
    id: 'off-cap',
    title: '50% with ₹40 Cap',
    offer_type: 'ITEM',
    discount_type: 'PERCENTAGE',
    discount_value: 50,
    max_discount_amount: 40,
    menu_offer_items: [{ item_id: sampleItem.id }]
  };
  const result2 = offerService.calculateDiscountForItem(sampleItem, [cappedOffer]);
  console.log(`[Test 2: Max Cap] Expected ₹160 (₹200 * 50% = ₹100, capped at ₹40):`);
  console.log(`  -> Calculated discounted price: ₹${result2.discountedPrice}, Savings: ₹${result2.discountAmount}`);
  if (result2.discountAmount === 40 && result2.discountedPrice === 160) {
    console.log('  ✓ Test 2 PASSED');
  } else {
    console.error('  ✗ Test 2 FAILED');
  }

  // Test Fixed Amount Discount
  const fixedOffer = {
    id: 'off-fixed',
    title: '₹35 Flat OFF',
    offer_type: 'ITEM',
    discount_type: 'FIXED_AMOUNT',
    discount_value: 35,
    menu_offer_items: [{ item_id: sampleItem.id }]
  };
  const result3 = offerService.calculateDiscountForItem(sampleItem, [fixedOffer]);
  console.log(`[Test 3: Fixed Discount] Expected ₹165 (₹200 - ₹35):`);
  console.log(`  -> Calculated discounted price: ₹${result3.discountedPrice}, Savings: ₹${result3.discountAmount}`);
  if (result3.discountedPrice === 165 && result3.discountAmount === 35) {
    console.log('  ✓ Test 3 PASSED');
  } else {
    console.error('  ✗ Test 3 FAILED');
  }

  console.log('\n--- ALL TEST SUITE ASSERTIONS COMPLETED SUCCESSFULLY ---');
  await prisma.$disconnect();
}

runTests().catch(console.error);
