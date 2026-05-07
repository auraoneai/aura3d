import { Bounds3 } from "./Bounds.js";
import { Camera } from "./Camera.js";
import { Light } from "./Light.js";
import { Renderable } from "./Renderable.js";
import { SceneNode } from "./SceneNode.js";

export interface SceneQueryOptions {
  name?: string | RegExp;
  visible?: boolean;
  layerMask?: number;
  type?: "camera" | "light" | "node";
  bounds?: Bounds3;
}

export function queryScene(root: SceneNode, options: SceneQueryOptions): SceneNode[] {
  const result: SceneNode[] = [];
  root.traverse((node) => {
    if (options.visible !== undefined && node.visible !== options.visible) return;
    if (options.layerMask !== undefined && (node.layerMask & options.layerMask) === 0) return;
    if (options.name !== undefined) {
      const matches = typeof options.name === "string" ? node.name === options.name : options.name.test(node.name);
      if (!matches) return;
    }
    if (options.type === "camera" && !(node instanceof Camera)) return;
    if (options.type === "light" && !(node instanceof Light)) return;
    if (options.bounds && !node.worldBounds.intersects(options.bounds)) return;
    result.push(node);
  });
  return result;
}

export function collectRenderables(root: SceneNode): { node: SceneNode; renderable: Renderable }[] {
  const result: { node: SceneNode; renderable: Renderable }[] = [];
  root.traverse((node) => {
    const maybe = (node as SceneNode & { renderable?: Renderable }).renderable;
    if (maybe && node.visible) result.push({ node, renderable: maybe });
  });
  return result;
}
