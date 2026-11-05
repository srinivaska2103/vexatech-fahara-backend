const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-backend/src/services/menuService.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add offerRepository and calculateDiscountForItem require at the top
if (!code.includes("const offerRepository = require('../repositories/offerRepository');")) {
  code = "const offerRepository = require('../repositories/offerRepository');\nconst { calculateDiscountForItem } = require('./offerService');\n" + code;
}

// 2. Update getPublicMenuByCafeId to fetch active offers and calculate authoritative discounts
const oldPublicMenu = `const getPublicMenuByCafeId = async (cafeId) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  const categories = await menuRepository.getPublicMenuByCafe(cafe.id);

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      coverImage: cafe.cover_image,
      city: cafe.city,
      address: cafe.address,
      rating: cafe.average_rating || 0,
      totalReviews: cafe.total_reviews || 0,
      category: cafe.category
    },
    categories: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      imageUrl: cat.image_url,
      displayOrder: cat.display_order,
      items: cat.menu_items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.image_url,
        price: Number(item.price),
        foodType: item.food_type,
        isAvailable: item.is_available,
        preparationTime: item.preparation_time,
        displayOrder: item.display_order,
        isFeatured: item.is_featured
      }))
    }))
  };
};`;

const newPublicMenu = `const getPublicMenuByCafeId = async (cafeId) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  const [categories, activeOffers] = await Promise.all([
    menuRepository.getPublicMenuByCafe(cafe.id),
    offerRepository.getActiveOffersForCafe(cafe.id)
  ]);

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      coverImage: cafe.cover_image,
      city: cafe.city,
      address: cafe.address,
      rating: cafe.average_rating || 0,
      totalReviews: cafe.total_reviews || 0,
      category: cafe.category
    },
    activeOffersCount: activeOffers.length,
    activeOffers: activeOffers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      offerType: o.offer_type,
      discountType: o.discount_type,
      discountValue: Number(o.discount_value),
      maxDiscountAmount: o.max_discount_amount ? Number(o.max_discount_amount) : null,
      endDate: o.end_date
    })),
    categories: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      imageUrl: cat.image_url,
      displayOrder: cat.display_order,
      items: cat.menu_items.map(item => {
        // Do not apply discounts to unavailable items
        const pricing = item.is_available 
          ? calculateDiscountForItem(item, activeOffers)
          : {
              originalPrice: Number(item.price),
              discountAmount: 0,
              discountedPrice: Number(item.price),
              hasDiscount: false,
              appliedOffer: null
            };

        const savingsPercent = pricing.hasDiscount && pricing.originalPrice > 0
          ? Math.round((pricing.discountAmount / pricing.originalPrice) * 100)
          : 0;

        return {
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.image_url,
          price: pricing.discountedPrice, // Authoritative price to show
          originalPrice: pricing.originalPrice,
          discountAmount: pricing.discountAmount,
          discountedPrice: pricing.discountedPrice,
          hasDiscount: pricing.hasDiscount,
          savingsPercent,
          appliedOffer: pricing.appliedOffer,
          foodType: item.food_type,
          isAvailable: item.is_available,
          preparationTime: item.preparation_time,
          displayOrder: item.display_order,
          isFeatured: item.is_featured
        };
      })
    }))
  };
};`;

code = code.replace(oldPublicMenu, newPublicMenu);
fs.writeFileSync(filePath, code, 'utf8');
console.log('menuService.js updated with discount pricing calculations!');

