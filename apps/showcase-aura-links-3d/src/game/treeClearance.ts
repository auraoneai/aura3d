/**
 * Aura Links 3D: keep corridor trees out of the shot camera's line of sight.
 *
 * The shot camera sits about 8-10 m behind the ball on the aim line (2 m to the side) and looks down that line, so a tree
 * whose canopy reaches the corridor from the camera, through the ball, to ~45 m down the aim line hides the shot (the
 * owner saw a big oak between the camera and the target from a rough lie). Before every address (and when the aim turns)
 * the game hides those trees: their instances shrink to nothing in their batches (handle.setInstances, same count, so no
 * rebuild), and come back once the shot moves on. Pure (no engine imports): unit tested offline.
 */
export interface TreeSpot { readonly x: number; readonly z: number; readonly h: number }

export const SHOT_CORRIDOR = {
  /** metres behind the ball the corridor starts (the shot camera) */
  behind: 11,
  /** metres down the aim line it reaches */
  ahead: 45,
  /** half width of the sight corridor itself (m), before the canopy radius */
  halfWidth: 1.6,
  /** canopy radius as a fraction of the tree height (the Idol broadleaves and the procedural canopies are ~0.34-0.39 h) */
  canopyPerHeight: 0.4
} as const;

/** horizontal distance from point p to segment a-b */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** the shot corridor for a ball and an aim yaw (shot direction = (sin yaw, cos yaw)) */
export function shotCorridor(ball: readonly [number, number], yaw: number): { a: [number, number]; b: [number, number] } {
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  return {
    a: [ball[0] - sx * SHOT_CORRIDOR.behind, ball[1] - sz * SHOT_CORRIDOR.behind],
    b: [ball[0] + sx * SHOT_CORRIDOR.ahead, ball[1] + sz * SHOT_CORRIDOR.ahead]
  };
}

/** clearance between a tree's canopy and the corridor centre line (m); negative = the canopy reaches into the sight line */
export function canopyClearance(tree: TreeSpot, ball: readonly [number, number], yaw: number): number {
  const { a, b } = shotCorridor(ball, yaw);
  return segDist(tree.x, tree.z, a[0], a[1], b[0], b[1]) - (SHOT_CORRIDOR.halfWidth + tree.h * SHOT_CORRIDOR.canopyPerHeight);
}

/** indices of the trees to hide for this shot */
export function treesBlockingShot(trees: readonly TreeSpot[], ball: readonly [number, number], yaw: number): Set<number> {
  const out = new Set<number>();
  trees.forEach((t, i) => { if (canopyClearance(t, ball, yaw) < 0) out.add(i); });
  return out;
}
