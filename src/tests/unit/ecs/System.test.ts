import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { System, SystemContext, SystemGroup, SystemPriorities } from '../../../ecs/System';
import { World } from '../../../ecs/World';
import { ComponentRegistry, IComponent } from '../../../ecs/ComponentRegistry';
import { Query } from '../../../ecs/Query';

// Test components
class Position implements IComponent {
  x: number = 0;
  y: number = 0;
  z: number = 0;
}

class Velocity implements IComponent {
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;
}

class Health implements IComponent {
  current: number = 100;
  max: number = 100;
}

// Test systems
class TestSystem extends System {
  query = [Position];
  updateCalled = false;
  fixedUpdateCalled = false;
  lateUpdateCalled = false;
  onInitCalled = false;
  onStartCalled = false;
  onStopCalled = false;
  onDestroyCalled = false;
  lastContext: SystemContext | null = null;

  onInit(): void {
    this.onInitCalled = true;
  }

  onStart(): void {
    this.onStartCalled = true;
  }

  update(context: SystemContext): void {
    this.updateCalled = true;
    this.lastContext = context;
  }

  fixedUpdate(context: SystemContext): void {
    this.fixedUpdateCalled = true;
    this.lastContext = context;
  }

  lateUpdate(context: SystemContext): void {
    this.lateUpdateCalled = true;
    this.lastContext = context;
  }

  onStop(): void {
    this.onStopCalled = true;
  }

  onDestroy(): void {
    this.onDestroyCalled = true;
  }
}

class MovementSystem extends System {
  query = { all: [Position, Velocity] };
  processedEntities: number[] = [];

  update(context: SystemContext): void {
    const query = this.getQuery();
    query.forEach((entity) => {
      this.processedEntities.push(entity);
      const pos = this.world!.getComponent(entity, Position);
      const vel = this.world!.getComponent(entity, Velocity);
      if (pos && vel) {
        pos.x += vel.vx * context.deltaTime;
        pos.y += vel.vy * context.deltaTime;
        pos.z += vel.vz * context.deltaTime;
      }
    });
  }
}

class MinimalSystem extends System {
  query = [Position];
  update(): void {}
}

describe('System', () => {
  let world: World;

  beforeEach(() => {
    ComponentRegistry.reset();
    ComponentRegistry.register(Position);
    ComponentRegistry.register(Velocity);
    ComponentRegistry.register(Health);
    world = new World();
  });

  afterEach(() => {
    world.destroy();
    ComponentRegistry.reset();
  });

  describe('construction', () => {
    it('creates system with default options', () => {
      const system = new MinimalSystem();
      expect(system.name).toBe('MinimalSystem');
      expect(system.priority).toBe(SystemPriorities.DEFAULT);
      expect(system.enabled).toBe(true);
    });

    it('accepts custom name', () => {
      const system = new MinimalSystem({ name: 'CustomName' });
      expect(system.name).toBe('CustomName');
    });

    it('accepts custom priority', () => {
      const system = new MinimalSystem({ priority: 100 });
      expect(system.priority).toBe(100);
    });

    it('accepts enabled state', () => {
      const system = new MinimalSystem({ enabled: false });
      expect(system.enabled).toBe(false);
    });

    it('accepts all options together', () => {
      const system = new MinimalSystem({
        name: 'MySystem',
        priority: 50,
        enabled: false
      });

      expect(system.name).toBe('MySystem');
      expect(system.priority).toBe(50);
      expect(system.enabled).toBe(false);
    });
  });

  describe('lifecycle hooks', () => {
    it('calls onInit when added to initialized world', () => {
      const system = new TestSystem();
      world.init();
      world.addSystem(system);

      expect(system.onInitCalled).toBe(true);
    });

    it('calls onStart when added to running world', () => {
      const system = new TestSystem();
      world.start();
      world.addSystem(system);

      expect(system.onStartCalled).toBe(true);
    });

    it('calls onStop when world stops', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();
      world.stop();

      expect(system.onStopCalled).toBe(true);
    });

    it('calls onDestroy when world destroys', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.destroy();

      expect(system.onDestroyCalled).toBe(true);
    });

    it('calls onDestroy when system removed', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.init();
      world.removeSystem(system);

      expect(system.onDestroyCalled).toBe(true);
    });

    it('lifecycle order is correct', () => {
      const order: string[] = [];

      class OrderedSystem extends System {
        query = [Position];

        onInit() {
          order.push('init');
        }

        onStart() {
          order.push('start');
        }

        update() {
          order.push('update');
        }

        onStop() {
          order.push('stop');
        }

        onDestroy() {
          order.push('destroy');
        }
      }

      const system = new OrderedSystem();
      world.addSystem(system);
      world.start();
      world.update(0.016);
      world.stop();
      world.destroy();

      expect(order).toEqual(['init', 'start', 'update', 'stop', 'destroy']);
    });
  });

  describe('update()', () => {
    it('is called on world update', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.update(0.016);

      expect(system.updateCalled).toBe(true);
    });

    it('receives correct context', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.update(0.5);

      expect(system.lastContext).not.toBeNull();
      expect(system.lastContext!.deltaTime).toBe(0.5);
      expect(system.lastContext!.frameCount).toBe(1);
    });

    it('is not called when disabled', () => {
      const system = new TestSystem();
      system.enabled = false;
      world.addSystem(system);
      world.start();

      world.update(0.016);

      expect(system.updateCalled).toBe(false);
    });

    it('is not called when world not running', () => {
      const system = new TestSystem();
      world.addSystem(system);

      world.update(0.016);

      expect(system.updateCalled).toBe(false);
    });
  });

  describe('fixedUpdate()', () => {
    it('is called on world fixedUpdate', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.fixedUpdate(0.016);

      expect(system.fixedUpdateCalled).toBe(true);
    });

    it('receives correct context', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.fixedUpdate(0.016);

      expect(system.lastContext).not.toBeNull();
      expect(system.lastContext!.deltaTime).toBe(0.016);
      expect(system.lastContext!.fixedDeltaTime).toBe(0.016);
    });

    it('is not called when disabled', () => {
      const system = new TestSystem();
      system.enabled = false;
      world.addSystem(system);
      world.start();

      world.fixedUpdate(0.016);

      expect(system.fixedUpdateCalled).toBe(false);
    });

    it('system without fixedUpdate is not called', () => {
      class NoFixedUpdate extends System {
        query = [Position];
        updateCalled = false;

        update(): void {
          this.updateCalled = true;
        }
      }

      const system = new NoFixedUpdate();
      world.addSystem(system);
      world.start();

      world.fixedUpdate(0.016);

      expect(system.updateCalled).toBe(false);
    });
  });

  describe('lateUpdate()', () => {
    it('is called on world lateUpdate', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      world.lateUpdate(0.016);

      expect(system.lateUpdateCalled).toBe(true);
    });

    it('is not called when disabled', () => {
      const system = new TestSystem();
      system.enabled = false;
      world.addSystem(system);
      world.start();

      world.lateUpdate(0.016);

      expect(system.lateUpdateCalled).toBe(false);
    });

    it('system without lateUpdate is not called', () => {
      class NoLateUpdate extends System {
        query = [Position];
        updateCalled = false;

        update(): void {
          this.updateCalled = true;
        }
      }

      const system = new NoLateUpdate();
      world.addSystem(system);
      world.start();

      world.lateUpdate(0.016);

      expect(system.updateCalled).toBe(false);
    });
  });

  describe('getQuery()', () => {
    it('returns query for system', () => {
      const system = new TestSystem();
      world.addSystem(system);

      const query = system['getQuery']();
      expect(query).toBeDefined();
    });

    it('throws when system not attached to world', () => {
      const system = new TestSystem();

      expect(() => system['getQuery']()).toThrow(/not attached to a world/i);
    });

    it('caches query result', () => {
      const system = new TestSystem();
      world.addSystem(system);

      const query1 = system['getQuery']();
      const query2 = system['getQuery']();

      expect(query1).toBe(query2);
    });

    it('handles array query descriptor', () => {
      class ArrayQuerySystem extends System {
        query = [Position, Velocity];
        update(): void {}
      }

      const system = new ArrayQuerySystem();
      world.addSystem(system);

      const query = system['getQuery']();
      expect(query).toBeDefined();
    });

    it('handles object query descriptor', () => {
      class ObjectQuerySystem extends System {
        query = { all: [Position], none: [Velocity] };
        update(): void {}
      }

      const system = new ObjectQuerySystem();
      world.addSystem(system);

      const query = system['getQuery']();
      expect(query).toBeDefined();
    });
  });

  describe('priority ordering', () => {
    it('executes systems in priority order', () => {
      const order: number[] = [];

      class HighPriority extends System {
        query = [Position];
        priority = 100;
        update() {
          order.push(100);
        }
      }

      class MediumPriority extends System {
        query = [Position];
        priority = 50;
        update() {
          order.push(50);
        }
      }

      class LowPriority extends System {
        query = [Position];
        priority = -50;
        update() {
          order.push(-50);
        }
      }

      world.addSystem(new HighPriority());
      world.addSystem(new MediumPriority());
      world.addSystem(new LowPriority());

      world.start();
      world.update(0.016);

      expect(order).toEqual([-50, 50, 100]);
    });

    it('uses standard priorities correctly', () => {
      const order: string[] = [];

      class InputSystem extends System {
        query = [Position];
        priority = SystemPriorities.INPUT;
        update() {
          order.push('input');
        }
      }

      class PhysicsSystem extends System {
        query = [Position];
        priority = SystemPriorities.PHYSICS;
        update() {
          order.push('physics');
        }
      }

      class RenderSystem extends System {
        query = [Position];
        priority = SystemPriorities.RENDERING;
        update() {
          order.push('render');
        }
      }

      world.addSystem(new RenderSystem());
      world.addSystem(new PhysicsSystem());
      world.addSystem(new InputSystem());

      world.start();
      world.update(0.016);

      expect(order).toEqual(['input', 'physics', 'render']);
    });
  });

  describe('integration with entities', () => {
    it('processes entities matching query', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Position());
      world.addComponent(e1, new Velocity());

      const e2 = world.createEntity();
      world.addComponent(e2, new Position());

      const system = new MovementSystem();
      world.addSystem(system);
      world.start();

      world.update(0.016);

      expect(system.processedEntities).toContain(e1);
      expect(system.processedEntities).not.toContain(e2);
    });

    it('updates entity components correctly', () => {
      const entity = world.createEntity();
      const pos = new Position();
      pos.x = 0;
      const vel = new Velocity();
      vel.vx = 10;

      world.addComponent(entity, pos);
      world.addComponent(entity, vel);

      world.addSystem(new MovementSystem());
      world.start();

      world.update(1.0);

      const updatedPos = world.getComponent(entity, Position);
      expect(updatedPos?.x).toBe(10);
    });
  });

  describe('enabled state', () => {
    it('can be enabled and disabled', () => {
      const system = new TestSystem();
      world.addSystem(system);
      world.start();

      system.enabled = false;
      world.update(0.016);
      expect(system.updateCalled).toBe(false);

      system.updateCalled = false;
      system.enabled = true;
      world.update(0.016);
      expect(system.updateCalled).toBe(true);
    });
  });
});

describe('SystemGroup', () => {
  let world: World;

  beforeEach(() => {
    ComponentRegistry.reset();
    ComponentRegistry.register(Position);
    ComponentRegistry.register(Velocity);
    world = new World();
  });

  afterEach(() => {
    world.destroy();
    ComponentRegistry.reset();
  });

  describe('construction', () => {
    it('creates group with name', () => {
      const group = new SystemGroup('TestGroup');
      expect(group.name).toBe('TestGroup');
      expect(group.priority).toBe(SystemPriorities.DEFAULT);
      expect(group.enabled).toBe(true);
      expect(group.size).toBe(0);
    });

    it('creates group with custom priority', () => {
      const group = new SystemGroup('TestGroup', 100);
      expect(group.priority).toBe(100);
    });

    it('starts with empty system list', () => {
      const group = new SystemGroup('TestGroup');
      expect(group.systems).toHaveLength(0);
    });
  });

  describe('add()', () => {
    it('adds system to group', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      group.add(system);

      expect(group.size).toBe(1);
      expect(group.systems).toContain(system);
    });

    it('adds systems in priority order', () => {
      const group = new SystemGroup('TestGroup');

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

      const high = new HighPriority();
      const low = new LowPriority();

      group.add(high);
      group.add(low);

      expect(group.systems[0]).toBe(low);
      expect(group.systems[1]).toBe(high);
    });

    it('returns this for chaining', () => {
      const group = new SystemGroup('TestGroup');
      const result = group.add(new MinimalSystem());

      expect(result).toBe(group);
    });

    it('throws if system already in group', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      group.add(system);

      expect(() => group.add(system)).toThrow(/already in group/i);
    });
  });

  describe('remove()', () => {
    it('removes system from group', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      group.add(system);
      const removed = group.remove(system);

      expect(removed).toBe(true);
      expect(group.size).toBe(0);
    });

    it('returns false for non-existent system', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      const removed = group.remove(system);

      expect(removed).toBe(false);
    });
  });

  describe('has()', () => {
    it('returns true for system in group', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      group.add(system);

      expect(group.has(system)).toBe(true);
    });

    it('returns false for system not in group', () => {
      const group = new SystemGroup('TestGroup');
      const system = new MinimalSystem();

      expect(group.has(system)).toBe(false);
    });
  });

  describe('update()', () => {
    it('updates all systems in group', () => {
      const group = new SystemGroup('TestGroup');
      const s1 = new TestSystem();
      const s2 = new TestSystem();

      group.add(s1);
      group.add(s2);

      world.addSystemGroup(group);
      world.start();

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 0,
        frameCount: 0
      };

      group.update(context);

      expect(s1.updateCalled).toBe(true);
      expect(s2.updateCalled).toBe(true);
    });

    it('skips disabled systems', () => {
      const group = new SystemGroup('TestGroup');
      const system = new TestSystem();
      system.enabled = false;

      group.add(system);

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 0,
        frameCount: 0
      };

      group.update(context);

      expect(system.updateCalled).toBe(false);
    });

    it('does not update when group disabled', () => {
      const group = new SystemGroup('TestGroup');
      const system = new TestSystem();

      group.add(system);
      group.enabled = false;

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 0,
        frameCount: 0
      };

      group.update(context);

      expect(system.updateCalled).toBe(false);
    });
  });

  describe('fixedUpdate()', () => {
    it('calls fixedUpdate on all systems', () => {
      const group = new SystemGroup('TestGroup');
      const s1 = new TestSystem();
      const s2 = new TestSystem();

      group.add(s1);
      group.add(s2);

      world.addSystemGroup(group);
      world.start();

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 0,
        frameCount: 0
      };

      group.fixedUpdate(context);

      expect(s1.fixedUpdateCalled).toBe(true);
      expect(s2.fixedUpdateCalled).toBe(true);
    });
  });

  describe('lateUpdate()', () => {
    it('calls lateUpdate on all systems', () => {
      const group = new SystemGroup('TestGroup');
      const s1 = new TestSystem();
      const s2 = new TestSystem();

      group.add(s1);
      group.add(s2);

      world.addSystemGroup(group);
      world.start();

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 0,
        frameCount: 0
      };

      group.lateUpdate(context);

      expect(s1.lateUpdateCalled).toBe(true);
      expect(s2.lateUpdateCalled).toBe(true);
    });
  });

  describe('size', () => {
    it('returns number of systems', () => {
      const group = new SystemGroup('TestGroup');

      expect(group.size).toBe(0);

      group.add(new MinimalSystem());
      expect(group.size).toBe(1);

      group.add(new TestSystem());
      expect(group.size).toBe(2);
    });
  });

  describe('clear()', () => {
    it('removes all systems', () => {
      const group = new SystemGroup('TestGroup');
      group.add(new MinimalSystem());
      group.add(new TestSystem());

      group.clear();

      expect(group.size).toBe(0);
    });
  });

  describe('iterator', () => {
    it('supports for-of loops', () => {
      const group = new SystemGroup('TestGroup');
      const s1 = new MinimalSystem();
      const s2 = new TestSystem();

      group.add(s1);
      group.add(s2);

      const systems: System[] = [];
      for (const system of group) {
        systems.push(system);
      }

      expect(systems).toContain(s1);
      expect(systems).toContain(s2);
      expect(systems).toHaveLength(2);
    });
  });
});

describe('SystemPriorities', () => {
  it('has correct ordering', () => {
    expect(SystemPriorities.FIRST).toBeLessThan(SystemPriorities.EARLY);
    expect(SystemPriorities.EARLY).toBeLessThan(SystemPriorities.INPUT);
    expect(SystemPriorities.INPUT).toBeLessThan(SystemPriorities.PHYSICS);
    expect(SystemPriorities.PHYSICS).toBeLessThan(SystemPriorities.PRE_UPDATE);
    expect(SystemPriorities.PRE_UPDATE).toBeLessThan(SystemPriorities.DEFAULT);
    expect(SystemPriorities.DEFAULT).toBeLessThan(SystemPriorities.POST_UPDATE);
    expect(SystemPriorities.POST_UPDATE).toBeLessThan(SystemPriorities.LATE);
    expect(SystemPriorities.LATE).toBeLessThan(SystemPriorities.ANIMATION);
    expect(SystemPriorities.ANIMATION).toBeLessThan(SystemPriorities.RENDERING);
    expect(SystemPriorities.RENDERING).toBeLessThan(SystemPriorities.DEBUG);
    expect(SystemPriorities.DEBUG).toBeLessThan(SystemPriorities.LAST);
  });
});
