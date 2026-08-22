module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/setup.js'],
  moduleNameMapper: {
    '^https://(.*)$': '<rootDir>/tests/__mocks__/firebase-mock.js',
    '^(.*)\\?v=\\d+$': '$1'
  }
};
