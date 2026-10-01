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
        ALTER TABLE products
            ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT;
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
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subtotal NUMERIC NOT NULL DEFAULT 0,
            discount NUMERIC NOT NULL DEFAULT 0,
            shipping NUMERIC NOT NULL DEFAULT 0,
            total NUMERIC NOT NULL DEFAULT 0,
            coupon_code TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
            addr_full_name TEXT NOT NULL DEFAULT '',
            addr_line1 TEXT NOT NULL DEFAULT '',
            addr_city TEXT NOT NULL DEFAULT '',
            addr_postal_code TEXT NOT NULL DEFAULT '',
            addr_country TEXT NOT NULL DEFAULT '',
            addr_phone TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS order_items (
            id BIGSERIAL PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL,
            name TEXT NOT NULL,
            price NUMERIC NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0)
        );
        CREATE TABLE IF NOT EXISTS wishlist (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
        CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
    `);
}
