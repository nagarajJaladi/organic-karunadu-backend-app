import {Router} from 'express';
import { db } from '../db.js';
import { toReview } from '../mapper.js';
import { asyncHandler, HttpError, genId, round2 } from '../util.js';
export const reviewsRouter = Router();
// Get /api/reviews?productId=p1 (productId optional -> all reviews)
reviewsRouter.get('/', asyncHandler((req, res) => {
    const {productId} = req.query;
const rows = productId ? db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(productId): db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
res.json(rows.map(toReview));
}));

//POST /api/reviews { productId, author, rating, comment}
reviewsRouter.post('/', asyncHandler((req, res) => {
    const {productId, author, rating, comment = ''} = req.body || {};
    if(!productId || !author || rating ==null) {
        throw new HttpError(400, 'productId, author and rating are required');
    }
    const numRating = Number(rating);
    if(numRating < 1 || numRating > 5) throw new HttpError(400, 'rating must be between 1 and 5');

    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if(!product) throw new HttpError(404, 'Product not found');

    const review = {
        id: genId('r'),
        productId, 
        author,
        rating: numRating,
        comment,
        createdAt: new Date().toISOString()
    };

    const tx = db.transaction (() => {
        db.prepare(
            `INSERT INTO reviews(id, product_id, author, rating, comment,created_at)
            VALUES (@id, @productId, @author, @rating, @comment, @createdAt)`
        ).run(review);
        //Recompute the products average rating + count
        const agg = db.prepare(
            'SELECT AVG(rating) avg, COUNT(*) count FROM reviews WHERE product_id = ?')
            .get(productId);
            db.prepare('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?')
            .run(round2(agg.avg ?? 0), agg.count, productId);
    });
    tx();
    res.status(201).json(toReview( {
        id:review.id,
        product_id: productId, 
        author, 
        rating: numRating,
        comment, created_at: review.createdAt
    }));
}));