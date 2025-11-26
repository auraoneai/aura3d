/**
 * ECS Integration Tests for G3D 5.0
 *
 * Comprehensive integration tests covering:
 * - Entity lifecycle management
 * - Component CRUD operations
 * - Query functionality and filtering
 * - System execution and priorities
 * - Archetype management
 * - Event propagation
 * - Command buffer operations
 * - Serialization and deserialization
 * - Performance benchmarks
 *
 * @module tests/integration/ECSIntegrationTest
 */

import { World, WorldOptions } from '../../ecs/World';
import { Entity, EntityUtils, EntityPool } from '../../ecs/Entity';
import { IComponent, ComponentType, ComponentSchema } from '../../ecs/Component';
import { ComponentRegistry } from '../../ecs/ComponentRegistry';
import { System, SystemContext, SystemPriorities } from '../../ecs/System';
import { Query, QueryDescriptor } from '../../ecs/Query';
import { Archetype } from '../../ecs/Archetype';
import { TransformComponent } from '../../ecs/components/TransformComponent';
import { TagComponent } from '../../ecs/components/TagComponent';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';

/**
 * Test result structure
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

/**
 * Test suite class for ECS integration testing
 */
export class ECSIntegrationTest {
  private results: TestResult[] = [];
  private world: World | null = null;

  /**
   * Simple assertion utility
   */
  private assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  /**
   * Run a single test with error handling
   */
  private runTest(name: string, testFn: () => void): void {
    const startTime = performance.now();
    try {
      testFn();
      const duration = performance.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✓ ${name} (${duration.toFixed(2)}ms)`);
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration });
      console.error(`✗ ${name} (${duration.toFixed(2)}ms): ${errorMessage}`);
    }
  }

  /**
   * Setup: Register test components
   */
  private setupTestComponents(): void {
    // Position component for testing
    class PositionComponent implements IComponent {
      x: number = 0;
      y: number = 0;
      z: number = 0;

      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }

      reset(): void {
        this.x = 0;
        this.y = 0;
        this.z = 0;
      }

      serialize(): object {
        return { x: this.x, y: this.y, z: this.z };
      }

      deserialize(data: any): void {
        this.x = data.x ?? 0;
        this.y = data.y ?? 0;
        this.z = data.z ?? 0;
      }
    }

    // Velocity component for testing
    class VelocityComponent implements IComponent {
      x: number = 0;
      y: number = 0;
      z: number = 0;

      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }

      reset(): void {
        this.x = 0;
        this.y = 0;
        this.z = 0;
      }
    }

    // Health component for testing
    class HealthComponent implements IComponent {
      current: number = 100;
      max: number = 100;

      constructor(health = 100) {
        this.current = health;
        this.max = health;
      }

      reset(): void {
        this.current = 100;
        this.max = 100;
      }
    }

    // Only register if not already registered
    if (!ComponentRegistry.isRegistered(PositionComponent)) {
      ComponentRegistry.register(PositionComponent, { name: 'Position' });
    }
    if (!ComponentRegistry.isRegistered(VelocityComponent)) {
      ComponentRegistry.register(VelocityComponent, { name: 'Velocity' });
    }
    if (!ComponentRegistry.isRegistered(HealthComponent)) {
      ComponentRegistry.register(HealthComponent, { name: 'Health' });
    }

    // Store on global for test access
    (globalThis as any).PositionComponent = PositionComponent;
    (globalThis as any).VelocityComponent = VelocityComponent;
    (globalThis as any).HealthComponent = HealthComponent;
  }

  /**
   * Test 1: Entity Lifecycle
   */
  private testEntityLifecycle(): void {
    const world = new World();

    // Create entity
    const entity = world.createEntity();
    this.assert(EntityUtils.isValid(entity), 'Entity should be valid');
    this.assert(world.isAlive(entity), 'Entity should be alive');
    this.assert(world.entityCount === 1, 'Entity count should be 1');

    // Destroy entity
    world.destroyEntity(entity);
    this.assert(!world.isAlive(entity), 'Entity should not be alive after destroy');
    this.assert(world.entityCount === 0, 'Entity count should be 0 after destroy');

    // Bulk creation
    const entities: Entity[] = [];
    for (let i = 0; i < 1000; i++) {
      entities.push(world.createEntity());
    }
    this.assert(world.entityCount === 1000, 'Should have 1000 entities');
    this.assert(entities.length === 1000, 'Should create 1000 entities');

    // Verify all are alive
    for (const e of entities) {
      this.assert(world.isAlive(e), 'All entities should be alive');
    }

    world.destroy();
  }

  /**
   * Test 2: Component CRUD Operations
   */
  private testComponentOperations(): void {
    const world = new World();
    const entity = world.createEntity();
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;

    // Add component
    const position = new Position(10, 20, 30);
    world.addComponent(entity, position);
    this.assert(world.hasComponent(entity, Position), 'Entity should have Position component');

    // Get component
    const retrieved = world.getComponent(entity, Position);
    this.assert(retrieved !== undefined, 'Should retrieve Position component');
    this.assert(retrieved!.x === 10, 'Position x should be 10');
    this.assert(retrieved!.y === 20, 'Position y should be 20');
    this.assert(retrieved!.z === 30, 'Position z should be 30');

    // Modify component
    retrieved!.x = 100;
    const modified = world.getComponent(entity, Position);
    this.assert(modified!.x === 100, 'Modified component should have x = 100');

    // Add second component
    const velocity = new Velocity(1, 2, 3);
    world.addComponent(entity, velocity);
    this.assert(world.hasComponent(entity, Velocity), 'Entity should have Velocity component');
    this.assert(world.hasComponent(entity, Position), 'Entity should still have Position component');

    // Remove component
    world.removeComponent(entity, Velocity);
    this.assert(!world.hasComponent(entity, Velocity), 'Entity should not have Velocity after removal');
    this.assert(world.hasComponent(entity, Position), 'Entity should still have Position after Velocity removal');

    // Set component (upsert)
    const newPosition = new Position(50, 60, 70);
    world.setComponent(entity, newPosition);
    const updated = world.getComponent(entity, Position);
    this.assert(updated!.x === 50, 'Set component should update x to 50');

    world.destroy();
  }

  /**
   * Test 3: Query Functionality
   */
  private testQueryFunctionality(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;
    const Health = (globalThis as any).HealthComponent;

    // Create entities with various component combinations
    const entities: Entity[] = [];
    for (let i = 0; i < 100; i++) {
      const entity = world.createEntity();
      entities.push(entity);

      // All entities get Position
      world.addComponent(entity, new Position(i, i, i));

      // Every 2nd entity gets Velocity
      if (i % 2 === 0) {
        world.addComponent(entity, new Velocity(1, 0, 0));
      }

      // Every 3rd entity gets Health
      if (i % 3 === 0) {
        world.addComponent(entity, new Health(100));
      }
    }

    // Query with single component
    const posQuery = world.getQuery({ all: [Position] });
    this.assert(posQuery.entityCount === 100, 'Position query should match 100 entities');

    // Query with multiple components (AND)
    const movementQuery = world.getQuery({ all: [Position, Velocity] });
    this.assert(movementQuery.entityCount === 50, 'Movement query should match 50 entities');

    // Query with complex descriptor
    const complexQuery = world.getQuery({
      all: [Position],
      any: [Velocity, Health],
      none: []
    });
    this.assert(complexQuery.entityCount > 0, 'Complex query should match entities');

    // Iterate query
    let count = 0;
    movementQuery.forEach((entity, components) => {
      count++;
      this.assert(components.length > 0, 'Components array should not be empty');
    });
    this.assert(count === 50, 'forEach should iterate 50 entities');

    // Test query caching
    const cachedQuery = world.getQuery({ all: [Position, Velocity] });
    this.assert(cachedQuery === movementQuery, 'Identical queries should return cached instance');

    world.destroy();
  }

  /**
   * Test 4: System Execution
   */
  private testSystemExecution(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;

    const executionOrder: string[] = [];

    // Create test systems
    class SystemA extends System {
      query = { all: [Position] } as QueryDescriptor;

      update(context: SystemContext): void {
        executionOrder.push('A');
      }
    }

    class SystemB extends System {
      priority = 10;
      query = { all: [Position] } as QueryDescriptor;

      update(context: SystemContext): void {
        executionOrder.push('B');
      }
    }

    class SystemC extends System {
      priority = -10;
      query = { all: [Position] } as QueryDescriptor;

      update(context: SystemContext): void {
        executionOrder.push('C');
      }
    }

    // Add systems in non-priority order
    world.addSystem(new SystemB());
    world.addSystem(new SystemA());
    world.addSystem(new SystemC());

    // Initialize and start
    world.init();
    world.start();

    // Create an entity to match queries
    const entity = world.createEntity();
    world.addComponent(entity, new Position(0, 0, 0));

    // Execute update
    world.update(1 / 60);

    // Verify execution order (lower priority first)
    this.assert(executionOrder[0] === 'C', 'SystemC should execute first (priority -10)');
    this.assert(executionOrder[1] === 'A', 'SystemA should execute second (priority 0)');
    this.assert(executionOrder[2] === 'B', 'SystemB should execute third (priority 10)');

    world.destroy();
  }

  /**
   * Test 5: System Lifecycle
   */
  private testSystemLifecycle(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    const lifecycle: string[] = [];

    class TestSystem extends System {
      query = { all: [Position] } as QueryDescriptor;

      onInit(): void {
        lifecycle.push('init');
      }

      onStart(): void {
        lifecycle.push('start');
      }

      update(context: SystemContext): void {
        lifecycle.push('update');
      }

      onStop(): void {
        lifecycle.push('stop');
      }

      onDestroy(): void {
        lifecycle.push('destroy');
      }
    }

    const system = new TestSystem();
    world.addSystem(system);

    // Init should be called
    world.init();
    this.assert(lifecycle.includes('init'), 'onInit should be called');

    // Start should be called
    world.start();
    this.assert(lifecycle.includes('start'), 'onStart should be called');

    // Update should be called
    world.update(1 / 60);
    this.assert(lifecycle.includes('update'), 'update should be called');

    // Stop should be called
    world.stop();
    this.assert(lifecycle.includes('stop'), 'onStop should be called');

    // Destroy should be called
    world.destroy();
    this.assert(lifecycle.includes('destroy'), 'onDestroy should be called');
  }

  /**
   * Test 6: Archetype Transitions
   */
  private testArchetypeTransitions(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;
    const Health = (globalThis as any).HealthComponent;

    const entity = world.createEntity();
    const initialArchetypeCount = world.archetypeCount;

    // Add Position -> creates archetype [Position]
    world.addComponent(entity, new Position(0, 0, 0));
    this.assert(world.archetypeCount > initialArchetypeCount, 'Adding component should create archetype');

    const archetype1Count = world.archetypeCount;

    // Add Velocity -> transitions to archetype [Position, Velocity]
    world.addComponent(entity, new Velocity(1, 0, 0));
    this.assert(world.archetypeCount > archetype1Count, 'Adding second component should create new archetype');

    const archetype2Count = world.archetypeCount;

    // Add Health -> transitions to archetype [Position, Velocity, Health]
    world.addComponent(entity, new Health(100));
    this.assert(world.archetypeCount > archetype2Count, 'Adding third component should create new archetype');

    // Verify entity still has all components
    this.assert(world.hasComponent(entity, Position), 'Entity should still have Position');
    this.assert(world.hasComponent(entity, Velocity), 'Entity should still have Velocity');
    this.assert(world.hasComponent(entity, Health), 'Entity should still have Health');

    // Remove component -> transitions back
    const preRemoveCount = world.archetypeCount;
    world.removeComponent(entity, Velocity);
    this.assert(!world.hasComponent(entity, Velocity), 'Entity should not have Velocity after removal');
    this.assert(world.hasComponent(entity, Position), 'Entity should still have Position after removal');
    this.assert(world.hasComponent(entity, Health), 'Entity should still have Health after removal');

    world.destroy();
  }

  /**
   * Test 7: Event Propagation
   */
  private testEventPropagation(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    const events: string[] = [];

    // Set up event callbacks
    world.onEntityCreated = (entity) => {
      events.push(`created:${entity}`);
    };

    world.onEntityDestroyed = (entity) => {
      events.push(`destroyed:${entity}`);
    };

    world.onComponentAdded = (entity, componentId) => {
      events.push(`added:${entity}:${componentId}`);
    };

    world.onComponentRemoved = (entity, componentId) => {
      events.push(`removed:${entity}:${componentId}`);
    };

    // Create entity
    const entity = world.createEntity();
    this.assert(events.some(e => e.startsWith('created:')), 'Entity creation event should fire');

    // Add component
    world.addComponent(entity, new Position(0, 0, 0));
    this.assert(events.some(e => e.startsWith('added:')), 'Component added event should fire');

    // Remove component
    world.removeComponent(entity, Position);
    this.assert(events.some(e => e.startsWith('removed:')), 'Component removed event should fire');

    // Destroy entity
    world.destroyEntity(entity);
    this.assert(events.some(e => e.startsWith('destroyed:')), 'Entity destroyed event should fire');

    world.destroy();
  }

  /**
   * Test 8: Command Buffer Operations
   */
  private testCommandBuffer(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    // Use deferred operations
    const tempEntityId = world.defer.createEntity();
    this.assert(tempEntityId < 0, 'Deferred entity should have negative ID');

    world.defer.addComponent(tempEntityId, new Position(10, 20, 30));

    // Commands not executed yet
    this.assert(world.entityCount === 0, 'Entity count should be 0 before executing commands');

    // Execute commands
    world.executeCommands();

    // Now entity should exist
    this.assert(world.entityCount === 1, 'Entity count should be 1 after executing commands');

    // Test deferred destroy
    const entity = world.createEntity();
    world.addComponent(entity, new Position(0, 0, 0));

    world.defer.destroyEntity(entity);
    this.assert(world.isAlive(entity), 'Entity should still be alive before executing commands');

    world.executeCommands();
    this.assert(!world.isAlive(entity), 'Entity should be destroyed after executing commands');

    world.destroy();
  }

  /**
   * Test 9: Component Serialization
   */
  private testSerialization(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    const entity = world.createEntity();
    const original = new Position(10, 20, 30);
    world.addComponent(entity, original);

    // Serialize
    const serialized = original.serialize();
    this.assert(typeof serialized === 'object', 'Serialized data should be an object');
    this.assert((serialized as any).x === 10, 'Serialized x should be 10');

    // Deserialize
    const restored = new Position();
    restored.deserialize(serialized);
    this.assert(restored.x === 10, 'Deserialized x should be 10');
    this.assert(restored.y === 20, 'Deserialized y should be 20');
    this.assert(restored.z === 30, 'Deserialized z should be 30');

    world.destroy();
  }

  /**
   * Test 10: TransformComponent Integration
   */
  private testTransformComponent(): void {
    const world = new World();

    const entity = world.createEntity();
    const transform = new TransformComponent({
      position: new Vector3(1, 2, 3),
      rotation: Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4),
      scale: new Vector3(2, 2, 2)
    });

    world.addComponent(entity, transform);

    // Verify component was added
    this.assert(world.hasComponent(entity, TransformComponent), 'Entity should have TransformComponent');

    // Get and test component
    const retrieved = world.getComponent(entity, TransformComponent);
    this.assert(retrieved !== undefined, 'Should retrieve TransformComponent');
    this.assert(retrieved!.position.x === 1, 'Position x should be 1');
    this.assert(retrieved!.scale.x === 2, 'Scale x should be 2');

    // Test transform operations
    retrieved!.translate(new Vector3(10, 0, 0));
    this.assert(retrieved!.position.x === 11, 'Position x should be 11 after translation');

    // Test serialization
    const serialized = retrieved!.serialize();
    this.assert(typeof serialized === 'object', 'Transform should serialize to object');

    const newTransform = new TransformComponent();
    newTransform.deserialize(serialized);
    this.assert(Math.abs(newTransform.position.x - 11) < 0.001, 'Deserialized position should match');

    world.destroy();
  }

  /**
   * Test 11: TagComponent Integration
   */
  private testTagComponent(): void {
    const world = new World();

    const entity = world.createEntity();
    const tags = new TagComponent(['enemy', 'flying', 'aggressive']);

    world.addComponent(entity, tags);

    // Verify component was added
    this.assert(world.hasComponent(entity, TagComponent), 'Entity should have TagComponent');

    // Get and test component
    const retrieved = world.getComponent(entity, TagComponent);
    this.assert(retrieved !== undefined, 'Should retrieve TagComponent');
    this.assert(retrieved!.has('enemy'), 'Should have enemy tag');
    this.assert(retrieved!.has('flying'), 'Should have flying tag');
    this.assert(retrieved!.count === 3, 'Should have 3 tags');

    // Test tag operations
    retrieved!.add('boss');
    this.assert(retrieved!.count === 4, 'Should have 4 tags after adding boss');

    retrieved!.remove('flying');
    this.assert(!retrieved!.has('flying'), 'Should not have flying tag after removal');
    this.assert(retrieved!.count === 3, 'Should have 3 tags after removal');

    // Test tag queries
    this.assert(retrieved!.hasAny(['enemy', 'player']), 'hasAny should return true for enemy');
    this.assert(retrieved!.hasAll(['enemy', 'boss']), 'hasAll should return true');
    this.assert(!retrieved!.hasAll(['enemy', 'player']), 'hasAll should return false');

    world.destroy();
  }

  /**
   * Test 12: World State Management
   */
  private testWorldStateManagement(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    // Create entities
    for (let i = 0; i < 50; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(i, i, i));
    }

    this.assert(world.entityCount === 50, 'Should have 50 entities');

    // Test clear
    world.clear();
    this.assert(world.entityCount === 0, 'Entity count should be 0 after clear');
    this.assert(world.time === 0, 'Time should be reset after clear');
    this.assert(world.frameCount === 0, 'Frame count should be reset after clear');

    // Verify world can be reused
    const entity = world.createEntity();
    world.addComponent(entity, new Position(0, 0, 0));
    this.assert(world.entityCount === 1, 'Should be able to create entities after clear');

    world.destroy();
  }

  /**
   * Test 13: Fixed Update
   */
  private testFixedUpdate(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    let fixedUpdateCount = 0;

    class PhysicsSystem extends System {
      query = { all: [Position] } as QueryDescriptor;
      priority = SystemPriorities.PHYSICS;

      fixedUpdate(context: SystemContext): void {
        fixedUpdateCount++;
        this.assert(context.fixedDeltaTime === 1 / 60, 'Fixed delta time should be 1/60');
      }

      update(context: SystemContext): void {
        // Regular update
      }

      private assert(condition: boolean, message: string): void {
        if (!condition) throw new Error(message);
      }
    }

    world.addSystem(new PhysicsSystem());
    world.init();
    world.start();

    const entity = world.createEntity();
    world.addComponent(entity, new Position(0, 0, 0));

    // Run fixed update
    world.fixedUpdate(1 / 60);
    this.assert(fixedUpdateCount === 1, 'Fixed update should be called once');

    world.fixedUpdate(1 / 60);
    this.assert(fixedUpdateCount === 2, 'Fixed update should be called twice');

    world.destroy();
  }

  /**
   * Test 14: Late Update
   */
  private testLateUpdate(): void {
    const world = new World();
    const Position = (globalThis as any).PositionComponent;

    let lateUpdateCount = 0;

    class CameraSystem extends System {
      query = { all: [Position] } as QueryDescriptor;
      priority = SystemPriorities.LATE;

      update(context: SystemContext): void {
        // Regular update
      }

      lateUpdate(context: SystemContext): void {
        lateUpdateCount++;
      }
    }

    world.addSystem(new CameraSystem());
    world.init();
    world.start();

    const entity = world.createEntity();
    world.addComponent(entity, new Position(0, 0, 0));

    // Run late update
    world.lateUpdate(1 / 60);
    this.assert(lateUpdateCount === 1, 'Late update should be called once');

    world.destroy();
  }

  /**
   * Benchmark 1: Entity Creation Performance
   */
  private benchmarkEntityCreation(): void {
    const world = new World({ initialEntityCapacity: 100000 });

    const start = performance.now();
    const count = 100000;

    for (let i = 0; i < count; i++) {
      world.createEntity();
    }

    const duration = performance.now() - start;
    const perEntity = duration / count;

    console.log(`Entity Creation: ${count} entities in ${duration.toFixed(2)}ms (${perEntity.toFixed(4)}ms per entity)`);

    this.assert(duration < 1000, 'Should create 100k entities in less than 1 second');
    this.assert(world.entityCount === count, 'Entity count should match');

    world.destroy();
  }

  /**
   * Benchmark 2: Component Add Performance
   */
  private benchmarkComponentAdd(): void {
    const world = new World({ initialEntityCapacity: 100000 });
    const Position = (globalThis as any).PositionComponent;

    // Create entities
    const entities: Entity[] = [];
    for (let i = 0; i < 100000; i++) {
      entities.push(world.createEntity());
    }

    const start = performance.now();

    // Add components
    for (const entity of entities) {
      world.addComponent(entity, new Position(0, 0, 0));
    }

    const duration = performance.now() - start;
    const perComponent = duration / entities.length;

    console.log(`Component Add: ${entities.length} components in ${duration.toFixed(2)}ms (${perComponent.toFixed(4)}ms per component)`);

    this.assert(duration < 2000, 'Should add 100k components in less than 2 seconds');

    world.destroy();
  }

  /**
   * Benchmark 3: Query Iteration Performance
   */
  private benchmarkQueryIteration(): void {
    const world = new World({ initialEntityCapacity: 100000 });
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;

    // Create entities with components
    for (let i = 0; i < 100000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(i, i, i));
      world.addComponent(entity, new Velocity(1, 0, 0));
    }

    const query = world.getQuery({ all: [Position, Velocity] });

    const start = performance.now();

    // Iterate query
    let count = 0;
    query.forEach((entity, components) => {
      count++;
    });

    const duration = performance.now() - start;
    const perEntity = duration / count;

    console.log(`Query Iteration: ${count} entities in ${duration.toFixed(2)}ms (${perEntity.toFixed(4)}ms per entity)`);

    this.assert(duration < 100, 'Should iterate 100k entities in less than 100ms');
    this.assert(count === 100000, 'Should iterate all entities');

    world.destroy();
  }

  /**
   * Benchmark 4: System Update Performance
   */
  private benchmarkSystemUpdate(): void {
    const world = new World({ initialEntityCapacity: 100000 });
    const Position = (globalThis as any).PositionComponent;
    const Velocity = (globalThis as any).VelocityComponent;

    class MovementSystem extends System {
      query = { all: [Position, Velocity] } as QueryDescriptor;

      update(context: SystemContext): void {
        const query = this.getQuery();
        query.forEach((entity, components) => {
          const pos = components[0] as any;
          const vel = components[1] as any;
          pos.x += vel.x * context.deltaTime;
          pos.y += vel.y * context.deltaTime;
          pos.z += vel.z * context.deltaTime;
        });
      }
    }

    world.addSystem(new MovementSystem());
    world.init();
    world.start();

    // Create entities
    for (let i = 0; i < 100000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(0, 0, 0));
      world.addComponent(entity, new Velocity(1, 1, 1));
    }

    const start = performance.now();
    world.update(1 / 60);
    const duration = performance.now() - start;

    console.log(`System Update: 100k entities in ${duration.toFixed(2)}ms`);

    this.assert(duration < 50, 'Should update 100k entities in less than 50ms');

    world.destroy();
  }

  /**
   * Run all integration tests
   */
  public runAll(): TestResult[] {
    console.log('\n=== ECS Integration Tests ===\n');

    // Setup
    this.setupTestComponents();

    // Run all tests
    console.log('--- Core Functionality Tests ---');
    this.runTest('Entity Lifecycle', () => this.testEntityLifecycle());
    this.runTest('Component Operations', () => this.testComponentOperations());
    this.runTest('Query Functionality', () => this.testQueryFunctionality());
    this.runTest('System Execution', () => this.testSystemExecution());
    this.runTest('System Lifecycle', () => this.testSystemLifecycle());
    this.runTest('Archetype Transitions', () => this.testArchetypeTransitions());
    this.runTest('Event Propagation', () => this.testEventPropagation());
    this.runTest('Command Buffer Operations', () => this.testCommandBuffer());
    this.runTest('Component Serialization', () => this.testSerialization());

    console.log('\n--- Component Integration Tests ---');
    this.runTest('TransformComponent Integration', () => this.testTransformComponent());
    this.runTest('TagComponent Integration', () => this.testTagComponent());

    console.log('\n--- World Management Tests ---');
    this.runTest('World State Management', () => this.testWorldStateManagement());
    this.runTest('Fixed Update', () => this.testFixedUpdate());
    this.runTest('Late Update', () => this.testLateUpdate());

    console.log('\n--- Performance Benchmarks ---');
    this.runTest('Benchmark: Entity Creation', () => this.benchmarkEntityCreation());
    this.runTest('Benchmark: Component Add', () => this.benchmarkComponentAdd());
    this.runTest('Benchmark: Query Iteration', () => this.benchmarkQueryIteration());
    this.runTest('Benchmark: System Update', () => this.benchmarkSystemUpdate());

    // Summary
    console.log('\n=== Test Summary ===');
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalTime = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`Total: ${this.results.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Time: ${totalTime.toFixed(2)}ms`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    return this.results;
  }

  /**
   * Get test results
   */
  public getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Get summary statistics
   */
  public getSummary(): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    totalDuration: number;
  } {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    return {
      total: this.results.length,
      passed,
      failed,
      passRate: (passed / this.results.length) * 100,
      totalDuration
    };
  }
}

/**
 * Run tests if executed directly
 */
if (typeof require !== 'undefined' && require.main === module) {
  const tests = new ECSIntegrationTest();
  tests.runAll();
}

export { ECSIntegrationTest };
