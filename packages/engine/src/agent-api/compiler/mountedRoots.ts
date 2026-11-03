import type { AuraSceneNode } from "../nodes/types.js";
import type { SceneGroupSpan } from "../sceneMath.js";

/**
 * The app flattens its scene before the compiler sees it. Keep the authored
 * ownership of each flattened node without changing its transform or identity.
 */
const mountedRoot = new WeakMap<AuraSceneNode, string>();

/** A group occupies a contiguous slice in the already-flattened result. */
export interface MountedGroupSpan {
  readonly id: string;
  readonly node: AuraSceneNode & { readonly kind: "group" };
  readonly ancestors: SceneGroupSpan["ancestors"];
  readonly parentId?: string;
  readonly start: number;
  readonly end: number;
}

const mountedGroups = new WeakMap<readonly AuraSceneNode[], readonly MountedGroupSpan[]>();

/** Group metadata survives the app-to-compiler handoff through array identity. */
export function mountedGroupSpansOf(nodes: readonly AuraSceneNode[]): readonly MountedGroupSpan[] | undefined {
  return mountedGroups.get(nodes);
}

/** Flattens each root once and records the groups observed during that pass. */
export function flattenTaggingMountedRoots(
  nodes: readonly AuraSceneNode[],
  flatten: (nodes: readonly AuraSceneNode[], options?: { readonly onGroupSpan?: (span: SceneGroupSpan) => void }) => readonly AuraSceneNode[]
): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  const groups: MountedGroupSpan[] = [];
  const ids = new Set<string>();
  for (const node of nodes) {
    const base = out.length;
    const spans: SceneGroupSpan[] = [];
    const part = flatten([node], { onGroupSpan: (span) => { spans.push(span); } });
    const id = "runtime" in node ? node.runtime?.id : undefined;
    if (id && (node.kind === "group" || part.length !== 1 || part[0] !== node)) for (const flat of part) mountedRoot.set(flat, id);
    for (const span of spans) {
      const groupId = span.group.runtime?.id;
      if (!groupId) continue;
      if (ids.has(groupId)) throw new Error(`DUPLICATE_GROUP_RUNTIME_ID: ${groupId}`);
      ids.add(groupId);
      let parentId: string | undefined;
      for (let index = span.ancestors.length - 1; index >= 0; index -= 1) {
        parentId = span.ancestors[index]?.runtime?.id;
        if (parentId) break;
      }
      groups.push({ id: groupId, node: span.group, ancestors: span.ancestors, ...(parentId ? { parentId } : {}), start: base + span.start, end: base + span.end });
    }
    out.push(...part);
  }
  mountedGroups.set(out, groups);
  return out;
}

/** Runtime id of the mounted group or look `node` was flattened out of, if any. */
export function mountedRootOf(node: AuraSceneNode): string | undefined {
  return mountedRoot.get(node);
}
