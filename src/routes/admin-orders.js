import { Router } from 'express';
import { db } from '../db.js';
import { toOrder } from '../mapper.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError } from '../util.js';

export const adminOrdersRouter = Router();
adminOrdersRouter.use(requireAuth, requireAdmin);

const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

async function fetchOrder(orderId, client = db) {
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!orderResult.rows[0]) return null;
    const itemsResult = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
    return toOrder(orderResult.rows[0], itemsResult.rows);
}

adminOrdersRouter.get('/', asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const conditions = [];
    const values = [];
    const addFilter = (sql, value) => {
        values.push(value);
        conditions.push(sql.replace('?', `$${values.length}`));
    };

    const search = String(req.query.search ?? '').trim();
    if (search) {
        values.push(`%${search}%`);
        const parameter = `$${values.length}`;
        conditions.push(`(o.id ILIKE ${parameter} OR o.order_number ILIKE ${parameter} OR o.customer_name ILIKE ${parameter} OR o.mobile_number ILIKE ${parameter} OR o.customer_email ILIKE ${parameter})`);
    }
    if (req.query.status && req.query.status !== 'all') addFilter('o.status = ?', req.query.status);
    if (req.query.paymentStatus && req.query.paymentStatus !== 'all') addFilter('o.payment_status = ?', req.query.paymentStatus);
    if (req.query.from) addFilter('o.created_at >= ?::date', req.query.from);
    if (req.query.to) addFilter("o.created_at < (?::date + INTERVAL '1 day')", req.query.to);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM orders o ${where}`, values);
    const total = countResult.rows[0].total;
    const offset = (page - 1) * pageSize;
    const listValues = [...values, pageSize, offset];
    const listResult = await db.query(`
        SELECT o.id, COALESCE(o.order_number, o.id) AS "orderNumber", o.user_id AS "userId",
            COALESCE(NULLIF(o.customer_name, ''), o.addr_full_name, u.name) AS "customerName",
            COALESCE(NULLIF(o.mobile_number, ''), o.addr_phone, '') AS "mobileNumber",
            COALESCE(o.customer_email, u.email) AS "customerEmail",
            COALESCE(o.shipping_address, '{}'::jsonb) AS "shippingAddress",
            o.subtotal, o.discount AS "discountAmount", o.shipping AS "deliveryCharge", o.total,
            o.payment_method AS "paymentMethod", o.payment_status AS "paymentStatus", o.status,
            o.created_at AS "createdAt", o.updated_at AS "updatedAt",
            COALESCE(SUM(oi.quantity), 0)::int AS "totalItems", COUNT(oi.id)::int AS "lineItems"
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        ${where}
        GROUP BY o.id, u.name, u.email
        ORDER BY o.created_at DESC
        LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`, listValues);
    const summaryResult = await db.query(`
        SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'placed')::int AS new,
            COUNT(*) FILTER (WHERE status IN ('processing'))::int AS processing,
            COUNT(*) FILTER (WHERE status IN ('shipped', 'out_for_delivery'))::int AS in_transit
        FROM orders`);

    res.json({
        orders: listResult.rows,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        summary: summaryResult.rows[0]
    });
}));

adminOrdersRouter.get('/:id/history', asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT h.id, h.order_id AS "orderId", h.old_status AS "oldStatus",
            h.new_status AS "newStatus", h.changed_by AS "changedBy",
            h.remarks, h.changed_at AS "changedAt", u.name AS "changedByName"
        FROM order_status_history h
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.order_id = $1
        ORDER BY h.changed_at ASC`, [req.params.id]);
    if (!result.rowCount) {
        const order = await db.query('SELECT 1 FROM orders WHERE id = $1', [req.params.id]);
        if (!order.rowCount) throw new HttpError(404, 'Order not found');
    }
    res.json(result.rows);
}));

adminOrdersRouter.get('/:id/invoice', asyncHandler(async (req, res) => {
    const order = await fetchOrder(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ invoiceNumber: order.orderNumber ?? order.id, issuedAt: new Date().toISOString(), order });
}));

adminOrdersRouter.get('/:id', asyncHandler(async (req, res) => {
    const order = await fetchOrder(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    const history = await db.query(`
        SELECT h.id, h.old_status AS "oldStatus", h.new_status AS "newStatus",
            h.changed_by AS "changedBy", h.remarks, h.changed_at AS "changedAt", u.name AS "changedByName"
        FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.order_id = $1 ORDER BY h.changed_at ASC`, [req.params.id]);
    res.json({ ...order, history: history.rows });
}));

adminOrdersRouter.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status, remarks } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}`);
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!current.rowCount) throw new HttpError(404, 'Order not found');
        const oldStatus = current.rows[0].status;
        if (oldStatus !== status) {
            await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
            await client.query(`INSERT INTO order_status_history(order_id, old_status, new_status, changed_by, remarks)
                VALUES ($1, $2, $3, $4, $5)`, [req.params.id, oldStatus, status, req.user.id, String(remarks ?? '').trim() || null]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.json(await fetchOrder(req.params.id));
}));

adminOrdersRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!result.rowCount) throw new HttpError(404, 'Order not found');
        const oldStatus = result.rows[0].status;
        if (!['placed', 'processing'].includes(oldStatus)) {
            throw new HttpError(409, 'Only placed or processing orders can be cancelled');
        }
        const items = await client.query('SELECT product_id, quantity, size FROM order_items WHERE order_id = $1', [req.params.id]);
        for (const item of items.rows) {
            if (item.size) {
                const productResult = await client.query('SELECT varients FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
                if (productResult.rows[0]) {
                    const variants = Array.isArray(productResult.rows[0].varients) ? productResult.rows[0].varients : [];
                    const variant = variants.find((entry) => entry.size === item.size);
                    if (variant) {
                        variant.stock = Number(variant.stock) + item.quantity;
                        await client.query('UPDATE products SET varients = $1::jsonb WHERE id = $2', [JSON.stringify(variants), item.product_id]);
                    }
                }
            } else {
                await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
            }
        }
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
        await client.query(`INSERT INTO order_status_history(order_id, old_status, new_status, changed_by, remarks)
            VALUES ($1, $2, 'cancelled', $3, $4)`, [req.params.id, oldStatus, req.user.id, String(req.body?.remarks ?? 'Cancelled by administrator')]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.json(await fetchOrder(req.params.id));
}));