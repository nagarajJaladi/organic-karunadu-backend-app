import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { toUser } from '../mapper.js';
import { createAccessToken, requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, genId } from '../util.js';

export const authRouter = Router();
authRouter.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'email and password are required');
    const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const row = rows[0];
    if (!row) throw new HttpError(401, 'Invalid email or password');

    const isBcryptHash = /^\$2[aby]\$/.test(row.password);
    const passwordMatches = isBcryptHash
        ? await bcrypt.compare(password, row.password)
        : password === row.password;
    if (!passwordMatches) throw new HttpError(401, 'Invalid email or password');
    if (!isBcryptHash) {
        const passwordHash = await bcrypt.hash(password, 12);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, row.id]);
    }

    const user = toUser(row);
    res.json({ ok: true, user, token: createAccessToken(user) });
}));

authRouter.post('/register', asyncHandler(async (req, res) => { 
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) throw new HttpError(400, 'name, email and password are required');
    if (password.length < 8) throw new HttpError(400, 'password must be at least 8 characters');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = { id: genId('u'), name: name.trim(), email: email.trim().toLowerCase(), role: 'customer' };
    try {
        await db.query('INSERT INTO users(id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
            [user.id, user.name, user.email, passwordHash, user.role]);
    } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'An account with this email already exists.');
        throw error;
    }
    res.status(201).json({ ok: true, user, token: createAccessToken(user) });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) throw new HttpError(401, 'User account no longer exists');
    res.json({ user: toUser(rows[0]) });
}));

authRouter.get('/users', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json(rows.map(toUser));
}));
authRouter.get('/users/:id', requireAuth, asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
        throw new HttpError(403, 'You can only view your own account');
    }
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const row = rows[0];
    if(!row) throw new HttpError (404, 'User not found');
    res.json(toUser(row));
}))