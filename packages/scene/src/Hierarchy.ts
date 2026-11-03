import { assertCanParent, type AddChildOptions, type SceneNode } from "./SceneNode.js";

export function isAncestor(ancestor: SceneNode, node: SceneNode): boolean {
  return ancestor.isAncestorOf(node);
}

export function reparent(node: SceneNode, newParent: SceneNode, options: AddChildOptions = {}): void {
  assertCanParent(newParent, node);
  newParent.addChild(node, options);
}

/**
 * Reparent nodes in order, stopping at the first failure. Earlier moves remain
 * applied and later nodes are not attempted. A preflight failure leaves the
 * failing node unchanged. A listener error with `committed: true` means that
 * node's edit was committed; the error is propagated unchanged.
 */
export function batchReparent(nodes: readonly SceneNode[], newParent: SceneNode, options: AddChildOptions = {}): void {
  for (const node of nodes) reparent(node, newParent, options);
}

export function removeAllChildren(node: SceneNode): SceneNode[] {
  const removed = [...node.children];
  for (const child of removed) node.removeChild(child);
  return removed;
}
