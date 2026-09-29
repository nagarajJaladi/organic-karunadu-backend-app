import { Router } from 'express';
import { db } from '../db.js';
import { toReview } from '../mapper.js';
import { requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, genId, round2 } from '../util.js';

export const reviewsRouter = Router();

reviewsRouter.get('/', asyncHandler(async (req, res) => {
    const { productId } = req.query;
    const result = productId
        ? await db.query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [productId])
        : await db.query('SELECT * FROM reviews ORDER BY created_at DESC');
    res.json(result.rows.map(toReview));
}));

reviewsRouter.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { productId, rating, comment = '' } = req.body || {};
    if (!productId || rating == null) throw new HttpError(400, 'productId and rating are required');
    const numRating = Number(rating);
    if (numRating < 1 || numRating > 5) throw new HttpError(400, 'rating must be between 1 and 5');
    const product = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (!product.rowCount) throw new HttpError(404, 'Product not found');

    const review = { id: genId('r'), productId, author: req.user.name, rating: numRating, comment };
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'INSERT INTO reviews(id, product_id, author, rating, comment) VALUES ($1, $2, $3, $4, $5)',
            [review.id, review.productId, review.author, review.rating, review.comment]);
        const aggregate = await client.query(
            'SELECT AVG(rating) AS average, COUNT(*) AS count FROM reviews WHERE product_id = $1', [productId]);
        await client.query('UPDATE products SET rating = $1, rating_count = $2 WHERE id = $3',
            [round2(Number(aggregate.rows[0].average || 0)), Number(aggregate.rows[0].count), productId]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    const result = await db.query('SELECT * FROM reviews WHERE id = $1', [review.id]);
    res.status(201).json(toReview(result.rows[0]));
}));
