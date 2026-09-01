const notificationRepository = require('../repositories/notificationRepository');
const userDeviceRepository = require('../repositories/userDeviceRepository');
const userRepository = require('../repositories/userRepository');
const emailService = require('../utils/emailService');
const firebaseConfig = require('../config/firebase');
const templates = require('../utils/emailTemplates');

const formatTimeUTC = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours.toString().padStart(2, '0')}:${minutesStr} ${ampm}`;
};

const formatDateUTC = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

const notifyUser = async (userId, title, message, type, bookingId = null, customHtml = null) => {
  try {
    console.log(`[notifyUser] Start for userId: ${userId}, type: ${type}, bookingId: ${bookingId}`);
    // 1. Fetch user details for email
    const user = await userRepository.findUserById(userId);
    if (!user) {
      console.log(`[notifyUser] User ${userId} not found in DB!`);
      return;
    }

    console.log(`[notifyUser] Found user ${user.email}, saving notification to DB...`);
    // 2. Save to DB first so it is never lost
    let saved;
    try {
      saved = await notificationRepository.saveNotification({
        user_id: userId,
        booking_id: bookingId,
        title,
        message,
        notification_type: type,
        channel: 'IN_APP',
        status: 'SENT',
        sent_at: new Date(),
      });
      console.log(`[notifyUser] Saved notification to DB: ${saved.id}`);
    } catch (dbErr) {
      if (dbErr.code === 'P2003') {
        console.warn(`[notifyUser] Foreign key constraint failed (e.g. booking deleted). Saving without booking_id.`);
        saved = await notificationRepository.saveNotification({
          user_id: userId,
          booking_id: null,
          title,
          message,
          notification_type: type,
          channel: 'IN_APP',
          status: 'SENT',
          sent_at: new Date(),
        });
        console.log(`[notifyUser] Saved notification to DB without booking_id: ${saved.id}`);
      } else {
        throw dbErr;
      }
    }

    // 3. Send Email
    try {
      const emailToSend = user.event_management_profiles?.business_email || user.email;
      await emailService.sendEmail(
        emailToSend,
        title,
        message,
        customHtml || `<p>${message}</p>` // simple HTML body
      );
    } catch (emailErr) {
      console.error(`Failed to send email to ${user.email}:`, emailErr.message);
    }

    // 4. Send Push Notification via Firebase
    try {
      const tokens = await userDeviceRepository.getActiveTokens(userId);
      if (tokens && tokens.length > 0) {
        await firebaseConfig.sendPushNotification(tokens, title, message, {
          type,
          bookingId: bookingId ? bookingId.toString() : '',
        });
      }
    } catch (pushErr) {
      console.error(`Failed to send push notification to user ${userId}:`, pushErr.message);
    }

  } catch (error) {
    console.error(`Failed to notify user ${userId}:`, error);
  }
};

const notifyBookingCreated = async (booking) => {
  const hasEventService = !!(booking.event_services?.user_id);
  const cafeAmount = Number(booking.cafe_amount || 0);
  const eventServiceAmount = Number(booking.event_service_amount || 0);
  const foodAmount = Number(booking.food_amount || 0);
  const decorationAmount = Number(booking.decoration_amount || 0);
  const extraPersonAmount = Number(booking.extra_person_amount || 0);
  const discount = Number(booking.discount || 0);
  const subtotal = Number(booking.subtotal || (cafeAmount + eventServiceAmount + foodAmount + decorationAmount + extraPersonAmount - discount));
  const faharaCharge = Number(booking.fahara_service_charge || (subtotal * 0.03));
  const transactionFee = Number(booking.transaction_fee || (subtotal * 0.03));
  const gst = Number(booking.gst || (transactionFee * 0.18));
  const total = Number(booking.total || (subtotal + faharaCharge + transactionFee + gst));

  // Cafe owner portion: cafe_amount + food + decoration + extra_person - discount
  const cafeOwnerAmount = cafeAmount + foodAmount + decorationAmount + extraPersonAmount - discount;

  // ── Customer summary: full breakdown ──
  const customerSummaryItems = [
    { label: 'Booking No', value: booking.booking_number, icon: '🎫' },
    { label: 'Cafe', value: booking.cafes?.name || 'Cafe', icon: '☕' },
    { label: 'Date', value: formatDateUTC(booking.booking_date), icon: '📅' },
    { label: 'Time', value: `${formatTimeUTC(booking.start_time)} – ${formatTimeUTC(booking.end_time)}`, icon: '⏰' },
    { label: 'Guests', value: `${booking.total_persons || 1} Guests`, icon: '👥' },
    { label: 'Cafe Charges', value: `₹${cafeAmount.toFixed(2)}` },
  ];
  if (foodAmount > 0) customerSummaryItems.push({ label: 'Food Amount', value: `₹${foodAmount.toFixed(2)}` });
  if (decorationAmount > 0) customerSummaryItems.push({ label: 'Decoration Amount', value: `₹${decorationAmount.toFixed(2)}` });
  if (extraPersonAmount > 0) customerSummaryItems.push({ label: 'Extra Persons', value: `₹${extraPersonAmount.toFixed(2)}` });
  if (hasEventService) {
    customerSummaryItems.push({ label: 'Event Service Package', value: booking.event_services?.service_name || booking.event_services?.title || 'Event Package', icon: '✨' });
    customerSummaryItems.push({ label: 'Event Service Charges', value: `₹${eventServiceAmount.toFixed(2)}` });
  }
  if (discount > 0) customerSummaryItems.push({ label: 'Discount', value: `-₹${discount.toFixed(2)}` });
  customerSummaryItems.push({ label: 'Subtotal', value: `₹${subtotal.toFixed(2)}` });
  customerSummaryItems.push({ label: 'Platform Fee (3%)', value: `₹${faharaCharge.toFixed(2)}` });
  customerSummaryItems.push({ label: 'Transaction Fee (3%)', value: `₹${transactionFee.toFixed(2)}` });
  customerSummaryItems.push({ label: 'GST (18% on Txn Fee)', value: `₹${gst.toFixed(2)}` });
  customerSummaryItems.push({ label: 'Grand Total', value: `₹${total.toFixed(2)}`, isHighlight: true });

  // ── Cafe Owner summary: their portion only ──
  const cafeSummaryItems = [
    { label: 'Booking No', value: booking.booking_number, icon: '🎫' },
    { label: 'Cafe', value: booking.cafes?.name || 'Cafe', icon: '☕' },
    { label: 'Date', value: formatDateUTC(booking.booking_date), icon: '📅' },
    { label: 'Time', value: `${formatTimeUTC(booking.start_time)} – ${formatTimeUTC(booking.end_time)}`, icon: '⏰' },
    { label: 'Guests', value: `${booking.total_persons || 1} Guests`, icon: '👥' },
    { label: 'Cafe Charges', value: `₹${cafeAmount.toFixed(2)}` },
  ];
  if (foodAmount > 0) cafeSummaryItems.push({ label: 'Food Amount', value: `₹${foodAmount.toFixed(2)}` });
  if (decorationAmount > 0) cafeSummaryItems.push({ label: 'Decoration Amount', value: `₹${decorationAmount.toFixed(2)}` });
  if (extraPersonAmount > 0) cafeSummaryItems.push({ label: 'Extra Persons', value: `₹${extraPersonAmount.toFixed(2)}` });
  if (discount > 0) cafeSummaryItems.push({ label: 'Discount', value: `-₹${discount.toFixed(2)}` });
  cafeSummaryItems.push({ label: 'Amount Payable to You', value: `₹${cafeOwnerAmount.toFixed(2)}`, isHighlight: true });
  if (hasEventService) {
    cafeSummaryItems.push({ label: 'Event Service (Paid Separately)', value: `₹${eventServiceAmount.toFixed(2)}` });
  }

  // ── Event Manager summary: their portion only ──
  const eventSummaryItems = [
    { label: 'Booking No', value: booking.booking_number, icon: '🎫' },
    { label: 'Cafe', value: booking.cafes?.name || 'Cafe', icon: '☕' },
    { label: 'Date', value: formatDateUTC(booking.booking_date), icon: '📅' },
    { label: 'Time', value: `${formatTimeUTC(booking.start_time)} – ${formatTimeUTC(booking.end_time)}`, icon: '⏰' },
    { label: 'Guests', value: `${booking.total_persons || 1} Guests`, icon: '👥' },
    { label: 'Event Service Package', value: booking.event_services?.service_name || booking.event_services?.title || 'Event Package', icon: '✨' },
    { label: 'Amount Payable to You', value: `₹${eventServiceAmount.toFixed(2)}`, isHighlight: true },
    { label: 'Cafe Charges (Paid Separately)', value: `₹${cafeOwnerAmount.toFixed(2)}` },
  ];

  const customerName = booking.users?.name || 'Customer';
  const bookingDbId = booking.id;

  // Notify Customer
  await notifyUser(
    booking.customer_id,
    'Booking Requested',
    `Your booking ${booking.booking_number} has been created and is pending payment. Total: ₹${total.toFixed(2)}`,
    'BOOKING_CREATED',
    booking.id,
    templates.getBookingRequestCustomerTemplate(customerName, booking.booking_number, customerSummaryItems, bookingDbId)
  );

  // Notify Cafe Owner
  await notifyUser(
    booking.cafes.owner_id,
    'New Booking Request',
    `You have a new booking request (${booking.booking_number}) for your cafe ${booking.cafes?.name}. Your portion: ₹${cafeOwnerAmount.toFixed(2)}`,
    'BOOKING_CREATED',
    booking.id,
    templates.getBookingRequestOwnerTemplate('Cafe Owner', booking.booking_number, customerName, cafeSummaryItems, bookingDbId)
  );

  console.log(`[notifyBookingCreated] Checking event service for booking ${booking.booking_number}... event_services=${!!booking.event_services}, user_id=${booking.event_services?.user_id}`);
  // If event service is included, notify Event Manager
  if (hasEventService) {
    console.log(`[notifyBookingCreated] Notifying Event Manager ${booking.event_services.user_id}`);
    await notifyUser(
      booking.event_services.user_id,
      'New Event Service Booking',
      `Your event service was booked under booking ${booking.booking_number}. Your portion: ₹${eventServiceAmount.toFixed(2)}`,
      'BOOKING_CREATED',
      booking.id,
      templates.getBookingRequestOwnerTemplate('Event Manager', booking.booking_number, customerName, eventSummaryItems, bookingDbId)
    );
  }
};

const notifyBookingStatusUpdated = async (booking, status, cancelledByRole = 'System') => {
  const hasEventService = !!(booking.event_services?.user_id);
  const cafeAmount = Number(booking.cafe_amount || 0);
  const eventServiceAmount = Number(booking.event_service_amount || 0);
  const foodAmount = Number(booking.food_amount || 0);
  const decorationAmount = Number(booking.decoration_amount || 0);
  const extraPersonAmount = Number(booking.extra_person_amount || 0);
  const discount = Number(booking.discount || 0);
  const subtotal = Number(booking.subtotal || (cafeAmount + eventServiceAmount + foodAmount + decorationAmount + extraPersonAmount - discount));
  const faharaCharge = Number(booking.fahara_service_charge || (subtotal * 0.03));
  const transactionFee = Number(booking.transaction_fee || (subtotal * 0.03));
  const gst = Number(booking.gst || (transactionFee * 0.18));
  const total = Number(booking.total || (subtotal + faharaCharge + transactionFee + gst));
  const cafeOwnerAmount = cafeAmount + foodAmount + decorationAmount + extraPersonAmount - discount;

  const baseSummaryItems = [
    { label: 'Booking No', value: booking.booking_number, icon: '🎫' },
    { label: 'Cafe', value: booking.cafes?.name || 'Cafe', icon: '☕' },
    { label: 'Date', value: formatDateUTC(booking.booking_date), icon: '📅' },
    { label: 'Time', value: `${formatTimeUTC(booking.start_time)} – ${formatTimeUTC(booking.end_time)}`, icon: '⏰' },
    { label: 'Guests', value: `${booking.total_persons || 1} Guests`, icon: '👥' },
  ];

  // ── Customer: full breakdown ──
  const summaryItemsCustomer = [...baseSummaryItems,
    { label: 'Cafe Charges', value: `₹${cafeAmount.toFixed(2)}` },
    ...(foodAmount > 0 ? [{ label: 'Food Amount', value: `₹${foodAmount.toFixed(2)}` }] : []),
    ...(decorationAmount > 0 ? [{ label: 'Decoration Amount', value: `₹${decorationAmount.toFixed(2)}` }] : []),
    ...(extraPersonAmount > 0 ? [{ label: 'Extra Persons', value: `₹${extraPersonAmount.toFixed(2)}` }] : []),
    ...(hasEventService ? [
      { label: 'Event Service Package', value: booking.event_services?.service_name || booking.event_services?.title || 'Event Package', icon: '✨' },
      { label: 'Event Service Charges', value: `₹${eventServiceAmount.toFixed(2)}` },
    ] : []),
    ...(discount > 0 ? [{ label: 'Discount', value: `-₹${discount.toFixed(2)}` }] : []),
    { label: 'Subtotal', value: `₹${subtotal.toFixed(2)}` },
    { label: 'Platform Fee (3%)', value: `₹${faharaCharge.toFixed(2)}` },
    { label: 'Transaction Fee (3%)', value: `₹${transactionFee.toFixed(2)}` },
    { label: 'GST (18% on Txn Fee)', value: `₹${gst.toFixed(2)}` },
    { label: 'Grand Total', value: `₹${total.toFixed(2)}`, isHighlight: true },
  ];

  // ── Cafe Owner: their portion ──
  const summaryItemsCafe = [...baseSummaryItems,
    { label: 'Cafe Charges', value: `₹${cafeAmount.toFixed(2)}` },
    ...(foodAmount > 0 ? [{ label: 'Food Amount', value: `₹${foodAmount.toFixed(2)}` }] : []),
    ...(decorationAmount > 0 ? [{ label: 'Decoration Amount', value: `₹${decorationAmount.toFixed(2)}` }] : []),
    ...(extraPersonAmount > 0 ? [{ label: 'Extra Persons', value: `₹${extraPersonAmount.toFixed(2)}` }] : []),
    ...(discount > 0 ? [{ label: 'Discount', value: `-₹${discount.toFixed(2)}` }] : []),
    { label: 'Amount Payable to You', value: `₹${cafeOwnerAmount.toFixed(2)}`, isHighlight: true },
    ...(hasEventService ? [{ label: 'Event Service (Paid Separately)', value: `₹${eventServiceAmount.toFixed(2)}` }] : []),
  ];

  // ── Event Manager: their portion ──
  const summaryItemsEvent = [...baseSummaryItems,
    { label: 'Event Service Package', value: booking.event_services?.service_name || booking.event_services?.title || 'Event Package', icon: '✨' },
    { label: 'Amount Payable to You', value: `₹${eventServiceAmount.toFixed(2)}`, isHighlight: true },
    { label: 'Cafe Charges (Paid Separately)', value: `₹${cafeOwnerAmount.toFixed(2)}` },
  ];

  let title = '';
  let message = '';
  let customHtml = null;
  const userName = booking.users?.name || 'Customer';
  const bookingDbId = booking.id;

  switch(status) {
    case 'PAID':
      title = 'Payment Successful!';
      message = `We have successfully received your payment for booking ${booking.booking_number}. Your booking is currently pending confirmation from the cafe owner.`;
      customHtml = templates.getPaymentSuccessfulCustomerTemplate(userName, booking.booking_number, summaryItemsCustomer, bookingDbId);
      break;
    case 'CONFIRMED':
      title = 'Booking Confirmed';
      message = `Great news! Your booking ${booking.booking_number} at ${booking.cafes?.name || 'the cafe'} has been officially confirmed by the host.`;
      customHtml = templates.getBookingConfirmedCustomerTemplate(userName, booking.booking_number, summaryItemsCustomer, bookingDbId);
      break;
    case 'CANCELLED':
      title = 'Booking Cancelled';
      message = `This email is to confirm that your booking ${booking.booking_number} at ${booking.cafes?.name || 'the cafe'} has been cancelled by ${cancelledByRole}.`;
      customHtml = templates.getBookingCancelledCustomerTemplate(userName, booking.booking_number, `Cancelled by ${cancelledByRole}.`, summaryItemsCustomer, bookingDbId);
      break;
    case 'COMPLETED':
      title = 'Booking Completed';
      message = `Hope you had a great time! Your booking ${booking.booking_number} is now marked as completed. We hope to see you again soon!`;
      customHtml = templates.getBookingConfirmedCustomerTemplate(userName, booking.booking_number, summaryItemsCustomer, bookingDbId);
      break;
    default:
      title = 'Booking Updated';
      message = `Your booking ${booking.booking_number} has been updated to ${status}.`;
      customHtml = templates.getBookingRequestCustomerTemplate(userName, booking.booking_number, summaryItemsCustomer, bookingDbId);
  }

  // Notify Customer
  await notifyUser(
    booking.customer_id,
    title,
    message,
    `BOOKING_UPDATED_${status}`,
    booking.id,
    customHtml
  );

  // Notify Cafe Owner if customer paid
  if (status === 'PAID') {
    const paidMsg = hasEventService
      ? `Payment for booking ${booking.booking_number} was successful. Your cafe portion: ₹${cafeOwnerAmount.toFixed(2)} | Event service portion: ₹${eventServiceAmount.toFixed(2)}.`
      : `Payment for booking ${booking.booking_number} was successful. Amount: ₹${cafeOwnerAmount.toFixed(2)}. Please confirm the booking.`;
    await notifyUser(
      booking.cafes.owner_id,
      'Payment Received',
      paidMsg,
      'PAYMENT_RECEIVED',
      booking.id,
      templates.getPaymentSuccessfulOwnerTemplate('Cafe Owner', booking.booking_number, `₹${cafeOwnerAmount.toFixed(2)}`, summaryItemsCafe, bookingDbId)
    );
    if (hasEventService) {
      await notifyUser(
        booking.event_services.user_id,
        'Payment Received',
        `Payment for booking ${booking.booking_number} was successful. Your event service portion: ₹${eventServiceAmount.toFixed(2)} | Cafe portion: ₹${cafeOwnerAmount.toFixed(2)}.`,
        'PAYMENT_RECEIVED',
        booking.id,
        templates.getPaymentSuccessfulOwnerTemplate('Event Manager', booking.booking_number, `₹${eventServiceAmount.toFixed(2)}`, summaryItemsEvent, bookingDbId)
      );
    }
  } else if (status === 'CANCELLED') {
    await notifyUser(
      booking.cafes.owner_id,
      'Booking Cancelled',
      `Booking ${booking.booking_number} has been cancelled by ${cancelledByRole}.`,
      'BOOKING_CANCELLED',
      booking.id,
      templates.getBookingCancelledOwnerTemplate('Cafe Owner', booking.booking_number, cancelledByRole, 'As requested or per policy.', summaryItemsCafe, bookingDbId)
    );
    if (booking.event_services?.user_id) {
      await notifyUser(
        booking.event_services.user_id,
        'Booking Cancelled',
        `Booking ${booking.booking_number} has been cancelled by ${cancelledByRole}.`,
        'BOOKING_CANCELLED',
        booking.id,
        templates.getBookingCancelledOwnerTemplate('Event Manager', booking.booking_number, cancelledByRole, 'As requested or per policy.', summaryItemsEvent, bookingDbId)
      );
    }
    // Explicit Admin Cancellation Notification & Email
    try {
      const adminEmail = emailService.getAdminEmail ? emailService.getAdminEmail() : (process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com');
      const adminSubject = `[Admin Alert] Booking #${booking.booking_number} Cancelled by ${cancelledByRole}`;
      const adminMessage = `Booking ${booking.booking_number} at ${booking.cafes?.name || 'the cafe'} has been cancelled by ${cancelledByRole}.\nCustomer: ${userName} (${booking.users?.email || 'N/A'})`;
      const adminHtml = templates.getBookingCancelledCustomerTemplate('Admin', booking.booking_number, `Cancelled by ${cancelledByRole}`, summaryItemsCustomer, bookingDbId);
      await emailService.sendEmail(adminEmail, adminSubject, adminMessage, adminHtml, true);
    } catch (adminErr) {
      console.error('Failed to send admin cancellation email:', adminErr.message);
    }
  } else if (status === 'CONFIRMED') {
     await notifyUser(
      booking.cafes.owner_id,
      'Booking Confirmed',
      `You have confirmed booking ${booking.booking_number}.`,
      'BOOKING_CONFIRMED',
      booking.id,
      templates.getBookingConfirmedAdminTemplate('Cafe Owner', booking.booking_number, summaryItemsCafe, bookingDbId)
    );
    if (booking.event_services?.user_id) {
      await notifyUser(
        booking.event_services.user_id,
        'Booking Confirmed',
        `Booking ${booking.booking_number} has been confirmed.`,
        'BOOKING_CONFIRMED',
        booking.id,
        templates.getBookingConfirmedAdminTemplate('Event Manager', booking.booking_number, summaryItemsEvent, bookingDbId)
      );
    }
  }
};

const getNotifications = async (userId, filters) => {
  const notifications = await notificationRepository.getNotifications(userId, filters);
  // Map to match the UI expectation
  return {
    data: notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.notification_type || 'INFO',
      notification_type: n.notification_type || 'INFO',
      channel: n.channel || 'IN_APP',
      status: n.status,
      is_read: n.read_at !== null,
      created_at: n.created_at,
      sent_at: n.sent_at || n.created_at,
      link: n.booking_id ? `/owner/bookings/${n.booking_id}` : null
    }))
  };
};

const getNotificationById = async (userId, id) => {
  const n = await notificationRepository.getNotificationById(userId, id);
  if (!n) return { data: null };
  return {
    data: {
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.notification_type || 'INFO',
      status: n.status,
      is_read: n.read_at !== null,
      created_at: n.created_at,
      link: n.booking_id ? `/owner/bookings/${n.booking_id}` : null
    }
  };
};

const markAsRead = async (userId, id) => {
  await notificationRepository.markAsRead(userId, id);
  return { success: true };
};

const markAllAsRead = async (userId) => {
  await notificationRepository.markAllAsRead(userId);
  return { success: true };
};

const deleteNotification = async (userId, id) => {
  await notificationRepository.deleteNotification(userId, id);
  return { success: true };
};

const getAdminNotifications = async (filters) => {
  const notifications = await notificationRepository.getAdminNotifications(filters);
  return {
    data: notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.notification_type || 'INFO',
      status: n.status,
      is_read: n.read_at !== null,
      created_at: n.created_at,
      link: n.booking_id ? `/admin/bookings/${n.booking_id}` : null,
      user: n.users ? {
        name: n.users.name,
        email: n.users.email
      } : null
    }))
  };
};

const markAdminNotificationsAsRead = async () => {
  await notificationRepository.markAdminNotificationsAsRead();
  return { success: true };
};

const sendMessage = async (ownerId, data) => {
  const { recipients, subject, message } = data;
  
  if (!recipients || recipients.length === 0) {
    throw new Error('No recipients specified');
  }

  // 1. Save broadcast record for the sender / cafe owner so it appears under their Sent Email Broadcasts tab
  await notificationRepository.saveNotification({
    user_id: ownerId,
    title: subject,
    message: message,
    notification_type: 'CUSTOM_MESSAGE',
    channel: 'EMAIL',
    status: 'SENT',
    sent_at: new Date(),
  });

  // 2. Resolve target recipient users
  let users = [];
  if (recipients.includes('all-diners') || recipients.includes('all')) {
    const prisma = require('../config/prisma');
    users = await prisma.users.findMany({});
  } else {
    const validUuids = recipients.filter(r => typeof r === 'string' && r.length === 36 && r.includes('-'));
    const emails = recipients.filter(r => typeof r === 'string' && r.includes('@'));
    
    const prisma = require('../config/prisma');
    users = await prisma.users.findMany({
      where: {
        OR: [
          validUuids.length > 0 ? { id: { in: validUuids } } : undefined,
          emails.length > 0 ? { email: { in: emails } } : undefined,
        ].filter(Boolean)
      }
    });
  }

  // 3. Send email to each recipient
  for (const user of users) {
    try {
      await emailService.sendEmail(
        user.email,
        subject,
        message,
        `<p>Hi ${user.name || 'Valued Diner'},</p><p>${message}</p>`
      );
      
      if (user.id !== ownerId) {
        await notificationRepository.saveNotification({
          user_id: user.id,
          title: subject,
          message: message,
          notification_type: 'CUSTOM_MESSAGE',
          channel: 'EMAIL',
          status: 'SENT',
          sent_at: new Date(),
        });
      }
    } catch (err) {
      console.error(`Failed to send email broadcast to ${user.email}:`, err.message);
    }
  }

  return { success: true, message: 'Message sent successfully to all recipients.' };
};

const broadcastAdminMessage = async (adminId, data) => {
  const { targetAudience, channels, subject, message, specificUserId } = data;
  
  if (!targetAudience) {
    throw new Error('Target audience is required');
  }

  let usersToNotify = [];
  
  if (targetAudience === 'SPECIFIC_USER' && specificUserId) {
    const user = await userRepository.findUserById(specificUserId);
    if (user) usersToNotify.push(user);
  } else if (targetAudience === 'ALL_CUSTOMERS') {
    usersToNotify = await userRepository.findAllUsers({ role: 'CUSTOMER' });
  } else if (targetAudience === 'CAFE_OWNERS') {
    usersToNotify = await userRepository.findAllUsers({ role: 'CAFE_OWNER' });
  } else if (targetAudience === 'EVENT_MANAGERS') {
    usersToNotify = await userRepository.findAllUsers({ role: 'EVENT_MANAGER' });
  }

  if (usersToNotify.length === 0) {
    return { success: true, message: 'No users found for the selected audience.' };
  }

  // Ensure channels array is provided, otherwise default to In-App and Email
  const selectedChannels = channels || ['IN_APP', 'EMAIL'];

  for (const user of usersToNotify) {
    if (selectedChannels.includes('IN_APP')) {
      await notificationRepository.saveNotification({
        user_id: user.id,
        title: subject,
        message: message,
        notification_type: 'BROADCAST',
        channel: 'IN_APP',
        status: 'SENT',
        sent_at: new Date(),
      });
    }

    if (selectedChannels.includes('EMAIL')) {
      try {
        await emailService.sendEmail(
          user.email,
          subject,
          message,
          `<p>Hi ${user.name || 'User'},</p><p>${message}</p>`
        );
      } catch (err) {
        console.error(`Broadcast email failed for ${user.email}:`, err.message);
      }
    }

    if (selectedChannels.includes('PUSH')) {
      try {
        const tokens = await userDeviceRepository.getActiveTokens(user.id);
        if (tokens && tokens.length > 0) {
          await firebaseConfig.sendPushNotification(tokens, subject, message, {
            type: 'BROADCAST'
          });
        }
      } catch (err) {
        console.error(`Broadcast push failed for ${user.id}:`, err.message);
      }
    }
  }

  return { 
    success: true, 
    message: `Broadcast message sent to ${usersToNotify.length} users.`,
    stats: {
      totalUsers: usersToNotify.length,
      audience: targetAudience
    }
  };
};

const notifyRefundCompleted = async (booking, refundAmount, refundReferenceId) => {
  if (!booking) return;

  const customerName = booking.users?.name || 'Customer';
  const bookingNumber = booking.booking_number || booking.id;
  const dbId = booking.id;

  // 1. Notify Customer
  if (booking.customer_id) {
    await notifyUser(
      booking.customer_id,
      'Refund Processed & Completed',
      `Your refund of ₹${Number(refundAmount).toFixed(2)} for booking ${bookingNumber} has been successfully processed. Ref ID: ${refundReferenceId}`,
      'REFUND_COMPLETED',
      dbId,
      templates.getRefundCompletedTemplate(customerName, refundAmount, bookingNumber, refundReferenceId)
    );
  }

  // 2. Notify Cafe Owner
  if (booking.cafes?.owner_id) {
    await notifyUser(
      booking.cafes.owner_id,
      'Refund Processed for Booking',
      `A refund of ₹${Number(refundAmount).toFixed(2)} for booking ${bookingNumber} at ${booking.cafes?.name || 'your cafe'} has been processed. Ref ID: ${refundReferenceId}`,
      'REFUND_COMPLETED',
      dbId,
      templates.getRefundCompletedTemplate('Cafe Owner', refundAmount, bookingNumber, refundReferenceId)
    );
  }

  // 3. Notify Event Manager (if event service was booked)
  if (booking.event_services?.user_id) {
    await notifyUser(
      booking.event_services.user_id,
      'Refund Processed for Booking',
      `A refund of ₹${Number(refundAmount).toFixed(2)} for booking ${bookingNumber} has been processed. Ref ID: ${refundReferenceId}`,
      'REFUND_COMPLETED',
      dbId,
      templates.getRefundCompletedTemplate('Event Manager', refundAmount, bookingNumber, refundReferenceId)
    );
  }

  // 4. Send Email Notification to Admin
  try {
    const adminEmail = emailService.getAdminEmail ? emailService.getAdminEmail() : (process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com');
    const adminSubject = `[Admin Alert] Refund Processed - Booking #${bookingNumber}`;
    const adminText = `A refund of ₹${Number(refundAmount).toFixed(2)} for booking ${bookingNumber} has been processed.\nCustomer: ${customerName} (${booking.users?.email || 'N/A'})\nRef ID: ${refundReferenceId}`;
    const adminHtml = templates.getRefundCompletedTemplate('Admin', refundAmount, bookingNumber, refundReferenceId);
    await emailService.sendEmail(adminEmail, adminSubject, adminText, adminHtml, true);
  } catch (adminErr) {
    console.error('Failed to send admin refund email:', adminErr.message);
  }
};

module.exports = {
  notifyUser,
  notifyBookingCreated,
  notifyBookingStatusUpdated,
  notifyRefundCompleted,
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendMessage,
  getAdminNotifications,
  markAdminNotificationsAsRead,
  broadcastAdminMessage
};
