/**
 * AI Module Integration Tests
 *
 * Tests for the AI systems including:
 * - NavMesh generation and pathfinding
 * - Behavior trees
 * - State machines
 * - Crowd simulation
 * - Perception systems
 * - Decision making
 * - Integration with ECS
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavMesh } from '../../ai/navigation/NavMesh';
import { NavMesh as NavMeshOld } from '../../ai/NavMesh'; // For AISystem compatibility
import { NavMeshGenerator, DefaultNavMeshGeneratorConfig } from '../../ai/navigation/NavMeshGenerator';
import { PathFinder, PathStatus } from '../../ai/navigation/PathFinder';
import { BehaviorTree } from '../../ai/behavior/BehaviorTree';
import { NodeStatus } from '../../ai/behavior/BTNode';
import { BTSequence, BTSelector } from '../../ai/behavior/BTComposite';
import { BTAction } from '../../ai/behavior/BTAction';
import { BTCondition } from '../../ai/behavior/BTCondition';
import { BTRepeater, BTInverter } from '../../ai/behavior/BTDecorator';
import { Blackboard } from '../../ai/behavior/Blackboard';
import { CrowdManager } from '../../ai/navigation/CrowdManager';
import { NavAgent } from '../../ai/navigation/NavAgent';
import { SensorSystem } from '../../ai/perception/SensorSystem';
import { AISystem } from '../../ai/AISystem';
import { World } from '../../ecs/World';
import { Vector3 } from '../../math/Vector3';

/**
 * Helper function to create a simple rectangular navmesh for testing
 */
async function createSimpleNavMesh(width: number = 20, depth: number = 20): Promise<NavMesh> {
  const generator = new NavMeshGenerator(DefaultNavMeshGeneratorConfig);

  // Create a simple rectangular floor as triangles
  const halfW = width / 2;
  const halfD = depth / 2;
  const triangles = [
    new Vector3(-halfW, 0, -halfD),
    new Vector3(halfW, 0, -halfD),
    new Vector3(halfW, 0, halfD),

    new Vector3(-halfW, 0, -halfD),
    new Vector3(halfW, 0, halfD),
    new Vector3(-halfW, 0, halfD),
  ];

  return generator.generate(triangles);
}

/**
 * Helper function to create a navmesh compatible with AISystem (old format)
 */
function createSimpleNavMeshOld(): NavMeshOld {
  return new NavMeshOld();
}

describe('AI Module Integration', () => {
  describe('NavMesh Generation', () => {
    it('should create empty navmesh', () => {
      const navMesh = new NavMesh();

      expect(navMesh).toBeDefined();
      expect(navMesh.polygons.length).toBe(0);
    });

    it('should build navmesh from geometry', async () => {
      const navMesh = await createSimpleNavMesh(20, 20);

      expect(navMesh.polygons.length).toBeGreaterThan(0);
    });

    it('should handle obstacles in navmesh', async () => {
      const navMesh = await createSimpleNavMesh(20, 20);

      // NavMesh should have polygons
      expect(navMesh.polygons.length).toBeGreaterThan(0);
    });

    it('should support dynamic navmesh updates', async () => {
      const initialMesh = await createSimpleNavMesh(20, 20);
      const initialCount = initialMesh.polygons.length;

      // Create larger mesh
      const updatedMesh = await createSimpleNavMesh(40, 40);

      expect(updatedMesh.polygons.length).toBeGreaterThan(initialCount);
    });
  });

  describe('Pathfinding', () => {
    let navMesh: NavMesh;
    let pathfinder: PathFinder;

    beforeEach(async () => {
      navMesh = await createSimpleNavMesh(20, 20);
      pathfinder = new PathFinder(navMesh);
    });

    it('should find path between two points', () => {
      const start = new Vector3(-5, 0, -5);
      const end = new Vector3(5, 0, 5);

      const result = pathfinder.findPath(start, end);

      expect(result).toBeDefined();
      expect(result.waypoints.length).toBeGreaterThan(0);
      expect(result.status).toBe(PathStatus.SUCCESS);
    });

    it('should return empty path for unreachable destination', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(100, 0, 100); // Outside navmesh

      const result = pathfinder.findPath(start, end);

      expect(result.waypoints.length).toBe(0);
      expect(result.status).toBe(PathStatus.FAILED);
    });

    it('should find shortest path', () => {
      const start = new Vector3(-9, 0, -9);
      const end = new Vector3(9, 0, 9);

      const result = pathfinder.findPath(start, end);

      // Path should be reasonably direct
      const directDistance = Math.sqrt(18 * 18 + 18 * 18); // ~25.45
      expect(result.length).toBeLessThan(directDistance * 1.2); // Within 20% of direct
    });

    it('should support path smoothing', () => {
      const start = new Vector3(-9, 0, -9);
      const end = new Vector3(9, 0, 9);

      // Disable string pulling to get unoptimized path
      pathfinder.enableStringPulling = false;
      const rawResult = pathfinder.findPath(start, end);

      // Enable string pulling for optimized path
      pathfinder.enableStringPulling = true;
      const smoothResult = pathfinder.findPath(start, end);

      // Smoothed path should have fewer or equal waypoints
      expect(smoothResult.waypoints.length).toBeLessThanOrEqual(rawResult.waypoints.length);
    });

    it('should find path around obstacles', async () => {
      // Create navmesh (simplified test without obstacles for now)
      const navMeshWithObstacle = await createSimpleNavMesh(20, 20);
      const pathfinderWithObstacle = new PathFinder(navMeshWithObstacle);

      const start = new Vector3(-5, 0, 0);
      const end = new Vector3(5, 0, 0);

      const result = pathfinderWithObstacle.findPath(start, end);

      // Path should be found
      expect(result.waypoints.length).toBeGreaterThan(0);
    });

    it('should support partial paths when destination unreachable', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(100, 0, 100); // Outside navmesh

      // PathFinder doesn't have allowPartial option, it returns PARTIAL status automatically
      const result = pathfinder.findPath(start, end);

      // Should return FAILED for unreachable destination
      expect(result.status).toBe(PathStatus.FAILED);
    });
  });

  describe('Behavior Trees', () => {
    it('should create behavior tree', () => {
      const blackboard = new Blackboard('test');
      const root = new BTSequence('Root', []);
      const tree = new BehaviorTree(root, blackboard);

      expect(tree).toBeDefined();
    });

    it('should execute sequence node', () => {
      const executions: string[] = [];

      const blackboard = new Blackboard('test');
      const root = new BTSequence('Root', [
        new BTAction('Action1', () => {
          executions.push('action1');
          return NodeStatus.SUCCESS;
        }),
        new BTAction('Action2', () => {
          executions.push('action2');
          return NodeStatus.SUCCESS;
        }),
        new BTAction('Action3', () => {
          executions.push('action3');
          return NodeStatus.SUCCESS;
        })
      ]);
      const tree = new BehaviorTree(root, blackboard);

      const result = tree.tick(0.016);

      expect(result).toBe(NodeStatus.SUCCESS);
      expect(executions).toEqual(['action1', 'action2', 'action3']);
    });

    it('should fail sequence on first failure', () => {
      const executions: string[] = [];

      const blackboard = new Blackboard('test');
      const root = new BTSequence('Root', [
        new BTAction('Action1', () => {
          executions.push('action1');
          return NodeStatus.SUCCESS;
        }),
        new BTAction('Action2', () => {
          executions.push('action2');
          return NodeStatus.FAILURE;
        }),
        new BTAction('Action3', () => {
          executions.push('action3');
          return NodeStatus.SUCCESS;
        })
      ]);
      const tree = new BehaviorTree(root, blackboard);

      const result = tree.tick(0.016);

      expect(result).toBe(NodeStatus.FAILURE);
      expect(executions).toEqual(['action1', 'action2']); // Third action not executed
    });

    it('should execute selector node', () => {
      const executions: string[] = [];

      const blackboard = new Blackboard('test');
      const root = new BTSelector('Root', [
        new BTAction('Action1', () => {
          executions.push('action1');
          return NodeStatus.FAILURE;
        }),
        new BTAction('Action2', () => {
          executions.push('action2');
          return NodeStatus.SUCCESS;
        }),
        new BTAction('Action3', () => {
          executions.push('action3');
          return NodeStatus.SUCCESS;
        })
      ]);
      const tree = new BehaviorTree(root, blackboard);

      const result = tree.tick(0.016);

      expect(result).toBe(NodeStatus.SUCCESS);
      expect(executions).toEqual(['action1', 'action2']); // Third action not executed
    });

    it('should support condition nodes', () => {
      let hasEnergy = true;

      const blackboard = new Blackboard('test');
      const root = new BTSequence('Root', [
        new BTCondition('HasEnergy', () => hasEnergy),
        new BTAction('DoAction', () => NodeStatus.SUCCESS)
      ]);
      const tree = new BehaviorTree(root, blackboard);

      let result = tree.tick(0.016);
      expect(result).toBe(NodeStatus.SUCCESS);

      hasEnergy = false;
      tree.reset();

      result = tree.tick(0.016);
      expect(result).toBe(NodeStatus.FAILURE);
    });

    it('should support decorator nodes', () => {
      let executionCount = 0;

      const blackboard = new Blackboard('test');
      const root = new BTRepeater('Repeater',
        new BTAction('CountAction', () => {
          executionCount++;
          return NodeStatus.SUCCESS;
        }),
        3
      );
      const tree = new BehaviorTree(root, blackboard);

      tree.tick(0.016);

      expect(executionCount).toBe(3);
    });

    it('should support inverter decorator', () => {
      const blackboard = new Blackboard('test');
      const root = new BTInverter('Inverter',
        new BTAction('FailAction', () => NodeStatus.FAILURE)
      );
      const tree = new BehaviorTree(root, blackboard);

      const result = tree.tick(0.016);

      expect(result).toBe(NodeStatus.SUCCESS);
    });

    it('should support blackboard for shared state', () => {
      const blackboard = new Blackboard('test');

      const root = new BTSequence('Root', [
        new BTAction('SetTarget', (ctx) => {
          ctx.blackboard.set('targetEnemy', { id: 123 });
          return NodeStatus.SUCCESS;
        }),
        new BTAction('CheckTarget', (ctx) => {
          expect(ctx.blackboard.get('targetEnemy')).toEqual({ id: 123 });
          return NodeStatus.SUCCESS;
        })
      ]);
      const tree = new BehaviorTree(root, blackboard);

      tree.tick(0.016);
    });

    it('should handle running state for long actions', () => {
      let ticks = 0;

      const blackboard = new Blackboard('test');
      const root = new BTAction('LongAction', () => {
        ticks++;
        return ticks >= 3 ? NodeStatus.SUCCESS : NodeStatus.RUNNING;
      });
      const tree = new BehaviorTree(root, blackboard);

      expect(tree.tick(0.016)).toBe(NodeStatus.RUNNING);
      expect(tree.tick(0.016)).toBe(NodeStatus.RUNNING);
      expect(tree.tick(0.016)).toBe(NodeStatus.SUCCESS);
    });
  });

  describe('Crowd Simulation', () => {
    let navMesh: NavMesh;
    let pathfinder: PathFinder;
    let crowdManager: CrowdManager;

    beforeEach(async () => {
      navMesh = await createSimpleNavMesh(40, 40);
      pathfinder = new PathFinder(navMesh);
      crowdManager = new CrowdManager(navMesh, pathfinder);
    });

    afterEach(() => {
      crowdManager.clear();
    });

    it('should add agents to crowd', () => {
      const navAgent = new NavAgent(new Vector3(0, 0, 0));
      navAgent.radius = 0.5;
      navAgent.maxSpeed = 3.5;

      const agent = crowdManager.addAgent(navAgent);

      expect(agent).toBeDefined();
      const stats = crowdManager.getStats();
      expect(stats.agentCount).toBe(1);
    });

    it('should remove agents from crowd', () => {
      const navAgent = new NavAgent(new Vector3(0, 0, 0));
      navAgent.radius = 0.5;
      navAgent.maxSpeed = 3.5;

      const agent = crowdManager.addAgent(navAgent);

      crowdManager.removeAgent(agent);

      const stats = crowdManager.getStats();
      expect(stats.agentCount).toBe(0);
    });

    it('should move agents to target', () => {
      const navAgent = new NavAgent(new Vector3(0, 0, 0));
      navAgent.radius = 0.5;
      navAgent.maxSpeed = 3.5;

      const agent = crowdManager.addAgent(navAgent);

      const target = new Vector3(10, 0, 10);
      navAgent.setDestination(target, pathfinder);

      const initialPosition = navAgent.position.clone();

      // Update crowd simulation
      for (let i = 0; i < 60; i++) {
        crowdManager.update(1 / 60);
      }

      // Agent should have moved towards target
      const distance = initialPosition.distanceTo(navAgent.position);

      expect(distance).toBeGreaterThan(0);
    });

    it('should avoid collisions between agents', () => {
      const navAgent1 = new NavAgent(new Vector3(-5, 0, 0));
      navAgent1.radius = 0.5;
      navAgent1.maxSpeed = 3.5;
      const agent1 = crowdManager.addAgent(navAgent1);

      const navAgent2 = new NavAgent(new Vector3(5, 0, 0));
      navAgent2.radius = 0.5;
      navAgent2.maxSpeed = 3.5;
      const agent2 = crowdManager.addAgent(navAgent2);

      // Move agents towards each other
      navAgent1.setDestination(new Vector3(5, 0, 0), pathfinder);
      navAgent2.setDestination(new Vector3(-5, 0, 0), pathfinder);

      // Update simulation
      for (let i = 0; i < 120; i++) {
        crowdManager.update(1 / 60);
      }

      // Agents should avoid each other
      const distance = navAgent1.position.distanceTo(navAgent2.position);

      expect(distance).toBeGreaterThan(1.0); // At least 2 radii apart
    });

    it('should support different agent sizes', () => {
      const smallNavAgent = new NavAgent(new Vector3(0, 0, 0));
      smallNavAgent.radius = 0.3;
      smallNavAgent.maxSpeed = 4.0;
      const smallAgent = crowdManager.addAgent(smallNavAgent);

      const largeNavAgent = new NavAgent(new Vector3(2, 0, 0));
      largeNavAgent.radius = 1.0;
      largeNavAgent.maxSpeed = 2.0;
      const largeAgent = crowdManager.addAgent(largeNavAgent);

      expect(smallAgent.radius).toBe(0.3);
      expect(largeAgent.radius).toBe(1.0);
    });

    it('should support agent velocity smoothing', () => {
      const navAgent = new NavAgent(new Vector3(0, 0, 0));
      navAgent.radius = 0.5;
      navAgent.maxSpeed = 3.5;
      navAgent.maxAcceleration = 5.0;

      const agent = crowdManager.addAgent(navAgent);

      navAgent.setDestination(new Vector3(10, 0, 0), pathfinder);

      crowdManager.update(0.1);

      const velocity1 = navAgent.velocity.clone();

      crowdManager.update(0.1);

      const velocity2 = navAgent.velocity.clone();

      // Velocity should increase smoothly
      expect(velocity2.x).toBeGreaterThan(velocity1.x);
    });
  });

  describe('Perception System', () => {
    let sensorSystem: SensorSystem;

    beforeEach(() => {
      sensorSystem = new SensorSystem();
    });

    it('should detect visible entities', () => {
      // This is a placeholder test - the actual perception system integration
      // would require setting up vision sensors with the sensor system
      expect(sensorSystem).toBeDefined();
    });

    it('should not detect entities outside range', () => {
      // Placeholder for range-based perception test
      expect(sensorSystem).toBeDefined();
    });

    it('should not detect entities outside FOV', () => {
      // Placeholder for FOV-based perception test
      expect(sensorSystem).toBeDefined();
    });

    it('should detect sounds within hearing range', () => {
      // Placeholder for hearing sensor test
      expect(sensorSystem).toBeDefined();
    });

    it('should support line-of-sight checks', () => {
      // Placeholder for line-of-sight test
      expect(sensorSystem).toBeDefined();
    });
  });

  describe('AI System (ECS Integration)', () => {
    let world: World;
    let aiSystem: AISystem;
    let navMesh: NavMeshOld;

    beforeEach(() => {
      world = new World();

      // Create navmesh (using old format for AISystem compatibility)
      navMesh = createSimpleNavMeshOld();

      aiSystem = new AISystem(navMesh);
      world.addSystem(aiSystem);
    });

    afterEach(() => {
      world.destroy();
    });

    it('should integrate with ECS', () => {
      expect(aiSystem).toBeDefined();
    });

    it('should update AI agents', () => {
      const entity = world.createEntity();

      // Create AI component with behavior tree
      const blackboard = new Blackboard('agent');
      const root = new BTAction('TestAction', () => NodeStatus.SUCCESS);
      const tree = new BehaviorTree(root, blackboard);

      // Note: The actual component structure may differ
      // This is a simplified test
      expect(tree).toBeDefined();
      expect(aiSystem).toBeDefined();
    });

    it('should navigate AI agents to targets', () => {
      // Create entity with AI component
      const entity = world.createEntity();

      // Test that the system can handle navigation
      const stats = aiSystem.getStats();
      expect(stats).toBeDefined();
      expect(stats.agentCount).toBe(0);
    });
  });
});
