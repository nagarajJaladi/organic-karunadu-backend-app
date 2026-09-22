import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {

    port: Number(process.env.PORT) || 3000,
    dbFile: (process.env.DB_FILE) || path.join(ROOT_DIR, 'data', 'ecom.db'),
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200, http://127.0.0.1:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
};