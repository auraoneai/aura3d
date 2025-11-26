import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../../../ecs/World';
import { Entity, EntityUtils } from '../../../ecs/Entity';
import { IComponent, ComponentType } from '../../../ecs/ComponentRegistry';
import { System, SystemContext, SystemGroup, SystemPriorities } from '../../../ecs/System';
import { ComponentRegistry } from '../../../ecs/ComponentRegistry';

// Test component classes
class Position implements IComponent {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}

class Velocity implements IComponent {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}

class Health implements IComponent {
  constructor(public current: number = 100, public max: number = 100) {}
}

class Tag implements IComponent {
  constructor(public name: string = '') {}
}

class Frozen implements IComponent {}

// Test system classes
class TestSystem extends System {
  query = [Position];
  updateCount = 0;
  fixedUpdateCount = 0;
  lateUpdateCount = 0;
  initCalled = false;
  startCalled = false;
  stopCalled = false;
  destroyCalled = false;

  onInit(): void {
    this.initCalled = true;
  }

  onStart(): void {
    this.startCalled = true;
  }

  onStop(): void {
    this.stopCalled = true;
  }

  onDestroy(): void {
    this.destroyCalled = true;
  }

  update(context: SystemContext): void {
    this.updateCount++;
  }

  fixedUpdate(context: SystemContext): void {
    this.fixedUpdateCount++;
  }

  lateUpdate(context: SystemContext): void {
    this.lateUpdateCount++;
  }
}

class MovementSystem extends System {
  query = { all: [Position, Velocity] };
  priority = SystemPriorities.DEFAULT;

  update(context: SystemContext): void {
    const query = this.getQuery();
    query.forEach((entity, components) => {
      const pos = this.world!.getComponent(entity, Position);
      const vel = this.world!.getComponent(entity, Velocity);
      if (pos && vel) {
        pos.x += vel.x * context.deltaTime;
        pos.y += vel.y * context.deltaTime;
        pos.z += vel.z * context.deltaTime;
      }
    });
  }
}

describe('World', () => {
  let world: World;

  beforeEach(() => {
    ComponentRegistry.reset();
    ComponentRegistry.register(Position);
    ComponentRegistry.register(Velocity);
    ComponentRegistry.register(Health);
    ComponentRegistry.register(Tag);
    ComponentRegistry.register(Frozen);
    world = new World();
  });

  afterEach(() => {
    world.destroy();
    ComponentRegistry.reset();
  });

  describe('entity management', () => {
    it('createEntity() returns unique entity', () => {
      const entity1 = world.createEntity();
      const entity2 = world.createEntity();
      const entity3 = world.createEntity();

      expect(entity1).not.toBe(entity2);
      expect(entity2).not.toBe(entity3);
      expect(entity1).not.toBe(entity3);

      expect(EntityUtils.isValid(entity1)).toBe(true);
      expect(EntityUtils.isValid(entity2)).toBe(true);
      expect(EntityUtils.isValid(entity3)).toBe(true);
    });

    it('destroyEntity() removes entity', () => {
      const entity = world.createEntity();
      expect(world.isAlive(entity)).toBe(true);

      world.destroyEntity(entity);
      expect(world.isAlive(entity)).toBe(false);
    });

    it('destroyEntity() throws on invalid entity', () => {
      const entity = world.createEntity();
      world.destroyEntity(entity);

      expect(() => world.destroyEntity(entity)).toThrow();
      expect(() => world.destroyEntity(EntityUtils.INVALID)).toThrow();
    });

    it('isAlive() checks existence correctly', () => {
      const entity = world.createEntity();
      expect(world.isAlive(entity)).toBe(true);

      world.destroyEntity(entity);
      expect(world.isAlive(entity)).toBe(false);

      expect(world.isAlive(EntityUtils.INVALID)).toBe(false);
    });

    it('entityCount returns correct count', () => {
      expect(world.entityCount).toBe(0);

      const e1 = world.createEntity();
      expect(world.entityCount).toBe(1);

      const e2 = world.createEntity();
      const e3 = world.createEntity();
      expect(world.entityCount).toBe(3);

      world.destroyEntity(e2);
      expect(world.entityCount).toBe(2);

      world.destroyEntity(e1);
      world.destroyEntity(e3);
      expect(world.entityCount).toBe(0);
    });

    it('recycling reuses entity IDs', () => {
      const entity1 = world.createEntity();
      const index1 = EntityUtils.getIndex(entity1);
      const gen1 = EntityUtils.getGeneration(entity1);

      world.destroyEntity(entity1);

      const entity2 = world.createEntity();
      const index2 = EntityUtils.getIndex(entity2);
      const gen2 = EntityUtils.getGeneration(entity2);

      expect(index2).toBe(index1);
      expect(gen2).toBe(gen1 + 1);
    });

    it('handles mass entity creation', () => {
      const count = 10000;
      const entities: Entity[] = [];

      for (let i = 0; i < count; i++) {
        entities.push(world.createEntity());
      }

      expect(world.entityCount).toBe(count);

      for (const entity of entities) {
        expect(world.isAlive(entity)).toBe(true);
      }

      for (const entity of entities) {
        world.destroyEntity(entity);
      }

      expect(world.entityCount).toBe(0);
    });

    it('entity creation respects maxEntities limit', () => {
      const smallWorld = new World({ maxEntities: 10 });
      ComponentRegistry.reset();
      ComponentRegistry.register(Position);

      for (let i = 0; i < 10; i++) {
        smallWorld.createEntity();
      }

      expect(() => smallWorld.createEntity()).toThrow(/maximum entity limit/i);
      smallWorld.destroy();
    });
  });

  describe('component operations', () => {
    it('addComponent() attaches component', () => {
      const entity = world.createEntity();
      const pos = new Position(10, 20, 30);

      world.addComponent(entity, pos);

      expect(world.hasComponent(entity, Position)).toBe(true);
      const retrieved = world.getComponent(entity, Position);
      expect(retrieved).toBe(pos);
      expect(retrieved?.x).toBe(10);
      expect(retrieved?.y).toBe(20);
      expect(retrieved?.z).toBe(30);
    });

    it('removeComponent() detaches component', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(5, 10, 15));

      expect(world.hasComponent(entity, Position)).toBe(true);

      world.removeComponent(entity, Position);

      expect(world.hasComponent(entity, Position)).toBe(false);
      expect(world.getComponent(entity, Position)).toBeUndefined();
    });

    it('getComponent() retrieves component', () => {
      const entity = world.createEntity();
      const pos = new Position(1, 2, 3);
      world.addComponent(entity, pos);

      const retrieved = world.getComponent(entity, Position);
      expect(retrieved).toBe(pos);
      expect(retrieved?.x).toBe(1);
    });

    it('getComponent() returns undefined for missing component', () => {
      const entity = world.createEntity();
      expect(world.getComponent(entity, Position)).toBeUndefined();
    });

    it('hasComponent() checks presence correctly', () => {
      const entity = world.createEntity();

      expect(world.hasComponent(entity, Position)).toBe(false);

      world.addComponent(entity, new Position());

      expect(world.hasComponent(entity, Position)).toBe(true);
      expect(world.hasComponent(entity, Velocity)).toBe(false);
    });

    it('setComponent() adds if not present', () => {
      const entity = world.createEntity();
      const pos = new Position(5, 5, 5);

      world.setComponent(entity, pos);

      expect(world.hasComponent(entity, Position)).toBe(true);
      expect(world.getComponent(entity, Position)).toBe(pos);
    });

    it('setComponent() updates if present', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(1, 1, 1));

      const newPos = new Position(10, 10, 10);
      world.setComponent(entity, newPos);

      const retrieved = world.getComponent(entity, Position);
      expect(retrieved?.x).toBe(10);
    });

    it('supports multiple components on single entity', () => {
      const entity = world.createEntity();
      const pos = new Position(1, 2, 3);
      const vel = new Velocity(4, 5, 6);
      const health = new Health(100, 100);

      world.addComponent(entity, pos);
      world.addComponent(entity, vel);
      world.addComponent(entity, health);

      expect(world.hasComponent(entity, Position)).toBe(true);
      expect(world.hasComponent(entity, Velocity)).toBe(true);
      expect(world.hasComponent(entity, Health)).toBe(true);

      expect(world.getComponent(entity, Position)?.x).toBe(1);
      expect(world.getComponent(entity, Velocity)?.x).toBe(4);
      expect(world.getComponent(entity, Health)?.current).toBe(100);
    });
  });

  describe('system management', () => {
    it('addSystem() registers system', () => {
      const system = new TestSystem();
      world.addSystem(system);

      expect(world.hasSystem(system)).toBe(true);
      expect(world.systemCount).toBe(1);
    });

    it('addSystem() throws if system already added', () => {
      const system = new TestSystem();
      world.addSystem(system);

      expect(() => world.addSystem(system)).toThrow(/already added/i);
    });

    it('removeSystem() unregisters system', () => {
      const system = new TestSystem();
      world.addSystem(system);

      const removed = world.removeSystem(system);

      expect(removed).toBe(true);
      expect(world.hasSystem(system)).toBe(false);
      expect(world.systemCount).toBe(0);
    });

    it('removeSystem() returns false for non-existent system', () => {
      const system = new TestSystem();
      const removed = world.removeSystem(system);
      expect(removed).toBe(false);
    });

    it('getSystem() retrieves by type', () => {
      const testSystem = new TestSystem();
      const movementSystem = new MovementSystem();

      world.addSystem(testSystem);
      world.addSystem(movementSystem);

      expect(world.getSystem(TestSystem)).toBe(testSystem);
      expect(world.getSystem(MovementSystem)).toBe(movementSystem);
    });

    it('getSystem() returns undefined for non-existent type', () => {
      expect(world.getSystem(TestSystem)).toBeUndefined();
    });

    it('systems update in priority order', () => {
      const order: number[] = [];

      class System1 extends System {
        query = [Position];
        priority = 100;
        update() { order.push(1); }
      }

      class System2 extends System {
        query = [Position];
        priority = -100;
        update() { order.push(2); }
      }

      class System3 extends System {
        query = [Position];
        priority = 0;
        update() { order.push(3); }
      }

      world.addSystem(new System1());
      world.addSystem(new System2());
      world.addSystem(new System3());

      world.start();
      world.update(0.016);

      expect(order).toEqual([2, 3, 1]);
    });

    it('getSystems() returns all systems in priority order', () => {
      class HighPriority extends System {
        query = [Position];
        priority = 100;
        update() {}
      }

      class LowPriority extends System {
        query = [Position];
        priority = -100;
        update() {}
      }

      const low = new LowPriority();
      const high = new HighPriority();

      world.addSystem(high);
      world.addSystem(low);

      const systems = world.getSystems();
      expect(systems.length).toBe(2);
      expect(systems[0]).toBe(low);
      expect(systems[1]).toBe(high);
    });
  });

  describe('queries', () => {
    it('createQuery() returns matching entities', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Position(1, 1, 1));

      const e2 = world.createEntity();
      world.addComponent(e2, new Position(2, 2, 2));
      world.addComponent(e2, new Velocity(1, 1, 1));

      const query = world.createQuery({ all: [Position] });
      expect(query.entityCount).toBe(2);

      const velocityQuery = world.createQuery({ all: [Position, Velocity] });
      expect(velocityQuery.entityCount).toBe(1);
    });

    it('queries update when components change', () => {
      const entity = world.createEntity();
      const query = world.createQuery({ all: [Position, Velocity] });

      expect(query.entityCount).toBe(0);

      world.addComponent(entity, new Position());
      expect(query.entityCount).toBe(0);

      world.addComponent(entity, new Velocity());
      expect(query.entityCount).toBe(1);

      world.removeComponent(entity, Velocity);
      expect(query.entityCount).toBe(0);
    });

    it('complex queries with multiple components', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Position());
      world.addComponent(e1, new Velocity());

      const e2 = world.createEntity();
      world.addComponent(e2, new Position());
      world.addComponent(e2, new Health());

      const e3 = world.createEntity();
      world.addComponent(e3, new Position());
      world.addComponent(e3, new Velocity());
      world.addComponent(e3, new Health());

      const query = world.createQuery({
        all: [Position, Velocity],
        any: [Health]
      });

      expect(query.entityCount).toBe(1);

      const entities = Array.from(query);
      expect(entities).toContain(e3);
    });

    it('exclusion queries work correctly', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Position());

      const e2 = world.createEntity();
      world.addComponent(e2, new Position());
      world.addComponent(e2, new Frozen());

      const query = world.createQuery({
        all: [Position],
        none: [Frozen]
      });

      expect(query.entityCount).toBe(1);

      const entities = Array.from(query);
      expect(entities).toContain(e1);
      expect(entities).not.toContain(e2);
    });

    it('getQuery() caches queries with same descriptor', () => {
      const query1 = world.getQuery({ all: [Position] });
      const query2 = world.getQuery({ all: [Position] });

      expect(query1).toBe(query2);
    });
  });

  describe('lifecycle', () => {
    it('init() calls onInit on all systems', () => {
      const system1 = new TestSystem();
      const system2 = new TestSystem();

      world.addSystem(system1);
      world.addSystem(system2);

      expect(system1.initCalled).toBe(true);
      expect(system2.initCalled).toBe(true);
    });

    it('start() calls onStart on all systems', () => {
      const system = new TestSystem();
      world.addSystem(system);

      world.start();

      expect(system.startCalled).toBe(true);
    });

    it('start() calls init if not initialized', () => {
      const system = new TestSystem();
      system.initCalled = false;
      world.addSystem(system);
      system.initCalled = false;

      world.start();

      expect(system.initCalled).toBe(true);
      expect(system.startCalled).toBe(true);
    });

    it('stop() calls onStop on all systems', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.stop();

      expect(system.stopCalled).toBe(true);
    });

    it('destroy() calls onDestroy on all systems', () => {
      const system = new TestSystem();
      world.addSystem(system);

      world.destroy();

      expect(system.destroyCalled).toBe(true);
    });

    it('destroy() stops world if running', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.destroy();

      expect(system.stopCalled).toBe(true);
      expect(system.destroyCalled).toBe(true);
    });

    it('clear() removes all entities but keeps systems', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const system = new TestSystem();
      world.addSystem(system);

      world.clear();

      expect(world.entityCount).toBe(0);
      expect(world.systemCount).toBe(1);
      expect(world.isAlive(e1)).toBe(false);
      expect(world.isAlive(e2)).toBe(false);
    });

    it('clear() resets time counters', () => {
      world.start();
      world.update(1.0);
      world.fixedUpdate(0.5);

      expect(world.time).toBeGreaterThan(0);
      expect(world.frameCount).toBeGreaterThan(0);

      world.clear();

      expect(world.time).toBe(0);
      expect(world.fixedTime).toBe(0);
      expect(world.frameCount).toBe(0);
    });
  });

  describe('update methods', () => {
    it('update() updates all enabled systems', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.update(0.016);
      expect(system.updateCount).toBe(1);

      world.update(0.016);
      expect(system.updateCount).toBe(2);
    });

    it('update() skips disabled systems', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      system.enabled = false;
      world.update(0.016);

      expect(system.updateCount).toBe(0);
    });

    it('update() does not run when world is not started', () => {
      const system = new TestSystem();
      world.addSystem(system);

      world.update(0.016);

      expect(system.updateCount).toBe(0);
    });

    it('fixedUpdate() updates systems with fixedUpdate method', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.fixedUpdate(0.016);
      expect(system.fixedUpdateCount).toBe(1);

      world.fixedUpdate(0.016);
      expect(system.fixedUpdateCount).toBe(2);
    });

    it('lateUpdate() updates systems with lateUpdate method', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.lateUpdate(0.016);
      expect(system.lateUpdateCount).toBe(1);

      world.lateUpdate(0.016);
      expect(system.lateUpdateCount).toBe(2);
    });

    it('update() provides correct context', () => {
      let receivedContext: SystemContext | null = null;

      class ContextSystem extends System {
        query = [Position];
        update(context: SystemContext): void {
          receivedContext = context;
        }
      }

      world.addSystem(new ContextSystem());
      world.start();
      world.update(0.5);

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.deltaTime).toBe(0.5);
      expect(receivedContext!.time).toBe(0.5);
      expect(receivedContext!.frameCount).toBe(1);
    });
  });

  describe('time tracking', () => {
    it('time accumulates deltaTime', () => {
      world.start();

      expect(world.time).toBe(0);

      world.update(0.5);
      expect(world.time).toBe(0.5);

      world.update(0.3);
      expect(world.time).toBe(0.8);
    });

    it('fixedTime accumulates fixedDeltaTime', () => {
      world.start();

      expect(world.fixedTime).toBe(0);

      world.fixedUpdate(0.016);
      expect(world.fixedTime).toBeCloseTo(0.016);

      world.fixedUpdate(0.016);
      expect(world.fixedTime).toBeCloseTo(0.032);
    });

    it('frameCount increments on update', () => {
      world.start();

      expect(world.frameCount).toBe(0);

      world.update(0.016);
      expect(world.frameCount).toBe(1);

      world.update(0.016);
      expect(world.frameCount).toBe(2);
    });
  });

  describe('command buffer', () => {
    it('defer.createEntity() creates entity on execute', () => {
      world.start();

      const tempId = world.defer.createEntity();
      expect(tempId).toBeLessThan(0);
      expect(world.entityCount).toBe(0);

      world.executeCommands();
      expect(world.entityCount).toBe(1);
    });

    it('defer.destroyEntity() destroys on execute', () => {
      world.start();
      const entity = world.createEntity();

      world.defer.destroyEntity(entity);
      expect(world.isAlive(entity)).toBe(true);

      world.executeCommands();
      expect(world.isAlive(entity)).toBe(false);
    });

    it('defer.addComponent() adds on execute', () => {
      world.start();
      const entity = world.createEntity();

      world.defer.addComponent(entity, new Position(5, 5, 5));
      expect(world.hasComponent(entity, Position)).toBe(false);

      world.executeCommands();
      expect(world.hasComponent(entity, Position)).toBe(true);
    });

    it('defer.removeComponent() removes on execute', () => {
      world.start();
      const entity = world.createEntity();
      world.addComponent(entity, new Position());

      world.defer.removeComponent(entity, Position);
      expect(world.hasComponent(entity, Position)).toBe(true);

      world.executeCommands();
      expect(world.hasComponent(entity, Position)).toBe(false);
    });
  });

  describe('system groups', () => {
    it('addSystemGroup() registers group', () => {
      const group = new SystemGroup('TestGroup');
      group.add(new TestSystem());

      world.addSystemGroup(group);

      expect(world.systemCount).toBe(1);
    });

    it('addSystemGroup() respects priority order', () => {
      const order: number[] = [];

      class S1 extends System {
        query = [Position];
        update() { order.push(1); }
      }

      class S2 extends System {
        query = [Position];
        update() { order.push(2); }
      }

      const group1 = new SystemGroup('G1', 100);
      group1.add(new S1());

      const group2 = new SystemGroup('G2', -100);
      group2.add(new S2());

      world.addSystemGroup(group1);
      world.addSystemGroup(group2);

      world.start();
      world.update(0.016);

      expect(order).toEqual([2, 1]);
    });

    it('removeSystemGroup() unregisters group', () => {
      const group = new SystemGroup('TestGroup');
      group.add(new TestSystem());

      world.addSystemGroup(group);
      expect(world.systemCount).toBe(1);

      const removed = world.removeSystemGroup(group);
      expect(removed).toBe(true);
      expect(world.systemCount).toBe(0);
    });
  });

  describe('events', () => {
    it('onEntityCreated fires when entity created', () => {
      let created: Entity | null = null;
      world.onEntityCreated = (entity) => { created = entity; };

      const entity = world.createEntity();

      expect(created).toBe(entity);
    });

    it('onEntityDestroyed fires when entity destroyed', () => {
      let destroyed: Entity | null = null;
      world.onEntityDestroyed = (entity) => { destroyed = entity; };

      const entity = world.createEntity();
      world.destroyEntity(entity);

      expect(destroyed).toBe(entity);
    });

    it('onComponentAdded fires when component added', () => {
      let addedEntity: Entity | null = null;
      let addedComponentId: number | null = null;
      world.onComponentAdded = (entity, componentId) => {
        addedEntity = entity;
        addedComponentId = componentId;
      };

      const entity = world.createEntity();
      world.addComponent(entity, new Position());

      expect(addedEntity).toBe(entity);
      expect(addedComponentId).toBe(ComponentRegistry.getId(Position));
    });

    it('onComponentRemoved fires when component removed', () => {
      let removedEntity: Entity | null = null;
      let removedComponentId: number | null = null;
      world.onComponentRemoved = (entity, componentId) => {
        removedEntity = entity;
        removedComponentId = componentId;
      };

      const entity = world.createEntity();
      world.addComponent(entity, new Position());
      world.removeComponent(entity, Position);

      expect(removedEntity).toBe(entity);
      expect(removedComponentId).toBe(ComponentRegistry.getId(Position));
    });
  });

  describe('debug info', () => {
    it('getDebugInfo() returns complete world state', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.createEntity();
      world.start();
      world.update(0.5);

      const info = world.getDebugInfo() as any;

      expect(info.initialized).toBe(true);
      expect(info.running).toBe(true);
      expect(info.time).toBe(0.5);
      expect(info.frameCount).toBe(1);
      expect(info.entities.count).toBe(1);
      expect(info.systems.total).toBe(1);
    });
  });

  describe('integration', () => {
    it('complete game loop simulation', () => {
      const entity1 = world.createEntity();
      world.addComponent(entity1, new Position(0, 0, 0));
      world.addComponent(entity1, new Velocity(10, 0, 0));

      const entity2 = world.createEntity();
      world.addComponent(entity2, new Position(100, 100, 100));
      world.addComponent(entity2, new Velocity(-5, 0, 0));

      const movement = new MovementSystem();
      world.addSystem(movement);
      world.start();

      world.update(1.0);

      const pos1 = world.getComponent(entity1, Position);
      expect(pos1?.x).toBe(10);

      const pos2 = world.getComponent(entity2, Position);
      expect(pos2?.x).toBe(95);
    });

    it('handles safe entity removal during iteration', () => {
      const entities: Entity[] = [];
      for (let i = 0; i < 100; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Position());
        entities.push(e);
      }

      const query = world.createQuery({ all: [Position] });
      let count = 0;

      query.forEach((entity) => {
        count++;
        if (count === 50) {
          world.defer.destroyEntity(entity);
        }
      });

      world.executeCommands();
      expect(world.entityCount).toBe(99);
    });
  });
});
