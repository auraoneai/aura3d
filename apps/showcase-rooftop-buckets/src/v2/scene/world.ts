// apps/showcase-rooftop-buckets/src/v2/scene/world.ts — rooftop world (T2.2).
// §6.9.6: court + glass backboard + rim GLBs on an open skyline (tower
// silhouettes, sun disc, horizon glow — sky stays visible above the ledges).
// Skinned scorer/defender mount `rooftopLayupScorer`/`rooftopDefender` with
// real clips via C-19 (crossFadeTo drives them in boot.ts). No emissive fill.
import { game, instances, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { BACKBOARD_POSITION, HOOP_BASE_POSITION, COURT_SPOTS } from "../../gameplay/court";
import {
  AIM_MATERIAL, BOARD_FRAME, CONTACT_MISS, GLASS_BOARD, HORIZON_GLOW,
  LEDGE_MATERIAL, NET_MATERIAL, RIM_GLOW, SUN_DISC, TOWER_MATERIAL
} from "./materials";

const ATHLETE_SCALE = 1.18;
// The release GLBs report a raw minimum Y of −1.016 at this scale.
const ATHLETE_FLOOR_OFFSET = 1.016 * ATHLETE_SCALE;

/** Open skyline: ledges, sun disc, horizon glow, instanced tower silhouettes. */
export function skylineNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  // Court ledges (backdrop dressing — no shadows cast).
  const ledges: [number, number, number, number, number, number][] = [
    [0, 0.45, -5.8, 18.4, 0.9, 0.6],
    [0, 0.45, 13.8, 18.4, 0.9, 0.6],
    [-8.8, 0.45, 4.0, 0.6, 0.9, 19.2],
    [8.8, 0.45, 4.0, 0.6, 0.9, 19.2]
  ];
  for (const [x, y, z, sx, sy, sz] of ledges) {
    nodes.push(
      primitives.box({ name: `ledge-${x}-${z}`, material: LEDGE_MATERIAL, castShadow: false, receiveShadow: true })
        .position(x, y, z).scale([sx, sy, sz]).toJSON()
    );
  }
  // Low sun disc + horizon glow band behind the hoop (open sky stays above).
  nodes.push(
    primitives.sphere({ name: "sun-disc", material: SUN_DISC, castShadow: false, receiveShadow: false })
      .position(-14, 7.5, -42).scale(1.6).toJSON(),
    primitives.box({ name: "horizon-glow", material: HORIZON_GLOW, castShadow: false, receiveShadow: false })
      .position(0, 1.6, -44).scale([70, 3.4, 0.2]).toJSON()
  );
  // Instanced tower silhouettes at two depths (sparse, PBR — skyline reads open).
  const towers = [
    ...Array.from({ length: 9 }, (_, i) => ({
      position: [-34 + i * 8.4, 5.5 + ((i * 7) % 4) * 2.4, -38 - (i % 3) * 4] as [number, number, number],
      scale: [4.4, 11 + ((i * 5) % 5) * 3.2, 4.4] as [number, number, number]
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      position: [-26 + i * 14, 4.2 + (i % 2) * 2.8, 30 + (i % 3) * 3] as [number, number, number],
      scale: [5.2, 8.4 + (i % 4) * 2.6, 5.2] as [number, number, number]
    }))
  ];
  nodes.push(
    instances.box({
      name: "skyline-towers",
      material: TOWER_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: towers
    }).toJSON()
  );
  return nodes;
}

/** Court + hoop + glass board + net + ball + skinned athletes + aim guide. */
export function courtNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(
    model(assets.rooftopVenueV2, {
      name: "rooftop-venue",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: false,
      receiveShadow: true
    }).position(0, 0.72, 4).toJSON(),
    model(assets.rooftopCourt, {
      name: "rooftop-court",
      role: "primaryWorld",
      scaleMode: "world",
      receiveShadow: true
    }).position(0, -0.1, 4).toJSON()
  );
  // §14.4 glass board: GLB frame + a real glass panel so reads stay honest.
  nodes.push(
    model(assets.rooftopBackboard, {
      name: "hoop-backboard-mesh",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true
    })
      .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z)
      .runtime(game.runtimeNode("backboard-assembly", { tags: ["backboard"] }))
      .toJSON(),
    primitives.box({ name: "glass-backboard-panel", material: GLASS_BOARD, castShadow: false, receiveShadow: true })
      .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + BACKBOARD_POSITION.depth)
      .scale([BACKBOARD_POSITION.width, BACKBOARD_POSITION.height, 0.03]).toJSON(),
    primitives.box({ name: "board-frame-top", material: BOARD_FRAME, castShadow: false, receiveShadow: false })
      .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y + BACKBOARD_POSITION.height / 2, BACKBOARD_POSITION.z)
      .scale([BACKBOARD_POSITION.width + 0.06, 0.05, 0.07]).toJSON(),
    model(assets.rooftopRim, {
      name: "hoop-rim-mesh",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: true
    })
      .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z)
      .runtime(game.runtimeNode("rim-assembly", { tags: ["hoop-rim"] }))
      .toJSON(),
    primitives.torus({ name: "rim target halo", material: RIM_GLOW })
      .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z + 0.12)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([0.36, 0.36, 0.03])
      .runtime(game.runtimeNode("rim-readability", { tags: ["hoop-rim", "renderer-owned", "readability"] }))
      .toJSON(),
    primitives.torus({ name: "rim net lower ring", material: NET_MATERIAL })
      .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y - 0.48, HOOP_BASE_POSITION.z)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([0.19, 0.19, 0.024])
      .runtime(game.runtimeNode("rim-net-pulse", { tags: ["net-feedback", "renderer-owned", "event-driven"] }))
      .toJSON()
  );
  // The ball: runtime node — boot syncs it to the solver pose each frame.
  nodes.push(
    model(assets.rooftopBall, {
      name: "ball-live",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 0.24,
      castShadow: true
    })
      .position(COURT_SPOTS[1]!.x, 1.8, COURT_SPOTS[1]!.z)
      .runtime(game.runtimeNode("ball-live", { tags: ["basketball", "physics-synced"] }))
      .toJSON()
  );
  // §14.4 skinned athletes (C-19): scorer Ready → Load/Release/FollowThrough;
  // defender Plant → Telegraph/Contest. Boot drives crossFadeTo; evidence
  // reads animationState().tracksApplied.
  nodes.push(
    model(assets.rooftopLayupScorer, {
      name: "skinned-scorer",
      role: "primaryCharacter",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "world",
      scale: [ATHLETE_SCALE, ATHLETE_SCALE, ATHLETE_SCALE]
    })
      .position(COURT_SPOTS[0]!.x, ATHLETE_FLOOR_OFFSET, COURT_SPOTS[0]!.z)
      .animate({ clip: "Ready", loop: true, speed: 1 })
      .runtime(game.runtimeNode("skinned-scorer", { tags: ["shooter", "skinned", "primary-character"] }))
      .toJSON(),
    model(assets.rooftopDefender, {
      name: "skinned-defender",
      role: "primaryCharacter",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "world",
      scale: [ATHLETE_SCALE, ATHLETE_SCALE, ATHLETE_SCALE]
    })
      .position(0, ATHLETE_FLOOR_OFFSET, 2.2)
      .animate({ clip: "Plant", loop: true, speed: 1 })
      .runtime(game.runtimeNode("skinned-defender", { tags: ["defender", "skinned"] }))
      .toJSON()
  );
  // Aim guide + contact burst + flight ring (renderer-owned event feedback).
  nodes.push(
    primitives.sphere({ name: "aim preview dot", material: AIM_MATERIAL })
      .position(0, -5, 0).scale(0.06)
      .runtime(game.runtimeNode("aim-preview-dot", { tags: ["aim-guide", "renderer-owned"] }))
      .toJSON(),
    primitives.sphere({ name: "contact burst", material: CONTACT_MISS })
      .position(0, -5, 0).scale(0.001)
      .runtime(game.runtimeNode("contact-burst", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON()
  );
  return nodes;
}
