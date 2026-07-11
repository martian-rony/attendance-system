import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from backend root (two levels up from src/config)
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Fall back to default resolution
  dotenv.config();
}

// Apply sensible defaults if still missing (so the app can boot in dev).
// In production, secrets MUST be provided via env — we refuse to boot with a
// known default secret rather than silently running insecurely.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = process.env.NODE_ENV === 'production';

process.env.PORT = process.env.PORT || '5000';
process.env.MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system';

// On Render, the public service URL is exposed as RENDER_EXTERNAL_URL. The
// frontend is served by THIS backend (single-service deploy), so the browser's
// origin equals RENDER_EXTERNAL_URL and CORS/Socket.io must allow it.
// Auto-set CLIENT_URL from it, overriding any stale dev value (e.g. a committed
// backend/.env with CLIENT_URL=http://localhost:5173) so the deploy works out
// of the box. Only a non-localhost CLIENT_URL is respected (for custom domains).
if (process.env.RENDER_EXTERNAL_URL) {
  const cur = process.env.CLIENT_URL || '';
  if (!cur || cur.includes('localhost') || cur.includes('127.0.0.1')) {
    process.env.CLIENT_URL = process.env.RENDER_EXTERNAL_URL;
  }
}

// In production a localhost CLIENT_URL is a leftover dev value and must not
// constrain CORS/Socket.io to it. Clear it so the reflect-origin fallback
// (used by single-service deploys) applies. A real custom domain is untouched.
if (
  process.env.NODE_ENV === 'production' &&
  process.env.CLIENT_URL &&
  (process.env.CLIENT_URL.includes('localhost') ||
    process.env.CLIENT_URL.includes('127.0.0.1'))
) {
  delete process.env.CLIENT_URL;
}

const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'QR_CODE_SECRET'];
const devSecretFallbacks = {
  JWT_SECRET: 'dev-only-default-secret-change-in-production',
  JWT_REFRESH_SECRET: 'dev-only-default-refresh-secret-change-in-production',
  QR_CODE_SECRET: 'dev-only-default-qr-secret-change-in-production',
};

for (const key of requiredSecrets) {
  if (!process.env[key]) {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.error(
        `FATAL: ${key} is not set. Refusing to start in production with a default secret.`
      );
      process.exit(1);
    }
    process.env[key] = devSecretFallbacks[key];
  }
}

export {};
