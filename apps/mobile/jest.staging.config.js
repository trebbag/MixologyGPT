const base = require('./jest.config')

module.exports = {
  ...base,
  testMatch: ['<rootDir>/tests/e2e-staging/**/*.test.tsx'],
}
