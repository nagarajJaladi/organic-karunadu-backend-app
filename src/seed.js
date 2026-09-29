import { db, initSchema } from './db.js';
import { SEED_PRODUCTS, SEED_REVIEWS, SEED_USERS } from './seed-data.js';

export async function seed({ force = false } = {}) {
    await initSchema();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (force) {
            await client.query('TRUNCATE wishlist, order_items, orders, reviews, products, users RESTART IDENTITY CASCADE');
        }
        for (const user of SEED_USERS) {
            await client.query(
                'INSERT INTO users(id, name, email, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
                [user.id, user.name, user.email, user.password, user.role]);
        }
        for (const product of SEED_PRODUCTS) {
            await client.query(`INSERT INTO products (id, name, description, price, category, brand, image, stock, rating, rating_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
                [product.id, product.name, product.description, product.price, product.category, product.brand,
                    product.image, product.stock, product.rating, product.ratingCount]);
        }
        for (const review of SEED_REVIEWS) {
            await client.query(
                'INSERT INTO reviews(id, product_id, author, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [review.id, review.productId, review.author, review.rating, review.comment, review.createdAt]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    const [users, products, reviews] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM users'),
        db.query('SELECT COUNT(*)::int AS count FROM products'),
        db.query('SELECT COUNT(*)::int AS count FROM reviews')
    ]);
    return {
        users: users.rows[0].count,
        products: products.rows[0].count,
        reviews: reviews.rows[0].count
    };
}

if (process.argv[1]?.endsWith('seed.js')) {
    seed({ force: process.argv.includes('--force') })
        .then((counts) => console.log('seed template:', counts))
        .catch((error) => { console.error(error); process.exitCode = 1; })
        .finally(() => db.end());
}
