/**
 * Hierarchical scene node for the G3D 5.0 scene graph system.
 * Provides transform hierarchy, bounding volumes, and component attachment.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module SceneNode
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';
import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Transform } from '../../math/Transform';

/**
 * Interface for components that can be attached to scene nodes.
 */
export interface ISceneComponent {
  /**
   * Called when the component is added to a node.
   */
  onAttach?(node: SceneNode): void;

  /**
   * Called when the component is removed from a node.
   */
  onDetach?(node: SceneNode): void;

  /**
   * Called every frame to update the component.
   */
  update?(deltaTime: number): void;
}

/**
 * Flags for scene node behavior and rendering.
 */
export enum SceneNodeFlags {
  None = 0,
  Visible = 1 << 0,        // Node is visible and should be rendered
  Static = 1 << 1,         // Node is static (won't move, allows optimization)
  CastShadows = 1 << 2,    // Node casts shadows
  ReceiveShadows = 1 << 3, // Node receives shadows
  Pickable = 1 << 4,       // Node can be picked by raycasting
  Culled = 1 << 5,         // Node is currently culled (set by culling system)
  DirtyTransform = 1 << 6, // Transform needs update
  DirtyBounds = 1 << 7,    // Bounding volumes need update
}

/**
 * Hierarchical scene node representing objects in the 3D scene.
 * Manages transform hierarchy, bounding volumes, visibility, and component attachment.
 *
 * Features:
 * - Parent-child transform hierarchy
 * - Local and world transform management with lazy updates
 * - Axis-aligned bounding boxes (AABB) and bounding spheres
 * - Visibility and culling flags
 * - Component system for extensibility
 * - User data attachment
 *
 * @example
 * ```typescript
 * // Create a scene hierarchy
 * const root = new SceneNode('root');
 * const child = new SceneNode('child');
 * root.addChild(child);
 *
 * // Set local transform
 * child.transform.position.set(1, 2, 3);
 * child.transform.rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
 * child.transform.scale.set(2, 2, 2);
 *
 * // Access world transform
 * const worldPos = child.worldPosition;
 * const worldMatrix = child.worldMatrix;
 *
 * // Set bounding box (for culling)
 * child.setBounds(
 *   new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))
 * );
 *
 * // Configure rendering flags
 * child.setFlag(SceneNodeFlags.Visible, true);
 * child.setFlag(SceneNodeFlags.CastShadows, true);
 *
 * // Attach component
 * const component = { update: (dt) => console.log('Update', dt) };
 * child.addComponent('updater', component);
 *
 * // Traverse hierarchy
 * root.traverse((node) => {
 *   console.log(node.name, node.worldPosition);
 * });
 * ```
 */
export class SceneNode {
  /**
   * Unique identifier for this node.
   */
  readonly id: number;

  /**
   * Human-readable name for debugging and lookup.
   */
  name: string;

  /**
   * Local transform relative to parent.
   */
  readonly transform: Transform;

  /**
   * Parent node in the hierarchy (null for root nodes).
   */
  private _parent: SceneNode | null = null;

  /**
   * Child nodes in the hierarchy.
   */
  private _children: SceneNode[] = [];

  /**
   * Local axis-aligned bounding box.
   */
  private _localBounds: Box3;

  /**
   * World-space axis-aligned bounding box (cached).
   */
  private _worldBounds: Box3;

  /**
   * World-space bounding sphere (cached).
   */
  private _boundingSphere: Sphere;

  /**
   * Bit flags for node behavior and state.
   */
  private _flags: number;

  /**
   * Components attached to this node.
   */
  private _components: Map<string, ISceneComponent>;

  /**
   * User data for application-specific information.
   */
  userData: Record<string, any>;

  /**
   * Layer mask for selective rendering (default: all layers).
   */
  layerMask: number = 0xFFFFFFFF;

  /**
   * Static counter for generating unique IDs.
   */
  private static _nextId: number = 1;

  /**
   * Creates a new SceneNode instance.
   *
   * @param name - Node name for debugging (default: 'SceneNode')
   *
   * @example
   * ```typescript
   * const node = new SceneNode('MyObject');
   * const rootNode = new SceneNode();
   * ```
   */
  constructor(name: string = 'SceneNode') {
    this.id = SceneNode._nextId++;
    this.name = name;
    this.transform = new Transform();
    this._localBounds = Box3.empty();
    this._worldBounds = Box3.empty();
    this._boundingSphere = Sphere.empty();
    this._flags = SceneNodeFlags.Visible | SceneNodeFlags.CastShadows | SceneNodeFlags.ReceiveShadows | SceneNodeFlags.Pickable;
    this._components = new Map();
    this.userData = {};

    // Set up transform change callback
    this.transform.onChange = () => {
      this._markTransformDirty();
    };
  }

  /**
   * Gets the parent node.
   */
  get parent(): SceneNode | null {
    return this._parent;
  }

  /**
   * Gets the readonly array of child nodes.
   */
  get children(): readonly SceneNode[] {
    return this._children;
  }

  /**
   * Gets the local bounding box.
   */
  get localBounds(): Box3 {
    return this._localBounds;
  }

  /**
   * Gets the world-space bounding box (automatically updated if dirty).
   */
  get worldBounds(): Box3 {
    if (this.hasFlag(SceneNodeFlags.DirtyBounds)) {
      this._updateWorldBounds();
    }
    return this._worldBounds;
  }

  /**
   * Gets the world-space bounding sphere (automatically updated if dirty).
   */
  get boundingSphere(): Sphere {
    if (this.hasFlag(SceneNodeFlags.DirtyBounds)) {
      this._updateWorldBounds();
    }
    return this._boundingSphere;
  }

  /**
   * Gets the world position of this node.
   */
  get worldPosition(): Vector3 {
    return this.transform.worldPosition;
  }

  /**
   * Sets the world position of this node.
   */
  set worldPosition(position: Vector3) {
    this.transform.worldPosition = position;
  }

  /**
   * Gets the world rotation of this node.
   */
  get worldRotation(): Quaternion {
    return this.transform.worldRotation;
  }

  /**
   * Sets the world rotation of this node.
   */
  set worldRotation(rotation: Quaternion) {
    this.transform.worldRotation = rotation;
  }

  /**
   * Gets the world scale of this node.
   */
  get worldScale(): Vector3 {
    return this.transform.worldScale;
  }

  /**
   * Gets the world transformation matrix.
   */
  get worldMatrix(): Matrix4 {
    return this.transform.worldMatrix;
  }

  /**
   * Gets the local transformation matrix.
   */
  get localMatrix(): Matrix4 {
    return this.transform.localMatrix;
  }

  /**
   * Adds a child node to this node.
   * Removes the child from its previous parent if it has one.
   *
   * @param child - Node to add as child
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const parent = new SceneNode('parent');
   * const child = new SceneNode('child');
   * parent.addChild(child);
   * console.log(child.parent === parent); // true
   * ```
   */
  addChild(child: SceneNode): this {
    if (child === this) {
      console.warn('SceneNode: Cannot add self as child');
      return this;
    }

    if (this._isAncestor(child)) {
      console.warn('SceneNode: Cannot add ancestor as child (would create cycle)');
      return this;
    }

    // Remove from previous parent
    if (child._parent) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    this._children.push(child);
    child.transform.setParent(this.transform);
    child._markTransformDirty();

    return this;
  }

  /**
   * Removes a child node from this node.
   *
   * @param child - Node to remove
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const parent = new SceneNode('parent');
   * const child = new SceneNode('child');
   * parent.addChild(child);
   * parent.removeChild(child);
   * console.log(child.parent); // null
   * ```
   */
  removeChild(child: SceneNode): this {
    const index = this._children.indexOf(child);
    if (index !== -1) {
      this._children.splice(index, 1);
      child._parent = null;
      child.transform.setParent(null);
      child._markTransformDirty();
    }
    return this;
  }

  /**
   * Removes this node from its parent.
   *
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const parent = new SceneNode('parent');
   * const child = new SceneNode('child');
   * parent.addChild(child);
   * child.removeFromParent();
   * console.log(child.parent); // null
   * ```
   */
  removeFromParent(): this {
    if (this._parent) {
      this._parent.removeChild(this);
    }
    return this;
  }

  /**
   * Sets the local bounding box for this node.
   * Used for frustum culling and spatial queries.
   *
   * @param bounds - Local bounding box
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const node = new SceneNode('cube');
   * node.setBounds(
   *   new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))
   * );
   * ```
   */
  setBounds(bounds: Box3): this {
    this._localBounds.copy(bounds);
    this._markBoundsDirty();
    return this;
  }

  /**
   * Sets the local bounding box from a center and size.
   *
   * @param center - Center point of the bounding box
   * @param size - Size (dimensions) of the bounding box
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const node = new SceneNode('cube');
   * node.setBoundsFromCenterAndSize(
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 2, 2)
   * );
   * ```
   */
  setBoundsFromCenterAndSize(center: Vector3, size: Vector3): this {
    this._localBounds.setFromCenterAndSize(center, size);
    this._markBoundsDirty();
    return this;
  }

  /**
   * Expands the local bounding box to include all children's bounds.
   *
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const parent = new SceneNode('parent');
   * const child1 = new SceneNode('child1');
   * child1.setBounds(new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1)));
   * parent.addChild(child1);
   * parent.expandBoundsToChildren(); // Parent bounds now include child
   * ```
   */
  expandBoundsToChildren(): this {
    if (this._children.length === 0) {
      return this;
    }

    let bounds = Box3.empty();
    for (const child of this._children) {
      if (!child.localBounds.isEmpty) {
        const childWorldBounds = child.worldBounds;
        if (bounds.isEmpty) {
          bounds.copy(childWorldBounds);
        } else {
          bounds = bounds.union(childWorldBounds);
        }
      }
    }

    // Convert world bounds back to local space
    if (!bounds.isEmpty) {
      const invWorldMatrix = this.worldMatrix.invert();
      if (invWorldMatrix) {
        this._localBounds = bounds.applyMatrix4(invWorldMatrix);
        this._markBoundsDirty();
      }
    }

    return this;
  }

  /**
   * Checks if a flag is set.
   *
   * @param flag - Flag to check
   * @returns True if the flag is set
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * const isVisible = node.hasFlag(SceneNodeFlags.Visible);
   * ```
   */
  hasFlag(flag: SceneNodeFlags): boolean {
    return (this._flags & flag) !== 0;
  }

  /**
   * Sets or clears a flag.
   *
   * @param flag - Flag to set
   * @param value - True to set, false to clear
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * node.setFlag(SceneNodeFlags.Visible, false); // Hide node
   * node.setFlag(SceneNodeFlags.Static, true);   // Mark as static
   * ```
   */
  setFlag(flag: SceneNodeFlags, value: boolean): this {
    if (value) {
      this._flags |= flag;
    } else {
      this._flags &= ~flag;
    }
    return this;
  }

  /**
   * Gets all flags.
   */
  get flags(): number {
    return this._flags;
  }

  /**
   * Sets all flags at once.
   */
  set flags(flags: number) {
    this._flags = flags;
  }

  /**
   * Checks if this node is visible (not hidden by visibility flag or parent).
   *
   * @returns True if visible
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * console.log(node.isVisible); // true
   * node.setFlag(SceneNodeFlags.Visible, false);
   * console.log(node.isVisible); // false
   * ```
   */
  get isVisible(): boolean {
    if (!this.hasFlag(SceneNodeFlags.Visible)) {
      return false;
    }
    if (this._parent) {
      return this._parent.isVisible;
    }
    return true;
  }

  /**
   * Checks if this node is currently culled.
   */
  get isCulled(): boolean {
    return this.hasFlag(SceneNodeFlags.Culled);
  }

  /**
   * Checks if this node is static (doesn't move).
   */
  get isStatic(): boolean {
    return this.hasFlag(SceneNodeFlags.Static);
  }

  /**
   * Adds a component to this node.
   *
   * @param key - Component identifier
   * @param component - Component to add
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * const component = {
   *   onAttach: (node) => console.log('Attached to', node.name),
   *   update: (dt) => console.log('Update', dt)
   * };
   * node.addComponent('myComponent', component);
   * ```
   */
  addComponent(key: string, component: ISceneComponent): this {
    if (this._components.has(key)) {
      console.warn(`SceneNode: Component '${key}' already exists, replacing`);
      this.removeComponent(key);
    }
    this._components.set(key, component);
    if (component.onAttach) {
      component.onAttach(this);
    }
    return this;
  }

  /**
   * Removes a component from this node.
   *
   * @param key - Component identifier
   * @returns True if component was removed
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * node.addComponent('myComponent', { update: (dt) => {} });
   * node.removeComponent('myComponent');
   * ```
   */
  removeComponent(key: string): boolean {
    const component = this._components.get(key);
    if (component) {
      if (component.onDetach) {
        component.onDetach(this);
      }
      this._components.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Gets a component by key.
   *
   * @param key - Component identifier
   * @returns Component or undefined
   *
   * @example
   * ```typescript
   * const component = node.getComponent('myComponent');
   * if (component) {
   *   // Use component
   * }
   * ```
   */
  getComponent<T extends ISceneComponent>(key: string): T | undefined {
    return this._components.get(key) as T | undefined;
  }

  /**
   * Checks if a component exists.
   *
   * @param key - Component identifier
   * @returns True if component exists
   */
  hasComponent(key: string): boolean {
    return this._components.has(key);
  }

  /**
   * Gets all component keys.
   */
  get componentKeys(): string[] {
    return Array.from(this._components.keys());
  }

  /**
   * Updates all components.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * node.addComponent('updater', { update: (dt) => console.log(dt) });
   * node.update(0.016); // Update with ~60fps delta
   * ```
   */
  update(deltaTime: number): void {
    for (const component of this._components.values()) {
      if (component.update) {
        component.update(deltaTime);
      }
    }
  }

  /**
   * Updates all components in this node and all descendants.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * const root = new SceneNode('root');
   * // Add children with components...
   * root.updateRecursive(0.016); // Update entire tree
   * ```
   */
  updateRecursive(deltaTime: number): void {
    this.update(deltaTime);
    for (const child of this._children) {
      child.updateRecursive(deltaTime);
    }
  }

  /**
   * Traverses this node and all descendants in depth-first order.
   *
   * @param callback - Function called for each node
   * @param includeSelf - Whether to include this node (default: true)
   *
   * @example
   * ```typescript
   * root.traverse((node) => {
   *   console.log(node.name, node.worldPosition);
   * });
   *
   * // Skip root node
   * root.traverse((node) => {
   *   console.log(node.name);
   * }, false);
   * ```
   */
  traverse(callback: (node: SceneNode) => void, includeSelf: boolean = true): void {
    if (includeSelf) {
      callback(this);
    }
    for (const child of this._children) {
      child.traverse(callback, true);
    }
  }

  /**
   * Finds a descendant node by name (depth-first search).
   *
   * @param name - Node name to search for
   * @returns Found node or null
   *
   * @example
   * ```typescript
   * const root = new SceneNode('root');
   * const child = new SceneNode('child');
   * root.addChild(child);
   * const found = root.findByName('child');
   * console.log(found === child); // true
   * ```
   */
  findByName(name: string): SceneNode | null {
    if (this.name === name) {
      return this;
    }
    for (const child of this._children) {
      const found = child.findByName(name);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Finds a descendant node by ID.
   *
   * @param id - Node ID to search for
   * @returns Found node or null
   *
   * @example
   * ```typescript
   * const root = new SceneNode('root');
   * const child = new SceneNode('child');
   * root.addChild(child);
   * const found = root.findById(child.id);
   * console.log(found === child); // true
   * ```
   */
  findById(id: number): SceneNode | null {
    if (this.id === id) {
      return this;
    }
    for (const child of this._children) {
      const found = child.findById(id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Finds all descendant nodes matching a predicate.
   *
   * @param predicate - Function to test each node
   * @param includeSelf - Whether to test this node (default: true)
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * // Find all visible nodes
   * const visibleNodes = root.findAll(node => node.isVisible);
   *
   * // Find all nodes with a specific component
   * const withComponent = root.findAll(node => node.hasComponent('renderer'));
   * ```
   */
  findAll(predicate: (node: SceneNode) => boolean, includeSelf: boolean = true): SceneNode[] {
    const results: SceneNode[] = [];
    this.traverse((node) => {
      if (predicate(node)) {
        results.push(node);
      }
    }, includeSelf);
    return results;
  }

  /**
   * Gets the depth of this node in the hierarchy (root = 0).
   *
   * @example
   * ```typescript
   * const root = new SceneNode('root');
   * const child = new SceneNode('child');
   * root.addChild(child);
   * console.log(root.depth); // 0
   * console.log(child.depth); // 1
   * ```
   */
  get depth(): number {
    let depth = 0;
    let current = this._parent;
    while (current) {
      depth++;
      current = current._parent;
    }
    return depth;
  }

  /**
   * Gets the root node of this hierarchy.
   *
   * @example
   * ```typescript
   * const root = new SceneNode('root');
   * const child = new SceneNode('child');
   * root.addChild(child);
   * console.log(child.root === root); // true
   * ```
   */
  get root(): SceneNode {
    let root: SceneNode = this;
    while (root._parent) {
      root = root._parent;
    }
    return root;
  }

  /**
   * Clones this node (shallow copy, does not clone children).
   *
   * @param name - Name for cloned node (default: original name)
   * @returns Cloned node
   *
   * @example
   * ```typescript
   * const original = new SceneNode('original');
   * original.transform.position.set(1, 2, 3);
   * const clone = original.clone('clone');
   * console.log(clone.transform.position); // (1, 2, 3)
   * console.log(clone.parent); // null (no parent)
   * ```
   */
  clone(name?: string): SceneNode {
    const node = new SceneNode(name || this.name);
    node.transform.copy(this.transform);
    node._localBounds.copy(this._localBounds);
    node._flags = this._flags;
    node.layerMask = this.layerMask;
    node.userData = { ...this.userData };
    return node;
  }

  /**
   * Clones this node and all descendants (deep copy).
   *
   * @param name - Name for cloned node (default: original name)
   * @returns Cloned node with cloned children
   *
   * @example
   * ```typescript
   * const original = new SceneNode('original');
   * const child = new SceneNode('child');
   * original.addChild(child);
   * const clone = original.cloneRecursive('clone');
   * console.log(clone.children.length); // 1
   * ```
   */
  cloneRecursive(name?: string): SceneNode {
    const node = this.clone(name);
    for (const child of this._children) {
      node.addChild(child.cloneRecursive());
    }
    return node;
  }

  /**
   * Destroys this node and removes it from its parent.
   * Calls onDetach for all components.
   *
   * @example
   * ```typescript
   * const node = new SceneNode();
   * node.addComponent('comp', { onDetach: () => console.log('Detached') });
   * node.destroy(); // Logs 'Detached'
   * ```
   */
  destroy(): void {
    // Detach all components
    for (const [key, component] of this._components.entries()) {
      if (component.onDetach) {
        component.onDetach(this);
      }
    }
    this._components.clear();

    // Remove from parent
    this.removeFromParent();
  }

  /**
   * Marks the transform as dirty and propagates to children.
   */
  private _markTransformDirty(): void {
    this.setFlag(SceneNodeFlags.DirtyTransform, true);
    this._markBoundsDirty();
  }

  /**
   * Marks the bounding volumes as dirty and propagates to children.
   */
  private _markBoundsDirty(): void {
    this.setFlag(SceneNodeFlags.DirtyBounds, true);
    for (const child of this._children) {
      child._markBoundsDirty();
    }
  }

  /**
   * Updates world-space bounding volumes.
   */
  private _updateWorldBounds(): void {
    if (this._localBounds.isEmpty) {
      this._worldBounds.makeEmpty();
      this._boundingSphere.makeEmpty();
    } else {
      // Transform local bounds to world space
      this._worldBounds = this._localBounds.applyMatrix4(this.worldMatrix);
      this._boundingSphere = Sphere.fromBox(this._worldBounds);
    }
    this.setFlag(SceneNodeFlags.DirtyBounds, false);
  }

  /**
   * Checks if a node is an ancestor of this node.
   */
  private _isAncestor(node: SceneNode): boolean {
    let current = this._parent;
    while (current) {
      if (current === node) {
        return true;
      }
      current = current._parent;
    }
    return false;
  }

  /**
   * Returns a string representation of this node.
   */
  toString(): string {
    return `SceneNode(id=${this.id}, name="${this.name}", children=${this._children.length})`;
  }
}
