import { ValidationError } from "@aura3d/core";
import { Camera } from "./Camera.js";
import { DirectionalLight } from "./DirectionalLight.js";
import { Light } from "./Light.js";
import { Group, InstancedMesh, Mesh, Object3D, SkinnedMesh, type MeshOptions, type Object3DOptions } from "./Object3D.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import { PerspectiveCamera } from "./PerspectiveCamera.js";
import { PointLight } from "./PointLight.js";
import { Renderable } from "./Renderable.js";
import { RectAreaLight } from "./RectAreaLight.js";
import { collectRenderables, queryScene, type SceneQueryOptions } from "./SceneQuery.js";
import { SceneMetadata, type SerializedSceneMetadata } from "./SceneMetadata.js";
import { RemovalNotificationError, SceneNode, type CloneNodeOptions } from "./SceneNode.js";
import { SpotLight } from "./SpotLight.js";

const sceneCloneOwnerKey = Symbol.for("@aura3d/scene/clone-owner");

export class Scene {
  readonly [sceneCloneOwnerKey] = true;
  readonly root = new SceneNode({ id: "root", name: "root" });
  readonly metadata = new SceneMetadata();
  private readonly nodesById = new Map<string, SceneNode>([[this.root.id, this.root]]);
  private readonly pendingDisposal = new Set<SceneNode>();
  private disposing = false;

  clone(): Scene {
    const metadata = this.metadata.toJSON();
    const registered = this.getRegisteredNodes();
    const sourceRoot = this.root;
    const roots = sceneForestRoots(sourceRoot, registered);
    const scene = new Scene();
    const references = new Map<object, unknown>([[this, scene], [this.metadata, scene.metadata]]);
    const nodes = SceneNode.cloneForest(roots, true, metadataNodeIds(metadata), references);
    const after = this.getRegisteredNodes();
    if (this.root !== sourceRoot || registered.length !== after.length || registered.some((node, index) => node !== after[index])) {
      throw new ValidationError("SCENE_REGISTRY", "Scene registry changed during cloning.");
    }
    const root = nodes.get(sourceRoot)!;
    (root as { id: string }).id = sourceRoot.id;
    const ids = new Map<string, string>();
    for (const [source, target] of nodes) {
      if (ids.has(source.id)) {
        throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${source.id}`);
      }
      ids.set(source.id, target.id);
    }
    (scene as { root: SceneNode }).root = root;
    scene.nodesById.clear();
    for (const node of registered) {
      const copy = nodes.get(node)!;
      scene.nodesById.set(copy.id, copy);
    }
    const remap = (id: string): string => ids.get(id) ?? id;
    scene.metadata.replace({
      ...metadata,
      ...(metadata.assets ? {
        assets: metadata.assets.map((asset) => ({
          ...asset,
          ...(asset.nodeIds ? { nodeIds: asset.nodeIds.map(remap) } : {})
        }))
      } : {}),
      ...(metadata.materialAssignments ? {
        materialAssignments: metadata.materialAssignments.map((assignment) => ({
          ...assignment,
          nodeId: remap(assignment.nodeId)
        }))
      } : {}),
      ...(metadata.plans ? {
        plans: metadata.plans.map((plan) => ({
          ...plan,
          ...(plan.nodeIds ? { nodeIds: plan.nodeIds.map(remap) } : {})
        }))
      } : {})
    });
    return scene;
  }

  cloneNode<T extends SceneNode>(node: T, options: boolean | CloneNodeOptions = true): T {
    const recursive = typeof options === "boolean" ? options : options.recursive ?? true;
    const references = new Map<object, unknown>([[this, this], [this.metadata, this.metadata]]);
    const nodes = SceneNode.cloneForest([node], recursive, this.cloneReservedIds(), references);
    const reservedIds = this.cloneReservedIds();
    for (const clone of nodes.values()) {
      if (reservedIds.has(clone.id)) {
        throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${clone.id}`);
      }
    }
    for (const clone of nodes.values()) this.nodesById.set(clone.id, clone);
    return nodes.get(node) as T;
  }

  createNode(name?: string): SceneNode {
    return this.register(new SceneNode({ name }));
  }

  createObject3D(options: Object3DOptions = {}): Object3D {
    return this.register(new Object3D(options));
  }

  createGroup(options: Object3DOptions = {}): Group {
    return this.register(new Group(options));
  }

  createMesh(options: MeshOptions = {}): Mesh {
    return this.register(new Mesh(options));
  }

  createSkinnedMesh(options: MeshOptions = {}): SkinnedMesh {
    return this.register(new SkinnedMesh(options));
  }

  /**
   * D1 auto-parent option (muse3jsparity-PRD): `{ attach: true }` parents the
   * new mesh under the scene root (or `attach.parent`); default behavior
   * (registered only, unparented) is unchanged for compat.
   */
  createInstancedMesh(
    options: MeshOptions = {},
    attach: boolean | { readonly parent?: SceneNode } = false
  ): InstancedMesh {
    const mesh = this.register(new InstancedMesh(options));
    if (attach) {
      const parent = typeof attach === "object" && attach.parent ? attach.parent : this.root;
      parent.addChild(mesh);
    }
    return mesh;
  }

  createPerspectiveCamera(options: ConstructorParameters<typeof PerspectiveCamera>[0] = {}): PerspectiveCamera {
    return this.register(new PerspectiveCamera(options));
  }

  createOrthographicCamera(options: ConstructorParameters<typeof OrthographicCamera>[0] = {}): OrthographicCamera {
    return this.register(new OrthographicCamera(options));
  }

  createLight(kind: "directional", name?: string): DirectionalLight;
  createLight(kind: "point", name?: string): PointLight;
  createLight(kind: "spot", name?: string): SpotLight;
  createLight(kind: "rect-area", name?: string): RectAreaLight;
  createLight(kind: "directional" | "point" | "spot" | "rect-area", name?: string): DirectionalLight | PointLight | SpotLight | RectAreaLight;
  createLight(kind: "directional" | "point" | "spot" | "rect-area", name?: string): DirectionalLight | PointLight | SpotLight | RectAreaLight {
    const light = kind === "directional"
      ? new DirectionalLight(name)
      : kind === "point"
        ? new PointLight(name)
        : kind === "spot"
          ? new SpotLight(name)
          : new RectAreaLight(name);
    return this.register(light);
  }

  addRenderable(node: SceneNode, renderable: Renderable): void {
    node.renderable = renderable;
  }

  getNodeById(id: string): SceneNode | undefined {
    return this.nodesById.get(id);
  }

  getRegisteredNodes(): readonly SceneNode[] {
    const nodes: SceneNode[] = [];
    for (const [id, node] of [...this.nodesById]) {
      if (!(node instanceof SceneNode) || node.id !== id) {
        throw new ValidationError("SCENE_REGISTRY", "Scene registry contains an inconsistent node identity.");
      }
      nodes.push(node);
    }
    if (nodes[0] !== this.root) {
      throw new ValidationError("SCENE_REGISTRY", "Scene registry must contain its root as the first node.");
    }
    return nodes;
  }

  findByName(name: string): SceneNode[] {
    return this.query({ name });
  }

  query(options: SceneQueryOptions): SceneNode[] {
    if (options.bounds) this.updateWorldBounds();
    return queryScene(this.root, options);
  }

  updateWorldTransforms(): void {
    this.root.updateWorldTransform();
  }

  updateWorldBounds(): void {
    this.updateWorldTransforms();
    this.root.updateWorldBounds();
  }

  update(): void {
    this.updateWorldBounds();
  }

  traverse(visitor: (node: SceneNode) => void): void {
    this.root.traverse(visitor);
  }

  collectRenderables(): { node: SceneNode; renderable: Renderable }[] {
    return collectRenderables(this.root);
  }

  collectCameras(): Camera[] {
    return this.query({ type: "camera" }).filter((node): node is Camera => node instanceof Camera);
  }

  collectLights(): Light[] {
    return this.query({ type: "light" }).filter((node): node is Light => node instanceof Light);
  }

  removeNode(node: SceneNode): boolean {
    if (node === this.root) return false;
    const descendants: SceneNode[] = [];
    node.traverse((descendant) => descendants.push(descendant));
    const previousParent = node.parent;
    let removed: boolean;
    try {
      removed = node.removeFromParent();
    } catch (error) {
      if (error instanceof RemovalNotificationError && error.committed && error.child === node && error.previousParent === previousParent) {
        for (const descendant of descendants) this.nodesById.delete(descendant.id);
      }
      throw error;
    }
    for (const descendant of descendants) this.nodesById.delete(descendant.id);
    return removed;
  }

  dispose(): void {
    if (this.disposing) return;
    this.disposing = true;
    try {
      const registered = this.getRegisteredNodes();
      const nodes = disposalOrder(this.root, [...this.root.children, ...registered.slice(1), ...this.pendingDisposal]);
      const owned = new Set(nodes);
      const errors: unknown[] = [];
      for (const node of nodes) {
        if (!node.disposed) {
          try {
            node.dispose({ recursive: false });
          } catch (error) {
            errors.push(error);
          }
        }
        if (node.disposed) {
          this.pendingDisposal.delete(node);
        } else {
          this.pendingDisposal.add(node);
          if (node.parent && owned.has(node.parent)) {
            try {
              node.removeFromParent();
            } catch (error) {
              errors.push(error);
            }
          }
        }
      }
      for (const [id, node] of this.nodesById) {
        if (node !== this.root && node.disposed) this.nodesById.delete(id);
      }
      if (errors.length) throw new AggregateError(errors, "One or more scene nodes could not be disposed.");
    } finally {
      this.disposing = false;
    }
  }

  registerSubtree(node: SceneNode): void {
    if (!(node instanceof SceneNode)) {
      throw new ValidationError("SCENE_HIERARCHY", "A scene subtree must start with a scene node.");
    }
    if (node.parent !== null && (!(node.parent instanceof SceneNode) || !Array.isArray(node.parent.children) ||
        node.parent.children.filter((child) => child === node).length !== 1)) {
      throw new ValidationError("SCENE_HIERARCHY", "Scene subtree contains an inconsistent parent link.");
    }
    const nodes: SceneNode[] = [];
    const visited = new Set<SceneNode>();
    const ids = new Set<string>();
    const pending: Array<{ node: SceneNode; parent: SceneNode | null }> = [{ node, parent: node.parent }];
    while (pending.length) {
      const current = pending.pop()!;
      const descendant = current.node;
      if (!(descendant instanceof SceneNode) || visited.has(descendant) || descendant.parent !== current.parent || !Array.isArray(descendant.children)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene subtree contains a cycle, repeated node, or inconsistent parent link.");
      }
      if (descendant.disposed) throw new ValidationError("SCENE_DISPOSED", "Disposed scene nodes cannot be registered.");
      if (this.nodesById.has(descendant.id) || ids.has(descendant.id)) {
        throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${descendant.id}`);
      }
      visited.add(descendant);
      ids.add(descendant.id);
      nodes.push(descendant);
      for (let index = descendant.children.length - 1; index >= 0; index -= 1) {
        pending.push({ node: descendant.children[index]!, parent: descendant });
      }
    }
    for (const descendant of nodes) this.nodesById.set(descendant.id, descendant);
  }

  registerNode(node: SceneNode): void {
    this.register(node);
  }

  private cloneReservedIds(): Set<string> {
    const ids = new Set([...this.nodesById.keys(), ...metadataNodeIds(this.metadata.toJSON())]);
    const visited = new Set<SceneNode>();
    const pending = sceneForestRoots(this.root, this.getRegisteredNodes());
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      ids.add(current.id);
      pending.push(...current.children);
    }
    return ids;
  }

  private register<T extends SceneNode>(node: T): T {
    if (!(node instanceof SceneNode) || node.disposed) {
      throw new ValidationError("SCENE_REGISTRY", "Only live scene nodes can be registered.");
    }
    if (this.nodesById.has(node.id)) throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${node.id}`);
    this.nodesById.set(node.id, node);
    return node;
  }
}

function sceneForestRoots(root: SceneNode, registered: readonly SceneNode[]): SceneNode[] {
  if (root.parent !== null) {
    throw new ValidationError("SCENE_HIERARCHY", "The scene root cannot have a parent.");
  }
  const roots = [root];
  const seenRoots = new Set(roots);
  for (const node of registered) {
    let ancestor = node;
    const chain = new Set<SceneNode>();
    while (ancestor.parent !== null) {
      if (chain.has(ancestor)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene hierarchy contains a parent cycle.");
      }
      chain.add(ancestor);
      const parent = ancestor.parent;
      if (!(parent instanceof SceneNode) || !Array.isArray(parent.children) ||
          parent.children.filter((child) => child === ancestor).length !== 1) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene hierarchy contains an inconsistent parent link.");
      }
      ancestor = parent;
    }
    if (!seenRoots.has(ancestor)) {
      seenRoots.add(ancestor);
      roots.push(ancestor);
    }
  }
  return roots;
}

function disposalOrder(root: SceneNode, starts: readonly SceneNode[]): SceneNode[] {
  const nodes: SceneNode[] = [];
  const state = new Map<SceneNode, "active" | "complete">();
  const parents = new Map<SceneNode, Set<SceneNode>>();
  const rootChildren = new Set<SceneNode>();
  for (const child of root.children) {
    if (!(child instanceof SceneNode) || child.parent !== root || rootChildren.has(child)) {
      throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an inconsistent root link.");
    }
    rootChildren.add(child);
  }
  parents.set(root, rootChildren);
  for (const start of starts) {
    if (!(start instanceof SceneNode)) {
      throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an invalid node.");
    }
    const parent = start.parent;
    if (parent !== null) {
      if (!(parent instanceof SceneNode) || !Array.isArray(parent.children)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an invalid parent.");
      }
      let siblings = parents.get(parent);
      if (!siblings) {
        siblings = new Set();
        for (const sibling of parent.children) {
          if (!(sibling instanceof SceneNode) || siblings.has(sibling)) {
            throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an inconsistent parent link.");
          }
          siblings.add(sibling);
        }
        parents.set(parent, siblings);
      }
      if (!siblings.has(start)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an inconsistent parent link.");
      }
    }
    const pending: Array<{ node: SceneNode; complete: boolean }> = [{ node: start, complete: false }];
    while (pending.length) {
      const { node, complete } = pending.pop()!;
      if (complete) {
        state.set(node, "complete");
        nodes.push(node);
        continue;
      }
      if (!(node instanceof SceneNode) || node === root || !Array.isArray(node.children)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an invalid hierarchy.");
      }
      if (state.get(node) === "active") {
        throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered a hierarchy cycle.");
      }
      if (state.get(node) === "complete") continue;
      const children = new Set<SceneNode>();
      for (const child of node.children) {
        if (!(child instanceof SceneNode) || child.parent !== node || children.has(child)) {
          throw new ValidationError("SCENE_HIERARCHY", "Scene disposal encountered an inconsistent child link.");
        }
        children.add(child);
      }
      state.set(node, "active");
      pending.push({ node, complete: true });
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        pending.push({ node: node.children[index]!, complete: false });
      }
    }
  }
  return nodes;
}

function metadataNodeIds(metadata: SerializedSceneMetadata): string[] {
  return [
    ...(metadata.assets ?? []).flatMap((asset) => asset.nodeIds ?? []),
    ...(metadata.materialAssignments ?? []).map((assignment) => assignment.nodeId),
    ...(metadata.plans ?? []).flatMap((plan) => plan.nodeIds ?? [])
  ];
}
