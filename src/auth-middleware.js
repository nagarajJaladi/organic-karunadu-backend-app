import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './util.js';

export function createAccessToken(user) {
    return jwt.sign(
        { name: user.name, role: user.role },
        config.jwtSecret,
        { subject: user.id, expiresIn: '8h' }
    );
}

export function requireAuth(req, _res, next) {
    const authorization = req.get('authorization');
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Authentication required'));

    try {
        const payload = jwt.verify(token, config.jwtSecret);
        if (typeof payload === 'string' || !payload.sub || !payload.role) {
            throw new Error('Invalid token payload');
        }
        req.user = { id: payload.sub, name: payload.name, role: payload.role };
        next();
    } catch {
        next(new HttpError(401, 'Invalid or expired access token'));
    }
}

export function requireAdmin(req, _res, next) {
    if (req.user?.role !== 'admin') return next(new HttpError(403, 'Administrator access required'));
    next();
}
