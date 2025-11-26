/**
 * TestHelpers.ts
 *
 * Utility functions and helpers for testing G3D engine.
 * Provides common test patterns, assertions, and mock objects.
 *
 * @module tests/utils/TestHelpers
 */

import { Engine, EngineConfig } from '../../core/Engine';
import { World } from '../../ecs/World';
import { System, SystemContext } from '../../ecs/System';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { createMockCanvas } from './MockCanvas';

/**
 * Performance measurement result
 */
export interface PerformanceResult {
  /** Average execution time in milliseconds */
  averageTime: number;
  /** Minimum execution time in milliseconds */
  minTime: number;
  /** Maximum execution time in milliseconds */
  maxTime: number;
  /** Total execution time in milliseconds */
  totalTime: number;
  /** Number of iterations */
  iterations: number;
  /** Operations per second */
  opsPerSecond: number;
}

/**
 * Creates a test engine with common configuration.
 *
 * @param config - Optional engine configuration
 * @returns Initialized test engine
 *
 * @example
 * ```typescript
 * const engine = await createTestEngine({ targetFPS: 30 });
 * // Use engine for testing
 * engine.destroy();
 * ```
 */
export async function createTestEngine(config?: Partial<EngineConfig>): Promise<Engine> {
  const engine = Engine.create({
    canvas: createMockCanvas(),
    targetFPS: 60,
    autoStart: false,
    enableProfiling: true,
    ...config
  });

  await engine.init();
  return engine;
}

/**
 * Creates a test world with common configuration.
 *
 * @param entityCapacity - Initial entity capacity
 * @returns Initialized and started test world
 *
 * @example
 * ```typescript
 * const world = createTestWorld(2048);
 * // Use world for testing
 * world.destroy();
 * ```
 */
export function createTestWorld(entityCapacity: number = 1024): World {
  const world = new World({ initialEntityCapacity: entityCapacity });
  world.init();
  world.start();
  return world;
}

/**
 * Measures the performance of a function over multiple iterations.
 *
 * @param fn - Function to measure
 * @param iterations - Number of iterations (default: 1000)
 * @returns Performance measurement results
 *
 * @example
 * ```typescript
 * const result = measurePerformance(() => {
 *   world.createEntity();
 * }, 10000);
 * console.log(`Average: ${result.averageTime}ms`);
 * console.log(`Ops/sec: ${result.opsPerSecond}`);
 * ```
 */
export function measurePerformance(fn: () => void, iterations: number = 1000): PerformanceResult {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    fn();
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const averageTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / averageTime;

  return {
    averageTime,
    minTime,
    maxTime,
    totalTime,
    iterations,
    opsPerSecond
  };
}

/**
 * Runs the engine for a specific number of frames.
 *
 * @param engine - Engine instance
 * @param frameCount - Number of frames to run
 *
 * @example
 * ```typescript
 * await runEngineFrames(engine, 60); // Run for 1 second at 60fps
 * ```
 */
export function runEngineFrames(engine: Engine, frameCount: number): void {
  for (let i = 0; i < frameCount; i++) {
    engine.tick();
  }
}

/**
 * Runs the world for a specific amount of time.
 *
 * @param world - World instance
 * @param seconds - Simulation time in seconds
 * @param fps - Target frames per second (default: 60)
 *
 * @example
 * ```typescript
 * runWorldForTime(world, 2.5, 60); // Run for 2.5 seconds
 * ```
 */
export function runWorldForTime(world: World, seconds: number, fps: number = 60): void {
  const frameCount = Math.floor(seconds * fps);
  const deltaTime = 1 / fps;

  for (let i = 0; i < frameCount; i++) {
    world.update(deltaTime);
  }
}

/**
 * Waits for a specific number of milliseconds.
 * Useful for testing async operations and timing.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await waitFor(100); // Wait 100ms
 * ```
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for a condition to become true.
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param interval - Check interval in milliseconds (default: 10)
 * @returns Promise that resolves when condition is met
 * @throws Error if timeout is reached
 *
 * @example
 * ```typescript
 * await waitForCondition(() => world.entityCount === 100, 1000);
 * ```
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 10
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }
    await waitFor(interval);
  }
}

/**
 * Creates a simple test system for counting updates.
 *
 * @param name - System name
 * @param priority - System priority
 * @returns Test system with update counter
 *
 * @example
 * ```typescript
 * const system = createTestSystem('MySystem', 100);
 * world.addSystem(system);
 * runEngineFrames(engine, 10);
 * expect(system.updateCount).toBe(10);
 * ```
 */
export function createTestSystem(name: string = 'TestSystem', priority: number = 100) {
  class TestSystem extends System {
    updateCount = 0;
    fixedUpdateCount = 0;
    lateUpdateCount = 0;

    constructor() {
      super(name, priority);
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

  return new TestSystem();
}

/**
 * Generates random Vector3 within bounds.
 *
 * @param min - Minimum value for each component
 * @param max - Maximum value for each component
 * @returns Random Vector3
 *
 * @example
 * ```typescript
 * const pos = randomVector3(-10, 10);
 * ```
 */
export function randomVector3(min: number = -1, max: number = 1): Vector3 {
  return new Vector3(
    min + Math.random() * (max - min),
    min + Math.random() * (max - min),
    min + Math.random() * (max - min)
  );
}

/**
 * Generates random Quaternion.
 *
 * @returns Random unit quaternion
 *
 * @example
 * ```typescript
 * const rotation = randomQuaternion();
 * ```
 */
export function randomQuaternion(): Quaternion {
  // Generate random unit quaternion using algorithm from Shoemake, "Uniform Random Rotations"
  const u1 = Math.random();
  const u2 = Math.random() * Math.PI * 2;
  const u3 = Math.random() * Math.PI * 2;

  const sqrt1MinusU1 = Math.sqrt(1 - u1);
  const sqrtU1 = Math.sqrt(u1);

  return new Quaternion(
    sqrt1MinusU1 * Math.sin(u2),
    sqrt1MinusU1 * Math.cos(u2),
    sqrtU1 * Math.sin(u3),
    sqrtU1 * Math.cos(u3)
  );
}

/**
 * Compares two numbers with epsilon tolerance.
 *
 * @param a - First number
 * @param b - Second number
 * @param epsilon - Tolerance (default: 0.00001)
 * @returns True if numbers are approximately equal
 *
 * @example
 * ```typescript
 * expect(approximatelyEqual(0.1 + 0.2, 0.3)).toBe(true);
 * ```
 */
export function approximatelyEqual(a: number, b: number, epsilon: number = 0.00001): boolean {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Compares two Vector3 instances with epsilon tolerance.
 *
 * @param a - First vector
 * @param b - Second vector
 * @param epsilon - Tolerance (default: 0.00001)
 * @returns True if vectors are approximately equal
 *
 * @example
 * ```typescript
 * expect(vectorsApproximatelyEqual(v1, v2)).toBe(true);
 * ```
 */
export function vectorsApproximatelyEqual(a: Vector3, b: Vector3, epsilon: number = 0.00001): boolean {
  return (
    approximatelyEqual(a.x, b.x, epsilon) &&
    approximatelyEqual(a.y, b.y, epsilon) &&
    approximatelyEqual(a.z, b.z, epsilon)
  );
}

/**
 * Captures console output during a function execution.
 *
 * @param fn - Function to execute
 * @returns Object containing captured logs
 *
 * @example
 * ```typescript
 * const output = captureConsole(() => {
 *   console.log('test');
 *   console.error('error');
 * });
 * expect(output.logs).toContain('test');
 * expect(output.errors).toContain('error');
 * ```
 */
export function captureConsole(fn: () => void): { logs: string[]; errors: string[]; warns: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => logs.push(args.join(' '));
  console.error = (...args: any[]) => errors.push(args.join(' '));
  console.warn = (...args: any[]) => warns.push(args.join(' '));

  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }

  return { logs, errors, warns };
}

/**
 * Asserts that a function throws an error.
 *
 * @param fn - Function that should throw
 * @param expectedMessage - Optional expected error message
 * @returns The thrown error
 * @throws Error if function doesn't throw
 *
 * @example
 * ```typescript
 * expectThrows(() => {
 *   throw new Error('test');
 * }, 'test');
 * ```
 */
export function expectThrows(fn: () => void, expectedMessage?: string): Error {
  try {
    fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (error instanceof Error) {
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(`Expected error message to include "${expectedMessage}", but got "${error.message}"`);
      }
      return error;
    }
    throw error;
  }
}

/**
 * Creates a snapshot of world state for comparison.
 *
 * @param world - World to snapshot
 * @returns Snapshot object
 *
 * @example
 * ```typescript
 * const before = snapshotWorld(world);
 * // Make changes
 * const after = snapshotWorld(world);
 * expect(after.entityCount).toBeGreaterThan(before.entityCount);
 * ```
 */
export function snapshotWorld(world: World): {
  entityCount: number;
  systemCount: number;
  archetypeCount: number;
  time: number;
  frameCount: number;
} {
  return {
    entityCount: world.entityCount,
    systemCount: world.systemCount,
    archetypeCount: world.archetypeCount,
    time: world.time,
    frameCount: world.frameCount
  };
}

/**
 * Memory usage snapshot
 */
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  timestamp: number;
}

/**
 * Gets current memory usage (Node.js only).
 *
 * @returns Memory snapshot or null in browser
 *
 * @example
 * ```typescript
 * const before = getMemoryUsage();
 * // Perform operations
 * const after = getMemoryUsage();
 * if (before && after) {
 *   console.log(`Memory delta: ${after.heapUsed - before.heapUsed} bytes`);
 * }
 * ```
 */
export function getMemoryUsage(): MemorySnapshot | null {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      timestamp: Date.now()
    };
  }
  return null;
}

/**
 * Forces garbage collection (Node.js with --expose-gc flag only).
 *
 * @example
 * ```typescript
 * forceGC();
 * const mem = getMemoryUsage();
 * ```
 */
export function forceGC(): void {
  if (typeof global !== 'undefined' && (global as any).gc) {
    (global as any).gc();
  }
}

/**
 * Test fixture for common test scenarios
 */
export class TestFixture {
  engine: Engine | null = null;
  world: World | null = null;

  async setupEngine(config?: Partial<EngineConfig>): Promise<Engine> {
    this.engine = await createTestEngine(config);
    return this.engine;
  }

  setupWorld(entityCapacity?: number): World {
    this.world = createTestWorld(entityCapacity);
    return this.world;
  }

  cleanup(): void {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    if (this.world) {
      this.world.destroy();
      this.world = null;
    }
  }
}

/**
 * Batch entity creation helper
 *
 * @param world - World to create entities in
 * @param count - Number of entities to create
 * @param setup - Optional setup function for each entity
 * @returns Array of created entity IDs
 *
 * @example
 * ```typescript
 * const entities = createEntitiesBatch(world, 100, (entity, world) => {
 *   world.addComponent(entity, new TransformComponent());
 * });
 * ```
 */
export function createEntitiesBatch(
  world: World,
  count: number,
  setup?: (entity: number, world: World) => void
): number[] {
  const entities: number[] = [];

  for (let i = 0; i < count; i++) {
    const entity = world.createEntity();
    if (setup) {
      setup(entity, world);
    }
    entities.push(entity);
  }

  return entities;
}
