import { Bounds3 } from "./Bounds.js";
import { Camera } from "./Camera.js";
import { Light } from "./Light.js";
import { Renderable } from "./Renderable.js";
import { SceneNode } from "./SceneNode.js";

export interface SceneQueryOptions {
  name?: string | RegExp;
  /** Match the node's own flag without pruning invisible subtrees. */
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

/**
 * Collect renderables whose entire ancestry through `root` is visible, in the
 * order provided by `traverse`. Transforms are not updated.
 */
export function collectRenderables(root: SceneNode): { node: SceneNode; renderable: Renderable }[] {
  const result: { node: SceneNode; renderable: Renderable }[] = [];
  const visibility = new Map<SceneNode, boolean>();
  // Custom traversals may visit a child before its parent.
  const isVisible = (node: SceneNode): boolean => {
    const cached = visibility.get(node);
    if (cached !== undefined) return cached;
    const parent = node.parent;
    const visible = node.visible && (node === root || parent === null || isVisible(parent));
    visibility.set(node, visible);
    return visible;
  };
  root.traverse((node) => {
    if (!isVisible(node)) return;
    const renderable = node.renderable;
    if (renderable) result.push({ node, renderable });
  });
  return result;
}
