/**
 * @module Rendering/Debug
 * @description
 * Immediate-mode debug visualization for G3D 5.0 engine.
 * Provides utilities for drawing lines, boxes, spheres, and text.
 */

import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Color } from '../math/Color';
import { Box3 } from '../math/Box3';
import { Frustum } from '../math/Frustum';
import { RenderContext } from './RenderContext';

const logger = Logger.create('DebugDraw');

/**
 * Debug draw mode.
 */
export enum DebugDrawMode {
  /** Always render, regardless of depth */
  AlwaysOnTop = 0,
  /** Depth tested */
  DepthTested = 1,
}

/**
 * Debug line descriptor.
 */
interface DebugLine {
  start: Vector3;
  end: Vector3;
  color: Color;
  mode: DebugDrawMode;
  expiryTime: number; // -1 for single frame
}

/**
 * Debug box descriptor.
 */
interface DebugBox {
  min: Vector3;
  max: Vector3;
  color: Color;
  wireframe: boolean;
  mode: DebugDrawMode;
  expiryTime: number;
}

/**
 * Debug sphere descriptor.
 */
interface DebugSphere {
  center: Vector3;
  radius: number;
  color: Color;
  segments: number;
  mode: DebugDrawMode;
  expiryTime: number;
}

/**
 * Debug text descriptor.
 */
interface DebugText {
  position: Vector3;
  text: string;
  color: Color;
  size: number;
  expiryTime: number;
}

/**
 * Immediate-mode debug drawing utilities.
 * Provides simple API for visualizing geometry, transforms, and text.
 * Zero overhead when no debug draws are active.
 *
 * @example
 * ```typescript
 * // Draw a line
 * DebugDraw.drawLine(
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 0, 0),
 *   Color.red()
 * );
 *
 * // Draw a box
 * DebugDraw.drawBox(boundingBox, Color.green(), true);
 *
 * // Draw a sphere
 * DebugDraw.drawSphere(center, radius, Color.blue());
 *
 * // Draw coordinate axes
 * DebugDraw.drawAxis(transform, 1.0);
 *
 * // Draw frustum
 * DebugDraw.drawFrustum(camera.frustum, Color.yellow());
 *
 * // Draw persistent line (survives multiple frames)
 * DebugDraw.drawLinePersistent(start, end, Color.cyan(), 5.0);
 *
 * // Draw text at world position
 * DebugDraw.drawText(position, "Player", Color.white());
 *
 * // In render loop
 * DebugDraw.render(context);
 * ```
 */
export class DebugDraw {
  /**
   * Lines to draw.
   */
  private static _lines: DebugLine[] = [];

  /**
   * Boxes to draw.
   */
  private static _boxes: DebugBox[] = [];

  /**
   * Spheres to draw.
   */
  private static _spheres: DebugSphere[] = [];

  /**
   * Text labels to draw.
   */
  private static _texts: DebugText[] = [];

  /**
   * Whether debug draw is enabled globally.
   */
  private static _enabled: boolean = true;

  /**
   * Current time for expiry checks.
   */
  private static _currentTime: number = 0;

  /**
   * Vertex buffer for batched rendering.
   */
  private static _vertexBuffer: any = null;

  /**
   * Pipeline for depth-tested rendering.
   */
  private static _depthTestedPipeline: any = null;

  /**
   * Pipeline for always-on-top rendering.
   */
  private static _alwaysOnTopPipeline: any = null;

  /**
   * Whether resources are initialized.
   */
  private static _initialized: boolean = false;

  /**
   * Draws a line between two points.
   *
   * @param start - Start position
   * @param end - End position
   * @param color - Line color
   * @param mode - Draw mode (default: DepthTested)
   *
   * @example
   * ```typescript
   * DebugDraw.drawLine(
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 0, 0),
   *   Color.red()
   * );
   * ```
   */
  static drawLine(
    start: Vector3,
    end: Vector3,
    color: Color,
    mode: DebugDrawMode = DebugDrawMode.DepthTested
  ): void {
    if (!this._enabled) return;

    this._lines.push({
      start: start.clone(),
      end: end.clone(),
      color: color.clone(),
      mode,
      expiryTime: -1, // Single frame
    });
  }

  /**
   * Draws a persistent line that survives multiple frames.
   *
   * @param start - Start position
   * @param end - End position
   * @param color - Line color
   * @param duration - Duration in seconds
   * @param mode - Draw mode (default: DepthTested)
   *
   * @example
   * ```typescript
   * DebugDraw.drawLinePersistent(start, end, Color.cyan(), 5.0);
   * ```
   */
  static drawLinePersistent(
    start: Vector3,
    end: Vector3,
    color: Color,
    duration: number,
    mode: DebugDrawMode = DebugDrawMode.DepthTested
  ): void {
    if (!this._enabled) return;

    this._lines.push({
      start: start.clone(),
      end: end.clone(),
      color: color.clone(),
      mode,
      expiryTime: this._currentTime + duration,
    });
  }

  /**
   * Draws a box from min/max bounds.
   *
   * @param box - Bounding box
   * @param color - Box color
   * @param wireframe - Draw as wireframe (default: true)
   * @param mode - Draw mode (default: DepthTested)
   *
   * @example
   * ```typescript
   * DebugDraw.drawBox(boundingBox, Color.green(), true);
   * ```
   */
  static drawBox(
    box: Box3,
    color: Color,
    wireframe: boolean = true,
    mode: DebugDrawMode = DebugDrawMode.DepthTested
  ): void {
    if (!this._enabled) return;

    this._boxes.push({
      min: box.min.clone(),
      max: box.max.clone(),
      color: color.clone(),
      wireframe,
      mode,
      expiryTime: -1,
    });
  }

  /**
   * Draws a sphere.
   *
   * @param center - Center position
   * @param radius - Sphere radius
   * @param color - Sphere color
   * @param segments - Number of segments (default: 16)
   * @param mode - Draw mode (default: DepthTested)
   *
   * @example
   * ```typescript
   * DebugDraw.drawSphere(center, 5.0, Color.blue());
   * ```
   */
  static drawSphere(
    center: Vector3,
    radius: number,
    color: Color,
    segments: number = 16,
    mode: DebugDrawMode = DebugDrawMode.DepthTested
  ): void {
    if (!this._enabled) return;

    this._spheres.push({
      center: center.clone(),
      radius,
      color: color.clone(),
      segments,
      mode,
      expiryTime: -1,
    });
  }

  /**
   * Draws a view frustum.
   *
   * @param frustum - Frustum to draw
   * @param color - Frustum color
   * @param mode - Draw mode (default: DepthTested)
   *
   * @example
   * ```typescript
   * DebugDraw.drawFrustum(camera.frustum, Color.yellow());
   * ```
   */
  static drawFrustum(
    frustum: Frustum,
    color: Color,
    mode: DebugDrawMode = DebugDrawMode.DepthTested
  ): void {
    if (!this._enabled) return;

    // Get frustum corners
    const corners = frustum.getCorners();

    // Draw near plane
    this.drawLine(corners[0], corners[1], color, mode);
    this.drawLine(corners[1], corners[2], color, mode);
    this.drawLine(corners[2], corners[3], color, mode);
    this.drawLine(corners[3], corners[0], color, mode);

    // Draw far plane
    this.drawLine(corners[4], corners[5], color, mode);
    this.drawLine(corners[5], corners[6], color, mode);
    this.drawLine(corners[6], corners[7], color, mode);
    this.drawLine(corners[7], corners[4], color, mode);

    // Draw connections
    this.drawLine(corners[0], corners[4], color, mode);
    this.drawLine(corners[1], corners[5], color, mode);
    this.drawLine(corners[2], corners[6], color, mode);
    this.drawLine(corners[3], corners[7], color, mode);
  }

  /**
   * Draws coordinate axes at a transform.
   *
   * @param transform - Transform matrix
   * @param size - Axis length (default: 1.0)
   *
   * @example
   * ```typescript
   * DebugDraw.drawAxis(transform, 2.0);
   * ```
   */
  static drawAxis(transform: Matrix4, size: number = 1.0): void {
    if (!this._enabled) return;

    const origin = new Vector3(
      transform.elements[12],
      transform.elements[13],
      transform.elements[14]
    );

    // Extract basis vectors
    const right = new Vector3(
      transform.elements[0],
      transform.elements[1],
      transform.elements[2]
    ).normalize().scale(size);

    const up = new Vector3(
      transform.elements[4],
      transform.elements[5],
      transform.elements[6]
    ).normalize().scale(size);

    const forward = new Vector3(
      transform.elements[8],
      transform.elements[9],
      transform.elements[10]
    ).normalize().scale(size);

    // Draw axes
    this.drawLine(origin, origin.add(right), Color.red(), DebugDrawMode.AlwaysOnTop);
    this.drawLine(origin, origin.add(up), Color.green(), DebugDrawMode.AlwaysOnTop);
    this.drawLine(origin, origin.add(forward), Color.blue(), DebugDrawMode.AlwaysOnTop);
  }

  /**
   * Draws text at a world position.
   *
   * @param position - World position
   * @param text - Text to display
   * @param color - Text color (default: white)
   * @param size - Text size (default: 12)
   *
   * @example
   * ```typescript
   * DebugDraw.drawText(position, "Player", Color.white());
   * ```
   */
  static drawText(
    position: Vector3,
    text: string,
    color: Color = Color.white(),
    size: number = 12
  ): void {
    if (!this._enabled) return;

    this._texts.push({
      position: position.clone(),
      text,
      color: color.clone(),
      size,
      expiryTime: -1,
    });
  }

  /**
   * Renders all debug draws.
   * Call this once per frame after rendering the scene.
   *
   * @param context - Render context
   *
   * @example
   * ```typescript
   * DebugDraw.render(context);
   * ```
   */
  static render(context: RenderContext): void {
    if (!this._enabled) return;
    if (this._lines.length === 0 && this._boxes.length === 0 &&
        this._spheres.length === 0 && this._texts.length === 0) {
      return;
    }

    // Update current time
    this._currentTime += context.deltaTime;

    // Initialize resources if needed
    if (!this._initialized) {
      this._initialize(context);
    }

    // Remove expired persistent draws
    this._removeExpired();

    // Render lines
    this._renderLines(context);

    // Render boxes
    this._renderBoxes(context);

    // Render spheres
    this._renderSpheres(context);

    // Render text
    this._renderText(context);

    // Clear single-frame draws
    this._clearSingleFrame();
  }

  /**
   * Clears all debug draws.
   *
   * @example
   * ```typescript
   * DebugDraw.clear();
   * ```
   */
  static clear(): void {
    this._lines = [];
    this._boxes = [];
    this._spheres = [];
    this._texts = [];
  }

  /**
   * Enables or disables debug drawing globally.
   *
   * @param enabled - Whether to enable debug drawing
   *
   * @example
   * ```typescript
   * DebugDraw.setEnabled(false); // Disable all debug drawing
   * ```
   */
  static setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if debug drawing is enabled.
   * @returns True if enabled
   */
  static isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets the number of active debug draws.
   * @returns Count of active draws
   */
  static getDrawCount(): number {
    return this._lines.length + this._boxes.length + this._spheres.length + this._texts.length;
  }

  /**
   * Initializes rendering resources.
   * @private
   */
  private static _initialize(context: RenderContext): void {
    // Create vertex buffer for batched line rendering
    // In a real implementation, create shaders and pipelines here

    this._initialized = true;
    logger.debug('DebugDraw initialized');
  }

  /**
   * Removes expired persistent draws.
   * @private
   */
  private static _removeExpired(): void {
    const currentTime = this._currentTime;

    this._lines = this._lines.filter(
      (line) => line.expiryTime < 0 || line.expiryTime > currentTime
    );
    this._boxes = this._boxes.filter(
      (box) => box.expiryTime < 0 || box.expiryTime > currentTime
    );
    this._spheres = this._spheres.filter(
      (sphere) => sphere.expiryTime < 0 || sphere.expiryTime > currentTime
    );
    this._texts = this._texts.filter(
      (text) => text.expiryTime < 0 || text.expiryTime > currentTime
    );
  }

  /**
   * Clears single-frame draws.
   * @private
   */
  private static _clearSingleFrame(): void {
    this._lines = this._lines.filter((line) => line.expiryTime >= 0);
    this._boxes = this._boxes.filter((box) => box.expiryTime >= 0);
    this._spheres = this._spheres.filter((sphere) => sphere.expiryTime >= 0);
    this._texts = this._texts.filter((text) => text.expiryTime >= 0);
  }

  /**
   * Renders lines.
   * @private
   */
  private static _renderLines(context: RenderContext): void {
    if (this._lines.length === 0) return;

    // Batch lines by mode
    const depthTestedLines = this._lines.filter((l) => l.mode === DebugDrawMode.DepthTested);
    const alwaysOnTopLines = this._lines.filter((l) => l.mode === DebugDrawMode.AlwaysOnTop);

    // Render depth-tested lines
    if (depthTestedLines.length > 0) {
      // Build vertex data and render
      logger.trace(`Rendering ${depthTestedLines.length} depth-tested lines`);
    }

    // Render always-on-top lines
    if (alwaysOnTopLines.length > 0) {
      // Build vertex data and render
      logger.trace(`Rendering ${alwaysOnTopLines.length} always-on-top lines`);
    }
  }

  /**
   * Renders boxes.
   * @private
   */
  private static _renderBoxes(context: RenderContext): void {
    if (this._boxes.length === 0) return;

    // Convert boxes to lines
    for (const box of this._boxes) {
      const min = box.min;
      const max = box.max;

      // Bottom face
      this.drawLine(new Vector3(min.x, min.y, min.z), new Vector3(max.x, min.y, min.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, min.y, min.z), new Vector3(max.x, min.y, max.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, min.y, max.z), new Vector3(min.x, min.y, max.z), box.color, box.mode);
      this.drawLine(new Vector3(min.x, min.y, max.z), new Vector3(min.x, min.y, min.z), box.color, box.mode);

      // Top face
      this.drawLine(new Vector3(min.x, max.y, min.z), new Vector3(max.x, max.y, min.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, max.y, min.z), new Vector3(max.x, max.y, max.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, max.y, max.z), new Vector3(min.x, max.y, max.z), box.color, box.mode);
      this.drawLine(new Vector3(min.x, max.y, max.z), new Vector3(min.x, max.y, min.z), box.color, box.mode);

      // Vertical edges
      this.drawLine(new Vector3(min.x, min.y, min.z), new Vector3(min.x, max.y, min.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, min.y, min.z), new Vector3(max.x, max.y, min.z), box.color, box.mode);
      this.drawLine(new Vector3(max.x, min.y, max.z), new Vector3(max.x, max.y, max.z), box.color, box.mode);
      this.drawLine(new Vector3(min.x, min.y, max.z), new Vector3(min.x, max.y, max.z), box.color, box.mode);
    }

    logger.trace(`Rendering ${this._boxes.length} boxes`);
  }

  /**
   * Renders spheres.
   * @private
   */
  private static _renderSpheres(context: RenderContext): void {
    if (this._spheres.length === 0) return;

    // Convert spheres to lines (circles in 3 planes)
    for (const sphere of this._spheres) {
      const segments = sphere.segments;
      const angleStep = (Math.PI * 2) / segments;

      // XY plane
      for (let i = 0; i < segments; i++) {
        const angle1 = i * angleStep;
        const angle2 = (i + 1) * angleStep;
        const p1 = new Vector3(
          sphere.center.x + Math.cos(angle1) * sphere.radius,
          sphere.center.y + Math.sin(angle1) * sphere.radius,
          sphere.center.z
        );
        const p2 = new Vector3(
          sphere.center.x + Math.cos(angle2) * sphere.radius,
          sphere.center.y + Math.sin(angle2) * sphere.radius,
          sphere.center.z
        );
        this.drawLine(p1, p2, sphere.color, sphere.mode);
      }

      // XZ plane
      for (let i = 0; i < segments; i++) {
        const angle1 = i * angleStep;
        const angle2 = (i + 1) * angleStep;
        const p1 = new Vector3(
          sphere.center.x + Math.cos(angle1) * sphere.radius,
          sphere.center.y,
          sphere.center.z + Math.sin(angle1) * sphere.radius
        );
        const p2 = new Vector3(
          sphere.center.x + Math.cos(angle2) * sphere.radius,
          sphere.center.y,
          sphere.center.z + Math.sin(angle2) * sphere.radius
        );
        this.drawLine(p1, p2, sphere.color, sphere.mode);
      }

      // YZ plane
      for (let i = 0; i < segments; i++) {
        const angle1 = i * angleStep;
        const angle2 = (i + 1) * angleStep;
        const p1 = new Vector3(
          sphere.center.x,
          sphere.center.y + Math.cos(angle1) * sphere.radius,
          sphere.center.z + Math.sin(angle1) * sphere.radius
        );
        const p2 = new Vector3(
          sphere.center.x,
          sphere.center.y + Math.cos(angle2) * sphere.radius,
          sphere.center.z + Math.sin(angle2) * sphere.radius
        );
        this.drawLine(p1, p2, sphere.color, sphere.mode);
      }
    }

    logger.trace(`Rendering ${this._spheres.length} spheres`);
  }

  /**
   * Renders text labels.
   * @private
   */
  private static _renderText(context: RenderContext): void {
    if (this._texts.length === 0) return;

    // Project text positions to screen space
    for (const text of this._texts) {
      const screenPos = context.viewData.worldToScreen(text.position);
      if (screenPos) {
        // Render text at screen position
        // In a real implementation, use a text rendering system
        logger.trace(`Text at screen (${screenPos.x}, ${screenPos.y}): ${text.text}`);
      }
    }

    logger.trace(`Rendering ${this._texts.length} text labels`);
  }
}
