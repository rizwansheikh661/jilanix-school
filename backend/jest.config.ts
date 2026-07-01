import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    'apps/**/*.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  moduleNameMapper: {
    '^@apps/(.*)$': '<rootDir>/apps/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@infra/(.*)$': '<rootDir>/src/infra/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15_000,
};

export default config;
