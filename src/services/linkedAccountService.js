const prisma = require('../config/prisma');
const { getRazorpayInstance } = require('../config/razorpay');

/**
 * Gets basic HTTP Authorization header for Razorpay REST API calls.
 */
const getAuthHeader = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
};

/**
 * Gets or creates a Razorpay Linked Account for a Cafe Owner or Event Manager via Razorpay V2 Accounts API.
 */
const getOrCreateLinkedAccount = async ({ user, vendorType, entityId, accountHolder }) => {
  if (!user || !vendorType || !entityId) {
    throw new Error('User, vendorType, and entityId are required to manage Linked Account.');
  }

  // 1. Fetch current record from DB
  let existingRecord = null;
  if (vendorType === 'CAFE') {
    existingRecord = await prisma.cafes.findUnique({ where: { id: entityId } });
  } else if (vendorType === 'EVENT_MANAGER') {
    existingRecord = await prisma.event_management_profiles.findUnique({ where: { id: entityId } });
  }

  if (!existingRecord) {
    throw new Error(`Target entity (${vendorType}) not found for id: ${entityId}`);
  }

  // 2. Check if real Razorpay linked account already exists in DB (must start with 'acc_')
  const currentAccountId = existingRecord.payment_account_id || existingRecord.razorpay_linked_account_id;
  if (currentAccountId && currentAccountId.startsWith('acc_')) {
    return {
      success: true,
      accountId: currentAccountId,
      status: existingRecord.razorpay_account_status || 'ACTIVE',
      bankVerificationStatus: existingRecord.bank_verification_status || 'PENDING',
      isNew: false
    };
  }

  // 3. Create Linked Account via Razorpay V2 Accounts API
  const razorpay = getRazorpayInstance();
  let newAccountId = null;
  let accountStatus = 'ACTIVE';

  const accountEmail = (user.email && String(user.email).trim().includes('@'))
    ? String(user.email).trim()
    : `vendor_${entityId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}@fahara.com`;

  // Always prioritize account holder name (person's bank account name) over business/cafe name
  const accountHolderName = String(
    accountHolder ||
    existingRecord.bank_account_holder ||
    user.account_holder ||
    user.name ||
    user.business_name ||
    existingRecord.name ||
    existingRecord.company_name ||
    'Vendor Owner'
  ).trim();

  const cleanPhone = user.phone ? String(user.phone).replace(/\D/g, '').slice(-10) : '9999999999';

  if (!razorpay || typeof razorpay.accounts?.create !== 'function') {
    const err = new Error('Razorpay SDK/API keys are missing or invalid in backend configuration.');
    err.statusCode = 500;
    throw err;
  }

  const INDIAN_STATES_MAP = {
    'KA': 'Karnataka', 'MH': 'Maharashtra', 'TN': 'Tamil Nadu', 'DL': 'Delhi',
    'TS': 'Telangana', 'AP': 'Andhra Pradesh', 'KL': 'Kerala', 'GJ': 'Gujarat',
    'RJ': 'Rajasthan', 'UP': 'Uttar Pradesh', 'MP': 'Madhya Pradesh', 'WB': 'West Bengal',
    'HR': 'Haryana', 'PB': 'Punjab', 'OD': 'Odisha', 'BR': 'Bihar', 'CT': 'Chhattisgarh',
    'JH': 'Jharkhand', 'UT': 'Uttarakhand', 'HP': 'Himachal Pradesh', 'GA': 'Goa',
    'AS': 'Assam', 'TR': 'Tripura', 'ML': 'Meghalaya', 'MN': 'Manipur', 'NL': 'Nagaland',
    'AR': 'Arunachal Pradesh', 'MZ': 'Mizoram', 'SK': 'Sikkim', 'PY': 'Puducherry',
    'CH': 'Chandigarh', 'JK': 'Jammu and Kashmir', 'LA': 'Ladakh', 'AN': 'Andaman and Nicobar Islands'
  };

  const rawState = existingRecord.state || user?.state || 'Karnataka';
  const stateUpper = String(rawState).trim().toUpperCase();
  const cleanState = INDIAN_STATES_MAP[stateUpper] ||
    Object.values(INDIAN_STATES_MAP).find(s => s.toUpperCase() === stateUpper) ||
    (String(rawState).trim().length > 2 ? String(rawState).trim() : 'Karnataka');

  try {
    const accountPayload = {
      email: accountEmail,
      phone: cleanPhone,
      type: 'route',
      legal_business_name: accountHolderName.slice(0, 50),
      business_type: 'individual',
      profile: {
        category: 'services',
        subcategory: 'event_planning',
        addresses: {
          registered: {
            street1: existingRecord.address || existingRecord.address_line1 || user?.address || '123 Main Street',
            street2: existingRecord.address_line2 || 'Locality',
            city: existingRecord.city || user?.city || 'Bengaluru',
            state: cleanState,
            postal_code: existingRecord.postal_code || existingRecord.pincode || user?.pincode || '560001',
            country: 'IN'
          }
        }
      },
      notes: {
        vendor_type: vendorType,
        entity_id: entityId,
        user_id: user.id,
        account_holder: accountHolderName
      }
    };

    const accountResponse = await razorpay.accounts.create(accountPayload);
    if (!accountResponse || !accountResponse.id || !accountResponse.id.startsWith('acc_')) {
      throw new Error(`Razorpay returned invalid account creation response: ${JSON.stringify(accountResponse)}`);
    }
    newAccountId = accountResponse.id;
    accountStatus = accountResponse.status || 'ACTIVE';
  } catch (error) {
    const msg = error.error?.description || error.message || 'Check Razorpay Credentials';
    console.error(`[Razorpay Route Account Creation Error]: ${msg}`);

    // If Razorpay error states the merchant email already exists for an account, recover the existing account ID
    const match = msg.match(/account\s*-\s*([A-Za-z0-9_]+)/i);
    if (match && match[1]) {
      const existingRzpId = match[1].startsWith('acc_') ? match[1] : `acc_${match[1]}`;
      console.log(`[Razorpay Route Account Recovery] Recovered existing Razorpay account ID: ${existingRzpId} for email: ${accountEmail}`);
      newAccountId = existingRzpId;
      accountStatus = 'ACTIVE';
    } else {
      const err = new Error(`Razorpay Account Creation Failed: ${msg}`);
      err.statusCode = error.statusCode || 400;
      throw err;
    }
  }

  // 4. Update Database with newly created Linked Account ID
  if (vendorType === 'CAFE') {
    await prisma.cafes.update({
      where: { id: entityId },
      data: {
        razorpay_linked_account_id: newAccountId,
        payment_account_id: newAccountId,
        payment_account_provider: 'RAZORPAY',
        razorpay_account_status: accountStatus
      }
    });
  } else if (vendorType === 'EVENT_MANAGER') {
    await prisma.event_management_profiles.update({
      where: { id: entityId },
      data: {
        razorpay_linked_account_id: newAccountId,
        payment_account_id: newAccountId,
        payment_account_provider: 'RAZORPAY',
        razorpay_account_status: accountStatus
      }
    });
  }

  return {
    success: true,
    accountId: newAccountId,
    status: accountStatus,
    bankVerificationStatus: existingRecord.bank_verification_status || 'PENDING',
    isNew: true
  };
};

/**
 * Links and verifies bank account details on Razorpay Route product configuration.
 */
const updateBankDetailsAndVerify = async ({
  user,
  vendorType,
  entityId,
  accountNumber,
  confirmAccountNumber,
  accountHolder,
  ifsc,
  phone,
  email
}) => {
  const cleanAccount = String(accountNumber || '').trim();
  const cleanConfirm = String(confirmAccountNumber || '').trim();
  const cleanHolder = String(accountHolder || '').trim();
  const cleanIfsc = String(ifsc || '').trim().toUpperCase();

  if (!cleanAccount || !cleanConfirm) {
    const err = new Error('Bank account number and confirmation are required.');
    err.statusCode = 400;
    throw err;
  }

  if (cleanAccount !== cleanConfirm) {
    const err = new Error('Bank account number and confirmation account number do not match.');
    err.statusCode = 400;
    throw err;
  }

  if (cleanAccount.length < 8 || cleanAccount.length > 20) {
    const err = new Error('Invalid bank account number length. Must be between 8 and 20 digits.');
    err.statusCode = 400;
    throw err;
  }

  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  if (!ifscRegex.test(cleanIfsc)) {
    const err = new Error('Invalid IFSC Code format. Example: HDFC0001234');
    err.statusCode = 400;
    throw err;
  }

  if (!cleanHolder) {
    const err = new Error('Account holder name is required.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Get or Create Linked Account first in Razorpay using the account holder name
  const accountInfo = await getOrCreateLinkedAccount({ user, vendorType, entityId, accountHolder: cleanHolder });
  const accountId = accountInfo.accountId;

  const accountLast4 = cleanAccount.slice(-4);
  const maskedAccount = `XXXX XXXX ${accountLast4}`;
  const referenceId = `VERIF_RZP_${accountId}_${Date.now()}`;

  let verificationMessage = 'Bank account details verified successfully with Razorpay';

  // 2. Call Razorpay Product Route API to attach settlements bank account details
  const authHeader = getAuthHeader();
  if (!authHeader) {
    const err = new Error('Razorpay API keys are missing or invalid in environment config');
    err.statusCode = 500;
    throw err;
  }

  let productId = null;

  // Step 2a: Check if route product already exists for account
  try {
    const getProductsReq = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}/products`, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    const productsData = await getProductsReq.json();
    if (productsData.items && Array.isArray(productsData.items)) {
      const routeProd = productsData.items.find(p => p.product_name === 'route' || p.product_name === 'route_payouts');
      if (routeProd) productId = routeProd.id;
    }
  } catch (getErr) {
    console.warn(`[Razorpay Product Fetch Warning]: ${getErr.message}`);
  }

  // Step 2b: If product not found, request route product creation
  if (!productId) {
    const productReq = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}/products`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product_name: 'route' })
    });
    const productData = await productReq.json();
    productId = productData.id;

    if (!productId) {
      const rzpErr = productData.error?.description || 'Failed to create Route product for Razorpay account.';
      console.error(`[Razorpay Product Route Create Error]: ${rzpErr}`);
      const err = new Error(`Razorpay Product Creation Failed: ${rzpErr}`);
      err.statusCode = productReq.status || 400;
      throw err;
    }
  }

  // Step 2c: Update product settlements bank details
  const patchReq = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tnc_accepted: true,
      settlements: {
        account_number: cleanAccount,
        ifsc_code: cleanIfsc,
        beneficiary_name: cleanHolder
      }
    })
  });
  const patchData = await patchReq.json();

  if (patchData.error) {
    const rzpErr = patchData.error.description || 'Razorpay Bank Verification Failed';
    console.error(`[Razorpay Bank Patch Error]: ${rzpErr}`);
    const err = new Error(`Razorpay Bank Verification Failed: ${rzpErr}`);
    err.statusCode = patchReq.status || 400;
    throw err;
  }

  // 3. Update DB records safely
  const now = new Date();
  const updateData = {
    bank_account_last4: accountLast4,
    bank_account_holder: cleanHolder,
    bank_ifsc: cleanIfsc,
    bank_verification_status: 'VERIFIED',
    bank_verification_reference: referenceId,
    bank_verified_at: now,
    razorpay_account_status: 'ACTIVE'
  };

  if (vendorType === 'CAFE') {
    await prisma.cafes.update({ where: { id: entityId }, data: updateData });
  } else if (vendorType === 'EVENT_MANAGER') {
    await prisma.event_management_profiles.update({ where: { id: entityId }, data: updateData });
  }

  // Also update user bank details for consistency
  if (user?.id) {
    await prisma.users.update({
      where: { id: user.id },
      data: {
        bank_name: 'Connected Bank',
        account_holder: cleanHolder,
        account_number: maskedAccount,
        ifsc_code: cleanIfsc
      }
    }).catch(e => console.warn('Could not update user table bank fields:', e.message));
  }

  // Trigger email notification
  try {
    const emailService = require('../utils/emailService');
    const targetEmail = email || user.email;
    if (targetEmail) {
      await emailService.sendBankVerifiedEmail(targetEmail, cleanHolder, vendorType === 'CAFE' ? 'Cafe Owner' : 'Event Manager', maskedAccount);
    }
  } catch (emailErr) {
    console.error('Failed to send bank verified email:', emailErr.message);
  }

  return {
    success: true,
    accountId,
    bankVerificationStatus: 'VERIFIED',
    bankAccountLast4: accountLast4,
    bankAccountHolder: cleanHolder,
    maskedAccountNumber: maskedAccount,
    bankIfsc: cleanIfsc,
    referenceId,
    message: verificationMessage
  };
};

/**
 * Maps database and Razorpay account statuses to standard onboarding status values:
 * NOT_STARTED, IN_PROGRESS, PENDING_VERIFICATION, ACTIVE, REQUIRES_ACTION, FAILED
 */
const mapOnboardingStatus = (accountStatus, bankStatus) => {
  if (!accountStatus && (!bankStatus || bankStatus === 'NOT_STARTED')) return 'NOT_STARTED';
  const cleanBank = String(bankStatus || '').toUpperCase();
  const cleanAccount = String(accountStatus || '').toUpperCase();

  if (cleanBank === 'VERIFIED' && (cleanAccount === 'ACTIVE' || cleanAccount === 'ACTIVATED')) {
    return 'ACTIVE';
  }
  if (cleanBank === 'REJECTED' || cleanBank === 'FAILED' || cleanAccount === 'FAILED' || cleanAccount === 'SUSPENDED') {
    return 'FAILED';
  }
  if (cleanBank === 'NEEDS_ATTENTION' || cleanAccount === 'UNDER_REVIEW' || cleanAccount === 'REQUIRES_ACTION') {
    return 'REQUIRES_ACTION';
  }
  if (cleanBank === 'PENDING' || cleanAccount === 'PENDING' || cleanAccount === 'IN_PROGRESS') {
    return 'PENDING_VERIFICATION';
  }
  return 'IN_PROGRESS';
};

/**
 * Gets status for a specific Razorpay Account ID via REST API if configured.
 */
const getAccountStatusByAccountId = async (accountId) => {
  if (!accountId) {
    const err = new Error('AccountId is required');
    err.statusCode = 400;
    throw err;
  }

  const authHeader = getAuthHeader();
  let rzpStatus = 'ACTIVE';
  let rzpDetails = null;

  if (authHeader && !accountId.startsWith('acc_fahara_')) {
    try {
      const response = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}`, {
        method: 'GET',
        headers: { 'Authorization': authHeader }
      });
      const data = await response.json();
      if (!data.error) {
        rzpStatus = data.status || 'ACTIVE';
        rzpDetails = {
          id: data.id,
          type: data.type,
          legal_business_name: data.legal_business_name,
          business_type: data.business_type,
          status: data.status
        };
      }
    } catch (e) {
      console.warn(`[LinkedAccountService] Error fetching Razorpay account ${accountId}:`, e.message);
    }
  }

  return {
    success: true,
    accountId,
    paymentProvider: 'RAZORPAY',
    status: rzpStatus,
    onboardingStatus: mapOnboardingStatus(rzpStatus, 'VERIFIED'),
    accountDetails: rzpDetails
  };
};

/**
 * Gets Linked Account status for a Cafe ID.
 */
const getCafeAccountStatus = async (cafeId) => {
  const cafe = await prisma.cafes.findUnique({ where: { id: cafeId } });
  if (!cafe) {
    const err = new Error('Cafe not found');
    err.statusCode = 404;
    throw err;
  }

  const accountId = cafe.payment_account_id || cafe.razorpay_linked_account_id;
  const accountStatus = cafe.razorpay_account_status || (accountId ? 'ACTIVE' : 'NOT_CREATED');
  const bankStatus = cafe.bank_verification_status || 'PENDING';
  const onboardingStatus = mapOnboardingStatus(accountStatus, bankStatus);

  return {
    success: true,
    cafeId,
    paymentProvider: cafe.payment_account_provider || 'RAZORPAY',
    accountId: accountId || null,
    accountStatus,
    bankVerificationStatus: bankStatus,
    onboardingStatus,
    transferEligibility: onboardingStatus === 'ACTIVE',
    bankAccountLast4: cafe.bank_account_last4 || null,
    bankAccountHolder: cafe.bank_account_holder || null
  };
};

/**
 * Gets Linked Account status for an Event Manager / Profile ID.
 */
const getEventManagerAccountStatus = async (eventManagerId) => {
  const profile = await prisma.event_management_profiles.findUnique({
    where: { id: eventManagerId }
  });

  if (!profile) {
    const err = new Error('Event management profile not found');
    err.statusCode = 404;
    throw err;
  }

  const accountId = profile.payment_account_id || profile.razorpay_linked_account_id;
  const accountStatus = profile.razorpay_account_status || (accountId ? 'ACTIVE' : 'NOT_CREATED');
  const bankStatus = profile.bank_verification_status || 'PENDING';
  const onboardingStatus = mapOnboardingStatus(accountStatus, bankStatus);

  return {
    success: true,
    eventManagerId,
    paymentProvider: profile.payment_account_provider || 'RAZORPAY',
    accountId: accountId || null,
    accountStatus,
    bankVerificationStatus: bankStatus,
    onboardingStatus,
    transferEligibility: onboardingStatus === 'ACTIVE',
    bankAccountLast4: profile.bank_account_last4 || null,
    bankAccountHolder: profile.bank_account_holder || null
  };
};

module.exports = {
  getOrCreateLinkedAccount,
  updateBankDetailsAndVerify,
  mapOnboardingStatus,
  getAccountStatusByAccountId,
  getCafeAccountStatus,
  getEventManagerAccountStatus
};


