import { Router } from 'express';
import { db } from '../db.js';
import { toOrder } from '../mapper.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, round2 } from '../util.js';

export const ordersRouter = Router();
const FREE_SHIPPING_THRESHOLD = 100;
const SHIPPING_FEE = 9.99;
const COUPONS = [{ code: 'SAVE10', percentOff: 10 }, { code: 'WELCOME20', percentOff: 20 }];
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

function findCoupon(code) {
    if (!code) return undefined;
    return COUPONS.find((coupon) => coupon.code.toLowerCase() === String(code).trim().toLowerCase());
}

function computeTotals(items, couponCode) {
    const subtotal = items.reduce((sum, item) => {
        const price = item.product ? item.product.price : item.price;
        return sum + Number(price) * Number(item.quantity);
    }, 0);
    const coupon = findCoupon(couponCode);
    const discount = coupon ? subtotal * coupon.percentOff / 100 : 0;
    const shipping = subtotal - discount >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;
    return {
        subtotal: round2(subtotal), discount: round2(discount), shipping: round2(shipping),
        total: round2(Math.max(0, subtotal - discount) + shipping), couponValid: !!coupon
    };
}

async function loadOrder(id, client = db) {
    const order = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!order.rows[0]) return null;
    const items = await client.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    return toOrder(order.rows[0], items.rows);
}

ordersRouter.post('/validate-coupon', asyncHandler(async (req, res) => {
    const { code, items = [] } = req.body || {};
    const coupon = findCoupon(code);
    res.json({ valid: !!coupon, coupon: coupon ?? null, totals: computeTotals(items, code) });
}));

ordersRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
    const result = req.user.role === 'admin'
        ? req.query.userId
            ? await db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.query.userId])
            : await db.query('SELECT * FROM orders ORDER BY created_at DESC')
        : await db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(await Promise.all(result.rows.map((row) => loadOrder(row.id))));
}));

ordersRouter.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const order = await loadOrder(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (req.user.role !== 'admin' && order.userId !== req.user.id) {
        throw new HttpError(403, 'You can only access your own orders');
    }
    res.json(order);
}));

ordersRouter.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { items, address, couponCode } = req.body || {};
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'items must be non-empty array');
    if (!address) throw new HttpError(400, 'Address is required');
    const userId = req.user.id;

    const totals = computeTotals(items, couponCode);
    const id = `ORD-${Date.now()}`;
    const normalizedItems = items.map((item) => ({
        productId: item.product ? item.product.id : item.productId,
        name: item.product ? item.product.name : item.name,
        price: Number(item.product ? item.product.price : item.price),
        quantity: Number(item.quantity)
    }));
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO orders (id, user_id, subtotal, discount, shipping, total, coupon_code, status,
            addr_full_name, addr_line1, addr_city, addr_postal_code, addr_country, addr_phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [
            id, userId, totals.subtotal, totals.discount, totals.shipping, totals.total,
            totals.couponValid ? couponCode : null, 'paid', address.fullName ?? '', address.line1 ?? '',
            address.city ?? '', address.postalCode ?? '', address.country ?? '', address.phone ?? ''
        ]);
        for (const item of normalizedItems) {
            await client.query(
                'INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES ($1, $2, $3, $4, $5)',
                [id, item.productId, item.name, item.price, item.quantity]);
            await client.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2',
                [item.quantity, item.productId]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.status(201).json(await loadOrder(id));
}));

ordersRouter.patch('/:id/status', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`);
    const result = await db.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING id', [status, req.params.id]);
    if (!result.rowCount) throw new HttpError(404, 'Order not found');
    res.json(await loadOrder(req.params.id));
}));
