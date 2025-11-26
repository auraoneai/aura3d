/**
 * Triplanar texture projection for terrain rendering.
 * Eliminates texture stretching on steep slopes by projecting from three axes.
 * @module TriplanarMapping
 */

import { Vector3 } from '../../math/Vector3';
import { Vector2 } from '../../math/Vector2';

/**
 * Triplanar mapping configuration.
 */
export interface TriplanarConfig {
  /** Texture tiling scale */
  scale: Vector3;
  /** Blend sharpness (higher = sharper transitions) */
  blendSharpness: number;
  /** Offset for each axis */
  offset: Vector3;
  /** Enable normal map blending */
  normalBlending: boolean;
}

/**
 * Triplanar mapping weights for three axes.
 */
export interface TriplanarWeights {
  /** X-axis weight */
  x: number;
  /** Y-axis weight */
  y: number;
  /** Z-axis weight */
  z: number;
}

/**
 * Triplanar UV coordinates.
 */
export interface TriplanarUVs {
  /** UV for X-axis projection */
  uvX: Vector2;
  /** UV for Y-axis projection */
  uvY: Vector2;
  /** UV for Z-axis projection */
  uvZ: Vector2;
}

/**
 * Triplanar texture mapping system.
 * Projects textures from three axes and blends based on surface normal.
 *
 * @example
 * ```typescript
 * const triplanar = new TriplanarMapping({
 *   scale: new Vector3(10, 10, 10),
 *   blendSharpness: 4.0,
 *   offset: new Vector3(0, 0, 0),
 *   normalBlending: true
 * });
 *
 * // Calculate blend weights and UVs
 * const weights = triplanar.calculateWeights(normal);
 * const uvs = triplanar.calculateUVs(worldPosition);
 * ```
 */
export class TriplanarMapping {
  private _config: TriplanarConfig;

  /**
   * Creates a new triplanar mapping system.
   *
   * @param config - Triplanar configuration
   */
  constructor(config: Partial<TriplanarConfig> = {}) {
    this._config = {
      scale: config.scale ?? new Vector3(1, 1, 1),
      blendSharpness: config.blendSharpness ?? 4.0,
      offset: config.offset ?? new Vector3(0, 0, 0),
      normalBlending: config.normalBlending ?? true,
    };
  }

  /**
   * Gets the triplanar configuration.
   * @returns Configuration
   */
  get config(): TriplanarConfig {
    return this._config;
  }

  /**
   * Calculates blend weights for triplanar mapping.
   *
   * @param normal - Surface normal
   * @returns Blend weights for x, y, z axes
   */
  calculateWeights(normal: Vector3): TriplanarWeights {
    // Use absolute values of normal components
    const blend = new Vector3(
      Math.abs(normal.x),
      Math.abs(normal.y),
      Math.abs(normal.z)
    );

    // Apply blend sharpness
    const sharpness = this._config.blendSharpness;
    blend.x = Math.pow(blend.x, sharpness);
    blend.y = Math.pow(blend.y, sharpness);
    blend.z = Math.pow(blend.z, sharpness);

    // Normalize
    const sum = blend.x + blend.y + blend.z;
    if (sum > 0) {
      blend.x /= sum;
      blend.y /= sum;
      blend.z /= sum;
    }

    return {
      x: blend.x,
      y: blend.y,
      z: blend.z,
    };
  }

  /**
   * Calculates UV coordinates for triplanar mapping.
   *
   * @param worldPosition - World space position
   * @returns UV coordinates for each axis
   */
  calculateUVs(worldPosition: Vector3): TriplanarUVs {
    const scale = this._config.scale;
    const offset = this._config.offset;

    return {
      // X-axis projection (YZ plane)
      uvX: new Vector2(
        (worldPosition.z / scale.z) + offset.z,
        (worldPosition.y / scale.y) + offset.y
      ),

      // Y-axis projection (XZ plane)
      uvY: new Vector2(
        (worldPosition.x / scale.x) + offset.x,
        (worldPosition.z / scale.z) + offset.z
      ),

      // Z-axis projection (XY plane)
      uvZ: new Vector2(
        (worldPosition.x / scale.x) + offset.x,
        (worldPosition.y / scale.y) + offset.y
      ),
    };
  }

  /**
   * Samples a value using triplanar mapping.
   * Generic function that blends three axis-projected values.
   *
   * @param weights - Blend weights
   * @param valueX - Value from X-axis projection
   * @param valueY - Value from Y-axis projection
   * @param valueZ - Value from Z-axis projection
   * @returns Blended value
   */
  blendValues(
    weights: TriplanarWeights,
    valueX: number,
    valueY: number,
    valueZ: number
  ): number {
    return valueX * weights.x + valueY * weights.y + valueZ * weights.z;
  }

  /**
   * Blends three colors using triplanar weights.
   *
   * @param weights - Blend weights
   * @param colorX - Color from X-axis projection
   * @param colorY - Color from Y-axis projection
   * @param colorZ - Color from Z-axis projection
   * @returns Blended color
   */
  blendColors(
    weights: TriplanarWeights,
    colorX: Vector3,
    colorY: Vector3,
    colorZ: Vector3
  ): Vector3 {
    return new Vector3(
      colorX.x * weights.x + colorY.x * weights.y + colorZ.x * weights.z,
      colorX.y * weights.x + colorY.y * weights.y + colorZ.y * weights.z,
      colorX.z * weights.x + colorY.z * weights.y + colorZ.z * weights.z
    );
  }

  /**
   * Blends three normals using triplanar weights.
   * Properly handles normal map blending for each axis.
   *
   * @param weights - Blend weights
   * @param normalX - Normal from X-axis projection
   * @param normalY - Normal from Y-axis projection
   * @param normalZ - Normal from Z-axis projection
   * @param surfaceNormal - Original surface normal
   * @returns Blended normal
   */
  blendNormals(
    weights: TriplanarWeights,
    normalX: Vector3,
    normalY: Vector3,
    normalZ: Vector3,
    surfaceNormal: Vector3
  ): Vector3 {
    if (!this._config.normalBlending) {
      return surfaceNormal;
    }

    // Transform tangent-space normals to world space for each axis
    const worldNormalX = this._transformNormalX(normalX, surfaceNormal);
    const worldNormalY = this._transformNormalY(normalY, surfaceNormal);
    const worldNormalZ = this._transformNormalZ(normalZ, surfaceNormal);

    // Blend world-space normals
    const blended = new Vector3(
      worldNormalX.x * weights.x + worldNormalY.x * weights.y + worldNormalZ.x * weights.z,
      worldNormalX.y * weights.x + worldNormalY.y * weights.y + worldNormalZ.y * weights.z,
      worldNormalX.z * weights.x + worldNormalY.z * weights.y + worldNormalZ.z * weights.z
    );

    return blended.normalize();
  }

  /**
   * Transforms a tangent-space normal from X-axis projection to world space.
   * @private
   */
  private _transformNormalX(tangentNormal: Vector3, surfaceNormal: Vector3): Vector3 {
    // For X-axis projection, tangent points along Z, bitangent along Y
    const tangent = new Vector3(0, 0, 1);
    const bitangent = new Vector3(0, 1, 0);

    return new Vector3(
      tangentNormal.x * surfaceNormal.x + tangentNormal.y * bitangent.x + tangentNormal.z * tangent.x,
      tangentNormal.x * surfaceNormal.y + tangentNormal.y * bitangent.y + tangentNormal.z * tangent.y,
      tangentNormal.x * surfaceNormal.z + tangentNormal.y * bitangent.z + tangentNormal.z * tangent.z
    );
  }

  /**
   * Transforms a tangent-space normal from Y-axis projection to world space.
   * @private
   */
  private _transformNormalY(tangentNormal: Vector3, surfaceNormal: Vector3): Vector3 {
    // For Y-axis projection, tangent points along X, bitangent along Z
    const tangent = new Vector3(1, 0, 0);
    const bitangent = new Vector3(0, 0, 1);

    return new Vector3(
      tangentNormal.x * tangent.x + tangentNormal.y * surfaceNormal.x + tangentNormal.z * bitangent.x,
      tangentNormal.x * tangent.y + tangentNormal.y * surfaceNormal.y + tangentNormal.z * bitangent.y,
      tangentNormal.x * tangent.z + tangentNormal.y * surfaceNormal.z + tangentNormal.z * bitangent.z
    );
  }

  /**
   * Transforms a tangent-space normal from Z-axis projection to world space.
   * @private
   */
  private _transformNormalZ(tangentNormal: Vector3, surfaceNormal: Vector3): Vector3 {
    // For Z-axis projection, tangent points along X, bitangent along Y
    const tangent = new Vector3(1, 0, 0);
    const bitangent = new Vector3(0, 1, 0);

    return new Vector3(
      tangentNormal.x * tangent.x + tangentNormal.y * bitangent.x + tangentNormal.z * surfaceNormal.x,
      tangentNormal.x * tangent.y + tangentNormal.y * bitangent.y + tangentNormal.z * surfaceNormal.y,
      tangentNormal.x * tangent.z + tangentNormal.y * bitangent.z + tangentNormal.z * surfaceNormal.z
    );
  }

  /**
   * Sets the blend sharpness.
   *
   * @param sharpness - New sharpness value (1-10)
   */
  setBlendSharpness(sharpness: number): void {
    this._config.blendSharpness = Math.max(1, Math.min(10, sharpness));
  }

  /**
   * Sets the texture scale.
   *
   * @param scale - New scale
   */
  setScale(scale: Vector3): void {
    this._config.scale = scale.clone();
  }

  /**
   * Sets the texture offset.
   *
   * @param offset - New offset
   */
  setOffset(offset: Vector3): void {
    this._config.offset = offset.clone();
  }
}
