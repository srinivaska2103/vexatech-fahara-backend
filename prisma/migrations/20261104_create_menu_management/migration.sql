-- CreateTable menu_categories
CREATE TABLE IF NOT EXISTS "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cafe_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable menu_items
CREATE TABLE IF NOT EXISTS "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cafe_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "food_type" VARCHAR(20) NOT NULL DEFAULT 'VEG',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "preparation_time" INTEGER DEFAULT 15,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_menu_categories_cafe" ON "menu_categories"("cafe_id");
CREATE INDEX IF NOT EXISTS "idx_menu_categories_cafe_active" ON "menu_categories"("cafe_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_menu_categories_order" ON "menu_categories"("cafe_id", "display_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_menu_items_cafe" ON "menu_items"("cafe_id");
CREATE INDEX IF NOT EXISTS "idx_menu_items_category" ON "menu_items"("category_id");
CREATE INDEX IF NOT EXISTS "idx_menu_items_cafe_available" ON "menu_items"("cafe_id", "is_available");
CREATE INDEX IF NOT EXISTS "idx_menu_items_food_type" ON "menu_items"("cafe_id", "food_type");
CREATE INDEX IF NOT EXISTS "idx_menu_items_order" ON "menu_items"("cafe_id", "display_order");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_categories_cafe_id_fkey'
    ) THEN
        ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_cafe_id_fkey'
    ) THEN
        ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_category_id_fkey'
    ) THEN
        ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

