import { Router } from "express";
import { db } from "../db.js";
import { toOrder, toOrderItem } from "../mapper.js";
import { asyncHandler, HttpError, round2 } from "../util.js";

export const orderRouter = Router();

const FREE_SHIPPING_THRESHOLD = 100;
const SHIPPING_FEE = 9.99;
const COUPONS = [
    {code: 'SAVE10',percentOff:10},
    {code:'WELCOME20', percentOff:20}
];
const STATUSES = ['pending', 'paid','shipped','delivered', 'cancelled'];
function findCoupon(code) {
    if(!code) return undefined;
    return COUPONS.find((c) => c.code.toLocaleLowerCase() === String(code).trim().toLocaleLowerCase());
}

function computeTotals (items, couponCode) {
    const subtotal = items.reduce((sum,i) => {
        const price = i.product ? i.product.price : i.price;
        return sum + Number(price) * Number (i.quantity);
    }, 0);

    const coupon = findCoupon(couponCode);
    const discount = coupon ? (subtotal * coupon.percentOff)/ 100 : 0;
    const shipping = subtotal - discount >= FREE_SHIPPING_THRESHOLD || subtotal == 0 ? 0 : SHIPPING_FEE;
    const total = Math.max(0, subtotal - discount) + shipping;
    return {
        subtotal: round2(subtotal),
        discount: round2(discount),
        shipping: round2(shipping),
        total: round2(total) ,
        couponValid: !!coupon
    };
}
function loadOder(id) {
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if(!row) return null;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id =?').all(id);
    return toOrder(row, items);
}

orderRouter.post('/validate-coupon', asyncHandler((req, res) => {
    const {code, items = []} = req.body || {};
    const coupon = findCoupon(code);
    const totals = computeTotals(items, code);
    res.json({valid:!!coupon, coupon:coupon ?? null, totals});
}));

orderRouter.get('/',asyncHandler((req, res)=> {
    const {userId}=req.query;
    const rows = userId ?
        db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId)
        : db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
        res.json(rows.map((r) => loadOder(r.id)));
}))
orderRouter.get('/:id',asyncHandler((req, res) => {
    const order = loadOrder(req.params.id);
    if(!order) throw new HttpError(404, 'Order not found');
    res.json(order);
}));
orderRouter.post('/', asyncHandler((req, res)=> {
    const {userId, items, address, couponCode} = req.body || {};
    if(!userId) throw new HttpError(400, 'userId is required');
    if(!Array.isArray(items) || items.length ===0 ) throw new HttpError(400, 'items must be non-empty array');
    if(!address) throw new HttpError (400, 'Address is required');

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if(!user) throw new HttpError(404, "User not found");

    const totals = computeTotals(items, couponCode);
    const id = `ORD-${Date.now()}`;
    const createdAt = new Date().toISOString();

    const normalizedItems = items.map ((i) => ({
        productId: i.product ? i.product.id : i.productId,
        name:i.product ? i.product.name : i.name,
        price: Number(i.product ? i.product.price : i.price),
        quantity: Number(i.quantity)
    }));
    const tx = db.transaction(() => {
        db.prepare(`INSERT INTO orders (id, user_id, subtotal, discount, shipping, total, coupon_code, status,addr_full_name,
            addr_line1, addr_city, addr_postal_code, addr_country, addr_phone, created_at) VALUES 
            (@id, @userId, @subtotal, @discount, @shipping, @total, @couponCode, @status, @fullName, @line1, @city, @postalCode, @country,
            @phone, @createdAt))`).run({
                id, userId,
                subtotal: totals.subtotal, 
                discount:totals.discount, 
                shipping: totals.shipping,
                total: totals.total,
                couponCode: totals.couponValid ? couponCode : null,
                status: 'paid',
                fullName: address.fullName?? '', line1 : address.line1 ?? '', 
                city: address.city ?? '',
                postalCode: address.postalCode ?? '',
                country: address.country ?? '',
                phone : address.phone ?? '',
                createdAt
            });

            const insertItem = db.prepare(
                'INSERT INTO order_items (order_id, product_id, name, price, quantity) VA'
            );
            const decStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
            for(const it of normalizedItems) {
                insertItem.run (id, it.productId, it.name. it.price, it.quantity);
                decStock.run(it.quantity, it.productId);
            }
    });
    tx();
    res.status(201).json(loadOder(id));
}));
orderRouter.patch('/:id/status', asyncHandler ((req, res)=> {
    const {status} = req.body || {};
    if(!STATUSES.includes(status)) {

        throw new HttpError(400,   `status must be one of: ${STATUSES.join(', ')}`);
    }
    const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    if(info.changes === 0) throw new HttpError(404, 'Order not found');
    res.json(loadOder(req.params.id));

}));



























