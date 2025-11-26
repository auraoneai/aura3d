/**
 * Morph target (blend shape) system for facial animation and deformations.
 * Manages multiple morph targets with weight-based blending.
 * @module animation/MorphTargets
 */

import { Vector3 } from '../math/Vector3';

/**
 * Single morph target containing delta positions and normals.
 *
 * @example
 * ```typescript
 * const morphTarget: MorphTarget = {
 *   name: 'smile',
 *   deltaPositions: [
 *     new Vector3(0, 0.1, 0),  // Vertex 0 moves up
 *     new Vector3(0, 0, 0),    // Vertex 1 doesn't move
 *     new Vector3(0, 0.05, 0)  // Vertex 2 moves slightly up
 *   ],
 *   deltaNormals: [
 *     new Vector3(0, 1, 0),
 *     new Vector3(0, 1, 0),
 *     new Vector3(0, 1, 0)
 *   ]
 * };
 * ```
 */
export interface MorphTarget {
  /** Morph target name */
  name: string;
  /** Position deltas (offsets from base mesh) */
  deltaPositions: Vector3[];
  /** Normal deltas (optional) */
  deltaNormals?: Vector3[];
}

/**
 * Configuration for creating morph target system.
 */
export interface MorphTargetsConfig {
  /** Number of vertices in base mesh */
  vertexCount: number;
  /** Morph targets */
  targets?: MorphTarget[];
  /** Maximum number of morph targets supported */
  maxTargets?: number;
}

/**
 * Morph target (blend shape) animation system.
 * Blends between base mesh and multiple target shapes using weights.
 *
 * @example
 * ```typescript
 * // Create morph target system
 * const morphTargets = new MorphTargets({
 *   vertexCount: 100,
 *   maxTargets: 8
 * });
 *
 * // Add morph targets
 * morphTargets.addTarget({
 *   name: 'smile',
 *   deltaPositions: smileDeltas
 * });
 *
 * morphTargets.addTarget({
 *   name: 'frown',
 *   deltaPositions: frownDeltas
 * });
 *
 * // Set weights
 * morphTargets.setWeight('smile', 0.8);
 * morphTargets.setWeight('frown', 0.0);
 *
 * // Apply morph targets to mesh
 * const morphedPositions = morphTargets.apply(basePositions);
 * mesh.updatePositions(morphedPositions);
 * ```
 */
export class MorphTargets {
  /**
   * Number of vertices in base mesh.
   */
  readonly vertexCount: number;

  /**
   * Maximum number of morph targets.
   */
  readonly maxTargets: number;

  /**
   * Morph targets.
   */
  private targets: MorphTarget[];

  /**
   * Morph target weights [0, 1].
   */
  private weights: Float32Array;

  /**
   * Morph target name to index map.
   */
  private targetMap: Map<string, number>;

  /**
   * Creates a new morph target system.
   *
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * const morphs = new MorphTargets({
   *   vertexCount: 500,
   *   maxTargets: 16
   * });
   * ```
   */
  constructor(config: MorphTargetsConfig) {
    this.vertexCount = config.vertexCount;
    this.maxTargets = config.maxTargets ?? 8;
    this.targets = [];
    this.weights = new Float32Array(this.maxTargets);
    this.targetMap = new Map();

    if (config.targets) {
      for (const target of config.targets) {
        this.addTarget(target);
      }
    }
  }

  /**
   * Adds a morph target.
   *
   * @param target - Morph target to add
   * @returns Index of added target, or -1 if max targets reached
   *
   * @example
   * ```typescript
   * const index = morphs.addTarget({
   *   name: 'blink',
   *   deltaPositions: blinkDeltas,
   *   deltaNormals: blinkNormalDeltas
   * });
   * ```
   */
  addTarget(target: MorphTarget): number {
    if (this.targets.length >= this.maxTargets) {
      console.warn(`Max morph targets (${this.maxTargets}) reached`);
      return -1;
    }

    if (target.deltaPositions.length !== this.vertexCount) {
      throw new Error(
        `Morph target ${target.name} has ${target.deltaPositions.length} vertices, expected ${this.vertexCount}`
      );
    }

    if (target.deltaNormals && target.deltaNormals.length !== this.vertexCount) {
      throw new Error(
        `Morph target ${target.name} has ${target.deltaNormals.length} normals, expected ${this.vertexCount}`
      );
    }

    const index = this.targets.length;
    this.targets.push(target);
    this.targetMap.set(target.name, index);

    return index;
  }

  /**
   * Removes a morph target by name.
   *
   * @param name - Target name
   * @returns True if target was removed
   *
   * @example
   * ```typescript
   * morphs.removeTarget('old_expression');
   * ```
   */
  removeTarget(name: string): boolean {
    const index = this.targetMap.get(name);
    if (index === undefined) {
      return false;
    }

    this.targets.splice(index, 1);
    this.targetMap.delete(name);

    // Rebuild target map indices
    this.targetMap.clear();
    for (let i = 0; i < this.targets.length; i++) {
      this.targetMap.set(this.targets[i].name, i);
    }

    return true;
  }

  /**
   * Gets a morph target by name.
   *
   * @param name - Target name
   * @returns Morph target or undefined if not found
   *
   * @example
   * ```typescript
   * const smile = morphs.getTarget('smile');
   * if (smile) {
   *   console.log(`Smile has ${smile.deltaPositions.length} vertices`);
   * }
   * ```
   */
  getTarget(name: string): MorphTarget | undefined {
    const index = this.targetMap.get(name);
    return index !== undefined ? this.targets[index] : undefined;
  }

  /**
   * Gets morph target index by name.
   *
   * @param name - Target name
   * @returns Target index or -1 if not found
   *
   * @example
   * ```typescript
   * const index = morphs.getTargetIndex('smile');
   * ```
   */
  getTargetIndex(name: string): number {
    return this.targetMap.get(name) ?? -1;
  }

  /**
   * Sets weight for a morph target.
   *
   * @param name - Target name
   * @param weight - Weight [0, 1]
   * @returns True if target was found
   *
   * @example
   * ```typescript
   * morphs.setWeight('smile', 0.8);
   * morphs.setWeight('frown', 0.0);
   * ```
   */
  setWeight(name: string, weight: number): boolean {
    const index = this.targetMap.get(name);
    if (index === undefined) {
      return false;
    }

    this.weights[index] = Math.max(0, Math.min(1, weight));
    return true;
  }

  /**
   * Gets weight for a morph target.
   *
   * @param name - Target name
   * @returns Weight [0, 1] or 0 if not found
   *
   * @example
   * ```typescript
   * const smileWeight = morphs.getWeight('smile');
   * ```
   */
  getWeight(name: string): number {
    const index = this.targetMap.get(name);
    return index !== undefined ? this.weights[index] : 0;
  }

  /**
   * Gets all weights as array.
   *
   * @returns Weight array
   *
   * @example
   * ```typescript
   * const weights = morphs.getWeights();
   * gl.uniform1fv(morphWeightsUniform, weights);
   * ```
   */
  getWeights(): Float32Array {
    return this.weights;
  }

  /**
   * Sets all weights at once.
   *
   * @param weights - Weight array
   *
   * @example
   * ```typescript
   * morphs.setWeights(new Float32Array([0.5, 0.3, 0.0, 0.0]));
   * ```
   */
  setWeights(weights: Float32Array | number[]): void {
    const count = Math.min(weights.length, this.weights.length);
    for (let i = 0; i < count; i++) {
      this.weights[i] = Math.max(0, Math.min(1, weights[i]));
    }
  }

  /**
   * Resets all weights to 0.
   *
   * @example
   * ```typescript
   * morphs.resetWeights();
   * ```
   */
  resetWeights(): void {
    this.weights.fill(0);
  }

  /**
   * Applies morph targets to base positions.
   * Returns new array with morphed positions.
   *
   * @param basePositions - Base mesh positions
   * @returns Morphed positions
   *
   * @example
   * ```typescript
   * const morphedPos = morphs.apply(basePositions);
   * mesh.updatePositions(morphedPos);
   * ```
   */
  apply(basePositions: Vector3[]): Vector3[] {
    if (basePositions.length !== this.vertexCount) {
      throw new Error(
        `Base positions has ${basePositions.length} vertices, expected ${this.vertexCount}`
      );
    }

    // Clone base positions
    const result = basePositions.map(p => p.clone());

    // Apply each morph target with its weight
    for (let t = 0; t < this.targets.length; t++) {
      const weight = this.weights[t];
      if (weight === 0) continue;

      const target = this.targets[t];

      for (let v = 0; v < this.vertexCount; v++) {
        const delta = target.deltaPositions[v];
        result[v].x += delta.x * weight;
        result[v].y += delta.y * weight;
        result[v].z += delta.z * weight;
      }
    }

    return result;
  }

  /**
   * Applies morph targets to base positions in place.
   * Modifies the input array directly (zero allocation).
   *
   * @param positions - Positions to morph (modified in place)
   *
   * @example
   * ```typescript
   * const positions = [...basePositions];
   * morphs.applyInPlace(positions);
   * mesh.updatePositions(positions);
   * ```
   */
  applyInPlace(positions: Vector3[]): void {
    if (positions.length !== this.vertexCount) {
      throw new Error(
        `Positions has ${positions.length} vertices, expected ${this.vertexCount}`
      );
    }

    // Apply each morph target with its weight
    for (let t = 0; t < this.targets.length; t++) {
      const weight = this.weights[t];
      if (weight === 0) continue;

      const target = this.targets[t];

      for (let v = 0; v < this.vertexCount; v++) {
        const delta = target.deltaPositions[v];
        positions[v].x += delta.x * weight;
        positions[v].y += delta.y * weight;
        positions[v].z += delta.z * weight;
      }
    }
  }

  /**
   * Applies morph targets to normals.
   * Returns new array with morphed normals.
   *
   * @param baseNormals - Base mesh normals
   * @returns Morphed normals (normalized)
   *
   * @example
   * ```typescript
   * const morphedNormals = morphs.applyNormals(baseNormals);
   * mesh.updateNormals(morphedNormals);
   * ```
   */
  applyNormals(baseNormals: Vector3[]): Vector3[] {
    if (baseNormals.length !== this.vertexCount) {
      throw new Error(
        `Base normals has ${baseNormals.length} vertices, expected ${this.vertexCount}`
      );
    }

    // Clone base normals
    const result = baseNormals.map(n => n.clone());

    // Apply each morph target with its weight
    for (let t = 0; t < this.targets.length; t++) {
      const weight = this.weights[t];
      if (weight === 0) continue;

      const target = this.targets[t];
      if (!target.deltaNormals) continue;

      for (let v = 0; v < this.vertexCount; v++) {
        const delta = target.deltaNormals[v];
        result[v].x += delta.x * weight;
        result[v].y += delta.y * weight;
        result[v].z += delta.z * weight;
      }
    }

    // Normalize results
    for (let v = 0; v < this.vertexCount; v++) {
      result[v].normalizeInPlace();
    }

    return result;
  }

  /**
   * Gets the number of morph targets.
   *
   * @returns Target count
   *
   * @example
   * ```typescript
   * console.log(`Mesh has ${morphs.targetCount} morph targets`);
   * ```
   */
  get targetCount(): number {
    return this.targets.length;
  }

  /**
   * Gets all target names.
   *
   * @returns Array of target names
   *
   * @example
   * ```typescript
   * const names = morphs.getTargetNames();
   * for (const name of names) {
   *   console.log(`Target: ${name}, weight: ${morphs.getWeight(name)}`);
   * }
   * ```
   */
  getTargetNames(): string[] {
    return this.targets.map(t => t.name);
  }

  /**
   * Clones this morph target system.
   *
   * @returns Cloned morph targets
   *
   * @example
   * ```typescript
   * const morphsCopy = morphs.clone();
   * ```
   */
  clone(): MorphTargets {
    const cloned = new MorphTargets({
      vertexCount: this.vertexCount,
      maxTargets: this.maxTargets
    });

    for (const target of this.targets) {
      cloned.addTarget({
        name: target.name,
        deltaPositions: target.deltaPositions.map(p => p.clone()),
        deltaNormals: target.deltaNormals?.map(n => n.clone())
      });
    }

    cloned.setWeights(this.weights);

    return cloned;
  }

  /**
   * Serializes morph targets to JSON.
   *
   * @returns JSON representation
   *
   * @example
   * ```typescript
   * const json = morphs.toJSON();
   * ```
   */
  toJSON(): any {
    const targets = this.targets.map(target => ({
      name: target.name,
      deltaPositions: target.deltaPositions.map(p => p.toArray()),
      deltaNormals: target.deltaNormals?.map(n => n.toArray())
    }));

    return {
      vertexCount: this.vertexCount,
      maxTargets: this.maxTargets,
      targets,
      weights: Array.from(this.weights.slice(0, this.targets.length))
    };
  }

  /**
   * Deserializes morph targets from JSON.
   *
   * @param json - JSON representation
   * @returns Deserialized morph targets
   *
   * @example
   * ```typescript
   * const morphs = MorphTargets.fromJSON(jsonData);
   * ```
   */
  static fromJSON(json: any): MorphTargets {
    const targets: MorphTarget[] = json.targets.map((targetData: any) => ({
      name: targetData.name,
      deltaPositions: targetData.deltaPositions.map((arr: number[]) =>
        new Vector3().fromArray(arr)
      ),
      deltaNormals: targetData.deltaNormals?.map((arr: number[]) =>
        new Vector3().fromArray(arr)
      )
    }));

    const morphTargets = new MorphTargets({
      vertexCount: json.vertexCount,
      maxTargets: json.maxTargets,
      targets
    });

    if (json.weights) {
      morphTargets.setWeights(json.weights);
    }

    return morphTargets;
  }
}
