const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

const targetStr = 'delivery_operating_hours       Json?';
const fieldsToAdd = `delivery_operating_hours       Json?
  
  // Restaurant Business Hours & Food Ordering Availability
  is_ordering_enabled            Boolean   @default(true)
  auto_enable_ordering_hours     Boolean   @default(true)
  allow_orders_outside_hours     Boolean   @default(false)
  is_temporarily_paused          Boolean   @default(false)
  pause_reason                   String?   @db.VarChar(255)
  paused_until                   DateTime? @db.Timestamp(6)
  restaurant_timezone            String    @default("Asia/Kolkata") @db.VarChar(60)
  weekly_business_hours          Json?
  special_closing_dates          Json?`;

if (schema.includes(targetStr)) {
  schema = schema.replace(targetStr, fieldsToAdd);
  fs.writeFileSync(schemaPath, schema, 'utf8');
  console.log('Successfully updated prisma/schema.prisma with business hours & availability fields!');
} else {
  console.error('Target string not found in prisma/schema.prisma');
}

