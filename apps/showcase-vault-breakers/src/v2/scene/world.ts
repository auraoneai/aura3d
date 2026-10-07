// apps/showcase-vault-breakers/src/v2/scene/world.ts — arcade world (T2.2).
// §6.9.5 "dark arcade around a lit table": hero is the admitted
// `vaultBreakersCabinet` GLB + typed mechanism assembly + `FlipperReal` bats;
// the room is a restrained greybox (floor, walls, neighbour machines, marquee
// bar) with NO emissive fill — the single spot key lights the playfield.
// Insert bezels are instanced; lamp cores stay runtime nodes for state swaps.
import { game, instances, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import type { TableSimulation, PropVisual } from "../../gameplay/table";
import { createScoreboardNodes } from "../../legacy/scoreboard";
import {
  BANK_LAMP_OFF, CEILING_MATERIAL, FLOOR_MATERIAL, IMPACT_AMBER,
  INSERT_BEZEL, MACHINE_SHELL_MATERIAL, MARQUEE_MATERIAL, MECHANISM_STATE_MATERIALS,
  NEON_SIGN, TRIM_MATERIAL, WALL_MATERIAL
} from "./materials";

function box(name: string, mat: Parameters<typeof primitives.box>[0]["material"], at: [number, number, number], size: [number, number, number]): AuraSceneNode {
  return primitives.box({ name, material: mat, castShadow: false, receiveShadow: true })
    .position(...at).scale(size).toJSON();
}

/** Dark arcade greybox — backdrop only, nothing casts a shadow. */
export function arcadeRoom(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(box("arcade-floor", FLOOR_MATERIAL, [0, -2.3, 0], [16, 0.1, 16]));
  nodes.push(box("wall-back", WALL_MATERIAL, [0, 1.2, -6.2], [16, 7.2, 0.2]));
  nodes.push(box("wall-left", WALL_MATERIAL, [-7.9, 1.2, 0], [0.2, 7.2, 16]));
  nodes.push(box("wall-right", WALL_MATERIAL, [7.9, 1.2, 0], [0.2, 7.2, 16]));
  nodes.push(box("ceiling", CEILING_MATERIAL, [0, 5.0, 0], [16, 0.2, 16]));
  nodes.push(box("back-trim", TRIM_MATERIAL, [0, 0.3, -6.05], [16, 0.7, 0.1]));
  // Two neighbouring machine shells flanking the hero cabinet.
  for (const x of [-4.6, 4.6]) {
    nodes.push(box(`machine-shell-${x}`, MACHINE_SHELL_MATERIAL, [x, -1.0, -1.6], [1.4, 2.7, 2.1]));
    nodes.push(box(`machine-marquee-${x}`, MARQUEE_MATERIAL, [x, 0.85, -1.4], [1.3, 0.5, 0.12]));
  }
  // Marquee glow strip above the back wall — a lit sign, not scene fill.
  nodes.push(box("marquee-glow", NEON_SIGN, [0, 3.6, -5.95], [6.0, 0.34, 0.08]));
  return nodes;
}

/** Instanced insert bezels: every lamp ring on the playfield, one draw call. */
export function insertBezels(): AuraSceneNode {
  const ring: [number, number, number][] = [];
  // Bank bezels mirror the five banks' three-slot insert rows (x, z on felt).
  for (const bx of [-2.32, -2.42, -0.5, 1.95, 1.95]) {
    for (const dz of [-0.4, 0, 0.4]) ring.push([bx, 0.29, -2.0 + dz]);
  }
  return instances.torus({
    name: "insert-bezels",
    material: INSERT_BEZEL,
    transforms: ring.map((p) => ({ position: p, rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.16, 0.05] })),
    castShadow: false,
    receiveShadow: true
  }).toJSON();
}

/** Sim visual → scene node (models get admitted GLBs; Flipper → FlipperReal). */
function visualNode(v: PropVisual): AuraSceneNode {
  const vy = v.position[1] + 0.28;
  if (v.source === "model") {
    const asset = v.typedAsset === "vaultBreakersFlipper" ? assets.vaultBreakersFlipperReal : assets[v.typedAsset!];
    return model(asset, {
      name: v.name,
      role: v.typedAsset === "vaultBreakersBall" ? "primaryCharacter" : "setDressing",
      scaleMode: "fit",
      targetMaxDimension: v.targetMaxDimension ?? 1
    })
      .position(v.position[0], vy, v.position[2])
      .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
      .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }))
      .toJSON();
  }
  if (v.name === "vault-door-visual") {
    return model(assets.vaultBreakersVaultDoor, {
      name: "vault-door-visual",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.52
    })
      .position(...v.position)
      .runtime(game.runtimeNode("vault-door-visual", { tags: ["vault-door"] }))
      .toJSON();
  }
  const p = v.primitive!;
  const mat = material.emissive({ name: v.name + " material", color: p.color, emissive: p.emissive, opacity: p.opacity ?? 1 });
  const shape = p.shape === "torus"
    ? primitives.torus({ name: v.name, material: mat })
    : p.shape === "sphere"
      ? primitives.sphere({ name: v.name, material: mat })
      : p.shape === "cylinder"
        ? primitives.cylinder({ name: v.name, material: mat })
        : primitives.box({ name: v.name, material: mat });
  return shape
    .position(v.position[0], vy, v.position[2])
    .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
    .scale([p.size[0], p.size[1], Math.max(0.02, p.size[2])])
    .runtime(game.runtimeNode(v.name, { tags: ["physics-synced"] }))
    .toJSON();
}

/** Cabinet + mechanisms + dynamic sim visuals + state strips + scoreboard. */
export function playfieldNodes(sim: TableSimulation): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(
    model(assets.vaultBreakersCabinet, {
      name: "vault-cabinet",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 8.5,
      castShadow: false,
      receiveShadow: true
    }).position(0, -1.8, 0.1).toJSON()
  );
  for (const v of sim.visuals) nodes.push(visualNode(v));
  nodes.push(
    model(assets.vaultBreakersMechanisms, {
      name: "vault-mechanisms",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.05
    })
      .position(0, 0.34, 0)
      .runtime(game.runtimeNode("vault-mechanisms", { tags: ["typed-asset", "mission-state"] }))
      .toJSON()
  );
  // Bank insert lamps (runtime — cores swap ON/OFF materials per banksDown).
  for (let index = 0; index < 5; index += 1) {
    nodes.push(
      primitives.box({ name: `bank-status-${index}`, material: BANK_LAMP_OFF })
        .position(-1.4 + index * 0.7, 1.5, -2.72)
        .scale([0.28, 0.16, 0.28])
        .runtime(game.runtimeNode(`bank-status-${index}`, { tags: ["mission-progress", "bank-lamp"] }))
        .toJSON()
    );
  }
  // Mission-state beacon strip (six named states, non-color-redundant).
  for (const [state, stateMaterial] of Object.entries(MECHANISM_STATE_MATERIALS)) {
    nodes.push(
      primitives.box({ name: `mission-state-beacon-${state}`, material: stateMaterial })
        .position(0, 0.72, 1.05).scale([1.35, 0.12, 0.22])
        .runtime(game.runtimeNode(`mission-state-beacon-${state}`, { tags: ["mission-state", "non-color-redundant-with-scoreboard"] }))
        .toJSON()
    );
  }
  // Renderer-owned impact ring (fx.ts drives material/position/scale/visibility).
  nodes.push(
    primitives.torus({ name: "vault live impact ring", material: IMPACT_AMBER })
      .position(0, -5, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("vault-live-impact-ring", { tags: ["renderer-owned", "impact-feedback", "event-linked"] }))
      .toJSON()
  );
  // DMD-class scoreboard (legacy node-spec builder; DMD upgrade is §14.4 pending).
  for (const node of createScoreboardNodes().nodes) nodes.push(node);
  return nodes;
}
