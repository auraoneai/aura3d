import type { AuraMaterialSpec, AuraSceneNode } from "./types.js";

/** Do not let a native preview fall through a non-primitive material bridge. */
export function assertDepthPreviewTarget(kind: string, material: AuraMaterialSpec | undefined): void {
  if (material?.kind === "depth-preview" && kind !== "primitive") {
    throw new Error(`DEPTH_PREVIEW_TARGET_UNSUPPORTED: material.depth supports triangle primitives, not ${kind} nodes`);
  }
}

/** Apply the same check to plain scene snapshots and nested groups. */
export function assertDepthPreviewTargetTree(node: AuraSceneNode): void {
  if ("material" in node) assertDepthPreviewTarget(node.kind, node.material);
  if (node.kind === "group") for (const child of node.children) assertDepthPreviewTargetTree(child);
}
