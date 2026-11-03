import { ValidationError } from "@aura3d/core";
import { Bounds3 } from "./Bounds.js";
import { Layers } from "./Layers.js";
import { invertMat4, multiplyMat4, type Mat4 } from "./MathTypes.js";
import { Renderable } from "./Renderable.js";
import { TransformNode } from "./TransformNode.js";
import { getTransformNodeAccess, type StagedWorldUpdate, type TransformNodeAccess } from "./TransformNodeInternals.js";

let nextSceneNodeId = 1n;
const sceneCloneOwnerKey = Symbol.for("@aura3d/scene/clone-owner");
type StructureNotification = "reparent" | "removal" | "disposal";
const notifyingStructureRoots = new Map<SceneNode, StructureNotification>();

function allocateSceneNodeId(): string {
  return `node-${nextSceneNodeId++}`;
}

function reserveSceneNodeId(id: string): void {
  const match = /^node-([1-9][0-9]*)$/.exec(id);
  if (!match) return;
  const value = BigInt(match[1]!);
  if (value >= nextSceneNodeId) nextSceneNodeId = value + 1n;
}

interface AncestorPreview {
  world: Mat4;
  staged?: StagedWorldUpdate;
  changed: boolean;
}

/** A reparent committed, but one or more dirty listeners failed. */
export class ReparentNotificationError extends AggregateError {
  readonly committed = true as const;

  constructor(errors: readonly unknown[]) {
    super(errors, "Reparent committed; one or more dirty listeners failed.");
    this.name = "ReparentNotificationError";
  }
}

/** A removal committed, but one or more dirty listeners failed. */
export class RemovalNotificationError extends AggregateError {
  readonly committed = true as const;

  constructor(readonly child: SceneNode, readonly previousParent: SceneNode, errors: readonly unknown[]) {
    super(errors, "Removal committed; one or more dirty listeners failed.");
    this.name = "RemovalNotificationError";
  }
}

/** A nonrecursive disposal committed, but one or more dirty listeners failed. */
export class DisposalNotificationError extends AggregateError {
  readonly committed = true as const;

  constructor(readonly node: SceneNode, errors: readonly unknown[]) {
    super(errors, "Disposal committed; one or more dirty listeners failed.");
    this.name = "DisposalNotificationError";
  }
}

export interface SceneNodeOptions {
  id?: string;
  name?: string;
}

export interface AddChildOptions {
  preserveWorldTransform?: boolean;
}

export interface DisposeNodeOptions {
  recursive?: boolean;
}

export interface CloneNodeOptions {
  recursive?: boolean;
}

export class SceneNode {
  readonly id: string;
  name: string;
  visible = true;
  /**
   * threejs-parity L7/SG-10: the node's layer set. `layerMask` stays the
   * numeric view (back-compat with SceneQuery/SceneSerializer); `layers`
   * gives three's `object.layers` API — `set`/`enable`/`disable`/`test`.
   */
  readonly layers = new Layers();
  renderOrder = 0;
  /**
   * threejs-parity L7/SG-09: when false the node is never frustum-culled
   * (three's `object.frustumCulled = false` — used for skinned bounds and
   * intentionally always-drawn overlays).
   */
  frustumCulled = true;
  /**
   * threejs-parity L7 (P2): three's `object.onBeforeRender` — invoked by the
   * renderer just before the item's draw submits. `renderer` is intentionally
   * opaque here so `@aura3d/scene` does not import the rendering package.
   */
  onBeforeRender?: (renderer: unknown, node: SceneNode) => void;
  disposed = false;
  userData: Record<string, unknown> = {};
  renderable?: Renderable;
  readonly transform: TransformNode = new TransformNode();
  private readonly propagateTransformDirty = () => this.markWorldDirty();
  localBounds: Bounds3 | null = null;
  worldBounds = new Bounds3();
  readonly children: SceneNode[] = [];
  parent: SceneNode | null = null;

  get layerMask(): number {
    return this.layers.mask;
  }

  set layerMask(mask: number) {
    this.layers.mask = mask;
  }

  constructor(options: SceneNodeOptions = {}) {
    if (options.id === undefined) {
      this.id = allocateSceneNodeId();
    } else {
      this.id = options.id;
      reserveSceneNodeId(this.id);
    }
    this.name = options.name ?? this.id;
    this.transform.onDirty(this.propagateTransformDirty);
  }

  clone(options: boolean | CloneNodeOptions = true): this {
    const recursive = typeof options === "boolean" ? options : options.recursive ?? true;
    return SceneNode.cloneForest([this], recursive).get(this) as this;
  }

  static cloneForest(
    roots: readonly SceneNode[],
    recursive = true,
    excludedIds: Iterable<string> = [],
    references: ReadonlyMap<object, unknown> = new Map()
  ): Map<SceneNode, SceneNode> {
    const sources: SceneNode[] = [];
    const visited = new Set<SceneNode>();
    const active = new Set<SceneNode>();
    const parents = new Map<SceneNode, SceneNode | null>();
    const sourceIds = new Map<SceneNode, string>();
    const childSnapshots = new Map<SceneNode, readonly SceneNode[]>();
    const visit = (node: SceneNode): void => {
      if (active.has(node)) throw new ValidationError("SCENE_HIERARCHY_CYCLE", "Scene hierarchy cycle rejected during cloning.");
      if (visited.has(node)) return;
      node.assertAlive();
      visited.add(node);
      active.add(node);
      sources.push(node);
      parents.set(node, node.parent);
      sourceIds.set(node, node.id);
      if (recursive) {
        const children = new Set<SceneNode>();
        const snapshot = [...node.children];
        childSnapshots.set(node, snapshot);
        for (const child of snapshot) {
          if (children.has(child) || child.parent !== node) {
            throw new ValidationError("SCENE_HIERARCHY_INCONSISTENT", "Scene hierarchy links are inconsistent.");
          }
          children.add(child);
          visit(child);
        }
      }
      active.delete(node);
    };
    for (const root of roots) visit(root);

    const clones = new Map<SceneNode, SceneNode>();
    const reservedIds = new Set([...excludedIds, ...sources.map((source) => source.id)]);
    const targets = new Set<SceneNode>();
    for (const source of sources) {
      const target = source.createCloneInstance();
      if (!(target instanceof SceneNode) || Object.getPrototypeOf(target) !== Object.getPrototypeOf(source)
          || visited.has(target) || targets.has(target) || target.disposed || target.parent || target.children.length) {
        throw new ValidationError("SCENE_CLONE_INSTANCE", "A clone constructor must return a fresh, detached instance of the same node type.");
      }
      if (reservedIds.has(target.id)) {
        let id: string;
        do { id = allocateSceneNodeId(); } while (reservedIds.has(id));
        (target as { id: string }).id = id;
      }
      reservedIds.add(target.id);
      targets.add(target);
      clones.set(source, target);
    }

    const values = new Map<object, unknown>(references);
    for (const [source, target] of clones) values.set(source, target);
    for (const [source, target] of clones) {
      seedNodeReferences(source, target, values);
    }
    for (const [source, target] of clones) {
      copyNodeState(source, target, values);
    }
    for (const [source, target] of clones) {
      target.localBounds = source.localBounds ? cloneState(source.localBounds, values) as Bounds3 : null;
      target.worldBounds = cloneState(source.worldBounds, values) as Bounds3;
    }
    for (const [source, target] of clones) {
      if (source.renderable) target.renderable = cloneState(source.renderable, values) as Renderable;
    }
    for (const [source, target] of clones) {
      copyDerivedState(source, target, values);
      target.userData = cloneState(source.userData, values) as Record<string, unknown>;
    }
    for (const source of sources) {
      const children = childSnapshots.get(source);
      if (source.disposed || source.id !== sourceIds.get(source) || source.parent !== parents.get(source) ||
          (children && (source.children.length !== children.length || children.some((child, index) => source.children[index] !== child)))) {
        throw new ValidationError("SCENE_CLONE_SOURCE_CHANGED", "Scene hierarchy changed during cloning.");
      }
    }
    if (recursive) {
      for (const [source, target] of clones) {
        for (const child of childSnapshots.get(source)!) target.addChild(clones.get(child)!);
      }
    }
    return clones;
  }

  protected createCloneInstance(): this {
    const Constructor = this.constructor as new () => this;
    return new Constructor();
  }

  /**
   * Preserve-world validation does not publish changes on failure. Once a
   * reparent commits, its dirty listeners run against the new graph. Their
   * failures are reported together as ReparentNotificationError,
   * whose `committed` flag is true. Structural edits to either affected scene
   * are rejected during those notifications; unrelated scenes remain usable.
   * Transition listeners are snapshotted at commit and delivered from
   * descendants to ancestors, even if a listener is removed during delivery.
   * Listener-initiated transform edits and external side effects occur after
   * commit and are not rolled back. Direct writes to public fields and arrays
   * are outside the structural-method guard.
   */
  addChild(child: SceneNode, options: AddChildOptions = {}): this {
    this.assertAlive();
    child.assertAlive();
    assertStructureUnlocked(this, child);
    assertCanParent(this, child);
    if (child.parent === this) return this;
    if (options.preserveWorldTransform) {
      return this.addChildPreservingWorld(child);
    }
    const previousParent = child.parent;
    const previousIndex = previousParent?.children.indexOf(child) ?? -1;
    if ((previousParent && previousIndex < 0) || this.children.includes(child)) {
      throw new ValidationError("SCENE_HIERARCHY_INCONSISTENT", "Scene hierarchy links are inconsistent.");
    }
    const transformAccess = getTransformNodeAccess();
    const affectedRoots = new Set([sceneRoot(this), sceneRoot(child)]);
    if (previousParent) previousParent.children.splice(previousIndex, 1);
    this.children.push(child);
    child.parent = this;
    const notifications: Array<Array<() => void>> = [];
    SceneNode.stageSubtreeNotifications(child, notifications, transformAccess);
    dispatchReparentNotifications(affectedRoots, notifications);
    return this;
  }

  /**
   * Detach a child and dirty its subtree; world matrices are recomputed on the
   * next world update. A RemovalNotificationError means the detach committed
   * but dirty listeners failed; its child and previousParent identify that
   * removal. All captured listeners are notified. During notification,
   * structural changes to the former scene and detached subtree are rejected.
   */
  removeChild(child: SceneNode): boolean {
    this.assertAlive();
    assertStructureUnlocked(this, child);
    const index = this.children.indexOf(child);
    if (index < 0) return false;
    if (child.parent !== this) {
      throw new ValidationError("SCENE_HIERARCHY_INCONSISTENT", "Scene hierarchy links are inconsistent.");
    }
    const transformAccess = getTransformNodeAccess();
    const affectedRoots = new Set([sceneRoot(this), child]);
    this.children.splice(index, 1);
    child.parent = null;
    const notifications: Array<Array<() => void>> = [];
    SceneNode.stageSubtreeNotifications(child, notifications, transformAccess);
    const errors = dispatchStructureNotifications(affectedRoots, notifications, "removal");
    if (errors.length > 0) throw new RemovalNotificationError(child, this, errors);
    return true;
  }

  removeFromParent(): boolean {
    assertStructureUnlocked(this);
    return this.parent?.removeChild(this) ?? false;
  }

  /**
   * threejs-parity L7: three's `object.attach(child)` — reparent while keeping
   * the child's world transform. Equivalent to `addChild(child, {
   * preserveWorldTransform: true })`.
   */
  attach(child: SceneNode): this {
    return this.addChild(child, { preserveWorldTransform: true });
  }

  isAncestorOf(candidate: SceneNode): boolean {
    let current = candidate.parent;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  traverse(visitor: (node: SceneNode) => void): void {
    visitor(this);
    for (const child of [...this.children]) child.traverse(visitor);
  }

  updateWorldTransform(force = false): void {
    const changed = this.transform.updateWorld(this.parent?.transform.worldMatrix, force);
    for (const child of this.children) child.updateWorldTransform(force || changed);
  }

  updateWorldBounds(): Bounds3 {
    let bounds = this.localBounds ? this.localBounds.transform(this.transform.worldMatrix) : new Bounds3();
    for (const child of this.children) bounds = bounds.union(child.updateWorldBounds());
    this.worldBounds = bounds;
    return this.worldBounds;
  }

  setLocalBounds(bounds: Bounds3 | null): this {
    this.assertAlive();
    this.localBounds = bounds?.clone() ?? null;
    this.worldBounds = this.localBounds ? this.localBounds.transform(this.transform.worldMatrix) : new Bounds3();
    return this;
  }

  /**
   * Dispose this node. Nonrecursive disposal detaches and dirties every
   * surviving child subtree before notifying listeners; their world matrices
   * are recomputed on the next update. A DisposalNotificationError means the
   * disposal committed but one or more dirty listeners failed. Structural
   * edits to the former scene and surviving roots are rejected during those
   * notifications. Repeated disposal is a no-op after notification completes.
   */
  dispose(options: DisposeNodeOptions = {}): void {
    assertStructureUnlocked(this);
    if (this.disposed) return;
    const recursive = options.recursive ?? true;
    const children = [...this.children];
    const transformAccess = recursive ? undefined : getTransformNodeAccess();
    const affectedRoots = recursive ? undefined : new Set([sceneRoot(this), this, ...children]);
    if (recursive) {
      for (const child of children) child.dispose(options);
    } else {
      for (const child of children) child.parent = null;
    }
    this.children.length = 0;
    this.detachForDisposal();
    this.renderable = undefined;
    this.localBounds = null;
    this.userData = {};
    this.visible = false;
    this.disposed = true;
    if (affectedRoots && transformAccess) {
      const notifications: Array<Array<() => void>> = [];
      for (const child of children) SceneNode.stageSubtreeNotifications(child, notifications, transformAccess);
      const errors = dispatchStructureNotifications(affectedRoots, notifications, "disposal");
      if (errors.length > 0) throw new DisposalNotificationError(this, errors);
    }
  }

  markWorldDirty(): void {
    for (const child of this.children) {
      child.transform.markDirty();
      child.markWorldDirty();
    }
  }

  protected assertAlive(): void {
    if (this.disposed) throw new ValidationError("DISPOSED_SCENE_NODE", `Scene node ${this.name} is disposed.`);
  }

  private detachForDisposal(): void {
    const parent = this.parent;
    if (parent) {
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  private addChildPreservingWorld(child: SceneNode): this {
    const previousParent = child.parent;
    const previousIndex = previousParent?.children.indexOf(child) ?? -1;
    if ((previousParent && previousIndex < 0) || this.children.includes(child)) {
      throw new ValidationError("SCENE_HIERARCHY_INCONSISTENT", "Scene hierarchy links are inconsistent.");
    }
    const transformAccess = getTransformNodeAccess();
    const affectedRoots = new Set([sceneRoot(this), sceneRoot(child)]);
    const previews = new Map<SceneNode, AncestorPreview>();
    SceneNode.previewAncestors(child, previews, transformAccess);
    SceneNode.previewAncestors(this, previews, transformAccess);
    const childWorld = previews.get(child)!.world;
    const destinationWorld = previews.get(this)!.world;
    const replacementLocal = multiplyMat4(invertMat4(destinationWorld), childWorld);
    const localUpdate = transformAccess.stageLocalUpdate(child.transform, replacementLocal);

    // No user callbacks run until the staged worlds, links and all dirty flags
    // have been published. Avoid removeChild(), which normally notifies inline.
    for (const [node, preview] of previews) {
      if (preview.staged) transformAccess.commitWorldUpdate(node.transform, preview.staged);
    }
    transformAccess.commitLocalUpdate(child.transform, localUpdate);
    if (previousParent) previousParent.children.splice(previousIndex, 1);
    this.children.push(child);
    child.parent = this;
    const notifications: Array<Array<() => void>> = [];
    SceneNode.stageSubtreeNotifications(child, notifications, transformAccess);
    dispatchReparentNotifications(affectedRoots, notifications);
    return this;
  }

  private static previewAncestors(node: SceneNode, previews: Map<SceneNode, AncestorPreview>, transformAccess: TransformNodeAccess): void {
    const chain: SceneNode[] = [];
    for (let current: SceneNode | null = node; current; current = current.parent) chain.push(current);
    let parentWorld: Mat4 | undefined;
    let parentChanged = false;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const current = chain[index]!;
      let preview = previews.get(current);
      if (!preview) {
        const staged = transformAccess.stageWorldUpdate(current.transform, parentWorld, parentChanged);
        preview = { world: staged?.worldMatrix ?? current.transform.worldMatrix, staged, changed: staged !== undefined };
        previews.set(current, preview);
      }
      parentWorld = preview.world;
      parentChanged = preview.changed;
    }
  }

  private static stageSubtreeNotifications(
    node: SceneNode,
    notifications: Array<Array<() => void>>,
    transformAccess: TransformNodeAccess
  ): void {
    const listeners = transformAccess.stageDirtyNotification(node.transform);
    for (const child of node.children) SceneNode.stageSubtreeNotifications(child, notifications, transformAccess);
    // The internal propagation listener has already been applied to the whole
    // subtree. Running it again after a listener refreshes worlds would create
    // extra dirty transitions and duplicate notifications.
    if (listeners) notifications.push(listeners.filter((listener) => listener !== node.propagateTransformDirty));
  }
}

const sceneNodeFields = new Set<PropertyKey>([
  "id", "name", "visible", "layers", "renderOrder", "frustumCulled", "onBeforeRender",
  "disposed", "userData", "renderable", "transform", "propagateTransformDirty", "localBounds",
  "worldBounds", "children", "parent"
]);

const renderableFields = new Set<PropertyKey>([
  "geometry", "material", "layerMask", "castShadow", "receiveShadow", "skinning",
  "morphWeights", "instanceTransforms", "instanceColors"
]);

const typedArrayPrototypes = new Set<object>([
  DataView.prototype, Int8Array.prototype, Uint8Array.prototype, Uint8ClampedArray.prototype,
  Int16Array.prototype, Uint16Array.prototype, Int32Array.prototype, Uint32Array.prototype,
  Float32Array.prototype, Float64Array.prototype, BigInt64Array.prototype, BigUint64Array.prototype
]);

function seedNodeReferences(source: SceneNode, target: SceneNode, values: Map<object, unknown>): void {
  values.set(source.transform, target.transform);
  values.set(source.layers, target.layers);
  values.set(source.children, target.children);
  values.set(source.transform.position, target.transform.position);
  values.set(source.transform.rotation, target.transform.rotation);
  values.set(source.transform.scale, target.transform.scale);
  values.set(source.transform.pivot, target.transform.pivot);
  for (const key of Reflect.ownKeys(source)) {
    if (sceneNodeFields.has(key)) continue;
    const sourceProperty = Object.getOwnPropertyDescriptor(source, key);
    const targetProperty = Object.getOwnPropertyDescriptor(target, key);
    if (sourceProperty && "value" in sourceProperty && typeof sourceProperty.value === "function" &&
        targetProperty && "value" in targetProperty && typeof targetProperty.value === "function" &&
        !values.has(sourceProperty.value)) {
      values.set(sourceProperty.value, targetProperty.value);
    }
  }
}

function copyNodeState(source: SceneNode, target: SceneNode, values: Map<object, unknown>): void {
  target.name = source.name;
  target.visible = source.visible;
  target.layerMask = source.layerMask;
  target.renderOrder = source.renderOrder;
  target.frustumCulled = source.frustumCulled;
  target.onBeforeRender = cloneState(source.onBeforeRender, values) as SceneNode["onBeforeRender"];
  getTransformNodeAccess().stageDirtyNotification(target.transform);
  target.transform.position.splice(0, 3, ...source.transform.position);
  target.transform.rotation.splice(0, 4, ...source.transform.rotation);
  target.transform.scale.splice(0, 3, ...source.transform.scale);
  target.transform.pivot.splice(0, 3, ...source.transform.pivot);
  target.transform.setLocalMatrix(source.transform.localMatrix, {
    decompose: false,
    matrixAutoUpdate: source.transform.matrixAutoUpdate
  });
  target.transform.setLinearResidual(source.transform.getLinearResidual());
  values.set(source.transform.localMatrix, target.transform.localMatrix);
  values.set(source.transform.worldMatrix, target.transform.worldMatrix);
}

function copyDerivedState(source: SceneNode, target: SceneNode, values: Map<object, unknown>): void {
  for (const key of Reflect.ownKeys(source)) {
    if (sceneNodeFields.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    if (!("value" in descriptor)) {
      throw new ValidationError("SCENE_CLONE_DATA", "Accessor properties in scene state cannot be cloned safely.");
    }
    const targetProperty = Object.getOwnPropertyDescriptor(target, key);
    descriptor.value = typeof descriptor.value === "function" &&
      targetProperty && "value" in targetProperty && typeof targetProperty.value === "function"
      ? targetProperty.value
      : cloneState(descriptor.value, values);
    Object.defineProperty(target, key, descriptor);
  }
}

function cloneState(value: unknown, values: Map<object, unknown>): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (values.has(value)) return values.get(value);
  if (typeof value === "function") return value;
  if (value instanceof SceneNode) return value;
  const ownerMarker = Object.getOwnPropertyDescriptor(value, sceneCloneOwnerKey);
  if (ownerMarker && "value" in ownerMarker && ownerMarker.value === true) return value;
  if (value instanceof Renderable) {
    if (Object.getPrototypeOf(value) !== Renderable.prototype) {
      throw new ValidationError("SCENE_CLONE_DATA", "Renderable subclasses need an explicit clone implementation.");
    }
    const copy = new Renderable({
      geometry: value.geometry,
      material: value.material,
      layerMask: value.layerMask,
      castShadow: value.castShadow,
      receiveShadow: value.receiveShadow
    });
    values.set(value, copy);
    copy.skinning = cloneState(value.skinning, values) as Renderable["skinning"];
    copy.morphWeights = cloneState(value.morphWeights, values) as number[];
    copy.instanceTransforms = cloneState(value.instanceTransforms, values) as Float32Array | undefined;
    copy.instanceColors = cloneState(value.instanceColors, values) as Float32Array | undefined;
    copyOwnState(value, copy, values, false, renderableFields);
    return copy;
  }
  if (value instanceof Date) {
    requireClonePrototype(value, Date.prototype, "Date");
    const copy = new Date(value.getTime());
    values.set(value, copy);
    copyOwnState(value, copy, values);
    return copy;
  }
  if (value instanceof RegExp) {
    requireClonePrototype(value, RegExp.prototype, "RegExp");
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    values.set(value, copy);
    copyOwnState(value, copy, values);
    return copy;
  }
  if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)) {
    const [copy, created] = cloneBuffer(value, values);
    if (created) copyOwnState(value, copy, values);
    return copy;
  }
  if (ArrayBuffer.isView(value)) {
    if (!typedArrayPrototypes.has(Object.getPrototypeOf(value))) {
      throw new ValidationError("SCENE_CLONE_DATA", "Typed-array and DataView subclasses cannot be cloned safely.");
    }
    const [buffer, created] = cloneBuffer(value.buffer, values);
    const copy = value instanceof DataView
      ? new DataView(buffer as ArrayBuffer, value.byteOffset, value.byteLength)
      : new (value.constructor as new (buffer: ArrayBuffer, offset: number, length: number) => ArrayBufferView)(
        buffer as ArrayBuffer, value.byteOffset, (value as unknown as { length: number }).length
      );
    values.set(value, copy);
    if (created) copyOwnState(value.buffer, buffer, values);
    copyOwnState(value, copy, values, true);
    return copy;
  }
  if (value instanceof Map) {
    requireClonePrototype(value, Map.prototype, "Map");
    const copy = new Map<unknown, unknown>();
    values.set(value, copy);
    for (const [key, entry] of value) copy.set(cloneState(key, values), cloneState(entry, values));
    copyOwnState(value, copy, values);
    return copy;
  }
  if (value instanceof Set) {
    requireClonePrototype(value, Set.prototype, "Set");
    const copy = new Set<unknown>();
    values.set(value, copy);
    for (const entry of value) copy.add(cloneState(entry, values));
    copyOwnState(value, copy, values);
    return copy;
  }
  const prototype = Object.getPrototypeOf(value);
  let copy: object;
  if (Array.isArray(value)) {
    requireClonePrototype(value, Array.prototype, "Array");
    copy = [];
  } else if (prototype === Object.prototype || prototype === null) {
    copy = Object.create(prototype) as object;
  } else {
    const clone = cloneMethod(value);
    if (typeof clone !== "function") {
      throw new ValidationError("SCENE_CLONE_DATA", "Non-plain scene state must provide a clone method.");
    }
    copy = clone.call(value) as object;
    if (!copy || typeof copy !== "object" || copy === value || Object.getPrototypeOf(copy) !== prototype) {
      throw new ValidationError("SCENE_CLONE_DATA", "A state clone method must return a distinct instance of the same type.");
    }
  }
  values.set(value, copy);
  copyOwnState(value, copy, values);
  return copy;
}

function cloneMethod(value: object): unknown {
  let current: object | null = value;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "clone");
    if (descriptor) {
      if (!("value" in descriptor)) {
        throw new ValidationError("SCENE_CLONE_DATA", "Accessor properties in scene state cannot be cloned safely.");
      }
      return descriptor.value;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function requireClonePrototype(value: object, prototype: object, kind: string): void {
  if (Object.getPrototypeOf(value) !== prototype) {
    throw new ValidationError("SCENE_CLONE_DATA", `${kind} subclasses cannot be cloned safely.`);
  }
}

function cloneBuffer(value: ArrayBufferLike, values: Map<object, unknown>): [ArrayBufferLike, boolean] {
  if (values.has(value)) return [values.get(value) as ArrayBufferLike, false];
  const prototype = value instanceof ArrayBuffer ? ArrayBuffer.prototype : SharedArrayBuffer.prototype;
  requireClonePrototype(value, prototype, "ArrayBuffer");
  const copy = value.slice(0);
  values.set(value, copy);
  return [copy, true];
}

function copyOwnState(
  source: object,
  target: object,
  values: Map<object, unknown>,
  skipIndexed = false,
  excluded?: ReadonlySet<PropertyKey>
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (excluded?.has(key)) continue;
    if (skipIndexed && typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    if (!("value" in descriptor)) {
      throw new ValidationError("SCENE_CLONE_DATA", "Accessor properties in scene state cannot be cloned safely.");
    }
    descriptor.value = cloneState(descriptor.value, values);
    Object.defineProperty(target, key, descriptor);
  }
}

function sceneRoot(node: SceneNode): SceneNode {
  let root = node;
  while (root.parent) root = root.parent;
  return root;
}

function assertStructureUnlocked(...nodes: SceneNode[]): void {
  for (const node of nodes) {
    const operation = notifyingStructureRoots.get(sceneRoot(node));
    if (operation) {
      const code = operation === "reparent" ? "SCENE_REPARENT_NOTIFICATION_REENTRY"
        : operation === "removal" ? "SCENE_REMOVAL_NOTIFICATION_REENTRY"
          : "SCENE_DISPOSAL_NOTIFICATION_REENTRY";
      throw new ValidationError(code, `Scene hierarchy cannot change during ${operation} notifications.`);
    }
  }
}

function dispatchReparentNotifications(roots: Set<SceneNode>, notifications: Array<Array<() => void>>): void {
  const errors = dispatchStructureNotifications(roots, notifications, "reparent");
  if (errors.length > 0) throw new ReparentNotificationError(errors);
}

function dispatchStructureNotifications(
  roots: Set<SceneNode>,
  notifications: Array<Array<() => void>>,
  operation: StructureNotification
): unknown[] {
  const errors: unknown[] = [];
  for (const root of roots) notifyingStructureRoots.set(root, operation);
  try {
    for (const listeners of notifications) {
      for (const listener of listeners) {
        try { listener(); } catch (error) { errors.push(error); }
      }
    }
  } finally {
    for (const root of roots) notifyingStructureRoots.delete(root);
  }
  return errors;
}

export function assertCanParent(parent: SceneNode, child: SceneNode): void {
  if (parent === child) throw new ValidationError("SCENE_SELF_PARENT", "A scene node cannot be parented to itself.");
  if (child.isAncestorOf(parent)) throw new ValidationError("SCENE_HIERARCHY_CYCLE", "Scene hierarchy cycle rejected.");
}
