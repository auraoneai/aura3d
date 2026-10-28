// Beat-three.js WP-S.2: `interactions.orbit({ target: [x, y, z], position, autoRotate })` configures the scene's
// orbit camera. Every camera path (compiler/camera.ts, the rigs, the controller) reads the camera spec, so the
// interaction is folded into the spec once, when the snapshot is built, and each path honours it unchanged.

import type { AuraCameraSpec, AuraInteractionNode, AuraSceneNode, AuraVec3 } from "./types.js";

function orbitInteractions(nodes: readonly AuraSceneNode[], found: AuraInteractionNode[] = []): AuraInteractionNode[] {
  for (const node of nodes) {
    if (node.kind === "interaction" && node.mode === "orbit") found.push(node);
    else if (node.kind === "group") orbitInteractions(node.children, found);
  }
  return found;
}

/**
 * Returns `camera` with the scene's orbit interaction folded in: `targetPoint` becomes the camera `target` (and
 * the eye keeps its offset from it unless `orbitPosition` pins it), `orbitPosition` becomes `position`, and
 * `autoRotate` becomes the camera's orbit speed. Non-orbit cameras and scenes without such an interaction are
 * returned untouched. When several orbit interactions set the same field the last one wins.
 */
export function applyOrbitInteraction(camera: AuraCameraSpec, nodes: readonly AuraSceneNode[]): AuraCameraSpec {
  if (camera.mode !== "orbit") return camera;
  let target: AuraVec3 | undefined;
  let position: AuraVec3 | undefined;
  let autoRotate: number | undefined;
  for (const node of orbitInteractions(nodes)) {
    if (node.targetPoint) target = node.targetPoint;
    if (node.orbitPosition) position = node.orbitPosition;
    if (node.autoRotate !== undefined) autoRotate = node.autoRotate;
  }
  if (!target && !position && autoRotate === undefined) return camera;
  let eye = camera.position;
  if (position) eye = position;
  else if (target && camera.position && camera.target) {
    eye = [
      camera.position[0] + target[0] - camera.target[0],
      camera.position[1] + target[1] - camera.target[1],
      camera.position[2] + target[2] - camera.target[2]
    ];
  }
  return {
    ...camera,
    ...(target ? { target } : {}),
    ...(eye ? { position: eye } : {}),
    ...(autoRotate !== undefined ? { autoRotate } : {})
  };
}
