import { Router } from 'express';
import { db } from '../db.js';
import { toProduct } from '../mapper.js';
import { requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError } from '../util.js';

export const wishlistRouter = Router();

async function ensureUser(userId) {
    const result = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!result.rowCount) throw new HttpError(404, 'User not found');
}

function ensureOwner(req) {
    if (req.user.id !== req.params.userId) throw new HttpError(403, 'You can only access your own wishlist');
}

wishlistRouter.get('/:userId', requireAuth, asyncHandler(async (req, res) => {
    ensureOwner(req);
    await ensureUser(req.params.userId);
    const result = await db.query(
        'SELECT product_id FROM wishlist WHERE user_id = $1 ORDER BY created_at DESC', [req.params.userId]);
    res.json(result.rows.map((row) => row.product_id));
}));

wishlistRouter.get('/:userId/products', requireAuth, asyncHandler(async (req, res) => {
    ensureOwner(req);
    await ensureUser(req.params.userId);
    const result = await db.query(
        'SELECT p.* FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.user_id = $1 ORDER BY w.created_at DESC',
        [req.params.userId]);
    res.json(result.rows.map(toProduct));
}));

wishlistRouter.post('/:userId/toggle', requireAuth, asyncHandler(async (req, res) => {
    ensureOwner(req);
    await ensureUser(req.params.userId);
    const { productId } = req.body || {};
    if (!productId) throw new HttpError(400, 'productId is required');
    const existing = await db.query(
        'SELECT 1 FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.params.userId, productId]);
    if (existing.rowCount) {
        await db.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.params.userId, productId]);
        return res.json({ productId, inWishlist: false });
    }
    const product = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (!product.rowCount) throw new HttpError(404, 'Product not found');
    await db.query('INSERT INTO wishlist(user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.userId, productId]);
    res.json({ productId, inWishlist: true });
}));

wishlistRouter.delete('/:userId/:productId', requireAuth, asyncHandler(async (req, res) => {
    ensureOwner(req);
    await ensureUser(req.params.userId);
    await db.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2',
        [req.params.userId, req.params.productId]);
    res.status(204).end();
}));
