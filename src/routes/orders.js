import { Router } from 'express';
import { db } from '../db.js';
import { toOrder } from '../mapper.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, round2 } from '../util.js';

export const ordersRouter = Router();
const FREE_SHIPPING_THRESHOLD = 100;
const SHIPPING_FEE = 9.99;
const COUPONS = [{ code: 'SAVE10', percentOff: 10 }, { code: 'WELCOME20', percentOff: 20 }];
const STATUSES = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

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
    const { items, address, couponCode, paymentMethod = 'cod' } = req.body || {};
    if (paymentMethod !== 'cod') throw new HttpError(400, 'Only cash on delivery is currently supported');
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'items must be non-empty array');
    if (!address) throw new HttpError(400, 'Address is required');
    const userId = req.user.id;
    const userResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const customer = userResult.rows[0];
    if (!customer) throw new HttpError(401, 'User account no longer exists');

    const id = `ORD-${Date.now()}`;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const normalizedItems = [];
        for (const item of items) {
            const productId = item.product ? item.product.id : item.productId;
            const quantity = Number(item.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new HttpError(400, 'Item quantity must be a positive integer');
            }
            const result = await client.query(
                'SELECT id, name, price, stock, varients FROM products WHERE id = $1 FOR UPDATE',
                [productId]);
            const product = result.rows[0];
            if (!product) throw new HttpError(404, 'Product not found');

            const size = String(item.size ?? '').trim();
            const variants = Array.isArray(product.varients) ? [...product.varients] : [];
            const variantIndex = size ? variants.findIndex((variant) => variant.size === size) : -1;
            if (size && variantIndex === -1) throw new HttpError(400, `Unknown product size: ${size}`);

            const variant = variantIndex >= 0 ? variants[variantIndex] : null;
            const availableStock = Number(variant ? variant.stock : product.stock);
            if (quantity > availableStock) {
                throw new HttpError(409, `Insufficient stock for ${product.name}${size ? ` (${size})` : ''}`);
            }
            const price = Number(variant ? variant.price : product.price);
            if (variant) {
                variants[variantIndex] = { ...variant, stock: availableStock - quantity };
                await client.query('UPDATE products SET varients = $1::jsonb WHERE id = $2', [JSON.stringify(variants), productId]);
            } else {
                await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, productId]);
            }
            normalizedItems.push({ productId, name: product.name, price, quantity, size });
        }
        const totals = computeTotals(normalizedItems, couponCode);
        const shippingAddress = {
            fullName: String(address.fullName ?? '').trim(),
            line1: String(address.line1 ?? '').trim(),
            city: String(address.city ?? '').trim(),
            postalCode: String(address.postalCode ?? '').trim(),
            country: String(address.country ?? '').trim(),
            phone: String(address.phone ?? '').trim()
        };
        await client.query(`INSERT INTO orders (
            id, order_number, user_id, customer_name, mobile_number, customer_email, shipping_address,
            subtotal, discount, shipping, total, coupon_code, status, payment_method, payment_status,
            addr_full_name, addr_line1, addr_city, addr_postal_code, addr_country, addr_phone
        ) VALUES ($1, $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, $15, $16, $17, $18, $19)`, [
            id, userId, shippingAddress.fullName || customer.name, shippingAddress.phone, customer.email,
            JSON.stringify(shippingAddress), totals.subtotal, totals.discount, totals.shipping, totals.total,
            totals.couponValid ? couponCode : null, 'placed', paymentMethod, shippingAddress.fullName,
            shippingAddress.line1, shippingAddress.city, shippingAddress.postalCode, shippingAddress.country, shippingAddress.phone
        ]);
        await client.query(
            `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, remarks)
             VALUES ($1, NULL, 'placed', $2, 'Order placed by customer')`, [id, userId]);
        for (const item of normalizedItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, name, price, quantity, size, product_name, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6, $3, $4, $7)`,
                [id, item.productId, item.name, item.price, item.quantity, item.size, round2(item.price * item.quantity)]);
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
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) throw new HttpError(404, 'Order not found');
        const oldStatus = current.rows[0].status;
        if (oldStatus !== status) {
            await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
            await client.query(
                'INSERT INTO order_status_history(order_id, old_status, new_status, changed_by) VALUES ($1, $2, $3, $4)',
                [req.params.id, oldStatus, status, req.user.id]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.json(await loadOrder(req.params.id));
}));
