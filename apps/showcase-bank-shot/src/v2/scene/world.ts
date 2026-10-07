// apps/showcase-bank-shot/src/v2/scene/world.ts — pool-hall world (T2.2).
// §6.9.1: hero table + 16 balls + cue on the admitted typed assets; the K4
// pool-hall set is not landed yet, so the room is a restrained greybox
// stand-in (walls, wainscot, bar, stools, cue rack, pendant shades, framed
// prints) with NO emissive fill — the pendant spot is the only light.
// Direction.standIns[] tracks the swap to the K4 set.
import { game, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { BALL_RADIUS } from "../../gameplay/table";
import { AIM_LINE_MATERIAL, DARK_WOOD_MATERIAL, LEATHER_MATERIAL, WALNUT_MATERIAL } from "./materials";
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const BALL_VISUAL_SCALE = BALL_RADIUS * 2.9;
export const BALL_VISUAL_RADIUS = BALL_VISUAL_SCALE / 2;
export const BALL_VISUAL_LIFT = Math.max(0, BALL_VISUAL_RADIUS - BALL_RADIUS + 0.001);
export const BALL_SURFACE_Y = BALL_RADIUS + BALL_VISUAL_LIFT;

const WALL_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#241a12", roughness: 0.85, metallic: 0 });
const FLOOR_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#120d08", roughness: 0.6, metallic: 0.05 });
const PRINT_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#1c1410", roughness: 0.75, metallic: 0 });
const SHADE_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#0d3d2e", roughness: 0.4, metallic: 0.3 });
const BRASS_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#7a5518", roughness: 0.35, metallic: 0.8 });

function box(name: string, mat: AuraMaterialSpec, at: [number, number, number], size: [number, number, number]): AuraSceneNode {
  return primitives.box({ name, material: mat, castShadow: false, receiveShadow: true })
    .position(...at).scale(size).toJSON();
}

/** Greybox pool hall: floor, walls, wainscot, bar, stools, rack, shades, prints. */
export function poolHallRoom(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  // Floor + rug under the table (backdrop: no castShadow).
  nodes.push(box("hall-floor", FLOOR_MATERIAL, [0, -0.5, 0], [11, 0.1, 8]));
  nodes.push(box("table-rug", WALNUT_MATERIAL, [0, -0.44, 0], [4.4, 0.02, 3.0]));
  // Walls + wainscot (room luminance falls off past ~3 m by material, not fill).
  nodes.push(box("wall-north", WALL_MATERIAL, [0, 1.9, -3.4], [11, 4.9, 0.2]));
  nodes.push(box("wall-south", WALL_MATERIAL, [0, 1.9, 3.4], [11, 4.9, 0.2]));
  nodes.push(box("wall-east", WALL_MATERIAL, [5.4, 1.9, 0], [0.2, 4.9, 8]));
  nodes.push(box("wall-west", WALL_MATERIAL, [-5.4, 1.9, 0], [0.2, 4.9, 8]));
  nodes.push(box("wainscot-n", WALNUT_MATERIAL, [0, 0.35, -3.28], [11, 0.8, 0.08]));
  nodes.push(box("wainscot-s", WALNUT_MATERIAL, [0, 0.35, 3.28], [11, 0.8, 0.08]));
  nodes.push(box("wainscot-e", WALNUT_MATERIAL, [5.28, 0.35, 0], [0.08, 0.8, 8]));
  nodes.push(box("wainscot-w", WALNUT_MATERIAL, [-5.28, 0.35, 0], [0.08, 0.8, 8]));
  // Bar counter along the west wall + two stools.
  nodes.push(box("bar-counter", WALNUT_MATERIAL, [-4.6, 0.55, 1.6], [0.7, 1.1, 2.4]));
  nodes.push(box("bar-top", WALNUT_MATERIAL, [-4.6, 1.12, 1.6], [0.78, 0.06, 2.5]));
  for (const z of [0.9, 2.2]) {
    nodes.push(box(`bar-stool-${z}`, LEATHER_MATERIAL, [-3.7, 0.35, z], [0.42, 0.7, 0.42]));
  }
  // Cue rack on the east wall + two resting cues (brass tips).
  nodes.push(box("cue-rack", WALNUT_MATERIAL, [5.1, 1.2, -1.4], [0.12, 1.4, 0.5]));
  for (const z of [-1.52, -1.28]) {
    nodes.push(box(`rack-cue-${z}`, DARK_WOOD_MATERIAL, [5.0, 1.15, z], [0.04, 1.5, 0.04]));
    nodes.push(box(`rack-cue-tip-${z}`, BRASS_MATERIAL, [5.0, 1.93, z], [0.035, 0.06, 0.035]));
  }
  // Pendant lamp shade over the table centre (non-emissive; light is the spot).
  nodes.push(
    primitives.cylinder({ name: "pendant-shade", material: SHADE_MATERIAL, castShadow: false, receiveShadow: false })
      .position(0, 2.35, 0).scale([0.62, 0.34, 0.62]).toJSON()
  );
  nodes.push(box("pendant-rod", BRASS_MATERIAL, [0, 3.4, 0], [0.03, 1.9, 0.03]));
  // Framed prints on the north wall (dark frames, no unlit-cards).
  for (const x of [-2.6, -0.2, 2.2]) {
    nodes.push(box(`print-frame-${x}`, WALNUT_MATERIAL, [x, 1.7, -3.27], [1.0, 0.75, 0.05]));
    nodes.push(box(`print-canvas-${x}`, PRINT_MATERIAL, [x, 1.7, -3.24], [0.86, 0.61, 0.02]));
  }
  return nodes;
}

/** Hero table + 16 balls + cue + ghost + aim guides, runtime-tagged. */
export function playfieldNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(
    model(assets.bankShotTable, {
      name: "table",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: false,
      receiveShadow: true
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("table", { tags: ["typed-asset"] }))
      .toJSON()
  );
  for (let number = 0; number <= 15; number += 1) {
    const id = `bankShotBall${String(number).padStart(2, "0")}`;
    const name = `ball-${String(number).padStart(2, "0")}`;
    nodes.push(
      model(assets[id as keyof typeof assets] as typeof assets.bankShotBall00, {
        name,
        role: "primaryCharacter",
        scaleMode: "world"
      })
        .position(0, -5, 0)
        .scale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE])
        .runtime(game.runtimeNode(name, { tags: ["typed-asset", "physics-synced"] }))
        .toJSON()
    );
  }
  nodes.push(
    model(assets.bankShotCue, {
      name: "cue-stick",
      role: "setDressing",
      scaleMode: "world"
    })
      .position(0, -5, 0)
      .scale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE])
      .runtime(game.runtimeNode("cue-stick", { tags: ["typed-asset", "cue"] }))
      .toJSON()
  );
  nodes.push(
    model(assets.bankShotBall00, {
      name: "cue-ghost",
      role: "setDressing",
      scaleMode: "world"
    })
      .position(0, -5, 0)
      .runtime(game.runtimeNode("cue-ghost", { tags: ["cue-ghost"] }))
      .toJSON()
  );
  nodes.push(
    primitives.box({ name: "aim-line", material: AIM_LINE_MATERIAL, castShadow: false, receiveShadow: false })
      .position(0, -5, 0).scale([1, 0.006, 0.006])
      .runtime(game.runtimeNode("aim-line", { tags: ["aim-preview"] }))
      .toJSON()
  );
  nodes.push(
    primitives.box({ name: "aim-bank", material: AIM_LINE_MATERIAL, castShadow: false, receiveShadow: false })
      .position(0, -5, 0).scale([1, 0.005, 0.005])
      .runtime(game.runtimeNode("aim-bank", { tags: ["aim-preview"] }))
      .toJSON()
  );
  return nodes;
}
