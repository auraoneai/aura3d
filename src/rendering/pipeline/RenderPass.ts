/**
 * Abstract render pass base class for G3D rendering engine.
 * Defines input/output attachments, clear operations, load/store actions,
 * and pass dependencies for building render graphs.
 *
 * @module RenderPass
 */

import { RenderTarget, LoadAction, StoreAction, TextureFormat } from './RenderTarget';
import { RenderQueue } from './RenderQueue';
import { Rect } from '../../math/Rect';
import { Color } from '../../math/Color';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RenderPass');

/**
 * Render pass attachment reference.
 * References an attachment by name for pass dependencies.
 */
export interface AttachmentReference {
  /** Attachment name */
  name: string;
  /** Texture format */
  format: TextureFormat;
  /** Sample count */
  samples?: number;
}

/**
 * Render pass clear values.
 * Defines clear colors and depth/stencil values.
 */
export interface ClearValues {
  /** Clear colors for each color attachment */
  colors?: Color[];
  /** Clear depth value (0.0 to 1.0) */
  depth?: number;
  /** Clear stencil value (0-255) */
  stencil?: number;
}

/**
 * Render pass dependency descriptor.
 * Defines execution order and memory dependencies between passes.
 */
export interface PassDependency {
  /** Source pass name */
  sourcePass: string;
  /** Destination pass name */
  destinationPass: string;
  /** Source attachment name */
  sourceAttachment?: string;
  /** Destination attachment name */
  destinationAttachment?: string;
}

/**
 * Render pass descriptor.
 * Defines pass configuration including attachments, clear values, and viewport.
 *
 * @example
 * ```typescript
 * const passDesc: RenderPassDescriptor = {
 *   name: 'GBufferPass',
 *   colorAttachments: [
 *     { name: 'albedo', format: TextureFormat.RGBA8 },
 *     { name: 'normal', format: TextureFormat.RGBA16F },
 *     { name: 'material', format: TextureFormat.RGBA8 },
 *   ],
 *   depthStencilAttachment: {
 *     name: 'depth',
 *     format: TextureFormat.Depth24Stencil8,
 *   },
 *   clearValues: {
 *     colors: [Color.black(), Color.black(), Color.black()],
 *     depth: 1.0,
 *     stencil: 0,
 *   },
 *   viewport: new Rect(0, 0, 1920, 1080),
 * };
 * ```
 */
export interface RenderPassDescriptor {
  /** Pass name (unique identifier) */
  name: string;
  /** Color attachment references */
  colorAttachments: AttachmentReference[];
  /** Depth/stencil attachment reference */
  depthStencilAttachment?: AttachmentReference;
  /** Clear values for attachments */
  clearValues?: ClearValues;
  /** Viewport rectangle (optional) */
  viewport?: Rect;
  /** Scissor rectangle (optional) */
  scissor?: Rect;
  /** Load action for color attachments */
  colorLoadActions?: LoadAction[];
  /** Store action for color attachments */
  colorStoreActions?: StoreAction[];
  /** Load action for depth attachment */
  depthLoadAction?: LoadAction;
  /** Store action for depth attachment */
  depthStoreAction?: StoreAction;
  /** Load action for stencil attachment */
  stencilLoadAction?: LoadAction;
  /** Store action for stencil attachment */
  stencilStoreAction?: StoreAction;
}

/**
 * Abstract base class for render passes.
 * Render passes represent a single rendering operation that produces output attachments.
 *
 * Subclasses must implement:
 * - execute(): Perform the actual rendering
 * - setup(): Initialize pass-specific resources
 * - cleanup(): Release pass-specific resources
 *
 * @example
 * ```typescript
 * class GeometryPass extends RenderPass {
 *   constructor() {
 *     super({
 *       name: 'GeometryPass',
 *       colorAttachments: [
 *         { name: 'color', format: TextureFormat.RGBA8 },
 *       ],
 *       depthStencilAttachment: {
 *         name: 'depth',
 *         format: TextureFormat.Depth24,
 *       },
 *       clearValues: {
 *         colors: [Color.black()],
 *         depth: 1.0,
 *       },
 *     });
 *   }
 *
 *   setup(): void {
 *     // Initialize resources
 *   }
 *
 *   execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
 *     // Render geometry
 *   }
 *
 *   cleanup(): void {
 *     // Release resources
 *   }
 * }
 * ```
 */
export abstract class RenderPass {
  /** Pass name (unique identifier) */
  readonly name: string;

  /** Color attachment references */
  readonly colorAttachments: readonly AttachmentReference[];

  /** Depth/stencil attachment reference */
  readonly depthStencilAttachment: AttachmentReference | null;

  /** Clear values */
  protected _clearValues: ClearValues;

  /** Viewport rectangle */
  protected _viewport: Rect | null;

  /** Scissor rectangle */
  protected _scissor: Rect | null;

  /** Load actions for color attachments */
  protected _colorLoadActions: LoadAction[];

  /** Store actions for color attachments */
  protected _colorStoreActions: StoreAction[];

  /** Load action for depth */
  protected _depthLoadAction: LoadAction;

  /** Store action for depth */
  protected _depthStoreAction: StoreAction;

  /** Load action for stencil */
  protected _stencilLoadAction: LoadAction;

  /** Store action for stencil */
  protected _stencilStoreAction: StoreAction;

  /** Whether the pass is enabled */
  protected _enabled: boolean = true;

  /** Pass dependencies */
  protected _dependencies: PassDependency[] = [];

  /**
   * Creates a new render pass.
   *
   * @param descriptor - Render pass descriptor
   */
  constructor(descriptor: RenderPassDescriptor) {
    this.name = descriptor.name;
    this.colorAttachments = [...descriptor.colorAttachments];
    this.depthStencilAttachment = descriptor.depthStencilAttachment ?? null;
    this._clearValues = descriptor.clearValues ?? {};
    this._viewport = descriptor.viewport ?? null;
    this._scissor = descriptor.scissor ?? null;

    // Initialize load/store actions
    this._colorLoadActions = descriptor.colorLoadActions ??
      new Array(this.colorAttachments.length).fill(LoadAction.Clear);
    this._colorStoreActions = descriptor.colorStoreActions ??
      new Array(this.colorAttachments.length).fill(StoreAction.Store);
    this._depthLoadAction = descriptor.depthLoadAction ?? LoadAction.Clear;
    this._depthStoreAction = descriptor.depthStoreAction ?? StoreAction.DontCare;
    this._stencilLoadAction = descriptor.stencilLoadAction ?? LoadAction.DontCare;
    this._stencilStoreAction = descriptor.stencilStoreAction ?? StoreAction.DontCare;

    logger.debug(`Created render pass: ${this.name}`);
  }

  /**
   * Gets whether the pass is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Sets whether the pass is enabled.
   */
  set enabled(value: boolean) {
    this._enabled = value;
  }

  /**
   * Gets the viewport rectangle.
   */
  get viewport(): Rect | null {
    return this._viewport;
  }

  /**
   * Sets the viewport rectangle.
   */
  set viewport(value: Rect | null) {
    this._viewport = value;
  }

  /**
   * Gets the scissor rectangle.
   */
  get scissor(): Rect | null {
    return this._scissor;
  }

  /**
   * Sets the scissor rectangle.
   */
  set scissor(value: Rect | null) {
    this._scissor = value;
  }

  /**
   * Gets clear values.
   */
  get clearValues(): Readonly<ClearValues> {
    return this._clearValues;
  }

  /**
   * Sets clear color for a specific attachment.
   *
   * @param index - Attachment index
   * @param color - Clear color
   */
  setClearColor(index: number, color: Color): void {
    if (!this._clearValues.colors) {
      this._clearValues.colors = [];
    }
    this._clearValues.colors[index] = color;
  }

  /**
   * Sets clear depth value.
   *
   * @param depth - Clear depth (0.0 to 1.0)
   */
  setClearDepth(depth: number): void {
    this._clearValues.depth = depth;
  }

  /**
   * Sets clear stencil value.
   *
   * @param stencil - Clear stencil (0-255)
   */
  setClearStencil(stencil: number): void {
    this._clearValues.stencil = stencil;
  }

  /**
   * Gets load action for a color attachment.
   *
   * @param index - Attachment index
   * @returns Load action
   */
  getColorLoadAction(index: number): LoadAction {
    return this._colorLoadActions[index] ?? LoadAction.Clear;
  }

  /**
   * Sets load action for a color attachment.
   *
   * @param index - Attachment index
   * @param action - Load action
   */
  setColorLoadAction(index: number, action: LoadAction): void {
    this._colorLoadActions[index] = action;
  }

  /**
   * Gets store action for a color attachment.
   *
   * @param index - Attachment index
   * @returns Store action
   */
  getColorStoreAction(index: number): StoreAction {
    return this._colorStoreActions[index] ?? StoreAction.Store;
  }

  /**
   * Sets store action for a color attachment.
   *
   * @param index - Attachment index
   * @param action - Store action
   */
  setColorStoreAction(index: number, action: StoreAction): void {
    this._colorStoreActions[index] = action;
  }

  /**
   * Gets depth load action.
   */
  get depthLoadAction(): LoadAction {
    return this._depthLoadAction;
  }

  /**
   * Sets depth load action.
   */
  set depthLoadAction(value: LoadAction) {
    this._depthLoadAction = value;
  }

  /**
   * Gets depth store action.
   */
  get depthStoreAction(): StoreAction {
    return this._depthStoreAction;
  }

  /**
   * Sets depth store action.
   */
  set depthStoreAction(value: StoreAction) {
    this._depthStoreAction = value;
  }

  /**
   * Gets stencil load action.
   */
  get stencilLoadAction(): LoadAction {
    return this._stencilLoadAction;
  }

  /**
   * Sets stencil load action.
   */
  set stencilLoadAction(value: LoadAction) {
    this._stencilLoadAction = value;
  }

  /**
   * Gets stencil store action.
   */
  get stencilStoreAction(): StoreAction {
    return this._stencilStoreAction;
  }

  /**
   * Sets stencil store action.
   */
  set stencilStoreAction(value: StoreAction) {
    this._stencilStoreAction = value;
  }

  /**
   * Adds a dependency on another pass.
   *
   * @param dependency - Pass dependency descriptor
   */
  addDependency(dependency: PassDependency): void {
    this._dependencies.push(dependency);
  }

  /**
   * Gets all pass dependencies.
   */
  getDependencies(): readonly PassDependency[] {
    return this._dependencies;
  }

  /**
   * Checks if this pass depends on another pass.
   *
   * @param passName - Name of the other pass
   * @returns True if dependent
   */
  dependsOn(passName: string): boolean {
    return this._dependencies.some(dep => dep.sourcePass === passName);
  }

  /**
   * Sets up the render pass.
   * Called once during initialization or when pass is added to the pipeline.
   * Override to initialize pass-specific resources (shaders, buffers, etc.).
   */
  abstract setup(): void;

  /**
   * Executes the render pass.
   * Called every frame to perform the actual rendering.
   *
   * @param renderQueue - Queue containing draw calls to render
   * @param renderTarget - Target to render to
   */
  abstract execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void;

  /**
   * Cleans up the render pass.
   * Called when pass is removed from the pipeline or engine shuts down.
   * Override to release pass-specific resources.
   */
  abstract cleanup(): void;

  /**
   * Called before executing the pass.
   * Override to perform pre-execution logic (state setup, clear, etc.).
   *
   * @param renderTarget - Target to render to
   */
  protected beginPass(renderTarget: RenderTarget): void {
    // Default implementation - can be overridden
    logger.trace(`Beginning render pass: ${this.name}`);
  }

  /**
   * Called after executing the pass.
   * Override to perform post-execution logic (resolve, statistics, etc.).
   *
   * @param renderTarget - Target that was rendered to
   */
  protected endPass(renderTarget: RenderTarget): void {
    // Default implementation - can be overridden
    logger.trace(`Ending render pass: ${this.name}`);
  }

  /**
   * Executes the pass with begin/end wrapping.
   * Calls beginPass, execute, and endPass in sequence.
   *
   * @param renderQueue - Queue containing draw calls
   * @param renderTarget - Target to render to
   */
  executeWithBeginEnd(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this._enabled) {
      return;
    }

    this.beginPass(renderTarget);
    this.execute(renderQueue, renderTarget);
    this.endPass(renderTarget);
  }

  /**
   * Validates the render pass configuration.
   * Checks for common errors in pass setup.
   *
   * @returns True if valid
   */
  validate(): boolean {
    // Check color attachments
    if (this.colorAttachments.length === 0 && !this.depthStencilAttachment) {
      logger.error(`Render pass ${this.name} has no attachments`);
      return false;
    }

    // Check clear values match attachment count
    const clearColorCount = this._clearValues.colors?.length ?? 0;
    if (clearColorCount > 0 && clearColorCount !== this.colorAttachments.length) {
      logger.warn(
        `Render pass ${this.name} clear color count (${clearColorCount}) ` +
        `doesn't match attachment count (${this.colorAttachments.length})`
      );
    }

    // Check load/store action counts
    if (this._colorLoadActions.length !== this.colorAttachments.length) {
      logger.warn(
        `Render pass ${this.name} load action count doesn't match attachment count`
      );
    }

    if (this._colorStoreActions.length !== this.colorAttachments.length) {
      logger.warn(
        `Render pass ${this.name} store action count doesn't match attachment count`
      );
    }

    return true;
  }

  /**
   * Gets a descriptor that can recreate this pass.
   *
   * @returns Render pass descriptor
   */
  getDescriptor(): RenderPassDescriptor {
    return {
      name: this.name,
      colorAttachments: [...this.colorAttachments],
      depthStencilAttachment: this.depthStencilAttachment ?? undefined,
      clearValues: { ...this._clearValues },
      viewport: this._viewport ?? undefined,
      scissor: this._scissor ?? undefined,
      colorLoadActions: [...this._colorLoadActions],
      colorStoreActions: [...this._colorStoreActions],
      depthLoadAction: this._depthLoadAction,
      depthStoreAction: this._depthStoreAction,
      stencilLoadAction: this._stencilLoadAction,
      stencilStoreAction: this._stencilStoreAction,
    };
  }
}
