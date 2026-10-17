import { db, initSchema } from './db.js';
import { SEED_PRODUCTS, SEED_REVIEWS, SEED_USERS } from './seed-data.js';
import {hashPassword} from './util.js';
export async function seed({ force = false } = {}) {
    await initSchema();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (force) {
            await client.query('TRUNCATE wishlist, order_items, orders, reviews, products, categories, users RESTART IDENTITY CASCADE');
        }
        for (const user of SEED_USERS) {
            const passwordHash = await hashPassword(user.password);

            await client.query(
                `INSERT INTO users(id, name, email, password, role, password_hash, email_verified, is_active)
                 VALUES ($1, $2, $3, $4, $5,$6, TRUE, TRUE) ON CONFLICT (id) DO NOTHING`,
                [user.id, user.name, user.email, user.password, user.role, passwordHash]);
        }
        for (const product of SEED_PRODUCTS) {
            const category = await client.query(`
                INSERT INTO categories (id, name)
                VALUES ('cat-' || md5(lower(trim($1))), trim($1))
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id`, [product.category]);
            await client.query(`INSERT INTO products
                (id, name, description, price, category, category_id, brand, image, stock, rating, rating_count,varients)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
                [product.id, product.name, product.description, product.price, product.category, category.rows[0].id,
                    product.brand, product.image, product.stock, product.rating, product.ratingCount,
                    JSON.stringify(Array.isArray(product.varients) ? product.varients : Array.isArray(product.variants) ? product.variants : [])]);
        }
        for (const review of SEED_REVIEWS) {
            await client.query(
                'INSERT INTO reviews(id, product_id, author, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [review.id, review.productId, review.author, review.rating, review.comment, review.createdAt]);
        }
        
        const seedCategories = [...new Set(SEED_PRODUCTS.map(p => p.category))];
        for (const category of seedCategories) {
            await client.query(`
                INSERT INTO categories (id, name)
                VALUES ('cat-' || md5(lower(trim($1))), trim($1))
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name`, [category]);
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    const [users, products, reviews, categories] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM users'),
        db.query('SELECT COUNT(*)::int AS count FROM products'),
        db.query('SELECT COUNT(*)::int AS count FROM reviews'),
        db.query('SELECT COUNT(*)::int AS count FROM categories')
    ]);
    return {
        users: users.rows[0].count,
        products: products.rows[0].count,
        reviews: reviews.rows[0].count,
        categories: categories.rows[0].count
    };
}

if (process.argv[1]?.endsWith('seed.js')) {
    seed({ force: process.argv.includes('--force') })
        .then((counts) => console.log('seed template:', counts))
        .catch((error) => { console.error(error); process.exitCode = 1; })
        .finally(() => db.end());
}
