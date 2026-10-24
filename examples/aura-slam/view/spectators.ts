import { game, instances, material, type AuraMaterialSpec, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";
import { SPECTATOR_COUNT } from "./constants";

export const SPECTATOR_COLORS = ["#e06348", "#f2c14e", "#4ea8de", "#52b788", "#f3f0dc", "#c77dff"] as const;

/** Seat position of spectator `i`: two rear rows of six, then two side stands of six. */
export function spectatorSeat(i: number): Vec3 {
  if (i < 12) return [-7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0), i < 6 ? 1.18 : 1.92, i < 6 ? -12.35 : -13.55];
  if (i < 18) return [-9.15, 1.35, -7.5 + (i - 12) * 2.75];
  return [9.15, 1.35, -7.5 + (i - 18) * 2.75];
}

/** Bleacher tiers are static: they are stamped into the shared static-box groups instead of being four draw calls. */
export function buildBleacherNodes(statics: { box(key: string, material: AuraMaterialSpec, size: Vec3, position: Vec3): void }): NodeInput[] {
  const bleacherMat = material.pbr({ color: "#223b47", roughness: 0.85 });
  statics.box("bleachers", bleacherMat, [18.5, 0.9, 1.4], [0, 0.45, -12.4]);
  statics.box("bleachers", bleacherMat, [19.4, 1.65, 1.4], [0, 0.825, -13.6]);
  statics.box("bleachers", bleacherMat, [1.5, 1.1, 18.0], [-9.2, 0.55, -0.8]);
  statics.box("bleachers", bleacherMat, [1.5, 1.1, 18.0], [9.2, 0.55, -0.8]);
  return [];
}

/** All spectators are one instanced capsule (one draw, per-instance colours) instead of 24 nodes. */
export function buildSpectatorNodes(): NodeInput[] {
  const transforms = Array.from({ length: SPECTATOR_COUNT }, (_, i) => ({ position: spectatorSeat(i), scale: [1, 1, 1] as Vec3 }));
  const colors = Array.from({ length: SPECTATOR_COUNT }, (_, i) => SPECTATOR_COLORS[i % SPECTATOR_COLORS.length]!);
  return [
    instances
      .capsule({
        castShadow: false, name: "spectators",
        size: [0.32, 0.6, 0.32],
        material: material.pbr({ color: "#ffffff", roughness: 0.78 }),
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

export function updateSpectators(handle: AuraRuntimeNodeHandle, t: number, cheering: boolean): void {
  const transforms = Array.from({ length: SPECTATOR_COUNT }, (_, i) => {
    const [sx, sy, sz] = spectatorSeat(i);
    return { position: [sx, sy + spectatorBounce(i, t, cheering), sz] as Vec3, scale: [1, 1, 1] as Vec3 };
  });
  handle.setInstances(transforms);
}
