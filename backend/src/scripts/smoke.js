// Runtime smoke test — hits a running server (does not boot it).
// Usage: node scripts/smoke.js  (server must be running on PORT 5000)
const BASE = process.env.BASE_URL || 'http://localhost:5000';

const log = (...a) => console.log(...a);
let failures = 0;

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// expect: exact status, a set like [200,201], or '2xx' for any 2xx
function isExpected(status, expect) {
  if (expect === undefined) return status >= 200 && status < 300;
  if (expect === '2xx') return status >= 200 && status < 300;
  if (Array.isArray(expect)) return expect.includes(status);
  return status === expect;
}

async function check(name, fn, expect) {
  try {
    const { status, json } = await fn();
    const ok = isExpected(status, expect);
    log(`${ok ? 'PASS' : 'FAIL'}  ${status}  ${name}`);
    if (!ok) {
      failures++;
      log('   body:', JSON.stringify(json).slice(0, 300));
    }
    return json;
  } catch (e) {
    log(`FAIL  ERR  ${name} -> ${e.message}`);
    failures++;
    return null;
  }
}

(async () => {
  log(`\n=== Backend smoke test against ${BASE} ===\n`);

  await check('GET /health (no auth) -> 200', () => call('GET', '/health'), 200);
  await check(
    'POST /api/auth/login (empty body) -> 400',
    () => call('POST', '/api/auth/login', { body: {} }),
    400
  );
  await check('GET /api/courses (no auth) -> 401', () => call('GET', '/api/courses'), 401);

  const login = await check(
    'POST /api/auth/login (admin) -> 200',
    () =>
      call('POST', '/api/auth/login', {
        body: { email: 'admin@college.edu', password: 'Admin@1234' },
      }),
    200
  );

  const token = login?.data?.tokens?.accessToken;
  if (!token) {
    log('   (no token received — aborting authenticated checks)');
  } else {
    await check(
      'GET /api/users (admin token) -> 200',
      () => call('GET', '/api/users', { token }),
      200
    );
    await check(
      'GET /api/courses (admin token) -> 200',
      () => call('GET', '/api/courses', { token }),
      200
    );
    await check(
      'GET /api/users/faculty (admin token) -> 200',
      () => call('GET', '/api/users/faculty', { token }),
      200
    );
    await check(
      'GET /api/users/students (admin token) -> 200',
      () => call('GET', '/api/users/students', { token }),
      200
    );
    await check(
      'GET /api/courses (bad token) -> 401',
      () => call('GET', '/api/courses', { token: 'not.a.real.token' }),
      401
    );

    // RBAC: a student token must be denied admin-only routes (403)
    const stuLogin = await check(
      'POST /api/auth/login (student) -> 200',
      () =>
        call('POST', '/api/auth/login', {
          body: { email: 'student1@college.edu', password: 'Student@123' },
        }),
      200
    );
    const stuToken = stuLogin?.data?.tokens?.accessToken;
    if (stuToken) {
      await check(
        'GET /api/users (student token) -> 403',
        () => call('GET', '/api/users', { token: stuToken }),
        403
      );
    } else {
      log('   (no student token — skipping RBAC check)');
    }
  }

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===\n`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
