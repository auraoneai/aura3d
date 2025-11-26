/**
 * @fileoverview System scheduler with dependency resolution and execution ordering.
 * Provides multi-phase execution, topological sorting, and performance profiling.
 *
 * The scheduler organizes systems into phases (init, update, render, etc.) and
 * ensures correct execution order based on priorities and dependencies.
 *
 * @module ecs/Scheduler
 */

import { System, SystemContext, SystemGroup, SystemPriority } from './System';

/**
 * Execution phases for system scheduling.
 * Systems are organized and executed by phase in the following order:
 * INIT → PRE_UPDATE → UPDATE → POST_UPDATE → FIXED_UPDATE → LATE_UPDATE → RENDER
 *
 * @example
 * ```typescript
 * // Add system to specific phase
 * scheduler.addSystem(new PhysicsSystem(), { phase: SchedulePhase.FIXED_UPDATE });
 * scheduler.addSystem(new RenderSystem(), { phase: SchedulePhase.RENDER });
 * ```
 */
export enum SchedulePhase {
  /**
   * Initialization phase - runs once at startup.
   * Use for resource loading, system setup, etc.
   */
  INIT = 'init',

  /**
   * Pre-update phase - runs before main update.
   * Use for input processing, preparation work.
   */
  PRE_UPDATE = 'pre-update',

  /**
   * Main update phase - runs every frame.
   * Use for core game logic, movement, AI, etc.
   */
  UPDATE = 'update',

  /**
   * Post-update phase - runs after main update.
   * Use for cleanup, state reconciliation.
   */
  POST_UPDATE = 'post-update',

  /**
   * Fixed update phase - runs at fixed timestep.
   * Use for deterministic physics simulation.
   */
  FIXED_UPDATE = 'fixed-update',

  /**
   * Late update phase - runs after all updates.
   * Use for camera updates, final transforms.
   */
  LATE_UPDATE = 'late-update',

  /**
   * Render phase - runs last each frame.
   * Use for rendering, visual effects, debug drawing.
   */
  RENDER = 'render'
}

/**
 * Entry representing a scheduled system with its configuration.
 * Internal structure used by the scheduler to track system metadata.
 */
export interface ScheduleEntry {
  /** The system instance to execute */
  system: System;

  /** Phase this system executes in */
  phase: SchedulePhase;

  /** Execution priority (lower runs first) */
  priority: SystemPriority;

  /** Systems that must run before this one */
  dependencies?: System[];

  /** Optional group this system belongs to */
  group?: SystemGroup;
}

/**
 * Configuration options for the scheduler.
 *
 * @example
 * ```typescript
 * const scheduler = new Scheduler({
 *   enableProfiling: true,
 *   maxFixedStepsPerFrame: 3
 * });
 * ```
 */
export interface SchedulerOptions {
  /**
   * Enable performance profiling tracking.
   * When enabled, tracks execution time for each system.
   * @default false
   */
  enableProfiling?: boolean;

  /**
   * Maximum number of fixed update steps per frame.
   * Prevents spiral of death in physics simulation.
   * @default 5
   */
  maxFixedStepsPerFrame?: number;
}

/**
 * Performance metrics for a single system.
 * Tracks execution statistics over multiple frames.
 */
interface ProfilingData {
  /** Rolling average execution time in milliseconds */
  avgTime: number;

  /** Maximum execution time observed in milliseconds */
  maxTime: number;

  /** Total number of executions recorded */
  callCount: number;

  /** Sum of all execution times (for average calculation) */
  totalTime: number;
}

/**
 * System scheduler with dependency resolution and multi-phase execution.
 *
 * The scheduler manages system execution order based on:
 * - Execution phase (init, update, render, etc.)
 * - Priority within phase (lower values first)
 * - Dependencies between systems (topological sort)
 *
 * Features:
 * - Automatic dependency resolution using topological sort
 * - Circular dependency detection
 * - Performance profiling per system
 * - System groups with shared configuration
 * - Cached execution order (invalidated on changes)
 *
 * @example
 * ```typescript
 * const scheduler = new Scheduler({ enableProfiling: true });
 *
 * // Add systems with dependencies
 * const physics = new PhysicsSystem();
 * const collision = new CollisionSystem();
 * const movement = new MovementSystem();
 *
 * scheduler
 *   .addSystem(physics, { phase: SchedulePhase.FIXED_UPDATE })
 *   .addSystem(collision, {
 *     phase: SchedulePhase.FIXED_UPDATE,
 *     dependencies: [physics]
 *   })
 *   .addSystem(movement, {
 *     phase: SchedulePhase.UPDATE,
 *     dependencies: [collision]
 *   });
 *
 * // Validate schedule
 * const result = scheduler.validate();
 * if (!result.valid) {
 *   console.error('Scheduling errors:', result.errors);
 * }
 *
 * // Execute frame
 * const context: SystemContext = {
 *   deltaTime: 0.016,
 *   fixedDeltaTime: 0.016,
 *   time: 1.5,
 *   frameCount: 90
 * };
 * scheduler.tick(context);
 *
 * // Get profiling data
 * const stats = scheduler.getProfilingData();
 * for (const [system, data] of stats) {
 *   console.log(`${system.name}: avg=${data.avgTime.toFixed(2)}ms`);
 * }
 * ```
 */
export class Scheduler {
  /**
   * Map of systems to their schedule entries.
   * Tracks all registered systems and their configuration.
   * @private
   */
  private readonly entries = new Map<System, ScheduleEntry>();

  /**
   * Map of phases to their cached execution order.
   * Invalidated when systems are added/removed/modified.
   * @private
   */
  private readonly phaseOrders = new Map<SchedulePhase, System[]>();

  /**
   * Map of groups to their assigned phase.
   * @private
   */
  private readonly groupPhases = new Map<SystemGroup, SchedulePhase>();

  /**
   * Whether profiling is enabled.
   * @private
   */
  private readonly profilingEnabled: boolean;

  /**
   * Maximum fixed update steps per frame.
   * @private
   */
  private readonly maxFixedSteps: number;

  /**
   * Performance profiling data per system.
   * Maps system to its execution statistics.
   * @private
   */
  private readonly profilingData = new Map<System, ProfilingData>();

  /**
   * Number of frames to use for rolling average.
   * @private
   */
  private readonly PROFILING_WINDOW = 60;

  /**
   * Whether cached execution orders are dirty and need rebuilding.
   * @private
   */
  private isDirty = true;

  /**
   * Creates a new scheduler instance.
   *
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * const scheduler = new Scheduler({
   *   enableProfiling: true,
   *   maxFixedStepsPerFrame: 3
   * });
   * ```
   */
  constructor(options?: SchedulerOptions) {
    this.profilingEnabled = options?.enableProfiling ?? false;
    this.maxFixedSteps = options?.maxFixedStepsPerFrame ?? 5;
  }

  /**
   * Adds a system to the scheduler.
   *
   * @param system - System to add
   * @param options - Scheduling options
   * @param options.phase - Execution phase (default: UPDATE)
   * @param options.dependencies - Systems that must run before this one
   * @param options.group - Optional group this system belongs to
   * @returns This scheduler for chaining
   * @throws Error if system is already registered
   *
   * @example
   * ```typescript
   * const physics = new PhysicsSystem();
   * const collision = new CollisionSystem();
   *
   * scheduler
   *   .addSystem(physics)
   *   .addSystem(collision, {
   *     phase: SchedulePhase.FIXED_UPDATE,
   *     dependencies: [physics]
   *   });
   * ```
   */
  addSystem(
    system: System,
    options?: {
      phase?: SchedulePhase;
      dependencies?: System[];
      group?: SystemGroup;
    }
  ): this {
    if (this.entries.has(system)) {
      throw new Error(`System ${system.name} is already registered`);
    }

    const entry: ScheduleEntry = {
      system,
      phase: options?.phase ?? SchedulePhase.UPDATE,
      priority: system.priority,
      dependencies: options?.dependencies ? [...options.dependencies] : undefined,
      group: options?.group
    };

    this.entries.set(system, entry);
    this.isDirty = true;

    if (this.profilingEnabled) {
      this.profilingData.set(system, {
        avgTime: 0,
        maxTime: 0,
        callCount: 0,
        totalTime: 0
      });
    }

    return this;
  }

  /**
   * Removes a system from the scheduler.
   *
   * @param system - System to remove
   * @returns True if system was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = scheduler.removeSystem(oldSystem);
   * if (removed) {
   *   console.log('System removed successfully');
   * }
   * ```
   */
  removeSystem(system: System): boolean {
    const removed = this.entries.delete(system);
    if (removed) {
      this.isDirty = true;
      this.profilingData.delete(system);
    }
    return removed;
  }

  /**
   * Adds a system group to the scheduler.
   * All systems in the group will be added with the specified phase.
   *
   * @param group - System group to add
   * @param phase - Execution phase for all systems in group (default: UPDATE)
   * @returns This scheduler for chaining
   *
   * @example
   * ```typescript
   * const renderGroup = new SystemGroup('Rendering');
   * renderGroup.add(new CullingSystem());
   * renderGroup.add(new MeshRenderSystem());
   *
   * scheduler.addGroup(renderGroup, SchedulePhase.RENDER);
   * ```
   */
  addGroup(group: SystemGroup, phase: SchedulePhase = SchedulePhase.UPDATE): this {
    this.groupPhases.set(group, phase);

    for (const system of group.systems) {
      if (!this.entries.has(system)) {
        this.addSystem(system, { phase, group });
      }
    }

    return this;
  }

  /**
   * Removes a system group and all its systems from the scheduler.
   *
   * @param group - System group to remove
   * @returns True if group was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = scheduler.removeGroup(oldGroup);
   * ```
   */
  removeGroup(group: SystemGroup): boolean {
    const hadGroup = this.groupPhases.has(group);
    this.groupPhases.delete(group);

    for (const system of group.systems) {
      const entry = this.entries.get(system);
      if (entry?.group === group) {
        this.removeSystem(system);
      }
    }

    return hadGroup;
  }

  /**
   * Runs all systems in the INIT phase.
   * Typically called once at application startup.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runInit(context);
   * ```
   */
  runInit(context: SystemContext): void {
    this.runPhase(SchedulePhase.INIT, context);
  }

  /**
   * Runs all systems in the PRE_UPDATE phase.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runPreUpdate(context);
   * ```
   */
  runPreUpdate(context: SystemContext): void {
    this.runPhase(SchedulePhase.PRE_UPDATE, context);
  }

  /**
   * Runs all systems in the UPDATE phase.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runUpdate(context);
   * ```
   */
  runUpdate(context: SystemContext): void {
    this.runPhase(SchedulePhase.UPDATE, context);
  }

  /**
   * Runs all systems in the POST_UPDATE phase.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runPostUpdate(context);
   * ```
   */
  runPostUpdate(context: SystemContext): void {
    this.runPhase(SchedulePhase.POST_UPDATE, context);
  }

  /**
   * Runs all systems in the FIXED_UPDATE phase.
   * Only calls fixedUpdate() on systems that implement it.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runFixedUpdate(context);
   * ```
   */
  runFixedUpdate(context: SystemContext): void {
    this.runPhase(SchedulePhase.FIXED_UPDATE, context, true);
  }

  /**
   * Runs all systems in the LATE_UPDATE phase.
   * Only calls lateUpdate() on systems that implement it.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runLateUpdate(context);
   * ```
   */
  runLateUpdate(context: SystemContext): void {
    this.runPhase(SchedulePhase.LATE_UPDATE, context, false, true);
  }

  /**
   * Runs all systems in the RENDER phase.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * scheduler.runRender(context);
   * ```
   */
  runRender(context: SystemContext): void {
    this.runPhase(SchedulePhase.RENDER, context);
  }

  /**
   * Executes a complete frame tick, running all phases in order.
   * Phase order: PRE_UPDATE → UPDATE → POST_UPDATE → FIXED_UPDATE → LATE_UPDATE → RENDER
   *
   * Note: INIT phase is not included in tick() as it's meant to run once.
   *
   * @param context - System context with timing information
   *
   * @example
   * ```typescript
   * const context: SystemContext = {
   *   deltaTime: 0.016,
   *   fixedDeltaTime: 0.016,
   *   time: 1.5,
   *   frameCount: 90
   * };
   *
   * scheduler.tick(context);
   * ```
   */
  tick(context: SystemContext): void {
    this.runPreUpdate(context);
    this.runUpdate(context);
    this.runPostUpdate(context);
    this.runFixedUpdate(context);
    this.runLateUpdate(context);
    this.runRender(context);
  }

  /**
   * Sets the execution phase for a system.
   *
   * @param system - System to modify
   * @param phase - New execution phase
   * @throws Error if system is not registered
   *
   * @example
   * ```typescript
   * scheduler.setPhase(renderSystem, SchedulePhase.RENDER);
   * ```
   */
  setPhase(system: System, phase: SchedulePhase): void {
    const entry = this.entries.get(system);
    if (!entry) {
      throw new Error(`System ${system.name} is not registered`);
    }

    entry.phase = phase;
    this.isDirty = true;
  }

  /**
   * Sets the execution priority for a system.
   *
   * @param system - System to modify
   * @param priority - New priority value
   * @throws Error if system is not registered
   *
   * @example
   * ```typescript
   * scheduler.setPriority(inputSystem, SystemPriorities.INPUT);
   * ```
   */
  setPriority(system: System, priority: SystemPriority): void {
    const entry = this.entries.get(system);
    if (!entry) {
      throw new Error(`System ${system.name} is not registered`);
    }

    entry.priority = priority;
    system.priority = priority;
    this.isDirty = true;
  }

  /**
   * Adds a dependency to a system.
   * The system will execute after the dependency in the same phase.
   *
   * @param system - System to add dependency to
   * @param dependency - System that must run before
   * @throws Error if system is not registered
   * @throws Error if creates circular dependency
   *
   * @example
   * ```typescript
   * scheduler.addDependency(collisionSystem, physicsSystem);
   * ```
   */
  addDependency(system: System, dependency: System): void {
    const entry = this.entries.get(system);
    if (!entry) {
      throw new Error(`System ${system.name} is not registered`);
    }

    if (!this.entries.has(dependency)) {
      throw new Error(`Dependency system ${dependency.name} is not registered`);
    }

    if (!entry.dependencies) {
      entry.dependencies = [];
    }

    if (!entry.dependencies.includes(dependency)) {
      entry.dependencies.push(dependency);
      this.isDirty = true;

      const validation = this.validate();
      if (!validation.valid) {
        entry.dependencies = entry.dependencies.filter(d => d !== dependency);
        this.isDirty = true;
        throw new Error(`Adding dependency creates circular dependency: ${validation.errors.join(', ')}`);
      }
    }
  }

  /**
   * Removes a dependency from a system.
   *
   * @param system - System to remove dependency from
   * @param dependency - Dependency to remove
   * @throws Error if system is not registered
   *
   * @example
   * ```typescript
   * scheduler.removeDependency(collisionSystem, oldPhysicsSystem);
   * ```
   */
  removeDependency(system: System, dependency: System): void {
    const entry = this.entries.get(system);
    if (!entry) {
      throw new Error(`System ${system.name} is not registered`);
    }

    if (entry.dependencies) {
      const index = entry.dependencies.indexOf(dependency);
      if (index !== -1) {
        entry.dependencies.splice(index, 1);
        this.isDirty = true;
      }
    }
  }

  /**
   * Gets all systems in the specified phase, in execution order.
   * If no phase specified, returns all systems.
   *
   * @param phase - Optional phase to filter by
   * @returns Readonly array of systems
   *
   * @example
   * ```typescript
   * const updateSystems = scheduler.getSystems(SchedulePhase.UPDATE);
   * const allSystems = scheduler.getSystems();
   * ```
   */
  getSystems(phase?: SchedulePhase): readonly System[] {
    if (phase) {
      this.ensureOrderCached();
      return this.phaseOrders.get(phase) ?? [];
    }

    return Array.from(this.entries.keys());
  }

  /**
   * Gets all systems in overall execution order across all phases.
   * Phase order: INIT → PRE_UPDATE → UPDATE → POST_UPDATE → FIXED_UPDATE → LATE_UPDATE → RENDER
   *
   * @returns Readonly array of systems in execution order
   *
   * @example
   * ```typescript
   * const executionOrder = scheduler.getExecutionOrder();
   * executionOrder.forEach((system, i) => {
   *   console.log(`${i + 1}. ${system.name}`);
   * });
   * ```
   */
  getExecutionOrder(): readonly System[] {
    this.ensureOrderCached();

    const phases = [
      SchedulePhase.INIT,
      SchedulePhase.PRE_UPDATE,
      SchedulePhase.UPDATE,
      SchedulePhase.POST_UPDATE,
      SchedulePhase.FIXED_UPDATE,
      SchedulePhase.LATE_UPDATE,
      SchedulePhase.RENDER
    ];

    const result: System[] = [];
    for (const phase of phases) {
      const systems = this.phaseOrders.get(phase);
      if (systems) {
        result.push(...systems);
      }
    }

    return result;
  }

  /**
   * Gets performance profiling data for all systems.
   * Only available when profiling is enabled.
   *
   * @returns Map of systems to their profiling data
   *
   * @example
   * ```typescript
   * const stats = scheduler.getProfilingData();
   * for (const [system, data] of stats) {
   *   console.log(`${system.name}:`);
   *   console.log(`  Avg: ${data.avgTime.toFixed(2)}ms`);
   *   console.log(`  Max: ${data.maxTime.toFixed(2)}ms`);
   *   console.log(`  Calls: ${data.callCount}`);
   * }
   * ```
   */
  getProfilingData(): Map<System, { avgTime: number; maxTime: number; callCount: number }> {
    const result = new Map<System, { avgTime: number; maxTime: number; callCount: number }>();

    for (const [system, data] of this.profilingData) {
      result.set(system, {
        avgTime: data.avgTime,
        maxTime: data.maxTime,
        callCount: data.callCount
      });
    }

    return result;
  }

  /**
   * Resets all profiling data.
   *
   * @example
   * ```typescript
   * scheduler.resetProfiling();
   * ```
   */
  resetProfiling(): void {
    for (const data of this.profilingData.values()) {
      data.avgTime = 0;
      data.maxTime = 0;
      data.callCount = 0;
      data.totalTime = 0;
    }
  }

  /**
   * Validates the scheduler configuration.
   * Checks for circular dependencies and missing dependency systems.
   *
   * @returns Validation result with errors if any
   *
   * @example
   * ```typescript
   * const result = scheduler.validate();
   * if (!result.valid) {
   *   console.error('Scheduling errors:');
   *   result.errors.forEach(err => console.error(`  - ${err}`));
   * }
   * ```
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const phase of Object.values(SchedulePhase)) {
      const systems = Array.from(this.entries.values())
        .filter(e => e.phase === phase)
        .map(e => e.system);

      if (systems.length === 0) {
        continue;
      }

      const cycleError = this.detectCycles(systems, phase);
      if (cycleError) {
        errors.push(cycleError);
      }
    }

    for (const entry of this.entries.values()) {
      if (entry.dependencies) {
        for (const dep of entry.dependencies) {
          if (!this.entries.has(dep)) {
            errors.push(
              `System ${entry.system.name} depends on ${dep.name} which is not registered`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generates a human-readable schedule visualization.
   * Shows all phases with their systems in execution order.
   *
   * @returns Formatted schedule string
   *
   * @example
   * ```typescript
   * console.log(scheduler.printSchedule());
   * // Output:
   * // === INIT ===
   * // 1. ResourceLoaderSystem (priority: -1000)
   * //
   * // === UPDATE ===
   * // 1. InputSystem (priority: -500)
   * // 2. PhysicsSystem (priority: -200)
   * // ...
   * ```
   */
  printSchedule(): string {
    this.ensureOrderCached();

    const phases = [
      SchedulePhase.INIT,
      SchedulePhase.PRE_UPDATE,
      SchedulePhase.UPDATE,
      SchedulePhase.POST_UPDATE,
      SchedulePhase.FIXED_UPDATE,
      SchedulePhase.LATE_UPDATE,
      SchedulePhase.RENDER
    ];

    const lines: string[] = [];

    for (const phase of phases) {
      const systems = this.phaseOrders.get(phase);
      if (!systems || systems.length === 0) {
        continue;
      }

      lines.push(`=== ${phase.toUpperCase()} ===`);

      systems.forEach((system, index) => {
        const entry = this.entries.get(system)!;
        let line = `${index + 1}. ${system.name} (priority: ${entry.priority})`;

        if (entry.dependencies && entry.dependencies.length > 0) {
          const depNames = entry.dependencies.map(d => d.name).join(', ');
          line += ` [depends on: ${depNames}]`;
        }

        if (entry.group) {
          line += ` [group: ${entry.group.name}]`;
        }

        lines.push(line);
      });

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clears all systems and groups from the scheduler.
   *
   * @example
   * ```typescript
   * scheduler.clear();
   * console.log(scheduler.getSystems().length); // 0
   * ```
   */
  clear(): void {
    this.entries.clear();
    this.phaseOrders.clear();
    this.groupPhases.clear();
    this.profilingData.clear();
    this.isDirty = true;
  }

  /**
   * Executes all systems in a specific phase.
   *
   * @param phase - Phase to execute
   * @param context - System context
   * @param useFixedUpdate - Whether to call fixedUpdate instead of update
   * @param useLateUpdate - Whether to call lateUpdate instead of update
   * @private
   */
  private runPhase(
    phase: SchedulePhase,
    context: SystemContext,
    useFixedUpdate = false,
    useLateUpdate = false
  ): void {
    this.ensureOrderCached();

    const systems = this.phaseOrders.get(phase);
    if (!systems) {
      return;
    }

    for (const system of systems) {
      if (!system.enabled) {
        continue;
      }

      const startTime = this.profilingEnabled ? performance.now() : 0;

      if (useFixedUpdate && system.fixedUpdate) {
        system.fixedUpdate(context);
      } else if (useLateUpdate && system.lateUpdate) {
        system.lateUpdate(context);
      } else {
        system.update(context);
      }

      if (this.profilingEnabled) {
        const endTime = performance.now();
        this.recordProfilingData(system, endTime - startTime);
      }
    }
  }

  /**
   * Records execution time for a system.
   *
   * @param system - System that was executed
   * @param executionTime - Time taken in milliseconds
   * @private
   */
  private recordProfilingData(system: System, executionTime: number): void {
    const data = this.profilingData.get(system);
    if (!data) {
      return;
    }

    data.callCount++;
    data.totalTime += executionTime;
    data.maxTime = Math.max(data.maxTime, executionTime);

    const windowSize = Math.min(data.callCount, this.PROFILING_WINDOW);
    data.avgTime = (data.avgTime * (windowSize - 1) + executionTime) / windowSize;
  }

  /**
   * Ensures execution order is cached for all phases.
   * Rebuilds cache if dirty.
   *
   * @private
   */
  private ensureOrderCached(): void {
    if (!this.isDirty) {
      return;
    }

    this.phaseOrders.clear();

    const phases = Object.values(SchedulePhase);

    for (const phase of phases) {
      const phaseSystems = Array.from(this.entries.values())
        .filter(e => e.phase === phase)
        .map(e => e.system);

      if (phaseSystems.length > 0) {
        const sorted = this.topologicalSort(phaseSystems, phase);
        this.phaseOrders.set(phase, sorted);
      }
    }

    this.isDirty = false;
  }

  /**
   * Performs topological sort on systems based on priority and dependencies.
   *
   * @param systems - Systems to sort
   * @param phase - Phase these systems belong to
   * @returns Sorted array of systems
   * @private
   */
  private topologicalSort(systems: System[], phase: SchedulePhase): System[] {
    const sorted: System[] = [];
    const visited = new Set<System>();
    const visiting = new Set<System>();

    const visit = (system: System): void => {
      if (visited.has(system)) {
        return;
      }

      if (visiting.has(system)) {
        return;
      }

      visiting.add(system);

      const entry = this.entries.get(system);
      if (entry?.dependencies) {
        for (const dep of entry.dependencies) {
          const depEntry = this.entries.get(dep);
          if (depEntry?.phase === phase) {
            visit(dep);
          }
        }
      }

      visiting.delete(system);
      visited.add(system);
      sorted.push(system);
    };

    const systemsByPriority = [...systems].sort((a, b) => {
      const entryA = this.entries.get(a)!;
      const entryB = this.entries.get(b)!;
      return entryA.priority - entryB.priority;
    });

    for (const system of systemsByPriority) {
      visit(system);
    }

    return sorted;
  }

  /**
   * Detects circular dependencies in a set of systems.
   *
   * @param systems - Systems to check
   * @param phase - Phase to check
   * @returns Error message if cycle detected, null otherwise
   * @private
   */
  private detectCycles(systems: System[], phase: SchedulePhase): string | null {
    const visited = new Set<System>();
    const recursionStack = new Set<System>();
    const path: System[] = [];

    const hasCycle = (system: System): boolean => {
      if (recursionStack.has(system)) {
        const cycleStart = path.indexOf(system);
        const cycle = path.slice(cycleStart).map(s => s.name).join(' -> ');
        return true;
      }

      if (visited.has(system)) {
        return false;
      }

      visited.add(system);
      recursionStack.add(system);
      path.push(system);

      const entry = this.entries.get(system);
      if (entry?.dependencies) {
        for (const dep of entry.dependencies) {
          const depEntry = this.entries.get(dep);
          if (depEntry?.phase === phase) {
            if (hasCycle(dep)) {
              return true;
            }
          }
        }
      }

      recursionStack.delete(system);
      path.pop();
      return false;
    };

    for (const system of systems) {
      if (!visited.has(system)) {
        if (hasCycle(system)) {
          const cycleStart = path.findIndex(s => recursionStack.has(s));
          const cycle = path.slice(cycleStart).map(s => s.name).join(' -> ');
          return `Circular dependency detected in ${phase}: ${cycle} -> ${path[cycleStart].name}`;
        }
      }
    }

    return null;
  }
}

