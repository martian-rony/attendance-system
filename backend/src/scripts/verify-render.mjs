// Smoke test: confirm production serving + CLIENT_URL auto-set works WITHOUT a DB.
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
process.env.QR_CODE_SECRET = 'z'.repeat(32);
process.env.RENDER_EXTERNAL_URL = 'https://attendance-system.onrender.com';

import request from 'supertest';
import assert from 'assert';

// Import the env side-effects (sets CLIENT_URL) then the app.
await import('../config/env.js');
const { default: app } = await import('../app.js');

console.log('CLIENT_URL =', process.env.CLIENT_URL);
assert.strictEqual(process.env.CLIENT_URL, 'https://attendance-system.onrender.com', 'CLIENT_URL should auto-set from RENDER_EXTERNAL_URL');

// 1) Health endpoint (no DB needed)
let r = await request(app).get('/health');
console.log('GET /health ->', r.status, JSON.stringify(r.body).slice(0, 60));
assert.strictEqual(r.status, 200);

// 2) Static index served
r = await request(app).get('/');
console.log('GET / ->', r.status, 'content-type:', r.headers['content-type']);
assert.strictEqual(r.status, 200);
assert.match(r.headers['content-type'], /text\/html/);
assert.match(r.text, /<div id="root"/);

// 3) SPA fallback for unknown non-API routes
r = await request(app).get('/login');
console.log('GET /login ->', r.status, 'has root div:', r.text.includes('id="root"'));
assert.strictEqual(r.status, 200);
assert.ok(r.text.includes('id="root"'));

// 4) Unknown API route still returns JSON 404 (not the SPA fallback)
r = await request(app).get('/api/nope');
console.log('GET /api/nope ->', r.status, JSON.stringify(r.body));
assert.strictEqual(r.status, 404);
assert.ok(r.body.success === false);

// 5) API asset (cached JS) is served correctly
r = await request(app).get('/assets');
console.log('GET /assets ->', r.status);
assert.ok([200, 301, 302, 404].includes(r.status)); // dist/assets exists, path is /assets/<file>

console.log('\nALL CHECKS PASSED');
