const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-backend/prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Add menu_offers to cafes model relation list
if (!schema.includes('menu_offers               menu_offers[]')) {
  schema = schema.replace(
    '  menu_items                menu_items[]',
    '  menu_items                menu_items[]\n  menu_offers               menu_offers[]'
  );
}

// 2. Add menu_offer_items to menu_items relation list
if (!schema.includes('menu_offer_items  menu_offer_items[]')) {
  schema = schema.replace(
    '  cafes            cafes           @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)\n  menu_categories  menu_categories @relation(fields: [category_id], references: [id], onDelete: Cascade, onUpdate: NoAction)',
    '  cafes            cafes           @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)\n  menu_categories  menu_categories @relation(fields: [category_id], references: [id], onDelete: Cascade, onUpdate: NoAction)\n  menu_offer_items menu_offer_items[]'
  );
}

// 3. Add menu_offer_categories to menu_categories relation list
if (!schema.includes('menu_offer_categories menu_offer_categories[]')) {
  schema = schema.replace(
    '  cafes         cafes        @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)\n  menu_items    menu_items[]',
    '  cafes         cafes        @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)\n  menu_items    menu_items[]\n  menu_offer_categories menu_offer_categories[]'
  );
}

// 4. Append menu_offers, menu_offer_items, and menu_offer_categories models
const offerModels = `

model menu_offers {
  id                  String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cafe_id             String                  @db.Uuid
  title               String                  @db.VarChar(160)
  description         String?
  offer_type          String                  @default("ITEM") @db.VarChar(30) // ITEM, CATEGORY, RESTAURANT
  discount_type       String                  @default("PERCENTAGE") @db.VarChar(30) // PERCENTAGE, FIXED_AMOUNT
  discount_value      Decimal                 @db.Decimal(10, 2)
  max_discount_amount Decimal?                @db.Decimal(10, 2)
  applicable_to       String                  @default("ITEM") @db.VarChar(30) // ITEM, CATEGORY, ALL
  start_date          DateTime                @db.Timestamp(6)
  end_date            DateTime                @db.Timestamp(6)
  is_active           Boolean                 @default(true)
  created_at          DateTime                @default(now()) @db.Timestamp(6)
  updated_at          DateTime                @default(now()) @updatedAt @db.Timestamp(6)

  cafes               cafes                   @relation(fields: [cafe_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  menu_offer_items    menu_offer_items[]
  menu_offer_categories menu_offer_categories[]

  @@index([cafe_id], map: "idx_menu_offers_cafe")
  @@index([cafe_id, is_active], map: "idx_menu_offers_cafe_active")
  @@index([cafe_id, start_date, end_date], map: "idx_menu_offers_dates")
}

model menu_offer_items {
  id           String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  offer_id     String      @db.Uuid
  item_id      String      @db.Uuid
  created_at   DateTime    @default(now()) @db.Timestamp(6)

  menu_offers  menu_offers @relation(fields: [offer_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  menu_items   menu_items  @relation(fields: [item_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([offer_id, item_id], map: "uq_menu_offer_items")
  @@index([offer_id], map: "idx_menu_offer_items_offer")
  @@index([item_id], map: "idx_menu_offer_items_item")
}

model menu_offer_categories {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  offer_id        String          @db.Uuid
  category_id     String          @db.Uuid
  created_at      DateTime        @default(now()) @db.Timestamp(6)

  menu_offers     menu_offers     @relation(fields: [offer_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  menu_categories menu_categories @relation(fields: [category_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([offer_id, category_id], map: "uq_menu_offer_categories")
  @@index([offer_id], map: "idx_menu_offer_categories_offer")
  @@index([category_id], map: "idx_menu_offer_categories_cat")
}
`;

if (!schema.includes('model menu_offers')) {
  schema += offerModels;
}

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('schema.prisma updated with Phase 2 models successfully!');

