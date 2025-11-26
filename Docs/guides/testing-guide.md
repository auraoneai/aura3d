# G3D Testing Guide

This document provides comprehensive guidance on testing in the G3D 5.0 game engine.

## Table of Contents

- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Coverage Requirements](#coverage-requirements)
- [Benchmarks](#benchmarks)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

## Running Tests

G3D uses [Vitest](https://vitest.dev/) as its testing framework. The following commands are available:

### Basic Commands

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (re-runs on file changes)
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run tests with Vitest UI
pnpm test:ui

# Run benchmarks
pnpm test:bench
```

### Advanced Options

```bash
# Run specific test file
pnpm test src/math/Vector3.test.ts

# Run tests matching a pattern
pnpm test Vector

# Run tests in a specific directory
pnpm test src/tests/unit/

# Run with specific reporter
pnpm test --reporter=verbose

# Run with debugging
pnpm test --inspect-brk
```

## Test Structure

Tests are organized into three main categories:

### 1. Unit Tests (`src/tests/unit/`)

Unit tests verify individual functions and classes in isolation.

**Location**: `src/tests/unit/[module]/`

**Example**:
```
src/tests/unit/
├── math/
│   ├── Vector3.test.ts
│   ├── Matrix4.test.ts
│   └── Quaternion.test.ts
├── ecs/
│   ├── World.test.ts
│   └── Entity.test.ts
└── physics/
    ├── RigidBody.test.ts
    └── CollisionDetection.test.ts
```

### 2. Integration Tests (`src/tests/integration/`)

Integration tests verify that multiple components work together correctly.

**Location**: `src/tests/integration/`

**Example**:
```
src/tests/integration/
├── ecs-physics/
│   └── PhysicsIntegration.test.ts
├── rendering/
│   └── RenderPipeline.test.ts
└── animation/
    └── AnimationSystem.test.ts
```

### 3. End-to-End Tests (`src/tests/e2e/`)

End-to-end tests verify complete workflows and user scenarios.

**Location**: `src/tests/e2e/`

**Example**:
```
src/tests/e2e/
├── CompleteGameLoop.test.ts
├── SceneLoading.test.ts
└── PerformanceTargets.test.ts
```

### 4. Benchmarks (`src/tests/benchmarks/`)

Performance benchmarks measure operation speed and efficiency.

**Location**: `src/tests/benchmarks/`

**Example**:
```
src/tests/benchmarks/
├── math.bench.ts
├── ecs.bench.ts
└── physics.bench.ts
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YourClass } from '../YourClass';

describe('YourClass', () => {
  let instance: YourClass;

  beforeEach(() => {
    // Setup before each test
    instance = new YourClass();
  });

  afterEach(() => {
    // Cleanup after each test
    instance = null;
  });

  it('should do something', () => {
    // Arrange
    const input = 42;

    // Act
    const result = instance.doSomething(input);

    // Assert
    expect(result).toBe(84);
  });
});
```

### Testing Async Code

```typescript
it('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### Testing Errors

```typescript
it('should throw error on invalid input', () => {
  expect(() => {
    someFunction(null);
  }).toThrow('Invalid input');
});
```

### Mocking

```typescript
import { vi } from 'vitest';

it('should call callback', () => {
  const callback = vi.fn();
  const instance = new YourClass(callback);

  instance.doSomething();

  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(expect.any(Number));
});
```

### Snapshot Testing

```typescript
it('should match snapshot', () => {
  const result = generateComplexObject();
  expect(result).toMatchSnapshot();
});
```

## Coverage Requirements

G3D maintains high code coverage standards to ensure quality and reliability.

### Module-Specific Targets

| Module | Line Coverage | Function Coverage | Branch Coverage | Overall Target |
|--------|---------------|-------------------|-----------------|----------------|
| Math | 100% | 100% | 100% | 100% |
| Core | 95% | 95% | 95% | 95% |
| ECS | 95% | 95% | 95% | 95% |
| Rendering | 90% | 90% | 90% | 90% |
| Physics | 90% | 90% | 90% | 90% |
| Animation | 85% | 85% | 85% | 85% |
| Audio | 85% | 85% | 85% | 85% |
| Default | 80% | 80% | 80% | 80% |

### Checking Coverage

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html

# Generate markdown report
pnpm tsx scripts/coverage-report.ts
```

### Coverage Reports

After running tests with coverage, you'll find:

- `coverage/lcov.info` - LCOV format for CI tools
- `coverage/index.html` - Interactive HTML report
- `coverage/coverage-final.json` - JSON format
- `coverage/COVERAGE_REPORT.md` - Markdown summary

## Benchmarks

Performance benchmarks help ensure G3D meets its performance targets.

### Running Benchmarks

```bash
# Run all benchmarks
pnpm test:bench

# Run specific benchmark
pnpm test src/tests/benchmarks/math.bench.ts

# Run with iterations control
pnpm test:bench --iterations=1000
```

### Writing Benchmarks

```typescript
import { bench, describe } from 'vitest';

describe('Performance Benchmarks', () => {
  bench('Vector3 addition (1M ops)', () => {
    const v1 = new Vector3(1, 2, 3);
    const v2 = new Vector3(4, 5, 6);

    for (let i = 0; i < 1_000_000; i++) {
      v1.add(v2);
    }
  });
});
```

### Performance Targets

- **Math Operations**: < 0.001ms per operation
- **Entity Creation**: < 0.01ms per entity
- **Component Add/Remove**: < 0.001ms per operation
- **100K Entity Iteration**: < 1ms
- **Matrix Multiplication**: < 0.001ms
- **Quaternion Slerp**: < 0.001ms

## CI/CD Integration

Tests run automatically on GitHub Actions for all pull requests and commits.

### CI Pipeline

The CI pipeline runs:

1. **Lint**: Code style checks
2. **Type Check**: TypeScript compilation
3. **Tests**: All unit, integration, and e2e tests
4. **Coverage**: Coverage report generation
5. **Build**: Production build verification
6. **Benchmarks**: Performance regression checks (main branch only)

### Workflow Files

- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/release.yml` - Release automation

### Local CI Simulation

You can run CI checks locally before pushing:

```bash
# Run all CI checks
pnpm typecheck && pnpm test:coverage && pnpm build

# Verify test coverage requirements
pnpm tsx scripts/verify-tests.ts
```

## Best Practices

### 1. Test Organization

- **One test file per source file** when possible
- **Group related tests** using `describe` blocks
- **Use descriptive test names** that explain what's being tested

### 2. Test Independence

- **Each test should be independent** - don't rely on test execution order
- **Clean up after tests** - reset state in `afterEach`
- **Use beforeEach for setup** - ensure consistent starting state

### 3. Assertions

- **Be specific** - test exact values, not just truthiness
- **Test edge cases** - null, undefined, empty arrays, boundary values
- **Test error cases** - verify error handling works correctly

### 4. Performance

- **Keep tests fast** - unit tests should run in milliseconds
- **Mock expensive operations** - don't make real network calls
- **Use beforeAll sparingly** - only for truly expensive setup

### 5. Maintainability

- **Avoid test duplication** - extract common setup to helpers
- **Keep tests simple** - complex tests are hard to maintain
- **Update tests with code** - tests should evolve with the codebase

### 6. Coverage Goals

- **Don't chase 100% blindly** - focus on meaningful tests
- **Test behavior, not implementation** - tests should survive refactoring
- **Cover critical paths first** - prioritize important functionality

## Test Helpers and Utilities

G3D provides test utilities in `src/tests/utils/`:

```typescript
import { createMockWorld } from '../utils/MockWorld';
import { expectVector3 } from '../utils/MathHelpers';

it('should create entities', () => {
  const world = createMockWorld();
  const entity = world.createEntity();
  expect(entity).toBeGreaterThan(0);
});

it('should calculate vector correctly', () => {
  const result = someVectorCalculation();
  expectVector3(result).toBeCloseTo(new Vector3(1, 2, 3));
});
```

## Troubleshooting

### Tests Not Running

1. Check that test files match the pattern: `**/*.test.ts` or `**/*.spec.ts`
2. Verify test file is not in excluded paths
3. Run with `--no-coverage` to check if coverage is causing issues

### Flaky Tests

1. Look for timing issues - add proper waits for async operations
2. Check for global state leakage between tests
3. Verify cleanup in `afterEach` hooks

### Coverage Issues

1. Check `vitest.config.ts` for coverage configuration
2. Verify files aren't excluded unintentionally
3. Run `pnpm tsx scripts/verify-tests.ts` to see detailed coverage

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [G3D Contributing Guide](./CONTRIBUTING.md)

## Questions?

If you have questions about testing:

1. Check existing tests for examples
2. Review this guide
3. Ask in GitHub Discussions
4. Open an issue for documentation improvements
