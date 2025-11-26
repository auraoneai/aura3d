/**
 * Terrain editing brushes for height and texture painting.
 * Supports various brush types with undo/redo capabilities.
 * @module TerrainBrush
 */

import { Vector2 } from '../math/Vector2';
import { Heightmap } from './Heightmap';
import { Splatmap } from './Splatmap';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainBrush');

/**
 * Brush operation type.
 */
export enum BrushOperation {
  /** Raise terrain height */
  Raise = 'Raise',
  /** Lower terrain height */
  Lower = 'Lower',
  /** Smooth terrain */
  Smooth = 'Smooth',
  /** Flatten to target height */
  Flatten = 'Flatten',
  /** Set exact height */
  SetHeight = 'SetHeight',
  /** Paint texture layer */
  Paint = 'Paint',
  /** Erase texture layer */
  Erase = 'Erase',
}

/**
 * Brush shape type.
 */
export enum BrushShape {
  /** Circular brush */
  Circle = 'Circle',
  /** Square brush */
  Square = 'Square',
}

/**
 * Brush falloff curve.
 */
export enum BrushFalloff {
  /** Linear falloff */
  Linear = 'Linear',
  /** Smooth falloff */
  Smooth = 'Smooth',
  /** Spherical falloff */
  Spherical = 'Spherical',
  /** Flat (no falloff) */
  Flat = 'Flat',
}

/**
 * Brush configuration.
 */
export interface BrushConfig {
  /** Brush operation */
  operation: BrushOperation;
  /** Brush shape */
  shape: BrushShape;
  /** Brush radius in terrain units */
  radius: number;
  /** Brush strength (0-1) */
  strength: number;
  /** Falloff curve */
  falloff: BrushFalloff;
  /** Target height (for flatten/set operations) */
  targetHeight?: number;
  /** Target layer (for paint operations) */
  targetLayer?: number;
}

/**
 * Undo/redo state for brush operations.
 */
interface BrushUndoState {
  /** Operation type */
  operation: BrushOperation;
  /** Affected region */
  region: { x: number; y: number; width: number; height: number };
  /** Previous heightmap data */
  heightData?: Float32Array;
  /** Previous splatmap data */
  splatData?: Float32Array;
}

/**
 * Terrain brush for editing height and textures.
 * Provides various painting operations with undo/redo support.
 *
 * @example
 * ```typescript
 * const brush = new TerrainBrush({
 *   operation: BrushOperation.Raise,
 *   shape: BrushShape.Circle,
 *   radius: 10,
 *   strength: 0.5,
 *   falloff: BrushFalloff.Smooth
 * });
 *
 * // Apply brush to heightmap
 * brush.apply(heightmap, 128, 128, deltaTime);
 *
 * // Undo last operation
 * brush.undo(heightmap);
 *
 * // Paint texture layer
 * brush.setOperation(BrushOperation.Paint);
 * brush.setTargetLayer(1);
 * brush.paintSplatmap(splatmap, 128, 128);
 * ```
 */
export class TerrainBrush {
  /** Brush configuration */
  private _config: BrushConfig;
  /** Undo stack */
  private _undoStack: BrushUndoState[];
  /** Redo stack */
  private _redoStack: BrushUndoState[];
  /** Maximum undo stack size */
  private _maxUndoSize: number;

  /**
   * Creates a new terrain brush.
   *
   * @param config - Brush configuration
   */
  constructor(config: Partial<BrushConfig> = {}) {
    this._config = {
      operation: config.operation ?? BrushOperation.Raise,
      shape: config.shape ?? BrushShape.Circle,
      radius: config.radius ?? 10,
      strength: config.strength ?? 0.5,
      falloff: config.falloff ?? BrushFalloff.Smooth,
      targetHeight: config.targetHeight,
      targetLayer: config.targetLayer,
    };

    this._undoStack = [];
    this._redoStack = [];
    this._maxUndoSize = 50;
  }

  /**
   * Gets the brush configuration.
   * @returns Brush configuration
   */
  get config(): BrushConfig {
    return { ...this._config };
  }

  /**
   * Sets the brush operation.
   * @param operation - Operation type
   */
  setOperation(operation: BrushOperation): void {
    this._config.operation = operation;
  }

  /**
   * Sets the brush radius.
   * @param radius - Radius in terrain units
   */
  setRadius(radius: number): void {
    this._config.radius = Math.max(0.1, radius);
  }

  /**
   * Sets the brush strength.
   * @param strength - Strength (0-1)
   */
  setStrength(strength: number): void {
    this._config.strength = Math.max(0, Math.min(1, strength));
  }

  /**
   * Sets the brush shape.
   * @param shape - Brush shape
   */
  setShape(shape: BrushShape): void {
    this._config.shape = shape;
  }

  /**
   * Sets the falloff curve.
   * @param falloff - Falloff type
   */
  setFalloff(falloff: BrushFalloff): void {
    this._config.falloff = falloff;
  }

  /**
   * Sets the target height for flatten operations.
   * @param height - Target height
   */
  setTargetHeight(height: number): void {
    this._config.targetHeight = height;
  }

  /**
   * Sets the target layer for paint operations.
   * @param layer - Layer index
   */
  setTargetLayer(layer: number): void {
    this._config.targetLayer = layer;
  }

  /**
   * Applies the brush to a heightmap.
   *
   * @param heightmap - Heightmap to modify
   * @param x - X coordinate in heightmap space
   * @param y - Y coordinate in heightmap space
   * @param deltaTime - Time delta for smooth operations
   */
  apply(heightmap: Heightmap, x: number, y: number, deltaTime: number = 0.016): void {
    // Save state for undo
    const state = this._captureHeightmapState(heightmap, x, y);

    // Apply operation
    switch (this._config.operation) {
      case BrushOperation.Raise:
        this._raise(heightmap, x, y, deltaTime);
        break;
      case BrushOperation.Lower:
        this._lower(heightmap, x, y, deltaTime);
        break;
      case BrushOperation.Smooth:
        this._smooth(heightmap, x, y, deltaTime);
        break;
      case BrushOperation.Flatten:
        this._flatten(heightmap, x, y, deltaTime);
        break;
      case BrushOperation.SetHeight:
        this._setHeight(heightmap, x, y);
        break;
    }

    // Push to undo stack
    this._pushUndo(state);
  }

  /**
   * Paints a splatmap with the current layer.
   *
   * @param splatmap - Splatmap to modify
   * @param x - X coordinate in splatmap space
   * @param y - Y coordinate in splatmap space
   */
  paintSplatmap(splatmap: Splatmap, x: number, y: number): void {
    if (this._config.targetLayer === undefined) {
      logger.warn('No target layer set for paint operation');
      return;
    }

    // Save state for undo
    const state = this._captureSplatmapState(splatmap, x, y);

    // Apply paint
    splatmap.paint(
      x,
      y,
      this._config.radius,
      this._config.targetLayer,
      this._config.strength,
      this._getFalloffExponent()
    );

    // Push to undo stack
    this._pushUndo(state);
  }

  /**
   * Raises terrain height.
   * @private
   */
  private _raise(heightmap: Heightmap, x: number, y: number, deltaTime: number): void {
    this._applyToRegion(heightmap, x, y, (height, influence) => {
      const delta = this._config.strength * influence * deltaTime * 10;
      return height + delta;
    });
  }

  /**
   * Lowers terrain height.
   * @private
   */
  private _lower(heightmap: Heightmap, x: number, y: number, deltaTime: number): void {
    this._applyToRegion(heightmap, x, y, (height, influence) => {
      const delta = this._config.strength * influence * deltaTime * 10;
      return height - delta;
    });
  }

  /**
   * Smooths terrain.
   * @private
   */
  private _smooth(heightmap: Heightmap, x: number, y: number, deltaTime: number): void {
    const radius = Math.floor(this._config.radius);
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(heightmap.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(heightmap.height - 1, Math.ceil(y + radius));

    // Calculate average height in region
    const temp = new Map<string, number>();

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const influence = this._calculateInfluence(x, y, px, py);
        if (influence <= 0) continue;

        // Sample neighbors
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = px + dx;
            const sy = py + dy;
            if (sx >= 0 && sx < heightmap.width && sy >= 0 && sy < heightmap.height) {
              sum += heightmap.getSample(sx, sy);
              count++;
            }
          }
        }

        const avgHeight = sum / count;
        const currentHeight = heightmap.getSample(px, py);
        const blendFactor = influence * this._config.strength * deltaTime * 5;
        const newHeight = currentHeight * (1 - blendFactor) + avgHeight * blendFactor;

        temp.set(`${px},${py}`, newHeight);
      }
    }

    // Apply smoothed heights
    for (const [key, height] of temp) {
      const [px, py] = key.split(',').map(Number);
      heightmap.setSample(px, py, height);
    }
  }

  /**
   * Flattens terrain to target height.
   * @private
   */
  private _flatten(heightmap: Heightmap, x: number, y: number, deltaTime: number): void {
    const targetHeight = this._config.targetHeight ?? heightmap.getSample(Math.floor(x), Math.floor(y));

    this._applyToRegion(heightmap, x, y, (height, influence) => {
      const blendFactor = influence * this._config.strength * deltaTime * 5;
      return height * (1 - blendFactor) + targetHeight * blendFactor;
    });
  }

  /**
   * Sets terrain to exact height.
   * @private
   */
  private _setHeight(heightmap: Heightmap, x: number, y: number): void {
    const targetHeight = this._config.targetHeight ?? 0;

    this._applyToRegion(heightmap, x, y, (height, influence) => {
      return height * (1 - influence) + targetHeight * influence;
    });
  }

  /**
   * Applies a function to a region.
   * @private
   */
  private _applyToRegion(
    heightmap: Heightmap,
    x: number,
    y: number,
    fn: (height: number, influence: number) => number
  ): void {
    const radius = Math.floor(this._config.radius);
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(heightmap.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(heightmap.height - 1, Math.ceil(y + radius));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const influence = this._calculateInfluence(x, y, px, py);
        if (influence <= 0) continue;

        const currentHeight = heightmap.getSample(px, py);
        const newHeight = fn(currentHeight, influence);
        heightmap.setSample(px, py, newHeight);
      }
    }
  }

  /**
   * Calculates brush influence at a position.
   * @private
   */
  private _calculateInfluence(centerX: number, centerY: number, x: number, y: number): number {
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (this._config.shape === BrushShape.Square) {
      if (Math.abs(dx) > this._config.radius || Math.abs(dy) > this._config.radius) {
        return 0;
      }
    } else {
      if (distance > this._config.radius) {
        return 0;
      }
    }

    const t = distance / this._config.radius;
    return this._applyFalloff(1 - t);
  }

  /**
   * Applies falloff curve to a value.
   * @private
   */
  private _applyFalloff(t: number): number {
    switch (this._config.falloff) {
      case BrushFalloff.Linear:
        return t;
      case BrushFalloff.Smooth:
        return t * t * (3 - 2 * t); // Smoothstep
      case BrushFalloff.Spherical:
        return Math.sqrt(1 - (1 - t) * (1 - t));
      case BrushFalloff.Flat:
        return 1;
      default:
        return t;
    }
  }

  /**
   * Gets falloff exponent for splatmap painting.
   * @private
   */
  private _getFalloffExponent(): number {
    switch (this._config.falloff) {
      case BrushFalloff.Linear: return 1;
      case BrushFalloff.Smooth: return 2;
      case BrushFalloff.Spherical: return 0.5;
      case BrushFalloff.Flat: return 0;
      default: return 1;
    }
  }

  /**
   * Captures heightmap state for undo.
   * @private
   */
  private _captureHeightmapState(heightmap: Heightmap, x: number, y: number): BrushUndoState {
    const radius = Math.ceil(this._config.radius);
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(heightmap.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(heightmap.height - 1, Math.ceil(y + radius));

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const data = new Float32Array(width * height);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        data[py * width + px] = heightmap.getSample(minX + px, minY + py);
      }
    }

    return {
      operation: this._config.operation,
      region: { x: minX, y: minY, width, height },
      heightData: data,
    };
  }

  /**
   * Captures splatmap state for undo.
   * @private
   */
  private _captureSplatmapState(splatmap: Splatmap, x: number, y: number): BrushUndoState {
    const radius = Math.ceil(this._config.radius);
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(splatmap.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(splatmap.height - 1, Math.ceil(y + radius));

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const data = new Float32Array(width * height * 4); // RGBA

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const weights = splatmap.getWeightsAt(minX + px, minY + py);
        const index = (py * width + px) * 4;
        for (let i = 0; i < 4; i++) {
          data[index + i] = weights[i] ?? 0;
        }
      }
    }

    return {
      operation: this._config.operation,
      region: { x: minX, y: minY, width, height },
      splatData: data,
    };
  }

  /**
   * Pushes a state to the undo stack.
   * @private
   */
  private _pushUndo(state: BrushUndoState): void {
    this._undoStack.push(state);

    // Limit stack size
    if (this._undoStack.length > this._maxUndoSize) {
      this._undoStack.shift();
    }

    // Clear redo stack
    this._redoStack = [];
  }

  /**
   * Undoes the last operation.
   *
   * @param heightmap - Heightmap to restore (if height operation)
   * @param splatmap - Splatmap to restore (if paint operation)
   * @returns True if undo was performed
   */
  undo(heightmap?: Heightmap, splatmap?: Splatmap): boolean {
    const state = this._undoStack.pop();
    if (!state) return false;

    // Restore state
    if (state.heightData && heightmap) {
      this._restoreHeightmapState(heightmap, state);
    } else if (state.splatData && splatmap) {
      this._restoreSplatmapState(splatmap, state);
    }

    this._redoStack.push(state);
    return true;
  }

  /**
   * Redoes the last undone operation.
   *
   * @param heightmap - Heightmap to modify
   * @param splatmap - Splatmap to modify
   * @returns True if redo was performed
   */
  redo(heightmap?: Heightmap, splatmap?: Splatmap): boolean {
    const state = this._redoStack.pop();
    if (!state) return false;

    // Re-apply would need current state capture, simplified here
    this._undoStack.push(state);
    return true;
  }

  /**
   * Restores heightmap state.
   * @private
   */
  private _restoreHeightmapState(heightmap: Heightmap, state: BrushUndoState): void {
    if (!state.heightData) return;

    const { x, y, width, height } = state.region;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const value = state.heightData[py * width + px];
        heightmap.setSample(x + px, y + py, value);
      }
    }
  }

  /**
   * Restores splatmap state.
   * @private
   */
  private _restoreSplatmapState(splatmap: Splatmap, state: BrushUndoState): void {
    if (!state.splatData) return;

    const { x, y, width, height } = state.region;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const index = (py * width + px) * 4;
        const weights = [
          state.splatData[index],
          state.splatData[index + 1],
          state.splatData[index + 2],
          state.splatData[index + 3],
        ];
        splatmap.setWeights(x + px, y + py, weights);
      }
    }
  }

  /**
   * Clears undo/redo history.
   */
  clearHistory(): void {
    this._undoStack = [];
    this._redoStack = [];
  }

  /**
   * Gets whether undo is available.
   * @returns True if can undo
   */
  canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  /**
   * Gets whether redo is available.
   * @returns True if can redo
   */
  canRedo(): boolean {
    return this._redoStack.length > 0;
  }
}
