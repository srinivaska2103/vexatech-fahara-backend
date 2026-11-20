const path = require('path');
const { Client } = require(path.join(__dirname, '../node_modules/pg'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function updateDefaultBanners() {
  await client.connect();
  await client.query(`
    UPDATE banners 
    SET bg_color = '#FFFFFF', 
        text_color = '#252525',
        badge_bg = '#E50914',
        cta_bg_color = '#E50914',
        cta_text_color = '#FFFFFF',
        offer_text_color = '#E50914',
        offer_bg_color = '#FFFFFF',
        promotional_label = 'BEST DEAL',
        discount_value = '50',
        discount_symbol = '%',
        offer_heading = 'OFF',
        center_image_url = CASE 
          WHEN center_image_url IS NULL OR center_image_url = '' 
          THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=80'
          ELSE center_image_url 
        END;
  `);
  console.log('Successfully updated existing banners to white background with food visual!');
  await client.end();
}

updateDefaultBanners().catch(err => {
  console.error(err);
  process.exit(1);
});
