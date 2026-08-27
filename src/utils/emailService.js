const nodemailer = require('nodemailer');
const templates = require('./emailTemplates');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

const getAdminEmail = () => process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com';

const sendOtpEmail = async (email, otp) => {
  const customHtml = templates.getOtpTemplate('there', otp);

  console.log(`\n==============================================`);
  console.log(`🔑 [LOCAL DEV OTP] Email: ${email} | OTP Code: ${otp}`);
  console.log(`==============================================\n`);

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

const sendEmail = async (to, subject, text, html, skipBcc = false) => {
  const adminEmail = getAdminEmail();
  const shouldBccAdmin = !skipBcc && adminEmail && adminEmail.toLowerCase() !== (to || '').toLowerCase();

  const mailOptions = {
    from: process.env.FROM_EMAIL,
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
  const html = `<p>A new account has been created.</p><p><b>Name:</b> ${user.name}</p><p><b>Email:</b> ${user.email}</p><p><b>Role:</b> ${user.roleName || 'User'}</p><p><b>Phone:</b> ${user.phone || 'N/A'}</p>`;
  
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
  templates
};

