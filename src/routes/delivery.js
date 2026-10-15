import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError } from '../util.js';

export const deliveryRouter = Router();
export const adminDeliveryRouter = Router();
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

function validatePincode(value) {
    const pincode = String(value ?? '').trim();
    if (!PINCODE_PATTERN.test(pincode)) throw new HttpError(400, 'Please enter a valid 6-digit PIN code.');
    return pincode;
}

export async function assertServiceablePincode(pincode, client = db) {
    const normalized = validatePincode(pincode);
    const { rows } = await client.query(
        `SELECT pincode, city, state, delivery_charge, min_order_amount
         FROM serviceable_pincodes WHERE pincode = $1 AND is_active = TRUE`,
        [normalized]);
    if (!rows[0]) throw new HttpError(422, 'Delivery is not available to this PIN code.');
    return rows[0];
}

deliveryRouter.get('/check/:pincode', asyncHandler(async (req, res) => {
    const pincode = validatePincode(req.params.pincode);
    const { rows } = await db.query(
        `SELECT pincode, city, state, delivery_charge AS "deliveryCharge", min_order_amount AS "minOrderAmount"
         FROM serviceable_pincodes WHERE pincode = $1 AND is_active = TRUE`,
        [pincode]);
    if (!rows[0]) {
        return res.json({ success: true, available: false, message: 'Sorry, delivery is not available to this PIN code.' });
    }
    res.json({ success: true, available: true, message: 'Delivery is available!', location: rows[0] });
}));

adminDeliveryRouter.use(requireAuth, requireAdmin);
adminDeliveryRouter.get('/pincodes', asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const values = [];
    let where = '';
    if (search) {
        values.push(`%${search}%`);
        where = `WHERE pincode ILIKE $1 OR COALESCE(city, '') ILIKE $1 OR COALESCE(state, '') ILIKE $1`;
    }
    const { rows } = await db.query(`
        SELECT id, pincode, city, state, is_active AS "isActive",
            delivery_charge AS "deliveryCharge", min_order_amount AS "minOrderAmount", created_at AS "createdAt"
        FROM serviceable_pincodes ${where} ORDER BY pincode`, values);
    res.json(rows);
}));

adminDeliveryRouter.post('/pincodes', asyncHandler(async (req, res) => {
    const pincode = validatePincode(req.body?.pincode);
    const city = String(req.body?.city ?? '').trim();
    const state = String(req.body?.state ?? '').trim();
    const deliveryCharge = Number(req.body?.deliveryCharge ?? 0);
    const minOrderAmount = Number(req.body?.minOrderAmount ?? 0);
    if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0 || !Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
        throw new HttpError(400, 'Delivery charge and minimum order amount must be non-negative numbers.');
    }
    try {
        const { rows } = await db.query(`
            INSERT INTO serviceable_pincodes (pincode, city, state, is_active, delivery_charge, min_order_amount)
            VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), TRUE, $4, $5)
            RETURNING id, pincode, city, state, is_active AS "isActive",
                delivery_charge AS "deliveryCharge", min_order_amount AS "minOrderAmount", created_at AS "createdAt"`,
        [pincode, city, state, deliveryCharge, minOrderAmount]);
        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'This PIN code already exists.');
        throw error;
    }
}));

adminDeliveryRouter.patch('/pincodes/:pincode', asyncHandler(async (req, res) => {
    const pincode = validatePincode(req.params.pincode);
    if (typeof req.body?.isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false.');
    const { rows } = await db.query(`
        UPDATE serviceable_pincodes SET is_active = $1 WHERE pincode = $2
        RETURNING id, pincode, city, state, is_active AS "isActive",
            delivery_charge AS "deliveryCharge", min_order_amount AS "minOrderAmount", created_at AS "createdAt"`,
    [req.body.isActive, pincode]);
    if (!rows[0]) throw new HttpError(404, 'PIN code not found.');
    res.json(rows[0]);
}));
