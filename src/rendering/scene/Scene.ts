/**
 * Scene container managing the root of the scene graph hierarchy.
 * Provides entity lookup, serialization, and environment settings.
 * @module Scene
 */

import { SceneNode } from './SceneNode';
import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';

/**
 * Environment settings for the scene.
 */
export interface SceneEnvironment {
  /**
   * Ambient light color and intensity.
   */
  ambientColor: Color;

  /**
   * Ambient light intensity multiplier.
   */
  ambientIntensity: number;

  /**
   * Fog settings (null = no fog).
   */
  fog: {
    color: Color;
    near: number;
    far: number;
    density?: number; // For exponential fog
  } | null;

  /**
   * Skybox settings (null = no skybox).
   */
  skybox: {
    type: 'color' | 'cubemap' | 'procedural';
    color?: Color;
    texture?: string; // Path or ID
    rotation?: number;
  } | null;

  /**
   * Environment map for reflections (null = no env map).
   */
  environmentMap: {
    texture: string; // Path or ID
    intensity: number;
  } | null;

  /**
   * Global exposure for tone mapping.
   */
  exposure: number;

  /**
   * Background clear color.
   */
  clearColor: Color;
}

/**
 * Serialized scene data for save/load.
 */
export interface SerializedScene {
  version: string;
  name: string;
  environment: SceneEnvironment;
  nodes: SerializedSceneNode[];
  metadata: Record<string, any>;
}

/**
 * Serialized scene node data.
 */
export interface SerializedSceneNode {
  id: number;
  name: string;
  parentId: number | null;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion (x, y, z, w)
  scale: [number, number, number];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
  flags: number;
  layerMask: number;
  userData: Record<string, any>;
}

/**
 * Scene container managing the root of the scene graph and providing
 * entity lookup, serialization, and environment configuration.
 *
 * Features:
 * - Root node management
 * - Entity lookup by name and ID
 * - Scene serialization/deserialization
 * - Environment settings (ambient, fog, skybox)
 * - Metadata and user data
 * - Scene update propagation
 *
 * @example
 * ```typescript
 * // Create a scene
 * const scene = new Scene('MainScene');
 *
 * // Configure environment
 * scene.environment.ambientColor = new Color(0.2, 0.2, 0.3);
 * scene.environment.ambientIntensity = 0.5;
 * scene.environment.fog = {
 *   color: new Color(0.5, 0.6, 0.7),
 *   near: 10,
 *   far: 100
 * };
 *
 * // Add objects
 * const cube = new SceneNode('cube');
 * scene.root.addChild(cube);
 *
 * // Lookup by name
 * const found = scene.findByName('cube');
 *
 * // Update scene
 * scene.update(0.016);
 *
 * // Serialize
 * const data = scene.serialize();
 * const json = JSON.stringify(data);
 *
 * // Deserialize
 * const loaded = Scene.deserialize(JSON.parse(json));
 * ```
 */
export class Scene {
  /**
   * Scene name for identification.
   */
  name: string;

  /**
   * Root node of the scene graph.
   */
  readonly root: SceneNode;

  /**
   * Environment settings.
   */
  environment: SceneEnvironment;

  /**
   * Scene metadata for application-specific data.
   */
  metadata: Record<string, any>;

  /**
   * Fast lookup cache for nodes by ID.
   */
  private _nodeCache: Map<number, SceneNode>;

  /**
   * Fast lookup cache for nodes by name.
   */
  private _nameCache: Map<string, SceneNode[]>;

  /**
   * Whether caches need rebuilding.
   */
  private _cachesDirty: boolean = true;

  /**
   * Scene version for serialization compatibility.
   */
  private static readonly VERSION = '1.0.0';

  /**
   * Creates a new Scene instance.
   *
   * @param name - Scene name (default: 'Scene')
   *
   * @example
   * ```typescript
   * const scene = new Scene('MainScene');
   * const defaultScene = new Scene();
   * ```
   */
  constructor(name: string = 'Scene') {
    this.name = name;
    this.root = new SceneNode('__root__');
    this.metadata = {};
    this._nodeCache = new Map();
    this._nameCache = new Map();

    // Default environment
    this.environment = {
      ambientColor: new Color(0.1, 0.1, 0.1),
      ambientIntensity: 1.0,
      fog: null,
      skybox: null,
      environmentMap: null,
      exposure: 1.0,
      clearColor: new Color(0.0, 0.0, 0.0, 1.0),
    };

    // Set up root node change callback to invalidate caches
    this._setupCacheInvalidation(this.root);
  }

  /**
   * Adds a node to the scene root.
   *
   * @param node - Node to add
   * @returns This scene for chaining
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * const cube = new SceneNode('cube');
   * scene.add(cube);
   * ```
   */
  add(node: SceneNode): this {
    this.root.addChild(node);
    this._invalidateCaches();
    return this;
  }

  /**
   * Alias for add() - adds a node to the scene.
   *
   * @param node - Node to add
   * @returns This scene for chaining
   */
  addNode(node: SceneNode): this {
    return this.add(node);
  }

  /**
   * Removes a node from the scene.
   *
   * @param node - Node to remove
   * @returns This scene for chaining
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * const cube = new SceneNode('cube');
   * scene.add(cube);
   * scene.remove(cube);
   * ```
   */
  remove(node: SceneNode): this {
    node.removeFromParent();
    this._invalidateCaches();
    return this;
  }

  /**
   * Finds a node by name (returns first match).
   * Uses cached lookup for performance.
   *
   * @param name - Node name to search for
   * @returns Found node or null
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * const cube = new SceneNode('cube');
   * scene.add(cube);
   * const found = scene.findByName('cube');
   * console.log(found === cube); // true
   * ```
   */
  findByName(name: string): SceneNode | null {
    this._rebuildCachesIfNeeded();
    const nodes = this._nameCache.get(name);
    return nodes && nodes.length > 0 ? nodes[0] : null;
  }

  /**
   * Finds all nodes with a given name.
   * Uses cached lookup for performance.
   *
   * @param name - Node name to search for
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * scene.add(new SceneNode('cube'));
   * scene.add(new SceneNode('cube'));
   * const cubes = scene.findAllByName('cube');
   * console.log(cubes.length); // 2
   * ```
   */
  findAllByName(name: string): SceneNode[] {
    this._rebuildCachesIfNeeded();
    return this._nameCache.get(name) || [];
  }

  /**
   * Finds a node by ID.
   * Uses cached lookup for performance (O(1)).
   *
   * @param id - Node ID to search for
   * @returns Found node or null
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * const cube = new SceneNode('cube');
   * scene.add(cube);
   * const found = scene.findById(cube.id);
   * console.log(found === cube); // true
   * ```
   */
  findById(id: number): SceneNode | null {
    this._rebuildCachesIfNeeded();
    return this._nodeCache.get(id) || null;
  }

  /**
   * Finds all nodes matching a predicate.
   *
   * @param predicate - Function to test each node
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * // Find all visible nodes
   * const visible = scene.findAll(node => node.isVisible);
   *
   * // Find all nodes with specific component
   * const withRenderer = scene.findAll(node => node.hasComponent('renderer'));
   * ```
   */
  findAll(predicate: (node: SceneNode) => boolean): SceneNode[] {
    return this.root.findAll(predicate, false); // Exclude root
  }

  /**
   * Gets all nodes in the scene (excluding root).
   *
   * @returns Array of all nodes
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * scene.add(new SceneNode('a'));
   * scene.add(new SceneNode('b'));
   * console.log(scene.getAllNodes().length); // 2
   * ```
   */
  getAllNodes(): SceneNode[] {
    const nodes: SceneNode[] = [];
    this.root.traverse((node) => nodes.push(node), false);
    return nodes;
  }

  /**
   * Gets the total number of nodes in the scene (excluding root).
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * scene.add(new SceneNode('a'));
   * const parent = new SceneNode('parent');
   * parent.addChild(new SceneNode('child'));
   * scene.add(parent);
   * console.log(scene.nodeCount); // 3
   * ```
   */
  get nodeCount(): number {
    let count = 0;
    this.root.traverse(() => count++, false);
    return count;
  }

  /**
   * Updates all nodes in the scene.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * // Add nodes with components...
   * scene.update(0.016); // Update at ~60fps
   * ```
   */
  update(deltaTime: number): void {
    this.root.updateRecursive(deltaTime);
  }

  /**
   * Traverses all nodes in the scene (excluding root).
   *
   * @param callback - Function called for each node
   *
   * @example
   * ```typescript
   * scene.traverse((node) => {
   *   console.log(node.name, node.worldPosition);
   * });
   * ```
   */
  traverse(callback: (node: SceneNode) => void): void {
    this.root.traverse(callback, false);
  }

  /**
   * Clears the scene by removing all children from root.
   *
   * @example
   * ```typescript
   * const scene = new Scene();
   * scene.add(new SceneNode('a'));
   * scene.add(new SceneNode('b'));
   * scene.clear();
   * console.log(scene.nodeCount); // 0
   * ```
   */
  clear(): void {
    const children = [...this.root.children];
    for (const child of children) {
      this.root.removeChild(child);
    }
    this._invalidateCaches();
  }

  /**
   * Serializes the scene to a JSON-compatible object.
   *
   * @returns Serialized scene data
   *
   * @example
   * ```typescript
   * const scene = new Scene('MainScene');
   * // Add nodes...
   * const data = scene.serialize();
   * const json = JSON.stringify(data, null, 2);
   * ```
   */
  serialize(): SerializedScene {
    const nodes: SerializedSceneNode[] = [];

    this.traverse((node) => {
      const pos = node.transform.position;
      const rot = node.transform.rotation;
      const scale = node.transform.scale;
      const bounds = node.localBounds;

      nodes.push({
        id: node.id,
        name: node.name,
        parentId: node.parent ? node.parent.id : null,
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z, rot.w],
        scale: [scale.x, scale.y, scale.z],
        bounds: bounds.isEmpty ? null : {
          min: [bounds.min.x, bounds.min.y, bounds.min.z],
          max: [bounds.max.x, bounds.max.y, bounds.max.z],
        },
        flags: node.flags,
        layerMask: node.layerMask,
        userData: node.userData,
      });
    });

    return {
      version: Scene.VERSION,
      name: this.name,
      environment: this._serializeEnvironment(),
      nodes,
      metadata: this.metadata,
    };
  }

  /**
   * Deserializes a scene from a JSON-compatible object.
   *
   * @param data - Serialized scene data
   * @returns Deserialized scene
   *
   * @example
   * ```typescript
   * const json = '{ ... }'; // Scene JSON
   * const data = JSON.parse(json);
   * const scene = Scene.deserialize(data);
   * ```
   */
  static deserialize(data: SerializedScene): Scene {
    // Version check
    if (data.version !== Scene.VERSION) {
      console.warn(`Scene version mismatch: expected ${Scene.VERSION}, got ${data.version}`);
    }

    const scene = new Scene(data.name);
    scene.metadata = { ...data.metadata };
    scene.environment = Scene._deserializeEnvironment(data.environment);

    // Create nodes first (to maintain ID references)
    const nodeMap = new Map<number, SceneNode>();
    for (const nodeData of data.nodes) {
      const node = new SceneNode(nodeData.name);

      // Restore transform
      node.transform.position.set(
        nodeData.position[0],
        nodeData.position[1],
        nodeData.position[2]
      );
      node.transform.rotation.set(
        nodeData.rotation[0],
        nodeData.rotation[1],
        nodeData.rotation[2],
        nodeData.rotation[3]
      );
      node.transform.scale.set(
        nodeData.scale[0],
        nodeData.scale[1],
        nodeData.scale[2]
      );

      // Restore bounds
      if (nodeData.bounds) {
        node.setBounds(new Box3(
          new Vector3(
            nodeData.bounds.min[0],
            nodeData.bounds.min[1],
            nodeData.bounds.min[2]
          ),
          new Vector3(
            nodeData.bounds.max[0],
            nodeData.bounds.max[1],
            nodeData.bounds.max[2]
          )
        ));
      }

      // Restore properties
      node.flags = nodeData.flags;
      node.layerMask = nodeData.layerMask;
      node.userData = { ...nodeData.userData };

      nodeMap.set(nodeData.id, node);
    }

    // Build hierarchy
    for (const nodeData of data.nodes) {
      const node = nodeMap.get(nodeData.id)!;
      if (nodeData.parentId === null) {
        // Top-level node
        scene.root.addChild(node);
      } else {
        const parent = nodeMap.get(nodeData.parentId);
        if (parent) {
          parent.addChild(node);
        } else {
          console.warn(`Scene deserialization: Parent node ${nodeData.parentId} not found for ${node.name}`);
          scene.root.addChild(node);
        }
      }
    }

    return scene;
  }

  /**
   * Creates a deep copy of this scene.
   *
   * @param name - Name for cloned scene (default: original name + ' (Clone)')
   * @returns Cloned scene
   *
   * @example
   * ```typescript
   * const scene = new Scene('Original');
   * // Add nodes...
   * const clone = scene.clone('Clone');
   * ```
   */
  clone(name?: string): Scene {
    const cloned = new Scene(name || `${this.name} (Clone)`);
    cloned.environment = this._serializeEnvironment();
    cloned.metadata = { ...this.metadata };

    // Clone all nodes
    for (const child of this.root.children) {
      cloned.root.addChild(child.cloneRecursive());
    }

    return cloned;
  }

  /**
   * Serializes environment settings.
   */
  private _serializeEnvironment(): SceneEnvironment {
    return {
      ambientColor: this.environment.ambientColor.clone(),
      ambientIntensity: this.environment.ambientIntensity,
      fog: this.environment.fog ? { ...this.environment.fog } : null,
      skybox: this.environment.skybox ? { ...this.environment.skybox } : null,
      environmentMap: this.environment.environmentMap ? { ...this.environment.environmentMap } : null,
      exposure: this.environment.exposure,
      clearColor: this.environment.clearColor.clone(),
    };
  }

  /**
   * Deserializes environment settings.
   */
  private static _deserializeEnvironment(data: SceneEnvironment): SceneEnvironment {
    return {
      ambientColor: new Color(
        data.ambientColor.r,
        data.ambientColor.g,
        data.ambientColor.b,
        data.ambientColor.a
      ),
      ambientIntensity: data.ambientIntensity,
      fog: data.fog ? { ...data.fog } : null,
      skybox: data.skybox ? { ...data.skybox } : null,
      environmentMap: data.environmentMap ? { ...data.environmentMap } : null,
      exposure: data.exposure,
      clearColor: new Color(
        data.clearColor.r,
        data.clearColor.g,
        data.clearColor.b,
        data.clearColor.a
      ),
    };
  }

  /**
   * Rebuilds lookup caches if they are dirty.
   */
  private _rebuildCachesIfNeeded(): void {
    if (!this._cachesDirty) {
      return;
    }

    this._nodeCache.clear();
    this._nameCache.clear();

    this.traverse((node) => {
      // ID cache
      this._nodeCache.set(node.id, node);

      // Name cache (multiple nodes can have same name)
      const existing = this._nameCache.get(node.name);
      if (existing) {
        existing.push(node);
      } else {
        this._nameCache.set(node.name, [node]);
      }
    });

    this._cachesDirty = false;
  }

  /**
   * Invalidates lookup caches.
   */
  private _invalidateCaches(): void {
    this._cachesDirty = true;
  }

  /**
   * Sets up cache invalidation when nodes are added/removed.
   */
  private _setupCacheInvalidation(node: SceneNode): void {
    // This is a simplified approach - in a real implementation,
    // you'd want to hook into node add/remove operations more directly
    const originalAddChild = node.addChild.bind(node);
    const originalRemoveChild = node.removeChild.bind(node);

    node.addChild = (child: SceneNode) => {
      const result = originalAddChild(child);
      this._invalidateCaches();
      this._setupCacheInvalidation(child);
      return result;
    };

    node.removeChild = (child: SceneNode) => {
      const result = originalRemoveChild(child);
      this._invalidateCaches();
      return result;
    };
  }

  /**
   * Returns a string representation of this scene.
   */
  toString(): string {
    return `Scene(name="${this.name}", nodes=${this.nodeCount})`;
  }
}

// Re-export Box3 for convenience
import { Box3 } from '../../math/Box3';
export { Box3 };
