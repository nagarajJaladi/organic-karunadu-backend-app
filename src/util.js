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
// Explicitly define parameters so they remain consistent across environments
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 }; 

// 1. Corrected Hash Function
export async function hashPassword(password) {
  // Keep the salt as a raw Buffer first
  const saltBuffer = crypto.randomBytes(16); 
  
  const derivedKey = await new Promise((resolve, reject) => {
    // Pass the raw Buffer to scrypt
    crypto.scrypt(password, saltBuffer, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  // Convert both buffers to hex strings for storage
  return `scrypt$${saltBuffer.toString('hex')}$${derivedKey.toString('hex')}`;
}

// 2. Corrected Verify Function
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;

  const [scheme, saltHex, hashHex] = stored.split('\$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  // Convert hex back to raw Buffers
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  if (expected.length === 0) return false;

  try {
    const derived = await new Promise((resolve, reject) => {
      // Pass the raw salt Buffer and explicit options
      crypto.scrypt(password, salt, expected.length, SCRYPT_OPTIONS, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch (err) {
    return false; 
  }
}
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}