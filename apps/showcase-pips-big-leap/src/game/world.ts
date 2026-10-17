// Pip's Big Leap — WorldSpec -> scene nodes + collision world.
//
// A world is lowered into (a) an `AuraSceneBuilder` that owns presentation and
// (b) a plain-data collision world the player controller simulates against.
// Both come from the same spec, so what you see is what you collide with.

import {
  camera,
  effects,
  game,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets, BOSS_CLIPS, PIP_CLIPS } from "../aura-assets.js";
import { deriveWorldMotion, type WorldMotion } from "./motion.js";
import type {
  CheckpointSpec, DecorSpec, HazardBox, HazardSpec, PickupSpec,
  PlatformKind, PlatSpec, SolidBox, SpringSpec, WaterSpec, WorldSpec
} from "./types.js";

type SceneBuilder = ReturnType<typeof scene>;
type SceneNodeArg = Parameters<SceneBuilder["add"]>[0];

// ---------------------------------------------------------------- palettes

const KIND_STYLE: Record<PlatformKind, { readonly body: string; readonly top: string }> = {
  grass:     { body: "#6d4f30", top: "#58b04a" },
  earth:     { body: "#7c5a3a", top: "#a07952" },
  mushroom:  { body: "#efe4cf", top: "#d96a55" },
  leaf:      { body: "#37713a", top: "#6cc76e" },
  dock:      { body: "#6f5233", top: "#a1794a" },
  wood:      { body: "#7d5a33", top: "#b38954" },
  rope:      { body: "#8f7350", top: "#cda86e" },
  cloud:     { body: "#bccbe2", top: "#f4f9ff" },
  sky:       { body: "#7fa7cf", top: "#c2ddf2" },
  stone:     { body: "#4f4a46", top: "#786f66" },
  ember:     { body: "#3f271d", top: "#a8522c" },
  metal:     { body: "#343640", top: "#686e80" },
  marble:    { body: "#bdb2a2", top: "#efe5d2" },
  gold:      { body: "#7c5f26", top: "#dfb44b" },
  crystal:   { body: "#4f3f85", top: "#9787de" },
  starlight: { body: "#322c58", top: "#c7b6ff" }
};

const HAZARD_STYLE: Record<HazardSpec["type"], string> = {
  thorns: "#8a3c68",
  lava:   "#ff5a26",
  ember:  "#ff9435",
  frost:  "#6fd8ff"
};

// ---------------------------------------------------------------- names

export const nodeName = {
  platform: (id: string) => `plat:${id}`,
  platformTop: (id: string) => `plat-top:${id}`,
  seed: (id: string) => `seed:${id}`,
  acorn: (id: string) => `acorn:${id}`,
  heart: (id: string) => `heart:${id}`,
  spring: (id: string) => `spring:${id}`,
  checkpoint: (id: string) => `cp:${id}`,
  checkpointFlag: (id: string) => `cp-flag:${id}`,
  gate: "sun-gate",
  gateRing: "sun-gate-ring",
  gateLock: "sun-gate-lock",
  hero: "pip",
  heroCap: "pip:cap",
  heroCape: "pip:cape",
  boss: "brambleback",
  bossSpike: (i: number) => `bramble-spike:${i}`,
  npc: (id: string) => `npc:${id}`,
  water: (id: string) => `water:${id}`
} as const;

// ---------------------------------------------------------------- spec -> collision

export interface WaterZone {
  readonly spec: WaterSpec;
  readonly x: number; readonly z: number;
  readonly hx: number; readonly hz: number;
  readonly surfaceY: number;
  readonly floorY: number;
}

export interface BuiltWorld {
  readonly spec: WorldSpec;
  readonly motion: WorldMotion;
  readonly scene: SceneBuilder;
  readonly solids: readonly SolidBox[];
  readonly hazards: readonly HazardBox[];
  readonly waters: readonly WaterZone[];
  readonly seeds: readonly PickupSpec[];
  readonly acorns: readonly PickupSpec[];
  readonly hearts: readonly PickupSpec[];
  readonly springs: readonly SpringSpec[];
  readonly checkpoints: readonly CheckpointSpec[];
  readonly spinNodes: readonly string[];
  readonly movingSolids: readonly SolidBox[];
  readonly timedSolids: readonly SolidBox[];
  readonly bossArenaZ: number | null;
}

const PLAT_H = 0.55;

function solidOf(p: PlatSpec): SolidBox {
  const h = p.h ?? PLAT_H;
  return {
    id: p.id,
    x: p.x,
    y: p.y - h / 2,
    z: p.z,
    hx: p.w / 2,
    hy: h / 2,
    hz: p.d / 2,
    plat: p,
    active: true,
    vx: 0, vy: 0, vz: 0
  };
}

// ---------------------------------------------------------------- decor

function decorNodes(d: DecorSpec): readonly SceneNodeArg[] {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;
  const pos = (x: number, y: number, z: number) => [d.x + x * s, d.y + y * s, d.z + z * s] as const;
  const box = (name: string, size: readonly [number, number, number], at: readonly number[], color: string, emissive?: string) =>
    primitives.box({ name: `${d.id}:${name}`, size: [size[0] * s, size[1] * s, size[2] * s], position: [at[0], at[1], at[2]], material: emissive ? material.emissive({ color: emissive, emissive, emissiveIntensity: 0.7 }) : material.pbr({ color, roughness: 0.9 }), castShadow: true }).rotate(0, yaw, 0);
  const ball = (name: string, r: number, at: readonly number[], color: string, emissive?: string) =>
    primitives.sphere({ name: `${d.id}:${name}`, size: r * 2 * s, position: [at[0], at[1], at[2]], material: emissive ? material.emissive({ color: emissive, emissive, emissiveIntensity: 0.6 }) : material.pbr({ color, roughness: 0.85 }), castShadow: true });
  const cyl = (name: string, r: number, h: number, at: readonly number[], color: string) =>
    primitives.cylinder({ name: `${d.id}:${name}`, size: [r * 2 * s, h * s, r * 2 * s], position: [at[0], at[1], at[2]], material: material.pbr({ color, roughness: 0.9 }), castShadow: true }).rotate(0, yaw, 0);

  switch (d.kind) {
    case "tree":
      return [cyl("trunk", 0.16, 1.4, pos(0, 0.7, 0), "#6d4c2c"), ball("canopy", 0.85, pos(0, 1.9, 0), "#4e9c46")];
    case "mushroom":
      return [cyl("stem", 0.14, 0.6, pos(0, 0.3, 0), "#efe4cf"), ball("cap", 0.42, pos(0, 0.68, 0), "#d96a55")];
    case "flower":
      return [cyl("stem", 0.05, 0.5, pos(0, 0.25, 0), "#4e8c3f"), ball("bloom", 0.2, pos(0, 0.58, 0), "#f2b8ff", "#ff9ee2")];
    case "rock":
      return [ball("body", 0.5, pos(0, 0.28, 0), "#7d7f88")];
    case "windmill":
      return [
        cyl("tower", 0.42, 2.6, pos(0, 1.3, 0), "#a1794a"),
        ball("hub", 0.22, pos(0, 2.75, 0), "#7d5a33"),
        box("sail-a", [0.16, 2.4, 0.06], pos(0, 2.75, 0), "#e8dcc8"),
        box("sail-b", [2.4, 0.16, 0.06], pos(0, 2.75, 0), "#e8dcc8")
      ];
    case "sail":
      return [cyl("mast", 0.07, 1.9, pos(0, 0.95, 0), "#7d5a33"), box("cloth", [1.1, 1.2, 0.05], pos(0.35, 1.2, 0), "#f0e4d0")];
    case "cloud":
      return [ball("a", 0.7, pos(0, 0, 0), "#f4f9ff"), ball("b", 0.5, pos(0.7, 0.12, 0.1), "#e8f1ff"), ball("c", 0.45, pos(-0.65, 0.1, -0.05), "#eef5ff")];
    case "fan":
      return [cyl("post", 0.12, 1.6, pos(0, 0.8, 0), "#686e80"), box("blades", [1.6, 0.18, 0.08], pos(0, 1.7, 0), "#c2ddf2"), box("blades-b", [0.18, 1.6, 0.08], pos(0, 1.7, 0), "#c2ddf2")];
    case "vent":
      return [box("base", [0.9, 0.5, 0.9], pos(0, 0.25, 0), "#343640"), box("glow", [0.6, 0.1, 0.6], pos(0, 0.52, 0), "#ff9435", "#ff9435")];
    case "pillar":
      return [cyl("shaft", 0.3, 3.2, pos(0, 1.6, 0), d.kind === "pillar" ? "#bdb2a2" : "#4f4a46"), box("cap", [0.8, 0.24, 0.8], pos(0, 3.32, 0), "#8f8474")];
    case "arch":
      return [box("left", [0.4, 3, 0.5], pos(-1.4, 1.5, 0), "#a89c88"), box("right", [0.4, 3, 0.5], pos(1.4, 1.5, 0), "#a89c88"), box("span", [3.2, 0.5, 0.5], pos(0, 3.2, 0), "#c9bda6")];
    case "crystal":
      return [box("shard", [0.4, 1.6, 0.4], pos(0, 0.8, 0), "#8f7bde", "#a795ff"), box("shard-b", [0.28, 1.0, 0.28], pos(0.5, 0.5, 0.2), "#c7b6ff", "#d6c8ff")];
    case "star":
      return [ball("core", 0.22, pos(0, 0.9, 0), "#ffe9a3", "#ffdf7a"), box("ray", [0.7, 0.08, 0.08], pos(0, 0.9, 0), "#ffe9a3", "#ffdf7a")];
    case "lantern":
      return [cyl("post", 0.08, 1.8, pos(0, 0.9, 0), "#4a3b28"), ball("lamp", 0.28, pos(0, 1.95, 0), "#ffd98a", "#ffcf6e")];
    case "crate":
      return [box("body", [0.9, 0.9, 0.9], pos(0, 0.45, 0), "#9a7444")];
    case "barrel":
      return [cyl("body", 0.42, 0.95, pos(0, 0.48, 0), "#8f6a3c")];
    case "banner":
      return [cyl("pole-a", 0.06, 2.2, pos(-0.9, 1.1, 0), "#4a3b28"), cyl("pole-b", 0.06, 2.2, pos(0.9, 1.1, 0), "#4a3b28"), box("cloth", [1.7, 0.9, 0.05], pos(0, 1.65, 0), "#f2c94c", "#ffd95e")];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- world build

export function buildWorld(spec: WorldSpec): BuiltWorld {
  const motion = deriveWorldMotion(spec);
  const builder = scene().background(spec.background ?? "#9cc8e8");

  // Look preset — one per world (plus optional overrides node).
  builder.add(looks.preset(spec.look as Parameters<typeof looks.preset>[0]));
  if (spec.lookOverrides?.fogDensityScale !== undefined) {
    builder.add(effects.fog({ density: spec.lookOverrides.fogDensityScale * 0.02, color: spec.background ?? "#9cc8e8" }));
  }
  if (spec.ambientFx === "embers" || spec.ambientFx === "stars") {
    builder.add(effects.bloom({ intensity: 0.28 }));
  }
  if (spec.ambientFx === "snow") builder.add(effects.snow({}));

  // Backdrop GLBs — far dressing, non-colliding.
  for (const b of spec.backdrops) {
    const ref = assets.backdrop[b.asset];
    builder.add(
      model(ref, { name: `backdrop:${spec.id}:${b.asset}`, castShadow: false, receiveShadow: false })
        .position(b.x, b.y, b.z)
        .rotate(0, b.yaw ?? 0, 0)
        .scale(b.scale)
    );
  }

  // Platforms.
  const solids: SolidBox[] = [];
  const moving: SolidBox[] = [];
  const timed: SolidBox[] = [];
  for (const p of spec.platforms) {
    const style = KIND_STYLE[p.kind ?? "grass"];
    const h = p.h ?? PLAT_H;
    const plat = primitives.box({
      name: nodeName.platform(p.id),
      size: [p.w, h, p.d],
      position: [p.x, p.y - h / 2, p.z],
      material: material.pbr({ color: style.body, roughness: 0.92 }),
      castShadow: true,
      receiveShadow: true
    });
    const top = primitives.box({
      name: nodeName.platformTop(p.id),
      size: [p.w * 0.98, 0.1, p.d * 0.98],
      position: [p.x, p.y - 0.05, p.z],
      material: material.pbr({ color: style.top, roughness: 0.8 }),
      receiveShadow: true
    });
    if (p.mover || p.timed) {
      const spec2 = game.runtimeNode(nodeName.platform(p.id), { tags: ["platform"] });
      plat.runtime(spec2);
      top.runtime(game.runtimeNode(nodeName.platformTop(p.id), { tags: ["platform"] }));
    }
    builder.add(plat).add(top);
    if (!p.ghost) {
      const s = solidOf(p);
      solids.push(s);
      if (p.mover) moving.push(s);
      if (p.timed) timed.push(s);
    }
  }

  // Hazards — emissive hurt volumes (lava sheets, thorn brambles…).
  const hazards: HazardBox[] = spec.hazards.map((hz) => {
    const h = hz.h ?? 0.5;
    builder.add(
      primitives.box({
        name: `hazard:${hz.id}`,
        size: [hz.w, Math.min(h, 0.32), hz.d],
        position: [hz.x, hz.y - Math.min(h, 0.32) / 2, hz.z],
        material: material.emissive({ color: HAZARD_STYLE[hz.type], emissive: HAZARD_STYLE[hz.type], emissiveIntensity: 0.85, roughness: 0.5 })
      })
    );
    return { spec: hz, x: hz.x, y: hz.y - h / 2, z: hz.z, hx: hz.w / 2, hy: h / 2, hz: hz.d / 2 };
  });

  // Water pockets — glass volumes the swimmer sinks into.
  const waters: WaterZone[] = spec.waters.map((w) => {
    const depth = w.depth ?? 2.2;
    builder.add(
      primitives.box({
        name: nodeName.water(w.id),
        size: [w.w, depth, w.d],
        position: [w.x, w.y - depth / 2, w.z],
        material: material.glass({ color: "#5fbfe8", opacity: 0.38 }),
        castShadow: false,
        receiveShadow: false
      }).runtime(game.runtimeNode(nodeName.water(w.id), { tags: ["water"] }))
    );
    return { spec: w, x: w.x, z: w.z, hx: w.w / 2, hz: w.d / 2, surfaceY: w.y, floorY: w.y - depth };
  });

  // Pickups — bespoke Meshy sun-seed / golden-acorn models driven per frame.
  // The runtime auto-fit normalizes each GLB to a target size with its lowest
  // point at the node origin, so the position lift re-centres the model on the
  // authored pickup point (which still drives collection triggers).
  const spinNodes: string[] = [];
  for (const s of spec.seeds) {
    builder.add(
      model(assets.sunseed, { name: nodeName.seed(s.id), castShadow: true, targetMaxDimension: 0.45 })
        .position(s.x, s.y - 0.1, s.z)
        .runtime(game.runtimeNode(nodeName.seed(s.id), { tags: ["pickup", "seed"] }))
    );
    spinNodes.push(nodeName.seed(s.id));
  }
  for (const a of spec.acorns) {
    builder.add(
      model(assets.goldenAcorn, { name: nodeName.acorn(a.id), castShadow: true, targetMaxDimension: 0.55 })
        .position(a.x, a.y - 0.27, a.z)
        .runtime(game.runtimeNode(nodeName.acorn(a.id), { tags: ["pickup", "acorn"] }))
    );
    spinNodes.push(nodeName.acorn(a.id));
  }
  for (const hpt of spec.hearts) {
    builder.add(
      primitives.sphere({ name: nodeName.heart(hpt.id), size: 0.4, position: [hpt.x, hpt.y, hpt.z], material: material.emissive({ color: "#ff6a8a", emissive: "#ff5a7a", emissiveIntensity: 0.8 }) })
        .runtime(game.runtimeNode(nodeName.heart(hpt.id), { tags: ["pickup", "heart"] }))
    );
    spinNodes.push(nodeName.heart(hpt.id));
  }

  // Springs — base + coil.
  for (const spr of spec.springs) {
    const base = [spr.x, spr.y, spr.z] as const;
    builder.add(
      primitives.cylinder({ name: `${nodeName.spring(spr.id)}:base`, size: [0.84, 0.16, 0.84], position: [base[0], base[1] + 0.08, base[2]], material: material.metal({ color: "#8a8f9c" }) })
    );
    builder.add(
      primitives.cylinder({ name: nodeName.spring(spr.id), size: [0.68, 0.22, 0.68], position: [base[0], base[1] + 0.26, base[2]], material: material.emissive({ color: "#ff8a5a", emissive: "#ff7a45", emissiveIntensity: 0.65 }) })
        .runtime(game.runtimeNode(nodeName.spring(spr.id), { tags: ["spring"] }))
    );
  }

  // Checkpoints — bespoke Meshy leaf-banner flag; flips gold when activated.
  for (const cp of spec.checkpoints) {
    builder.add(
      model(assets.checkpointFlag, { name: nodeName.checkpointFlag(cp.id), castShadow: true, targetHeight: 1.9 })
        .position(cp.x, cp.y, cp.z)
        .runtime(game.runtimeNode(nodeName.checkpointFlag(cp.id), { tags: ["checkpoint"] }))
    );
    builder.add(
      primitives.box({ name: `${nodeName.checkpoint(cp.id)}:pad`, size: [0.7, 0.08, 0.7], position: [cp.x, cp.y + 0.04, cp.z], material: material.emissive({ color: "#9cd7ff", emissive: "#7ac4ff", emissiveIntensity: 0.35 }) })
    );
  }

  // Sun-Gate — bespoke Meshy seed-arch portal + retained emissive ring + lock.
  const g = spec.gate;
  builder.add(
    model(assets.sungate, { name: nodeName.gate, castShadow: true, targetHeight: 3.0 })
      .position(g.x, g.y, g.z)
      .runtime(game.runtimeNode(nodeName.gate, { tags: ["gate"] }))
  );
  builder.add(
    primitives.torus({ name: nodeName.gateRing, size: [1.9, 1.9, 0.4], position: [g.x, g.y + 1.5, g.z], material: material.emissive({ color: "#ffcf3d", emissive: "#ffc52e", emissiveIntensity: 0.9 }), castShadow: false })
      .runtime(game.runtimeNode(nodeName.gateRing, { tags: ["gate"] }))
  );
  builder.add(
    primitives.sphere({ name: nodeName.gateLock, size: 0.6, position: [g.x, g.y + 1.5, g.z], material: material.emissive({ color: "#6a4a9c", emissive: "#553a85", emissiveIntensity: 0.5 }), castShadow: false })
      .runtime(game.runtimeNode(nodeName.gateLock, { tags: ["gate"] }))
  );

  // Decor + NPCs.
  for (const d of spec.decor) for (const node of decorNodes(d)) builder.add(node);
  for (const n of spec.npcs) {
    const ref = n.who === "sidekick" ? assets.sidekick : assets.helper;
    const clip = n.clip ?? "idle";
    builder.add(
      model(ref, { name: nodeName.npc(n.id), castShadow: true })
        .position(n.x, n.y, n.z)
        .scale(0.9 / ref.bounds[1])
        .rotate(0, Math.PI, 0)
        .animate({ clip, loop: true })
    );
  }

  // Hero — always a runtime node; the camera rigs onto it. `targetHeight`
  // auto-fits the bespoke GLB to mascot size with its feet at the node origin
  // (the player controller drives the node at feet level).
  builder.add(
    model(assets.pip, { name: nodeName.hero, castShadow: true, targetHeight: 0.95 })
      .position(spec.spawn[0], spec.spawn[1], spec.spawn[2])
      .rotate(0, spec.spawnYaw ?? 0, 0)
      .animate({ clip: PIP_CLIPS.idle, loop: true })
      .runtime(game.runtimeNode(nodeName.hero, { tags: ["player"] }))
  );
  // Studio accessories — acorn cap + glide cape, tinted by Player Studio and
  // parented to the hero's position each frame by main.ts.
  builder.add(
    primitives.sphere({ name: nodeName.heroCap, size: 0.44, position: [spec.spawn[0], spec.spawn[1] + 0.86, spec.spawn[2]], material: material.pbr({ color: "#c96a2b", roughness: 0.7 }), castShadow: true })
      .runtime(game.runtimeNode(nodeName.heroCap, { tags: ["player", "studio"] }))
  );
  builder.add(
    primitives.box({ name: nodeName.heroCape, size: [0.5, 0.06, 0.62], position: [spec.spawn[0], spec.spawn[1] + 0.62, spec.spawn[2] + 0.3], material: material.pbr({ color: "#3f8cff", roughness: 0.6 }), castShadow: true })
      .runtime(game.runtimeNode(nodeName.heroCape, { tags: ["player", "studio"] }))
  );

  // Boss (W5) — bespoke Meshy Brambleback; body is runtime-driven and the
  // thorn-spike satellites remain the phase telegraph (out = invulnerable).
  if (spec.boss) {
    builder.add(
      model(assets.boss, { name: nodeName.boss, castShadow: true, targetHeight: 2.4 })
        .position(0, 2.6, -69)
        .animate({ clip: BOSS_CLIPS.idle, loop: true })
        .runtime(game.runtimeNode(nodeName.boss, { tags: ["boss"] }))
    );
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      builder.add(
        primitives.box({ name: nodeName.bossSpike(i), size: [0.34, 0.9, 0.34], position: [Math.cos(a) * 1.05, 4.4, -69 + Math.sin(a) * 1.05], material: material.pbr({ color: "#7a3c2e", roughness: 0.7 }) })
          .rotate(0, 0, Math.cos(a) * 0.5)
          .runtime(game.runtimeNode(nodeName.bossSpike(i), { tags: ["boss"] }))
      );
    }
  }

  builder.camera(camera.perspective({ position: [0, spec.spawn[1] + 2.4, spec.spawn[2] + 5.5], target: spec.spawn, fov: 55 }));

  return {
    spec, motion, scene: builder, solids, hazards, waters,
    seeds: spec.seeds, acorns: spec.acorns, hearts: spec.hearts,
    springs: spec.springs, checkpoints: spec.checkpoints,
    spinNodes, movingSolids: moving, timedSolids: timed,
    bossArenaZ: spec.boss ? -69 : null
  };
}

/** Advance moving/timed platform solids + mirror into runtime node handles. */
export function tickPlatforms(
  built: BuiltWorld,
  t: number,
  node: (name: string) => { setPosition(x: number, y: number, z: number): unknown; setVisible(v: boolean): unknown } | null
): void {
  for (const s of built.movingSolids) {
    const m = s.plat.mover;
    if (!m) continue;
    const h = s.plat.h ?? PLAT_H;
    const phase = (t / m.period) * Math.PI * 2 + (m.phase ?? 0);
    const off = Math.sin(phase) * m.amplitude;
    const vel = Math.cos(phase) * m.amplitude * (Math.PI * 2 / m.period);
    s.vx = 0; s.vy = 0; s.vz = 0;
    s.x = s.plat.x; s.z = s.plat.z; s.y = s.plat.y - h / 2;
    if (m.axis === "x") { s.x += off; s.vx = vel; }
    else if (m.axis === "z") { s.z += off; s.vz = vel; }
    else { s.y += off; s.vy = vel; }
    node(nodeName.platform(s.id))?.setPosition(s.x, s.y, s.z);
    node(nodeName.platformTop(s.id))?.setPosition(s.x, s.y + h / 2 - 0.05, s.z);
  }
  for (const s of built.timedSolids) {
    const tm = s.plat.timed;
    if (!tm) continue;
    const f = ((((t + (tm.phase ?? 0)) % tm.period) + tm.period) % tm.period) / tm.period;
    s.active = f < tm.onFrac;
    node(nodeName.platform(s.id))?.setVisible(s.active);
    node(nodeName.platformTop(s.id))?.setVisible(s.active);
  }
}
