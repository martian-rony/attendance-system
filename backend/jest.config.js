// Jest config (backend). Uses Node test environment.
// Tests boot the app against an in-memory MongoDB (see src/__tests__/setup.js),
// so no external database is required — safe for CI.
export default {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.js'],
  setupFiles: ['<rootDir>/src/__tests__/setup.js'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**', '!src/scripts/**'],
  coveragePathIgnorePatterns: ['/node_modules/'],
};
