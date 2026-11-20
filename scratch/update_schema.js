const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. In `model users`, add reverse relations if not already there
if (!schema.includes('reward_claims')) {
  schema = schema.replace(
    '  customer_gift_rewards      customer_gift_rewards[]',
    '  customer_gift_rewards      customer_gift_rewards[]\n  reward_claims              reward_claims[]\n  ticket_distributions       ticket_distribution_history[]'
  );
}

// 2. In `model food_orders`, add reverse relation for reward_claims if not already there
if (!schema.includes('reward_claims              reward_claims[]')) {
  schema = schema.replace(
    '  customer_gift_rewards     customer_gift_rewards[]',
    '  customer_gift_rewards     customer_gift_rewards[]\n  reward_claims             reward_claims[]'
  );
}

// 3. In `model customer_gift_rewards`, add relation to reward_claims
if (!schema.includes('reward_claims           reward_claims[]')) {
  schema = schema.replace(
    '  gift_reward_audit_logs  gift_reward_audit_logs[]',
    '  gift_reward_audit_logs  gift_reward_audit_logs[]\n  reward_claims           reward_claims[]'
  );
}

// 4. Append new models at the bottom of schema.prisma
const newModels = `
// ── REWARD CLAIM & MOVIE TICKET DISTRIBUTION MODELS ───────────────────────

model reward_claims {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claim_number            String                        @unique @db.VarChar(60) // e.g. CLM-MVI-8921-2026
  customer_id             String                        @db.Uuid
  order_id                String?                       @db.Uuid
  reward_id               String?                       @db.Uuid
  reward_type             String                        @default("MOVIE_TICKETS") @db.VarChar(50)
  reward_title            String                        @db.VarChar(160)
  
  // Status: TICKET_PENDING, TICKET_SENT, REDEEMED, EXPIRED, CANCELLED
  status                  String                        @default("TICKET_PENDING") @db.VarChar(40)
  
  claimed_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  ticket_sent_at          DateTime?                     @db.Timestamptz(6)
  cancelled_at            DateTime?                     @db.Timestamptz(6)
  cancellation_reason     String?
  customer_notes          String?
  metadata                Json?                         @default("{}")
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?                     @default(now()) @updatedAt @db.Timestamptz(6)

  customer                users                         @relation(fields: [customer_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  order                   food_orders?                  @relation(fields: [order_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  reward                  customer_gift_rewards?        @relation(fields: [reward_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  
  reward_tickets          reward_tickets[]
  distribution_history    ticket_distribution_history[]

  @@index([customer_id, status], map: "idx_reward_claims_cust_status")
  @@index([order_id], map: "idx_reward_claims_order")
  @@index([status], map: "idx_reward_claims_status")
}

model reward_tickets {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claim_id                String                        @db.Uuid
  ticket_code             String                        @unique @db.VarChar(80) // Unique ticket ID
  movie_name              String                        @db.VarChar(200)
  theatre_name            String                        @db.VarChar(200)
  show_datetime           DateTime?                     @db.Timestamptz(6)
  show_time_str           String?                       @db.VarChar(80) // e.g. "07:30 PM, Screen 2"
  seat_details            String                        @db.VarChar(120) // e.g. "Row D - Seats 12, 13 (Gold)"
  booking_reference       String?                       @db.VarChar(100) // e.g. "BMS-89124-DELHI"
  instructions            String?                       // e.g. "Show this barcode at box office"
  
  // Stored Ticket Files
  pdf_url                 String?                       @db.VarChar(500)
  image_url               String?                       @db.VarChar(500)
  additional_files        Json?                         @default("[]") // Array of { name, url, type }
  
  status                  String                        @default("ACTIVE") @db.VarChar(30) // ACTIVE, USED, CANCELLED
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime?                     @default(now()) @updatedAt @db.Timestamptz(6)

  claim                   reward_claims                 @relation(fields: [claim_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  distribution_history    ticket_distribution_history[]

  @@index([claim_id], map: "idx_reward_tickets_claim")
}

model ticket_distribution_history {
  id                      String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claim_id                String                        @db.Uuid
  ticket_id               String?                       @db.Uuid
  admin_id                String?                       @db.Uuid
  action                  String                        @db.VarChar(50) // TICKET_SENT, TICKET_RESENT, TICKET_CANCELLED, TICKET_UPDATED
  channel_email           Boolean                       @default(false)
  channel_in_app          Boolean                       @default(true)
  channel_whatsapp        Boolean                       @default(false)
  notes                   String?
  metadata                Json?                         @default("{}")
  created_at              DateTime?                     @default(now()) @db.Timestamptz(6)

  claim                   reward_claims                 @relation(fields: [claim_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  ticket                  reward_tickets?               @relation(fields: [ticket_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  admin                   users?                        @relation(fields: [admin_id], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@index([claim_id], map: "idx_dist_hist_claim")
  @@index([admin_id], map: "idx_dist_hist_admin")
}
`;

if (!schema.includes('model reward_claims')) {
  schema = schema + '\n' + newModels;
  fs.writeFileSync(schemaPath, schema, 'utf8');
  console.log('Successfully added reward_claims, reward_tickets, and ticket_distribution_history to schema.prisma! 🎟️✅');
} else {
  console.log('Models already exist in schema.prisma.');
}
