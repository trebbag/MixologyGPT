module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/e2e/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo(nent)?|expo-.*|@expo(nent)?/.*|@unimodules|unimodules|sentry-expo|native-base)/)',
  ],
}
