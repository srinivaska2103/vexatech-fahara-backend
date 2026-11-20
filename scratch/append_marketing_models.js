const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

const promoModels = `
// ── MARKETING: DYNAMIC BANNERS, PROMOTIONAL OFFERS & CAMPAIGNS ────────────

model banners {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                    String                        @db.VarChar(150) // Internal admin name
  title                   String                        @db.VarChar(200) // Main heading
  highlight_text          String?                       @db.VarChar(100) // Highlighted text / badge
  subtitle                String?                       @db.VarChar(300) // Description
  
  // Media Assets
  desktop_image_url       String?                       @db.VarChar(500)
  mobile_image_url        String?                       @db.VarChar(500)
  
  // Design & Theming
  bg_color                String?                       @default("#E50914") @db.VarChar(50)
  text_color              String?                       @default("#FFFFFF") @db.VarChar(50)
  badge_bg                String?                       @default("#B71C1C") @db.VarChar(50)
  
  // CTA Action
  cta_text                String?                       @default("Order Now") @db.VarChar(80)
  cta_link                String?                       @default("/customer/food") @db.VarChar(300)
  
  // Positioning & Ordering
  position                String                        @default("HOMEPAGE_HERO") @db.VarChar(50) // HOMEPAGE_HERO, FOOD_HERO, CAFE_HERO, POPUP
  display_order           Int                           @default(0)
  
  // Status: ACTIVE, INACTIVE, SCHEDULED, EXPIRED
  status                  String                        @default("ACTIVE") @db.VarChar(30)
  is_active               Boolean                       @default(true)
  
  // Scheduling Validity
  start_date              DateTime?                     @db.Timestamptz(6)
  end_date                DateTime?                     @db.Timestamptz(6)
  
  // Campaign & Offer Linkage
  campaign_id             String?                       @db.Uuid
  offer_id                String?                       @db.Uuid
  
  // Analytics
  impressions_count       Int                           @default(0)
  clicks_count            Int                           @default(0)
  
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?                     @default(now()) @updatedAt @db.Timestamptz(6)

  campaign                marketing_campaigns?          @relation(fields: [campaign_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  offer                   promotional_offers?           @relation(fields: [offer_id], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@index([position, is_active], map: "idx_banners_position_active")
  @@index([display_order], map: "idx_banners_display_order")
}

model promotional_offers {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title                   String                        @db.VarChar(150)
  offer_code              String                        @unique @db.VarChar(50) // e.g. GRAB20, BOGOFOOD, FREEDEL
  description             String?
  
  // Offer Type: PERCENTAGE_DISCOUNT, FIXED_DISCOUNT, FREE_DELIVERY, BOGO, FREE_GIFT
  offer_type              String                        @default("PERCENTAGE_DISCOUNT") @db.VarChar(50)
  
  // Discount & Threshold Parameters
  discount_value          Decimal                       @default(0.00) @db.Decimal(10, 2) // Percentage (e.g. 20) or Flat (e.g. 100)
  min_order_value         Decimal                       @default(0.00) @db.Decimal(10, 2)
  max_discount_amount     Decimal?                      @db.Decimal(10, 2) // Cap for percentage discount
  
  // Scope & Applicability
  applicable_type         String                        @default("ALL") @db.VarChar(40) // ALL, RESTAURANTS, CATEGORIES
  applicable_ids          Json?                         @default("[]") // Array of cafe or category IDs
  
  // Customer Eligibility: ALL_CUSTOMERS, NEW_CUSTOMERS, VIP_CUSTOMERS
  customer_eligibility    String                        @default("ALL_CUSTOMERS") @db.VarChar(40)
  
  // Usage Limits
  total_usage_limit       Int?                          // Total overall redeems allowed
  usage_per_customer      Int                           @default(1)
  current_usage_count     Int                           @default(0)
  
  // Scheduling & Status
  is_active               Boolean                       @default(true)
  status                  String                        @default("ACTIVE") @db.VarChar(30)
  start_date              DateTime?                     @db.Timestamptz(6)
  end_date                DateTime?                     @db.Timestamptz(6)
  
  // Analytics
  orders_generated_count  Int                           @default(0)
  total_revenue_generated Decimal                       @default(0.00) @db.Decimal(12, 2)
  
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?                     @default(now()) @updatedAt @db.Timestamptz(6)

  banners                 banners[]
  campaigns               marketing_campaigns[]

  @@index([offer_code], map: "idx_promotional_offers_code")
  @@index([is_active, status], map: "idx_promotional_offers_active")
}

model marketing_campaigns {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                    String                        @db.VarChar(160) // e.g. "Weekend Feast Festival 2026"
  description             String?
  campaign_code           String                        @unique @db.VarChar(60) // e.g. CMP-WKND-2026
  
  offer_id                String?                       @db.Uuid
  
  // Scheduling & Status: DRAFT, ACTIVE, PAUSED, COMPLETED
  status                  String                        @default("ACTIVE") @db.VarChar(30)
  is_active               Boolean                       @default(true)
  start_date              DateTime?                     @db.Timestamptz(6)
  end_date                DateTime?                     @db.Timestamptz(6)
  
  // Target Channels
  channel_homepage        Boolean                       @default(true)
  channel_food_page       Boolean                       @default(true)
  channel_push_notify     Boolean                       @default(false)
  
  // Aggregated Analytics
  total_impressions       Int                           @default(0)
  total_clicks            Int                           @default(0)
  total_conversions       Int                           @default(0)
  total_revenue           Decimal                       @default(0.00) @db.Decimal(12, 2)
  
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?                     @default(now()) @updatedAt @db.Timestamptz(6)

  offer                   promotional_offers?           @relation(fields: [offer_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  banners                 banners[]

  @@index([status, is_active], map: "idx_campaigns_status")
}
`;

if (!s.includes('model banners')) {
  s = s + '\n' + promoModels;
  fs.writeFileSync(schemaPath, s, 'utf8');
  console.log('Added banners, promotional_offers, and marketing_campaigns models! 🚀');
} else {
  console.log('Marketing models already exist.');
}
