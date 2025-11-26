# G3D 5.0 Test Suite

Comprehensive test suite for the G3D game engine, covering unit tests, integration tests, and end-to-end scenarios.

## Directory Structure

```
src/tests/
├── e2e/                    # End-to-end integration tests
│   ├── CompleteGameLoop.test.ts  # Complete game loop scenarios
│   └── index.ts            # Test suite exports
├── utils/                  # Test utilities and helpers
│   ├── MockCanvas.ts       # Mock canvas for headless testing
│   ├── TestHelpers.ts      # Common test helper functions
│   └── index.ts            # Utility exports
└── README.md              # This file
```

## Running Tests

### Run All Tests
```bash
pnpm test
```

### Run E2E Tests Only
```bash
pnpm test src/tests/e2e
```

### Run Tests in Watch Mode
```bash
pnpm test:watch
```

### Generate Coverage Report
```bash
pnpm test:coverage
```

## Test Suites

### End-to-End Tests (E2E)

#### Complete Game Loop (`CompleteGameLoop.test.ts`)

Tests comprehensive game scenarios with multiple systems working together:

1. **Complete Game Loop Test**
   - Engine initialization
   - Entity creation (player, ground, camera, light)
   - System registration (physics, rendering)
   - Physics simulation with gravity
   - Collision detection
   - Frame updates

2. **Cross-System Communication Test**
   - Input → Physics integration
   - Force application from input
   - Entity movement verification

3. **Resource Management Test**
   - Mass entity creation (1000 entities)
   - Partial destruction (500 entities)
   - Memory and performance tracking
   - Entity cleanup verification

4. **Multi-System Stress Test**
   - 500 dynamic physics entities
   - Multiple systems running concurrently
   - Performance benchmarking
   - Frame time measurements

5. **Pause and Resume Test**
   - Engine state transitions
   - Simulation continuity
   - Time management

6. **System Lifecycle Test**
   - System initialization
   - Start/stop callbacks
   - Update execution
   - Destruction cleanup

7. **Deferred Operations Test**
   - Entity creation during iteration
   - Entity destruction during iteration
   - Command buffer execution

8. **Hierarchical Transforms Test**
   - Parent-child relationships
   - World space calculations
   - Transform propagation

9. **Performance Metrics Test**
   - FPS tracking
   - Frame time measurement
   - Entity/system counting

### World Management Tests

Tests focused on ECS world operations:

1. **Entity Lifecycle**
   - Creation and destruction
   - Bulk operations (1000+ entities)
   - Memory cleanup

2. **Component Management**
   - Addition and removal
   - Type checking
   - Component access

3. **Entity Identity**
   - ID persistence
   - Alive status tracking
   - Destruction verification

4. **World Clear**
   - Mass entity removal
   - State reset
   - Time/frame counter reset

## Test Utilities

### MockCanvas

Provides headless testing without real DOM:

```typescript
import { createMockCanvas } from './utils/MockCanvas';

const canvas = createMockCanvas(800, 600);
const engine = Engine.create({ canvas: canvas as any });
```

Features:
- Mock WebGL rendering context
- Mock 2D rendering context
- Event handling simulation
- Minimal memory footprint

### TestHelpers

Common testing utilities:

```typescript
import { createTestEngine, measurePerformance, runEngineFrames } from './utils/TestHelpers';

// Create test engine
const engine = await createTestEngine({ targetFPS: 30 });

// Measure performance
const result = measurePerformance(() => {
  world.createEntity();
}, 10000);

// Run simulation
runEngineFrames(engine, 60);
```

Available helpers:
- `createTestEngine()` - Configured test engine
- `createTestWorld()` - Configured test world
- `measurePerformance()` - Benchmark functions
- `runEngineFrames()` - Simulate frame updates
- `runWorldForTime()` - Time-based simulation
- `waitFor()` - Async delays
- `waitForCondition()` - Conditional waiting
- `createTestSystem()` - Mock systems
- `randomVector3()` - Random vectors
- `randomQuaternion()` - Random rotations
- `approximatelyEqual()` - Float comparison
- `vectorsApproximatelyEqual()` - Vector comparison
- `captureConsole()` - Console output capture
- `expectThrows()` - Exception testing
- `snapshotWorld()` - State snapshots
- `getMemoryUsage()` - Memory tracking
- `TestFixture` - Test fixture class
- `createEntitiesBatch()` - Batch entity creation

## Writing New Tests

### E2E Test Template

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../core/Engine';
import { createMockCanvas } from '../utils/MockCanvas';

describe('E2E: My Feature', () => {
  let engine: Engine | null = null;

  afterEach(() => {
    if (engine) {
      engine.destroy();
      engine = null;
    }
  });

  it('should test my feature', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Your test code here

    expect(/* your assertions */);
  });
});
```

### Performance Test Template

```typescript
import { measurePerformance, createTestWorld } from '../utils/TestHelpers';

it('should perform operation efficiently', () => {
  const world = createTestWorld();

  const result = measurePerformance(() => {
    // Operation to benchmark
    world.createEntity();
  }, 10000);

  // Assert performance targets
  expect(result.averageTime).toBeLessThan(0.01); // < 0.01ms per op
  expect(result.opsPerSecond).toBeGreaterThan(100000); // > 100k ops/sec

  world.destroy();
});
```

## Performance Targets

The test suite validates these performance targets:

- **Entity Creation**: < 0.01ms per entity
- **Component Operations**: < 0.001ms per operation
- **Frame Time (500 entities)**: < 30ms per frame
- **System Update Overhead**: < 0.1ms
- **Query Performance**: < 1ms for 100k entities

## Coverage Goals

- **Line Coverage**: > 70%
- **Function Coverage**: > 70%
- **Branch Coverage**: > 70%
- **Statement Coverage**: > 70%

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Release branches

## Debugging Tests

### Run Single Test File
```bash
pnpm test src/tests/e2e/CompleteGameLoop.test.ts
```

### Run Single Test Case
```bash
pnpm test -t "should initialize engine"
```

### Debug Mode
```bash
pnpm test --inspect-brk
```

### Verbose Output
```bash
pnpm test --reporter=verbose
```

## Test Data

Mock components and systems are defined in test files to avoid dependencies on actual rendering/physics implementations during engine development.

## Best Practices

1. **Cleanup**: Always destroy engines/worlds in `afterEach`
2. **Isolation**: Each test should be independent
3. **Performance**: Keep tests fast (< 1s each)
4. **Assertions**: Use specific assertions with clear messages
5. **Mock Objects**: Use provided mocks for external dependencies
6. **Documentation**: Document complex test scenarios

## Common Issues

### Test Timeout
If tests timeout, increase the timeout in vitest.config.ts or individual tests:

```typescript
it('long running test', async () => {
  // Test code
}, { timeout: 30000 }); // 30 second timeout
```

### Memory Leaks
Always ensure cleanup in afterEach:

```typescript
afterEach(() => {
  engine?.destroy();
  world?.destroy();
});
```

### Flaky Tests
Use `waitForCondition` for async operations:

```typescript
await waitForCondition(() => entity.position.y < 1, 1000);
```

## Contributing

When adding new features to G3D:

1. Write E2E tests for integration scenarios
2. Write unit tests for individual components
3. Ensure all tests pass
4. Maintain coverage targets
5. Update this README if adding new test utilities

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [G3D Architecture Guide](../../Docs/architecture.md)
- [ECS Design Patterns](../../Docs/ecs-patterns.md)
