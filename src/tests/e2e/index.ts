/**
 * E2E Test Suite Runner
 *
 * Entry point for running all end-to-end integration tests.
 * Exports test utilities and test suites.
 *
 * @module tests/e2e
 */

// Export all E2E tests
export * from './CompleteGameLoop.test';

// Export test utilities
export { createMockCanvas, assert } from '../utils/MockCanvas';
export * from '../utils/TestHelpers';

/**
 * Test suite metadata
 */
export const E2E_TEST_SUITES = {
  completeGameLoop: {
    name: 'Complete Game Loop',
    description: 'Tests engine lifecycle, entity management, and system updates',
    file: 'CompleteGameLoop.test.ts'
  }
} as const;

/**
 * Run all E2E tests
 *
 * @example
 * ```bash
 * pnpm test src/tests/e2e
 * ```
 */
