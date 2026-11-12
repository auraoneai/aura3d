import { game, instances, material, type AuraMaterialSpec, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { buildSeatedSpectatorSpec } from "../art/proceduralModels";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";
import { SPECTATOR_COUNT } from "./constants";
import { CROWD_SEAT_COUNT } from "./crowd";
import { VENUE_PALETTES } from "./venues";

export { CROWD_SEAT_COUNT };
export const SPECTATOR_COLORS = ["#e06348", "#f2c14e", "#4ea8de", "#52b788", "#f3f0dc", "#c77dff"] as const;

/** Seat position of spectator `i`: two rear rows of six, then two side stands of six. */
export function spectatorSeat(i: number): Vec3 {
  if (i < 12) return [-7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0), i < 6 ? 1.18 : 1.92, i < 6 ? -12.35 : -13.55];
  if (i < 18) return [-9.15, 1.35, -7.5 + (i - 12) * 2.75];
  return [9.15, 1.35, -7.5 + (i - 18) * 2.75];
}

/** Bleacher tiers are static: stepped architectural risers, treads, aisles & side stands stamped into the shared static-box group. */
export function buildBleacherNodes(statics: { box(key: string, material: AuraMaterialSpec, size: Vec3, position: Vec3): void }): NodeInput[] {
  const bleacherMat = material.pbr({ color: VENUE_PALETTES.hard.seat, roughness: 0.85, clearcoat: 0, sheen: 0 });
  // Rear lower & upper stepped seating bowl (preserving exact 0.90 m and 1.65 m seat tread tops for 240-seat World Tour crowd)
  statics.box("bleachers", bleacherMat, [18.6, 0.44, 0.36], [0, 0.22, -11.55]);
  statics.box("bleachers", bleacherMat, [18.8, 0.9, 1.44], [0, 0.45, -12.4]);
  statics.box("bleachers", bleacherMat, [19.4, 1.28, 0.44], [0, 0.64, -13.02]);
  statics.box("bleachers", bleacherMat, [19.8, 1.65, 1.48], [0, 0.825, -13.6]);
  statics.box("bleachers", bleacherMat, [20.4, 2.24, 0.46], [0, 1.12, -14.52]);
  // Side court stands (lower entry step + 1.10 m seating tier + rear safety parapet)
  for (const sx of [-1, 1] as const) {
    statics.box("bleachers", bleacherMat, [0.36, 0.56, 18.0], [sx * 8.32, 0.28, -0.8]);
    statics.box("bleachers", bleacherMat, [1.52, 1.1, 18.2], [sx * 9.2, 0.55, -0.8]);
    statics.box("bleachers", bleacherMat, [0.28, 1.58, 18.4], [sx * 10.05, 0.79, -0.8]);
  }
  return [];
}

/** All spectators are one instanced sculpted seated figure (`<= 240` tris, `clearcoat: 0, sheen: 0`, per-instance colours). */
export function buildSpectatorNodes(): NodeInput[] {
  const transforms = Array.from({ length: SPECTATOR_COUNT }, (_, i) => ({ position: spectatorSeat(i), scale: [1, 1, 1] as Vec3 }));
  const colors = Array.from({ length: SPECTATOR_COUNT }, (_, i) => SPECTATOR_COLORS[i % SPECTATOR_COLORS.length]!);
  return [
    instances
      .custom(buildSeatedSpectatorSpec(), {
        castShadow: false,
        name: "spectators",
        material: material.pbr({ color: "#ffffff", roughness: 0.78, clearcoat: 0, sheen: 0 }),
        transforms,
        colors
      })
      .runtime(game.runtimeNode("spectators")) as unknown as NodeInput
  ];
}

/** Idle sway, or a bounce when the point is over / the match ended. */
export function spectatorBounce(i: number, t: number, cheering: boolean): number {
  return cheering ? Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.12 : Math.sin(t * 2.2 + i) * 0.015;
}

/**
 * Per-frame spectator write. Dense matrices into one preallocated buffer (no per-frame objects or arrays, C12). The instance
 * colours stay the ones the node was built with: `setInstanceMatrices` without rgba keeps the spec colours, while the old
 * `setInstances(transforms)` call cleared them and drew all 24 capsules in the white base material (C1).
 */
export interface SpectatorUpdater {
  update(handle: AuraRuntimeNodeHandle, t: number, cheering: boolean): void;
  readonly matrices: Float32Array;
}

export function createSpectatorUpdater(): SpectatorUpdater {
  const matrices = new Float32Array(SPECTATOR_COUNT * 16);
  const baseY = new Float32Array(SPECTATOR_COUNT);
  for (let i = 0; i < SPECTATOR_COUNT; i++) {
    const o = i * 16;
    const [sx, sy, sz] = spectatorSeat(i);
    matrices[o] = 1; matrices[o + 5] = 1; matrices[o + 10] = 1; matrices[o + 15] = 1;
    matrices[o + 12] = sx; matrices[o + 13] = sy; matrices[o + 14] = sz;
    baseY[i] = sy;
  }
  return {
    matrices,
    update(handle, t, cheering) {
      for (let i = 0; i < SPECTATOR_COUNT; i++) {
        matrices[i * 16 + 13] = baseY[i]! + spectatorBounce(i, t, cheering);
      }
      handle.setInstanceMatrices(matrices, SPECTATOR_COUNT);
    }
  };
}

const sharedUpdater = createSpectatorUpdater();

/** Kept for callers of the old function; uses one shared preallocated buffer. */
export function updateSpectators(handle: AuraRuntimeNodeHandle, t: number, cheering: boolean): void {
  sharedUpdater.update(handle, t, cheering);
}
