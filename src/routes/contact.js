import {Router} from 'express';
import {db } from '../db.js';
import {asyncHandler,HttpError} from '../util.js';
import {requireAdmin,requireAuth} from '../auth-middleware.js';

export const contactRouter = Router();
export const adminContactRouter = Router();
adminContactRouter.use(requireAuth, requireAdmin);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['new', 'read', 'archived'];

function toMessage(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        message: row.message,
        status: row.status,
        subject: row.subject,
        createdAt: row.created_at
    };
}

contactRouter.post('/', asyncHandler(async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const message = String(req.body?.message ?? '').trim();
    const subject = String(req.body?.subject ?? '').trim();

    if (!name) throw new HttpError(400, 'Name is required');
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Valid email is required');
    if (!message) throw new HttpError(400, 'Message is required');
    if (!subject) throw new HttpError(400, 'Subject is required');
    const result = await db.query(
        'INSERT INTO contact_messages (name, email, message, subject, status) VALUES ($1, $2, $3, $4, $5)',
        [name, email, message, subject, 'new']
    );
    
    res.json({ok: true, message: 'Thanks for reaching out - we will get back to you soon'});
}));

adminContactRouter.patch('/:id', asyncHandler(async (req, res) => {
    const {status} = req.body || {};
    if(!STATUSES.includes(status)) {
        throw new HttpError(400,   `status must be one of: ${STATUSES.join(', ')}`);
    }
    const result = await db.query(
        'UPDATE contact_messages SET status = $1 WHERE id = $2',
        [status, req.params.id]
    );
    if (result.rowCount === 0) {
        throw new HttpError(404, 'Message not found');
    }
    res.json({ok: true});
}));    
adminContactRouter.get('/', asyncHandler(async (req, res) => {
    const {status} = req.query || {};
    const result = STATUSES.includes(status) ? await db.query('SELECT * FROM contact_messages WHERE status = $1 ORDER BY created_at DESC', 
        [status]
    ): await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json(result.map(toMessage));
}));