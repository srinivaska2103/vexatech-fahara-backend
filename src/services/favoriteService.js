const prisma = require('../config/prisma');

const getFavorites = async (userId) => {
  const favs = await prisma.favorites.findMany({
    where: { user_id: userId },
    include: {
      cafes: {
        include: {
          cafe_packages: true,
          cafe_images: true,
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });

  return favs.map(f => f.cafes).filter(Boolean);
};

const getFavoriteIds = async (userId) => {
  const favs = await prisma.favorites.findMany({
    where: { user_id: userId },
    select: { cafe_id: true }
  });

  return favs.map(f => f.cafe_id).filter(Boolean);
};

const toggleFavorite = async (userId, cafeId) => {
  if (!cafeId) {
    const error = new Error('cafeId is required');
    error.statusCode = 400;
    throw error;
  }

  const existing = await prisma.favorites.findFirst({
    where: {
      user_id: userId,
      cafe_id: cafeId,
    }
  });

  if (existing) {
    await prisma.favorites.delete({
      where: { id: existing.id }
    });
    return { isFavorite: false, message: 'Removed from favorites' };
  } else {
    await prisma.favorites.create({
      data: {
        user_id: userId,
        cafe_id: cafeId,
      }
    });
    return { isFavorite: true, message: 'Added to favorites' };
  }
};

module.exports = {
  getFavorites,
  getFavoriteIds,
  toggleFavorite,
};
