const { updateVendorBankDetails } = require('./src/services/cashfreeVendorService');
const cafeService = require('./src/services/cafeService');

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING BANK VERIFICATION & SINGLE VENDOR TESTS');
  console.log('====================================================\n');

  // Test 1: Mismatched account numbers
  try {
    await updateVendorBankDetails({
      vendorId: 'VND_TEST_123',
      accountNumber: '1234567890',
      confirmAccountNumber: '1234567899',
      accountHolder: 'Test Holder',
      ifsc: 'HDFC0001234'
    });
    console.error('❌ Test 1 (Mismatched Account Numbers): FAILED');
  } catch (err) {
    if (err.message.includes('do not match')) {
      console.log('✔ Test 1 (Mismatched Account Numbers Validation): PASSED');
    } else {
      console.error('❌ Test 1 (Mismatched Account Numbers): FAILED with unexpected error:', err.message);
    }
  }

  // Test 2: Invalid IFSC Format
  try {
    await updateVendorBankDetails({
      vendorId: 'VND_TEST_123',
      accountNumber: '1234567890',
      confirmAccountNumber: '1234567890',
      accountHolder: 'Test Holder',
      ifsc: 'INVALID_IFSC'
    });
    console.error('❌ Test 2 (Invalid IFSC): FAILED');
  } catch (err) {
    if (err.message.includes('IFSC')) {
      console.log('✔ Test 2 (Invalid IFSC Validation): PASSED');
    } else {
      console.error('❌ Test 2 (Invalid IFSC): FAILED with unexpected error:', err.message);
    }
  }

  // Test 3: Successful Vendor Bank Update Execution
  try {
    const res = await updateVendorBankDetails({
      vendorId: 'VND_CAFE_TEST_001',
      accountNumber: '98765432109012',
      confirmAccountNumber: '98765432109012',
      accountHolder: 'Ramesh Kumar',
      ifsc: 'HDFC0001234',
      phone: '9876543210',
      email: 'ramesh@fahara.com'
    });

    console.log('Vendor Bank Update Result:', res);

    if (
      res.vendorId === 'VND_CAFE_TEST_001' &&
      res.bankAccountLast4 === '9012' &&
      res.bankVerificationStatus === 'VERIFIED' &&
      res.bankIfsc === 'HDFC0001234'
    ) {
      console.log('✔ Test 3 (Vendor Bank Details Update & Last 4 Extraction): PASSED');
    } else {
      console.error('❌ Test 3 (Vendor Bank Details Update): FAILED', res);
    }
  } catch (err) {
    console.error('❌ Test 3 Error:', err.message);
  }

  // Test 4: Successful Event Manager Vendor Bank Update Execution
  try {
    const res = await updateVendorBankDetails({
      vendorId: 'VND_EVENT_TEST_002',
      accountNumber: '11223344556677',
      confirmAccountNumber: '11223344556677',
      accountHolder: 'Priya Sharma Events',
      ifsc: 'ICIC0001234',
      phone: '9876543211',
      email: 'priya@fahara.com'
    });

    console.log('Event Manager Bank Update Result:', res);

    if (
      res.vendorId === 'VND_EVENT_TEST_002' &&
      res.bankAccountLast4 === '6677' &&
      res.bankVerificationStatus === 'VERIFIED' &&
      res.bankIfsc === 'ICIC0001234'
    ) {
      console.log('✔ Test 4 (Event Manager Bank Update & Verification): PASSED');
    } else {
      console.error('❌ Test 4 (Event Manager Bank Update): FAILED', res);
    }
  } catch (err) {
    console.error('❌ Test 4 Error:', err.message);
  }

  console.log('\n====================================================');
  console.log('ALL BANK ACCOUNT VERIFICATION UNIT TESTS COMPLETED');
  console.log('====================================================');
}

runTests();
