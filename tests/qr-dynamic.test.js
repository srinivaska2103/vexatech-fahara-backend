/**
 * Dynamic QR Code Automated Test Suite
 * Tests all requirements from Specification 12 (F. Automated tests)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const prisma = require('../src/config/prisma');
const qrService = require('../src/services/qrService');
const qrResolutionService = require('../src/services/qrResolutionService');
const cafeService = require('../src/services/cafeService');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Fahara Dynamic QR Verification Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(`   ${err.stack.split('\n')[1]}`);
      failed++;
    }
  }

  // 1. Environment URL Resolution Test
  await test('Local and production environment configurations use their intended origins', async () => {
    const origCustomerAppUrl = process.env.CUSTOMER_APP_URL;
    const origQrCustomerAppUrl = process.env.QR_CUSTOMER_APP_URL;

    try {
      process.env.CUSTOMER_APP_URL = 'http://localhost:3001';
      delete process.env.QR_CUSTOMER_APP_URL;
      assert.strictEqual(qrService.getCustomerAppUrl(), 'http://localhost:3001');

      process.env.QR_CUSTOMER_APP_URL = 'http://192.168.1.7:3001';
      assert.strictEqual(qrService.getCustomerAppUrl(), 'http://192.168.1.7:3001');

      delete process.env.QR_CUSTOMER_APP_URL;
      process.env.CUSTOMER_APP_URL = 'https://fahara.in';
      assert.strictEqual(qrService.getCustomerAppUrl(), 'https://fahara.in');

      // Verify landing URL construction
      const testLandingUrl = qrService.buildQrLandingUrl('qr_sample123');
      assert.strictEqual(testLandingUrl, 'https://fahara.in/q/qr_sample123');
    } finally {
      process.env.CUSTOMER_APP_URL = origCustomerAppUrl;
      if (origQrCustomerAppUrl) process.env.QR_CUSTOMER_APP_URL = origQrCustomerAppUrl;
      else delete process.env.QR_CUSTOMER_APP_URL;
    }
  });

  // 2. Format & Collision Resistance
  await test('QR identifier generator creates stable, unique format (qr_*)', async () => {
    const id1 = qrService.generateQrCodeId();
    const id2 = qrService.generateQrCodeId();
    assert.ok(id1.startsWith('qr_'), 'id1 should start with qr_');
    assert.ok(id2.startsWith('qr_'), 'id2 should start with qr_');
    assert.notStrictEqual(id1, id2, 'id1 and id2 must be distinct');
  });

  // 3. Repeated image generation produces QR codes with the same destination
  await test('Repeated image generation produces QR codes with the same destination', async () => {
    const qrId = 'qr_test_repeat_123';
    const qr1 = await qrService.generateQrDataUrl(qrId);
    const qr2 = await qrService.generateQrDataUrl(qrId);
    assert.strictEqual(qr1.landingUrl, qr2.landingUrl, 'Landing URLs must match');
    assert.strictEqual(qr1.dataUrl, qr2.dataUrl, 'Data URLs for identical payload must match');
  });

  // 4. Existing cafes receive identifiers through an idempotent backfill
  await test('All cafes in the database possess a valid, persistent qr_code_id', async () => {
    const cafesWithoutQr = await prisma.cafes.findMany({
      where: {
        OR: [
          { qr_code_id: null },
          { qr_code_id: '' }
        ]
      }
    });
    assert.strictEqual(cafesWithoutQr.length, 0, 'No cafes should lack qr_code_id after backfill');
  });

  // 5. Different cafes have different identifiers
  let sampleCafes = await prisma.cafes.findMany({
    take: 2,
    select: { id: true, name: true, qr_code_id: true, owner_id: true, status: true }
  });
  assert.ok(sampleCafes.length >= 2, 'Need at least 2 cafes for testing');

  await test('Different cafes have different identifiers', async () => {
    const [c1, c2] = sampleCafes;
    assert.ok(c1.qr_code_id, 'Cafe 1 must have qr_code_id');
    assert.ok(c2.qr_code_id, 'Cafe 2 must have qr_code_id');
    assert.notStrictEqual(c1.qr_code_id, c2.qr_code_id, 'Different cafes must have distinct QR identifiers');
  });

  // 6. QR resolution uses current canonical cafe route
  await test('QR resolution returns current canonical cafe details route', async () => {
    const cafe = sampleCafes[0];
    const resolved = await qrResolutionService.resolveQrCode(cafe.qr_code_id);
    assert.strictEqual(resolved.cafeId, cafe.id);
    assert.strictEqual(resolved.canonicalRoute, `/customer/cafe/${cafe.id}`);
  });

  // 7. Cafe name change or update does not invalidate QR
  await test('A cafe name or details update does not invalidate or alter its QR', async () => {
    const cafe = sampleCafes[0];
    const initialQrId = cafe.qr_code_id;

    // Simulate update through cafeService
    const originalName = cafe.name;
    const testUpdatedName = `${originalName} [QR Test]`;

    // Fetch owner for authorization
    const owner = await prisma.users.findUnique({ where: { id: cafe.owner_id } });
    await cafeService.updateCafe(owner.id, cafe.id, { name: testUpdatedName });

    // Verify QR ID did NOT change in database
    const refreshed = await prisma.cafes.findUnique({
      where: { id: cafe.id },
      select: { qr_code_id: true, name: true }
    });
    assert.strictEqual(refreshed.qr_code_id, initialQrId, 'qr_code_id must remain unchanged after update');

    // Revert name back
    await cafeService.updateCafe(owner.id, cafe.id, { name: originalName });

    // Verify resolve still works
    const resolved = await qrResolutionService.resolveQrCode(initialQrId);
    assert.strictEqual(resolved.cafeId, cafe.id);
  });

  // 8. Unknown identifiers return a safe not-found response
  await test('Unknown identifiers return safe not-found error with status 404', async () => {
    try {
      await qrResolutionService.resolveQrCode('qr_nonexistent_99999999');
      assert.fail('Should have thrown an error for unknown QR');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'QR_NOT_FOUND');
    }
  });

  // 9. Ineligible cafes cannot bypass visibility rules
  await test('Ineligible cafe returns isEligible: false and proper reason', async () => {
    // Find an INACTIVE or unapproved cafe
    let inactiveCafe = await prisma.cafes.findFirst({
      where: { status: 'INACTIVE', qr_code_id: { not: null } }
    });

    if (inactiveCafe) {
      const resolved = await qrResolutionService.resolveQrCode(inactiveCafe.qr_code_id);
      assert.strictEqual(resolved.isEligible, false, 'Inactive cafe must not be eligible');
      assert.ok(resolved.visibilityReason, 'Must include visibilityReason');
    } else {
      console.log('   (Skipping inactive check: all test cafes are active)');
    }
  });

  // 10. One owner cannot manage another owner\'s QR
  await test('One owner cannot manage or view another owner\'s QR code', async () => {
    const cafe = sampleCafes[0];
    const fakeOtherUser = {
      id: '00000000-0000-0000-0000-000000000000',
      roles: { name: 'CAFE_OWNER' }
    };

    try {
      await qrResolutionService.getCafeQrData(cafe.id, fakeOtherUser);
      assert.fail('Should have rejected unauthorized owner');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
    }
  });

  // 11. Creating a cafe creates exactly one persistent QR identifier
  await test('Creating a cafe generates and persists a unique QR identifier', async () => {
    const owner = await prisma.users.findFirst({
      where: {
        roles: { name: { in: ['CAFE_OWNER', 'WALKING_CAFE_OWNER'] } }
      }
    });

    if (!owner) {
      console.log('   (No cafe owner found to test creation; skipping)');
      return;
    }

    // Check count first to not exceed 3 cafes limit
    const count = await prisma.cafes.count({ where: { owner_id: owner.id } });
    if (count >= 3) {
      console.log('   (Owner already has max 3 cafes, creating a temporary test owner)');
      const tempOwner = await prisma.users.create({
        data: {
          name: 'QR Test Owner',
          email: `qr_owner_test_${Date.now()}@vexatech.in`,
          phone: `99999${Math.floor(10000 + Math.random() * 90000)}`,
          roles: { connect: { name: 'CAFE_OWNER' } }
        }
      });

      const newCafe = await cafeService.createCafe(tempOwner.id, {
        name: 'Auto Test Cafe QR',
        category: 'Coffee Shop',
        city: 'Madurai'
      });

      assert.ok(newCafe.qr_code_id, 'New cafe must have qr_code_id');
      assert.ok(newCafe.qr_code_id.startsWith('qr_'));

      // Clean up test cafe and owner
      await prisma.cafes.delete({ where: { id: newCafe.id } });
      await prisma.users.delete({ where: { id: tempOwner.id } });
    } else {
      const newCafe = await cafeService.createCafe(owner.id, {
        name: 'Auto Test Cafe QR',
        category: 'Coffee Shop',
        city: 'Madurai'
      });

      assert.ok(newCafe.qr_code_id, 'New cafe must have qr_code_id');
      assert.ok(newCafe.qr_code_id.startsWith('qr_'));

      // Clean up
      await prisma.cafes.delete({ where: { id: newCafe.id } });
    }
  });

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
