/**
 * Vitest Configuration for G3D 5.0
 *
 * Complete test runner configuration with TypeScript support, coverage reporting,
 * multiple test suites, performance benchmarks, and snapshot testing.
 *
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment - jsdom for DOM tests, can be overridden per file
    environment: 'jsdom',

    // Global test setup file
    setupFiles: ['./src/tests/setup.ts'],

    // Enable global test APIs (describe, it, expect, etc.)
    globals: true,

    // Coverage configuration using istanbul
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/tests/**',
        'src/**/__tests__/**',
        'node_modules/**',
        'dist/**',
        'src/index.ts',
        'src/**/index.ts',
        'src/types/**'
      ],
      all: true,
      clean: true,
      // Coverage thresholds
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      },
      // Watermarks for coverage display
      watermarks: {
        statements: [70, 90],
        functions: [70, 90],
        branches: [70, 90],
        lines: [70, 90]
      }
    },

    // Test file patterns
    include: [
      'src/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts'
    ],

    // Test exclusion patterns
    exclude: [
      'node_modules/**',
      'dist/**',
      '.{idea,git,cache,output,temp}/**',
      '{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],

    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporters - verbose for detailed output, html for reports
    reporters: ['verbose', 'html'],

    // Reporter options
    outputFile: {
      html: './test-reports/index.html',
      json: './test-reports/results.json'
    },

    // Test isolation - each test file runs in isolation
    isolate: true,

    // Threading configuration
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Pool configuration for test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true
      }
    },

    // Watch mode configuration
    watch: false,
    watchExclude: ['**/node_modules/**', '**/dist/**'],

    // Snapshot configuration
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath.replace(/\.test\.ts$/, snapExtension);
    },

    // Mock configuration
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,

    // Retry configuration for flaky tests
    retry: 0,

    // Bail on first failure
    bail: 0,

    // Silent mode
    silent: false,

    // Hide skipped tests in output
    hideSkippedTests: false,

    // API configuration for programmatic usage
    api: {
      port: 51204,
      strictPort: false
    },

    // Benchmark configuration
    benchmark: {
      outputFile: './test-reports/benchmarks.json',
      reporters: ['verbose', 'json']
    },

    // Type checking
    typecheck: {
      enabled: false,
      checker: 'tsc',
      include: ['**/*.{test,spec}-d.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    },

    // Sequence configuration
    sequence: {
      shuffle: false,
      concurrent: false,
      seed: Date.now()
    },

    // CSS handling
    css: false,

    // Global setup/teardown
    globalSetup: [],
    globalTeardown: []
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './src/tests')
    },
    extensions: ['.ts', '.js', '.json']
  },

  // Define constants for tests
  define: {
    __TEST__: true,
    __DEV__: true
  },

  // Optimize dependencies
  optimizeDeps: {
    include: []
  },

  // Build options
  build: {
    target: 'esnext'
  }
});
