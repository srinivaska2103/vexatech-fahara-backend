const fs = require('fs');
const path = 'D:/Srinivas/Fahara Web App/vexatech-fahara-backend/prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

// Replace model reviews block
const targetReviews = `model reviews {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  booking_id       String?   @db.Uuid
  customer_id      String?   @db.Uuid
  cafe_id          String?   @db.Uuid
  event_service_id String?   @db.Uuid
  rating           Int?
  review           String?
  reply            String?
  reply_at         DateTime? @db.Timestamp(6)
  images           Json?
  created_at       DateTime? @default(now()) @db.Timestamp(6)
  bookings         bookings? @relation(fields: [booking_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  cafes            cafes?    @relation(fields: [cafe_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  event_services   event_services? @relation(fields: [event_service_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  users            users?    @relation(fields: [customer_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
}`;

const replacementReviews = `model reviews {
  id                  String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  booking_id          String?      @db.Uuid
  order_id            String?      @db.Uuid
  review_type         String?      @default("BOOKING") @db.VarChar(30) // BOOKING, FOOD_ORDER
  customer_id         String?      @db.Uuid
  cafe_id             String?      @db.Uuid
  event_service_id    String?      @db.Uuid
  rating              Int?
  food_quality_rating Int?
  packaging_rating    Int?
  delivery_rating     Int?
  review_title        String?      @db.VarChar(200)
  review              String?
  reply               String?
  reply_at            DateTime?    @db.Timestamp(6)
  images              Json?
  created_at          DateTime?    @default(now()) @db.Timestamp(6)
  bookings            bookings?    @relation(fields: [booking_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  food_orders         food_orders? @relation(fields: [order_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  cafes               cafes?       @relation(fields: [cafe_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  event_services      event_services? @relation(fields: [event_service_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  users               users?       @relation(fields: [customer_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
}`;

// Normalize line endings for replacement
const normalize = str => str.replace(/\r\n/g, '\n');
const normalizedContent = normalize(content);
const normalizedTarget = normalize(targetReviews);
const normalizedReplacement = normalize(replacementReviews);

if (!normalizedContent.includes(normalizedTarget)) {
  console.error("Target not found!");
  process.exit(1);
}

let updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);

// Also add reviews relation inside food_orders
const targetFoodOrders = `  email_notifications       email_notifications[]\n\n  @@index([customer_id]`;
const replacementFoodOrders = `  email_notifications       email_notifications[]\n  reviews                   reviews[]\n\n  @@index([customer_id]`;

if (updated.includes(targetFoodOrders)) {
  updated = updated.replace(targetFoodOrders, replacementFoodOrders);
}

// Write back with CRLF
fs.writeFileSync(path, updated.replace(/\n/g, '\r\n'), 'utf8');
console.log("schema.prisma updated successfully!");

