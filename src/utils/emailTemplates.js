const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fahara.in';
const CAFE_FRONTEND_URL = process.env.CAFE_FRONTEND_URL || 'https://cafe.fahara.in';
const EM_FRONTEND_URL = process.env.EM_FRONTEND_URL || 'https://em.fahara.in';
const ADMIN_FRONTEND_URL = process.env.ADMIN_FRONTEND_URL || 'https://admin.fahara.in';
const BACKEND_URL = process.env.BACKEND_URL || 'https://api.fahara.in';

// Professional Vector SVG Icon Generator
const getVectorIcon = (name) => {
  const icons = {
    ticket: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/></svg>`,
    cafe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`,
    calendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F4E37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    fileText: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    receipt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2C1810" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>`,
    shieldCheck: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`
  };
  return icons[name] || icons.ticket;
};

const LOGO_PUBLIC_URL = process.env.EMAIL_LOGO_URL || 'https://res.cloudinary.com/fv9fi0y5/image/upload/v1786768060/fahara_assets/fahara_logo.jpg';

const getLogoSrc = () => {
  return LOGO_PUBLIC_URL;
};

const getEmailHeader = (title, statusTag = null) => {
  const logoSrc = getLogoSrc();

  return `
    <!-- Top Branding Section with Fahara Logo -->
    <div style="background-color: #FFF8F0; padding: 24px 20px; text-align: center; border-bottom: 2px solid #E8DED5;">
      <a href="${FRONTEND_URL}" target="_blank" style="text-decoration: none; display: inline-block;">
        <img 
          src="${logoSrc}" 
          alt="FAHARA" 
          width="140" 
          height="140"
          style="max-width: 140px; width: 140px; height: 140px; object-fit: cover; border-radius: 16px; border: 1px solid #E8DED5; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display: block; margin: 0 auto;"
        />
        <span style="display: block; margin-top: 8px; font-family: 'Georgia', serif; font-size: 20px; font-weight: 800; color: #2C1810; letter-spacing: 1px;">FAHARA</span>
        <span style="display: block; font-size: 11px; font-weight: 600; color: #6F4E37; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px;">Cafe & Event Bookings</span>
      </a>
    </div>

    <!-- Title Header Banner -->
    <div style="background: linear-gradient(135deg, #2C1810 0%, #4A2C11 50%, #6F4E37 100%); padding: 30px 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 0.4px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${title}</h1>
      ${statusTag ? `<div style="margin-top: 12px;">${statusTag}</div>` : ''}
    </div>
  `;
};

const getEmailFooter = () => `
  <div style="background-color: #FAF6F0; padding: 28px 24px; text-align: center; border-top: 1px solid #E8DED5;">
    <p style="font-size: 14px; font-weight: 700; color: #2C1810; margin: 0 0 6px 0;">Need Assistance with your Booking?</p>
    <p style="font-size: 13px; color: #7A6053; margin: 0 0 16px 0; line-height: 1.5;">
      Contact our 24/7 Support Team at <a href="mailto:vexatech.connect@gmail.com" style="color: #6F4E37; font-weight: 700; text-decoration: underline;">vexatech.connect@gmail.com</a>
    </p>
    <div style="margin: 16px 0; font-size: 12px; color: #A67B5B;">
      <a href="${FRONTEND_URL}/customer/bookings" style="color: #6F4E37; text-decoration: none; font-weight: 600; margin: 0 10px;">My Bookings</a> • 
      <a href="${FRONTEND_URL}/customer/profile" style="color: #6F4E37; text-decoration: none; font-weight: 600; margin: 0 10px;">Account Settings</a> • 
      <a href="${FRONTEND_URL}/customer/cafe" style="color: #6F4E37; text-decoration: none; font-weight: 600; margin: 0 10px;">Explore Cafes</a>
    </div>
    <p style="font-size: 12px; color: #A09085; margin: 16px 0 0 0; line-height: 1.5;">
      © ${new Date().getFullYear()} Fahara Inc. All rights reserved.<br>
      This is an automated operational email regarding your reservation.
    </p>
  </div>
`;

const getStatusBadge = (status = 'PENDING') => {
  const styles = {
    CONFIRMED: 'background-color: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;',
    PAID: 'background-color: #D1FAE5; color: #047857; border: 1px solid #6EE7B7;',
    PENDING: 'background-color: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;',
    CANCELLED: 'background-color: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;',
    COMPLETED: 'background-color: #EFF6FF; color: #1E40AF; border: 1px solid #BFDBFE;',
  };
  const style = styles[status] || styles.PENDING;
  return `<span style="display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; ${style}">● ${status}</span>`;
};

const getIconNameByLabel = (label = '') => {
  const l = label.toLowerCase();
  if (l.includes('booking no') || l.includes('number')) return 'ticket';
  if (l.includes('cafe') || l.includes('venue')) return 'cafe';
  if (l.includes('date')) return 'calendar';
  if (l.includes('time') || l.includes('hours')) return 'clock';
  if (l.includes('guest') || l.includes('person')) return 'users';
  if (l.includes('event') || l.includes('package')) return 'star';
  if (l.includes('card') || l.includes('payment')) return 'card';
  return 'ticket';
};

const generateBaseTemplate = ({ title, bodyHtml, summaryItems = [], bookingId = null, ctaLink = null, ctaText = 'View Now!', status = null }) => {
  const metaLabels = ['Booking No', 'Cafe', 'Date', 'Time', 'Guests', 'Event Service Package'];
  const metaItems = summaryItems.filter(item => metaLabels.includes(item.label));
  const financialItems = summaryItems.filter(item => !metaLabels.includes(item.label));

  const metaGridHtml = metaItems.length > 0 ? `
    <div style="background-color: #FFFBF7; border: 1px solid #E8DED5; border-radius: 14px; padding: 20px; margin: 24px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
      <h3 style="margin: 0 0 16px 0; color: #2C1810; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">
        ${getVectorIcon('ticket')} <span style="vertical-align: middle; margin-left: 6px;">Reservation Details</span>
      </h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        ${metaItems.map((item, index) => {
          const iconSvg = getVectorIcon(getIconNameByLabel(item.label));
          return `
            <tr>
              <td style="padding: 10px 0; font-size: 14px; color: #7A6053; font-weight: 600; border-bottom: ${index === metaItems.length - 1 ? 'none' : '1px dashed #E8DED5'}; width: 45%;">
                <span style="display: inline-block; vertical-align: middle; margin-right: 6px;">${iconSvg}</span>
                <span style="vertical-align: middle;">${item.label}</span>
              </td>
              <td style="padding: 10px 0; font-size: 14px; color: #2C1810; font-weight: 700; text-align: right; border-bottom: ${index === metaItems.length - 1 ? 'none' : '1px dashed #E8DED5'}; width: 55%;">
                ${item.value}
              </td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
  ` : '';

  const financialTableHtml = financialItems.length > 0 ? `
    <div style="background-color: #ffffff; border: 1px solid #E8DED5; border-radius: 14px; padding: 20px; margin: 24px 0;">
      <h3 style="margin: 0 0 16px 0; color: #2C1810; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #6F4E37; padding-bottom: 8px;">
        ${getVectorIcon('card')} <span style="vertical-align: middle; margin-left: 6px;">Payment & Fee Breakdown</span>
      </h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        ${financialItems.map((item) => {
          const isGrandTotal = item.label.toLowerCase().includes('total') || item.isHighlight;
          const isDiscount = item.label.toLowerCase().includes('discount');
          const rowStyle = isGrandTotal 
            ? 'background-color: #FFF8F0; font-size: 16px; font-weight: 800; color: #6F4E37; border-top: 2px solid #6F4E37;'
            : 'font-size: 14px; color: #555555; border-bottom: 1px solid #F3EDE7;';
          
          return `
            <tr>
              <td style="padding: ${isGrandTotal ? '14px 12px' : '10px 0'}; ${rowStyle}">
                ${item.label}
              </td>
              <td style="padding: ${isGrandTotal ? '14px 12px' : '10px 0'}; text-align: right; ${rowStyle} ${isDiscount ? 'color: #16A34A; font-weight: 700;' : ''}">
                ${item.value}
              </td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
  ` : '';

  const ctaBtnHtml = ctaLink ? `
    <div style="text-align: center; margin: 24px 0 24px 0;">
      <a href="${ctaLink}" target="_blank" style="background: linear-gradient(135deg, #2C1810 0%, #4A2C11 50%, #6F4E37 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-size: 15px; font-weight: 800; display: inline-block; box-shadow: 0 6px 18px rgba(44, 24, 16, 0.25); letter-spacing: 0.5px;">
        ${ctaText} →
      </a>
    </div>
  ` : '';

  const statusTag = status ? getStatusBadge(status) : null;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { margin: 0; padding: 0; background-color: #F4F1EA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; border-radius: 0 !important; }
          .content { padding: 24px 16px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 30px 12px; background-color: #F4F1EA;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F1EA;">
        <tr>
          <td align="center">
            <table class="container" width="620" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.08); max-width: 620px; width: 100%; border: 1px solid #E8DED5;">
              <tr>
                <td>
                  ${getEmailHeader(title, statusTag)}
                  <div class="content" style="padding: 36px 32px; text-align: left; line-height: 1.6; color: #333333;">
                    ${bodyHtml}
                    ${ctaBtnHtml}
                    ${metaGridHtml}
                    ${financialTableHtml}
                  </div>
                  ${getEmailFooter()}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// --- TEMPLATES ---

// 1. OTP Verification
const getOtpTemplate = (name, otp) => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name || 'User'},</p>
    <p style="font-size: 15px; color: #555555; margin-bottom: 24px;">You have requested a secure verification code for your account on Fahara.</p>
    
    <div style="background: linear-gradient(135deg, #FFF8F0 0%, #FAF0E6 100%); border: 2px dashed #DDB892; padding: 28px; border-radius: 16px; text-align: center; margin: 28px 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
      <p style="font-size: 13px; color: #6F4E37; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 8px 0;">🔐 One-Time Password (OTP)</p>
      <div style="font-size: 42px; color: #2C1810; font-weight: 900; letter-spacing: 10px; margin: 0; font-family: 'Courier New', Courier, monospace;">${otp}</div>
    </div>
    
    <p style="font-size: 13px; color: #888888; text-align: center; margin: 0;">
      <span style="display: inline-block; background-color: #FEF3C7; color: #92400E; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 12px;">⏳ Valid for 5 minutes. Do not share this code.</span>
    </p>
  `;
  return generateBaseTemplate({ 
    title: 'Security Verification Code', 
    bodyHtml,
    ctaLink: `${FRONTEND_URL}/customer/profile`,
    ctaText: 'View Now!'
  });
};

// 2. Reset Password
const getResetPasswordTemplate = (name, resetLink) => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name || 'User'},</p>
    <p style="font-size: 15px; color: #555555;">We received a request to reset your password. Click the button below to set a new password for your account.</p>
    <p style="font-size: 13px; color: #888888; margin-top: 24px; padding-top: 16px; border-top: 1px solid #E8DED5;">If you didn't request this change, please ignore this email or reach out to support.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Reset Account Password', 
    bodyHtml,
    ctaLink: resetLink || `${FRONTEND_URL}/customer/profile`,
    ctaText: 'View Now!'
  });
};

// 3. Booking Request (Customer)
const getBookingRequestCustomerTemplate = (name, bookingId, summaryItems, bookingDbId = null) => {
  const targetId = bookingDbId || bookingId;
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <p style="font-size: 15px; color: #555555;">Your booking request <strong style="color: #6F4E37;">#${bookingId}</strong> has been successfully created! 🎉</p>
    <p style="font-size: 15px; color: #555555;">It is currently <span style="color: #D97706; font-weight: 700;">Pending Confirmation</span> from the venue host. You can view full details below.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Booking Request Submitted ⏳', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'PENDING',
    ctaLink: `${FRONTEND_URL}/customer/bookings/${targetId}`,
    ctaText: 'View Now!'
  });
};

// 3. Booking Request (Cafe Owner / Event Manager)
const getBookingRequestOwnerTemplate = (ownerName, bookingId, customerName, summaryItems, bookingDbId = null, isEventManager = false) => {
  const targetId = bookingDbId || bookingId;
  const ctaUrl = isEventManager 
    ? `${EM_FRONTEND_URL}/event/bookings/${targetId}`
    : `${CAFE_FRONTEND_URL}/owner/bookings/${targetId}`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${ownerName},</p>
    <p style="font-size: 15px; color: #555555;">You have received a new booking request (<strong style="color: #6F4E37;">#${bookingId}</strong>) from <strong>${customerName}</strong>.</p>
    <p style="font-size: 15px; color: #555555;">Please log in to your dashboard to accept or reject this reservation.</p>
  `;
  return generateBaseTemplate({ 
    title: 'New Booking Request Received 🔔', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'PENDING',
    ctaLink: ctaUrl, 
    ctaText: 'View Now!' 
  });
};

// 4. Payment Successful (Customer)
const getPaymentSuccessfulCustomerTemplate = (name, bookingId, summaryItems, bookingDbId = null) => {
  const targetId = bookingDbId || bookingId;
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 15px; color: #065F46; margin: 0; font-weight: 700;">✅ Payment Received Successfully for Booking #${bookingId}</p>
    </div>
    <p style="font-size: 15px; color: #555555;">Thank you! Your payment has been processed. Your reservation is now being reviewed by the cafe owner.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Payment Confirmed 💳', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'PAID',
    ctaLink: `${FRONTEND_URL}/customer/bookings/${targetId}`,
    ctaText: 'View Now!'
  });
};

// 4. Payment Successful (Cafe Owner / Event Manager)
const getPaymentSuccessfulOwnerTemplate = (ownerName, bookingId, amount, summaryItems, bookingDbId = null, isEventManager = false) => {
  const targetId = bookingDbId || bookingId;
  const ctaUrl = isEventManager 
    ? `${EM_FRONTEND_URL}/event/bookings/${targetId}` 
    : `${CAFE_FRONTEND_URL}/owner/bookings/${targetId}`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${ownerName},</p>
    <p style="font-size: 15px; color: #555555;">Payment of <strong style="color: #059669; font-size: 18px;">${amount}</strong> has been received for booking <strong style="color: #6F4E37;">#${bookingId}</strong>.</p>
    <p style="font-size: 15px; color: #555555;">Please review the reservation details below and finalize customer arrangements.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Payment Received 💰', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'PAID',
    ctaLink: ctaUrl, 
    ctaText: 'View Now!' 
  });
};

// 5. Booking Confirmed (Customer)
const getBookingConfirmedCustomerTemplate = (name, bookingId, summaryItems, bookingDbId = null) => {
  const targetId = bookingDbId || bookingId;
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #059669; padding: 16px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #047857; margin: 0; font-weight: 800;">🎉 Booking #${bookingId} is Officially Confirmed!</p>
    </div>
    <p style="font-size: 15px; color: #555555;">The cafe owner has confirmed your reservation. We look forward to hosting you!</p>
  `;
  return generateBaseTemplate({ 
    title: 'Booking Confirmed ✨', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'CONFIRMED',
    ctaLink: `${FRONTEND_URL}/customer/bookings/${targetId}`,
    ctaText: 'View Now!'
  });
};

// 5. Booking Confirmed (Admin / Event Management)
const getBookingConfirmedAdminTemplate = (adminName, bookingId, summaryItems, bookingDbId = null, isEventManager = false) => {
  const targetId = bookingDbId || bookingId;
  const ctaUrl = isEventManager 
    ? `${EM_FRONTEND_URL}/event/bookings/${targetId}` 
    : `${CAFE_FRONTEND_URL}/owner/bookings/${targetId}`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${adminName},</p>
    <p style="font-size: 15px; color: #555555;">Booking <strong style="color: #6F4E37;">#${bookingId}</strong> has been officially confirmed.</p>
    <p style="font-size: 15px; color: #555555;">Please ensure venue setup and guest services are fully prepared.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Booking Confirmed', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'CONFIRMED',
    ctaLink: ctaUrl, 
    ctaText: 'View Now!' 
  });
};

// 6. Booking Cancelled (Customer)
const getBookingCancelledCustomerTemplate = (name, bookingId, reason, summaryItems, bookingDbId = null) => {
  const targetId = bookingDbId || bookingId;
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 16px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 15px; color: #991B1B; margin: 0; font-weight: 700;">Notice: Booking #${bookingId} has been cancelled.</p>
      ${reason ? `<p style="font-size: 13px; color: #B91C1C; margin: 6px 0 0 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
    </div>
    <p style="font-size: 15px; color: #555555;">If applicable, refund requests will be processed as per our cancellation policy.</p>
  `;
  return generateBaseTemplate({ 
    title: 'Booking Cancelled', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'CANCELLED',
    ctaLink: `${FRONTEND_URL}/customer/bookings/${targetId}`,
    ctaText: 'View Now!'
  });
};

// 6. Booking Cancelled (Cafe Owner / Event Manager)
const getBookingCancelledOwnerTemplate = (ownerName, bookingId, cancelledBy, reason, summaryItems, bookingDbId = null, isEventManager = false) => {
  const targetId = bookingDbId || bookingId;
  const ctaUrl = isEventManager 
    ? `${EM_FRONTEND_URL}/event/bookings/${targetId}` 
    : `${CAFE_FRONTEND_URL}/owner/bookings/${targetId}`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${ownerName},</p>
    <p style="font-size: 15px; color: #555555;">Booking <strong style="color: #6F4E37;">#${bookingId}</strong> was <span style="color: #DC2626; font-weight: 700;">cancelled</span> by ${cancelledBy}.</p>
    ${reason ? `<div style="background-color: #F9FAFB; padding: 12px; border-radius: 8px; margin: 16px 0; border: 1px solid #E5E7EB;"><p style="font-size: 13px; color: #4B5563; margin: 0;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
  `;
  return generateBaseTemplate({ 
    title: 'Booking Cancelled', 
    bodyHtml, 
    summaryItems, 
    bookingId: targetId,
    status: 'CANCELLED',
    ctaLink: ctaUrl,
    ctaText: 'View Now!'
  });
};

// 7. Payout Completed (Cafe Owner / Event Manager)
const getPayoutCompletedTemplate = (name, amount, referenceNumber, partnerType = 'CAFE_OWNER') => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #065F46; margin: 0; font-weight: 800;">💸 Payout Successfully Transferred!</p>
      <p style="font-size: 14px; color: #047857; margin: 6px 0 0 0;">Great news! Your payout of <strong style="font-size: 18px; color: #065F46;">₹${Number(amount).toFixed(2)}</strong> has been processed and transferred by the Fahara Admin team.</p>
    </div>
    <p style="font-size: 15px; color: #555555;">Please review the transfer details and reference number below for your financial records.</p>
  `;

  const summaryItems = [
    { label: 'Booking No', value: referenceNumber },
    { label: 'Partner Name', value: name },
    { label: 'Partner Role', value: partnerType === 'EVENT_MANAGER' ? 'Event Manager' : 'Cafe Owner' },
    { label: 'Transfer Amount', value: `₹${Number(amount).toFixed(2)}`, isHighlight: true }
  ];

  const ctaLink = partnerType === 'EVENT_MANAGER' 
    ? `${EM_FRONTEND_URL}/event/revenue` 
    : `${CAFE_FRONTEND_URL}/event/revenue`;

  return generateBaseTemplate({ 
    title: 'Payout Transferred 💸', 
    bodyHtml, 
    summaryItems, 
    status: 'COMPLETED',
    ctaLink,
    ctaText: 'View Now!'
  });
};

// 8. Refund Completed (Customer)
const getRefundCompletedTemplate = (name, amount, bookingNumber, referenceNumber) => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #065F46; margin: 0; font-weight: 800;">🔄 Refund Processed & Completed!</p>
      <p style="font-size: 14px; color: #047857; margin: 6px 0 0 0;">Your refund of <strong style="font-size: 18px; color: #065F46;">₹${Number(amount).toFixed(2)}</strong> for booking <strong style="color: #6F4E37;">#${bookingNumber}</strong> has been successfully processed and marked as completed by the Fahara Admin team.</p>
    </div>
    <p style="font-size: 15px; color: #555555;">The refunded amount should reflect in your original payment method / bank account within 3 to 5 business days.</p>
  `;

  const summaryItems = [
    { label: 'Booking No', value: bookingNumber },
    { label: 'Refund Reference', value: referenceNumber },
    { label: 'Refund Status', value: 'COMPLETED', isHighlight: true },
    { label: 'Refunded Amount', value: `₹${Number(amount).toFixed(2)}`, isHighlight: true }
  ];

  return generateBaseTemplate({ 
    title: 'Refund Processed 🔄', 
    bodyHtml, 
    summaryItems, 
    status: 'COMPLETED',
    ctaLink: `${FRONTEND_URL}/customer/bookings`,
    ctaText: 'View Now!'
  });
};

// 9. Support Ticket Notification (Admin)
const getSupportTicketTemplate = (ticketData) => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi Admin,</p>
    <div style="background-color: #FFF8F0; border-left: 4px solid #6F4E37; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #2C1810; margin: 0; font-weight: 800;">📩 New Support Request #${ticketData.ticketId}</p>
      <p style="font-size: 14px; color: #7A6053; margin: 6px 0 0 0;">A new support ticket has been submitted by <strong>${ticketData.fullName}</strong> (${ticketData.email}).</p>
    </div>

    <div style="background-color: #ffffff; border: 1px solid #E8DED5; border-radius: 14px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #6F4E37; font-size: 14px; font-weight: 800; text-transform: uppercase;">Customer Message</h3>
      <div style="background-color: #FFFBF7; padding: 16px; border-radius: 10px; border: 1px solid #E8DED5; font-size: 14px; color: #2C1810; line-height: 1.6; white-space: pre-wrap;">${ticketData.message}</div>
    </div>
  `;

  const summaryItems = [
    { label: 'Booking No', value: ticketData.ticketId },
    { label: 'Customer Name', value: ticketData.fullName },
    { label: 'Customer Email', value: ticketData.email },
    { label: 'Phone Number', value: ticketData.phone || 'N/A' },
    { label: 'Booking Reference', value: ticketData.bookingId || 'N/A' },
    { label: 'Support Category', value: ticketData.category || 'General' },
    { label: 'Ticket Subject', value: ticketData.subject || 'Support Request' }
  ];

  return generateBaseTemplate({ 
    title: `Support Ticket #${ticketData.ticketId}`, 
    bodyHtml, 
    summaryItems, 
    status: 'PENDING',
    ctaLink: `${ADMIN_FRONTEND_URL}/admin/notifications`,
    ctaText: 'View Now!'
  });
};

// 10. KYC Status Email (Cafe Owner / Event Manager)
const getKycStatusTemplate = (name, kycStatus, rejectionReason = null, roleName = 'Partner') => {
  const isApproved = kycStatus === 'APPROVED' || kycStatus === 'ACTIVE';
  const statusTitle = isApproved ? 'KYC Verification Approved! 🎉' : 'KYC Verification Update';
  const statusColor = isApproved ? '#10B981' : '#EF4444';
  const badgeStatus = isApproved ? 'CONFIRMED' : 'CANCELLED';

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: ${isApproved ? '#ECFDF5' : '#FEF2F2'}; border-left: 4px solid ${statusColor}; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: ${isApproved ? '#065F46' : '#991B1B'}; margin: 0; font-weight: 800;">${statusTitle}</p>
      <p style="font-size: 14px; color: ${isApproved ? '#047857' : '#B91C1C'}; margin: 6px 0 0 0;">
        ${isApproved 
          ? `Congratulations! Your business KYC verification has been reviewed and <strong style="color: #065F46;">APPROVED</strong> by the Fahara Admin team. Your profile is now active to receive bookings & split payouts.` 
          : `Your KYC verification requires attention. Status: <strong style="color: #991B1B;">${kycStatus}</strong>.`}
      </p>
      ${rejectionReason ? `<p style="font-size: 14px; color: #991B1B; margin: 8px 0 0 0;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
    </div>
    <p style="font-size: 15px; color: #555555;">
      ${isApproved 
        ? 'You can now manage your listings, packages, and view payouts directly from your dashboard.' 
        : 'Please update your business/bank profile details and re-submit for verification or contact support.'}
    </p>
  `;

  const summaryItems = [
    { label: 'Partner Role', value: roleName },
    { label: 'KYC Status', value: isApproved ? 'APPROVED ✅' : kycStatus, isHighlight: true },
    ...(rejectionReason ? [{ label: 'Rejection Reason', value: rejectionReason }] : [])
  ];

  const ctaUrl = roleName === 'Event Manager' ? `${EM_FRONTEND_URL}/event/settings` : `${CAFE_FRONTEND_URL}/event/settings`;

  return generateBaseTemplate({ 
    title: statusTitle, 
    bodyHtml, 
    summaryItems, 
    status: badgeStatus,
    ctaLink: ctaUrl,
    ctaText: 'View Now!'
  });
};

// 11. Bank Account Verified & Connected Template
const getBankVerifiedTemplate = (name, roleName = 'Partner', maskedAccount = 'XXXX-XXXX') => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #065F46; margin: 0; font-weight: 800;">🏦 Bank Account Verified & Connected!</p>
      <p style="font-size: 14px; color: #047857; margin: 6px 0 0 0;">Great news! Your bank account (<strong style="color: #065F46;">${maskedAccount}</strong>) has passed verification and is now connected to <strong>Razorpay Route & Auto-Settlement</strong>.</p>
    </div>
    <p style="font-size: 15px; color: #555555;">All earnings and fee split shares from customer bookings will be automatically settled directly into this bank account on a daily schedule.</p>
  `;

  const summaryItems = [
    { label: 'Partner Role', value: roleName },
    { label: 'Bank Status', value: 'VERIFIED & ACTIVE ✅', isHighlight: true },
    { label: 'Settlement Engine', value: 'Razorpay Route' }
  ];

  const ctaUrl = roleName === 'Event Manager' ? `${EM_FRONTEND_URL}/event/settings` : `${CAFE_FRONTEND_URL}/event/settings`;

  return generateBaseTemplate({ 
    title: 'Bank Verification Successful 🏦', 
    bodyHtml, 
    summaryItems, 
    status: 'PAID',
    ctaLink: ctaUrl,
    ctaText: 'View Now!'
  });
};

// 12. Entity (Cafe / Event Profile) Rejected Template
const getEntityRejectedTemplate = (name, entityType = 'Cafe Venue', entityName = '', rejectionReason = 'Does not meet platform standards') => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #991B1B; margin: 0; font-weight: 800;">⚠️ ${entityType} Submission Not Approved</p>
      <p style="font-size: 14px; color: #B91C1C; margin: 6px 0 0 0;">Your submission for <strong style="color: #991B1B;">${entityName || entityType}</strong> was reviewed by the Fahara Admin team and was not approved at this time.</p>
      <p style="font-size: 14px; color: #991B1B; margin: 10px 0 0 0;"><strong>Reason:</strong> ${rejectionReason}</p>
    </div>
    <p style="font-size: 15px; color: #555555;">Please review the feedback above, update your profile or cafe details in your partner portal, and submit again for review.</p>
  `;

  const summaryItems = [
    { label: 'Submission Type', value: entityType },
    { label: 'Entity Name', value: entityName || 'N/A' },
    { label: 'Status', value: 'REJECTED ❌', isHighlight: true },
    { label: 'Rejection Reason', value: rejectionReason }
  ];

  const ctaUrl = entityType.toLowerCase().includes('event') ? `${EM_FRONTEND_URL}/event/settings` : `${CAFE_FRONTEND_URL}/event/settings`;

  return generateBaseTemplate({ 
    title: `${entityType} Review Update ⚠️`, 
    bodyHtml, 
    summaryItems, 
    status: 'CANCELLED',
    ctaLink: ctaUrl,
    ctaText: 'View Now!'
  });
};

// 13. Settlement Completed (Cafe Owner / Event Manager)
const getSettlementCompletedTemplate = (name, amount, bookingNumber, referenceNumber, partnerType = 'CAFE', entityName = '') => {
  const isEventManager = partnerType === 'EVENT_MANAGER';
  const partnerRoleTitle = isEventManager ? 'Event Manager' : 'Cafe Owner';
  const ctaLink = isEventManager 
    ? `${EM_FRONTEND_URL}/event/revenue` 
    : `${CAFE_FRONTEND_URL}/event/revenue`;

  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi ${name},</p>
    <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #065F46; margin: 0; font-weight: 800;">🎉 Settlement Completed Successfully!</p>
      <p style="font-size: 14px; color: #047857; margin: 6px 0 0 0;">Your settlement share of <strong style="font-size: 18px; color: #065F46;">₹${Number(amount).toFixed(2)}</strong> for booking <strong style="color: #6F4E37;">#${bookingNumber || 'N/A'}</strong> has been successfully processed and transferred to your bank account via Razorpay Route Auto-Settlement.</p>
    </div>
    <p style="font-size: 15px; color: #555555;">The funds should reflect in your connected bank account according to your bank's processing cycle. Check your partner dashboard for financial details.</p>
  `;

  const summaryItems = [
    { label: 'Booking Number', value: bookingNumber ? `#${bookingNumber}` : 'N/A' },
    { label: 'Partner Role', value: partnerRoleTitle },
    ...(entityName ? [{ label: isEventManager ? 'Event Service' : 'Cafe Venue', value: entityName }] : []),
    { label: 'Transfer / Settlement ID', value: referenceNumber || 'N/A' },
    { label: 'Settlement Status', value: 'COMPLETED ✅', isHighlight: true },
    { label: 'Settled Amount', value: `₹${Number(amount).toFixed(2)}`, isHighlight: true }
  ];

  return generateBaseTemplate({ 
    title: 'Settlement Completed 🎉', 
    bodyHtml, 
    summaryItems, 
    status: 'COMPLETED',
    ctaLink,
    ctaText: 'View Now!'
  });
};

// 14. New Account Created (Admin Notification)
const getNewAccountNotificationTemplate = (user) => {
  const bodyHtml = `
    <p style="font-size: 16px; color: #2C1810; margin-top: 0; font-weight: 600;">Hi Admin,</p>
    <div style="background-color: #FFF8F0; border-left: 4px solid #6F4E37; padding: 18px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <p style="font-size: 16px; color: #2C1810; margin: 0; font-weight: 800;">👤 New Account Registration</p>
      <p style="font-size: 14px; color: #7A6053; margin: 6px 0 0 0;">A new user account (<strong style="color: #6F4E37;">${user.email}</strong>) has been registered on the platform.</p>
    </div>
  `;

  const summaryItems = [
    { label: 'Full Name', value: user.name || 'N/A' },
    { label: 'Email Address', value: user.email },
    { label: 'Account Role', value: user.roleName || 'Customer', isHighlight: true },
    { label: 'Phone Number', value: user.phone || 'N/A' }
  ];

  return generateBaseTemplate({ 
    title: `New Account: ${user.roleName || 'Customer'}`, 
    bodyHtml, 
    summaryItems, 
    ctaLink: `${ADMIN_FRONTEND_URL}/admin/customers`,
    ctaText: 'View Now!'
  });
};

module.exports = {
  getOtpTemplate,
  getResetPasswordTemplate,
  getBookingRequestCustomerTemplate,
  getBookingRequestOwnerTemplate,
  getPaymentSuccessfulCustomerTemplate,
  getPaymentSuccessfulOwnerTemplate,
  getBookingConfirmedCustomerTemplate,
  getBookingConfirmedAdminTemplate,
  getBookingCancelledCustomerTemplate,
  getBookingCancelledOwnerTemplate,
  getPayoutCompletedTemplate,
  getRefundCompletedTemplate,
  getSupportTicketTemplate,
  getKycStatusTemplate,
  getBankVerifiedTemplate,
  getEntityRejectedTemplate,
  getSettlementCompletedTemplate,
  getNewAccountNotificationTemplate
};


