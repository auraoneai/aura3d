# ECS Integration Tests - Quick Reference

## Test API Overview

### Running Tests

```typescript
import { ECSIntegrationTest } from './tests/integration/ECSIntegrationTest';

const tests = new ECSIntegrationTest();
const results = tests.runAll();
```

### Test Results API

```typescript
// Get all test results
const results = tests.getResults();
// Returns: TestResult[]

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

// Get summary statistics
const summary = tests.getSummary();
// Returns: {
//   total: number;
//   passed: number;
//   failed: number;
//   passRate: number;
//   totalDuration: number;
// }
```

## Test Categories

### Core Functionality (9 tests)
1. ✅ Entity Lifecycle
2. ✅ Component Operations
3. ✅ Query Functionality
4. ✅ System Execution
5. ✅ System Lifecycle
6. ✅ Archetype Transitions
7. ✅ Event Propagation
8. ✅ Command Buffer Operations
9. ✅ Component Serialization

### Component Integration (2 tests)
10. ✅ TransformComponent Integration
11. ✅ TagComponent Integration

### World Management (3 tests)
12. ✅ World State Management
13. ✅ Fixed Update
14. ✅ Late Update

### Performance Benchmarks (4 tests)
15. ✅ Entity Creation (100k entities < 1s)
16. ✅ Component Add (100k components < 2s)
17. ✅ Query Iteration (100k entities < 100ms)
18. ✅ System Update (100k entities < 50ms)

## ECS API Usage Examples (from tests)

### Entity Management

```typescript
// Create entity
const entity = world.createEntity();

// Check if alive
const isAlive = world.isAlive(entity);

// Destroy entity
world.destroyEntity(entity);

// Entity count
const count = world.entityCount;
```

### Component Operations

```typescript
// Add component
world.addComponent(entity, new PositionComponent(10, 20, 30));

// Check for component
const hasPos = world.hasComponent(entity, PositionComponent);

// Get component
const pos = world.getComponent(entity, PositionComponent);

// Modify component
pos.x = 100;

// Remove component
world.removeComponent(entity, PositionComponent);

// Set/update component (upsert)
world.setComponent(entity, new PositionComponent(50, 60, 70));
```

### Query System

```typescript
// Single component query
const query1 = world.getQuery({ all: [Position] });

// Multi-component query (AND)
const query2 = world.getQuery({ all: [Position, Velocity] });

// Complex query
const query3 = world.getQuery({
  all: [Position],          // Must have Position
  any: [Velocity, Health],  // Must have Velocity OR Health
  none: [Disabled]          // Must NOT have Disabled
});

// Get entity count
const count = query.entityCount;

// Iterate query
query.forEach((entity, components) => {
  const pos = components[0] as PositionComponent;
  const vel = components[1] as VelocityComponent;
  // Process entity...
});

// Query caching (returns same instance for identical descriptors)
const cached = world.getQuery({ all: [Position, Velocity] });
console.log(cached === query2); // true
```

### System Creation

```typescript
class MovementSystem extends System {
  // Define query
  query = { all: [Position, Velocity] } as QueryDescriptor;

  // Set priority (lower = earlier)
  priority = SystemPriorities.PHYSICS; // -200

  // Lifecycle hooks
  onInit(): void {
    console.log('System initialized');
  }

  onStart(): void {
    console.log('System started');
  }

  // Main update (every frame)
  update(context: SystemContext): void {
    const query = this.getQuery();
    query.forEach((entity, components) => {
      const pos = components[0] as PositionComponent;
      const vel = components[1] as VelocityComponent;

      pos.x += vel.x * context.deltaTime;
      pos.y += vel.y * context.deltaTime;
      pos.z += vel.z * context.deltaTime;
    });
  }

  // Fixed update (physics timestep)
  fixedUpdate(context: SystemContext): void {
    // Physics simulation at constant timestep
  }

  // Late update (after all updates)
  lateUpdate(context: SystemContext): void {
    // Camera follow, etc.
  }

  onStop(): void {
    console.log('System stopped');
  }

  onDestroy(): void {
    console.log('System destroyed');
  }
}

// Add system to world
world.addSystem(new MovementSystem());
```

### World Lifecycle

```typescript
const world = new World({
  initialEntityCapacity: 2048,
  maxEntities: 100000
});

// Add systems
world.addSystem(new PhysicsSystem());
world.addSystem(new RenderSystem());

// Initialize systems (calls onInit on all systems)
world.init();

// Start systems (calls onStart on all systems)
world.start();

// Game loop
function gameLoop() {
  const deltaTime = 1 / 60;

  // Variable timestep update
  world.update(deltaTime);

  // Late update (camera, etc.)
  world.lateUpdate(deltaTime);

  requestAnimationFrame(gameLoop);
}

// Physics loop (fixed timestep)
setInterval(() => {
  world.fixedUpdate(1 / 60);
}, 1000 / 60);

// Cleanup
world.stop();   // Calls onStop on all systems
world.destroy(); // Calls onDestroy on all systems
```

### Event Callbacks

```typescript
// Entity events
world.onEntityCreated = (entity) => {
  console.log(`Entity created: ${entity}`);
};

world.onEntityDestroyed = (entity) => {
  console.log(`Entity destroyed: ${entity}`);
};

// Component events
world.onComponentAdded = (entity, componentId) => {
  console.log(`Component ${componentId} added to entity ${entity}`);
};

world.onComponentRemoved = (entity, componentId) => {
  console.log(`Component ${componentId} removed from entity ${entity}`);
};
```

### Command Buffer (Deferred Operations)

```typescript
// Safe mutations during iteration
query.forEach((entity) => {
  if (shouldSpawn) {
    // Defer entity creation
    const newEntity = world.defer.createEntity();
    world.defer.addComponent(newEntity, new Position());
  }

  if (shouldDestroy) {
    // Defer entity destruction
    world.defer.destroyEntity(entity);
  }

  if (shouldModifyComponent) {
    // Defer component operations
    world.defer.removeComponent(entity, OldComponent);
    world.defer.addComponent(entity, new NewComponent());
  }
});

// Execute all deferred commands
world.executeCommands();
```

### Component Registration

```typescript
// Define component
class MyComponent implements IComponent {
  value: number = 0;

  reset(): void {
    this.value = 0;
  }

  serialize(): object {
    return { value: this.value };
  }

  deserialize(data: any): void {
    this.value = data.value ?? 0;
  }
}

// Register component
ComponentRegistry.register(MyComponent, {
  name: 'MyComponent',
  poolSize: 1000
});

// Check if registered
const isRegistered = ComponentRegistry.isRegistered(MyComponent);

// Get component ID
const id = ComponentRegistry.getId(MyComponent);
```

### World State Management

```typescript
// Clear all entities (keeps systems)
world.clear();

// Check world stats
console.log(`Entities: ${world.entityCount}`);
console.log(`Systems: ${world.systemCount}`);
console.log(`Archetypes: ${world.archetypeCount}`);
console.log(`Time: ${world.time}s`);
console.log(`Fixed Time: ${world.fixedTime}s`);
console.log(`Frame: ${world.frameCount}`);

// Get debug info
const debugInfo = world.getDebugInfo();
console.log(JSON.stringify(debugInfo, null, 2));
```

### TransformComponent Usage

```typescript
const transform = new TransformComponent({
  position: new Vector3(0, 5, 10),
  rotation: Quaternion.fromEuler(0, Math.PI / 4, 0),
  scale: new Vector3(1, 1, 1)
});

world.addComponent(entity, transform);

// Transform operations (chainable)
transform
  .translate(new Vector3(1, 0, 0))
  .rotateY(Math.PI / 2)
  .scaleBy(2);

// Access transform data
const worldPos = transform.worldPosition;
const forward = transform.forward;
const right = transform.right;
const up = transform.up;

// Look at target
transform.lookAt(new Vector3(10, 0, 0));

// Hierarchy
transform.parentEntity = parentEntityId;
```

### TagComponent Usage

```typescript
const tags = new TagComponent(['enemy', 'flying']);

world.addComponent(entity, tags);

// Tag operations
tags.add('boss');
tags.remove('flying');
tags.toggle('aggressive');
tags.clear();

// Bulk operations
tags.addAll(['elite', 'ranged']);
tags.removeAll(['enemy', 'flying']);
tags.setTags(['player', 'controllable']);

// Tag queries
if (tags.has('enemy')) { }
if (tags.hasAny(['enemy', 'player'])) { }
if (tags.hasAll(['enemy', 'boss'])) { }

// Tag info
console.log(`Count: ${tags.count}`);
console.log(`Tags: ${tags.tags}`);

// Iteration
for (const tag of tags) {
  console.log(tag);
}

tags.forEach(tag => {
  console.log(tag);
});
```

## System Priorities

```typescript
SystemPriorities.FIRST       // -1000
SystemPriorities.EARLY       // -100
SystemPriorities.INPUT       // -500
SystemPriorities.PHYSICS     // -200
SystemPriorities.PRE_UPDATE  // -10
SystemPriorities.DEFAULT     // 0
SystemPriorities.POST_UPDATE // 10
SystemPriorities.ANIMATION   // 100
SystemPriorities.LATE        // 100
SystemPriorities.RENDERING   // 500
SystemPriorities.DEBUG       // 900
SystemPriorities.LAST        // 1000
```

## Performance Targets

| Operation | Target | Entities/Operations |
|-----------|--------|---------------------|
| Entity Creation | < 1000ms | 100,000 entities |
| Component Add | < 2000ms | 100,000 components |
| Query Iteration | < 100ms | 100,000 entities |
| System Update | < 50ms | 100,000 entity updates |

## Common Test Patterns

### Setup and Teardown

```typescript
function testMyFeature() {
  // Setup
  const world = new World();

  // Test logic
  const entity = world.createEntity();
  world.addComponent(entity, new MyComponent());

  // Assertions
  assert(world.hasComponent(entity, MyComponent));

  // Teardown
  world.destroy();
}
```

### Testing System Execution Order

```typescript
const executionOrder: string[] = [];

class SystemA extends System {
  update() { executionOrder.push('A'); }
}

class SystemB extends System {
  priority = 10;
  update() { executionOrder.push('B'); }
}

world.addSystem(new SystemB());
world.addSystem(new SystemA());
world.init();
world.start();
world.update(1/60);

assert(executionOrder[0] === 'A'); // Priority 0
assert(executionOrder[1] === 'B'); // Priority 10
```

### Testing Archetype Transitions

```typescript
const entity = world.createEntity();
const initialArchetypeCount = world.archetypeCount;

world.addComponent(entity, new Position());
assert(world.archetypeCount > initialArchetypeCount);

world.addComponent(entity, new Velocity());
assert(world.archetypeCount > initialArchetypeCount + 1);

world.removeComponent(entity, Velocity);
assert(world.hasComponent(entity, Position));
assert(!world.hasComponent(entity, Velocity));
```

### Performance Benchmarking

```typescript
const world = new World({ initialEntityCapacity: 100000 });

const start = performance.now();

// Operation to benchmark
for (let i = 0; i < 100000; i++) {
  world.createEntity();
}

const duration = performance.now() - start;
const perEntity = duration / 100000;

console.log(`Operation: ${duration.toFixed(2)}ms (${perEntity.toFixed(4)}ms each)`);

assert(duration < TARGET_MS);

world.destroy();
```

## Files Reference

| File | Purpose |
|------|---------|
| `ECSIntegrationTest.ts` | Main test suite class |
| `runECSTests.ts` | Test runner script |
| `README.md` | Full documentation |
| `TEST_REPORT.md` | Detailed test report |
| `QUICK_REFERENCE.md` | This file |

## Command Line Usage

```bash
# Run tests
ts-node src/tests/integration/runECSTests.ts

# Run with Node
node -r ts-node/register src/tests/integration/runECSTests.ts

# Add to package.json
{
  "scripts": {
    "test:ecs": "ts-node src/tests/integration/runECSTests.ts",
    "test:ecs:watch": "nodemon --exec ts-node src/tests/integration/runECSTests.ts"
  }
}

# Run via npm
npm run test:ecs
```

## Exit Codes

- **0**: All tests passed
- **1**: One or more tests failed

## Test Output Format

```
✓ Test Name (duration)  - Passed
✗ Test Name (duration)  - Failed
```

---

**Quick Reference Version**: 1.0.0
**Last Updated**: November 25, 2025
