// apps/aura-clash-showcase/src/v2/scene/world.ts — rooftop arena (T2.2).
// §6.9.3: metric arena (arenaScale 1.0 — the 0.5876 squash is gone), kept
// textured downtown GLB as the skyline layer beyond the fog card, two neon
// sign props (emissive practicals), wet clearcoat deck. The four root
// "shadow evidence" boxes and the spectator card are deleted; no parked
// nodes, no ambient fill — visibility comes from the rig in lighting.ts.
// Look brief (aura3d-art-direction, fighting row `arena-fight`):
//   time of day — night, after rain, under a single warm overhead spot;
//   palette — dark blue-grey arena + wet slate deck, magenta/cyan neon accents;
//   mood — spotlit rooftop ring in a dark crowdless city, hard key, deep shadow.
import { game, instances, model, primitives, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../aura-assets";
import {
  FOG_CARD_MATERIAL, HIT_FLASH_MATERIAL, NEON_CYAN_MATERIAL, NEON_PINK_MATERIAL,
  ROOFTOP_DECK_MATERIAL, ROOFTOP_TRIM_MATERIAL, SKYLINE_MATERIAL, STAGE_BORDER_MATERIAL
} from "./materials";

export const FIGHT_PLANE_Y = 0;
export const FIGHTER_TARGET_HEIGHT = 1.8;
export const STAGE_HALF_WIDTH = 3.4;
/** Runtime node names the fighting rig reads via ctx.subject(...). */
export const P1_NODE = "aura-clash-p1";
export const P2_NODE = "aura-clash-p2";
export const HIT_FLASH_NODE = "clash-hit-flash";

export interface AuraClashWorldOptions {
  readonly playerStart?: readonly [number, number, number];
  readonly opponentStart?: readonly [number, number, number];
}

export function auraClashWorldNodes(o: AuraClashWorldOptions = {}): readonly AuraNodeInput[] {
  const p1 = o.playerStart ?? [-1.45, FIGHT_PLANE_Y, 0];
  const p2 = o.opponentStart ?? [1.45, FIGHT_PLANE_Y, 0];
  const nodes: AuraNodeInput[] = [];

  // Reflective center ring floor + lacquered stage border + brushed-metal parapet/pillars.
  nodes.push(
    instances.box({
      name: "clash rooftop deck",
      material: ROOFTOP_DECK_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [{ position: [0, -0.06, 0], scale: [9.2, 0.12, 3.2] }]
    }),
    instances.box({
      name: "clash stage border",
      material: STAGE_BORDER_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, 0.02, -1.48], scale: [7.36, 0.04, 0.16] },
        { position: [0, 0.02, 1.48], scale: [7.36, 0.04, 0.16] },
        { position: [-3.6, 0.02, 0], scale: [0.16, 0.04, 2.8] },
        { position: [3.6, 0.02, 0], scale: [0.16, 0.04, 2.8] }
      ]
    }),
    instances.box({
      name: "clash parapet trim",
      material: ROOFTOP_TRIM_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, 0.24, -1.62], scale: [9.2, 0.48, 0.12] },
        { position: [0, 0.62, -1.62], scale: [9.2, 0.06, 0.08] },
        { position: [-4.54, 0.24, 0], scale: [0.12, 0.48, 3.2] },
        { position: [4.54, 0.24, 0], scale: [0.12, 0.48, 3.2] },
        { position: [-3.6, 0.55, -1.56], scale: [0.22, 1.1, 0.22] },
        { position: [3.6, 0.55, -1.56], scale: [0.22, 1.1, 0.22] },
        { position: [-4.54, 0.55, -1.56], scale: [0.2, 1.1, 0.2] },
        { position: [4.54, 0.55, -1.56], scale: [0.2, 1.1, 0.2] }
      ]
    }),
    // Deep urban rooftop substructure skirt under the arena slab (y < 0) so the
    // stage sits on a grounded skyscraper crown rather than floating in space.
    instances.box({
      name: "clash rooftop substructure mass",
      material: STAGE_BORDER_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, -2.4, -0.1], scale: [9.2, 4.6, 3.16] },
        { position: [-6.4, -2.6, -2.6], scale: [5.4, 4.6, 4.2] },
        { position: [6.4, -2.6, -2.6], scale: [5.4, 4.6, 4.2] },
        { position: [0, -3.2, -5.8], scale: [24.0, 5.6, 6.0] }
      ]
    }),
    instances.box({
      name: "clash rooftop substructure ribs",
      material: ROOFTOP_TRIM_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [0, -0.22, 0], scale: [9.44, 0.2, 3.36] },
        { position: [0, -0.68, 1.54], scale: [9.36, 0.14, 0.18] },
        { position: [0, -1.35, 1.54], scale: [9.36, 0.14, 0.18] },
        { position: [-4.4, -1.8, 1.52], scale: [0.28, 3.2, 0.22] },
        { position: [-2.2, -1.8, 1.52], scale: [0.24, 3.2, 0.2] },
        { position: [0, -1.8, 1.52], scale: [0.28, 3.2, 0.22] },
        { position: [2.2, -1.8, 1.52], scale: [0.24, 3.2, 0.2] },
        { position: [4.4, -1.8, 1.52], scale: [0.28, 3.2, 0.22] }
      ]
    })
  );

  // Grounded neon floor-edge trim strips at y = 0.04 and substructure cornice accents (emissive practicals).
  nodes.push(
    instances.box({
      name: "clash neon sign pink",
      material: NEON_PINK_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [-2.1, 0.04, -1.36], scale: [2.6, 0.04, 0.08] },
        { position: [-3.48, 0.04, 0], scale: [0.08, 0.04, 2.6] },
        { position: [-2.2, -0.34, 1.58], scale: [3.8, 0.04, 0.06] },
        { position: [-9.2, 3.2, -16.2], scale: [2.4, 0.12, 0.12] },
        { position: [-4.8, 4.6, -17.4], scale: [2.0, 0.12, 0.12] }
      ]
    }),
    instances.box({
      name: "clash neon sign cyan",
      material: NEON_CYAN_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [2.1, 0.04, -1.36], scale: [2.6, 0.04, 0.08] },
        { position: [3.48, 0.04, 0], scale: [0.08, 0.04, 2.6] },
        { position: [2.2, -0.34, 1.58], scale: [3.8, 0.04, 0.06] },
        { position: [4.8, 4.2, -17.4], scale: [2.2, 0.12, 0.12] },
        { position: [9.4, 3.4, -16.2], scale: [2.4, 0.12, 0.12] }
      ]
    })
  );

  // K2 skyline layer beyond a fog card: the kept textured downtown GLB,
  // flanked symmetrically on west and east by rooftop buildings and backed by
  // a continuous distant city skyline silhouette so no edge cutouts appear.
  nodes.push(
    instances.box({
      name: "clash far fog card",
      material: FOG_CARD_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [0, -1.8, -10.5], scale: [28.0, 2.4, 0.4] }]
    }),
    model(assets.arenaNeonDowntownTextured, {
      name: "clash downtown skyline",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 16,
      castShadow: false,
      receiveShadow: false,
      // Instruction-copy signs stay filtered (legacy :872-877 dropped them as
      // placeholder overlay); the main marquee and props are kept.
      hiddenNodeNames: [
        "AuraClash_Sign_NEON ROOFTOP",
        "AuraClash_Sign_FIGHT READY"
      ]
    }).position(-0.8, -0.5, -13.2).rotate(0, Math.PI, 0),
    model(assets.arenaRooftopBuilding, {
      name: "clash rooftop flank west",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.4,
      castShadow: false,
      receiveShadow: true
    }).position(-6.2, -0.35, -2.5),
    model(assets.arenaRooftopBuilding, {
      name: "clash rooftop flank east",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.4,
      castShadow: false,
      receiveShadow: true
    }).position(6.2, -0.35, -2.5),
    // Distant city skyline silhouette behind the downtown layer (z <= -16.5 so
    // no slab ever clips in front of the brick building facade).
    instances.box({
      name: "clash skyline slabs",
      material: SKYLINE_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: [
        { position: [-12.5, 1.8, -17.5], scale: [4.2, 9.6, 1.2] },
        { position: [-8.8, 2.6, -16.8], scale: [3.6, 11.2, 1.2] },
        { position: [-4.6, 3.2, -18.2], scale: [3.8, 12.4, 1.2] },
        { position: [0, 3.6, -19.0], scale: [5.2, 13.2, 1.2] },
        { position: [4.8, 3.0, -18.2], scale: [3.8, 12.0, 1.2] },
        { position: [9.0, 2.4, -16.8], scale: [3.8, 10.8, 1.2] },
        { position: [12.8, 1.6, -17.5], scale: [4.4, 9.2, 1.2] }
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

  // §14.4 hit flash: runtime-toggled light-representing sphere (the engine's
  // point lights aren't runtime-togglable); parked under the deck between
  // hits, parked at the contact point for exactly 80 ms when one lands.
  nodes.push(
    primitives.sphere({
      name: HIT_FLASH_NODE,
      material: HIT_FLASH_MATERIAL,
      castShadow: false,
      receiveShadow: false
    }).position(0, -3, 0).scale(0.34)
      .runtime(game.runtimeNode(HIT_FLASH_NODE, { tags: ["fx", "hit-flash"] }))
  );
  return nodes;
}
