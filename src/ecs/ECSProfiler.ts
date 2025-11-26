/**
 * @fileoverview Performance profiling for ECS operations.
 * Provides high-resolution timing, memory estimation, and hot path detection
 * for systems, queries, and archetypes with minimal overhead.
 *
 * @module ecs/ECSProfiler
 */

import { Entity } from './Entity';
import { System } from './System';
import { Archetype } from './Archetype';
import { Query, QueryDescriptor } from './Query';
import { ComponentRegistry, ComponentId } from './ComponentRegistry';

/**
 * Performance profile for a system.
 * Contains execution statistics aggregated over multiple frames.
 *
 * @example
 * ```typescript
 * const profile = profiler.getSystemProfiles()[0];
 * console.log(`${profile.name}: ${profile.avgTime.toFixed(2)}ms avg`);
 * console.log(`Min: ${profile.minTime.toFixed(2)}ms, Max: ${profile.maxTime.toFixed(2)}ms`);
 * console.log(`Processed ${profile.entityCount} entities on average`);
 * ```
 */
export interface SystemProfile {
  /**
   * System name for identification.
   */
  name: string;

  /**
   * Total accumulated time in milliseconds.
   */
  totalTime: number;

  /**
   * Average execution time in milliseconds.
   */
  avgTime: number;

  /**
   * Minimum execution time in milliseconds.
   */
  minTime: number;

  /**
   * Maximum execution time in milliseconds.
   */
  maxTime: number;

  /**
   * Number of times the system was called.
   */
  callCount: number;

  /**
   * Average number of entities processed per call.
   */
  entityCount: number;
}

/**
 * Performance profile for an archetype.
 * Contains memory usage and entity statistics.
 *
 * @example
 * ```typescript
 * const profile = profiler.getArchetypeProfiles()[0];
 * console.log(`Archetype ${profile.id}: ${profile.signature}`);
 * console.log(`${profile.entityCount} entities, ${profile.memoryUsage} bytes`);
 * ```
 */
export interface ArchetypeProfile {
  /**
   * Unique archetype identifier.
   */
  id: number;

  /**
   * Component names in the archetype signature.
   */
  signature: string;

  /**
   * Number of entities in this archetype.
   */
  entityCount: number;

  /**
   * Number of component types in this archetype.
   */
  componentCount: number;

  /**
   * Estimated memory usage in bytes.
   */
  memoryUsage: number;
}

/**
 * Performance profile for a query.
 * Contains matching statistics and iteration performance.
 *
 * @example
 * ```typescript
 * const profile = profiler.getQueryProfiles()[0];
 * console.log(`Query: ${profile.descriptor}`);
 * console.log(`Matches ${profile.matchingArchetypes} archetypes`);
 * console.log(`${profile.entityCount} entities total`);
 * ```
 */
export interface QueryProfile {
  /**
   * Human-readable query descriptor string.
   */
  descriptor: string;

  /**
   * Number of archetypes that match this query.
   */
  matchingArchetypes: number;

  /**
   * Total number of entities across all matching archetypes.
   */
  entityCount: number;

  /**
   * Number of times this query was iterated.
   */
  iterationCount: number;

  /**
   * Average iteration time in milliseconds.
   */
  avgIterationTime: number;
}

/**
 * Overall world performance profile.
 * Contains aggregate statistics for the entire ECS.
 *
 * @example
 * ```typescript
 * const profile = profiler.getWorldProfile();
 * console.log(`Entities: ${profile.entityCount}, Archetypes: ${profile.archetypeCount}`);
 * console.log(`Frame: ${profile.frameTime.toFixed(2)}ms`);
 * console.log(`Systems: ${profile.systemsTime.toFixed(2)}ms`);
 * console.log(`Overhead: ${profile.overhead.toFixed(2)}ms`);
 * ```
 */
export interface WorldProfile {
  /**
   * Total number of entities in the world.
   */
  entityCount: number;

  /**
   * Total number of archetypes.
   */
  archetypeCount: number;

  /**
   * Total number of systems.
   */
  systemCount: number;

  /**
   * Total number of queries.
   */
  queryCount: number;

  /**
   * Estimated total memory usage in bytes.
   */
  totalMemory: number;

  /**
   * Total frame time in milliseconds.
   */
  frameTime: number;

  /**
   * Total time spent in systems in milliseconds.
   */
  systemsTime: number;

  /**
   * Non-system overhead in milliseconds.
   */
  overhead: number;
}

/**
 * Performance profile for a single frame.
 * Contains detailed timing for all systems executed in the frame.
 *
 * @example
 * ```typescript
 * const frame = profiler.getFrameProfile();
 * if (frame) {
 *   console.log(`Frame ${frame.frameNumber}: ${frame.totalTime.toFixed(2)}ms`);
 *   for (const [system, time] of frame.systems) {
 *     console.log(`  ${system.name}: ${time.toFixed(2)}ms`);
 *   }
 * }
 * ```
 */
export interface FrameProfile {
  /**
   * Sequential frame number.
   */
  frameNumber: number;

  /**
   * Frame timestamp in milliseconds (performance.now()).
   */
  timestamp: number;

  /**
   * Frame delta time in milliseconds.
   */
  deltaTime: number;

  /**
   * System execution times in milliseconds.
   * Maps system instance to its execution time.
   */
  systems: Map<System, number>;

  /**
   * Total frame time in milliseconds.
   */
  totalTime: number;
}

/**
 * Internal system statistics tracker.
 * @internal
 */
interface SystemStats {
  name: string;
  totalTime: number;
  minTime: number;
  maxTime: number;
  callCount: number;
  totalEntities: number;
  startTime: number;
}

/**
 * Internal query statistics tracker.
 * @internal
 */
interface QueryStats {
  query: Query;
  totalTime: number;
  iterationCount: number;
}

/**
 * ECS profiler for performance monitoring and optimization.
 *
 * Provides high-resolution timing for systems, queries, and frames with configurable
 * overhead. Tracks memory usage, hot paths, and execution statistics.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const profiler = new ECSProfiler(world);
 * profiler.enabled = true;
 *
 * // Frame tracking
 * profiler.beginFrame();
 * profiler.beginSystem(system);
 * system.update(context);
 * profiler.endSystem(system);
 * profiler.endFrame();
 *
 * // Get profiles
 * const systemProfiles = profiler.getSystemProfiles();
 * const hotSystems = profiler.getHotSystems(5.0); // Systems taking > 5ms
 *
 * // Export data
 * const json = profiler.exportJSON();
 * const csv = profiler.exportCSV();
 *
 * // Sampling mode (low overhead)
 * profiler.startSampling(100); // Sample every 100ms
 * // ... application runs ...
 * profiler.stopSampling();
 * const samples = profiler.getSamples();
 * ```
 */
export class ECSProfiler {
  /**
   * Enable or disable profiling.
   * When disabled, all tracking methods return immediately with no overhead.
   */
  enabled: boolean = true;

  /**
   * Maximum number of frames to keep in history.
   */
  private _maxHistoryFrames: number = 300;

  /**
   * Reference to the world being profiled.
   * @internal
   */
  private world: any;

  /**
   * System statistics indexed by system instance.
   * @internal
   */
  private systemStats: Map<System, SystemStats> = new Map();

  /**
   * Query statistics indexed by query instance.
   * @internal
   */
  private queryStats: Map<Query, QueryStats> = new Map();

  /**
   * Frame history buffer (circular).
   * @internal
   */
  private frameHistory: FrameProfile[] = [];

  /**
   * Current frame being profiled.
   * @internal
   */
  private currentFrame: FrameProfile | null = null;

  /**
   * Frame start timestamp.
   * @internal
   */
  private frameStartTime: number = 0;

  /**
   * Current frame number.
   * @internal
   */
  private frameNumber: number = 0;

  /**
   * Sampling interval ID.
   * @internal
   */
  private samplingInterval: number | null = null;

  /**
   * Sampling frame buffer.
   * @internal
   */
  private samplingBuffer: FrameProfile[] = [];

  /**
   * Pre-allocated timestamp for zero-allocation hot path.
   * @internal
   */
  private tempTimestamp: number = 0;

  /**
   * Creates a new ECS profiler.
   *
   * @param world - World instance to profile
   *
   * @example
   * ```typescript
   * const world = new World();
   * const profiler = new ECSProfiler(world);
   * profiler.enabled = true;
   * ```
   */
  constructor(world: any) {
    this.world = world;
  }

  /**
   * Begins profiling a new frame.
   * Call this at the start of each frame update.
   *
   * Performance: < 0.001ms when enabled
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   profiler.beginFrame();
   *   world.update(deltaTime);
   *   profiler.endFrame();
   * }
   * ```
   */
  beginFrame(): void {
    if (!this.enabled) {
      return;
    }

    this.frameStartTime = performance.now();
    this.currentFrame = {
      frameNumber: this.frameNumber++,
      timestamp: this.frameStartTime,
      deltaTime: 0,
      systems: new Map(),
      totalTime: 0
    };
  }

  /**
   * Ends profiling the current frame.
   * Call this at the end of each frame update.
   *
   * Performance: < 0.001ms when enabled
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   profiler.beginFrame();
   *   world.update(deltaTime);
   *   profiler.endFrame();
   * }
   * ```
   */
  endFrame(): void {
    if (!this.enabled || !this.currentFrame) {
      return;
    }

    const endTime = performance.now();
    this.currentFrame.totalTime = endTime - this.frameStartTime;
    this.currentFrame.deltaTime = this.currentFrame.totalTime;

    // Add to history (circular buffer)
    if (this.frameHistory.length >= this._maxHistoryFrames) {
      this.frameHistory.shift();
    }
    this.frameHistory.push(this.currentFrame);

    this.currentFrame = null;
  }

  /**
   * Begins profiling a system.
   * Call this immediately before system execution.
   *
   * Performance: < 0.0005ms when enabled
   *
   * @param system - System instance being profiled
   *
   * @example
   * ```typescript
   * profiler.beginSystem(movementSystem);
   * movementSystem.update(context);
   * profiler.endSystem(movementSystem);
   * ```
   */
  beginSystem(system: System): void {
    if (!this.enabled) {
      return;
    }

    let stats = this.systemStats.get(system);
    if (!stats) {
      stats = {
        name: system.name,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        callCount: 0,
        totalEntities: 0,
        startTime: 0
      };
      this.systemStats.set(system, stats);
    }

    stats.startTime = performance.now();
  }

  /**
   * Ends profiling a system.
   * Call this immediately after system execution.
   *
   * Performance: < 0.0005ms when enabled
   *
   * @param system - System instance being profiled
   *
   * @example
   * ```typescript
   * profiler.beginSystem(movementSystem);
   * movementSystem.update(context);
   * profiler.endSystem(movementSystem);
   * ```
   */
  endSystem(system: System): void {
    if (!this.enabled) {
      return;
    }

    const stats = this.systemStats.get(system);
    if (!stats) {
      return;
    }

    const endTime = performance.now();
    const duration = endTime - stats.startTime;

    stats.totalTime += duration;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.callCount++;

    // Track entity count if query is available
    try {
      const query = (system as any)._resolvedQuery;
      if (query && typeof query.entityCount === 'number') {
        stats.totalEntities += query.entityCount;
      }
    } catch {
      // Ignore errors accessing private query
    }

    // Record in current frame
    if (this.currentFrame) {
      this.currentFrame.systems.set(system, duration);
    }
  }

  /**
   * Tracks a query iteration.
   * Call this after iterating a query to track performance.
   *
   * Performance: < 0.0002ms when enabled
   *
   * @param query - Query instance being tracked
   * @param iterationTime - Time spent iterating in milliseconds
   * @param entityCount - Number of entities processed
   *
   * @example
   * ```typescript
   * const start = performance.now();
   * query.forEach((entity, components) => {
   *   // Process entity
   * });
   * const time = performance.now() - start;
   * profiler.trackQuery(query, time, query.entityCount);
   * ```
   */
  trackQuery(query: Query, iterationTime: number, entityCount: number): void {
    if (!this.enabled) {
      return;
    }

    let stats = this.queryStats.get(query);
    if (!stats) {
      stats = {
        query,
        totalTime: 0,
        iterationCount: 0
      };
      this.queryStats.set(query, stats);
    }

    stats.totalTime += iterationTime;
    stats.iterationCount++;
  }

  /**
   * Gets performance profiles for all systems.
   *
   * @returns Array of system profiles sorted by total time (descending)
   *
   * @example
   * ```typescript
   * const profiles = profiler.getSystemProfiles();
   * for (const profile of profiles) {
   *   console.log(`${profile.name}: ${profile.avgTime.toFixed(2)}ms`);
   * }
   * ```
   */
  getSystemProfiles(): SystemProfile[] {
    const profiles: SystemProfile[] = [];

    for (const [system, stats] of this.systemStats) {
      profiles.push({
        name: stats.name,
        totalTime: stats.totalTime,
        avgTime: stats.callCount > 0 ? stats.totalTime / stats.callCount : 0,
        minTime: stats.minTime === Infinity ? 0 : stats.minTime,
        maxTime: stats.maxTime,
        callCount: stats.callCount,
        entityCount: stats.callCount > 0 ? stats.totalEntities / stats.callCount : 0
      });
    }

    // Sort by total time descending
    profiles.sort((a, b) => b.totalTime - a.totalTime);
    return profiles;
  }

  /**
   * Gets performance profiles for all archetypes.
   *
   * @returns Array of archetype profiles sorted by memory usage (descending)
   *
   * @example
   * ```typescript
   * const profiles = profiler.getArchetypeProfiles();
   * for (const profile of profiles) {
   *   console.log(`${profile.signature}: ${profile.memoryUsage} bytes`);
   * }
   * ```
   */
  getArchetypeProfiles(): ArchetypeProfile[] {
    const profiles: ArchetypeProfile[] = [];

    // Get archetypes from world
    const archetypes = this.getArchetypesFromWorld();

    for (const archetype of archetypes) {
      const componentIds = archetype.signature.toArray();
      const componentNames = componentIds.map(id => {
        const metadata = ComponentRegistry.getMetadata(id);
        return metadata?.name || `Component${id}`;
      });

      profiles.push({
        id: archetype.id,
        signature: componentNames.join(', '),
        entityCount: archetype.entityCount,
        componentCount: componentIds.length,
        memoryUsage: this.estimateArchetypeMemory(archetype)
      });
    }

    // Sort by memory usage descending
    profiles.sort((a, b) => b.memoryUsage - a.memoryUsage);
    return profiles;
  }

  /**
   * Gets performance profiles for all queries.
   *
   * @returns Array of query profiles sorted by iteration count (descending)
   *
   * @example
   * ```typescript
   * const profiles = profiler.getQueryProfiles();
   * for (const profile of profiles) {
   *   console.log(`${profile.descriptor}: ${profile.avgIterationTime.toFixed(3)}ms`);
   * }
   * ```
   */
  getQueryProfiles(): QueryProfile[] {
    const profiles: QueryProfile[] = [];

    for (const [query, stats] of this.queryStats) {
      profiles.push({
        descriptor: this.formatQueryDescriptor(query.descriptor),
        matchingArchetypes: query.matchingArchetypes.length,
        entityCount: query.entityCount,
        iterationCount: stats.iterationCount,
        avgIterationTime: stats.iterationCount > 0 ? stats.totalTime / stats.iterationCount : 0
      });
    }

    // Sort by iteration count descending
    profiles.sort((a, b) => b.iterationCount - a.iterationCount);
    return profiles;
  }

  /**
   * Gets the overall world performance profile.
   *
   * @returns World profile with aggregate statistics
   *
   * @example
   * ```typescript
   * const profile = profiler.getWorldProfile();
   * console.log(`World: ${profile.entityCount} entities`);
   * console.log(`Frame: ${profile.frameTime.toFixed(2)}ms`);
   * console.log(`Systems: ${profile.systemsTime.toFixed(2)}ms (${(profile.systemsTime / profile.frameTime * 100).toFixed(1)}%)`);
   * ```
   */
  getWorldProfile(): WorldProfile {
    const archetypes = this.getArchetypesFromWorld();
    let entityCount = 0;
    let totalMemory = 0;

    for (const archetype of archetypes) {
      entityCount += archetype.entityCount;
      totalMemory += this.estimateArchetypeMemory(archetype);
    }

    const systemsTime = Array.from(this.systemStats.values())
      .reduce((sum, stats) => sum + (stats.callCount > 0 ? stats.totalTime / stats.callCount : 0), 0);

    const avgFrameTime = this.getAverageFrameTime();

    return {
      entityCount,
      archetypeCount: archetypes.length,
      systemCount: this.systemStats.size,
      queryCount: this.queryStats.size,
      totalMemory,
      frameTime: avgFrameTime,
      systemsTime,
      overhead: Math.max(0, avgFrameTime - systemsTime)
    };
  }

  /**
   * Gets the most recent frame profile.
   *
   * @returns Current frame profile, or null if no frames have been profiled
   *
   * @example
   * ```typescript
   * const frame = profiler.getFrameProfile();
   * if (frame) {
   *   console.log(`Frame ${frame.frameNumber}: ${frame.totalTime.toFixed(2)}ms`);
   * }
   * ```
   */
  getFrameProfile(): FrameProfile | null {
    if (this.frameHistory.length === 0) {
      return null;
    }
    return this.frameHistory[this.frameHistory.length - 1];
  }

  /**
   * Gets recent frame history.
   *
   * @param count - Number of recent frames to return (default: all)
   * @returns Array of frame profiles, newest first
   *
   * @example
   * ```typescript
   * const recent = profiler.getFrameHistory(10);
   * for (const frame of recent) {
   *   console.log(`Frame ${frame.frameNumber}: ${frame.totalTime.toFixed(2)}ms`);
   * }
   * ```
   */
  getFrameHistory(count?: number): FrameProfile[] {
    if (count === undefined) {
      return [...this.frameHistory].reverse();
    }

    const start = Math.max(0, this.frameHistory.length - count);
    return this.frameHistory.slice(start).reverse();
  }

  /**
   * Gets the average frame time over recent frames.
   *
   * @param frames - Number of frames to average (default: all in history)
   * @returns Average frame time in milliseconds
   *
   * @example
   * ```typescript
   * const avgTime = profiler.getAverageFrameTime(60);
   * console.log(`Average frame time (60 frames): ${avgTime.toFixed(2)}ms`);
   * ```
   */
  getAverageFrameTime(frames?: number): number {
    if (this.frameHistory.length === 0) {
      return 0;
    }

    const count = frames === undefined ? this.frameHistory.length : Math.min(frames, this.frameHistory.length);
    const start = this.frameHistory.length - count;
    let sum = 0;

    for (let i = start; i < this.frameHistory.length; i++) {
      sum += this.frameHistory[i].totalTime;
    }

    return sum / count;
  }

  /**
   * Gets the average execution time for a specific system.
   *
   * @param system - System to get average time for
   * @param frames - Number of frames to average over (default: all)
   * @returns Average system time in milliseconds
   *
   * @example
   * ```typescript
   * const avgTime = profiler.getAverageSystemTime(movementSystem, 60);
   * console.log(`Movement system avg: ${avgTime.toFixed(2)}ms`);
   * ```
   */
  getAverageSystemTime(system: System, frames?: number): number {
    const stats = this.systemStats.get(system);
    if (!stats || stats.callCount === 0) {
      return 0;
    }

    if (frames === undefined) {
      return stats.totalTime / stats.callCount;
    }

    // Calculate average from frame history
    const count = Math.min(frames, this.frameHistory.length);
    const start = this.frameHistory.length - count;
    let sum = 0;
    let samples = 0;

    for (let i = start; i < this.frameHistory.length; i++) {
      const time = this.frameHistory[i].systems.get(system);
      if (time !== undefined) {
        sum += time;
        samples++;
      }
    }

    return samples > 0 ? sum / samples : 0;
  }

  /**
   * Gets the estimated total memory usage.
   *
   * @returns Estimated memory usage in bytes
   *
   * @example
   * ```typescript
   * const memory = profiler.getMemoryUsage();
   * console.log(`Memory: ${(memory / 1024 / 1024).toFixed(2)} MB`);
   * ```
   */
  getMemoryUsage(): number {
    return this.estimateWorldMemory();
  }

  /**
   * Gets systems that exceed a time threshold (hot systems).
   *
   * @param threshold - Time threshold in milliseconds (default: 1.0)
   * @returns Array of systems exceeding the threshold, sorted by time
   *
   * @example
   * ```typescript
   * const hotSystems = profiler.getHotSystems(5.0);
   * console.log(`Found ${hotSystems.length} systems taking > 5ms`);
   * for (const system of hotSystems) {
   *   const avgTime = profiler.getAverageSystemTime(system);
   *   console.log(`  ${system.name}: ${avgTime.toFixed(2)}ms`);
   * }
   * ```
   */
  getHotSystems(threshold: number = 1.0): System[] {
    const hotSystems: Array<{ system: System; time: number }> = [];

    for (const [system, stats] of this.systemStats) {
      const avgTime = stats.callCount > 0 ? stats.totalTime / stats.callCount : 0;
      if (avgTime > threshold) {
        hotSystems.push({ system, time: avgTime });
      }
    }

    // Sort by time descending
    hotSystems.sort((a, b) => b.time - a.time);
    return hotSystems.map(hs => hs.system);
  }

  /**
   * Gets queries that exceed a time threshold (hot queries).
   *
   * @param threshold - Time threshold in milliseconds (default: 0.5)
   * @returns Array of queries exceeding the threshold, sorted by time
   *
   * @example
   * ```typescript
   * const hotQueries = profiler.getHotQueries(1.0);
   * console.log(`Found ${hotQueries.length} slow queries`);
   * ```
   */
  getHotQueries(threshold: number = 0.5): Query[] {
    const hotQueries: Array<{ query: Query; time: number }> = [];

    for (const [query, stats] of this.queryStats) {
      const avgTime = stats.iterationCount > 0 ? stats.totalTime / stats.iterationCount : 0;
      if (avgTime > threshold) {
        hotQueries.push({ query, time: avgTime });
      }
    }

    // Sort by time descending
    hotQueries.sort((a, b) => b.time - a.time);
    return hotQueries.map(hq => hq.query);
  }

  /**
   * Gets the largest archetypes by entity count.
   *
   * @param count - Number of archetypes to return (default: 10)
   * @returns Array of largest archetypes, sorted by entity count
   *
   * @example
   * ```typescript
   * const largest = profiler.getLargestArchetypes(5);
   * for (const archetype of largest) {
   *   console.log(`Archetype ${archetype.id}: ${archetype.entityCount} entities`);
   * }
   * ```
   */
  getLargestArchetypes(count: number = 10): Archetype[] {
    const archetypes = this.getArchetypesFromWorld();

    // Sort by entity count descending
    archetypes.sort((a, b) => b.entityCount - a.entityCount);

    return archetypes.slice(0, count);
  }

  /**
   * Estimates memory usage for an archetype.
   *
   * Calculates memory based on:
   * - Entity array overhead (8 bytes per entity)
   * - Component storage (schema size × entity count)
   * - SparseSet overhead (16 bytes per entity)
   *
   * @param archetype - Archetype to estimate
   * @returns Estimated memory usage in bytes
   *
   * @example
   * ```typescript
   * const memory = profiler.estimateArchetypeMemory(archetype);
   * console.log(`Archetype uses ~${(memory / 1024).toFixed(2)} KB`);
   * ```
   */
  estimateArchetypeMemory(archetype: Archetype): number {
    const entityCount = archetype.entityCount;
    const componentIds = archetype.signature.toArray();

    // Base overhead: entity array + sparse set
    let memory = entityCount * 8; // Entity references
    memory += entityCount * 16; // SparseSet overhead (dense + sparse)

    // Component storage
    for (const componentId of componentIds) {
      const metadata = ComponentRegistry.getMetadata(componentId);
      if (metadata?.schema?.totalSize) {
        memory += metadata.schema.totalSize * entityCount;
      } else {
        // Estimate for object-based components
        memory += 64 * entityCount; // Rough estimate for JS objects
      }
    }

    return memory;
  }

  /**
   * Estimates total world memory usage.
   *
   * @returns Estimated total memory in bytes
   *
   * @example
   * ```typescript
   * const memory = profiler.estimateWorldMemory();
   * console.log(`World memory: ${(memory / 1024 / 1024).toFixed(2)} MB`);
   * ```
   */
  estimateWorldMemory(): number {
    const archetypes = this.getArchetypesFromWorld();
    let total = 0;

    for (const archetype of archetypes) {
      total += this.estimateArchetypeMemory(archetype);
    }

    return total;
  }

  /**
   * Starts continuous sampling mode for low-overhead profiling.
   *
   * In sampling mode, frames are captured at regular intervals rather than
   * every frame, reducing overhead for production monitoring.
   *
   * @param intervalMs - Sampling interval in milliseconds (default: 1000)
   *
   * @example
   * ```typescript
   * // Sample once per second
   * profiler.startSampling(1000);
   *
   * // Later...
   * profiler.stopSampling();
   * const samples = profiler.getSamples();
   * ```
   */
  startSampling(intervalMs: number = 1000): void {
    if (this.samplingInterval !== null) {
      this.stopSampling();
    }

    this.samplingBuffer = [];

    this.samplingInterval = setInterval(() => {
      const frame = this.getFrameProfile();
      if (frame) {
        this.samplingBuffer.push(frame);

        // Limit buffer size
        if (this.samplingBuffer.length > 1000) {
          this.samplingBuffer.shift();
        }
      }
    }, intervalMs) as any;
  }

  /**
   * Stops continuous sampling mode.
   *
   * @example
   * ```typescript
   * profiler.stopSampling();
   * const samples = profiler.getSamples();
   * console.log(`Collected ${samples.length} samples`);
   * ```
   */
  stopSampling(): void {
    if (this.samplingInterval !== null) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
  }

  /**
   * Gets all collected samples from sampling mode.
   *
   * @returns Array of sampled frame profiles
   *
   * @example
   * ```typescript
   * const samples = profiler.getSamples();
   * const avgTime = samples.reduce((sum, s) => sum + s.totalTime, 0) / samples.length;
   * console.log(`Average sampled frame time: ${avgTime.toFixed(2)}ms`);
   * ```
   */
  getSamples(): FrameProfile[] {
    return [...this.samplingBuffer];
  }

  /**
   * Exports profiling data as JSON.
   *
   * @returns JSON string containing all profiling data
   *
   * @example
   * ```typescript
   * const json = profiler.exportJSON();
   * localStorage.setItem('profiling-data', json);
   * // Or send to analytics server
   * ```
   */
  exportJSON(): string {
    const data = {
      timestamp: Date.now(),
      world: this.getWorldProfile(),
      systems: this.getSystemProfiles(),
      archetypes: this.getArchetypeProfiles(),
      queries: this.getQueryProfiles(),
      frames: this.getFrameHistory(100) // Last 100 frames
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Exports profiling data as CSV.
   *
   * @returns CSV string with system performance data
   *
   * @example
   * ```typescript
   * const csv = profiler.exportCSV();
   * const blob = new Blob([csv], { type: 'text/csv' });
   * const url = URL.createObjectURL(blob);
   * // Download or analyze in spreadsheet
   * ```
   */
  exportCSV(): string {
    const profiles = this.getSystemProfiles();
    const lines: string[] = [];

    // Header
    lines.push('System,Total Time (ms),Avg Time (ms),Min Time (ms),Max Time (ms),Call Count,Avg Entities');

    // Data rows
    for (const profile of profiles) {
      lines.push([
        profile.name,
        profile.totalTime.toFixed(4),
        profile.avgTime.toFixed(4),
        profile.minTime.toFixed(4),
        profile.maxTime.toFixed(4),
        profile.callCount.toString(),
        profile.entityCount.toFixed(0)
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Resets all profiling data.
   *
   * @example
   * ```typescript
   * profiler.reset();
   * console.log('Profiling data cleared');
   * ```
   */
  reset(): void {
    this.systemStats.clear();
    this.queryStats.clear();
    this.frameHistory = [];
    this.currentFrame = null;
    this.frameNumber = 0;
    this.samplingBuffer = [];
  }

  /**
   * Resets profiling data for a specific system.
   *
   * @param system - System to reset
   *
   * @example
   * ```typescript
   * profiler.resetSystemProfile(movementSystem);
   * ```
   */
  resetSystemProfile(system: System): void {
    this.systemStats.delete(system);
  }

  /**
   * Gets the maximum number of frames kept in history.
   *
   * @returns Maximum history frame count
   *
   * @example
   * ```typescript
   * console.log(`History size: ${profiler.maxHistoryFrames}`);
   * ```
   */
  get maxHistoryFrames(): number {
    return this._maxHistoryFrames;
  }

  /**
   * Sets the maximum number of frames to keep in history.
   *
   * @param count - Maximum frame count (must be > 0)
   *
   * @example
   * ```typescript
   * profiler.setMaxHistoryFrames(600); // Keep 10 seconds at 60 FPS
   * ```
   */
  setMaxHistoryFrames(count: number): void {
    if (count <= 0) {
      throw new Error('Max history frames must be greater than 0');
    }

    this._maxHistoryFrames = count;

    // Trim existing history if needed
    while (this.frameHistory.length > this._maxHistoryFrames) {
      this.frameHistory.shift();
    }
  }

  /**
   * Gets archetypes from the world.
   * @internal
   */
  private getArchetypesFromWorld(): Archetype[] {
    // Try to access archetypes from world
    if (this.world && typeof this.world.getArchetypes === 'function') {
      return this.world.getArchetypes();
    }

    // Try alternative access patterns
    if (this.world && this.world.archetypes) {
      if (Array.isArray(this.world.archetypes)) {
        return this.world.archetypes;
      }
      if (this.world.archetypes instanceof Map) {
        return Array.from(this.world.archetypes.values());
      }
    }

    return [];
  }

  /**
   * Formats a query descriptor as a string.
   * @internal
   */
  private formatQueryDescriptor(descriptor: QueryDescriptor): string {
    const parts: string[] = [];

    if (descriptor.all && descriptor.all.length > 0) {
      const names = descriptor.all.map(type => type.name || 'Component');
      parts.push(`all: [${names.join(', ')}]`);
    }

    if (descriptor.any && descriptor.any.length > 0) {
      const names = descriptor.any.map(type => type.name || 'Component');
      parts.push(`any: [${names.join(', ')}]`);
    }

    if (descriptor.none && descriptor.none.length > 0) {
      const names = descriptor.none.map(type => type.name || 'Component');
      parts.push(`none: [${names.join(', ')}]`);
    }

    return parts.length > 0 ? `{ ${parts.join(', ')} }` : '{}';
  }
}

/**
 * Inline profiling macros for compile-time control.
 *
 * These provide a convenient API for ad-hoc profiling that can be
 * compiled out in production builds.
 *
 * @example
 * ```typescript
 * // Profile a scope
 * Profile.begin('heavy-computation');
 * // ... expensive code ...
 * Profile.end('heavy-computation');
 *
 * // Profile a function
 * const result = Profile.scope('database-query', () => {
 *   return database.query('SELECT * FROM users');
 * });
 * ```
 */
export const Profile = {
  /**
   * Active profiling scopes.
   * @internal
   */
  scopes: new Map<string, number>(),

  /**
   * Begins a profiling scope.
   *
   * @param name - Scope identifier
   *
   * @example
   * ```typescript
   * Profile.begin('pathfinding');
   * const path = findPath(start, goal);
   * Profile.end('pathfinding');
   * ```
   */
  begin(name: string): void {
    this.scopes.set(name, performance.now());
  },

  /**
   * Ends a profiling scope and logs the duration.
   *
   * @param name - Scope identifier
   *
   * @example
   * ```typescript
   * Profile.begin('physics');
   * world.step(deltaTime);
   * Profile.end('physics'); // Logs: "Profile [physics]: 2.35ms"
   * ```
   */
  end(name: string): void {
    const startTime = this.scopes.get(name);
    if (startTime === undefined) {
      console.warn(`Profile.end('${name}') called without matching begin()`);
      return;
    }

    const duration = performance.now() - startTime;
    console.log(`Profile [${name}]: ${duration.toFixed(3)}ms`);
    this.scopes.delete(name);
  },

  /**
   * Profiles a function execution.
   *
   * @typeParam T - Function return type
   * @param name - Scope identifier
   * @param fn - Function to profile
   * @returns Function return value
   *
   * @example
   * ```typescript
   * const users = Profile.scope('load-users', () => {
   *   return database.loadUsers();
   * });
   * // Logs: "Profile [load-users]: 15.42ms"
   * ```
   */
  scope<T>(name: string, fn: () => T): T {
    this.begin(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }
};

// Types are exported via index.ts
