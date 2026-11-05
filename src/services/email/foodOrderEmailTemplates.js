/**
 * Grab2Go Email Notification Templates
 * Responsive, brand-consistent HTML & Plaintext templates for food order lifecycle
 */

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};


const GRAB2GO_LOGO_URL = process.env.GRAB2GO_LOGO_URL || process.env.EMAIL_LOGO_URL || 'https://res.cloudinary.com/fv9fi0y5/image/upload/v1793863179/grab2go_assets/grab2go_logo.jpg';
const SUPPORT_EMAIL = process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com';

const formatCurrency = (amt) => {
  return `₹${Number(amt || 0).toFixed(2)}`;
};

/**
 * Base Email Layout Wrapper
 */
const getBaseLayout = ({ title, preheader, content, ctaUrl, ctaText }) => {
  const portalUrl = ctaUrl || 'https://fahara.in';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #FFF5F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #252525; -webkit-font-smoothing: antialiased;">
  
  <!-- Preheader text -->
  <div style="display: none; font-size: 1px; color: #FFF5F5; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(preheader || title)}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #FFF5F5; padding: 30px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 24px; overflow: hidden; box-shadow: 0 8px 30px rgba(183, 28, 28, 0.08); border: 1px solid #FEE2E2;">
          
          <!-- Header Bar with Official Grab2Go Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #E53935 0%, #B71C1C 100%); padding: 20px 28px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px; line-height: 1.1; display: block;">Grab<span style="color: #FDE047;">2</span>Go</span>
                          <span style="display: block; font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">Food Ordering &amp; Delivery</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.35); padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; color: #FFFFFF; text-transform: uppercase; letter-spacing: 1px;">
                      Grab2Go
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              ${content}

              ${ctaText && portalUrl ? `
                <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
                  <a href="${escapeHtml(portalUrl)}" style="display: inline-block; background: linear-gradient(135deg, #E53935 0%, #B71C1C 100%); color: #FFFFFF; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 32px; border-radius: 14px; box-shadow: 0 4px 14px rgba(229, 57, 53, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">
                    ${escapeHtml(ctaText)} &rarr;
                  </a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF5F5; padding: 24px 32px; border-top: 1px solid #FEE2E2; text-align: center; font-size: 12px; color: #666666; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 700; color: #252525;">
                Grab2Go &bull; Powered by VexaTech
              </p>
              <p style="margin: 0 0 10px 0;">
                For assistance or inquiries, contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #E53935; text-decoration: none; font-weight: 700;">${SUPPORT_EMAIL}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #999999;">
                This is an automated transactional notification. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Reusable Components
 */
const renderStatusBadge = (status, label) => {
  let bg = '#FEF3C7';
  let text = '#92400E';
  const s = String(status || '').toUpperCase();

  if (s === 'PAID' || s === 'DELIVERED' || s === 'COMPLETED' || s === 'SUCCESS') {
    bg = '#DCFCE7';
    text = '#166534';
  } else if (s === 'CANCELLED' || s === 'REJECTED' || s === 'FAILED') {
    bg = '#FEE2E2';
    text = '#991B1B';
  } else if (s === 'PREPARING' || s === 'READY_FOR_PICKUP' || s === 'ASSIGNED' || s === 'OUT_FOR_DELIVERY') {
    bg = '#E0F2FE';
    text = '#075985';
  }

  return `
    <span style="display: inline-block; background-color: ${bg}; color: ${text}; padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
      ${escapeHtml(label || status)}
    </span>
  `;
};

const renderItemsTable = (items = []) => {
  if (!items || items.length === 0) return '';

  const rows = items.map(item => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #FEE2E2; font-size: 13px; color: #252525;">
        <strong style="color: #E53935;">${escapeHtml(item.quantity)}x</strong> ${escapeHtml(item.item_name_snapshot)}
      </td>
      <td align="right" style="padding: 10px 0; border-bottom: 1px solid #FEE2E2; font-size: 13px; font-weight: 700; color: #252525;">
        ${formatCurrency(item.line_total)}
      </td>
    </tr>
  `).join('');

  return `
    <div style="background-color: #FFFDFD; border: 1px solid #FEE2E2; border-radius: 16px; padding: 16px 20px; margin: 18px 0;">
      <div style="font-size: 11px; font-weight: 800; color: #757575; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
        Order Items (${items.length})
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows}
      </table>
    </div>
  `;
};

const renderOrderSummary = (order, isCustomer = false) => {
  const isTakeaway = order.order_type === 'TAKEAWAY';

  return `
    <div style="background-color: #FAF5F5; border-radius: 16px; padding: 18px 20px; margin: 18px 0; font-size: 13px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 1.8;">
        <tr>
          <td style="color: #666666;">Order Number:</td>
          <td align="right" style="font-weight: 800; color: #252525;">#${escapeHtml(order.order_number)}</td>
        </tr>
        <tr>
          <td style="color: #666666;">Restaurant:</td>
          <td align="right" style="font-weight: 700; color: #252525;">${escapeHtml(order.cafes?.name || 'Restaurant')}</td>
        </tr>
        <tr>
          <td style="color: #666666;">Fulfilment Type:</td>
          <td align="right" style="font-weight: 700; color: ${isTakeaway ? '#D97706' : '#0284C7'};">
            ${isTakeaway ? 'Takeaway (Self-Pickup)' : 'Restaurant Direct Delivery'}
          </td>
        </tr>
        <tr>
          <td style="color: #666666;">Payment Status:</td>
          <td align="right">${renderStatusBadge(order.payment_status)}</td>
        </tr>
        <tr>
          <td style="color: #666666;">Total Amount:</td>
          <td align="right" style="font-size: 16px; font-weight: 900; color: #E53935;">
            ${formatCurrency(order.total_amount)}
          </td>
        </tr>
      </table>
    </div>
  `;
};

// ============================================================================
// 1. EMAIL 1 – NEW ORDER RECEIVED (To: Restaurant Owner)
// ============================================================================
const getNewOrderOwnerEmail = (order, cafeOwner, portalUrl) => {
  const isTakeaway = order.order_type === 'TAKEAWAY';
  const isPaid = order.payment_status === 'PAID';

  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #252525; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      New Food Order Received! 🍽️
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hello <strong>${escapeHtml(cafeOwner?.name || order.cafes?.name || 'Partner')}</strong>, you have received a new order for <strong>${escapeHtml(order.cafes?.name)}</strong>.
    </p>

    <!-- Payment Notice Pill -->
    <div style="background-color: ${isPaid ? '#DCFCE7' : '#FEF3C7'}; border: 1px solid ${isPaid ? '#86EFAC' : '#FDE68A'}; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; font-weight: 700; color: ${isPaid ? '#166534' : '#92400E'};">
      ${isPaid ? '✓ Payment Confirmed: PAID via Razorpay' : '⏳ Payment Pending: Customer payment is UNPAID / Pending'}
    </div>

    ${renderOrderSummary(order)}

    <!-- Customer & Fulfilment Details -->
    <div style="background-color: #FFFFFF; border: 1px solid #FEE2E2; border-radius: 16px; padding: 16px 20px; margin: 18px 0; font-size: 13px; line-height: 1.6;">
      <div style="font-size: 11px; font-weight: 800; color: #757575; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
        Customer Details
      </div>
      <div><strong>Name:</strong> ${escapeHtml(order.customer_name)}</div>
      <div><strong>Contact Phone:</strong> <a href="tel:${escapeHtml(order.customer_phone)}" style="color: #E53935; text-decoration: none; font-weight: 700;">${escapeHtml(order.customer_phone)}</a></div>
      ${isTakeaway ? `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #FEE2E2;">
          <strong>Pickup Schedule:</strong> ${escapeHtml(order.pickup_date || 'Today')} at ${escapeHtml(order.pickup_time || 'Next Slot')}
        </div>
      ` : `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #FEE2E2;">
          <strong>Delivery Address:</strong><br>
          ${escapeHtml(order.fulfilment_address?.addressLine || 'Address specified in app')}, ${escapeHtml(order.fulfilment_address?.city || '')}
          ${order.delivery_instructions ? `<div style="color: #E53935; font-size: 12px; margin-top: 4px;"><strong>Instructions:</strong> ${escapeHtml(order.delivery_instructions)}</div>` : ''}
        </div>
      `}
    </div>

    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `New Food Order Received – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `New Food Order Received – Grab2Go #${order.order_number}`,
      preheader: `New order #${order.order_number} for ${order.cafes?.name}. Total: ${formatCurrency(order.total_amount)}`,
      content,
      ctaUrl: portalUrl || `https://cafe.fahara.in/owner/orders`,
      ctaText: 'View Order in Dashboard'
    }),
    text: `New food order received for ${order.cafes?.name}!\nOrder Number: #${order.order_number}\nCustomer: ${order.customer_name} (${order.customer_phone})\nTotal: ${formatCurrency(order.total_amount)}\nPayment Status: ${order.payment_status}\nView details in your Grab2Go cafe portal.`
  };
};

// ============================================================================
// 2. EMAIL 2 – PAYMENT SUCCESSFUL (To: Restaurant Owner)
// ============================================================================
const getPaymentSuccessfulOwnerEmail = ({ order, payment, breakdown, portalUrl }) => {
  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #166534; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Payment Confirmed – Order #${escapeHtml(order.order_number)}
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Payment for order <strong>#${escapeHtml(order.order_number)}</strong> has been captured and verified via Razorpay.
    </p>

    <!-- Payment Receipt Card -->
    <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 16px; padding: 20px; margin: 18px 0; font-size: 13px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 1.9;">
        <tr>
          <td style="color: #166534; font-weight: 600;">Customer Payment Amount:</td>
          <td align="right" style="font-size: 16px; font-weight: 900; color: #166534;">
            ${formatCurrency(order.total_amount)}
          </td>
        </tr>
        <tr>
          <td style="color: #666666;">Payment Status:</td>
          <td align="right">${renderStatusBadge('PAID', 'CAPTURED & PAID')}</td>
        </tr>
        <tr>
          <td style="color: #666666;">Razorpay Payment ID:</td>
          <td align="right" style="font-family: monospace; font-size: 12px; font-weight: 700; color: #252525;">
            ${escapeHtml(payment?.gateway_payment_id || payment?.provider_payment_id || 'Captured')}
          </td>
        </tr>
        <tr>
          <td style="color: #666666;">Date &amp; Time:</td>
          <td align="right" style="color: #252525;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
        </tr>
        ${breakdown?.restaurantSettlementAmount ? `
          <tr style="border-top: 1px dashed #BBF7D0;">
            <td style="color: #166534; font-weight: 700; padding-top: 6px;">Net Restaurant Payout:</td>
            <td align="right" style="font-weight: 900; color: #166534; padding-top: 6px;">
              ${formatCurrency(breakdown.restaurantSettlementAmount)}
            </td>
          </tr>
        ` : ''}
      </table>
    </div>

    ${renderOrderSummary(order)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Payment Received – Grab2Go Order #${order.order_number}`,
    html: getBaseLayout({
      title: `Payment Received – Grab2Go Order #${order.order_number}`,
      preheader: `Payment confirmed for order #${order.order_number}. Amount: ${formatCurrency(order.total_amount)}`,
      content,
      ctaUrl: portalUrl || `https://cafe.fahara.in/owner/orders`,
      ctaText: 'Open Order Details'
    }),
    text: `Payment Received for Order #${order.order_number}!\nCustomer Amount: ${formatCurrency(order.total_amount)}\nStatus: PAID\nRestaurant: ${order.cafes?.name}`
  };
};

// ============================================================================
// 3. EMAIL 3 – ORDER PREPARATION STARTED (To: Customer)
// ============================================================================
const getPreparationStartedCustomerEmail = (order, customer, trackingUrl) => {
  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #252525; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Your Food Is Being Prepared! 👨‍🍳
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(customer?.name || order.customer_name)}</strong>,
    </p>

    <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px 20px; border-radius: 0 14px 14px 0; margin-bottom: 24px; font-size: 14px; color: #92400E; line-height: 1.6;">
      <strong>Great news!</strong> The chef at <strong>${escapeHtml(order.cafes?.name)}</strong> has started preparing your order. We will notify you as soon as it is ready.
      ${order.estimated_preparation_time ? `<div style="margin-top: 6px; font-size: 13px;">Estimated Preparation Time: <strong>~${order.estimated_preparation_time} mins</strong></div>` : ''}
    </div>

    ${renderOrderSummary(order, true)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Your Food Is Being Prepared! – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Your Food Is Being Prepared! – Grab2Go #${order.order_number}`,
      preheader: `${order.cafes?.name} is preparing your food order #${order.order_number}!`,
      content,
      ctaUrl: trackingUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'Track Your Order Live'
    }),
    text: `Hi ${order.customer_name}, great news! ${order.cafes?.name} has started preparing your food order #${order.order_number}. Track live: ${trackingUrl}`
  };
};

// ============================================================================
// 4. EMAIL 4 – ORDER READY (To: Customer)
// ============================================================================
const getOrderReadyCustomerEmail = (order, customer, trackingUrl) => {
  const isTakeaway = order.order_type === 'TAKEAWAY';
  const cafe = order.cafes || {};

  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #166534; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      ${isTakeaway ? 'Your Order Is Ready for Pickup! 🛍️' : 'Your Order Is Ready for Delivery! 🛵'}
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(customer?.name || order.customer_name)}</strong>,
    </p>

    ${isTakeaway ? `
      <!-- Takeaway Instructions -->
      <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px 20px; border-radius: 0 14px 14px 0; margin-bottom: 24px; font-size: 14px; color: #065F46; line-height: 1.6;">
        <strong style="font-size: 15px; display: block; margin-bottom: 4px;">Your delicious order is freshly prepared and packed!</strong>
        Please visit the restaurant counter and collect your order using your order number:
        <div style="margin: 10px 0; font-size: 18px; font-weight: 900; color: #E53935; letter-spacing: 0.5px;">
          #${escapeHtml(order.order_number)}
        </div>
        <div style="font-size: 13px; color: #047857; margin-top: 6px;">
          <strong>Pickup Location:</strong><br>
          ${escapeHtml(cafe.name)}<br>
          ${escapeHtml(cafe.address || '')}${cafe.city ? `, ${escapeHtml(cafe.city)}` : ''}
          ${order.pickup_time ? `<br><strong>Scheduled Slot:</strong> ${escapeHtml(order.pickup_date || 'Today')} at ${escapeHtml(order.pickup_time)}` : ''}
        </div>
      </div>
    ` : `
      <!-- Delivery Handover Instructions -->
      <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 18px 20px; border-radius: 0 14px 14px 0; margin-bottom: 24px; font-size: 14px; color: #1E40AF; line-height: 1.6;">
        <strong style="font-size: 15px; display: block; margin-bottom: 4px;">Your order has been freshly prepared by ${escapeHtml(cafe.name)}!</strong>
        It is now ready for delivery handover. Our delivery executive will pick it up and head straight to your doorstep.
      </div>
    `}

    ${renderOrderSummary(order, true)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Your Order Is Ready! – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Your Order Is Ready! – Grab2Go #${order.order_number}`,
      preheader: isTakeaway ? `Order #${order.order_number} is ready for pickup at ${cafe.name}!` : `Order #${order.order_number} is ready for delivery handover!`,
      content,
      ctaUrl: trackingUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'View Order Status'
    }),
    text: `Your Grab2Go order #${order.order_number} from ${cafe.name} is ready! ${isTakeaway ? 'Please visit the restaurant to collect it.' : 'It is being handed over for delivery.'}`
  };
};

// ============================================================================
// 5. EMAIL 5 – DELIVERY EMPLOYEE ASSIGNED (To: Customer)
// ============================================================================
const getDeliveryAssignedCustomerEmail = ({ order, employee, trackingUrl }) => {
  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #252525; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Delivery Executive Assigned! 🛵
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, your order has been assigned to a delivery executive. Here are the delivery details:
    </p>

    <!-- Executive Card -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px; margin: 18px 0; font-size: 13px;">
      <div style="font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
        Delivery Executive Details
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 1.8;">
        <tr>
          <td style="color: #64748B;">Executive Name:</td>
          <td align="right" style="font-weight: 800; color: #0F172A;">${escapeHtml(employee?.name || 'Assigned Driver')}</td>
        </tr>
        ${employee?.phone ? `
          <tr>
            <td style="color: #64748B;">Contact Phone:</td>
            <td align="right" style="font-weight: 700; color: #E53935;">
              <a href="tel:${escapeHtml(employee.phone)}" style="color: #E53935; text-decoration: none;">${escapeHtml(employee.phone)}</a>
            </td>
          </tr>
        ` : ''}
        ${employee?.vehicle_type ? `
          <tr>
            <td style="color: #64748B;">Vehicle:</td>
            <td align="right" style="color: #334155;">${escapeHtml(employee.vehicle_type)}</td>
          </tr>
        ` : ''}
      </table>
    </div>

    <!-- Delivery Destination -->
    <div style="background-color: #FAF5F5; border: 1px solid #FEE2E2; border-radius: 16px; padding: 16px 20px; margin: 18px 0; font-size: 13px;">
      <div style="font-weight: 800; color: #252525; margin-bottom: 4px;">Delivering To:</div>
      <div style="color: #666666;">
        ${escapeHtml(order.fulfilment_address?.addressLine || 'Your specified address')}, ${escapeHtml(order.fulfilment_address?.city || '')}
      </div>
    </div>

    ${renderOrderSummary(order, true)}
  `;

  return {
    subject: `Your Order Delivery Details – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Your Order Delivery Details – Grab2Go #${order.order_number}`,
      preheader: `Delivery executive assigned for Grab2Go order #${order.order_number}`,
      content,
      ctaUrl: trackingUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'Track Delivery Live'
    }),
    text: `Your Grab2Go order #${order.order_number} has been assigned to ${employee?.name || 'a delivery executive'}. Tracking link: ${trackingUrl}`
  };
};

// ============================================================================
// 6. EMAIL 6 – ORDER CANCELLED (To: Restaurant Owner)
// ============================================================================
const getOrderCancelledOwnerEmail = ({ order, reason, portalUrl }) => {
  const isPaid = order.payment_status === 'PAID';

  const content = `
    <!-- Top Hero Status Card -->
    <div style="background: linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%); border: 1px solid #FEE2E2; border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; background-color: #FEE2E2; color: #E50914; border-radius: 50%; font-size: 26px; font-weight: 900; margin-bottom: 12px;">
        ✕
      </div>
      <h1 style="font-size: 22px; font-weight: 900; color: #1E1E1E; margin: 0 0 6px 0; letter-spacing: -0.5px;">
        Order Cancelled by Customer
      </h1>
      <p style="font-size: 13px; color: #757575; margin: 0; font-weight: 600;">
        Order ID: <strong style="color: #E50914; font-family: monospace;">#${escapeHtml(order.order_number)}</strong>
      </p>
    </div>

    <!-- Alert / Action Box -->
    <div style="background-color: #FFF1F2; border: 1px solid #FECDD3; border-radius: 16px; padding: 18px 20px; margin-bottom: 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="vertical-align: top; width: 28px;">
            <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; background-color: #E11D48; color: #FFFFFF; border-radius: 50%; font-size: 11px; font-weight: 900;">!</span>
          </td>
          <td style="font-size: 13px; color: #9F1239; line-height: 1.5;">
            <strong style="color: #881337; font-size: 14px; display: block; margin-bottom: 2px;">Kitchen Action Required</strong>
            Please halt any food preparation for this order immediately. The customer initiated cancellation.
          </td>
        </tr>
      </table>
    </div>

    <!-- Cancellation Key Facts Grid -->
    <div style="background-color: #FFFFFF; border: 1px solid #EEEEEE; border-radius: 18px; padding: 20px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
      <div style="font-size: 11px; font-weight: 800; color: #999999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px;">
        Cancellation Snapshot
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 2; font-size: 13px;">
        <tr>
          <td style="color: #757575; font-weight: 600;">Restaurant:</td>
          <td align="right" style="font-weight: 800; color: #1E1E1E;">${escapeHtml(order.cafes?.name)}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Customer:</td>
          <td align="right" style="font-weight: 800; color: #1E1E1E;">${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_phone || 'N/A')})</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Cancellation Time:</td>
          <td align="right" style="color: #252525; font-weight: 700;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Reason Specified:</td>
          <td align="right" style="color: #E50914; font-weight: 800;">${escapeHtml(reason || order.cancellation_reason || 'Customer requested')}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Order Value:</td>
          <td align="right" style="font-size: 15px; font-weight: 900; color: #1E1E1E;">${formatCurrency(order.total_amount)}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Payment &amp; Refund:</td>
          <td align="right">
            ${isPaid 
              ? `<span style="background-color: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase;">Paid &bull; Automated Refund</span>`
              : `<span style="background-color: #F4F4F5; color: #52525B; border: 1px solid #E4E4E7; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase;">Unpaid &bull; No Deduction</span>`}
          </td>
        </tr>
      </table>
    </div>

    ${renderOrderSummary(order)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Order Cancelled – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Order Cancelled – Grab2Go #${order.order_number}`,
      preheader: `Customer has cancelled order #${order.order_number} for ${order.cafes?.name}`,
      content,
      ctaUrl: portalUrl || `https://cafe.fahara.in/owner/orders`,
      ctaText: 'Open Cafe Dashboard'
    }),
    text: `Order #${order.order_number} has been cancelled by the customer. Restaurant: ${order.cafes?.name}. Reason: ${reason || 'Customer requested'}`
  };
};

// ============================================================================
// 7. EMAIL 7 – REFUND NOTIFICATIONS (To: Customer)
// ============================================================================
const getRefundCustomerEmail = ({ type = 'INITIATED', order, refund, amount }) => {
  const refundAmt = amount || refund?.refund_amount || order?.total_amount;

  if (type === 'INITIATED') {
    const content = `
      <!-- Top Hero Status Card -->
      <div style="background: linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%); border: 1px solid #BBF7D0; border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; background-color: #DCFCE7; color: #16A34A; border-radius: 50%; font-size: 26px; font-weight: 900; margin-bottom: 12px;">
          💳
        </div>
        <h1 style="font-size: 22px; font-weight: 900; color: #1E1E1E; margin: 0 0 6px 0; letter-spacing: -0.5px;">
          Your Refund Has Been Initiated
        </h1>
        <p style="font-size: 13px; color: #757575; margin: 0; font-weight: 600;">
          Order ID: <strong style="color: #16A34A; font-family: monospace;">#${escapeHtml(order.order_number)}</strong>
        </p>
      </div>

      <p style="font-size: 14px; color: #555555; margin: 0 0 20px 0; line-height: 1.6;">
        Hi <strong>${escapeHtml(order.customer_name)}</strong>, your refund has been initiated through our secure payment gateway (Razorpay). Below is your refund transaction receipt:
      </p>

      <!-- Refund Details Card -->
      <div style="background-color: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 18px; padding: 22px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(22, 163, 74, 0.06);">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 2.2; font-size: 13px;">
          <tr>
            <td style="color: #757575; font-weight: 600;">Refunded Amount:</td>
            <td align="right" style="font-size: 20px; font-weight: 900; color: #16A34A;">
              ${formatCurrency(refundAmt)}
            </td>
          </tr>
          <tr>
            <td style="color: #757575; font-weight: 600;">Status:</td>
            <td align="right">
              <span style="background-color: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase;">
                Processing at Bank
              </span>
            </td>
          </tr>
          ${refund?.provider_refund_id || refund?.razorpay_refund_id ? `
            <tr>
              <td style="color: #757575; font-weight: 600;">Gateway Refund Reference:</td>
              <td align="right" style="font-family: monospace; font-size: 12px; font-weight: 800; color: #252525;">
                ${escapeHtml(refund.provider_refund_id || refund.razorpay_refund_id)}
              </td>
            </tr>
          ` : ''}
          <tr>
            <td style="color: #757575; font-weight: 600;">Original Payment Method:</td>
            <td align="right" style="font-weight: 700; color: #252525;">Online (UPI / Card / NetBanking)</td>
          </tr>
        </table>
      </div>

      <!-- Bank Timeline Strip -->
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 16px 20px; margin-bottom: 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="width: 28px; vertical-align: top;">
              <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; background-color: #E2E8F0; color: #475569; border-radius: 50%; font-size: 11px; font-weight: 900;">i</span>
            </td>
            <td style="font-size: 12px; color: #475569; line-height: 1.5;">
              <strong>Bank Credit Timeline:</strong> It generally takes <strong>5 to 7 working days</strong> for the refund to reflect in your bank account, depending on your card issuer or bank.
            </td>
          </tr>
        </table>
      </div>
    `;

    return {
      subject: `Your Refund Has Been Initiated – Grab2Go #${order.order_number}`,
      html: getBaseLayout({
        title: `Your Refund Has Been Initiated – Grab2Go #${order.order_number}`,
        preheader: `Refund of ${formatCurrency(refundAmt)} initiated for order #${order.order_number}`,
        content,
        ctaUrl: `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`,
        ctaText: 'Track Live Refund Status'
      }),
      text: `Your refund of ${formatCurrency(refundAmt)} for order #${order.order_number} has been initiated.`
    };
  }

  if (type === 'PROCESSED') {
    const content = `
      <!-- Top Hero Status Card -->
      <div style="background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); border: 1px solid #A7F3D0; border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; background-color: #10B981; color: #FFFFFF; border-radius: 50%; font-size: 26px; font-weight: 900; margin-bottom: 12px;">
          ✓
        </div>
        <h1 style="font-size: 22px; font-weight: 900; color: #064E3B; margin: 0 0 6px 0; letter-spacing: -0.5px;">
          Refund Successfully Processed
        </h1>
        <p style="font-size: 13px; color: #065F46; margin: 0; font-weight: 700;">
          Settled for Order <span style="font-family: monospace;">#${escapeHtml(order.order_number)}</span>
        </p>
      </div>

      <p style="font-size: 14px; color: #555555; margin: 0 0 20px 0; line-height: 1.6;">
        Hi <strong>${escapeHtml(order.customer_name)}</strong>, the payment gateway has successfully settled your refund. The funds are cleared and on their way to your account:
      </p>

      <div style="background-color: #FFFFFF; border: 1px solid #A7F3D0; border-radius: 18px; padding: 22px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.08);">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 2.2; font-size: 13px;">
          <tr>
            <td style="color: #757575; font-weight: 600;">Processed Amount:</td>
            <td align="right" style="font-size: 20px; font-weight: 900; color: #047857;">
              ${formatCurrency(refundAmt)}
            </td>
          </tr>
          <tr>
            <td style="color: #757575; font-weight: 600;">Gateway Status:</td>
            <td align="right">
              <span style="background-color: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase;">
                ✓ Settled &bull; Processed
              </span>
            </td>
          </tr>
          ${refund?.provider_refund_id || refund?.razorpay_refund_id ? `
            <tr>
              <td style="color: #757575; font-weight: 600;">Bank ARN / Reference ID:</td>
              <td align="right" style="font-family: monospace; font-size: 12px; font-weight: 800; color: #064E3B;">
                ${escapeHtml(refund.provider_refund_id || refund.razorpay_refund_id)}
              </td>
            </tr>
          ` : ''}
          <tr>
            <td style="color: #757575; font-weight: 600;">Settlement Date:</td>
            <td align="right" style="font-weight: 700; color: #252525;">${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}</td>
          </tr>
        </table>
      </div>
    `;

    return {
      subject: `Your Grab2GO Refund Has Been Processed – #${order.order_number}`,
      html: getBaseLayout({
        title: `Your Refund Has Been Processed – Grab2Go #${order.order_number}`,
        preheader: `Refund of ${formatCurrency(refundAmt)} settled for order #${order.order_number}`,
        content,
        ctaUrl: `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`,
        ctaText: 'View Refund Details'
      }),
      text: `Your refund of ${formatCurrency(refundAmt)} for order #${order.order_number} has been processed.`
    };
  }

  // FAILED
  const content = `
    <!-- Top Hero Status Card -->
    <div style="background: linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%); border: 1px solid #FECDD3; border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; background-color: #FDA4AF; color: #BE123C; border-radius: 50%; font-size: 26px; font-weight: 900; margin-bottom: 12px;">
        ⚠️
      </div>
      <h1 style="font-size: 22px; font-weight: 900; color: #881337; margin: 0 0 6px 0; letter-spacing: -0.5px;">
        Update Regarding Your Refund
      </h1>
      <p style="font-size: 13px; color: #9F1239; margin: 0; font-weight: 700;">
        Order ID: #${escapeHtml(order.order_number)}
      </p>
    </div>

    <p style="font-size: 14px; color: #555555; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, our automated gateway encountered a transient delay while clearing your refund of <strong>${formatCurrency(refundAmt)}</strong>.
    </p>

    <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 18px 20px; margin-bottom: 24px; font-size: 13px; color: #92400E; line-height: 1.6;">
      <strong style="color: #78350F; font-size: 14px; display: block; margin-bottom: 4px;">Manual Review Underway</strong>
      Our finance desk is actively reviewing this transaction with Razorpay. <strong>No action is needed from your side.</strong> We will ensure your refund is credited without issue.
    </div>
  `;

  return {
    subject: `Update Regarding Your Grab2GO Refund – #${order.order_number}`,
    html: getBaseLayout({
      title: `Refund Update – Grab2GO #${order.order_number}`,
      preheader: `Update regarding your refund for order #${order.order_number}`,
      content,
      ctaUrl: `mailto:${SUPPORT_EMAIL}`,
      ctaText: 'Contact Support Desk'
    }),
    text: `Your refund for order #${order.order_number} is being manually reviewed by our support team.`
  };
};

// ============================================================================
// 1B. NEW ORDER CONFIRMATION (To: Customer)
// ============================================================================
const getNewOrderCustomerConfirmationEmail = (order, trackingUrl) => {
  const isTakeaway = order.order_type === 'TAKEAWAY';
  const cafe = order.cafes || {};

  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #252525; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Order Received! 🍽️
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, thank you for ordering with Grab2Go! We have sent your order to <strong>${escapeHtml(cafe.name)}</strong>.
    </p>

    <!-- Fulfilment Notice -->
    <div style="background-color: #FAF5F5; border: 1px solid #FEE2E2; border-radius: 14px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
      <div style="font-weight: 800; color: #252525; margin-bottom: 4px;">
        ${isTakeaway ? 'Takeaway (Self-Pickup)' : 'Direct Delivery'}
      </div>
      ${isTakeaway ? `
        <div>Pickup Location: <strong>${escapeHtml(cafe.name)}</strong>, ${escapeHtml(cafe.address || '')}</div>
        <div>Scheduled: ${escapeHtml(order.pickup_date || 'Today')} at ${escapeHtml(order.pickup_time || 'Next Available Slot')}</div>
      ` : `
        <div>Deliver To: <strong>${escapeHtml(order.fulfilment_address?.addressLine || 'Address specified in app')}</strong>, ${escapeHtml(order.fulfilment_address?.city || '')}</div>
      `}
    </div>

    ${renderOrderSummary(order, true)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Order Confirmation – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Order Confirmation – Grab2Go #${order.order_number}`,
      preheader: `Thank you for ordering with Grab2Go! Order #${order.order_number} has been received.`,
      content,
      ctaUrl: trackingUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'Track Order Status'
    }),
    text: `Thank you for ordering with Grab2Go! Order #${order.order_number} for ${cafe.name} has been received. Track here: ${trackingUrl}`
  };
};

// ============================================================================
// 2B. PAYMENT CONFIRMATION (To: Customer)
// ============================================================================
const getPaymentSuccessfulCustomerEmail = ({ order, payment, trackingUrl }) => {
  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #166534; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Payment Successful! ✓
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, your payment for Grab2Go order <strong>#${escapeHtml(order.order_number)}</strong> has been confirmed.
    </p>

    <!-- Payment Receipt Card -->
    <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 16px; padding: 20px; margin: 18px 0; font-size: 13px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 1.9;">
        <tr>
          <td style="color: #166534; font-weight: 700;">Amount Paid:</td>
          <td align="right" style="font-size: 16px; font-weight: 900; color: #166534;">
            ${formatCurrency(order.total_amount)}
          </td>
        </tr>
        <tr>
          <td style="color: #666666;">Payment Method:</td>
          <td align="right" style="font-weight: 700; color: #252525;">Online (Razorpay)</td>
        </tr>
        <tr>
          <td style="color: #666666;">Razorpay Payment Reference:</td>
          <td align="right" style="font-family: monospace; font-size: 12px; font-weight: 700; color: #252525;">
            ${escapeHtml(payment?.gateway_payment_id || payment?.provider_payment_id || 'Captured')}
          </td>
        </tr>
        <tr>
          <td style="color: #666666;">Payment Status:</td>
          <td align="right">${renderStatusBadge('PAID', 'PAID')}</td>
        </tr>
      </table>
    </div>

    ${renderOrderSummary(order, true)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Payment Receipt – Grab2Go Order #${order.order_number}`,
    html: getBaseLayout({
      title: `Payment Receipt – Grab2Go Order #${order.order_number}`,
      preheader: `Payment of ${formatCurrency(order.total_amount)} confirmed for order #${order.order_number}`,
      content,
      ctaUrl: trackingUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'Track Order'
    }),
    text: `Payment of ${formatCurrency(order.total_amount)} confirmed for Grab2Go order #${order.order_number}. Track order: ${trackingUrl}`
  };
};

// ============================================================================
// 5. ORDER COMPLETED (To: Customer)
// ============================================================================
const getOrderCompletedCustomerEmail = (order, reviewUrl) => {
  const isTakeaway = order.order_type === 'TAKEAWAY';
  const cafe = order.cafes || {};

  const content = `
    <h1 style="font-size: 20px; font-weight: 900; color: #166534; margin: 0 0 8px 0; letter-spacing: -0.5px;">
      Order Completed! 🎉
    </h1>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0; line-height: 1.5;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, your order from <strong>${escapeHtml(cafe.name)}</strong> has been completed!
    </p>

    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px 20px; border-radius: 0 14px 14px 0; margin-bottom: 24px; font-size: 14px; color: #065F46; line-height: 1.6;">
      <strong>We hope you loved your food!</strong><br>
      ${isTakeaway ? 'Thank you for picking up your order with Grab2Go.' : 'Your order was successfully delivered to your doorstep.'}
    </div>

    ${renderOrderSummary(order, true)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Order Completed – Grab2Go #${order.order_number}`,
    html: getBaseLayout({
      title: `Order Completed – Grab2Go #${order.order_number}`,
      preheader: `Your Grab2Go order #${order.order_number} has been completed!`,
      content,
      ctaUrl: reviewUrl || `https://fahara.in/customer/orders/${order.id}`,
      ctaText: 'Rate & Review Order'
    }),
    text: `Your Grab2Go order #${order.order_number} has been completed! Thank you for ordering with us.`
  };
};

// ============================================================================
// 6B. ORDER CANCELLED (To: Customer)
// ============================================================================
const getOrderCancelledCustomerEmail = ({ order, reason, isRefundEligible, refundAmount, trackingUrl }) => {
  const isPaid = order.payment_status === 'PAID' || isRefundEligible;
  const refundAmt = refundAmount || order.total_amount;

  const content = `
    <!-- Top Hero Status Card -->
    <div style="background: linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%); border: 1px solid #FEE2E2; border-radius: 20px; padding: 26px 20px; text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 60px; height: 60px; line-height: 60px; background-color: #FEE2E2; color: #E50914; border-radius: 50%; font-size: 28px; font-weight: 900; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(229, 9, 20, 0.12);">
        ✕
      </div>
      <h1 style="font-size: 22px; font-weight: 900; color: #1E1E1E; margin: 0 0 6px 0; letter-spacing: -0.5px;">
        Your Order Has Been Cancelled
      </h1>
      <p style="font-size: 13px; color: #757575; margin: 0; font-weight: 600;">
        Order ID: <strong style="color: #E50914; font-family: monospace;">#${escapeHtml(order.order_number)}</strong>
      </p>
    </div>

    <p style="font-size: 14px; color: #555555; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${escapeHtml(order.customer_name)}</strong>, your order with <strong>${escapeHtml(order.cafes?.name || 'Restaurant')}</strong> has been cancelled as requested.
    </p>

    <!-- Cancellation Key Facts Card -->
    <div style="background-color: #FFFFFF; border: 1px solid #EEEEEE; border-radius: 18px; padding: 22px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
      <div style="font-size: 11px; font-weight: 800; color: #999999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
        Cancellation Details
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="line-height: 2.1; font-size: 13px;">
        <tr>
          <td style="color: #757575; font-weight: 600;">Restaurant:</td>
          <td align="right" style="font-weight: 800; color: #1E1E1E;">${escapeHtml(order.cafes?.name || 'Grab2GO')}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Cancellation Time:</td>
          <td align="right" style="color: #252525; font-weight: 700;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Reason:</td>
          <td align="right" style="color: #E50914; font-weight: 800;">${escapeHtml(reason || order.cancellation_reason || 'Customer requested')}</td>
        </tr>
        <tr>
          <td style="color: #757575; font-weight: 600;">Order Total:</td>
          <td align="right" style="font-size: 15px; font-weight: 900; color: #1E1E1E;">${formatCurrency(order.total_amount)}</td>
        </tr>
      </table>
    </div>

    <!-- Refund Eligibility Card -->
    ${isPaid ? `
      <div style="background: linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%); border: 1px solid #A7F3D0; border-radius: 18px; padding: 20px; margin-bottom: 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="width: 32px; vertical-align: top;">
              <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background-color: #10B981; color: #FFFFFF; border-radius: 50%; font-size: 13px; font-weight: 900;">✓</span>
            </td>
            <td>
              <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">
                100% Automated Gateway Refund
              </div>
              <div style="font-size: 17px; font-weight: 900; color: #064E3B; margin-bottom: 6px;">
                ${formatCurrency(refundAmt)} Refund Initiated
              </div>
              <p style="font-size: 12px; color: #065F46; margin: 0; line-height: 1.5;">
                Your refund is automatically initiated to your original payment method (via Razorpay). Funds will reflect in your account within <strong>5–7 business days</strong>.
              </p>
            </td>
          </tr>
        </table>
      </div>
    ` : `
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 16px 20px; margin-bottom: 24px; font-size: 13px; color: #64748B;">
        No payment was deducted for this order (payment was unpaid or scheduled for pay-at-counter).
      </div>
    `}

    ${renderOrderSummary(order)}
    ${renderItemsTable(order.order_items)}
  `;

  return {
    subject: `Your Grab2GO Order #${order.order_number} Has Been Cancelled`,
    html: getBaseLayout({
      title: `Order Cancelled – Grab2GO #${order.order_number}`,
      preheader: `Your order #${order.order_number} has been cancelled`,
      content,
      ctaUrl: trackingUrl || `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`,
      ctaText: isPaid ? 'Track Your Refund Status' : 'View Order Details'
    }),
    text: `Your Grab2GO order #${order.order_number} has been cancelled. Restaurant: ${order.cafes?.name}. Reason: ${reason || 'Customer requested'}`
  };
};

module.exports = {
  getNewOrderOwnerEmail,
  getNewOrderCustomerConfirmationEmail,
  getPaymentSuccessfulOwnerEmail,
  getPaymentSuccessfulCustomerEmail,
  getPreparationStartedCustomerEmail,
  getOrderReadyCustomerEmail,
  getDeliveryAssignedCustomerEmail,
  getOrderCompletedCustomerEmail,
  getOrderCancelledOwnerEmail,
  getOrderCancelledCustomerEmail,
  getRefundCustomerEmail
};

