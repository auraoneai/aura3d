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
import { Color } from '../../math/Color';

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
   * @param scene - Scene to render (optional)
   * @param camera - Camera for rendering (optional)
   *
   * @example
   * ```typescript
   * graph.execute(scene, camera);
   * ```
   */
  execute(scene?: any, camera?: any): void {
    if (!this._compiled) {
      logger.error('Cannot execute: graph not compiled');
      return;
    }

    logger.trace('Executing render graph');

    this._stats.executedPassCount = 0;

    // Collect and cull renderable objects from scene
    const renderQueues = this.collectRenderables(scene, camera);

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

      // Select appropriate render queue for this pass
      const queue = this.selectRenderQueueForPass(pass, renderQueues);

      // Execute the pass
      pass.executeWithBeginEnd(queue, renderTarget);

      this._stats.executedPassCount++;
    }

    logger.trace(`Executed ${this._stats.executedPassCount} passes`);
  }

  /**
   * Collects renderable objects from scene and populates render queues.
   * Performs frustum culling and sorts objects for rendering.
   *
   * @param scene - Scene to collect from
   * @param camera - Camera for frustum culling
   * @returns Render queues (opaque, transparent, shadow casters)
   */
  private collectRenderables(scene?: any, camera?: any): {
    opaque: RenderQueue;
    transparent: RenderQueue;
    shadowCasters: RenderQueue;
  } {
    const queues = {
      opaque: RenderQueue.createOpaqueQueue(),
      transparent: RenderQueue.createTransparentQueue(),
      shadowCasters: RenderQueue.createOpaqueQueue(),
    };

    if (!scene || !camera) {
      return queues;
    }

    // Get camera frustum for culling
    const frustum = camera.frustum;

    // Traverse scene and collect renderable objects
    if (scene.traverse && typeof scene.traverse === 'function') {
      scene.traverse((node: any) => {
        // Skip non-visible nodes
        if (!node.visible && node.visible !== undefined) {
          return;
        }

        // Skip nodes without mesh
        if (!node.mesh) {
          return;
        }

        // Frustum culling
        if (frustum && node.worldBounds) {
          if (!frustum.intersectsBox(node.worldBounds)) {
            return;
          }
        }

        // Calculate depth from camera
        const depth = this.calculateDepthFromCamera(node, camera);

        // Determine material properties
        const material = node.material || {};
        const isTransparent = material.transparent || material.opacity < 1.0;
        const castsShadows = node.castsShadows !== false;

        // Create draw call (simplified - in real implementation would be more complex)
        const drawCall = this.createDrawCallForNode(node);
        if (!drawCall) {
          return;
        }

        // Create pipeline state (simplified)
        const pipelineState = this.createPipelineStateForMaterial(material);

        // Material ID for batching
        const materialId = material.id || 0;

        // Submit to appropriate queues
        if (isTransparent) {
          queues.transparent.submit(drawCall, pipelineState, null, materialId, depth);
        } else {
          queues.opaque.submit(drawCall, pipelineState, null, materialId, depth);
        }

        // Submit shadow casters
        if (castsShadows) {
          queues.shadowCasters.submit(drawCall, pipelineState, null, materialId, depth);
        }
      });
    }

    // Sort queues for optimal rendering
    queues.opaque.sort();
    queues.transparent.sort();
    queues.shadowCasters.sort();

    logger.trace(
      `Collected renderables: ${queues.opaque.length} opaque, ` +
      `${queues.transparent.length} transparent, ` +
      `${queues.shadowCasters.length} shadow casters`
    );

    return queues;
  }

  /**
   * Calculates depth from camera for a scene node.
   */
  private calculateDepthFromCamera(node: any, camera: any): number {
    const cameraPos = camera.transform?.worldPosition || camera.position || { x: 0, y: 0, z: 0 };
    const nodePos = node.transform?.worldPosition || node.position || { x: 0, y: 0, z: 0 };

    const dx = nodePos.x - cameraPos.x;
    const dy = nodePos.y - cameraPos.y;
    const dz = nodePos.z - cameraPos.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Creates a draw call for a scene node.
   * Returns null if node cannot be rendered.
   */
  private createDrawCallForNode(node: any): any {
    // In a real implementation, this would create a proper DrawCall object
    // For now, return a placeholder that passes validation
    return {
      isIndexed: () => true,
      indexCount: node.mesh?.indexCount || 0,
      vertexCount: node.mesh?.vertexCount || 0,
      instanceCount: 1,
    };
  }

  /**
   * Creates pipeline state for a material.
   */
  private createPipelineStateForMaterial(material: any): any {
    // In a real implementation, this would create proper PipelineState
    // For now, return a placeholder
    return {
      hash: material.id || 0,
    };
  }

  /**
   * Selects the appropriate render queue for a pass.
   */
  private selectRenderQueueForPass(pass: RenderPass, queues: {
    opaque: RenderQueue;
    transparent: RenderQueue;
    shadowCasters: RenderQueue;
  }): RenderQueue {
    // Determine queue based on pass name/type
    const passName = pass.name.toLowerCase();

    if (passName.includes('shadow')) {
      return queues.shadowCasters;
    } else if (passName.includes('transparent') || passName.includes('forward')) {
      // Forward pass typically handles transparents
      return queues.transparent;
    } else {
      return queues.opaque;
    }
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
   * Uses backwards dependency tracing from exported resources.
   */
  private cullUnusedPasses(): void {
    this._stats.culledPassCount = 0;

    // Mark all passes as potentially unused
    const used = new Set<number>();
    const visited = new Set<number>();

    // Start from exported resources and trace backwards
    for (const exportedResource of this._exportedResources) {
      // Find passes that write to exported resources
      for (let i = 0; i < this._passes.length; i++) {
        const pass = this._passes[i];

        // Check if this pass writes to the exported resource
        const writesToExported = pass.colorAttachments.some(att => att.name === exportedResource) ||
                                  pass.depthStencilAttachment?.name === exportedResource;

        if (writesToExported) {
          this.markPassAsUsed(i, used, visited);
        }
      }
    }

    // If no exported resources, mark all passes as used
    if (this._exportedResources.size === 0) {
      for (let i = 0; i < this._passes.length; i++) {
        used.add(i);
      }
    }

    // Disable passes that are not used
    for (let i = 0; i < this._passes.length; i++) {
      if (!used.has(i) && this._passes[i].enabled) {
        logger.debug(`Culling pass: ${this._passes[i].name} (no visible output)`);
        this._passes[i].enabled = false;
        this._stats.culledPassCount++;
      }
    }

    logger.debug(`Culled ${this._stats.culledPassCount} passes`);
  }

  /**
   * Recursively marks a pass and its dependencies as used.
   */
  private markPassAsUsed(passIndex: number, used: Set<number>, visited: Set<number>): void {
    // Avoid infinite recursion
    if (visited.has(passIndex)) {
      return;
    }
    visited.add(passIndex);

    // Mark this pass as used
    used.add(passIndex);

    const pass = this._passes[passIndex];
    const dependencies = pass.getDependencies();

    // Mark all dependencies as used
    for (const dep of dependencies) {
      const sourceIndex = this._passIndices.get(dep.sourcePass);
      if (sourceIndex !== undefined) {
        this.markPassAsUsed(sourceIndex, used, visited);
      }
    }
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
   * Creates actual WebGL textures/framebuffers for each transient resource.
   */
  private allocateTransientResources(): void {
    for (const [name, resource] of this._transientResources) {
      // Skip if already aliased to another resource
      if (resource.aliasOf !== null) {
        logger.debug(`Skipping allocation for ${name} (aliased to ${resource.aliasOf})`);
        continue;
      }

      // Determine if this is a depth/stencil format
      const isDepthFormat = this.isDepthStencilFormat(resource.format);

      // Create render target with appropriate attachments
      let renderTarget: RenderTarget;

      if (isDepthFormat) {
        // Create depth-only or depth-stencil target
        renderTarget = new RenderTarget({
          width: resource.width,
          height: resource.height,
          samples: resource.samples,
          colorAttachments: [],
          depthStencilAttachment: {
            format: resource.format,
            loadAction: LoadAction.Clear,
            storeAction: StoreAction.Store,
            clearValue: 1.0,
          },
          label: `Transient_${name}`,
        });
      } else {
        // Create color target
        renderTarget = new RenderTarget({
          width: resource.width,
          height: resource.height,
          samples: resource.samples,
          colorAttachments: [
            {
              format: resource.format,
              loadAction: LoadAction.Clear,
              storeAction: StoreAction.Store,
              clearValue: new Color(0, 0, 0, 1),
            },
          ],
          label: `Transient_${name}`,
        });
      }

      // Store the render target
      resource.renderTarget = renderTarget;

      logger.debug(
        `Allocated transient resource: ${name} ` +
        `(${resource.width}x${resource.height}, format=${resource.format}, ${resource.samples}x MSAA)`
      );
    }
  }

  /**
   * Checks if a texture format is a depth/stencil format.
   */
  private isDepthStencilFormat(format: TextureFormat): boolean {
    return format === TextureFormat.Depth16 ||
           format === TextureFormat.Depth24 ||
           format === TextureFormat.Depth32F ||
           format === TextureFormat.Depth24Stencil8 ||
           format === TextureFormat.Depth32FStencil8 ||
           format === TextureFormat.Stencil8;
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
   * Builds a complete FBO with all color attachments and depth/stencil.
   */
  private getRenderTargetForPass(pass: RenderPass): RenderTarget | null {
    // First, try to use an existing render target if the pass writes to a single resource
    if (pass.colorAttachments.length === 1 && !pass.depthStencilAttachment) {
      const attachment = pass.colorAttachments[0];

      // Check imported resources
      const imported = this._importedResources.get(attachment.name);
      if (imported) {
        return imported;
      }

      // Check transient resources
      const transient = this._transientResources.get(attachment.name);
      if (transient?.renderTarget) {
        return transient.renderTarget;
      }
    }

    // Build a new render target with all attachments
    return this.buildRenderTargetForPass(pass);
  }

  /**
   * Builds a complete render target for a pass with all attachments.
   * Creates FBO with color attachments and depth/stencil.
   */
  private buildRenderTargetForPass(pass: RenderPass): RenderTarget | null {
    if (pass.colorAttachments.length === 0 && !pass.depthStencilAttachment) {
      logger.error(`Pass ${pass.name} has no attachments`);
      return null;
    }

    // Collect attachment descriptors
    const colorDescriptors: any[] = [];
    const colorAttachments: any[] = [];

    // Build color attachments
    for (let i = 0; i < pass.colorAttachments.length; i++) {
      const attachmentRef = pass.colorAttachments[i];

      // Try to get existing resource
      let attachment = this.getAttachmentResource(attachmentRef.name);

      if (!attachment) {
        logger.warn(`Attachment ${attachmentRef.name} not found for pass ${pass.name}`);
        continue;
      }

      colorDescriptors.push({
        format: attachmentRef.format,
        samples: attachmentRef.samples ?? 1,
        loadAction: pass.getColorLoadAction(i),
        storeAction: pass.getColorStoreAction(i),
        clearValue: pass.clearValues.colors?.[i] || new Color(0, 0, 0, 1),
      });

      colorAttachments.push(attachment);
    }

    // Build depth/stencil attachment
    let depthStencilDescriptor: any = undefined;
    let depthStencilAttachment: any = null;

    if (pass.depthStencilAttachment) {
      depthStencilAttachment = this.getAttachmentResource(pass.depthStencilAttachment.name);

      if (depthStencilAttachment) {
        depthStencilDescriptor = {
          format: pass.depthStencilAttachment.format,
          samples: pass.depthStencilAttachment.samples ?? 1,
          loadAction: pass.depthLoadAction,
          storeAction: pass.depthStoreAction,
          clearValue: pass.clearValues.depth ?? 1.0,
        };
      }
    }

    // Determine dimensions from first available attachment
    let width = this._options.defaultWidth;
    let height = this._options.defaultHeight;
    let samples = 1;

    if (colorAttachments.length > 0) {
      width = colorAttachments[0].width || width;
      height = colorAttachments[0].height || height;
      samples = colorAttachments[0].samples || samples;
    } else if (depthStencilAttachment) {
      width = depthStencilAttachment.width || width;
      height = depthStencilAttachment.height || height;
      samples = depthStencilAttachment.samples || samples;
    }

    // Create render target descriptor
    const descriptor = {
      width,
      height,
      samples,
      colorAttachments: colorDescriptors,
      depthStencilAttachment: depthStencilDescriptor,
      label: `Pass_${pass.name}`,
    };

    // Create render target
    const renderTarget = new RenderTarget(descriptor);

    // Set actual attachment textures
    for (let i = 0; i < colorAttachments.length; i++) {
      renderTarget.setColorAttachment(i, colorAttachments[i]);
    }

    if (depthStencilAttachment) {
      renderTarget.setDepthStencilAttachment(depthStencilAttachment);
    }

    // Validate framebuffer completeness
    if (!this.validateFramebuffer(renderTarget)) {
      logger.error(`Framebuffer validation failed for pass ${pass.name}`);
      return null;
    }

    return renderTarget;
  }

  /**
   * Gets an attachment resource by name.
   * Checks imported and transient resources.
   */
  private getAttachmentResource(name: string): any {
    // Check imported resources first
    const imported = this._importedResources.get(name);
    if (imported) {
      return imported.getColorAttachment(0) || imported.getDepthStencilAttachment();
    }

    // Check transient resources
    const transient = this._transientResources.get(name);
    if (transient?.renderTarget) {
      return transient.renderTarget.getColorAttachment(0) ||
             transient.renderTarget.getDepthStencilAttachment();
    }

    return null;
  }

  /**
   * Validates framebuffer completeness.
   * Checks that all attachments are compatible.
   */
  private validateFramebuffer(renderTarget: RenderTarget): boolean {
    // Basic validation: check that dimensions match
    const width = renderTarget.width;
    const height = renderTarget.height;
    const samples = renderTarget.samples;

    // Validate all color attachments have same dimensions
    for (let i = 0; i < renderTarget.colorAttachmentCount; i++) {
      const attachment = renderTarget.getColorAttachment(i);
      if (attachment) {
        if (attachment.width !== width || attachment.height !== height || attachment.samples !== samples) {
          logger.error(
            `Color attachment ${i} dimension mismatch: ` +
            `expected ${width}x${height} ${samples}x, got ${attachment.width}x${attachment.height} ${attachment.samples}x`
          );
          return false;
        }
      }
    }

    // Validate depth/stencil attachment
    const depthStencil = renderTarget.getDepthStencilAttachment();
    if (depthStencil) {
      if (depthStencil.width !== width || depthStencil.height !== height || depthStencil.samples !== samples) {
        logger.error(
          `Depth/stencil attachment dimension mismatch: ` +
          `expected ${width}x${height} ${samples}x, got ${depthStencil.width}x${depthStencil.height} ${depthStencil.samples}x`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Releases all allocated resources.
   * @param gl - Optional WebGL context for proper resource disposal
   */
  private releaseResources(gl?: WebGL2RenderingContext): void {
    for (const [name, resource] of this._transientResources) {
      if (resource.renderTarget && resource.aliasOf === null) {
        if (gl) {
          resource.renderTarget.dispose(gl);
        }
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
