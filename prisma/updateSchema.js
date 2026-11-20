const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

// 1. Add relations to users model
if (!s.includes('customer_gift_rewards      customer_gift_rewards[]')) {
  s = s.replace(
    /order_cancellations\s+order_cancellations\[\](\r?\n\s+roles\s+roles)/,
    'order_cancellations        order_cancellations[]\r\n  customer_gift_rewards      customer_gift_rewards[]\r\n  audit_logs_performed       gift_reward_audit_logs[] @relation("gift_reward_audit_performed_by")\r\n  audit_logs_customer        gift_reward_audit_logs[] @relation("gift_reward_audit_customer")$1'
  );
}

// 2. Add relations to food_orders model
if (!s.includes('customer_gift_rewards     customer_gift_rewards[]')) {
  s = s.replace(
    /delivery_locations\s+delivery_locations\[\](\r?\n\r?\n\s+@@index\(\[customer_id\])/,
    'delivery_locations        delivery_locations[]\r\n  customer_gift_rewards     customer_gift_rewards[]\r\n  gift_reward_audit_logs    gift_reward_audit_logs[]$1'
  );
}

// 3. Append models to schema if not present
if (!s.includes('model gift_reward_configs')) {
  const newModels = `

model gift_reward_configs {
  id                      String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title                   String                  @db.VarChar(150)
  description             String?
  category                String                  @db.VarChar(50) // MOVIE_TICKETS, FREE_FOOD, DISCOUNT_VOUCHER, FREE_DELIVERY, SHOPPING_CARD, SURPRISE_GIFT
  image_url               String?                 @db.VarChar(500)
  min_order_value         Decimal                 @default(1500.00) @db.Decimal(10, 2)
  reward_value            Decimal?                @default(0.00) @db.Decimal(10, 2)
  tier_name               String?                 @default("Silver Tier") @db.VarChar(100)
  tier_level              Int?                    @default(1)
  total_quantity          Int?                    @default(1000)
  available_quantity      Int?                    @default(1000)
  claimed_count           Int?                    @default(0)
  valid_from              DateTime?               @default(now()) @db.Timestamptz(6)
  valid_until             DateTime?               @db.Timestamptz(6)
  is_active               Boolean?                @default(true)
  redemption_instructions String?
  terms_conditions        String?
  created_at              DateTime?               @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?               @default(now()) @updatedAt @db.Timestamptz(6)

  customer_gift_rewards   customer_gift_rewards[]
  gift_reward_audit_logs  gift_reward_audit_logs[]

  @@index([is_active, min_order_value], map: "idx_gift_reward_cfg_active_min")
}

model customer_gift_rewards {
  id                      String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reward_config_id        String                  @db.Uuid
  customer_id             String                  @db.Uuid
  order_id                String?                 @db.Uuid
  voucher_code            String                  @unique @db.VarChar(80)
  status                  String                  @default("AVAILABLE") @db.VarChar(30) // AVAILABLE, REDEEMED, EXPIRED, CANCELLED, REVOKED
  reward_title            String                  @db.VarChar(150)
  reward_category         String                  @db.VarChar(50)
  reward_value            Decimal?                @default(0.00) @db.Decimal(10, 2)
  image_url               String?                 @db.VarChar(500)
  min_order_value         Decimal                 @default(0.00) @db.Decimal(10, 2)
  redemption_instructions String?
  qr_code_data            String?
  issued_at               DateTime?               @default(now()) @db.Timestamptz(6)
  expires_at              DateTime?               @db.Timestamptz(6)
  redeemed_at             DateTime?               @db.Timestamptz(6)
  cancelled_at            DateTime?               @db.Timestamptz(6)
  revocation_reason       String?
  created_at              DateTime?               @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?               @default(now()) @updatedAt @db.Timestamptz(6)

  reward_config           gift_reward_configs     @relation(fields: [reward_config_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  customer                users                   @relation(fields: [customer_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  order                   food_orders?            @relation(fields: [order_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  gift_reward_audit_logs  gift_reward_audit_logs[]

  @@index([customer_id, status], map: "idx_customer_gift_rewards_cust")
  @@index([order_id], map: "idx_customer_gift_rewards_order")
  @@index([voucher_code], map: "idx_customer_gift_rewards_voucher")
}

model gift_reward_audit_logs {
  id                      String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  action                  String                  @db.VarChar(50) // ISSUED, REDEEMED, REVOKED, CANCELLED, MANUAL_ASSIGN, EXPIRED
  customer_id             String?                 @db.Uuid
  order_id                String?                 @db.Uuid
  reward_id               String?                 @db.Uuid
  reward_config_id        String?                 @db.Uuid
  performed_by_id         String?                 @db.Uuid
  performed_by_role       String?                 @default("SYSTEM") @db.VarChar(50)
  notes                   String?
  metadata                Json?                   @default("{}")
  created_at              DateTime?               @default(now()) @db.Timestamptz(6)

  customer                users?                  @relation("gift_reward_audit_customer", fields: [customer_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  performed_by            users?                  @relation("gift_reward_audit_performed_by", fields: [performed_by_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  order                   food_orders?            @relation(fields: [order_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  reward                  customer_gift_rewards?  @relation(fields: [reward_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  reward_config           gift_reward_configs?    @relation(fields: [reward_config_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
}
`;
  s += newModels;
}

fs.writeFileSync(schemaPath, s, 'utf8');
console.log('Successfully updated schema.prisma with gift rewards models.');
