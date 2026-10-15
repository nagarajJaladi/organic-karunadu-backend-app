import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const db = new Pool({ connectionString: config.databaseUrl });

export async function initSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            price NUMERIC NOT NULL DEFAULT 0,
            category TEXT NOT NULL DEFAULT '',
            category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
            brand TEXT NOT NULL DEFAULT '',
            image TEXT NOT NULL DEFAULT '',
            stock INTEGER NOT NULL DEFAULT 0,
            rating NUMERIC NOT NULL DEFAULT 0,
            rating_count INTEGER NOT NULL DEFAULT 0,
            varients JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS serviceable_pincodes (
            id BIGSERIAL PRIMARY KEY,
            pincode VARCHAR(6) NOT NULL UNIQUE CHECK (pincode ~ '^[1-9][0-9]{5}$'),
            city VARCHAR(100),
            state VARCHAR(100),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
            min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS product_images (
            id BIGSERIAL PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            image_url TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (product_id, sort_order)
        );
        CREATE INDEX IF NOT EXISTS idx_product_images_product_order
            ON product_images(product_id, sort_order);
        CREATE TABLE IF NOT EXISTS product_details (
            product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
            how_to_use TEXT NOT NULL DEFAULT '',
            nutrition TEXT NOT NULL DEFAULT '',
            certifications TEXT NOT NULL DEFAULT '',
            why_choose TEXT NOT NULL DEFAULT '',
            sourcing TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'how_to_use'
            ) THEN
                EXECUTE 'INSERT INTO product_details (product_id, how_to_use, nutrition, certifications, why_choose, sourcing)
                    SELECT id, how_to_use, nutrition, certifications, why_choose, sourcing FROM products
                    ON CONFLICT (product_id) DO UPDATE SET
                        how_to_use = EXCLUDED.how_to_use,
                        nutrition = EXCLUDED.nutrition,
                        certifications = EXCLUDED.certifications,
                        why_choose = EXCLUDED.why_choose,
                        sourcing = EXCLUDED.sourcing';
            END IF;
        END $$;
        ALTER TABLE products DROP COLUMN IF EXISTS how_to_use;
        ALTER TABLE products DROP COLUMN IF EXISTS nutrition;
        ALTER TABLE products DROP COLUMN IF EXISTS certifications;
        ALTER TABLE products DROP COLUMN IF EXISTS why_choose;
        ALTER TABLE products DROP COLUMN IF EXISTS sourcing;
        INSERT INTO product_details (product_id)
            SELECT id FROM products
            ON CONFLICT (product_id) DO NOTHING;
        ALTER TABLE products
            ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT;
        ALTER TABLE products
            ADD COLUMN IF NOT EXISTS varients JSONB NOT NULL DEFAULT '[]';
        INSERT INTO categories (id, name)
            SELECT 'cat-' || md5(lower(trim(category))), trim(category)
            FROM products
            WHERE trim(category) <> ''
            ON CONFLICT (name) DO NOTHING;
        UPDATE products AS product
            SET category_id = categories.id
            FROM categories
            WHERE product.category_id IS NULL
              AND lower(trim(product.category)) = lower(categories.name);
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            author TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            order_number TEXT UNIQUE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_name TEXT NOT NULL DEFAULT '',
            mobile_number TEXT NOT NULL DEFAULT '',
            customer_email TEXT,
            shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
            subtotal NUMERIC NOT NULL DEFAULT 0,
            discount NUMERIC NOT NULL DEFAULT 0,
            shipping NUMERIC NOT NULL DEFAULT 0,
            total NUMERIC NOT NULL DEFAULT 0,
            coupon_code TEXT,
            status TEXT NOT NULL DEFAULT 'placed',
            payment_status TEXT NOT NULL DEFAULT 'pending',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            addr_full_name TEXT NOT NULL DEFAULT '',
            addr_line1 TEXT NOT NULL DEFAULT '',
            addr_city TEXT NOT NULL DEFAULT '',
            addr_postal_code TEXT NOT NULL DEFAULT '',
            addr_country TEXT NOT NULL DEFAULT '',
            addr_phone TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
        UPDATE orders SET order_number = id WHERE order_number IS NULL;
        ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
        UPDATE orders AS o SET customer_name = COALESCE(NULLIF(o.customer_name, ''), o.addr_full_name, u.name),
            customer_email = COALESCE(o.customer_email, u.email),
            mobile_number = COALESCE(NULLIF(o.mobile_number, ''), o.addr_phone),
            shipping_address = jsonb_build_object(
                'fullName', o.addr_full_name, 'line1', o.addr_line1, 'city', o.addr_city,
                'postalCode', o.addr_postal_code, 'country', o.addr_country, 'phone', o.addr_phone
            )
            FROM users u WHERE u.id = o.user_id AND o.shipping_address = '{}'::jsonb;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod';
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_amounts_nonnegative_check') THEN
                ALTER TABLE orders ADD CONSTRAINT orders_amounts_nonnegative_check
                    CHECK (subtotal >= 0 AND discount >= 0 AND shipping >= 0 AND total >= 0) NOT VALID;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check') THEN
                ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
                    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) NOT VALID;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
                ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
                    CHECK (payment_method = 'cod') NOT VALID;
            END IF;
        END $$;
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'placed';
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
        UPDATE orders SET status = 'placed' WHERE status IN ('pending', 'paid');
        ALTER TABLE orders ADD CONSTRAINT orders_status_check
            CHECK (status IN ('placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'));
        CREATE TABLE IF NOT EXISTS order_items (
            id BIGSERIAL PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL,
            name TEXT NOT NULL,
            price NUMERIC NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0)
        );
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '';
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);
        UPDATE order_items SET product_name = name WHERE product_name IS NULL;
        UPDATE order_items SET unit_price = price WHERE unit_price IS NULL;
        UPDATE order_items SET subtotal = price * quantity WHERE subtotal IS NULL;
        ALTER TABLE order_items ALTER COLUMN product_name SET NOT NULL;
        ALTER TABLE order_items ALTER COLUMN unit_price SET NOT NULL;
        ALTER TABLE order_items ALTER COLUMN subtotal SET NOT NULL;
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_amounts_nonnegative_check') THEN
                ALTER TABLE order_items ADD CONSTRAINT order_items_amounts_nonnegative_check
                    CHECK (unit_price >= 0 AND subtotal >= 0 AND quantity > 0) NOT VALID;
            END IF;
        END $$;
        CREATE TABLE IF NOT EXISTS order_status_history (
            id BIGSERIAL PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            old_status TEXT,
            new_status TEXT NOT NULL CHECK (new_status IN ('placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled')),
            changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            remarks TEXT,
            changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO order_status_history(order_id, old_status, new_status, remarks, changed_at)
            SELECT o.id, NULL, o.status, 'Initial order status', o.created_at
            FROM orders o WHERE NOT EXISTS (
                SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
            );
        CREATE TABLE IF NOT EXISTS wishlist (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
        CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, changed_at);
        CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
    `);
}
