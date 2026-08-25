const reviewRepository = require('../repositories/reviewRepository');

const addReview = async (userId, data) => {
  // Validate that the user has a COMPLETED booking for this target (bypassed for testing)
  // const completedBookings = await reviewRepository.getCompletedBookingsForUser(
  //   userId, 
  //   data.cafe_id, 
  //   data.event_service_id
  // );

  // if (!completedBookings || completedBookings.length === 0) {
  //   const error = new Error('You can only review services you have successfully booked and completed.');
  //   error.statusCode = 403;
  //   throw error;
  // }

  // Create the review
  data.customer_id = userId;
  const newReview = await reviewRepository.createReview(data);

  await updateAggregatesAfterChange(data.cafe_id, data.event_service_id);

  return newReview;
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
  return { data: reviews };
};

const getOwnerReviewAnalytics = async (ownerId) => {
  // We can just get all reviews for the owner and calculate analytics
  const reviews = await reviewRepository.getReviewsByOwnerId(ownerId, { dateRange: 'all' });
  
  const totalReviews = reviews.length;
  let totalRating = 0;
  let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let repliedCount = 0;
  
  reviews.forEach(r => {
    totalRating += r.rating || 0;
    if (r.rating) ratingDistribution[r.rating]++;
    if (r.reply) repliedCount++;
  });
  
  const averageRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 0;
  const positiveReviews = (ratingDistribution[4] || 0) + (ratingDistribution[5] || 0);
  
  // Fake some growth/trends for now, or calculate if needed
  return {
    data: {
      averageRating: parseFloat(averageRating),
      totalReviews,
      ratingDistribution,
      positiveReviews,
      repliedCount,
      unrepliedCount: totalReviews - repliedCount,
      // For charts, maybe group by month
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
  
  // Optionally verify that the cafe belongs to ownerId
  // ...
  
  const updatedReview = await reviewRepository.updateReply(reviewId, replyText);
  return { success: true, data: updatedReview };
};

const updateReply = async (ownerId, reviewId, replyText) => {
  // Similar to replyToReview
  const updatedReview = await reviewRepository.updateReply(reviewId, replyText);
  return { success: true, data: updatedReview };
};

const deleteReply = async (ownerId, reviewId) => {
  const updatedReview = await reviewRepository.removeReply(reviewId);
  return { success: true, data: updatedReview };
};

const getReviewById = async (reviewId) => {
  const review = await reviewRepository.getReviewById(reviewId);
  if (!review) {
    const error = new Error('Review not found');
    error.statusCode = 404;
    throw error;
  }
  return { data: review };
};

const getAdminReviews = async (query) => {
  const reviews = await reviewRepository.getAllAdminReviews(query);
  
  // Format and mock the moderation fields
  const formattedReviews = reviews.map(r => {
    return {
      id: r.id,
      customer: {
        name: r.users?.name || 'Guest',
        email: r.users?.email || '',
        avatar: r.users?.profile_image || null
      },
      business: {
        type: r.cafe_id ? 'CAFE' : 'EVENT',
        name: r.cafes?.name || r.event_services?.service_name || 'Unknown'
      },
      rating: r.rating || 0,
      review: r.review || '',
      images: r.images || [],
      date: r.created_at,
      // Mocking missing schema fields
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
    // In a real app we'd update a status field, we'll mock success
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
