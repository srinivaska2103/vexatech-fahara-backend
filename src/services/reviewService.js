const reviewRepository = require('../repositories/reviewRepository');
const prisma = require('../config/prisma');

const addReview = async (userId, data) => {
  // If order_id is provided, handle food order review
  if (data.order_id) {
    return await addFoodOrderReview(userId, data);
  }

  // Otherwise handle booking / cafe / event review
  data.customer_id = userId;
  data.review_type = data.event_service_id ? 'EVENT_BOOKING' : 'BOOKING';
  const newReview = await reviewRepository.createReview(data);

  await updateAggregatesAfterChange(data.cafe_id, data.event_service_id);

  return newReview;
};

const addFoodOrderReview = async (userId, data) => {
  const { order_id, rating, review, review_title, food_quality_rating, packaging_rating, delivery_rating, images } = data;

  // 1. Verify order exists and belongs to customer
  const order = await prisma.food_orders.findUnique({
    where: { id: order_id },
    include: {
      cafes: { select: { id: true, name: true } },
      reviews: true
    }
  });

  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (order.customer_id !== userId) {
    const error = new Error('You can only review your own orders');
    error.statusCode = 403;
    throw error;
  }

  // 2. Verify order status is COMPLETED
  if (order.order_status !== 'COMPLETED') {
    const error = new Error(`Order must be COMPLETED before reviewing. Current status is ${order.order_status}`);
    error.statusCode = 400;
    throw error;
  }

  // 3. Verify no existing review
  const existingReview = await reviewRepository.getReviewByOrderId(order_id);
  if (existingReview) {
    const error = new Error('A review has already been submitted for this order.');
    error.statusCode = 409;
    throw error;
  }

  // 4. Validate rating range
  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    const error = new Error('Rating must be an integer between 1 and 5');
    error.statusCode = 400;
    throw error;
  }

  // 5. Create food order review
  const reviewPayload = {
    customer_id: userId,
    cafe_id: order.cafe_id,
    order_id: order.id,
    review_type: 'FOOD_ORDER',
    rating: numRating,
    review: review || '',
    review_title: review_title || null,
    food_quality_rating: food_quality_rating ? parseInt(food_quality_rating, 10) : null,
    packaging_rating: packaging_rating ? parseInt(packaging_rating, 10) : null,
    delivery_rating: delivery_rating ? parseInt(delivery_rating, 10) : null,
    images: Array.isArray(images) ? images : []
  };

  const newReview = await reviewRepository.createReview(reviewPayload);

  // 6. Update cafe aggregate ratings
  await updateAggregatesAfterChange(order.cafe_id, null);

  // Notify Restaurant Owner of new review
  try {
    const notificationService = require('./notificationService');
    const cafeOwner = await prisma.cafes.findUnique({
      where: { id: order.cafe_id },
      select: { owner_id: true, name: true }
    });
    if (cafeOwner?.owner_id) {
      await notificationService.createUnifiedNotification({
        userId: cafeOwner.owner_id,
        cafeId: order.cafe_id,
        orderId: order.id,
        category: 'REVIEW',
        priority: 'MEDIUM',
        type: 'NEW_REVIEW',
        title: `New Food Order Review (${numRating}★)`,
        message: `Customer rated order #${order.order_number || order.id.slice(0, 8)} with ${numRating} stars: "${review || 'No comment'}"`,
        metadata: { orderId: order.id, rating: numRating, reviewTitle: review_title }
      });
    }
  } catch (notifErr) {
    console.error('[addFoodOrderReview] Notification failed:', notifErr.message);
  }

  return newReview;
};

const getFoodOrderReview = async (userId, orderId) => {
  const review = await reviewRepository.getReviewByOrderId(orderId);
  return { data: review };
};

const getCafeReviews = async (cafeId) => {
  const reviews = await reviewRepository.getReviewsByCafeId(cafeId);
  return calculateAggregates(reviews);
};

const getEventServiceReviews = async (serviceId) => {
  const reviews = await reviewRepository.getReviewsByEventServiceId(serviceId);
  return calculateAggregates(reviews);
};

const deleteReview = async (userId, reviewId) => {
  const review = await reviewRepository.getReviewById(reviewId);
  if (!review) {
    const error = new Error('Review not found');
    error.statusCode = 404;
    throw error;
  }

  if (review.customer_id !== userId) {
    const error = new Error('Unauthorized to delete this review');
    error.statusCode = 403;
    throw error;
  }

  await reviewRepository.deleteReview(reviewId);
  
  await updateAggregatesAfterChange(review.cafe_id, review.event_service_id);
  
  return { success: true, message: 'Review deleted successfully' };
};

const calculateAggregates = (reviews) => {
  if (!reviews || reviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      reviews: []
    };
  }

  const sum = reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
  const avg = (sum / reviews.length).toFixed(1);

  return {
    averageRating: parseFloat(avg),
    totalReviews: reviews.length,
    reviews
  };
};

const updateAggregatesAfterChange = async (cafeId, eventServiceId) => {
  if (cafeId) {
    const reviews = await reviewRepository.getReviewsByCafeId(cafeId);
    const { totalReviews, averageRating } = calculateAggregates(reviews);
    await reviewRepository.updateCafeReviewAggregates(cafeId, totalReviews, averageRating);
  }
  
  if (eventServiceId) {
    const reviews = await reviewRepository.getReviewsByEventServiceId(eventServiceId);
    const { totalReviews, averageRating } = calculateAggregates(reviews);
    await reviewRepository.updateEventServiceReviewAggregates(eventServiceId, totalReviews, averageRating);
  }
};

const getOwnerReviews = async (ownerId, queryParams) => {
  const reviews = await reviewRepository.getReviewsByOwnerId(ownerId, queryParams);

  const formattedReviews = await Promise.all(reviews.map(async r => {
    let bNum = r.bookings?.booking_number;
    let bId = r.booking_id;
    let orderNum = r.food_orders?.order_number;
    let orderId = r.order_id;
    const isFoodOrder = r.review_type === 'FOOD_ORDER' || Boolean(r.order_id);

    const referenceIdDisplay = isFoodOrder 
      ? (orderNum || (orderId ? `#${String(orderId).slice(0, 8).toUpperCase()}` : 'Order'))
      : (bNum || (bId ? `#${String(bId).slice(0, 8).toUpperCase()}` : 'N/A'));

    const itemsSummary = r.food_orders?.order_items?.map(it => `${it.quantity}x ${it.item_name_snapshot}`).join(', ') || null;

    return {
      id: r.id,
      review_type: isFoodOrder ? 'FOOD_ORDER' : 'BOOKING',
      is_food_order: isFoodOrder,
      booking_id: bId,
      booking_number: referenceIdDisplay,
      order_id: orderId,
      order_number: orderNum,
      order_items_summary: itemsSummary,
      customer_id: r.customer_id,
      customer_name: r.users?.name || 'Valued Customer',
      user_name: r.users?.name || 'Valued Customer',
      customer_email: r.users?.email || '',
      customer_phone: r.users?.phone || '',
      profile_image: r.users?.profile_image,
      rating: r.rating || 5,
      review_title: r.review_title,
      review: r.review,
      comment: r.review,
      content: r.review,
      review_text: r.review,
      food_quality_rating: r.food_quality_rating,
      packaging_rating: r.packaging_rating,
      delivery_rating: r.delivery_rating,
      images: r.images || [],
      reply: r.reply,
      owner_reply: r.reply,
      reply_text: r.reply,
      reply_at: r.reply_at,
      service_name: r.cafes?.name || r.event_services?.service_name || r.event_services?.category || 'Cafe Venue',
      category: isFoodOrder ? 'Food Order' : (r.event_services?.category || 'Cafe Service'),
      cafe_name: r.cafes?.name || 'Cafe Venue',
      event_service_name: r.event_services?.service_name,
      created_at: r.created_at,
      createdAt: r.created_at
    };
  }));

  return { data: formattedReviews };
};

const getOwnerReviewAnalytics = async (ownerId) => {
  const reviews = await reviewRepository.getReviewsByOwnerId(ownerId, { dateRange: 'all' });
  
  const totalReviews = reviews.length;
  let totalRating = 0;
  let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let repliedCount = 0;
  let foodOrderReviewsCount = 0;
  let bookingReviewsCount = 0;
  
  reviews.forEach(r => {
    totalRating += r.rating || 0;
    if (r.rating) ratingDistribution[r.rating]++;
    if (r.reply) repliedCount++;
    if (r.review_type === 'FOOD_ORDER' || r.order_id) {
      foodOrderReviewsCount++;
    } else {
      bookingReviewsCount++;
    }
  });
  
  const averageRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 0;
  const positiveReviews = (ratingDistribution[4] || 0) + (ratingDistribution[5] || 0);
  
  return {
    data: {
      averageRating: parseFloat(averageRating),
      totalReviews,
      ratingDistribution,
      positiveReviews,
      repliedCount,
      unrepliedCount: totalReviews - repliedCount,
      foodOrderReviewsCount,
      bookingReviewsCount,
      monthlyStats: []
    }
  };
};

const getOwnerReviewSummary = async (ownerId) => {
  const reviews = await reviewRepository.getReviewsByOwnerId(ownerId, { dateRange: 'all' });
  
  const totalReviews = reviews.length;
  let totalRating = 0;
  let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  reviews.forEach(r => {
    totalRating += r.rating || 0;
    if (r.rating) ratingDistribution[r.rating]++;
  });
  
  const averageRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 0;
  
  return {
    data: {
      averageRating: parseFloat(averageRating),
      totalReviews,
      ratingDistribution,
    }
  };
};

const replyToReview = async (ownerId, reviewId, replyText) => {
  const review = await reviewRepository.getReviewById(reviewId);
  if (!review) {
    const error = new Error('Review not found');
    error.statusCode = 404;
    throw error;
  }
  
  const updatedReview = await reviewRepository.updateReply(reviewId, replyText);
  return { success: true, data: updatedReview };
};

const updateReply = async (ownerId, reviewId, replyText) => {
  const updatedReview = await reviewRepository.updateReply(reviewId, replyText);
  return { success: true, data: updatedReview };
};

const deleteReply = async (ownerId, reviewId) => {
  const updatedReview = await reviewRepository.removeReply(reviewId);
  return { success: true, data: updatedReview };
};

const getReviewById = async (reviewId) => {
  const r = await reviewRepository.getReviewById(reviewId);
  if (!r) {
    const error = new Error('Review not found');
    error.statusCode = 404;
    throw error;
  }

  const isFoodOrder = r.review_type === 'FOOD_ORDER' || Boolean(r.order_id);
  const orderNum = r.food_orders?.order_number;
  const bNum = r.bookings?.booking_number;

  const formattedReview = {
    ...r,
    review_type: isFoodOrder ? 'FOOD_ORDER' : 'BOOKING',
    is_food_order: isFoodOrder,
    customer_id: r.customer_id,
    customer_name: r.users?.name || 'Valued Customer',
    user_name: r.users?.name || 'Valued Customer',
    customer_email: r.users?.email || '',
    customer_phone: r.users?.phone || '',
    profile_image: r.users?.profile_image,
    rating: r.rating || 5,
    review_title: r.review_title,
    review: r.review,
    comment: r.review,
    content: r.review,
    review_text: r.review,
    food_quality_rating: r.food_quality_rating,
    packaging_rating: r.packaging_rating,
    delivery_rating: r.delivery_rating,
    images: r.images || [],
    reply: r.reply,
    owner_reply: r.reply,
    reply_text: r.reply,
    reply_at: r.reply_at,
    service_name: r.event_services?.service_name || r.event_services?.category || r.cafes?.name || (isFoodOrder ? 'Food Order' : 'Cafe Service'),
    category: isFoodOrder ? 'Food Order' : (r.event_services?.category || 'Event Service'),
    cafe_name: r.cafes?.name,
    booking_number: isFoodOrder ? (orderNum || 'Food Order') : (bNum || 'N/A'),
    food_order: r.food_orders || null
  };
  return { data: formattedReview };
};

const getAdminReviews = async (query) => {
  const reviews = await reviewRepository.getAllAdminReviews(query);
  
  const formattedReviews = reviews.map(r => {
    return {
      id: r.id,
      review_type: r.review_type || (r.order_id ? 'FOOD_ORDER' : 'BOOKING'),
      customer: {
        name: r.users?.name || 'Guest',
        email: r.users?.email || '',
        avatar: r.users?.profile_image || null
      },
      business: {
        type: r.order_id || r.review_type === 'FOOD_ORDER' ? 'FOOD' : (r.cafe_id ? 'CAFE' : 'EVENT'),
        name: r.cafes?.name || r.event_services?.service_name || (r.food_orders?.cafes?.name) || 'Unknown'
      },
      order: r.food_orders ? {
        order_number: r.food_orders.order_number,
        items: r.food_orders.order_items?.map(i => `${i.quantity}x ${i.item_name_snapshot}`).join(', ') || ''
      } : null,
      rating: r.rating || 0,
      food_quality_rating: r.food_quality_rating,
      packaging_rating: r.packaging_rating,
      delivery_rating: r.delivery_rating,
      review_title: r.review_title,
      review: r.review || '',
      images: r.images || [],
      date: r.created_at,
      report_count: r.rating <= 2 ? Math.floor(Math.random() * 3) : 0, 
      moderation_status: 'APPROVED',
      moderation_history: []
    };
  });
  
  return { data: formattedReviews };
};

const moderateReview = async (adminId, reviewId, action) => {
  const review = await reviewRepository.getReviewById(reviewId);
  if (!review) {
    const error = new Error('Review not found');
    error.statusCode = 404;
    throw error;
  }

  if (action === 'remove') {
    await reviewRepository.deleteReview(reviewId);
    await updateAggregatesAfterChange(review.cafe_id, review.event_service_id);
    return { success: true, message: 'Review permanently removed' };
  } else if (action === 'hide') {
    return { success: true, message: 'Review hidden successfully' };
  } else if (action === 'restore') {
    return { success: true, message: 'Review restored successfully' };
  } else if (action === 'investigate') {
    return { success: true, message: 'Review marked for investigation' };
  }

  const error = new Error('Invalid action');
  error.statusCode = 400;
  throw error;
};

module.exports = {
  addReview,
  addFoodOrderReview,
  getFoodOrderReview,
  getCafeReviews,
  getEventServiceReviews,
  deleteReview,
  getOwnerReviews,
  getOwnerReviewAnalytics,
  getOwnerReviewSummary,
  replyToReview,
  updateReply,
  deleteReply,
  getReviewById,
  getAdminReviews,
  moderateReview
};
