const path = require('path');
const { Client } = require(path.join(__dirname, '../node_modules/pg'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seedBestDeal() {
  await client.connect();
  const existing = await client.query("SELECT id FROM banners WHERE position = 'HOMEPAGE_HERO' AND promotional_label = 'BEST DEAL';");
  if (existing.rows.length === 0) {
    const insertQuery = `
      INSERT INTO banners (
        name, title, highlight_text, subtitle, promotional_label,
        center_image_url, discount_value, discount_symbol, offer_heading,
        offer_subtitle, bg_color, text_color, badge_bg, offer_text_color,
        cta_text, cta_link, cta_bg_color, cta_text_color, position,
        banner_layout, is_active, status, display_order
      ) VALUES (
        'Burger & Fries Best Deal',
        'FEEL HUNGER! ORDER YOUR FAVORITE FOOD.',
        'BEST DEAL',
        'Delicious gourmet burgers, crispy golden fries and refreshing beverages.',
        'BEST DEAL',
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=80',
        '50',
        '%',
        'OFF',
        'Limited Time Weekend Offer',
        '#FFFFFF',
        '#252525',
        '#E50914',
        '#E50914',
        'ORDER NOW',
        '/customer/food',
        '#E50914',
        '#FFFFFF',
        'HOMEPAGE_HERO',
        'THREE_PART_HERO',
        true,
        'ACTIVE',
        1
      );
    `;
    await client.query(insertQuery);
    console.log('Successfully seeded Best Deal banner in DB!');
  } else {
    console.log('Best Deal banner already exists:', existing.rows[0].id);
  }
  await client.end();
}

seedBestDeal().catch(err => {
  console.error(err);
  process.exit(1);
});
