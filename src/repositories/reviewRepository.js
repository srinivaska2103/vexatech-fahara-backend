const prisma = require('../config/prisma');
const createReview = async (data) => {
  return await prisma.reviews.create({
    data,
    include: {
      users: { select: { name: true, profile_image: true } }
    }
  });
};

const getReviewsByCafeId = async (cafeId) => {
  return await prisma.reviews.findMany({
    where: { cafe_id: cafeId },
    include: {
      users: { select: { name: true, profile_image: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

const getReviewsByEventServiceId = async (eventServiceId) => {
  return await prisma.reviews.findMany({
    where: { event_service_id: eventServiceId },
    include: {
      users: { select: { name: true, profile_image: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

const getReviewById = async (id) => {
  const review = await prisma.reviews.findUnique({
    where: { id },
    include: {
      users: { select: { name: true, profile_image: true, email: true, phone: true, city: true, created_at: true, _count: { select: { bookings: true, reviews: true } } } },
      cafes: { select: { name: true, address: true } },
      event_services: { select: { service_name: true } },
      bookings: { select: { booking_number: true, total: true } }
    }
  });

  if (review && review.event_services) {
    review.event_services.name = review.event_services.service_name;
  }
  
  return review;
};

const deleteReview = async (id) => {
  return await prisma.reviews.delete({
    where: { id }
  });
};

const getCompletedBookingsForUser = async (userId, cafeId = null, eventServiceId = null) => {
  const whereClause = {
    customer_id: userId,
    booking_status: 'COMPLETED'
  };

  if (cafeId) whereClause.cafe_id = cafeId;
  if (eventServiceId) whereClause.event_service_id = eventServiceId;

  return await prisma.bookings.findMany({
    where: whereClause
  });
};

const updateCafeReviewAggregates = async (cafeId, totalReviews, averageRating) => {
  return await prisma.cafes.update({
    where: { id: cafeId },
    data: {
      total_reviews: totalReviews,
      average_rating: averageRating
    }
  });
};

const updateEventServiceReviewAggregates = async (eventServiceId, totalReviews, averageRating) => {
  return await prisma.event_services.update({
    where: { id: eventServiceId },
    data: {
      total_reviews: totalReviews,
      average_rating: averageRating
    }
  });
};

const getReviewsByOwnerId = async (ownerId, filters = {}) => {
  const whereClause = {
    OR: [
      { cafes: { owner_id: ownerId } },
      { event_services: { user_id: ownerId } }
    ]
  };
  
  if (filters.search) {
    whereClause.AND = [
      {
        OR: [
          { review: { contains: filters.search, mode: 'insensitive' } },
          { users: { name: { contains: filters.search, mode: 'insensitive' } } },
          { cafes: { name: { contains: filters.search, mode: 'insensitive' } } },
          { event_services: { service_name: { contains: filters.search, mode: 'insensitive' } } }
        ]
      }
    ];
  }
  
  if (filters.rating && filters.rating !== 'all') {
    const parsedRating = parseInt(filters.rating);
    if (!isNaN(parsedRating)) {
      whereClause.rating = parsedRating;
    }
  }
  
  if (filters.replyStatus && filters.replyStatus !== 'all') {
    if (filters.replyStatus === 'replied') {
      whereClause.reply = { not: null };
    } else if (filters.replyStatus === 'unreplied') {
      whereClause.reply = null;
    }
  }

  if (filters.dateRange && filters.dateRange !== 'all') {
    const now = new Date();
    let startDate = new Date();
    
    switch (filters.dateRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
      case 'last30':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'last90':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
      case 'thisYear':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    whereClause.created_at = { gte: startDate };
  }

  return await prisma.reviews.findMany({
    where: whereClause,
    include: {
      users: { select: { name: true, profile_image: true } },
      cafes: { select: { name: true } },
      event_services: { select: { service_name: true, category: true } },
      bookings: { select: { id: true, booking_number: true, booking_date: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

const updateReply = async (reviewId, replyText) => {
  return await prisma.reviews.update({
    where: { id: reviewId },
    data: {
      reply: replyText,
      reply_at: new Date()
    },
    include: {
      users: { select: { name: true, profile_image: true } },
      cafes: { select: { name: true } }
    }
  });
};

const removeReply = async (reviewId) => {
  return await prisma.reviews.update({
    where: { id: reviewId },
    data: {
      reply: null,
      reply_at: null
    },
    include: {
      users: { select: { name: true, profile_image: true } },
      cafes: { select: { name: true } }
    }
  });
};

const getAllAdminReviews = async (query = {}) => {
  return await prisma.reviews.findMany({
    include: {
      users: { select: { name: true, profile_image: true, email: true } },
      cafes: { select: { name: true } },
      event_services: { select: { service_name: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

module.exports = {
  createReview,
  getReviewsByCafeId,
  getReviewsByEventServiceId,
  getReviewById,
  deleteReview,
  getCompletedBookingsForUser,
  updateCafeReviewAggregates,
  updateEventServiceReviewAggregates,
  getReviewsByOwnerId,
  updateReply,
  removeReply,
  getAllAdminReviews
};
