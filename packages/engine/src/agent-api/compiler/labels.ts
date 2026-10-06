// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraLabelNode, AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../nodes/types.js";
import type { WorldLabel, WorldLabelLayer } from "../WorldLabelRenderer.js";
import { camera } from "../nodes/camera.js";
import { createWorldLabelLayer } from "../WorldLabelRenderer.js";
import { geometry } from "../nodes/geometry.js";
import { groups } from "../nodes/groups.js";
import { isRenderableModelNode } from "./observations.js";
import { labelTelemetryRoleFor } from "../LabelTelemetry.js";
import { labels } from "../nodes/labels.js";
import { model } from "../nodes/model.js";
import { primitive } from "../nodes/primitives.js";
import { primitiveGeometryBounds } from "./primitives.js";
import { renderer } from "../devtools/rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";

/**
 * Translate scene label nodes into world-anchored labels for the label layer.
 *
 * `labels.callout(...)` and friends previously reached the scene snapshot and were
 * counted by evidence but drawn only by the canvas2d fallback. Every route with a
 * typed GLB takes the production WebGL2 path, so every production callout was
 * silently dropped. This is the bridge that makes the public label API real in the
 * path public routes actually use.
 */
export function worldLabelsFromSnapshot(snapshot: AuraSceneSnapshot, runtimeNodes?: AuraRuntimeNodeRegistry): readonly WorldLabel[] {
  const labelNodes = groups.flatten(snapshot.nodes).filter((node): node is AuraLabelNode => node.kind === "label");
  return labelNodes.map((node, index) => {
    const runtimeId = node.runtime?.id;
    const runtimeSnapshot = runtimeId ? runtimeNodes?.get(runtimeId)?.snapshot() : undefined;
    if (runtimeSnapshot?.visible === false) {
      return {
        id: node.name ?? `${node.label}-${index + 1}`,
        text: node.text,
        role: labelTelemetryRoleFor(node.label),
        anchor: [0, 0, 0] as const,
        offscreenPolicy: "hide" as const
      };
    }
    const position = (runtimeSnapshot?.position ?? node.position ?? labelDefaultPosition(node)) as AuraVec3;
    const anchor = node.anchorWorldPosition ?? position;
    // Screen offset is derived from the gap between the label box and its anchor,
    // projected as a vertical nudge. A label that requests no separate anchor sits
    // directly on its own position.
    const separated = node.anchorWorldPosition !== undefined;
    return {
      id: node.name ?? `${node.label}-${index + 1}`,
      text: node.text,
      role: labelTelemetryRoleFor(node.label),
      anchor: [position[0], position[1], position[2]] as const,
      leaderAnchor: [anchor[0], anchor[1], anchor[2]] as const,
      screenOffset: separated ? ([0, 0] as const) : ([0, -26] as const),
      color: typeof node.color === "string" ? node.color : undefined,
      background: typeof node.background === "string" ? node.background : undefined,
      // `size` is authored in world units for scene labels; map it onto a legible
      // pixel range rather than using it directly as a font size.
      fontSize: Math.max(11, Math.min(26, Math.round((node.size ?? 0.34) * 46))),
      leader: node.leader === true,
      offscreenPolicy: node.offscreenPolicy ?? (node.label === "hud" ? "draw" : "clamp"),
      /*
       * WS-2.7 — carry the declared option through. This line is the fix.
       *
       * `occlusionAware` has defaulted to true on every label factory since before 1.6 and was never
       * read here, so `WorldLabel` never received it and the renderer had nothing to act on. The option
       * was documented, accepted, and inert.
       */
      occlusionAware: node.occlusionAware ?? true,
      ...(node.label === "hud" && node.screenAnchor ? { screenAnchor: node.screenAnchor } : {}),
      ...(node.label === "hud" && !node.screenAnchor ? { screenAnchor: "top-left" as const } : {})
    } satisfies WorldLabel & { readonly leaderAnchor?: readonly [number, number, number] };
  });
}

/**
 * Mount the world-label layer for a canvas, if the scene has any label nodes.
 *
 * Returns `undefined` in headless or label-free scenes so nothing is created that
 * would then need disposing.
 */
export function createSceneLabelLayer(
  canvas: HTMLCanvasElement | undefined,
  snapshot: AuraSceneSnapshot
): WorldLabelLayer | undefined {
  if (!canvas || typeof document === "undefined") return undefined;
  const hasLabels = groups.flatten(snapshot.nodes).some((node) => node.kind === "label");
  if (!hasLabels) return undefined;
  return createWorldLabelLayer({ container: canvas.parentElement ?? document.body, canvas });
}

/**
 * WS-2.7 — build the occlusion test for a scene's annotations.
 *
 * ## What it does
 *
 * Walks the segment from the camera eye to a label's anchor and asks whether any renderable node's
 * world-space box lies across it. If one does, the thing being annotated is behind geometry.
 *
 * ## Why boxes and not triangles
 *
 * An annotation only needs to know whether its subject is *hidden*, and a node's bounding box answers
 * that at a fraction of the cost of a mesh raycast — one slab test per node against one segment, no BVH,
 * no per-frame allocation of any size. A box is conservative: it can report occlusion slightly early at a
 * silhouette edge. For a label that is the right direction to be wrong in; the alternative, reporting a
 * label as visible when its subject is behind a wall, is the defect being fixed.
 *
 * ## What it deliberately skips
 *
 * The node the label is anchored *to*. Every annotation sits on or just outside its own subject's
 * surface, so including it would report every label as occluded by the very geometry it annotates —
 * the label-shaped version of z-fighting.
 */
export function createSceneLabelOcclusionTest(
  snapshot: AuraSceneSnapshot,
  cameraEye: AuraVec3,
  runtimeNodes?: AuraRuntimeNodeRegistry
): (anchor: readonly [number, number, number]) => boolean {
  interface OccluderBox {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  }
  const occluders: OccluderBox[] = [];
  for (const node of groups.flatten(snapshot.nodes)) {
    if (node.kind !== "primitive" && !isRenderableModelNode(node)) continue;
    if ((node as { visible?: boolean }).visible === false) continue;
    const runtimeSnapshot = node.runtime?.id ? runtimeNodes?.get(node.runtime.id)?.snapshot() : undefined;
    if (runtimeSnapshot?.visible === false) continue;
    const position = (runtimeSnapshot?.position ?? node.position ?? [0, 0, 0]) as AuraVec3;
    const scale = (runtimeSnapshot?.scale ?? node.scale ?? [1, 1, 1]) as AuraVec3;
    /*
     * Local extents from the primitive's own geometry where available, and a unit box otherwise.
     * A model's real bounds come from its asset, which is not loaded synchronously here; the declared
     * scale is the honest approximation and is what the scene author controls.
     */
    const localBounds = node.kind === "primitive" ? primitiveGeometryBounds(node) : undefined;
    const halfLocal: readonly [number, number, number] = localBounds
      ? [
          Math.max(1e-4, (localBounds.max[0] - localBounds.min[0]) / 2),
          Math.max(1e-4, (localBounds.max[1] - localBounds.min[1]) / 2),
          Math.max(1e-4, (localBounds.max[2] - localBounds.min[2]) / 2)
        ]
      : [0.5, 0.5, 0.5];
    const half: readonly [number, number, number] = [
      Math.abs(halfLocal[0] * scale[0]),
      Math.abs(halfLocal[1] * scale[1]),
      Math.abs(halfLocal[2] * scale[2])
    ];
    occluders.push({
      min: [position[0] - half[0], position[1] - half[1], position[2] - half[2]],
      max: [position[0] + half[0], position[1] + half[1], position[2] + half[2]]
    });
  }
  if (occluders.length === 0) return () => false;

  /** Slab test: does the segment eye -> anchor enter this box strictly before reaching the anchor? */
  const segmentHitsBox = (anchor: readonly [number, number, number], box: OccluderBox): boolean => {
    let tEnter = 0;
    let tExit = 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const origin = cameraEye[axis]!;
      const direction = anchor[axis]! - origin;
      const min = box.min[axis]!;
      const max = box.max[axis]!;
      if (Math.abs(direction) < 1e-9) {
        // Parallel to this slab: outside it means the segment can never be inside the box.
        if (origin < min || origin > max) return false;
        continue;
      }
      const t1 = (min - origin) / direction;
      const t2 = (max - origin) / direction;
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tExit = Math.min(tExit, Math.max(t1, t2));
      if (tEnter > tExit) return false;
    }
    /*
     * `tEnter` must be meaningfully before the anchor. A box the anchor merely touches at t ~= 1 is the
     * subject's own surface, not an occluder — the epsilon is what keeps a label from occluding itself.
     */
    return tEnter > 1e-4 && tEnter < 1 - 1e-3;
  };

  return (anchor) => {
    for (const box of occluders) {
      // Skip the box the anchor is inside: that is the subject, and a subject cannot occlude its own label.
      const insideBox = anchor[0] >= box.min[0] && anchor[0] <= box.max[0]
        && anchor[1] >= box.min[1] && anchor[1] <= box.max[1]
        && anchor[2] >= box.min[2] && anchor[2] <= box.max[2];
      if (insideBox) continue;
      if (segmentHitsBox(anchor, box)) return true;
    }
    return false;
  };
}

export function labelDefaultPosition(node: AuraLabelNode): AuraVec3 {
  if (node.screenAnchor === "top-right") return [1.35, 1.85, -0.2];
  if (node.screenAnchor === "bottom-left") return [-1.35, 0.26, -0.2];
  if (node.screenAnchor === "bottom-right") return [1.35, 0.26, -0.2];
  if (node.label === "hud") return [-1.35, 1.85, -0.2];
  return [0, 1.28, 0];
}
