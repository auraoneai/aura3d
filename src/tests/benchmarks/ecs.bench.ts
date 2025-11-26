/**
 * ECS Benchmarks
 *
 * Performance benchmarks for ECS operations:
 * - Entity creation (100K entities)
 * - Component addition (100K ops)
 * - Query iteration (100K entities)
 * - System update (100K entities)
 */

import { bench, describe } from 'vitest';
import { World } from '../../ecs/World';
import { System, SystemContext } from '../../ecs/System';
import { IComponent } from '../../ecs/Component';
import { TransformComponent } from '../../ecs/components/TransformComponent';
import { NameComponent } from '../../ecs/components/NameComponent';
import { TagComponent } from '../../ecs/components/TagComponent';
import { ActiveComponent } from '../../ecs/components/ActiveComponent';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';

/**
 * Simple velocity component for benchmarking
 */
class VelocityComponent implements IComponent {
  x: number = 0;
  y: number = 0;
  z: number = 0;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
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

/**
 * Simple health component for benchmarking
 */
class HealthComponent implements IComponent {
  current: number = 100;
  max: number = 100;

  constructor(max: number = 100) {
    this.max = max;
    this.current = max;
  }

  reset(): void {
    this.current = this.max;
  }
}

/**
 * Simple movement system for benchmarking
 */
class MovementSystem extends System {
  update(context: SystemContext): void {
    const query = context.world.query([TransformComponent, VelocityComponent]);

    for (const entity of query.entities()) {
      const transform = context.world.getComponent(entity, TransformComponent);
      const velocity = context.world.getComponent(entity, VelocityComponent);

      if (transform && velocity) {
        transform.position.x += velocity.x * context.deltaTime;
        transform.position.y += velocity.y * context.deltaTime;
        transform.position.z += velocity.z * context.deltaTime;
      }
    }
  }
}

/**
 * Simple health regeneration system for benchmarking
 */
class HealthRegenSystem extends System {
  update(context: SystemContext): void {
    const query = context.world.query([HealthComponent]);

    for (const entity of query.entities()) {
      const health = context.world.getComponent(entity, HealthComponent);

      if (health && health.current < health.max) {
        health.current = Math.min(health.max, health.current + 10 * context.deltaTime);
      }
    }
  }
}

describe('Entity Benchmarks', () => {
  bench('Create 100K entities', () => {
    const world = new World();

    for (let i = 0; i < 100_000; i++) {
      world.createEntity();
    }
  });

  bench('Create and destroy 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    for (let i = 0; i < 100_000; i++) {
      entities.push(world.createEntity());
    }

    for (const entity of entities) {
      world.destroyEntity(entity);
    }
  });

  bench('Create 100K entities with single component', () => {
    const world = new World();

    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
    }
  });

  bench('Create 100K entities with multiple components', () => {
    const world = new World();

    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent());
      world.addComponent(entity, new HealthComponent());
    }
  });
});

describe('Component Benchmarks', () => {
  bench('Add component to 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    // Create entities first
    for (let i = 0; i < 100_000; i++) {
      entities.push(world.createEntity());
    }

    // Add components
    for (const entity of entities) {
      world.addComponent(entity, new TransformComponent());
    }
  });

  bench('Remove component from 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    // Create entities with component
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      entities.push(entity);
    }

    // Remove components
    for (const entity of entities) {
      world.removeComponent(entity, TransformComponent);
    }
  });

  bench('Get component from 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      entities.push(entity);
    }

    // Benchmark
    for (const entity of entities) {
      world.getComponent(entity, TransformComponent);
    }
  });

  bench('Has component check on 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      if (i % 2 === 0) {
        world.addComponent(entity, new TransformComponent());
      }
      entities.push(entity);
    }

    // Benchmark
    for (const entity of entities) {
      world.hasComponent(entity, TransformComponent);
    }
  });

  bench('Add multiple components to 100K entities', () => {
    const world = new World();
    const entities: number[] = [];

    for (let i = 0; i < 100_000; i++) {
      entities.push(world.createEntity());
    }

    for (const entity of entities) {
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent());
      world.addComponent(entity, new HealthComponent());
      world.addComponent(entity, new ActiveComponent());
    }
  });
});

describe('Query Benchmarks', () => {
  bench('Query iteration (100K entities, single component)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
    }

    // Benchmark
    const query = world.query([TransformComponent]);
    for (const entity of query.entities()) {
      world.getComponent(entity, TransformComponent);
    }
  });

  bench('Query iteration (100K entities, two components)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent());
    }

    // Benchmark
    const query = world.query([TransformComponent, VelocityComponent]);
    for (const entity of query.entities()) {
      world.getComponent(entity, TransformComponent);
      world.getComponent(entity, VelocityComponent);
    }
  });

  bench('Query iteration (100K entities, three components)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent());
      world.addComponent(entity, new HealthComponent());
    }

    // Benchmark
    const query = world.query([TransformComponent, VelocityComponent, HealthComponent]);
    for (const entity of query.entities()) {
      world.getComponent(entity, TransformComponent);
      world.getComponent(entity, VelocityComponent);
      world.getComponent(entity, HealthComponent);
    }
  });

  bench('Filtered query (100K entities, 50% match)', () => {
    const world = new World();

    // Setup - 50% have both components
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      if (i % 2 === 0) {
        world.addComponent(entity, new VelocityComponent());
      }
    }

    // Benchmark
    const query = world.query([TransformComponent, VelocityComponent]);
    for (const entity of query.entities()) {
      world.getComponent(entity, TransformComponent);
      world.getComponent(entity, VelocityComponent);
    }
  });

  bench('Multiple concurrent queries (100K entities)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent());
      world.addComponent(entity, new HealthComponent());
    }

    // Benchmark - simulate multiple systems querying
    const query1 = world.query([TransformComponent]);
    const query2 = world.query([TransformComponent, VelocityComponent]);
    const query3 = world.query([HealthComponent]);

    for (const entity of query1.entities()) {
      world.getComponent(entity, TransformComponent);
    }
    for (const entity of query2.entities()) {
      world.getComponent(entity, TransformComponent);
      world.getComponent(entity, VelocityComponent);
    }
    for (const entity of query3.entities()) {
      world.getComponent(entity, HealthComponent);
    }
  });
});

describe('System Benchmarks', () => {
  bench('Single system update (100K entities)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent({
        position: new Vector3(i, 0, 0)
      }));
      world.addComponent(entity, new VelocityComponent(1, 0, 0));
    }

    world.addSystem(new MovementSystem());
    world.init();

    // Benchmark
    world.update(0.016); // 60 FPS
  });

  bench('Multiple system updates (100K entities)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent(1, 0, 0));
      world.addComponent(entity, new HealthComponent(100));
    }

    world.addSystem(new MovementSystem());
    world.addSystem(new HealthRegenSystem());
    world.init();

    // Benchmark
    world.update(0.016); // 60 FPS
  });

  bench('System update with component modifications (10K entities)', () => {
    const world = new World();

    // Setup
    for (let i = 0; i < 10_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      world.addComponent(entity, new VelocityComponent(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ));
    }

    world.addSystem(new MovementSystem());
    world.init();

    // Benchmark - multiple frames
    for (let i = 0; i < 100; i++) {
      world.update(0.016);
    }
  });
});

describe('Archetype Benchmarks', () => {
  bench('Archetype creation (varied component combinations)', () => {
    const world = new World();

    // Create entities with different component combinations
    // This forces archetype creation
    for (let i = 0; i < 10_000; i++) {
      const entity = world.createEntity();

      if (i % 4 === 0) {
        world.addComponent(entity, new TransformComponent());
      } else if (i % 4 === 1) {
        world.addComponent(entity, new TransformComponent());
        world.addComponent(entity, new VelocityComponent());
      } else if (i % 4 === 2) {
        world.addComponent(entity, new TransformComponent());
        world.addComponent(entity, new HealthComponent());
      } else {
        world.addComponent(entity, new TransformComponent());
        world.addComponent(entity, new VelocityComponent());
        world.addComponent(entity, new HealthComponent());
      }
    }
  });

  bench('Archetype transitions (100K component additions)', () => {
    const world = new World();
    const entities: number[] = [];

    // Create entities with basic component
    for (let i = 0; i < 100_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent());
      entities.push(entity);
    }

    // Add second component - forces archetype transition
    for (const entity of entities) {
      world.addComponent(entity, new VelocityComponent());
    }
  });
});

describe('Complex Scenarios', () => {
  bench('Game loop simulation (10K entities, 60 frames)', () => {
    const world = new World();

    // Setup realistic game scenario
    for (let i = 0; i < 10_000; i++) {
      const entity = world.createEntity();
      world.addComponent(entity, new TransformComponent({
        position: new Vector3(
          Math.random() * 100 - 50,
          0,
          Math.random() * 100 - 50
        ),
        rotation: Quaternion.fromAxisAngle(Vector3.up(), Math.random() * Math.PI * 2),
        scale: Vector3.one()
      }));
      world.addComponent(entity, new VelocityComponent(
        Math.random() * 2 - 1,
        0,
        Math.random() * 2 - 1
      ));
      world.addComponent(entity, new HealthComponent(100));
      world.addComponent(entity, new ActiveComponent());
    }

    world.addSystem(new MovementSystem());
    world.addSystem(new HealthRegenSystem());
    world.init();

    // Simulate 60 frames at 60 FPS
    for (let i = 0; i < 60; i++) {
      world.update(0.016);
    }
  });

  bench('Massive entity churn (10K creates/destroys)', () => {
    const world = new World();
    const entities: number[] = [];

    // Simulate continuous entity creation and destruction
    for (let cycle = 0; cycle < 10; cycle++) {
      // Create 1K entities
      for (let i = 0; i < 1_000; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, new TransformComponent());
        world.addComponent(entity, new VelocityComponent());
        entities.push(entity);
      }

      // Destroy half
      for (let i = 0; i < 500; i++) {
        const entity = entities.shift();
        if (entity !== undefined) {
          world.destroyEntity(entity);
        }
      }
    }
  });
});
