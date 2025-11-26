# G3D 5.0 ECS Integration Tests

Comprehensive integration tests for the Entity Component System (ECS) architecture in G3D 5.0.

## Overview

This test suite validates the entire ECS implementation including:
- Entity lifecycle management
- Component CRUD operations
- Query system functionality
- System execution and priorities
- Archetype management and transitions
- Event propagation
- Command buffer operations
- Component serialization
- Built-in component integration
- Performance benchmarks

## Test Categories

### 1. Core Functionality Tests (9 tests)

#### Entity Lifecycle
- Entity creation and validation
- Entity destruction
- Bulk entity creation (1000 entities)
- Alive state tracking

#### Component Operations
- Adding components to entities
- Retrieving components
- Modifying component data
- Removing components
- Component upsert (setComponent)

#### Query Functionality
- Single component queries
- Multi-component queries (AND logic)
- Complex queries (all, any, none)
- Query iteration
- Query caching

#### System Execution
- System priority ordering
- Execution order verification
- System lifecycle hooks

#### System Lifecycle
- onInit hook
- onStart hook
- update hook
- onStop hook
- onDestroy hook

#### Archetype Transitions
- Archetype creation on component add
- Archetype transitions when components change
- Component preservation during transitions
- Archetype reuse

#### Event Propagation
- Entity creation events
- Entity destruction events
- Component add events
- Component remove events

#### Command Buffer Operations
- Deferred entity creation
- Deferred component operations
- Command execution timing
- Deferred entity destruction

#### Component Serialization
- Component data serialization
- Component data deserialization
- Data integrity verification

### 2. Component Integration Tests (2 tests)

#### TransformComponent
- Component attachment
- Transform operations (translate, rotate, scale)
- Matrix computations
- Serialization/deserialization
- Hierarchy support

#### TagComponent
- Tag management (add, remove, toggle)
- Tag queries (has, hasAny, hasAll)
- Tag iteration
- Tag count tracking

### 3. World Management Tests (3 tests)

#### World State Management
- Entity creation and cleanup
- World clear operation
- World state reset
- World reusability

#### Fixed Update
- Fixed timestep execution
- Physics system integration
- Fixed delta time verification

#### Late Update
- Late update execution
- Camera system integration
- Execution after regular update

### 4. Performance Benchmarks (4 tests)

#### Entity Creation
- **Target**: 100,000 entities < 1 second
- **Metric**: Time per entity creation

#### Component Add
- **Target**: 100,000 components < 2 seconds
- **Metric**: Time per component addition

#### Query Iteration
- **Target**: 100,000 entities < 100ms
- **Metric**: Time per entity iteration

#### System Update
- **Target**: 100,000 entities < 50ms
- **Metric**: Full system update with component modification

## Running the Tests

### Option 1: Direct Execution
```bash
ts-node src/tests/integration/runECSTests.ts
```

### Option 2: NPM Script
Add to `package.json`:
```json
{
  "scripts": {
    "test:ecs": "ts-node src/tests/integration/runECSTests.ts"
  }
}
```

Then run:
```bash
npm run test:ecs
```

### Option 3: Import and Run
```typescript
import { ECSIntegrationTest } from './tests/integration/ECSIntegrationTest';

const tests = new ECSIntegrationTest();
const results = tests.runAll();
const summary = tests.getSummary();

console.log(`Pass rate: ${summary.passRate}%`);
```

## Test Output

### Successful Run
```
=== ECS Integration Tests ===

--- Core Functionality Tests ---
✓ Entity Lifecycle (2.45ms)
✓ Component Operations (1.87ms)
✓ Query Functionality (3.21ms)
✓ System Execution (1.56ms)
✓ System Lifecycle (1.23ms)
✓ Archetype Transitions (2.34ms)
✓ Event Propagation (1.45ms)
✓ Command Buffer Operations (1.89ms)
✓ Component Serialization (0.98ms)

--- Component Integration Tests ---
✓ TransformComponent Integration (2.15ms)
✓ TagComponent Integration (1.67ms)

--- World Management Tests ---
✓ World State Management (3.45ms)
✓ Fixed Update (1.34ms)
✓ Late Update (1.12ms)

--- Performance Benchmarks ---
Entity Creation: 100000 entities in 245.67ms (0.0025ms per entity)
✓ Benchmark: Entity Creation (247.23ms)
Component Add: 100000 components in 567.89ms (0.0057ms per component)
✓ Benchmark: Component Add (569.45ms)
Query Iteration: 100000 entities in 12.34ms (0.0001ms per entity)
✓ Benchmark: Query Iteration (14.67ms)
System Update: 100k entities in 23.45ms
✓ Benchmark: System Update (25.78ms)

=== Test Summary ===
Total: 18 tests
Passed: 18
Failed: 0
Total Time: 890.12ms

✅ All tests passed!
```

### Failed Run
```
✗ Entity Lifecycle (2.45ms): Assertion failed: Entity should be alive
✗ Query Functionality (3.21ms): Assertion failed: Movement query should match 50 entities

=== Test Summary ===
Total: 18 tests
Passed: 16
Failed: 2
Total Time: 890.12ms

Failed Tests:
  - Entity Lifecycle: Assertion failed: Entity should be alive
  - Query Functionality: Assertion failed: Movement query should match 50 entities

❌ Some tests failed!
```

## Test Coverage

### ECS Core Files Tested
- ✅ `/src/ecs/World.ts` - World management, lifecycle, updates
- ✅ `/src/ecs/Entity.ts` - Entity creation, destruction, validation
- ✅ `/src/ecs/Component.ts` - Component interface, metadata
- ✅ `/src/ecs/ComponentRegistry.ts` - Component registration, lookup
- ✅ `/src/ecs/System.ts` - System lifecycle, execution, priorities
- ✅ `/src/ecs/Query.ts` - Query creation, matching, iteration
- ✅ `/src/ecs/Archetype.ts` - Archetype transitions, storage
- ✅ `/src/ecs/CommandBuffer.ts` - Deferred operations

### Component Files Tested
- ✅ `/src/ecs/components/TransformComponent.ts`
- ✅ `/src/ecs/components/TagComponent.ts`

## Performance Targets

All benchmarks must meet these targets to pass:

| Benchmark | Target | Metric |
|-----------|--------|--------|
| Entity Creation | < 1000ms | 100k entities |
| Component Add | < 2000ms | 100k components |
| Query Iteration | < 100ms | 100k entities |
| System Update | < 50ms | 100k entity updates |

## Extending the Tests

### Adding a New Test

```typescript
private testMyFeature(): void {
  const world = new World();

  // Your test logic here
  this.assert(condition, 'Error message if condition is false');

  world.destroy();
}
```

Then add to `runAll()`:
```typescript
this.runTest('My Feature', () => this.testMyFeature());
```

### Adding a New Component Test

```typescript
private testMyComponent(): void {
  const world = new World();
  const entity = world.createEntity();

  const myComponent = new MyComponent();
  world.addComponent(entity, myComponent);

  this.assert(world.hasComponent(entity, MyComponent), 'Should have component');

  // Test component-specific functionality

  world.destroy();
}
```

### Adding a New Benchmark

```typescript
private benchmarkMyOperation(): void {
  const world = new World();

  // Setup

  const start = performance.now();

  // Operation to benchmark

  const duration = performance.now() - start;

  console.log(`My Operation: ${duration.toFixed(2)}ms`);

  this.assert(duration < TARGET_MS, 'Should complete within target time');

  world.destroy();
}
```

## Known Issues

None currently identified.

## Future Enhancements

- [ ] Stress testing with millions of entities
- [ ] Multi-threaded system execution tests
- [ ] Memory leak detection
- [ ] Component pool reuse verification
- [ ] Query change detection tests
- [ ] System dependency graph validation
- [ ] Hierarchical transform tests
- [ ] Serialization/deserialization of entire worlds

## Contributing

When adding new ECS features, please:
1. Add corresponding integration tests
2. Update this README with new test descriptions
3. Ensure all tests pass before committing
4. Add performance benchmarks for performance-critical features

## License

Copyright (c) 2025 G3D Engine. All rights reserved.
