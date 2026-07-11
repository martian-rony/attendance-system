// Test runner: boots the API server (NODE_ENV=test) against the local MongoDB,
// runs the smoke + attendance integration scripts, then tears down.
// Usage: node src/scripts/test-runner.js   (MongoDB must be running)
import { spawn } from 'child_process';
import http from 'http';

const waitForHealth = (port, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error('server did not become healthy'));
      setTimeout(tick, 300);
    };
    tick();
  });

const run = (cmd, args, env = {}) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', ...env },
    });
    p.on('exit', (code) => resolve(code ?? 1));
  });

const PORT = process.env.PORT || 5055;
const BASE_URL = `http://localhost:${PORT}`;

const main = async () => {
  const server = spawn('node', ['src/server.js'], {
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT) },
  });

  let smokeCode = 1,
    intgCode = 1;
  try {
    await waitForHealth(PORT);
    console.log('=== server healthy ===');
    console.log('=== smoke test ===');
    smokeCode = await run('node', ['src/scripts/smoke.js'], { BASE_URL });
    console.log('=== attendance integration test ===');
    intgCode = await run('node', ['src/scripts/integration-attendance.js'], { BASE_URL });
  } catch (e) {
    console.error('runner error:', e.message);
  } finally {
    server.kill();
  }

  const ok = smokeCode === 0 && intgCode === 0;
  console.log(
    `\n=== npm test: ${ok ? 'PASS' : 'FAIL'} (smoke=${smokeCode}, integration=${intgCode}) ===`
  );
  process.exit(ok ? 0 : 1);
};

main();
