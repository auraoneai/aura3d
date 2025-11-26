/**
 * @module Shaders
 * @description
 * Registry for reusable shader code chunks with dependency resolution.
 * Manages shader snippets that can be included and composed into complete shaders.
 */

import { Logger } from '../core/Logger';

const logger = Logger.create('ShaderChunkRegistry');

/**
 * Shader chunk definition
 */
export interface ShaderChunk {
  /** Unique chunk name */
  name: string;
  /** Shader source code */
  source: string;
  /** Dependencies on other chunks */
  dependencies: string[];
}

/**
 * Dependency graph node for topological sorting
 */
interface DependencyNode {
  name: string;
  dependencies: Set<string>;
  dependents: Set<string>;
}

/**
 * Registry for shader code chunks.
 * Manages reusable shader snippets with automatic dependency resolution
 * and circular dependency detection.
 *
 * @example
 * ```typescript
 * // Register a chunk
 * ShaderChunkRegistry.register('common', `
 *   const float PI = 3.14159265359;
 *   float saturate(float x) { return clamp(x, 0.0, 1.0); }
 * `);
 *
 * // Register a chunk with dependencies
 * ShaderChunkRegistry.register('pbr', `
 *   vec3 fresnelSchlick(float cosTheta, vec3 F0) {
 *     return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
 *   }
 * `, ['common']);
 *
 * // Resolve chunk with all dependencies
 * const code = ShaderChunkRegistry.resolve('pbr');
 * ```
 */
export class ShaderChunkRegistry {
  /**
   * Map of chunk name to chunk data
   */
  private static chunks = new Map<string, ShaderChunk>();

  /**
   * Cache for resolved chunks
   */
  private static resolveCache = new Map<string, string>();

  /**
   * Register a shader chunk
   *
   * @param name - Unique chunk name
   * @param source - Shader source code
   * @param dependencies - Optional array of dependency chunk names
   *
   * @example
   * ```typescript
   * ShaderChunkRegistry.register('lighting', lightingCode, ['common', 'pbr']);
   * ```
   */
  static register(name: string, source: string, dependencies: string[] = []): void {
    if (this.chunks.has(name)) {
      logger.warn(`Overwriting existing shader chunk: ${name}`);
    }

    // Validate dependencies exist (except for forward declarations)
    for (const dep of dependencies) {
      if (!this.chunks.has(dep)) {
        logger.warn(`Chunk '${name}' depends on non-existent chunk '${dep}'`);
      }
    }

    // Check for circular dependencies
    const tempChunk: ShaderChunk = { name, source, dependencies };
    if (this.hasCircularDependency(name, tempChunk)) {
      throw new Error(`Circular dependency detected for chunk '${name}'`);
    }

    this.chunks.set(name, tempChunk);

    // Invalidate cache for this chunk and dependents
    this.invalidateCache(name);

    logger.debug(`Registered shader chunk: ${name} (${dependencies.length} dependencies)`);
  }

  /**
   * Get a shader chunk by name
   *
   * @param name - Chunk name
   * @returns Shader source code or undefined if not found
   *
   * @example
   * ```typescript
   * const source = ShaderChunkRegistry.get('common');
   * ```
   */
  static get(name: string): string | undefined {
    const chunk = this.chunks.get(name);
    return chunk?.source;
  }

  /**
   * Resolve a chunk with all dependencies inlined
   *
   * @param name - Chunk name to resolve
   * @returns Complete shader code with dependencies
   *
   * @example
   * ```typescript
   * // Returns common + pbr + lighting code in correct order
   * const code = ShaderChunkRegistry.resolve('lighting');
   * ```
   */
  static resolve(name: string): string {
    // Check cache first
    const cached = this.resolveCache.get(name);
    if (cached !== undefined) {
      return cached;
    }

    const chunk = this.chunks.get(name);
    if (!chunk) {
      logger.error(`Shader chunk not found: ${name}`);
      return '';
    }

    // Get dependency order
    const order = this.getDependencyOrder([name]);

    // Combine all chunks in order
    const sources: string[] = [];
    const included = new Set<string>();

    for (const chunkName of order) {
      if (included.has(chunkName)) {
        continue; // Prevent duplicates
      }

      const chunkData = this.chunks.get(chunkName);
      if (chunkData) {
        sources.push(`// Chunk: ${chunkName}`);
        sources.push(chunkData.source);
        sources.push(''); // Empty line separator
        included.add(chunkName);
      }
    }

    const result = sources.join('\n');

    // Cache the result
    this.resolveCache.set(name, result);

    return result;
  }

  /**
   * Get dependency order for chunks (topological sort)
   *
   * @param names - Chunk names to resolve
   * @returns Ordered array of chunk names
   *
   * @example
   * ```typescript
   * const order = ShaderChunkRegistry.getDependencyOrder(['pbr', 'lighting']);
   * // Returns: ['common', 'pbr', 'lighting']
   * ```
   */
  static getDependencyOrder(names: string[]): string[] {
    const graph = this.buildDependencyGraph(names);
    return this.topologicalSort(graph);
  }

  /**
   * Get all registered chunks
   *
   * @returns Map of all chunks
   *
   * @example
   * ```typescript
   * const allChunks = ShaderChunkRegistry.getAll();
   * for (const [name, chunk] of allChunks) {
   *   console.log(`${name}: ${chunk.dependencies.length} deps`);
   * }
   * ```
   */
  static getAll(): Map<string, ShaderChunk> {
    return new Map(this.chunks);
  }

  /**
   * Check if a chunk exists
   *
   * @param name - Chunk name
   * @returns True if chunk exists
   */
  static has(name: string): boolean {
    return this.chunks.has(name);
  }

  /**
   * Clear all registered chunks
   */
  static clear(): void {
    this.chunks.clear();
    this.resolveCache.clear();
    logger.debug('Cleared all shader chunks');
  }

  /**
   * Get chunk count
   */
  static get count(): number {
    return this.chunks.size;
  }

  /**
   * Process #include directives in shader source
   *
   * @param source - Shader source with #include directives
   * @returns Processed source with includes expanded
   *
   * @example
   * ```typescript
   * const source = `
   *   #include "common"
   *   #include "pbr"
   *   void main() { ... }
   * `;
   * const processed = ShaderChunkRegistry.processIncludes(source);
   * ```
   */
  static processIncludes(source: string): string {
    const lines = source.split('\n');
    const output: string[] = [];
    const included = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for #include directive
      const includeMatch = trimmed.match(/^#include\s+["<]([^">]+)[">]/);
      if (includeMatch) {
        const chunkName = includeMatch[1];

        // Prevent duplicate includes
        if (included.has(chunkName)) {
          output.push(`// Already included: ${chunkName}`);
          continue;
        }

        // Resolve and include chunk
        const resolved = this.resolve(chunkName);
        if (resolved) {
          output.push(`// Begin include: ${chunkName}`);
          output.push(resolved);
          output.push(`// End include: ${chunkName}`);
          included.add(chunkName);
        } else {
          output.push(`// ERROR: Chunk not found: ${chunkName}`);
          logger.error(`Failed to include chunk: ${chunkName}`);
        }
      } else {
        output.push(line);
      }
    }

    return output.join('\n');
  }

  /**
   * Build dependency graph for chunks
   */
  private static buildDependencyGraph(names: string[]): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();
    const visited = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      visited.add(name);

      const chunk = this.chunks.get(name);
      if (!chunk) {
        logger.warn(`Chunk not found while building graph: ${name}`);
        return;
      }

      // Create node if it doesn't exist
      if (!graph.has(name)) {
        graph.set(name, {
          name,
          dependencies: new Set(),
          dependents: new Set()
        });
      }

      const node = graph.get(name)!;

      // Process dependencies
      for (const dep of chunk.dependencies) {
        node.dependencies.add(dep);

        // Create dependency node if needed
        if (!graph.has(dep)) {
          graph.set(dep, {
            name: dep,
            dependencies: new Set(),
            dependents: new Set()
          });
        }

        // Add reverse link
        graph.get(dep)!.dependents.add(name);

        // Recursively visit dependencies
        visit(dep);
      }
    };

    // Build graph from initial chunks
    for (const name of names) {
      visit(name);
    }

    return graph;
  }

  /**
   * Topological sort of dependency graph
   */
  private static topologicalSort(graph: Map<string, DependencyNode>): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) return;

      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected at '${name}'`);
      }

      visiting.add(name);

      const node = graph.get(name);
      if (node) {
        // Visit dependencies first
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    // Visit all nodes
    for (const name of graph.keys()) {
      visit(name);
    }

    return result;
  }

  /**
   * Check for circular dependencies
   */
  private static hasCircularDependency(name: string, chunk: ShaderChunk): boolean {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (currentName: string, currentDeps: string[]): boolean => {
      if (visited.has(currentName)) return false;
      if (visiting.has(currentName)) return true;

      visiting.add(currentName);

      for (const dep of currentDeps) {
        if (dep === name) {
          // Would create a cycle back to the chunk being added
          return true;
        }

        const depChunk = this.chunks.get(dep);
        if (depChunk && visit(dep, depChunk.dependencies)) {
          return true;
        }
      }

      visiting.delete(currentName);
      visited.add(currentName);
      return false;
    };

    return visit(name, chunk.dependencies);
  }

  /**
   * Invalidate resolve cache for chunk and all dependents
   */
  private static invalidateCache(name: string): void {
    // Clear cache for this chunk
    this.resolveCache.delete(name);

    // Find and clear cache for all chunks that depend on this one
    for (const [chunkName, chunk] of this.chunks) {
      if (chunk.dependencies.includes(name)) {
        this.invalidateCache(chunkName);
      }
    }
  }

  /**
   * Get statistics about the registry
   */
  static getStats(): {
    chunkCount: number;
    cacheSize: number;
    averageDependencies: number;
    maxDependencyDepth: number;
  } {
    let totalDeps = 0;
    let maxDepth = 0;

    for (const chunk of this.chunks.values()) {
      totalDeps += chunk.dependencies.length;
      const depth = this.getDepth(chunk.name);
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      chunkCount: this.chunks.size,
      cacheSize: this.resolveCache.size,
      averageDependencies: this.chunks.size > 0 ? totalDeps / this.chunks.size : 0,
      maxDependencyDepth: maxDepth
    };
  }

  /**
   * Get dependency depth for a chunk
   */
  private static getDepth(name: string, visited = new Set<string>()): number {
    if (visited.has(name)) return 0;
    visited.add(name);

    const chunk = this.chunks.get(name);
    if (!chunk || chunk.dependencies.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const dep of chunk.dependencies) {
      const depth = this.getDepth(dep, visited);
      maxDepth = Math.max(maxDepth, depth + 1);
    }

    return maxDepth;
  }
}
