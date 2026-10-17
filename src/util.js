import crypto from 'node:crypto';
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
let counter = 0;
export function genId(prefix) {
    counter = (counter+1) %1000;
    return `${prefix}${Date.now()}${counter.toString().padStart(3, '0')}`
}
export function round2(n) {
    return Math.round(n * 100)/100;
}
const SCRYPT_KEYLEN = 64; // Length of the derived key
export async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
 return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
    if(!stored || typeof stored !== 'string') return false;

    const [scheme, saltHex, hashHex] = stored.split('$');

    if(scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, expected.length, (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    }); 
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}