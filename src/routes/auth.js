import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db, withTransaction } from '../db.js';
import { toUser } from '../mapper.js';
import { createAccessToken, requireAdmin, requireAuth } from '../auth-middleware.js'; 
import { asyncHandler, HttpError, genId, hashPassword, verifyPassword, generateToken, hashToken } from '../util.js';
import { sendVerificationEmail } from '../email.js'; 
export const authRouter = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueAuthToken(user) {
    return signJwt({sub: user.id, role:user.role, email: user.email},
        config.jwtSecret,   
        config.jwtExpiresInSec
    );
}
const TOKEN_TTL_MINUTES = 30;
async function issueVerificationToken(userId) {
    const token = generateToken();
      const client = await db.connect();
      try {
          await client.query('BEGIN');
          await client.query(
              'INSERT INTO verification_tokens(user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'' + TOKEN_TTL_MINUTES + ' minutes\')',
              [userId, hashToken(token)]
          );
          await client.query('COMMIT');
      } catch (error) {
          await client.query('ROLLBACK');
          throw error;
      } finally {
          client.release();
      }
      return token;
}
let counter = 0;
export function generateId(prefix) {
    counter = (counter + 1) % 1000000;
    return `${prefix}${Date.now()}${counter.toString().padStart(6, '0')}`;
}
export function round2(n) {
    return Math.round(n * 100) / 100;
}
authRouter.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'email and password are required');
    const row = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const user = row.rows[0];
    console.log('login:1');
     console.log(JSON.stringify(user));
    if (!user) throw new HttpError(401, 'Invalid email or password');
  console.log('login:2');
    let ok = false;
    if(user)   {
        console.log('login:3');
        if(user.password_hash) {
            console.log('login:4');
            console.log('password: '+password+' user.password_hash:'+user.password_hash);
            ok = await verifyPassword(password, user.password_hash);
            console.log('ok: '+ok);
            console.log('login:5');
        } else if(user.password) {
            console.log('login:6')
            ok = password === user.password;
            if(ok) {
                console.log('login:7');
                const passwordHash = await hashPassword(password);
                await db.query('UPDATE users SET password_hash = $1, password = $2 WHERE id = $3', [passwordHash, '', user.id]);
                  console.log('login:8');
            }
        }
    }
      console.log('login:9');
    if(!user || !ok) throw new HttpError(401, 'Invalid email or password');
      console.log('login:10');
    if(!user.is_active) throw new HttpError(403, 'Account is not active');
      console.log('login:11');
    if(!user.email_verified) {
          console.log('login:12');
        return res.status(403).json({ ok: false, code: 'EMAIL_NOT_VERIFIED', error: 'Please verify your email. Check your inbox for the verification email.' });
    }
    res.json({ ok: true,user: toUser(user) , token: issueAuthToken(user) });
}));

authRouter.post('/register', asyncHandler(async (req, res) => { 
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) throw new HttpError(400, 'name, email and password are required');
    
    if (password.length < 8) throw new HttpError(400, 'password must be at least 8 characters');
    if(typeof name!=='string' || typeof email!=='string' || typeof password!=='string') throw new HttpError(400, 'name, email and password must be strings');
    if(!EMAIL_RE.test(email)) throw new HttpError(400, 'email is not valid');
    if(password.length < 6) throw new HttpError(400, 'password must be at least 6 characters');
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [normalizedEmail]);
    if (existingUser.rows.length > 0) throw new HttpError(409, 'An account with this email already exists.');

    const id = generateId('u');
    const passwordHash = await hashPassword(password);
    const token = await withTransaction(async (client) => {
        await client.query(
            'INSERT INTO users(id, name, email, password_hash, role,email_verified,is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id, name.trim(), normalizedEmail, passwordHash, 'customer', false, true]
        );
        const token = generateToken();
        await client.query(
            'INSERT INTO email_verification_tokens(user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'' + TOKEN_TTL_MINUTES + ' minutes\')',
            [id, hashToken(token)]
        );
        return token;
    });
     console.log('token generated for sending email:1');
    try {
             await sendVerificationEmail(normalizedEmail, token);
        } catch (error) {
            console.error('Failed to send verification email:', error);
        }
    res.status(201).json({ ok: true ,pendingVerification: true , message:'Account created. Please check your email to verify your address'});
}));
authRouter.post('/verify-email', asyncHandler(async (req, res) => {
    const {token} = req.body || {};
    if (!token) throw new HttpError(400, 'token is required');

    const hashedToken = hashToken(token);
    const user = await withTransaction(async (client) => {
        const row  = await client.one(
            'SELECT * FROM email_verification_tokens WHERE token = $1 AND expires_at > NOW()',
            [hashedToken]
        );
        if(!row) throw new HttpError(400, 'Invalid or expired token');
        if(row.used_at) throw new HttpError(400, 'Token has already been used');
        if(new Date(row.expires_at) < new Date()) throw new HttpError(400, 'Invalid or expired token');
        await client.query(
            'UPDATE email_verification_tokens SET used_at = NOW() WHERE token = $1',
            [hashedToken]
        );
        await client.query(
            'UPDATE users SET email_verified = true WHERE id = $1',
            [row.user_id]
        );
        return client.query(`SELECT * FROM users WHERE id = $1`, [row.user_id]);
    });
    const userRows = user.rows;
    if (!userRows[0]) throw new HttpError(404, 'User not found');
    res.json({ ok: true, message: 'Email successfully verified', token: issueAuthToken(userRows[0]), user: toUser(userRows[0]) });
}));
authRouter.post('/resend-verification', asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = (email || '').trim().toLowerCase();
    const generic = {
        ok:true,
        message:'If an unverified account exists for that email, a new verification link has been sent.'
    };
    if(!normalizedEmail) {
        return res.json(generic);
    }
    const user = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (!user.rows[0] || user.rows[0].email_verified) {
        return res.json(generic);
    }
    await db.query(
        'UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at is NULL',
        [user.rows[0].id]
    );
    // Generate a new verification token and send it via email
    const token = issueVerificationToken(user.rows[0].id);
    const hashedToken = hashToken(token);
   try { 
    await sendVerificationEmail(user.rows[0].email, token);
   } catch (err) {  
    console.warn('Failed to send verification email', err);
   }
   return res.json(generic);

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