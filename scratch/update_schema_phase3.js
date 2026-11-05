const fs = require('fs');

const schemaPath = 'vexatech-fahara-backend/prisma/schema.prisma';
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Add relations to model cafes
if (!schema.includes('cafe_fulfilment_settings')) {
  const cafeEndAnchor = '  menu_offers               menu_offers[]';
  const cafeRelations = `  menu_offers               menu_offers[]
  cafe_fulfilment_settings  cafe_fulfilment_settings?
  delivery_employees        delivery_employees[]
  customer_carts            customer_carts[]
  food_orders               food_orders[]`;
  schema = schema.replace(cafeEndAnchor, cafeRelations);
}

// 2. Add relations to model users
if (!schema.includes('customer_carts            customer_carts?')) {
  const userEndAnchor = '  partner_subscriptions      partner_subscriptions[]';
  const userRelations = `  partner_subscriptions      partner_subscriptions[]
  customer_carts             customer_carts?
  food_orders                food_orders[]`;
  schema = schema.replace(userEndAnchor, userRelations);
}

// 3. Add relations to model menu_items
if (!schema.includes('customer_cart_items customer_cart_items[]')) {
  const menuItemAnchor = '  menu_offer_items menu_offer_items[]';
  const menuItemRelations = `  menu_offer_items menu_offer_items[]
  customer_cart_items customer_cart_items[]
  food_order_items    food_order_items[]`;
  schema = schema.replace(menuItemAnchor, menuItemRelations);
}

// 4. Append new Phase 3 models to schema
const phase3Models = `
// ==========================================
// PHASE 3: ORDERS, CART & RESTAURANT DELIVERY
// ==========================================

model cafe_fulfilment_settings {
  id                             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cafe_id                        String    @unique @db.Uuid
  is_takeaway_enabled            Boolean   @default(true)
  takeaway_min_order_amount      Decimal   @default(0.00) @db.Decimal(10, 2)
  estimated_pickup_time_minutes  Int       @default(20)
  takeaway_operating_hours       Json?
  
  is_delivery_enabled            Boolean   @default(false)
  delivery_radius_km             Decimal   @default(5.00) @db.Decimal(6, 2)
  min_delivery_order_amount      Decimal   @default(100.00) @db.Decimal(10, 2)
  delivery_charge                Decimal   @default(30.00) @db.Decimal(10, 2)
  free_delivery_threshold        Decimal?  @db.Decimal(10, 2)
  estimated_delivery_time_minutes Int      @default(40)
  delivery_operating_hours       Json?

  created_at                     DateTime  @default(now()) @db.Timestamp(6)
  updated_at                     DateTime  @default(now()) @updatedAt @db.Timestamp(6)

  cafes                          cafes     @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
}

model delivery_employees {
  id                   String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cafe_id              String             @db.Uuid
  employee_code        String             @db.VarChar(50)
  name                 String             @db.VarChar(120)
  phone                String             @db.VarChar(20)
  vehicle_type         String             @default("BIKE") @db.VarChar(30) // BIKE, SCOOTER, BICYCLE, CAR
  vehicle_number       String?            @db.VarChar(50)
  login_pin            String?            @db.VarChar(100)
  is_active            Boolean            @default(true)
  availability_status  String             @default("AVAILABLE") @db.VarChar(30) // AVAILABLE, ON_DELIVERY, OFFLINE
  created_at           DateTime           @default(now()) @db.Timestamp(6)
  updated_at           DateTime           @default(now()) @updatedAt @db.Timestamp(6)

  cafes                cafes              @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  order_assignments    order_assignments[]
  food_orders          food_orders[]

  @@unique([cafe_id, employee_code], map: "uq_delivery_employee_code")
  @@index([cafe_id], map: "idx_delivery_employees_cafe")
  @@index([cafe_id, is_active], map: "idx_delivery_employees_active")
}

model customer_carts {
  id          String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  customer_id String                @unique @db.Uuid
  cafe_id     String                @db.Uuid
  created_at  DateTime              @default(now()) @db.Timestamp(6)
  updated_at  DateTime              @default(now()) @updatedAt @db.Timestamp(6)

  users       users                 @relation(fields: [customer_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  cafes       cafes                 @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  items       customer_cart_items[]

  @@index([customer_id], map: "idx_customer_carts_user")
}

model customer_cart_items {
  id           String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cart_id      String         @db.Uuid
  menu_item_id String         @db.Uuid
  quantity     Int            @default(1)
  created_at   DateTime       @default(now()) @db.Timestamp(6)
  updated_at   DateTime       @default(now()) @updatedAt @db.Timestamp(6)

  cart         customer_carts @relation(fields: [cart_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  menu_item    menu_items     @relation(fields: [menu_item_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([cart_id, menu_item_id], map: "uq_customer_cart_menu_item")
  @@index([cart_id], map: "idx_cart_items_cart")
}

model food_orders {
  id                        String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_number              String                 @unique @db.VarChar(60)
  customer_id               String                 @db.Uuid
  cafe_id                   String                 @db.Uuid
  order_type                String                 @default("TAKEAWAY") @db.VarChar(30) // TAKEAWAY, RESTAURANT_DELIVERY
  order_status              String                 @default("NEW") @db.VarChar(40) // NEW, ACCEPTED, PREPARING, READY_FOR_PICKUP, ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED, REJECTED
  payment_status            String                 @default("UNPAID") @db.VarChar(30) // UNPAID, PAID, CASH_ON_DELIVERY, PAY_AT_PICKUP
  
  subtotal                  Decimal                @db.Decimal(10, 2)
  discount_amount           Decimal                @default(0.00) @db.Decimal(10, 2)
  delivery_charge           Decimal                @default(0.00) @db.Decimal(10, 2)
  tax_amount                Decimal                @default(0.00) @db.Decimal(10, 2)
  total_amount              Decimal                @db.Decimal(10, 2)
  
  customer_name             String                 @db.VarChar(120)
  customer_phone            String                 @db.VarChar(20)
  fulfilment_address        Json?
  pickup_date               String?                @db.VarChar(30)
  pickup_time               String?                @db.VarChar(30)
  delivery_instructions     String?
  estimated_preparation_time Int?                  @default(20)
  assigned_employee_id      String?                @db.Uuid
  cancellation_reason       String?

  created_at                DateTime               @default(now()) @db.Timestamp(6)
  updated_at                DateTime               @default(now()) @updatedAt @db.Timestamp(6)

  users                     users                  @relation(fields: [customer_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  cafes                     cafes                  @relation(fields: [cafe_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  assigned_employee         delivery_employees?    @relation(fields: [assigned_employee_id], references: [id], onDelete: SetNull, onUpdate: NoAction)
  
  order_items               food_order_items[]
  order_assignments         order_assignments[]
  order_status_history      order_status_history[]

  @@index([customer_id], map: "idx_food_orders_customer")
  @@index([cafe_id], map: "idx_food_orders_cafe")
  @@index([cafe_id, order_status], map: "idx_food_orders_cafe_status")
  @@index([cafe_id, order_type], map: "idx_food_orders_cafe_type")
  @@index([created_at], map: "idx_food_orders_created")
}

model food_order_items {
  id                   String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_id             String      @db.Uuid
  menu_item_id         String?     @db.Uuid
  item_name_snapshot   String      @db.VarChar(160)
  item_image_snapshot  String?
  unit_price_snapshot  Decimal     @db.Decimal(10, 2)
  quantity             Int         @default(1)
  discount_snapshot    Decimal     @default(0.00) @db.Decimal(10, 2)
  final_unit_price     Decimal     @db.Decimal(10, 2)
  line_total           Decimal     @db.Decimal(10, 2)
  created_at           DateTime    @default(now()) @db.Timestamp(6)

  order                food_orders @relation(fields: [order_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  menu_item            menu_items? @relation(fields: [menu_item_id], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@index([order_id], map: "idx_food_order_items_order")
}

model order_assignments {
  id                String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_id          String             @db.Uuid
  employee_id       String             @db.Uuid
  assignment_status String             @default("ASSIGNED") @db.VarChar(30) // ASSIGNED, ACCEPTED, PICKED_UP, DELIVERED, REASSIGNED, CANCELLED
  assigned_at       DateTime           @default(now()) @db.Timestamp(6)
  picked_up_at      DateTime?          @db.Timestamp(6)
  delivered_at      DateTime?          @db.Timestamp(6)
  notes             String?

  order             food_orders        @relation(fields: [order_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  employee          delivery_employees @relation(fields: [employee_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([order_id], map: "idx_order_assignments_order")
  @@index([employee_id], map: "idx_order_assignments_employee")
}

model order_status_history {
  id                 String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_id           String      @db.Uuid
  previous_status    String?     @db.VarChar(40)
  new_status         String      @db.VarChar(40)
  changed_by         String?     @db.VarChar(120)
  changed_by_user_id String?     @db.Uuid
  note               String?
  created_at         DateTime    @default(now()) @db.Timestamp(6)

  order              food_orders @relation(fields: [order_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([order_id], map: "idx_order_status_history_order")
}
`;

if (!schema.includes('model food_orders')) {
  schema += '\n' + phase3Models;
  fs.writeFileSync(schemaPath, schema, 'utf8');
  console.log('Successfully updated schema.prisma with Phase 3 models!');
} else {
  console.log('Phase 3 models already present in schema.prisma');
}

