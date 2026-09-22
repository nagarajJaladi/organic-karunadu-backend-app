import { Router } from "express";
import { db } from "../db.js";
import { toProduct } from "../mapper.js";
import { asyncHandler, HttpError } from "../util.js";
export const wishlistRouter = Router();
function ensureUser(userId) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if(!user) throw new HttpError(404, 'User not found');
}
//GET /api/wishlist/:userId  -> array of product ids
wishlistRouter.get('/:userId',asyncHandler((req, res) => {
    ensureUser(req.params.userId);
    const ids = db.prepare('SELECT product_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.params.userId)
    .map((r) => r.product_id);
    res.json(ids);
}));

//GET /api/wishlist/:userId/products -> full product objects
wishlistRouter.get('/:userId/products',asyncHandler((req, res) => {
    ensureUser(req.params.userId);
    const rows = db.prepare(
        `SELECT P.* FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.user_id = ? ORDER BY w.created_at DESC`)
        .all(req.params.userId);
        res.json(rows.map(toProduct));
}));

//POST /api/wishlist/:userId/toggle {productId} -> {productId, inWishlist}
wishlistRouter.post('/:userId/toggle', asyncHandler((req, res) => {
    ensureUser(req.params.userId);
    const {productId} = req.body || {}
    if(!productId) throw new HttpError(400, 'productId is required');

    const existing = db.prepare('SELECT 1 FROM wishlist WHERE user_id = ? AND product_id = ?')
    .get(req.params.userId, productId);
    if(existing) {
        db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.params.userId, productId);
        res.json({productId, inWishlist:false});
    } else {
        const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
        if(!product) throw new HttpError(404,  'Product not found');
        db.prepare('INSERT OR IGNORE INTO wishlist( user_id, product_id) VALUES(?, ?)').run(req.params.userId, productId);
        res.json({productId, inWishlist: true});
    }
}));
//DELETE /api/wishlist/:userId/:productId
wishlistRouter.delete('/:userId/:productId', asyncHandler((req, res) => {
    ensureUser(req.params.userId);
    db.prepare('DELETE FROM wishlist WHERE user_id= ? AND product_id = ?')
    .run(req.params.userId, req.params.productId);
    res.status(204).end();
}));