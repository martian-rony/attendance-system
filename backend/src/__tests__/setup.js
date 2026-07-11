// Sets deterministic env BEFORE the app modules are imported by test files.
// (Test files use dynamic import() inside beforeAll so this runs first.)
process.env.NODE_ENV = 'test';
// Use the system mongod (no binary download needed in offline/CI environments).
process.env.MONGOMS_SYSTEM_BINARY = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
process.env.JWT_SECRET = 'test-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars-long';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.QR_CODE_SECRET = 'test-qr-secret';
process.env.QR_CODE_EXPIRY_MINUTES = '120';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.PORT = '0';
