const nodemailer = require('nodemailer');
const templates = require('./emailTemplates');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const getAdminEmail = () => process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com';

const sendOtpEmail = async (email, otp) => {
  const customHtml = templates.getOtpTemplate('there', otp);

  console.log(`\n======================================================================`);
  console.log(`🔑 [OTP GENERATED] Target Email: ${email}`);
  console.log(`   OTP Code    : ${otp}`);
  console.log(`   Expires In  : 5 Minutes`);
  console.log(`======================================================================\n`);

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your Fahara Verification Code',
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
    html: customHtml,
  };

  // Asynchronous non-blocking send
  transporter.sendMail(mailOptions)
    .then(() => {
      console.log(`[sendOtpEmail] OTP email sent strictly to ${email}`);
    })
    .catch((error) => {
      console.error('[sendOtpEmail] Failed to send OTP email via SMTP:', error?.message || error);
    });
};

const sendEmail = async (to, subject, text, html, skipBcc = false, fromName = null) => {
  const adminEmail = getAdminEmail();
  const shouldBccAdmin = !skipBcc && adminEmail && adminEmail.toLowerCase() !== (to || '').toLowerCase();

  const senderAddress = process.env.FROM_EMAIL || 'noreply@vexatech.in';
  const formattedFrom = fromName 
    ? `"${fromName.replace(/"/g, '')}" <${senderAddress}>`
    : senderAddress;

  const mailOptions = {
    from: formattedFrom,
    to,
    bcc: shouldBccAdmin ? adminEmail : undefined,
    subject,
    text,
    html,
  };

  // Asynchronous non-blocking send
  transporter.sendMail(mailOptions)
    .then(() => {
      console.log(`[sendEmail] Sent email to: ${to}${shouldBccAdmin ? ` | Admin Copy: ${adminEmail}` : ''}`);
    })
    .catch((error) => {
      console.error('[sendEmail] Failed to send generic email:', error?.message || error);
    });
};

// Wrapper functions for easy integration
const sendResetPasswordEmail = async (email, name, resetLink) => {
  const html = templates.getResetPasswordTemplate(name, resetLink);
  await sendEmail(email, 'Reset Your Password - Fahara', 'Click the link to reset your password.', html, true);
};

const sendBookingStatusEmail = async ({ to, subject, htmlContent }) => {
  await sendEmail(to, subject, '', htmlContent);
};

const sendNewAccountNotificationToAdmin = async (user) => {
  const adminEmail = getAdminEmail();
  const subject = `New Account Created: ${user.roleName || 'User'}`;
  const text = `A new account has been created.\n\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.roleName || 'User'}\nPhone: ${user.phone || 'N/A'}`;
  const html = templates.getNewAccountNotificationTemplate(user);
  
  await sendEmail(adminEmail, subject, text, html);
};

const sendAccountStatusEmail = async (email, name, title, message, kycStatus = null, rejectionReason = null, roleName = 'Partner') => {
  const subject = `Fahara - ${title}`;
  const text = `Hello ${name},\n\n${message}${rejectionReason ? `\nReason: ${rejectionReason}` : ''}`;
  const html = kycStatus 
    ? templates.getKycStatusTemplate(name, kycStatus, rejectionReason, roleName)
    : `<p>Hello ${name},</p><p>${message}</p>`;
  await sendEmail(email, subject, text, html);
};

const sendKycStatusEmail = async (email, name, kycStatus, rejectionReason = null, roleName = 'Cafe Owner / Event Manager') => {
  const isApproved = kycStatus === 'APPROVED' || kycStatus === 'ACTIVE';
  const title = isApproved ? 'KYC Verification Approved' : 'KYC Verification Updated';
  const message = isApproved 
    ? 'Your KYC verification has been approved! You can now accept bookings and receive payouts.'
    : `Your KYC verification status is ${kycStatus}.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;

  await sendAccountStatusEmail(email, name, title, message, kycStatus, rejectionReason, roleName);
};

const sendPayoutCompletedEmail = async (email, name, amount, referenceNumber, partnerType = 'CAFE_OWNER') => {
  const subject = `Payout Transferred - Fahara (Ref: ${referenceNumber})`;
  const text = `Hello ${name},\n\nYour payout of Rs. ${amount} has been successfully processed by Fahara Admin.\nReference Number: ${referenceNumber}\n\nThank you,\nFahara Team`;
  const html = templates.getPayoutCompletedTemplate(name, amount, referenceNumber, partnerType);
  
  await sendEmail(email, subject, text, html);
};

const sendRefundCompletedEmail = async (email, name, amount, bookingNumber, referenceNumber) => {
  const subject = `Refund Processed & Completed - Fahara (Booking #${bookingNumber})`;
  const text = `Hello ${name},\n\nYour refund of Rs. ${amount} for booking #${bookingNumber} has been successfully processed and transferred via Fahara Payments.\nReference Number: ${referenceNumber}\n\nThank you,\nFahara Team`;
  const html = templates.getRefundCompletedTemplate(name, amount, bookingNumber, referenceNumber);
  
  await sendEmail(email, subject, text, html);
};

const sendBankVerifiedEmail = async (email, name, roleName = 'Partner', maskedAccount = 'XXXX-XXXX') => {
  const subject = `Bank Account Verified & Connected - Fahara Payouts`;
  const text = `Hello ${name},\n\nYour bank account (${maskedAccount}) has been verified and successfully connected to Fahara Payments (Razorpay Route). You are now eligible to receive automated split payouts directly to your bank account.`;
  const html = templates.getBankVerifiedTemplate(name, roleName, maskedAccount);

  await sendEmail(email, subject, text, html);
};

const sendEntityRejectedEmail = async (email, name, entityType = 'Cafe Venue', entityName = '', rejectionReason = 'Does not meet platform guidelines') => {
  const subject = `Listing Status Update: ${entityType} Review Result`;
  const text = `Hello ${name},\n\nYour submission for ${entityType} (${entityName}) has been reviewed and was not approved at this time.\nReason: ${rejectionReason}`;
  const html = templates.getEntityRejectedTemplate(name, entityType, entityName, rejectionReason);

  await sendEmail(email, subject, text, html);
};

const sendSupportTicketEmailToAdmin = async (ticketData) => {
  const adminEmail = getAdminEmail();
  const subject = `[Support Ticket ${ticketData.ticketId}] ${ticketData.category || 'General Issue'} - ${ticketData.subject || 'Support Request'}`;
  const text = `New Support Ticket Submitted:\n\nTicket ID: ${ticketData.ticketId}\nFull Name: ${ticketData.fullName}\nEmail: ${ticketData.email}\nPhone: ${ticketData.phone || 'N/A'}\nBooking ID: ${ticketData.bookingId || 'N/A'}\nCategory: ${ticketData.category}\nSubject: ${ticketData.subject}\nMessage:\n${ticketData.message}`;
  const html = templates.getSupportTicketTemplate(ticketData);

  await sendEmail(adminEmail, subject, text, html);
};

const sendSettlementCompletedEmail = async ({ email, name, amount, bookingNumber, referenceNumber, partnerType = 'CAFE', entityName = '' }) => {
  if (!email) return;
  const roleTitle = partnerType === 'EVENT_MANAGER' ? 'Event Manager' : 'Cafe Owner';
  const subject = `Settlement Completed - ₹${Number(amount).toFixed(2)} Transferred (Booking #${bookingNumber || 'N/A'})`;
  const text = `Hello ${name},\n\nYour settlement share of Rs. ${Number(amount).toFixed(2)} for booking #${bookingNumber || 'N/A'} has been completed and transferred via Razorpay Route.\nReference ID: ${referenceNumber}\n\nThank you,\nFahara Team`;
  const html = templates.getSettlementCompletedTemplate(name, amount, bookingNumber, referenceNumber, partnerType, entityName);

  await sendEmail(email, subject, text, html);
};

const sendBirthdayPromotionalEmail = async (email, name) => {
  const subject = `🎉 Celebrate Your Birthday with Fahara! Special Cafe Offers Inside 🎂`;
  const text = `Hi ${name || 'Valued Guest'},\n\nYour birthday is just 30 days away! Celebrate your birthday with Fahara and get special birthday offers at cafes.\n\nBook now at https://fahara.in`;
  const html = templates.getBirthdayPromotionalTemplate(name);

  await sendEmail(email, subject, text, html);
};

const sendNewSubscriptionNotificationToAdmin = async (subscriptionData) => {
  const adminEmail = getAdminEmail();
  const subject = `New Partner Subscription Activated: ${subscriptionData.partnerName || subscriptionData.ownerName || 'Partner'} (${subscriptionData.partnerType || 'CAFE'})`;
  const text = `A new subscription has been activated.\n\nPartner: ${subscriptionData.partnerName}\nType: ${subscriptionData.partnerType}\nPlan: ${subscriptionData.planName}\nFee: Rs. ${subscriptionData.price}/month\nRazorpay Sub ID: ${subscriptionData.razorpaySubscriptionId}`;
  const html = templates.getNewSubscriptionAdminTemplate(subscriptionData);

  await sendEmail(adminEmail, subject, text, html);
};

const sendSubscriptionCancelledAdminEmail = async (data) => {
  const adminEmail = getAdminEmail();
  const typeTitle = data.partnerType === 'EVENT_MANAGER' ? 'Event Manager' : (data.partnerType === 'RESTAURANT' ? 'Restaurant' : 'Cafe');
  const subject = `New Fahara ${typeTitle} Subscription Cancellation – ${data.partnerName || 'Partner'}`;
  const text = `A partner has cancelled their Fahara subscription.\n\nPartner: ${data.partnerName}\nType: ${typeTitle}\nPlan: ${data.planName}\nEnd Date: ${data.periodEnd ? new Date(data.periodEnd).toLocaleDateString() : 'End of period'}`;
  const html = templates.getSubscriptionCancelledAdminTemplate(data);

  await sendEmail(adminEmail, subject, text, html);
};

const sendSubscriptionExpiredPartnerEmail = async (data) => {
  if (!data.email) return;
  const roleTitle = data.partnerType === 'EVENT_MANAGER' ? 'Event Partner' : 'Partner';
  const subject = `Your Fahara ${roleTitle} Subscription Has Expired – Renew Now`;
  const text = `Hello ${data.ownerName},\n\nYour Fahara subscription for ${data.partnerName} has expired. Portal management features are currently locked. Renew your subscription at ${data.renewalUrl}`;
  const html = templates.getSubscriptionExpiredPartnerTemplate(data);

  await sendEmail(data.email, subject, text, html, true);
};

const sendPartnerSubscriptionPaymentSuccessEmail = async (data) => {
  if (!data?.email) {
    console.warn('[SubscriptionEmail] Missing recipient email for payment success notification');
    return { success: false, reason: 'MISSING_EMAIL' };
  }

  const subject = 'Payment Successful — Your Fahara Partner Subscription Is Active';
  const { html, text } = templates.getPartnerSubscriptionPaymentSuccessTemplate(data);

  return await sendEmailWithTracking({
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    paymentReference: data.paymentReference,
    subscriptionReference: data.subscriptionReference,
    emailType: 'SUBSCRIPTION_PAYMENT_SUCCESS',
    recipient: data.email,
    subject,
    text,
    html,
    eventKey: data.eventKey || `SUB_SUCCESS_${data.subscriptionId}_${data.paymentReference || Date.now()}`
  });
};

const sendPartnerSubscriptionCancellationEmail = async (data) => {
  if (!data?.email) {
    console.warn('[SubscriptionEmail] Missing recipient email for cancellation notification');
    return { success: false, reason: 'MISSING_EMAIL' };
  }

  const subject = 'Your Fahara Partner Subscription Cancellation Update';
  const { html, text } = templates.getPartnerSubscriptionCancellationTemplate(data);

  return await sendEmailWithTracking({
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    paymentReference: null,
    subscriptionReference: data.subscriptionReference,
    emailType: 'SUBSCRIPTION_CANCELLATION',
    recipient: data.email,
    subject,
    text,
    html,
    eventKey: data.eventKey || `SUB_CANCEL_${data.subscriptionId}_${data.cancellationDate || Date.now()}`
  });
};

const sendPartnerSubscriptionExpiredEmail = async (data) => {
  if (!data?.email) {
    console.warn('[SubscriptionEmail] Missing recipient email for expiry notification');
    return { success: false, reason: 'MISSING_EMAIL' };
  }

  const subject = 'Your Fahara Partner Subscription Has Expired — Renew Today';
  const { html, text } = templates.getPartnerSubscriptionExpiredTemplate(data);

  return await sendEmailWithTracking({
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    paymentReference: null,
    subscriptionReference: data.subscriptionReference,
    emailType: 'SUBSCRIPTION_EXPIRED',
    recipient: data.email,
    subject,
    text,
    html,
    eventKey: data.eventKey || `SUB_EXPIRED_${data.subscriptionId}_${data.expiryDate || Date.now()}`
  });
};

/**
 * Robust email delivery with retry, dedup eventKey, and audit tracking.
 * Safe: Email errors NEVER throw to roll back payments or subscription state.
 */
const sendEmailWithTracking = async ({
  userId,
  subscriptionId,
  paymentReference,
  subscriptionReference,
  emailType,
  recipient,
  subject,
  text,
  html,
  eventKey,
  maxRetries = 2
}) => {
  const prisma = require('../config/prisma');

  // 1. Check deduplication by eventKey in notifications table
  if (eventKey) {
    try {
      const existing = await prisma.notifications.findFirst({
        where: {
          user_id: userId,
          notification_type: eventKey
        }
      });
      if (existing) {
        console.log(`[SubscriptionEmail] Duplicate skipped for eventKey: ${eventKey}`);
        return { success: true, duplicate: true, notificationId: existing.id };
      }
    } catch (checkErr) {
      console.warn('[SubscriptionEmail Audit Check Warning]:', checkErr.message);
    }
  }

  // 2. Prepare tracking record in notifications table
  let notifRecord = null;
  if (userId) {
    try {
      notifRecord = await prisma.notifications.create({
        data: {
          user_id: userId,
          title: subject,
          message: text.substring(0, 1000),
          notification_type: eventKey || emailType,
          channel: 'EMAIL',
          status: 'PENDING'
        }
      });
    } catch (saveErr) {
      console.warn('[SubscriptionEmail Audit Init Warning]:', saveErr.message);
    }
  }

  // 3. Attempt delivery with retries
  let attempts = 0;
  let lastError = null;
  let delivered = false;

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: recipient,
    subject,
    text,
    html
  };

  while (attempts <= maxRetries && !delivered) {
    attempts++;
    try {
      await transporter.sendMail(mailOptions);
      delivered = true;
      console.log(`[SubscriptionEmail SUCCESS] Type: ${emailType} -> To: ${recipient} (Attempt ${attempts})`);
    } catch (err) {
      lastError = err?.message || String(err);
      console.error(`[SubscriptionEmail ERROR] Attempt ${attempts} failed for ${recipient}: ${lastError}`);
      if (attempts <= maxRetries) {
        // Backoff delay before retry (500ms * attempt)
        await new Promise(res => setTimeout(res, 500 * attempts));
      }
    }
  }

  // 4. Update audit log status safely
  if (notifRecord?.id) {
    try {
      await prisma.notifications.update({
        where: { id: notifRecord.id },
        data: {
          status: delivered ? 'SENT' : 'FAILED',
          sent_at: delivered ? new Date() : null
        }
      });
    } catch (updateErr) {
      console.warn('[SubscriptionEmail Audit Update Warning]:', updateErr.message);
    }
  }

  return {
    success: delivered,
    attempts,
    lastError: delivered ? null : lastError,
    notificationId: notifRecord?.id || null
  };
};

module.exports = {
  getAdminEmail,
  sendOtpEmail,
  sendEmail,
  sendResetPasswordEmail,
  sendBookingStatusEmail,
  sendNewAccountNotificationToAdmin,
  sendAccountStatusEmail,
  sendKycStatusEmail,
  sendPayoutCompletedEmail,
  sendRefundCompletedEmail,
  sendBankVerifiedEmail,
  sendEntityRejectedEmail,
  sendSupportTicketEmailToAdmin,
  sendSettlementCompletedEmail,
  sendBirthdayPromotionalEmail,
  sendNewSubscriptionNotificationToAdmin,
  sendSubscriptionCancelledAdminEmail,
  sendSubscriptionExpiredPartnerEmail,
  sendPartnerSubscriptionPaymentSuccessEmail,
  sendPartnerSubscriptionCancellationEmail,
  sendPartnerSubscriptionExpiredEmail,
  sendEmailWithTracking,
  templates
};


