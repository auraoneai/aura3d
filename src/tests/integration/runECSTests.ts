/**
 * Test Runner for ECS Integration Tests
 *
 * Simple test runner that executes all ECS integration tests
 * and reports results to the console.
 *
 * Usage:
 *   npm run test:ecs
 *   or
 *   ts-node src/tests/integration/runECSTests.ts
 *
 * @module tests/integration/runECSTests
 */

import { ECSIntegrationTest } from './ECSIntegrationTest';

/**
 * Main test runner function
 */
function runTests(): void {
  console.clear();
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  G3D 5.0 ECS Integration Test Suite    │');
  console.log('└─────────────────────────────────────────┘');

  const tests = new ECSIntegrationTest();
  const results = tests.runAll();

  const summary = tests.getSummary();

  // Print final results
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│           Final Results                 │');
  console.log('└─────────────────────────────────────────┘');
  console.log(`  Total Tests:    ${summary.total}`);
  console.log(`  Passed:         ${summary.passed} ✓`);
  console.log(`  Failed:         ${summary.failed} ${summary.failed > 0 ? '✗' : ''}`);
  console.log(`  Pass Rate:      ${summary.passRate.toFixed(1)}%`);
  console.log(`  Total Duration: ${summary.totalDuration.toFixed(2)}ms`);
  console.log('');

  // Exit with appropriate code
  if (summary.failed > 0) {
    console.error('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests();
