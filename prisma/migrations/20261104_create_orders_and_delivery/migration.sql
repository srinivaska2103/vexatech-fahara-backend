-- Phase 3 Migration: Shopping Cart, Checkout, Takeaway & Restaurant-Owned Delivery Management

-- 1. CreateTable cafe_fulfilment_settings
CREATE TABLE IF NOT EXISTS "cafe_fulfilment_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cafe_id" UUID NOT NULL,
    "is_takeaway_enabled" BOOLEAN NOT NULL DEFAULT true,
    "takeaway_min_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "estimated_pickup_time_minutes" INTEGER NOT NULL DEFAULT 20,
    "takeaway_operating_hours" JSONB,
    "is_delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_radius_km" DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    "min_delivery_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    "delivery_charge" DECIMAL(10,2) NOT NULL DEFAULT 30.00,
    "free_delivery_threshold" DECIMAL(10,2),
    "estimated_delivery_time_minutes" INTEGER NOT NULL DEFAULT 40,
    "delivery_operating_hours" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cafe_fulfilment_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cafe_fulfilment_settings_cafe_id_key" UNIQUE ("cafe_id"),
    CONSTRAINT "fk_cafe_fulfilment_cafe" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- 2. CreateTable delivery_employees
CREATE TABLE IF NOT EXISTS "delivery_employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cafe_id" UUID NOT NULL,
    "employee_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "vehicle_type" VARCHAR(30) NOT NULL DEFAULT 'BIKE',
    "vehicle_number" VARCHAR(50),
    "login_pin" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "availability_status" VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_delivery_employee_code" UNIQUE ("cafe_id", "employee_code"),
    CONSTRAINT "fk_delivery_employees_cafe" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_delivery_employees_cafe" ON "delivery_employees"("cafe_id");
CREATE INDEX IF NOT EXISTS "idx_delivery_employees_active" ON "delivery_employees"("cafe_id", "is_active");

-- 3. CreateTable customer_carts
CREATE TABLE IF NOT EXISTS "customer_carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_carts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_carts_customer_id_key" UNIQUE ("customer_id"),
    CONSTRAINT "fk_customer_carts_user" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_customer_carts_cafe" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_customer_carts_user" ON "customer_carts"("customer_id");

-- 4. CreateTable customer_cart_items
CREATE TABLE IF NOT EXISTS "customer_cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_cart_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_customer_cart_menu_item" UNIQUE ("cart_id", "menu_item_id"),
    CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "customer_carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_cart_items_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_cart_items_cart" ON "customer_cart_items"("cart_id");

-- 5. CreateTable food_orders
CREATE TABLE IF NOT EXISTS "food_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" VARCHAR(60) NOT NULL,
    "customer_id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "order_type" VARCHAR(30) NOT NULL DEFAULT 'TAKEAWAY',
    "order_status" VARCHAR(40) NOT NULL DEFAULT 'NEW',
    "payment_status" VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "delivery_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "fulfilment_address" JSONB,
    "pickup_date" VARCHAR(30),
    "pickup_time" VARCHAR(30),
    "delivery_instructions" TEXT,
    "estimated_preparation_time" INTEGER DEFAULT 20,
    "assigned_employee_id" UUID,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "food_orders_order_number_key" UNIQUE ("order_number"),
    CONSTRAINT "fk_food_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_food_orders_cafe" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_food_orders_employee" FOREIGN KEY ("assigned_employee_id") REFERENCES "delivery_employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_food_orders_customer" ON "food_orders"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_food_orders_cafe" ON "food_orders"("cafe_id");
CREATE INDEX IF NOT EXISTS "idx_food_orders_cafe_status" ON "food_orders"("cafe_id", "order_status");
CREATE INDEX IF NOT EXISTS "idx_food_orders_cafe_type" ON "food_orders"("cafe_id", "order_type");
CREATE INDEX IF NOT EXISTS "idx_food_orders_created" ON "food_orders"("created_at");

-- 6. CreateTable food_order_items
CREATE TABLE IF NOT EXISTS "food_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "item_name_snapshot" VARCHAR(160) NOT NULL,
    "item_image_snapshot" TEXT,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "final_unit_price" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_food_order_items_order" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_food_order_items_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_food_order_items_order" ON "food_order_items"("order_id");

-- 7. CreateTable order_assignments
CREATE TABLE IF NOT EXISTS "order_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assignment_status" VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picked_up_at" TIMESTAMP(6),
    "delivered_at" TIMESTAMP(6),
    "notes" TEXT,

    CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_order_assignments_order" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_order_assignments_employee" FOREIGN KEY ("employee_id") REFERENCES "delivery_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_order_assignments_order" ON "order_assignments"("order_id");
CREATE INDEX IF NOT EXISTS "idx_order_assignments_employee" ON "order_assignments"("employee_id");

-- 8. CreateTable order_status_history
CREATE TABLE IF NOT EXISTS "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "previous_status" VARCHAR(40),
    "new_status" VARCHAR(40) NOT NULL,
    "changed_by" VARCHAR(120),
    "changed_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_order_status_history_order" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_order_status_history_order" ON "order_status_history"("order_id");

