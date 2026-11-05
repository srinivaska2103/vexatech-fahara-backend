const fs = require('fs');
let code = fs.readFileSync('vexatech-fahara-backend/src/services/notificationService.js', 'utf8');
code = code.replace(/\r\n/g, '\n');

const oldGetNotifications = `const getNotifications = async (userId, filters) => {
  const notifications = await notificationRepository.getNotifications(userId, filters);
  // Map to match the UI expectation
  return {
    data: notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.notification_type || 'INFO',
      notification_type: n.notification_type || 'INFO',
      booking_id: n.booking_id || null,
      channel: n.channel || 'IN_APP',
      status: n.status,
      is_read: n.read_at !== null,
      created_at: n.created_at,
      sent_at: n.sent_at || n.created_at,
      link: n.booking_id ? \`/customer/bookings\` : null
    }))
  };
};`;

const newGetNotifications = `const getNotifications = async (userId, filters) => {
  const [notifications, stats] = await Promise.all([
    notificationRepository.getNotifications(userId, filters),
    notificationRepository.getNotificationStats(userId)
  ]);

  return {
    success: true,
    stats,
    data: notifications.map(n => {
      let resolvedLink = null;
      if (n.order_id || n.category === 'FOOD_ORDER' || n.notification_type?.includes('ORDER')) {
        resolvedLink = n.order_id ? \`/owner/orders/\${n.order_id}\` : '/owner/orders';
      } else if (n.booking_id || n.category === 'BOOKING' || n.notification_type?.includes('BOOKING')) {
        resolvedLink = n.booking_id ? \`/owner/bookings/\${n.booking_id}\` : '/owner/bookings';
      } else if (n.category === 'REVIEW' || n.notification_type?.includes('REVIEW')) {
        resolvedLink = '/owner/reviews';
      } else if (n.category === 'PAYMENT' || n.notification_type?.includes('PAYMENT')) {
        resolvedLink = '/owner/payments';
      } else if (n.category === 'SUBSCRIPTION' || n.notification_type?.includes('SUBSCRIPTION')) {
        resolvedLink = '/owner/subscription';
      }

      return {
        id: n.id,
        user_id: n.user_id,
        cafe_id: n.cafe_id,
        booking_id: n.booking_id,
        order_id: n.order_id,
        category: n.category || 'BOOKING',
        priority: n.priority || 'MEDIUM',
        title: n.title,
        message: n.message,
        type: n.category || n.notification_type || 'INFO',
        notification_type: n.notification_type || 'INFO',
        channel: n.channel || 'IN_APP',
        status: n.status,
        metadata: n.metadata,
        is_read: n.read_at !== null || n.status === 'READ',
        created_at: n.created_at,
        sent_at: n.sent_at || n.created_at,
        link: resolvedLink,
        bookings: n.bookings || null,
        food_orders: n.food_orders || null
      };
    })
  };
};`;

const oldGetNotificationById = `const getNotificationById = async (userId, id) => {
  const n = await notificationRepository.getNotificationById(userId, id);
  if (!n) return { data: null };
  return {
    data: {
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.notification_type || 'INFO',
      notification_type: n.notification_type || 'INFO',
      booking_id: n.booking_id || null,
      status: n.status,
      is_read: n.read_at !== null,
      created_at: n.created_at,
      link: n.booking_id ? \`/customer/bookings\` : null
    }
  };
};`;

const newGetNotificationById = `const getNotificationById = async (userId, id) => {
  const n = await notificationRepository.getNotificationById(userId, id);
  if (!n) return { success: false, data: null };

  let resolvedLink = null;
  if (n.order_id || n.category === 'FOOD_ORDER' || n.notification_type?.includes('ORDER')) {
    resolvedLink = n.order_id ? \`/owner/orders/\${n.order_id}\` : '/owner/orders';
  } else if (n.booking_id || n.category === 'BOOKING' || n.notification_type?.includes('BOOKING')) {
    resolvedLink = n.booking_id ? \`/owner/bookings/\${n.booking_id}\` : '/owner/bookings';
  } else if (n.category === 'REVIEW' || n.notification_type?.includes('REVIEW')) {
    resolvedLink = '/owner/reviews';
  } else if (n.category === 'PAYMENT' || n.notification_type?.includes('PAYMENT')) {
    resolvedLink = '/owner/payments';
  } else if (n.category === 'SUBSCRIPTION' || n.notification_type?.includes('SUBSCRIPTION')) {
    resolvedLink = '/owner/subscription';
  }

  return {
    success: true,
    data: {
      id: n.id,
      user_id: n.user_id,
      cafe_id: n.cafe_id,
      booking_id: n.booking_id,
      order_id: n.order_id,
      category: n.category || 'BOOKING',
      priority: n.priority || 'MEDIUM',
      title: n.title,
      message: n.message,
      type: n.category || n.notification_type || 'INFO',
      notification_type: n.notification_type || 'INFO',
      channel: n.channel || 'IN_APP',
      status: n.status,
      metadata: n.metadata,
      is_read: n.read_at !== null || n.status === 'READ',
      created_at: n.created_at,
      sent_at: n.sent_at || n.created_at,
      link: resolvedLink,
      bookings: n.bookings || null,
      food_orders: n.food_orders || null
    }
  };
};`;

code = code.replace(oldGetNotifications, newGetNotifications);
code = code.replace(oldGetNotificationById, newGetNotificationById);

// Also add helper createUnifiedNotification
const helperFunction = `
/**
 * Global Unified Notification Dispatcher for any module
 */
const createUnifiedNotification = async ({
  userId,
  cafeId = null,
  orderId = null,
  bookingId = null,
  category = 'FOOD_ORDER',
  priority = 'MEDIUM',
  type,
  title,
  message,
  metadata = null,
  customHtml = null,
  sendEmailToUser = true
}) => {
  try {
    const saved = await notificationRepository.saveNotification({
      user_id: userId,
      cafe_id: cafeId,
      order_id: orderId,
      booking_id: bookingId,
      category,
      priority,
      notification_type: type,
      title,
      message,
      channel: 'IN_APP',
      status: 'SENT',
      metadata,
      sent_at: new Date()
    });

    if (sendEmailToUser) {
      try {
        const user = await userRepository.findUserById(userId);
        if (user && user.email) {
          const emailToSend = user.event_management_profiles?.business_email || user.email;
          await emailService.sendEmail(
            emailToSend,
            title,
            message,
            customHtml || \`<p>\${message}</p>\`
          );
        }
      } catch (eErr) {
        console.error('[createUnifiedNotification] Email failed:', eErr.message);
      }
    }

    return saved;
  } catch (err) {
    console.error('[createUnifiedNotification] Error:', err);
    return null;
  }
};
`;

code = code.replace('module.exports = {', helperFunction + '\nmodule.exports = {\n  createUnifiedNotification,');

fs.writeFileSync('vexatech-fahara-backend/src/services/notificationService.js', code, 'utf8');
console.log('notificationService updated successfully with createUnifiedNotification');

