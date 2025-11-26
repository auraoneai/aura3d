/**
 * @fileoverview System Execution Order Integration Tests
 *
 * Verifies that all ECS systems execute in the correct order and respect
 * phase boundaries and dependencies.
 *
 * @module tests/integration/SystemOrderTest
 */

import { World } from '../../ecs/World';
import { System, SystemContext, SystemPriorities } from '../../ecs/System';
import { SystemPhase, getPhaseName, getPhaseForPriority } from '../../ecs/SystemPhase';

// Import all systems
import { TransformSystem } from '../../ecs/systems/TransformSystem';
import { HierarchySystem } from '../../ecs/systems/HierarchySystem';
import { ActiveSystem } from '../../ecs/systems/ActiveSystem';
import { PhysicsSystem } from '../../physics/PhysicsSystem';
import { AnimationSystem } from '../../animation/AnimationSystem';
import { AudioSystem } from '../../audio/AudioSystem';
import { AISystem } from '../../ai/AISystem';
import { InputSystem } from '../../input/InputSystem';

/**
 * Execution log entry
 */
interface ExecutionLogEntry {
  systemName: string;
  priority: number;
  phase: SystemPhase;
  order: number;
}

/**
 * Test results summary
 */
interface TestResults {
  passed: number;
  failed: number;
  total: number;
  failures: Array<{ test: string; error: string }>;
}

/**
 * Mock system for testing execution order
 */
class MockSystem extends System {
  public executionOrder: number = -1;
  public executed: boolean = false;
  public executionLog: ExecutionLogEntry[] = [];

  constructor(name: string, priority: number) {
    super({ name, priority, enabled: true });
  }

  get query() {
    return [];
  }

  update(context: SystemContext): void {
    this.executed = true;
  }
}

/**
 * Creates a world with all core systems for testing
 */
function createTestWorld(): World {
  const world = new World();

  // Note: Some systems require dependencies (canvas, network manager, etc.)
  // For this test, we'll use mock systems with the same priorities

  return world;
}

/**
 * Test: Phase ordering is correct
 */
function testPhaseOrder(): TestResults {
  const results: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  console.log('\n=== Testing Phase Order ===\n');

  const phases = [
    SystemPhase.PRE_UPDATE,
    SystemPhase.UPDATE,
    SystemPhase.PRE_PHYSICS,
    SystemPhase.PHYSICS,
    SystemPhase.POST_PHYSICS,
    SystemPhase.PRE_RENDER,
    SystemPhase.RENDER,
    SystemPhase.POST_RENDER
  ];

  // Test 1: Phases are in ascending order
  results.total++;
  let phaseOrderCorrect = true;
  for (let i = 0; i < phases.length - 1; i++) {
    if (phases[i] >= phases[i + 1]) {
      phaseOrderCorrect = false;
      results.failures.push({
        test: 'Phase Order',
        error: `Phase ${getPhaseName(phases[i])} (${phases[i]}) should be < ${getPhaseName(phases[i + 1])} (${phases[i + 1]})`
      });
    }
  }

  if (phaseOrderCorrect) {
    results.passed++;
    console.log('✓ Phases are in correct ascending order');
  } else {
    results.failed++;
    console.log('✗ Phase order is incorrect');
  }

  // Test 2: No phase overlaps
  results.total++;
  const phaseGaps = [];
  for (let i = 0; i < phases.length - 1; i++) {
    const gap = phases[i + 1] - phases[i];
    phaseGaps.push(gap);
    if (gap <= 0) {
      results.failures.push({
        test: 'Phase Gaps',
        error: `No gap between ${getPhaseName(phases[i])} and ${getPhaseName(phases[i + 1])}`
      });
      results.failed++;
      console.log(`✗ Phase gap issue between ${getPhaseName(phases[i])} and ${getPhaseName(phases[i + 1])}`);
    }
  }

  if (phaseGaps.every(gap => gap > 0)) {
    results.passed++;
    console.log('✓ All phases have non-overlapping ranges');
  }

  return results;
}

/**
 * Test: Systems execute in correct order
 */
function testSystemExecutionOrder(): TestResults {
  const results: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  console.log('\n=== Testing System Execution Order ===\n');

  const world = new World();
  const executionLog: ExecutionLogEntry[] = [];

  // Create mock systems with actual system priorities
  const systemConfigs = [
    { name: 'InputSystem', priority: SystemPriorities.INPUT },
    { name: 'NetworkSystem', priority: SystemPriorities.EARLY },
    { name: 'TransformSystem', priority: SystemPriorities.PRE_UPDATE },
    { name: 'HierarchySystem', priority: SystemPriorities.DEFAULT },
    { name: 'ActiveSystem', priority: SystemPriorities.DEFAULT },
    { name: 'AISystem', priority: SystemPriorities.DEFAULT },
    { name: 'PhysicsSystem', priority: SystemPriorities.PHYSICS },
    { name: 'AudioSystem', priority: SystemPriorities.POST_UPDATE },
    { name: 'AnimationSystem', priority: SystemPriorities.ANIMATION },
    { name: 'RenderSystem', priority: 1000 },
  ];

  // Create tracking systems
  const systems = systemConfigs.map(config => {
    const sys = new MockSystem(config.name, config.priority);
    const originalUpdate = sys.update.bind(sys);

    sys.update = function(context: SystemContext) {
      originalUpdate(context);
      const phase = getPhaseForPriority(this.priority);
      executionLog.push({
        systemName: this.name,
        priority: this.priority,
        phase,
        order: executionLog.length
      });
    };

    return sys;
  });

  // Add systems in random order to ensure World sorts them
  const shuffled = [...systems].sort(() => Math.random() - 0.5);
  shuffled.forEach(sys => world.addSystem(sys));

  world.init();
  world.start();

  // Execute one frame
  world.update(0.016);

  // Verify execution order
  results.total++;
  let orderCorrect = true;

  for (let i = 0; i < executionLog.length - 1; i++) {
    const current = executionLog[i];
    const next = executionLog[i + 1];

    if (current.priority > next.priority) {
      orderCorrect = false;
      results.failures.push({
        test: 'System Execution Order',
        error: `${current.systemName} (priority ${current.priority}) executed before ${next.systemName} (priority ${next.priority})`
      });
    }
  }

  if (orderCorrect) {
    results.passed++;
    console.log('✓ All systems executed in correct priority order');
  } else {
    results.failed++;
    console.log('✗ Systems executed in wrong order');
  }

  // Print execution log
  console.log('\nExecution Log:');
  executionLog.forEach((entry, index) => {
    console.log(
      `${index + 1}. ${entry.systemName.padEnd(20)} | ` +
      `Priority: ${String(entry.priority).padStart(4)} | ` +
      `Phase: ${getPhaseName(entry.phase)}`
    );
  });

  world.destroy();

  return results;
}

/**
 * Test: Critical dependencies are respected
 */
function testCriticalDependencies(): TestResults {
  const results: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  console.log('\n=== Testing Critical Dependencies ===\n');

  const world = new World();
  const executionLog: string[] = [];

  // Critical dependency: TransformSystem MUST run before PhysicsSystem
  const transformSystem = new MockSystem('TransformSystem', SystemPriorities.PRE_UPDATE);
  const physicsSystem = new MockSystem('PhysicsSystem', SystemPriorities.PHYSICS);

  transformSystem.update = function(context: SystemContext) {
    executionLog.push('TransformSystem');
  };

  physicsSystem.update = function(context: SystemContext) {
    executionLog.push('PhysicsSystem');
  };

  world.addSystem(physicsSystem); // Add in reverse order to test sorting
  world.addSystem(transformSystem);

  world.init();
  world.start();
  world.update(0.016);

  // Test 1: TransformSystem runs before PhysicsSystem
  results.total++;
  const transformIndex = executionLog.indexOf('TransformSystem');
  const physicsIndex = executionLog.indexOf('PhysicsSystem');

  if (transformIndex !== -1 && physicsIndex !== -1 && transformIndex < physicsIndex) {
    results.passed++;
    console.log('✓ TransformSystem executes before PhysicsSystem');
  } else {
    results.failed++;
    results.failures.push({
      test: 'TransformSystem before PhysicsSystem',
      error: `TransformSystem (index ${transformIndex}) should execute before PhysicsSystem (index ${physicsIndex})`
    });
    console.log('✗ TransformSystem does not execute before PhysicsSystem');
  }

  // Test 2: Verify priorities
  results.total++;
  if (transformSystem.priority < physicsSystem.priority) {
    results.passed++;
    console.log('✓ TransformSystem has lower priority than PhysicsSystem');
  } else {
    results.failed++;
    results.failures.push({
      test: 'Transform/Physics Priority',
      error: `TransformSystem priority (${transformSystem.priority}) should be < PhysicsSystem (${physicsSystem.priority})`
    });
    console.log('✗ TransformSystem priority is not lower than PhysicsSystem');
  }

  world.destroy();

  return results;
}

/**
 * Test: Input system runs first
 */
function testInputSystemFirst(): TestResults {
  const results: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  console.log('\n=== Testing InputSystem Priority ===\n');

  const world = new World();
  const executionLog: string[] = [];

  const systems = [
    new MockSystem('InputSystem', SystemPriorities.INPUT),
    new MockSystem('GameplaySystem', SystemPriorities.DEFAULT),
    new MockSystem('PhysicsSystem', SystemPriorities.PHYSICS),
  ];

  systems.forEach(sys => {
    const originalUpdate = sys.update.bind(sys);
    sys.update = function(context: SystemContext) {
      originalUpdate(context);
      executionLog.push(this.name);
    };
    world.addSystem(sys);
  });

  world.init();
  world.start();
  world.update(0.016);

  results.total++;
  if (executionLog[0] === 'InputSystem') {
    results.passed++;
    console.log('✓ InputSystem executes first');
  } else {
    results.failed++;
    results.failures.push({
      test: 'InputSystem First',
      error: `InputSystem should execute first, but ${executionLog[0]} executed first`
    });
    console.log(`✗ InputSystem did not execute first (${executionLog[0]} executed first)`);
  }

  world.destroy();

  return results;
}

/**
 * Test: Render systems run last
 */
function testRenderSystemsLast(): TestResults {
  const results: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  console.log('\n=== Testing Render Systems Priority ===\n');

  const world = new World();
  const executionLog: string[] = [];

  const systems = [
    new MockSystem('PhysicsSystem', SystemPriorities.PHYSICS),
    new MockSystem('GameplaySystem', SystemPriorities.DEFAULT),
    new MockSystem('RenderSystem', 1000),
    new MockSystem('AnimationSystem', SystemPriorities.ANIMATION),
  ];

  systems.forEach(sys => {
    const originalUpdate = sys.update.bind(sys);
    sys.update = function(context: SystemContext) {
      originalUpdate(context);
      executionLog.push(this.name);
    };
    world.addSystem(sys);
  });

  world.init();
  world.start();
  world.update(0.016);

  results.total++;
  const lastSystem = executionLog[executionLog.length - 1];
  if (lastSystem === 'RenderSystem') {
    results.passed++;
    console.log('✓ RenderSystem executes last');
  } else {
    results.failed++;
    results.failures.push({
      test: 'RenderSystem Last',
      error: `RenderSystem should execute last, but ${lastSystem} executed last`
    });
    console.log(`✗ RenderSystem did not execute last (${lastSystem} executed last)`);
  }

  world.destroy();

  return results;
}

/**
 * Main test runner
 */
export function runSystemOrderTests(): void {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   G3D 5.0 - System Execution Order Tests            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const allResults: TestResults = { passed: 0, failed: 0, total: 0, failures: [] };

  // Run all tests
  const tests = [
    testPhaseOrder,
    testSystemExecutionOrder,
    testCriticalDependencies,
    testInputSystemFirst,
    testRenderSystemsLast,
  ];

  tests.forEach(test => {
    const result = test();
    allResults.passed += result.passed;
    allResults.failed += result.failed;
    allResults.total += result.total;
    allResults.failures.push(...result.failures);
  });

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║                   Test Summary                        ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Total Tests: ${allResults.total}`);
  console.log(`Passed: ${allResults.passed} ✓`);
  console.log(`Failed: ${allResults.failed} ✗`);
  console.log(`Success Rate: ${((allResults.passed / allResults.total) * 100).toFixed(1)}%`);

  if (allResults.failures.length > 0) {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║                   Failures                            ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    allResults.failures.forEach((failure, index) => {
      console.log(`\n${index + 1}. ${failure.test}`);
      console.log(`   Error: ${failure.error}`);
    });
  }

  console.log('\n' + '═'.repeat(57));

  if (allResults.failed === 0) {
    console.log('\n🎉 All tests passed! System execution order is correct.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the failures above.\n');
  }
}

// Run tests if executed directly
if (require.main === module) {
  runSystemOrderTests();
}
