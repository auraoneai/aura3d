import { ValidationError } from "@galileo3d/core";
import { Camera } from "./Camera.js";
import { DirectionalLight } from "./DirectionalLight.js";
import { Light } from "./Light.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import { PerspectiveCamera } from "./PerspectiveCamera.js";
import { PointLight } from "./PointLight.js";
import { Renderable } from "./Renderable.js";
import { collectRenderables, queryScene, type SceneQueryOptions } from "./SceneQuery.js";
import { SceneNode } from "./SceneNode.js";
import { SpotLight } from "./SpotLight.js";

export class Scene {
  readonly root = new SceneNode({ id: "root", name: "root" });
  private readonly nodesById = new Map<string, SceneNode>([[this.root.id, this.root]]);

  createNode(name?: string): SceneNode {
    return this.register(new SceneNode({ name }));
  }

  createPerspectiveCamera(options: ConstructorParameters<typeof PerspectiveCamera>[0] = {}): PerspectiveCamera {
    return this.register(new PerspectiveCamera(options));
  }

  createOrthographicCamera(options: ConstructorParameters<typeof OrthographicCamera>[0] = {}): OrthographicCamera {
    return this.register(new OrthographicCamera(options));
  }

  createLight(kind: "directional" | "point" | "spot", name?: string): DirectionalLight | PointLight | SpotLight {
    const light = kind === "directional" ? new DirectionalLight(name) : kind === "point" ? new PointLight(name) : new SpotLight(name);
    return this.register(light);
  }

  addRenderable(node: SceneNode, renderable: Renderable): void {
    (node as SceneNode & { renderable?: Renderable }).renderable = renderable;
  }

  getNodeById(id: string): SceneNode | undefined {
    return this.nodesById.get(id);
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
    const removed = node.removeFromParent();
    for (const descendant of descendants) this.nodesById.delete(descendant.id);
    return removed;
  }

  registerSubtree(node: SceneNode): void {
    node.traverse((descendant) => {
      if (this.nodesById.has(descendant.id)) {
        throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${descendant.id}`);
      }
      this.nodesById.set(descendant.id, descendant);
    });
  }

  private register<T extends SceneNode>(node: T): T {
    if (this.nodesById.has(node.id)) throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${node.id}`);
    this.nodesById.set(node.id, node);
    return node;
  }
}
