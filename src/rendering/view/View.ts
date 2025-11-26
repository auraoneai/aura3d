/**
 * View definition for rendering with viewport, scissor, clear values, and layer masking.
 * @module View
 */

import { Camera } from '../camera/Camera';
import { Color } from '../../math/Color';

/**
 * Viewport rectangle definition.
 */
export interface Viewport {
  /**
   * X position in pixels.
   */
  x: number;

  /**
   * Y position in pixels.
   */
  y: number;

  /**
   * Width in pixels.
   */
  width: number;

  /**
   * Height in pixels.
   */
  height: number;
}

/**
 * Scissor rectangle definition.
 */
export interface ScissorRect {
  /**
   * X position in pixels.
   */
  x: number;

  /**
   * Y position in pixels.
   */
  y: number;

  /**
   * Width in pixels.
   */
  width: number;

  /**
   * Height in pixels.
   */
  height: number;

  /**
   * Whether scissor test is enabled.
   */
  enabled: boolean;
}

/**
 * Clear values for color, depth, and stencil buffers.
 */
export interface ClearValues {
  /**
   * Color to clear to.
   */
  color: Color;

  /**
   * Depth value to clear to (typically 1.0 for reverse-Z, 0.0 otherwise).
   */
  depth: number;

  /**
   * Stencil value to clear to.
   */
  stencil: number;

  /**
   * Whether to clear color buffer.
   */
  clearColor: boolean;

  /**
   * Whether to clear depth buffer.
   */
  clearDepth: boolean;

  /**
   * Whether to clear stencil buffer.
   */
  clearStencil: boolean;
}

/**
 * View class representing a rendering view with camera, viewport, and rendering settings.
 * Controls what and how content is rendered to the framebuffer.
 *
 * @example
 * ```typescript
 * const camera = new Camera();
 * const view = new View(camera);
 *
 * // Set viewport
 * view.setViewport(0, 0, 1920, 1080);
 *
 * // Set clear values
 * view.clearValues.color = new Color(0.2, 0.3, 0.4, 1);
 * view.clearValues.clearColor = true;
 * view.clearValues.clearDepth = true;
 *
 * // Set layer mask (render only layers 0, 1, 2)
 * view.setLayerMask([0, 1, 2]);
 *
 * // Enable scissor test
 * view.setScissor(100, 100, 800, 600, true);
 *
 * // In renderer
 * renderer.renderView(view, scene);
 * ```
 */
export class View {
  /**
   * Camera used for rendering this view.
   */
  camera: Camera;

  /**
   * Viewport rectangle in pixels.
   */
  readonly viewport: Viewport;

  /**
   * Scissor rectangle for clipping.
   */
  readonly scissor: ScissorRect;

  /**
   * Clear values for buffers.
   */
  readonly clearValues: ClearValues;

  /**
   * Layer mask for selective rendering (bitfield).
   * Bit N set = render layer N.
   */
  private _layerMask: number = 0xFFFFFFFF; // All layers enabled by default

  /**
   * Render order (lower numbers render first).
   */
  order: number = 0;

  /**
   * Whether this view is enabled.
   */
  enabled: boolean = true;

  /**
   * Optional name for debugging.
   */
  name: string = 'View';

  /**
   * Reference to post-process stack (application-defined).
   */
  postProcessStack: any = null;

  /**
   * Custom user data.
   */
  userData: Record<string, any> = {};

  /**
   * Creates a new View instance.
   *
   * @param camera - Camera for this view
   * @param name - Optional name for debugging
   *
   * @example
   * ```typescript
   * const camera = new Camera();
   * const view = new View(camera, 'MainView');
   * ```
   */
  constructor(camera: Camera, name: string = 'View') {
    this.camera = camera;
    this.name = name;

    this.viewport = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    this.scissor = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      enabled: false,
    };

    this.clearValues = {
      color: new Color(0, 0, 0, 1),
      depth: 1.0, // For reverse-Z
      stencil: 0,
      clearColor: true,
      clearDepth: true,
      clearStencil: false,
    };
  }

  /**
   * Sets the viewport rectangle.
   *
   * @param x - X position in pixels
   * @param y - Y position in pixels
   * @param width - Width in pixels
   * @param height - Height in pixels
   *
   * @example
   * ```typescript
   * view.setViewport(0, 0, 1920, 1080);
   * ```
   */
  setViewport(x: number, y: number, width: number, height: number): void {
    this.viewport.x = x;
    this.viewport.y = y;
    this.viewport.width = width;
    this.viewport.height = height;

    // Update camera aspect ratio
    const aspect = width / height;
    this.camera.setAspect(aspect);
  }

  /**
   * Sets the viewport from normalized coordinates (0-1).
   *
   * @param x - Normalized x position
   * @param y - Normalized y position
   * @param width - Normalized width
   * @param height - Normalized height
   * @param screenWidth - Screen width in pixels
   * @param screenHeight - Screen height in pixels
   *
   * @example
   * ```typescript
   * // Left half of screen
   * view.setViewportNormalized(0, 0, 0.5, 1, 1920, 1080);
   * ```
   */
  setViewportNormalized(
    x: number,
    y: number,
    width: number,
    height: number,
    screenWidth: number,
    screenHeight: number
  ): void {
    this.setViewport(
      Math.floor(x * screenWidth),
      Math.floor(y * screenHeight),
      Math.floor(width * screenWidth),
      Math.floor(height * screenHeight)
    );
  }

  /**
   * Sets the scissor rectangle.
   *
   * @param x - X position in pixels
   * @param y - Y position in pixels
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param enabled - Whether scissor test is enabled
   *
   * @example
   * ```typescript
   * view.setScissor(100, 100, 800, 600, true);
   * ```
   */
  setScissor(
    x: number,
    y: number,
    width: number,
    height: number,
    enabled: boolean = true
  ): void {
    this.scissor.x = x;
    this.scissor.y = y;
    this.scissor.width = width;
    this.scissor.height = height;
    this.scissor.enabled = enabled;
  }

  /**
   * Disables scissor test.
   *
   * @example
   * ```typescript
   * view.disableScissor();
   * ```
   */
  disableScissor(): void {
    this.scissor.enabled = false;
  }

  /**
   * Sets the clear color.
   *
   * @param color - Color to clear to
   *
   * @example
   * ```typescript
   * view.setClearColor(new Color(0.2, 0.3, 0.4, 1));
   * ```
   */
  setClearColor(color: Color): void {
    this.clearValues.color = color;
  }

  /**
   * Sets the clear depth value.
   *
   * @param depth - Depth value (typically 1.0 for reverse-Z)
   *
   * @example
   * ```typescript
   * view.setClearDepth(1.0);
   * ```
   */
  setClearDepth(depth: number): void {
    this.clearValues.depth = depth;
  }

  /**
   * Sets the clear stencil value.
   *
   * @param stencil - Stencil value
   *
   * @example
   * ```typescript
   * view.setClearStencil(0);
   * ```
   */
  setClearStencil(stencil: number): void {
    this.clearValues.stencil = stencil;
  }

  /**
   * Sets which buffers to clear.
   *
   * @param color - Clear color buffer
   * @param depth - Clear depth buffer
   * @param stencil - Clear stencil buffer
   *
   * @example
   * ```typescript
   * view.setClearFlags(true, true, false);
   * ```
   */
  setClearFlags(color: boolean, depth: boolean, stencil: boolean): void {
    this.clearValues.clearColor = color;
    this.clearValues.clearDepth = depth;
    this.clearValues.clearStencil = stencil;
  }

  /**
   * Gets the layer mask.
   * @returns Layer mask bitfield
   */
  get layerMask(): number {
    return this._layerMask;
  }

  /**
   * Sets the layer mask.
   * @param mask - Layer mask bitfield
   */
  set layerMask(mask: number) {
    this._layerMask = mask >>> 0; // Ensure unsigned 32-bit integer
  }

  /**
   * Sets layer mask from array of layer indices.
   *
   * @param layers - Array of layer indices (0-31)
   *
   * @example
   * ```typescript
   * view.setLayerMask([0, 1, 2]); // Only render layers 0, 1, 2
   * ```
   */
  setLayerMask(layers: number[]): void {
    this._layerMask = 0;
    for (const layer of layers) {
      if (layer >= 0 && layer < 32) {
        this._layerMask |= (1 << layer);
      }
    }
  }

  /**
   * Enables rendering of a specific layer.
   *
   * @param layer - Layer index (0-31)
   *
   * @example
   * ```typescript
   * view.enableLayer(5);
   * ```
   */
  enableLayer(layer: number): void {
    if (layer >= 0 && layer < 32) {
      this._layerMask |= (1 << layer);
    }
  }

  /**
   * Disables rendering of a specific layer.
   *
   * @param layer - Layer index (0-31)
   *
   * @example
   * ```typescript
   * view.disableLayer(5);
   * ```
   */
  disableLayer(layer: number): void {
    if (layer >= 0 && layer < 32) {
      this._layerMask &= ~(1 << layer);
    }
  }

  /**
   * Checks if a layer is enabled.
   *
   * @param layer - Layer index (0-31)
   * @returns True if layer is enabled
   *
   * @example
   * ```typescript
   * if (view.isLayerEnabled(5)) {
   *   console.log('Layer 5 is visible');
   * }
   * ```
   */
  isLayerEnabled(layer: number): boolean {
    if (layer < 0 || layer >= 32) return false;
    return (this._layerMask & (1 << layer)) !== 0;
  }

  /**
   * Enables all layers.
   *
   * @example
   * ```typescript
   * view.enableAllLayers();
   * ```
   */
  enableAllLayers(): void {
    this._layerMask = 0xFFFFFFFF;
  }

  /**
   * Disables all layers.
   *
   * @example
   * ```typescript
   * view.disableAllLayers();
   * ```
   */
  disableAllLayers(): void {
    this._layerMask = 0;
  }

  /**
   * Gets the aspect ratio of the viewport.
   * @returns Aspect ratio (width / height)
   *
   * @example
   * ```typescript
   * const aspect = view.getAspectRatio();
   * ```
   */
  getAspectRatio(): number {
    return this.viewport.height > 0 ? this.viewport.width / this.viewport.height : 1;
  }

  /**
   * Checks if a world-space point is visible in this view.
   *
   * @param point - Point in world space
   * @returns True if point is visible
   *
   * @example
   * ```typescript
   * const point = new Vector3(0, 0, -5);
   * if (view.isPointVisible(point)) {
   *   console.log('Point is visible');
   * }
   * ```
   */
  isPointVisible(point: import('../../math/Vector3').Vector3): boolean {
    return this.camera.frustum.containsPoint(point);
  }

  /**
   * Converts normalized screen coordinates to viewport pixel coordinates.
   *
   * @param normalizedX - Normalized x (0-1)
   * @param normalizedY - Normalized y (0-1)
   * @returns Pixel coordinates
   *
   * @example
   * ```typescript
   * const pixel = view.normalizedToPixel(0.5, 0.5);
   * console.log(`Center pixel: (${pixel.x}, ${pixel.y})`);
   * ```
   */
  normalizedToPixel(normalizedX: number, normalizedY: number): { x: number; y: number } {
    return {
      x: this.viewport.x + normalizedX * this.viewport.width,
      y: this.viewport.y + normalizedY * this.viewport.height,
    };
  }

  /**
   * Converts viewport pixel coordinates to normalized coordinates.
   *
   * @param pixelX - Pixel x coordinate
   * @param pixelY - Pixel y coordinate
   * @returns Normalized coordinates (0-1)
   *
   * @example
   * ```typescript
   * const normalized = view.pixelToNormalized(960, 540);
   * console.log(`Normalized: (${normalized.x}, ${normalized.y})`);
   * ```
   */
  pixelToNormalized(pixelX: number, pixelY: number): { x: number; y: number } {
    return {
      x: (pixelX - this.viewport.x) / this.viewport.width,
      y: (pixelY - this.viewport.y) / this.viewport.height,
    };
  }

  /**
   * Creates a copy of this view.
   * @returns New view with same settings
   *
   * @example
   * ```typescript
   * const view2 = view.clone();
   * ```
   */
  clone(): View {
    const view = new View(this.camera.clone(), this.name);

    view.viewport.x = this.viewport.x;
    view.viewport.y = this.viewport.y;
    view.viewport.width = this.viewport.width;
    view.viewport.height = this.viewport.height;

    view.scissor.x = this.scissor.x;
    view.scissor.y = this.scissor.y;
    view.scissor.width = this.scissor.width;
    view.scissor.height = this.scissor.height;
    view.scissor.enabled = this.scissor.enabled;

    view.clearValues.color = this.clearValues.color.clone();
    view.clearValues.depth = this.clearValues.depth;
    view.clearValues.stencil = this.clearValues.stencil;
    view.clearValues.clearColor = this.clearValues.clearColor;
    view.clearValues.clearDepth = this.clearValues.clearDepth;
    view.clearValues.clearStencil = this.clearValues.clearStencil;

    view._layerMask = this._layerMask;
    view.order = this.order;
    view.enabled = this.enabled;
    view.postProcessStack = this.postProcessStack;
    view.userData = { ...this.userData };

    return view;
  }
}
