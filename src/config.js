import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');

import 'dotenv/config';

export const config = {

    port: Number(process.env.PORT) || 3000,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/organickarunadu',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200, http://127.0.0.1:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
};