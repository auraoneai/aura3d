import type { AuraSceneNode } from "../nodes/types.js";

/**
 * The app flattens its scene before the compiler sees it, so a top-level group (or look) with a runtime id is gone by then:
 * `app.nodes.remove(id)` on it found nothing and left its children live (Cross Hop `swapLook` kept the first theme's look).
 * The app flattens each top-level node on its own and tags the nodes it produced with that node's runtime id; the compiled
 * scene groups them back under that id for `removeSubtree`.
 */
const mountedRoot = new WeakMap<AuraSceneNode, string>();

/** Flattens `nodes` one top-level node at a time with `flatten` and tags each output node with its root's runtime id. */
export function flattenTaggingMountedRoots(
  nodes: readonly AuraSceneNode[],
  flatten: (nodes: readonly AuraSceneNode[]) => readonly AuraSceneNode[]
): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  for (const node of nodes) {
    const part = flatten([node]);
    const id = "runtime" in node ? node.runtime?.id : undefined;
    if (id && (node.kind === "group" || part.length !== 1 || part[0] !== node)) for (const flat of part) mountedRoot.set(flat, id);
    out.push(...part);
  }
  return out;
}

/** Runtime id of the mounted group or look `node` was flattened out of, if any. */
export function mountedRootOf(node: AuraSceneNode): string | undefined {
  return mountedRoot.get(node);
}
