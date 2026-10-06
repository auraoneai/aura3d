// apps/aura-clash-showcase/src/v2/scene/world.ts — rooftop arena (T2.2).
// §6.9.3: metric arena (arenaScale 1.0 — the 0.5876 squash is gone), kept
// textured downtown GLB as the skyline layer beyond the fog card, two neon
// sign props (emissive practicals), wet clearcoat deck. The four root
// "shadow evidence" boxes and the spectator card are deleted; no parked
// nodes, no ambient fill — visibility comes from the rig in lighting.ts.
import { game, instances, model } from "@aura3d/engine";
import { assets } from "../../aura-assets";
import {
  FOG_CARD_MATERIAL, NEON_CYAN_MATERIAL, NEON_PINK_MATERIAL,
  ROOFTOP_DECK_MATERIAL, ROOFTOP_TRIM_MATERIAL, SKYLINE_MATERIAL
} from "./materials";

export const FIGHT_PLANE_Y = 0;
export const FIGHTER_TARGET_HEIGHT = 1.8;
export const STAGE_HALF_WIDTH = 3.4;
/** Runtime node names the fighting rig reads via ctx.subject(...). */
export const P1_NODE = "aura-clash-p1";
export const P2_NODE = "aura-clash-p2";

export interface AuraClashWorldOptions {
  readonly playerStart?: readonly [number, number, number];
  readonly opponentStart?: readonly [number, number, number];
}

export function auraClashWorldNodes(o: AuraClashWorldOptions = {}): readonly unknown[] {
  const p1 = o.playerStart ?? [-1.45, FIGHT_PLANE_Y, 0];
  const p2 = o.opponentStart ?? [1.45, FIGHT_PLANE_Y, 0];
  const nodes: unknown[] = [];

  // Wet rooftop deck + parapet trim (backdrop: castShadow false).
  nodes.push(
    instances.box({
      name: "clash rooftop deck",
      material: ROOFTOP_DECK_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [{ position: [0, -0.06, 0], scale: [9.2, 0.12, 3.2] }]
    }),
    instances.box({
      name: "clash parapet trim",
      material: ROOFTOP_TRIM_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, 0.24, -1.62], scale: [9.2, 0.48, 0.12] },
        { position: [-4.54, 0.24, 0], scale: [0.12, 0.48, 3.2] },
        { position: [4.54, 0.24, 0], scale: [0.12, 0.48, 3.2] }
      ]
    })
  );

  // Neon sign practicals at x ±2.85 (emissive — they represent lit signs).
  nodes.push(
    instances.box({
      name: "clash neon sign pink",
      material: NEON_PINK_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [-2.85, 1.9, -1.58], scale: [0.16, 1.5, 0.1] }]
    }),
    instances.box({
      name: "clash neon sign cyan",
      material: NEON_CYAN_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [2.85, 1.9, -1.58], scale: [0.16, 1.35, 0.1] }]
    })
  );

  // K2 skyline layer beyond a fog card: the kept textured downtown GLB,
  // pushed back and desaturated behind the parapet (setDressing, backdrop).
  nodes.push(
    instances.plane({
      name: "clash far fog card",
      material: FOG_CARD_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [0, 2.1, -4.6], scale: [12.5, 5.2, 1] }]
    }),
    model(assets.arenaNeonDowntownTextured, {
      name: "clash downtown skyline",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 14,
      castShadow: false,
      receiveShadow: false
    }).position(0, -0.4, -13).rotate(0, Math.PI, 0),
    model(assets.arenaRooftopBuilding, {
      name: "clash rooftop flank east",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.2,
      castShadow: false,
      receiveShadow: true
    }).position(6.4, 0, -2.2),
    // Skyline silhouette filler slabs either side of the downtown layer.
    instances.box({
      name: "clash skyline slabs",
      material: SKYLINE_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [-6.8, 2.6, -8.2], scale: [3.4, 5.8, 0.6] },
        { position: [-3.4, 3.4, -9.4], scale: [2.6, 7.4, 0.6] },
        { position: [8.1, 3.0, -8.8], scale: [3.8, 6.6, 0.6] }
      ]
    })
  );

  // Fighters (kept UBC rigs; position/facing driven by the kit each frame).
  nodes.push(
    model(assets.auraClashPlayerRig, {
      name: P1_NODE,
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: FIGHTER_TARGET_HEIGHT,
      castShadow: true,
      receiveShadow: true
    }).position(...p1).rotate(0, Math.PI / 2, 0)
      .runtime(game.runtimeNode(P1_NODE, { tags: ["fighter", "player", "typed-asset"] })),
    model(assets.auraClashRivalRig, {
      name: P2_NODE,
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: FIGHTER_TARGET_HEIGHT,
      castShadow: true,
      receiveShadow: true
    }).position(...p2).rotate(0, -Math.PI / 2, 0)
      .runtime(game.runtimeNode(P2_NODE, { tags: ["fighter", "opponent", "typed-asset"] }))
  );
  return nodes;
}
