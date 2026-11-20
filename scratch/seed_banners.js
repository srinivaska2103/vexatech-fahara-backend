const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

const INITIAL_BANNERS = [
  {
    name: 'Discover What Is New Hero',
    title: '✨ Grab2GO Just Got More Exciting',
    highlight_text: "Discover What's New",
    subtitle: 'Explore new venues, smarter discovery, and a smoother way to plan your moments.',
    cta_text: 'Explore Now',
    cta_link: '/customer/cafe',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 1,
    status: 'ACTIVE',
    is_active: true
  },
  {
    name: 'Table Reservations Banner',
    title: '🍽️ Choose Your Restaurant',
    highlight_text: 'Table Reservations',
    subtitle: 'Reserve tables at top-rated restaurants and enjoy seamless table bookings with instant confirmation.',
    cta_text: 'Explore Restaurants',
    cta_link: '/customer/cafe?type=RESTAURANT',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 2,
    status: 'ACTIVE',
    is_active: true
  },
  {
    name: 'Grab2GO Loyalty Points',
    title: '🎁 Claim Your Credit Points on Every Booking',
    highlight_text: 'Grab2GO Rewards',
    subtitle: 'Earn Grab2GO credit points for every completed venue reservation and redeem them on future bookings.',
    cta_text: 'View Bookings & Points',
    cta_link: '/customer/bookings',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 3,
    status: 'ACTIVE',
    is_active: true
  },
  {
    name: 'Upcoming Discounts Hero',
    title: '🔥 Upcoming Discounts & Exclusive Deals',
    highlight_text: 'Upcoming Discounts & Special Offers',
    subtitle: 'Stay tuned for exciting discounts and special offers from top Grab2GO venues coming soon.',
    cta_text: 'Browse Offers',
    cta_link: '/customer/cafe?tab=deals',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 4,
    status: 'ACTIVE',
    is_active: true
  },
  {
    name: 'Cafe Partner Onboarding',
    title: 'Grow Your Venue Business with Grab2GO',
    highlight_text: 'Cafe Partner',
    subtitle: 'List your cafe or space, receive instant party reservations & maximize revenue.',
    cta_text: 'Become a Cafe Partner',
    cta_link: 'https://admin.grab2go.in/auth/signup',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 5,
    status: 'ACTIVE',
    is_active: true
  },
  {
    name: 'Event Partner Onboarding',
    title: 'Partner with Grab2GO as an Event Specialist',
    highlight_text: 'Event Partner',
    subtitle: 'Offer your decor, photography, catering, or entertainment services for events.',
    cta_text: 'Become an Event Partner',
    cta_link: 'https://admin.grab2go.in/auth/event-signup',
    bg_color: '#E50914',
    text_color: '#FFFFFF',
    badge_bg: '#B71C1C',
    position: 'HOMEPAGE_HERO',
    display_order: 6,
    status: 'ACTIVE',
    is_active: true
  }
];

async function seed() {
  const count = await prisma.banners.count();
  if (count === 0) {
    for (const b of INITIAL_BANNERS) {
      await prisma.banners.create({ data: b });
    }
    console.log(`Seeded ${INITIAL_BANNERS.length} initial hero banners into database! 🎯✅`);
  } else {
    console.log(`Database already has ${count} banners.`);
  }

  // Create a default promotional offer if none exists
  const offerCount = await prisma.promotional_offers.count();
  if (offerCount === 0) {
    await prisma.promotional_offers.create({
      data: {
        title: 'Flat 20% OFF on Weekend Feasts',
        offer_code: 'GRAB20',
        description: 'Get 20% discount on orders above ₹499 across all Grab2Go cafes & restaurants.',
        offer_type: 'PERCENTAGE_DISCOUNT',
        discount_value: 20,
        min_order_value: 499,
        max_discount_amount: 150,
        customer_eligibility: 'ALL_CUSTOMERS',
        total_usage_limit: 1000,
        is_active: true,
        status: 'ACTIVE'
      }
    });
    console.log('Seeded initial promotional offer GRAB20! 🏷️✅');
  }

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
