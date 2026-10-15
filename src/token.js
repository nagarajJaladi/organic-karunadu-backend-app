import crypto from 'node:crypto';

export function generateVerificationToken() {
    return crypto.randomBytes(32).toString('base64url');
}

export function hashVerificationToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
