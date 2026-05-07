import { ValidationError } from "@galileo3d/core";
import { Bounds3 } from "./Bounds.js";
import { cloneMat4, invertMat4, multiplyMat4 } from "./MathTypes.js";
import { TransformNode } from "./TransformNode.js";

let nextSceneNodeId = 1;

export interface SceneNodeOptions {
  id?: string;
  name?: string;
}

export interface AddChildOptions {
  preserveWorldTransform?: boolean;
}

export class SceneNode {
  readonly id: string;
  name: string;
  visible = true;
  layerMask = 1;
  readonly transform = new TransformNode();
  localBounds: Bounds3 | null = null;
  worldBounds = new Bounds3();
  readonly children: SceneNode[] = [];
  parent: SceneNode | null = null;

  constructor(options: SceneNodeOptions = {}) {
    this.id = options.id ?? `node-${nextSceneNodeId++}`;
    this.name = options.name ?? this.id;
    this.transform.onDirty(() => this.markWorldDirty());
  }

  addChild(child: SceneNode, options: AddChildOptions = {}): this {
    assertCanParent(this, child);
    if (child.parent === this) return this;
    const preservedWorld = options.preserveWorldTransform ? cloneMat4(child.transform.worldMatrix) : undefined;
    if (preservedWorld) this.updateWorldTransform();
    child.parent?.removeChild(child);
    this.children.push(child);
    child.parent = this;
    if (preservedWorld) child.transform.setFromLocalMatrix(multiplyMat4(invertMat4(this.transform.worldMatrix), preservedWorld));
    child.markWorldDirty();
    return this;
  }

  removeChild(child: SceneNode): boolean {
    const index = this.children.indexOf(child);
    if (index < 0) return false;
    this.children.splice(index, 1);
    child.parent = null;
    child.markWorldDirty();
    return true;
  }

  removeFromParent(): boolean {
    return this.parent?.removeChild(this) ?? false;
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
    this.localBounds = bounds?.clone() ?? null;
    this.worldBounds = this.localBounds ? this.localBounds.transform(this.transform.worldMatrix) : new Bounds3();
    return this;
  }

  markWorldDirty(): void {
    for (const child of this.children) {
      child.transform.markDirty();
      child.markWorldDirty();
    }
  }
}

export function assertCanParent(parent: SceneNode, child: SceneNode): void {
  if (parent === child) throw new ValidationError("SCENE_SELF_PARENT", "A scene node cannot be parented to itself.");
  if (child.isAncestorOf(parent)) throw new ValidationError("SCENE_HIERARCHY_CYCLE", "Scene hierarchy cycle rejected.");
}
