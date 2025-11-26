/**
 * @fileoverview UI batch rendering with sprite batching and optimization.
 * @module ui/UIRenderer
 */

import { UICanvas } from './UICanvas';
import { UIElement } from './UIElement';
import { Color } from '../math/Color';
import { Rect } from '../math/Rect';
import { Vector2 } from '../math/Vector2';

/**
 * Render batch for grouping similar draw calls
 */
interface RenderBatch {
  texture: HTMLImageElement | HTMLCanvasElement | null;
  vertices: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
  count: number;
}

/**
 * UI batch renderer for efficient rendering.
 * Batches similar draw calls together to minimize state changes.
 *
 * @example
 * ```typescript
 * const renderer = new UIRenderer();
 * renderer.begin(context);
 * renderer.drawRect(new Rect(0, 0, 100, 100), Color.red());
 * renderer.drawTexture(texture, new Rect(100, 0, 100, 100));
 * renderer.end();
 * ```
 */
export class UIRenderer {
  /**
   * Current render batch
   */
  protected currentBatch: RenderBatch | null = null;

  /**
   * Batch queue
   */
  protected batches: RenderBatch[] = [];

  /**
   * Current rendering context
   */
  protected context: CanvasRenderingContext2D | null = null;

  /**
   * Maximum batch size
   */
  protected maxBatchSize: number = 10000;

  /**
   * Current clip rect
   */
  protected clipRect: Rect | null = null;

  /**
   * Clip rect stack
   */
  protected clipStack: (Rect | null)[] = [];

  /**
   * Draw call count (for profiling)
   */
  protected _drawCalls: number = 0;

  /**
   * Vertex count (for profiling)
   */
  protected _vertexCount: number = 0;

  /**
   * Creates a new UI renderer.
   *
   * @example
   * ```typescript
   * const renderer = new UIRenderer();
   * ```
   */
  constructor() {}

  /**
   * Gets the draw call count.
   */
  get drawCalls(): number {
    return this._drawCalls;
  }

  /**
   * Gets the vertex count.
   */
  get vertexCount(): number {
    return this._vertexCount;
  }

  /**
   * Begins a rendering frame.
   *
   * @param context - 2D rendering context
   */
  begin(context: CanvasRenderingContext2D): void {
    this.context = context;
    this.batches = [];
    this.currentBatch = null;
    this.clipRect = null;
    this.clipStack = [];
    this._drawCalls = 0;
    this._vertexCount = 0;
  }

  /**
   * Ends the rendering frame and flushes batches.
   */
  end(): void {
    this.flush();
    this.context = null;
  }

  /**
   * Flushes the current batch.
   */
  flush(): void {
    if (!this.context) {
      return;
    }

    for (const batch of this.batches) {
      this.renderBatch(batch);
    }

    this.batches = [];
    this.currentBatch = null;
  }

  /**
   * Renders a batch.
   */
  protected renderBatch(batch: RenderBatch): void {
    if (!this.context || batch.count === 0) {
      return;
    }

    this._drawCalls++;
    this._vertexCount += batch.count;

    // For canvas 2D, we render each quad individually
    // In a WebGL implementation, this would be a single draw call
    const quads = batch.count / 4;

    for (let i = 0; i < quads; i++) {
      const idx = i * 4;
      const x = batch.vertices[idx * 2];
      const y = batch.vertices[idx * 2 + 1];
      const width = batch.vertices[(idx + 1) * 2] - x;
      const height = batch.vertices[(idx + 2) * 2 + 1] - y;

      const r = batch.colors[idx * 4];
      const g = batch.colors[idx * 4 + 1];
      const b = batch.colors[idx * 4 + 2];
      const a = batch.colors[idx * 4 + 3];

      this.context.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;

      if (batch.texture) {
        const u0 = batch.uvs[idx * 2];
        const v0 = batch.uvs[idx * 2 + 1];
        const u1 = batch.uvs[(idx + 2) * 2];
        const v1 = batch.uvs[(idx + 2) * 2 + 1];

        const texX = u0 * batch.texture.width;
        const texY = v0 * batch.texture.height;
        const texW = (u1 - u0) * batch.texture.width;
        const texH = (v1 - v0) * batch.texture.height;

        this.context.drawImage(
          batch.texture,
          texX, texY, texW, texH,
          x, y, width, height
        );
      } else {
        this.context.fillRect(x, y, width, height);
      }
    }
  }

  /**
   * Gets or creates a batch for the given texture.
   */
  protected getBatch(texture: HTMLImageElement | HTMLCanvasElement | null): RenderBatch {
    // Check if current batch can be used
    if (this.currentBatch && this.currentBatch.texture === texture) {
      if (this.currentBatch.count < this.maxBatchSize) {
        return this.currentBatch;
      }
    }

    // Flush current batch
    if (this.currentBatch) {
      this.batches.push(this.currentBatch);
    }

    // Create new batch
    this.currentBatch = {
      texture,
      vertices: [],
      indices: [],
      colors: [],
      uvs: [],
      count: 0
    };

    return this.currentBatch;
  }

  /**
   * Draws a colored rectangle.
   *
   * @param rect - Rectangle to draw
   * @param color - Fill color
   */
  drawRect(rect: Rect, color: Color): void {
    if (!this.context) {
      return;
    }

    const batch = this.getBatch(null);

    // Add quad vertices (4 vertices)
    const x0 = rect.x;
    const y0 = rect.y;
    const x1 = rect.x + rect.width;
    const y1 = rect.y + rect.height;

    // Top-left
    batch.vertices.push(x0, y0);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(0, 0);

    // Top-right
    batch.vertices.push(x1, y0);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(1, 0);

    // Bottom-right
    batch.vertices.push(x1, y1);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(1, 1);

    // Bottom-left
    batch.vertices.push(x0, y1);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(0, 1);

    batch.count += 4;
  }

  /**
   * Draws a textured rectangle.
   *
   * @param texture - Texture to draw
   * @param destRect - Destination rectangle
   * @param sourceRect - Source rectangle (optional)
   * @param tint - Color tint (optional)
   */
  drawTexture(
    texture: HTMLImageElement | HTMLCanvasElement,
    destRect: Rect,
    sourceRect?: Rect,
    tint?: Color
  ): void {
    if (!this.context) {
      return;
    }

    const batch = this.getBatch(texture);
    const color = tint ?? Color.white();

    // Calculate UVs
    let u0 = 0, v0 = 0, u1 = 1, v1 = 1;

    if (sourceRect) {
      u0 = sourceRect.x / texture.width;
      v0 = sourceRect.y / texture.height;
      u1 = (sourceRect.x + sourceRect.width) / texture.width;
      v1 = (sourceRect.y + sourceRect.height) / texture.height;
    }

    const x0 = destRect.x;
    const y0 = destRect.y;
    const x1 = destRect.x + destRect.width;
    const y1 = destRect.y + destRect.height;

    // Top-left
    batch.vertices.push(x0, y0);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(u0, v0);

    // Top-right
    batch.vertices.push(x1, y0);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(u1, v0);

    // Bottom-right
    batch.vertices.push(x1, y1);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(u1, v1);

    // Bottom-left
    batch.vertices.push(x0, y1);
    batch.colors.push(color.r, color.g, color.b, color.a);
    batch.uvs.push(u0, v1);

    batch.count += 4;
  }

  /**
   * Draws text.
   *
   * @param text - Text to draw
   * @param position - Position
   * @param font - Font string
   * @param color - Text color
   */
  drawText(text: string, position: Vector2, font: string, color: Color): void {
    if (!this.context) {
      return;
    }

    // Text rendering doesn't batch well, flush current batch
    this.flush();

    this.context.save();
    this.context.font = font;
    this.context.fillStyle = color.toCSSString();
    this.context.fillText(text, position.x, position.y);
    this.context.restore();

    this._drawCalls++;
  }

  /**
   * Pushes a clip rectangle.
   *
   * @param rect - Clip rectangle
   */
  pushClipRect(rect: Rect): void {
    if (!this.context) {
      return;
    }

    // Flush before changing clip
    this.flush();

    this.clipStack.push(this.clipRect);
    this.clipRect = rect;

    this.context.save();
    this.context.beginPath();
    this.context.rect(rect.x, rect.y, rect.width, rect.height);
    this.context.clip();
  }

  /**
   * Pops the clip rectangle.
   */
  popClipRect(): void {
    if (!this.context) {
      return;
    }

    // Flush before changing clip
    this.flush();

    this.context.restore();
    this.clipRect = this.clipStack.pop() ?? null;
  }

  /**
   * Resets statistics.
   */
  resetStats(): void {
    this._drawCalls = 0;
    this._vertexCount = 0;
  }
}
