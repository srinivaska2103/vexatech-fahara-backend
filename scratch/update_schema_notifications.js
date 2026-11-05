const fs = require('fs');
let content = fs.readFileSync('vexatech-fahara-backend/prisma/schema.prisma', 'utf8');

// Normalize CRLF to LF temporarily or handle \r?\n
content = content.replace(/\r\n/g, '\n');

// 1. Cafes relation
if (!content.includes('notifications             notifications[]\n\n  @@index([city]')) {
  content = content.replace(
    'food_orders               food_orders[]\n\n  @@index([city]',
    'food_orders               food_orders[]\n  notifications             notifications[]\n\n  @@index([city]'
  );
}

// 2. Food orders relation
if (!content.includes('notifications             notifications[]\n\n  @@index([customer_id]')) {
  content = content.replace(
    'reviews                   reviews[]\n\n  @@index([customer_id]',
    'reviews                   reviews[]\n  notifications             notifications[]\n\n  @@index([customer_id]'
  );
}

// 3. Notifications model
const oldNotificationRegex = /model notifications \{[\s\S]*?\n\}/;
const newNotificationModel = `model notifications {
  id                String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id           String       @db.Uuid
  booking_id        String?      @db.Uuid
  order_id          String?      @db.Uuid
  cafe_id           String?      @db.Uuid
  category          String?      @default("BOOKING") @db.VarChar(40)
  priority          String?      @default("MEDIUM") @db.VarChar(20)
  title             String?      @db.VarChar(255)
  message           String?
  notification_type String?      @db.VarChar(60)
  channel           String?      @db.VarChar(20)
  status            String?      @db.VarChar(20)
  metadata          Json?
  sent_at           DateTime?    @db.Timestamp(6)
  read_at           DateTime?    @db.Timestamp(6)
  created_at        DateTime?    @default(now()) @db.Timestamp(6)
  bookings          bookings?    @relation(fields: [booking_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  food_orders       food_orders? @relation(fields: [order_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  cafes             cafes?       @relation(fields: [cafe_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  users             users        @relation(fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
}`;

content = content.replace(oldNotificationRegex, newNotificationModel);

// Restore CRLF
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync('vexatech-fahara-backend/prisma/schema.prisma', content, 'utf8');
console.log('Schema successfully updated!');

