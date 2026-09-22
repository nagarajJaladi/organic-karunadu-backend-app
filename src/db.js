import fs from 'node:fs';
import path from 'node:path';
import Database  from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), {recursive:true});

export const db = new Database(config.dbFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
db.exec(
    `
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE;,
        password TEXT NOT NULL,
        role    TEXT NOT NULL DEFAULT 'customer'
                CHECK( role IN ('customer','admin')),
        created_at TEXT NOT NULL DEFAULT (datatime('now'))
    );

    CREATE TABLE IF NOT EXISTS product (
        id  TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price       REAL NOT NULL DEFAULT 0,
        category    TEXT NOT NULL DEFAULT '',
        brand       TEXT NOT NULL DEFAULT '',
        image       TEXT NOT NULL DEFAULT '',
        stock       INTEGER NOT NULL DEFAULT 0,
        rating      REAL  NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        author TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subtotal REAL  NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        shipping REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        coupon_code TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK( status IN ('pending', 'paid','shipped','delivered','cancelled')),
        addr_full_name TEXT NOT NULL DEFAULT '',
        addr_line1 TEXT NOT NULL DEFAULT '',
        addr_city TEXT NOT NULL DEFAULT '',
        addr_postal_code TEXT NOT NULL DEFAULT '',
        addr_country TEXT NOT NULL DEFAULT '',
        addr_phone TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (detetime('now')),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wishlist (
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist (user_id);

    `
)
}