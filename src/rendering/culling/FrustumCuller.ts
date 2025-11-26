/**
 * Frustum culling system for visibility determination.
 * Tests objects against view frustum to eliminate non-visible objects.
 * Supports hierarchical culling and provides detailed statistics.
 * @module FrustumCuller
 */

import { Frustum } from '../../math/Frustum';
import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Matrix4 } from '../../math/Matrix4';
import { SceneNode, SceneNodeFlags } from '../scene/SceneNode';

/**
 * Culling test mode.
 */
export enum CullingMode {
  /**
   * Test against bounding box (more accurate).
   */
  Box = 'box',

  /**
   * Test against bounding sphere (faster but less accurate).
   */
  Sphere = 'sphere',

  /**
   * Test both box and sphere (most accurate, slower).
   */
  Both = 'both',
}

/**
 * Culling result for an object.
 */
export enum CullingResult {
  /**
   * Object is fully visible.
   */
  Visible = 'visible',

  /**
   * Object is partially visible (intersects frustum).
   */
  Partial = 'partial',

  /**
   * Object is not visible (outside frustum).
   */
  Culled = 'culled',
}

/**
 * Statistics for culling performance monitoring.
 */
export interface CullingStats {
  /**
   * Total objects tested.
   */
  totalObjects: number;

  /**
   * Objects determined to be visible.
   */
  visibleObjects: number;

  /**
   * Objects culled (not visible).
   */
  culledObjects: number;

  /**
   * Objects skipped due to hierarchical culling.
   */
  hierarchyCulled: number;

  /**
   * Number of box tests performed.
   */
  boxTests: number;

  /**
   * Number of sphere tests performed.
   */
  sphereTests: number;

  /**
   * Time taken for culling (milliseconds).
   */
  cullTime: number;
}

/**
 * Frustum culling system for determining object visibility.
 *
 * The frustum culler tests objects against the view frustum to determine
 * which objects are visible and should be rendered. It supports hierarchical
 * culling where invisible parent nodes skip testing of all children.
 *
 * Features:
 * - AABB and sphere frustum tests
 * - Hierarchical culling (stop at invisible parent)
 * - Layer mask filtering
 * - Occlusion culling integration hooks
 * - Detailed performance statistics
 *
 * @example
 * ```typescript
 * // Create culler
 * const culler = new FrustumCuller();
 *
 * // Set culling mode
 * culler.mode = CullingMode.Box;
 *
 * // Cull scene
 * const view = Matrix4.lookAt(...);
 * const projection = Matrix4.perspective(...);
 * const visible = culler.cull(sceneRoot, view, projection);
 *
 * // Get statistics
 * const stats = culler.getStats();
 * console.log(`Visible: ${stats.visibleObjects}/${stats.totalObjects}`);
 * console.log(`Culled: ${stats.culledObjects} objects`);
 * console.log(`Time: ${stats.cullTime.toFixed(2)}ms`);
 *
 * // Cull with layer mask
 * culler.layerMask = 0x00000001; // Only layer 0
 * const visibleLayer0 = culler.cull(sceneRoot, view, projection);
 * ```
 */
export class FrustumCuller {
  /**
   * Culling test mode.
   */
  mode: CullingMode = CullingMode.Box;

  /**
   * Layer mask for filtering objects (0xFFFFFFFF = all layers).
   */
  layerMask: number = 0xFFFFFFFF;

  /**
   * Whether to use hierarchical culling (skip children of culled parents).
   */
  hierarchicalCulling: boolean = true;

  /**
   * Current view frustum.
   */
  private _frustum: Frustum = new Frustum();

  /**
   * Statistics for the last cull operation.
   */
  private _stats: CullingStats;

  /**
   * Optional occlusion culler for additional visibility tests.
   */
  private _occlusionCuller: any | null = null;

  /**
   * Creates a new FrustumCuller instance.
   *
   * @example
   * ```typescript
   * const culler = new FrustumCuller();
   * ```
   */
  constructor() {
    this._stats = this._createEmptyStats();
  }

  /**
   * Culls a scene node hierarchy against the view frustum.
   *
   * @param root - Root scene node to cull
   * @param viewMatrix - View matrix (world-to-camera)
   * @param projectionMatrix - Projection matrix (camera-to-clip)
   * @returns Array of visible nodes
   *
   * @example
   * ```typescript
   * const view = Matrix4.lookAt(
   *   new Vector3(0, 5, 10),
   *   new Vector3(0, 0, 0),
   *   new Vector3(0, 1, 0)
   * );
   * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
   * const visible = culler.cull(sceneRoot, view, projection);
   * ```
   */
  cull(root: SceneNode, viewMatrix: Matrix4, projectionMatrix: Matrix4): SceneNode[] {
    const startTime = performance.now();

    // Reset statistics
    this._stats = this._createEmptyStats();

    // Update frustum
    this._frustum.setFromViewProjectionMatrix(viewMatrix, projectionMatrix);

    // Cull hierarchy
    const visible: SceneNode[] = [];
    this._cullNode(root, visible);

    // Record time
    this._stats.cullTime = performance.now() - startTime;

    return visible;
  }

  /**
   * Culls a scene node hierarchy against a pre-computed frustum.
   *
   * @param root - Root scene node to cull
   * @param frustum - Pre-computed frustum
   * @returns Array of visible nodes
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const visible = culler.cullWithFrustum(sceneRoot, frustum);
   * ```
   */
  cullWithFrustum(root: SceneNode, frustum: Frustum): SceneNode[] {
    const startTime = performance.now();

    // Reset statistics
    this._stats = this._createEmptyStats();

    // Use provided frustum
    this._frustum = frustum;

    // Cull hierarchy
    const visible: SceneNode[] = [];
    this._cullNode(root, visible);

    // Record time
    this._stats.cullTime = performance.now() - startTime;

    return visible;
  }

  /**
   * Tests a single bounding box against the current frustum.
   *
   * @param bounds - Bounding box to test
   * @returns Culling result
   *
   * @example
   * ```typescript
   * const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
   * const result = culler.testBox(bounds);
   * if (result === CullingResult.Visible) {
   *   // Box is visible
   * }
   * ```
   */
  testBox(bounds: Box3): CullingResult {
    this._stats.boxTests++;

    if (bounds.isEmpty) {
      return CullingResult.Culled;
    }

    const intersects = this._frustum.intersectsBox(bounds);
    return intersects ? CullingResult.Visible : CullingResult.Culled;
  }

  /**
   * Tests a single bounding sphere against the current frustum.
   *
   * @param sphere - Bounding sphere to test
   * @returns Culling result
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * const result = culler.testSphere(sphere);
   * ```
   */
  testSphere(sphere: Sphere): CullingResult {
    this._stats.sphereTests++;

    if (sphere.isEmpty) {
      return CullingResult.Culled;
    }

    const intersects = this._frustum.intersectsSphere(sphere);
    return intersects ? CullingResult.Visible : CullingResult.Culled;
  }

  /**
   * Sets an occlusion culler for additional visibility tests.
   *
   * @param occlusionCuller - Occlusion culler instance
   *
   * @example
   * ```typescript
   * const occlusionCuller = new OcclusionCuller(...);
   * culler.setOcclusionCuller(occlusionCuller);
   * ```
   */
  setOcclusionCuller(occlusionCuller: any): void {
    this._occlusionCuller = occlusionCuller;
  }

  /**
   * Gets the current frustum.
   */
  get frustum(): Frustum {
    return this._frustum;
  }

  /**
   * Gets statistics from the last cull operation.
   *
   * @returns Culling statistics
   *
   * @example
   * ```typescript
   * const stats = culler.getStats();
   * console.log(`Culled ${stats.culledObjects} objects in ${stats.cullTime.toFixed(2)}ms`);
   * ```
   */
  getStats(): CullingStats {
    return { ...this._stats };
  }

  /**
   * Resets statistics counters.
   */
  resetStats(): void {
    this._stats = this._createEmptyStats();
  }

  /**
   * Culls a node and its children recursively.
   */
  private _cullNode(node: SceneNode, visible: SceneNode[]): void {
    this._stats.totalObjects++;

    // Check if node is disabled
    if (!node.isVisible) {
      this._stats.hierarchyCulled++;
      node.setFlag(SceneNodeFlags.Culled, true);
      return;
    }

    // Check layer mask
    if ((node.layerMask & this.layerMask) === 0) {
      this._stats.hierarchyCulled++;
      node.setFlag(SceneNodeFlags.Culled, true);
      return;
    }

    // Test node bounds against frustum
    const result = this._testNodeBounds(node);

    if (result === CullingResult.Culled) {
      // Node is culled
      this._stats.culledObjects++;
      node.setFlag(SceneNodeFlags.Culled, true);

      // Skip children if hierarchical culling is enabled
      if (this.hierarchicalCulling) {
        this._markChildrenCulled(node);
      } else {
        // Still test children
        for (const child of node.children) {
          this._cullNode(child, visible);
        }
      }
    } else {
      // Node is visible
      this._stats.visibleObjects++;
      node.setFlag(SceneNodeFlags.Culled, false);
      visible.push(node);

      // Test children
      for (const child of node.children) {
        this._cullNode(child, visible);
      }

      // Optional: Test with occlusion culler
      if (this._occlusionCuller && this._occlusionCuller.isOccluded) {
        if (this._occlusionCuller.isOccluded(node.worldBounds)) {
          // Node is occluded
          this._stats.visibleObjects--;
          this._stats.culledObjects++;
          node.setFlag(SceneNodeFlags.Culled, true);
          visible.pop(); // Remove from visible list
        }
      }
    }
  }

  /**
   * Tests node bounds against frustum using the current mode.
   */
  private _testNodeBounds(node: SceneNode): CullingResult {
    const worldBounds = node.worldBounds;
    const boundingSphere = node.boundingSphere;

    // Empty bounds are always culled
    if (worldBounds.isEmpty) {
      return CullingResult.Culled;
    }

    switch (this.mode) {
      case CullingMode.Box:
        return this.testBox(worldBounds);

      case CullingMode.Sphere:
        return this.testSphere(boundingSphere);

      case CullingMode.Both:
        // Test sphere first (faster)
        const sphereResult = this.testSphere(boundingSphere);
        if (sphereResult === CullingResult.Culled) {
          return CullingResult.Culled;
        }
        // If sphere is visible, test box for more accuracy
        return this.testBox(worldBounds);

      default:
        return this.testBox(worldBounds);
    }
  }

  /**
   * Marks all children as culled (hierarchical culling optimization).
   */
  private _markChildrenCulled(node: SceneNode): void {
    for (const child of node.children) {
      child.setFlag(SceneNodeFlags.Culled, true);
      this._stats.hierarchyCulled++;
      this._markChildrenCulled(child);
    }
  }

  /**
   * Creates empty statistics object.
   */
  private _createEmptyStats(): CullingStats {
    return {
      totalObjects: 0,
      visibleObjects: 0,
      culledObjects: 0,
      hierarchyCulled: 0,
      boxTests: 0,
      sphereTests: 0,
      cullTime: 0,
    };
  }
}
