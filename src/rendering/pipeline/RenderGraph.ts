/**
 * Frame graph for automatic resource management in G3D rendering engine.
 * Implements pass dependency resolution, resource aliasing for memory efficiency,
 * async resource barriers, and transient resource allocation.
 *
 * @module RenderGraph
 */

import { RenderPass, PassDependency, AttachmentReference } from './RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from './RenderTarget';
import { RenderQueue } from './RenderQueue';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RenderGraph');

/**
 * Resource lifetime descriptor.
 * Defines when a resource is first used and last used.
 */
interface ResourceLifetime {
  /** Resource name */
  name: string;
  /** First pass that uses this resource (index) */
  firstUse: number;
  /** Last pass that uses this resource (index) */
  lastUse: number;
  /** Whether resource is imported (external) */
  imported: boolean;
  /** Whether resource is exported (output) */
  exported: boolean;
}

/**
 * Transient resource descriptor.
 * Describes a temporary resource that exists only during frame execution.
 */
interface TransientResource {
  /** Resource name */
  name: string;
  /** Texture format */
  format: TextureFormat;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Sample count */
  samples: number;
  /** Actual render target (allocated) */
  renderTarget: RenderTarget | null;
  /** Aliased resource name (shares memory with) */
  aliasOf: string | null;
  /** Lifetime information */
  lifetime: ResourceLifetime;
}

/**
 * Resource barrier for synchronization.
 * Represents a memory dependency between passes.
 */
interface ResourceBarrier {
  /** Source pass index */
  sourcePass: number;
  /** Destination pass index */
  destinationPass: number;
  /** Resource name */
  resourceName: string;
  /** Whether this is a write barrier */
  isWrite: boolean;
}

/**
 * Render graph statistics.
 */
export interface RenderGraphStats {
  /** Total number of passes */
  passCount: number;
  /** Number of executed passes */
  executedPassCount: number;
  /** Number of culled passes */
  culledPassCount: number;
  /** Total number of resources */
  resourceCount: number;
  /** Number of transient resources */
  transientResourceCount: number;
  /** Number of aliased resources */
  aliasedResourceCount: number;
  /** Peak memory usage (bytes) */
  peakMemoryUsage: number;
  /** Number of barriers */
  barrierCount: number;
}

/**
 * Render graph build options.
 */
export interface RenderGraphOptions {
  /** Enable resource aliasing for memory efficiency */
  enableAliasing?: boolean;
  /** Enable automatic pass culling */
  enableCulling?: boolean;
  /** Enable barrier generation */
  enableBarriers?: boolean;
  /** Default render target width */
  defaultWidth?: number;
  /** Default render target height */
  defaultHeight?: number;
  /** Enable debug validation */
  enableValidation?: boolean;
}

/**
 * Frame graph for automatic resource management.
 * Manages render passes, resources, and dependencies for efficient rendering.
 *
 * The render graph:
 * 1. Collects render passes and their resource requirements
 * 2. Analyzes dependencies and computes execution order
 * 3. Allocates transient resources with aliasing for memory efficiency
 * 4. Generates synchronization barriers
 * 5. Executes passes in dependency order
 * 6. Releases transient resources
 *
 * @example
 * ```typescript
 * const graph = new RenderGraph({
 *   enableAliasing: true,
 *   enableCulling: true,
 *   defaultWidth: 1920,
 *   defaultHeight: 1080,
 * });
 *
 * // Add passes
 * graph.addPass(geometryPass);
 * graph.addPass(lightingPass);
 * graph.addPass(postProcessPass);
 *
 * // Setup dependencies
 * geometryPass.addDependency({
 *   sourcePass: 'ShadowPass',
 *   destinationPass: 'GeometryPass',
 * });
 *
 * // Build and compile the graph
 * graph.build();
 * graph.compile();
 *
 * // Execute the graph
 * graph.execute();
 *
 * // Cleanup
 * graph.reset();
 * ```
 */
export class RenderGraph {
  /** Render passes */
  private _passes: RenderPass[] = [];

  /** Pass name to index mapping */
  private _passIndices: Map<string, number> = new Map();

  /** Execution order (pass indices) */
  private _executionOrder: number[] = [];

  /** Transient resources */
  private _transientResources: Map<string, TransientResource> = new Map();

  /** Imported resources (external) */
  private _importedResources: Map<string, RenderTarget> = new Map();

  /** Exported resources (outputs) */
  private _exportedResources: Set<string> = new Set();

  /** Resource barriers */
  private _barriers: ResourceBarrier[] = [];

  /** Render graph options */
  private _options: Required<RenderGraphOptions>;

  /** Whether the graph is built */
  private _built: boolean = false;

  /** Whether the graph is compiled */
  private _compiled: boolean = false;

  /** Statistics */
  private _stats: RenderGraphStats = {
    passCount: 0,
    executedPassCount: 0,
    culledPassCount: 0,
    resourceCount: 0,
    transientResourceCount: 0,
    aliasedResourceCount: 0,
    peakMemoryUsage: 0,
    barrierCount: 0,
  };

  /**
   * Creates a new render graph.
   *
   * @param options - Render graph options
   */
  constructor(options: RenderGraphOptions = {}) {
    this._options = {
      enableAliasing: options.enableAliasing ?? true,
      enableCulling: options.enableCulling ?? true,
      enableBarriers: options.enableBarriers ?? true,
      defaultWidth: options.defaultWidth ?? 1920,
      defaultHeight: options.defaultHeight ?? 1080,
      enableValidation: options.enableValidation ?? true,
    };

    logger.debug('Created render graph', this._options);
  }

  /**
   * Gets render graph statistics.
   */
  get stats(): Readonly<RenderGraphStats> {
    return this._stats;
  }

  /**
   * Gets whether the graph is built.
   */
  get isBuilt(): boolean {
    return this._built;
  }

  /**
   * Gets whether the graph is compiled.
   */
  get isCompiled(): boolean {
    return this._compiled;
  }

  /**
   * Adds a render pass to the graph.
   *
   * @param pass - Render pass to add
   *
   * @example
   * ```typescript
   * graph.addPass(geometryPass);
   * graph.addPass(lightingPass);
   * ```
   */
  addPass(pass: RenderPass): void {
    if (this._built) {
      logger.error('Cannot add pass after graph is built');
      return;
    }

    const index = this._passes.length;
    this._passes.push(pass);
    this._passIndices.set(pass.name, index);

    logger.debug(`Added pass: ${pass.name} (index ${index})`);
  }

  /**
   * Removes a render pass from the graph.
   *
   * @param passName - Name of the pass to remove
   */
  removePass(passName: string): void {
    if (this._built) {
      logger.error('Cannot remove pass after graph is built');
      return;
    }

    const index = this._passIndices.get(passName);
    if (index === undefined) {
      logger.warn(`Pass not found: ${passName}`);
      return;
    }

    this._passes.splice(index, 1);
    this._passIndices.delete(passName);

    // Rebuild indices
    this._passIndices.clear();
    for (let i = 0; i < this._passes.length; i++) {
      this._passIndices.set(this._passes[i].name, i);
    }

    logger.debug(`Removed pass: ${passName}`);
  }

  /**
   * Gets a pass by name.
   *
   * @param name - Pass name
   * @returns Render pass or null
   */
  getPass(name: string): RenderPass | null {
    const index = this._passIndices.get(name);
    return index !== undefined ? this._passes[index] : null;
  }

  /**
   * Imports an external resource.
   * Imported resources are provided from outside the graph.
   *
   * @param name - Resource name
   * @param renderTarget - Render target
   *
   * @example
   * ```typescript
   * graph.importResource('backbuffer', screenRenderTarget);
   * ```
   */
  importResource(name: string, renderTarget: RenderTarget): void {
    this._importedResources.set(name, renderTarget);
    logger.debug(`Imported resource: ${name}`);
  }

  /**
   * Marks a resource as exported.
   * Exported resources are outputs of the graph and won't be released.
   *
   * @param name - Resource name
   *
   * @example
   * ```typescript
   * graph.exportResource('finalColor');
   * ```
   */
  exportResource(name: string): void {
    this._exportedResources.add(name);
    logger.debug(`Exported resource: ${name}`);
  }

  /**
   * Builds the render graph.
   * Analyzes dependencies, computes execution order, and allocates resources.
   *
   * @example
   * ```typescript
   * graph.build();
   * ```
   */
  build(): void {
    if (this._built) {
      logger.warn('Graph already built, rebuilding...');
      this.reset();
    }

    logger.info('Building render graph...');

    // Validate passes
    if (this._options.enableValidation) {
      this.validatePasses();
    }

    // Compute execution order
    this.computeExecutionOrder();

    // Analyze resource lifetimes
    this.analyzeResourceLifetimes();

    // Cull unused passes
    if (this._options.enableCulling) {
      this.cullUnusedPasses();
    }

    // Generate barriers
    if (this._options.enableBarriers) {
      this.generateBarriers();
    }

    this._built = true;
    this.updateStats();

    logger.info('Render graph built successfully', {
      passes: this._stats.passCount,
      resources: this._stats.resourceCount,
    });
  }

  /**
   * Compiles the render graph.
   * Allocates physical resources and sets up pass execution.
   *
   * @example
   * ```typescript
   * graph.compile();
   * ```
   */
  compile(): void {
    if (!this._built) {
      logger.error('Cannot compile: graph not built');
      return;
    }

    if (this._compiled) {
      logger.warn('Graph already compiled, recompiling...');
      this.releaseResources();
    }

    logger.info('Compiling render graph...');

    // Allocate transient resources
    this.allocateTransientResources();

    // Apply resource aliasing
    if (this._options.enableAliasing) {
      this.applyResourceAliasing();
    }

    // Setup passes
    for (const pass of this._passes) {
      if (pass.enabled) {
        pass.setup();
      }
    }

    this._compiled = true;
    this.updateStats();

    logger.info('Render graph compiled successfully', {
      transient: this._stats.transientResourceCount,
      aliased: this._stats.aliasedResourceCount,
      peakMemory: this._stats.peakMemoryUsage,
    });
  }

  /**
   * Executes the render graph.
   * Runs all passes in dependency order.
   *
   * @example
   * ```typescript
   * const queue = RenderQueue.createOpaqueQueue();
   * // ... fill queue with draw calls
   * graph.execute();
   * ```
   */
  execute(): void {
    if (!this._compiled) {
      logger.error('Cannot execute: graph not compiled');
      return;
    }

    logger.trace('Executing render graph');

    this._stats.executedPassCount = 0;

    // Execute passes in order
    for (const passIndex of this._executionOrder) {
      const pass = this._passes[passIndex];

      if (!pass.enabled) {
        continue;
      }

      // Get or create render target for this pass
      const renderTarget = this.getRenderTargetForPass(pass);
      if (!renderTarget) {
        logger.error(`No render target for pass: ${pass.name}`);
        continue;
      }

      // Create a render queue for this pass (in real usage, queues would be filled by systems)
      const queue = RenderQueue.createOpaqueQueue();

      // Execute the pass
      pass.executeWithBeginEnd(queue, renderTarget);

      this._stats.executedPassCount++;
    }

    logger.trace(`Executed ${this._stats.executedPassCount} passes`);
  }

  /**
   * Resets the render graph.
   * Clears all passes and resources, allowing rebuild.
   */
  reset(): void {
    logger.debug('Resetting render graph');

    // Cleanup passes
    for (const pass of this._passes) {
      pass.cleanup();
    }

    // Release resources
    this.releaseResources();

    // Clear state
    this._passes = [];
    this._passIndices.clear();
    this._executionOrder = [];
    this._transientResources.clear();
    this._barriers = [];
    this._built = false;
    this._compiled = false;

    this.resetStats();
  }

  /**
   * Validates all passes.
   * Checks for errors in pass configuration.
   */
  private validatePasses(): void {
    for (const pass of this._passes) {
      if (!pass.validate()) {
        logger.error(`Pass validation failed: ${pass.name}`);
      }
    }
  }

  /**
   * Computes execution order using topological sort.
   * Resolves pass dependencies to determine render order.
   */
  private computeExecutionOrder(): void {
    const passCount = this._passes.length;
    const inDegree = new Array(passCount).fill(0);
    const adjList: number[][] = new Array(passCount).fill(null).map(() => []);

    // Build adjacency list from dependencies
    for (let i = 0; i < passCount; i++) {
      const pass = this._passes[i];
      const dependencies = pass.getDependencies();

      for (const dep of dependencies) {
        const sourceIndex = this._passIndices.get(dep.sourcePass);
        if (sourceIndex === undefined) {
          logger.warn(`Unknown dependency source: ${dep.sourcePass}`);
          continue;
        }

        adjList[sourceIndex].push(i);
        inDegree[i]++;
      }
    }

    // Kahn's algorithm for topological sort
    const queue: number[] = [];
    for (let i = 0; i < passCount; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    this._executionOrder = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      this._executionOrder.push(current);

      for (const neighbor of adjList[current]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (this._executionOrder.length !== passCount) {
      logger.error('Circular dependency detected in render graph');
      // Include all passes anyway for debugging
      for (let i = 0; i < passCount; i++) {
        if (!this._executionOrder.includes(i)) {
          this._executionOrder.push(i);
        }
      }
    }

    logger.debug('Execution order computed', {
      order: this._executionOrder.map(i => this._passes[i].name),
    });
  }

  /**
   * Analyzes resource lifetimes.
   * Determines when each resource is first and last used.
   */
  private analyzeResourceLifetimes(): void {
    const lifetimes = new Map<string, ResourceLifetime>();

    // Analyze each pass
    for (let i = 0; i < this._executionOrder.length; i++) {
      const passIndex = this._executionOrder[i];
      const pass = this._passes[passIndex];

      // Analyze color attachments
      for (const attachment of pass.colorAttachments) {
        this.updateLifetime(lifetimes, attachment.name, i);
      }

      // Analyze depth/stencil attachment
      if (pass.depthStencilAttachment) {
        this.updateLifetime(lifetimes, pass.depthStencilAttachment.name, i);
      }
    }

    // Create transient resources
    for (const [name, lifetime] of lifetimes) {
      if (!this._importedResources.has(name)) {
        // Find attachment info from first usage
        const firstPass = this._passes[this._executionOrder[lifetime.firstUse]];
        const attachment = this.findAttachment(firstPass, name);

        if (attachment) {
          const resource: TransientResource = {
            name,
            format: attachment.format,
            width: this._options.defaultWidth,
            height: this._options.defaultHeight,
            samples: attachment.samples ?? 1,
            renderTarget: null,
            aliasOf: null,
            lifetime,
          };

          this._transientResources.set(name, resource);
        }
      }
    }

    logger.debug(`Analyzed ${lifetimes.size} resource lifetimes`);
  }

  /**
   * Updates lifetime information for a resource.
   */
  private updateLifetime(
    lifetimes: Map<string, ResourceLifetime>,
    name: string,
    passIndex: number
  ): void {
    let lifetime = lifetimes.get(name);

    if (!lifetime) {
      lifetime = {
        name,
        firstUse: passIndex,
        lastUse: passIndex,
        imported: this._importedResources.has(name),
        exported: this._exportedResources.has(name),
      };
      lifetimes.set(name, lifetime);
    } else {
      lifetime.lastUse = Math.max(lifetime.lastUse, passIndex);
    }
  }

  /**
   * Finds an attachment by name in a pass.
   */
  private findAttachment(pass: RenderPass, name: string): AttachmentReference | null {
    for (const attachment of pass.colorAttachments) {
      if (attachment.name === name) {
        return attachment;
      }
    }

    if (pass.depthStencilAttachment?.name === name) {
      return pass.depthStencilAttachment;
    }

    return null;
  }

  /**
   * Culls unused passes.
   * Removes passes that don't contribute to exported resources.
   */
  private cullUnusedPasses(): void {
    // Simple implementation: mark all enabled passes as used
    // In a full implementation, would trace from exported resources backwards
    this._stats.culledPassCount = 0;

    for (const pass of this._passes) {
      if (!pass.enabled) {
        this._stats.culledPassCount++;
      }
    }

    logger.debug(`Culled ${this._stats.culledPassCount} passes`);
  }

  /**
   * Generates resource barriers for synchronization.
   */
  private generateBarriers(): void {
    this._barriers = [];

    // Generate barriers from dependencies
    for (let i = 0; i < this._executionOrder.length; i++) {
      const passIndex = this._executionOrder[i];
      const pass = this._passes[passIndex];
      const dependencies = pass.getDependencies();

      for (const dep of dependencies) {
        const sourceIndex = this._passIndices.get(dep.sourcePass);
        if (sourceIndex === undefined) continue;

        const barrier: ResourceBarrier = {
          sourcePass: sourceIndex,
          destinationPass: passIndex,
          resourceName: dep.sourceAttachment ?? '',
          isWrite: true,
        };

        this._barriers.push(barrier);
      }
    }

    this._stats.barrierCount = this._barriers.length;
    logger.debug(`Generated ${this._barriers.length} barriers`);
  }

  /**
   * Allocates transient resources.
   */
  private allocateTransientResources(): void {
    for (const [name, resource] of this._transientResources) {
      // Create render target
      const renderTarget = RenderTarget.createColorTarget(
        resource.width,
        resource.height,
        resource.format,
        resource.samples
      );

      resource.renderTarget = renderTarget;
      logger.debug(`Allocated transient resource: ${name}`);
    }
  }

  /**
   * Applies resource aliasing for memory efficiency.
   * Resources with non-overlapping lifetimes can share memory.
   */
  private applyResourceAliasing(): void {
    const resources = Array.from(this._transientResources.values());
    let aliasCount = 0;

    // Simple aliasing: find resources with non-overlapping lifetimes
    for (let i = 0; i < resources.length; i++) {
      const a = resources[i];

      if (a.aliasOf !== null) continue;

      for (let j = i + 1; j < resources.length; j++) {
        const b = resources[j];

        if (b.aliasOf !== null) continue;

        // Check if lifetimes don't overlap
        if (a.lifetime.lastUse < b.lifetime.firstUse ||
            b.lifetime.lastUse < a.lifetime.firstUse) {
          // Check if formats and dimensions match
          if (a.format === b.format &&
              a.width === b.width &&
              a.height === b.height &&
              a.samples === b.samples) {
            // Alias b to a
            b.aliasOf = a.name;
            b.renderTarget = a.renderTarget;
            aliasCount++;
            logger.debug(`Aliased ${b.name} to ${a.name}`);
          }
        }
      }
    }

    this._stats.aliasedResourceCount = aliasCount;
    logger.debug(`Applied ${aliasCount} resource aliases`);
  }

  /**
   * Gets render target for a pass.
   */
  private getRenderTargetForPass(pass: RenderPass): RenderTarget | null {
    // Check if pass uses imported resource
    if (pass.colorAttachments.length > 0) {
      const firstAttachment = pass.colorAttachments[0];
      const imported = this._importedResources.get(firstAttachment.name);
      if (imported) {
        return imported;
      }

      // Check transient resources
      const transient = this._transientResources.get(firstAttachment.name);
      if (transient) {
        return transient.renderTarget;
      }
    }

    return null;
  }

  /**
   * Releases all allocated resources.
   */
  private releaseResources(): void {
    for (const [name, resource] of this._transientResources) {
      if (resource.renderTarget && resource.aliasOf === null) {
        resource.renderTarget.dispose();
        logger.debug(`Released resource: ${name}`);
      }
      resource.renderTarget = null;
    }
  }

  /**
   * Updates statistics.
   */
  private updateStats(): void {
    this._stats.passCount = this._passes.length;
    this._stats.resourceCount = this._transientResources.size + this._importedResources.size;
    this._stats.transientResourceCount = this._transientResources.size;

    // Compute peak memory usage (simplified)
    let peakMemory = 0;
    const activeResources = new Set<string>();

    for (let i = 0; i < this._executionOrder.length; i++) {
      // Add resources that start at this pass
      for (const [name, resource] of this._transientResources) {
        if (resource.lifetime.firstUse === i) {
          activeResources.add(name);
        }
      }

      // Calculate memory at this point
      let currentMemory = 0;
      for (const name of activeResources) {
        const resource = this._transientResources.get(name);
        if (resource && resource.aliasOf === null) {
          // Rough estimate: 4 bytes per pixel
          currentMemory += resource.width * resource.height * 4 * resource.samples;
        }
      }
      peakMemory = Math.max(peakMemory, currentMemory);

      // Remove resources that end at this pass
      for (const [name, resource] of this._transientResources) {
        if (resource.lifetime.lastUse === i) {
          activeResources.delete(name);
        }
      }
    }

    this._stats.peakMemoryUsage = peakMemory;
  }

  /**
   * Resets statistics.
   */
  private resetStats(): void {
    this._stats = {
      passCount: 0,
      executedPassCount: 0,
      culledPassCount: 0,
      resourceCount: 0,
      transientResourceCount: 0,
      aliasedResourceCount: 0,
      peakMemoryUsage: 0,
      barrierCount: 0,
    };
  }

  /**
   * Logs render graph information.
   */
  logInfo(): void {
    logger.info('=== Render Graph Info ===');
    logger.info(`Passes: ${this._stats.passCount}`);
    logger.info(`Execution order: ${this._executionOrder.map(i => this._passes[i].name).join(' -> ')}`);
    logger.info(`Resources: ${this._stats.resourceCount} (${this._stats.transientResourceCount} transient)`);
    logger.info(`Aliased: ${this._stats.aliasedResourceCount}`);
    logger.info(`Peak memory: ${(this._stats.peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`Barriers: ${this._stats.barrierCount}`);
  }
}
