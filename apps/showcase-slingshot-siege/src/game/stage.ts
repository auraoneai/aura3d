/**
 * Slingshot Siege — scene construction.
 *
 * One persistent scene built once: every gameplay visual is a POOLED runtime
 * node that the sim's pose updates drive each frame (blocks, gull rigs,
 * projectiles, debris chips, puffs, trajectory dots, windmill rotors, the
 * slingshot rig, the chapter set-dressing). Level loads reassign the pools —
 * no `setScene`, no re-mount.
 */
import {
  camera,
  effects,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraColor,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
import { MATERIALS, type SiegeMaterialId } from "./materials";
import type { ChapterDef } from "./levels";

// ----------------------------------------------------------------- pools --

export const POOL = {
  blocks: 72,
  crates: 8,
  barrels: 6,
  gullRigs: 8,
  projectiles: 10,
  debris: 30,
  puffs: 14,
  dots: 16,
  windmillBlades: 4,
  windmills: 3
} as const;

export function blockNodeId(i: number): string { return `v-block-${i}`; }
export function crateNodeId(i: number): string { return `v-crate-${i}`; }
export function barrelNodeId(i: number): string { return `v-barrel-${i}`; }
export function gullPartId(g: number, part: "body" | "head" | "beak" | "wingL" | "wingR" | "tail"): string { return `v-gull-${g}-${part}`; }
export function projectileNodeId(i: number): string { return `v-proj-${i}`; }
export function debrisNodeId(i: number): string { return `v-debris-${i}`; }
export function puffNodeId(i: number): string { return `v-puff-${i}`; }
export function dotNodeId(i: number): string { return `v-dot-${i}`; }
export function bladeNodeId(mill: number, blade: number): string { return `v-mill-${mill}-blade-${blade}`; }
export function millHubNodeId(mill: number): string { return `v-mill-${mill}-hub`; }
export function millPoleNodeId(mill: number): string { return `v-mill-${mill}-pole`; }

export const SLING_IDS = {
  catapult: "sling-catapult",
  forkL: "sling-fork-l",
  forkR: "sling-fork-r",
  pouch: "sling-pouch",
  bandL: "sling-band-l",
  bandR: "sling-band-r",
  loaded: "sling-loaded"
} as const;

export const PROP_IDS = {
  watchtower: "prop-watchtower",
  gatehouse: "prop-gatehouse",
  windmillProp: "prop-windmill",
  stoneBridge: "prop-stone-bridge",
  plankScatter: "prop-plank-scatter",
  flag: "fortress-flag",
  flagPole: "fortress-flag-pole"
} as const;

// ------------------------------------------------------------- materials --

export function blockMaterial(id: SiegeMaterialId): AuraMaterialSpec {
  const m = MATERIALS[id];
  if (id === "glass" || id === "ice") {
    return material.pbr({ color: m.color, roughness: 0.16, metallic: 0.05, opacity: m.opacity ?? 0.85 });
  }
  if (id === "obsidian") {
    return material.pbr({ color: m.color, roughness: 0.35, metallic: 0.35 });
  }
  return material.pbr({ color: m.color, roughness: id === "wood" ? 0.8 : 0.55, metallic: 0 });
}

export function debrisMaterial(matId: string): AuraMaterialSpec {
  const key = (matId in MATERIALS ? matId : "wood") as SiegeMaterialId;
  return material.pbr({ color: MATERIALS[key].debrisColor, roughness: 0.7 });
}

export function puffMaterial(kind: "dust" | "glass" | "fire" | "poof"): AuraMaterialSpec {
  const map = {
    dust: "#e8d9b8",
    glass: "#d8f4ff",
    fire: "#ffb066",
    poof: "#ffffff"
  } as const;
  return material.pbr({ color: map[kind], roughness: 1, opacity: 0.75 });
}

function pbr(color: AuraColor, opts: { roughness?: number; metallic?: number; opacity?: number } = {}): AuraMaterialSpec {
  return material.pbr({ color, roughness: opts.roughness ?? 0.7, metallic: opts.metallic ?? 0, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) });
}
function glow(color: AuraColor, intensity = 0.9): AuraMaterialSpec {
  return material.emissive({ color, emissive: color, emissiveIntensity: intensity });
}

// ------------------------------------------------------------------ scene --

export interface StageNodes {
  readonly nodes: readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[];
  readonly cameraSpec: ReturnType<typeof camera.perspective>;
}

type StageNode = AuraSceneNode | AuraNodeBuilder<AuraSceneNode>;

export function buildStage(chapter: ChapterDef, reducedMotion: boolean): StageNodes {
  const nodes: StageNode[] = [];

  // Chapter look preset — outdoor-day with per-chapter overrides.
  nodes.push(looks.preset("outdoor-day", {
    exposureEv: chapter.look.exposureEv,
    fogDensityScale: chapter.look.fogDensityScale,
    sun: chapter.look.sun,
    ...(chapter.look.accent ? { accent: chapter.look.accent as AuraColor } : {}),
    ...(chapter.look.background ? { background: chapter.look.background as AuraColor } : {})
  }));

  // ------------------------------------------------------------- terrain --
  nodes.push(
    primitives.cylinder({ name: "stage-ground", material: pbr(chapter.ground, { roughness: 0.9 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.4, 0).scale([15, 0.35, 13]).runtime({ id: "stage-ground", tags: ["stage"] }),
    primitives.cylinder({ name: "stage-far-ground", material: pbr(chapter.farGround, { roughness: 1 }), castShadow: false, receiveShadow: true })
      .position(3, -0.55, -1).scale([24, 0.3, 20]).runtime({ id: "stage-far-ground", tags: ["stage"] }),
    primitives.box({ name: "launch-knoll", material: pbr(chapter.id === 5 ? "#6a6f9e" : "#8fcf6a", { roughness: 0.9 }) })
      .position(-7.4, 0.3, 0).scale([3.4, 0.6, 3.4]).runtime({ id: "launch-knoll", tags: ["stage"] }),
    primitives.box({ name: "fortress-pad", material: pbr(chapter.id === 5 ? "#50547e" : "#7ab95e", { roughness: 0.95 }) })
      .position(7.2, 0.02, 0).scale([7.6, 0.14, 7.2]).runtime({ id: "fortress-pad", tags: ["stage"] })
  );

  // Rolling hills + clouds — static dressing, chapter palette.
  const hillMat = pbr(chapter.farGround, { roughness: 1 });
  const hillPos: readonly (readonly [number, number, number, number])[] = [
    [-13, -2.5, -7, 4.2], [-8, -3.5, -9, 5.4], [0, -3, -10, 6.2], [9, -2.6, -9, 5.0], [15, -3.2, -6, 4.4], [-15, -3, 3, 4.8], [16, -2.8, 5, 5.2]
  ];
  hillPos.forEach(([x, z, s], i) => {
    nodes.push(primitives.sphere({ name: `hill-${i}`, material: hillMat, castShadow: false, receiveShadow: false }).position(x, -0.35, z).scale([s, s * 0.42, s]).runtime({ id: `hill-${i}`, tags: ["dressing"] }));
  });
  const cloudMat = pbr("#ffffff", { roughness: 1, opacity: 0.92 });
  const cloudPos: readonly (readonly [number, number, number, number, number])[] = [
    [-9, 6.4, -8, 2.6, 0.5], [-1.5, 7.1, -9, 3.4, 0.62], [6.5, 6.8, -8.5, 2.9, 0.55], [12, 7.6, -7, 2.2, 0.44], [3, 8, -10, 4.2, 0.7]
  ];
  cloudPos.forEach(([x, y, z, s, f], i) => {
    nodes.push(primitives.sphere({ name: `cloud-${i}`, material: cloudMat, castShadow: false, receiveShadow: false }).position(x, y, z).scale([s, s * 0.42, s * 0.8]).runtime({ id: `cloud-${i}`, tags: ["cloud"] }));
  });

  // ------------------------------------------------------------- slingshot --
  // Hero typed asset — the siege catapult — as the launcher base on the knoll.
  nodes.push(
    model(assets.gullsiegeCatapultMeshy, { name: "slingshot-base", position: [-7.4, 0.62, 0], rotation: [0, 0.5, 0], targetMaxDimension: 1.5 })
      .runtime({ id: SLING_IDS.catapult, tags: ["sling"] }),
    // Y-fork arms.
    primitives.cylinder({ name: "sling-fork-l", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, -0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkL, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-fork-r", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, 0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkR, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-trunk", material: pbr("#7a4e26", { roughness: 0.8 }) })
      .position(-7.4, 1.0, 0).scale([0.09, 0.8, 0.09]).runtime({ id: "sling-trunk", tags: ["sling"] }),
    // Pouch + bands + loaded ammo ball (driven per-frame).
    primitives.box({ name: "sling-pouch", material: pbr("#5a3a20", { roughness: 0.9 }) })
      .position(-7.4, 1.6, 0).scale([0.34, 0.08, 0.22]).runtime({ id: SLING_IDS.pouch, tags: ["sling"] }),
    primitives.box({ name: "sling-band-l", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, -0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandL, tags: ["sling"] }),
    primitives.box({ name: "sling-band-r", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, 0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandR, tags: ["sling"] }),
    primitives.sphere({ name: "sling-loaded", material: pbr("#fff3d6") })
      .position(-7.4, 1.68, 0).scale([0.26, 0.26, 0.26]).runtime({ id: SLING_IDS.loaded, tags: ["sling"] })
  );

  // ------------------------------------------------------- piece pools ------
  // Unit-cube blocks scaled per-piece at level load; material set per level too.
  for (let i = 0; i < POOL.blocks; i += 1) {
    nodes.push(primitives.box({ name: blockNodeId(i), material: pbr("#c98a4b") })
      .position(0, -120, 0).runtime({ id: blockNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.crates; i += 1) {
    nodes.push(model(assets.gullsiegeCrateMeshy, { name: crateNodeId(i), position: [0, -120, 0], targetMaxDimension: 0.62, visible: false })
      .runtime({ id: crateNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.barrels; i += 1) {
    nodes.push(model(assets.gullsiegeBarrelMeshy, { name: barrelNodeId(i), position: [0, -120, 0], targetMaxDimension: 0.72, visible: false })
      .runtime({ id: barrelNodeId(i), tags: ["piece"] }));
  }

  // ------------------------------------------------------- gull rigs --------
  // Primitive gull — chunky cream body, head, orange beak, wings, tail.
  const gullBody = pbr("#fdf6e8", { roughness: 0.85 });
  const gullWing = pbr("#e8dfc8", { roughness: 0.85 });
  const gullBeak = pbr("#ff9a3d", { roughness: 0.6 });
  const gullTail = pbr("#d8cbaa", { roughness: 0.85 });
  for (let g = 0; g < POOL.gullRigs; g += 1) {
    nodes.push(
      primitives.sphere({ name: gullPartId(g, "body"), material: gullBody })
        .position(0, -120, 0).scale([0.42, 0.36, 0.5]).runtime({ id: gullPartId(g, "body"), tags: ["gull"] }),
      primitives.sphere({ name: gullPartId(g, "head"), material: gullBody })
        .position(0, -120, 0).scale([0.24, 0.22, 0.24]).runtime({ id: gullPartId(g, "head"), tags: ["gull"] }),
      primitives.box({ name: gullPartId(g, "beak"), material: gullBeak })
        .position(0, -120, 0).scale([0.1, 0.07, 0.22]).runtime({ id: gullPartId(g, "beak"), tags: ["gull"] }),
      primitives.box({ name: gullPartId(g, "wingL"), material: gullWing })
        .position(0, -120, 0).scale([0.06, 0.16, 0.34]).runtime({ id: gullPartId(g, "wingL"), tags: ["gull"] }),
      primitives.box({ name: gullPartId(g, "wingR"), material: gullWing })
        .position(0, -120, 0).scale([0.06, 0.16, 0.34]).runtime({ id: gullPartId(g, "wingR"), tags: ["gull"] }),
      primitives.box({ name: gullPartId(g, "tail"), material: gullTail })
        .position(0, -120, 0).scale([0.16, 0.05, 0.24]).runtime({ id: gullPartId(g, "tail"), tags: ["gull"] })
    );
  }

  // ------------------------------------------------- projectiles + debris ---
  for (let i = 0; i < POOL.projectiles; i += 1) {
    nodes.push(primitives.sphere({ name: projectileNodeId(i), material: pbr("#fff3d6") })
      .position(0, -120, 0).scale(0.26).runtime({ id: projectileNodeId(i), tags: ["projectile"] }));
  }
  for (let i = 0; i < POOL.debris; i += 1) {
    nodes.push(primitives.box({ name: debrisNodeId(i), material: pbr("#b5773f") })
      .position(0, -120, 0).scale(0.1).runtime({ id: debrisNodeId(i), tags: ["debris"] }));
  }
  for (let i = 0; i < POOL.puffs; i += 1) {
    nodes.push(primitives.sphere({ name: puffNodeId(i), material: puffMaterial("dust"), castShadow: false, receiveShadow: false })
      .position(0, -120, 0).scale(0.3).runtime({ id: puffNodeId(i), tags: ["puff"] }));
  }
  for (let i = 0; i < POOL.dots; i += 1) {
    nodes.push(primitives.sphere({ name: dotNodeId(i), material: glow("#fff7d8", 1.4), castShadow: false, receiveShadow: false })
      .position(0, -120, 0).scale(0.05).runtime({ id: dotNodeId(i), tags: ["trajectory"] }));
  }

  // ------------------------------------------------------- windmill rigs ----
  const bladeMat = pbr("#e8dcc0", { roughness: 0.7 });
  const hubMat = pbr("#8a5a2e", { roughness: 0.75 });
  const poleMat = pbr("#9a6a3a", { roughness: 0.8 });
  for (let m = 0; m < POOL.windmills; m += 1) {
    nodes.push(
      primitives.cylinder({ name: millPoleNodeId(m), material: poleMat })
        .position(0, -120, 0).scale([0.07, 1.6, 0.07]).runtime({ id: millPoleNodeId(m), tags: ["windmill"] }),
      primitives.cylinder({ name: millHubNodeId(m), material: hubMat })
        .position(0, -120, 0).scale([0.14, 0.1, 0.14]).rotate(Math.PI / 2, 0, 0).runtime({ id: millHubNodeId(m), tags: ["windmill"] })
    );
    for (let b = 0; b < POOL.windmillBlades; b += 1) {
      nodes.push(primitives.box({ name: bladeNodeId(m, b), material: bladeMat })
        .position(0, -120, 0).scale([0.1, 1, 0.03]).runtime({ id: bladeNodeId(m, b), tags: ["windmill"] }));
    }
  }

  // -------------------------------------------------- chapter dressing ------
  // Hero typed props placed per chapter (watchtower by the sling, gatehouse
  // behind the fortress, windmill prop in ch3, stone bridge scatter, planks).
  nodes.push(
    model(assets.gullsiegeWatchtowerMeshy, { name: PROP_IDS.watchtower, position: [-11.5, 0, -3.4], rotation: [0, 0.6, 0], targetMaxDimension: 3.2 })
      .runtime({ id: PROP_IDS.watchtower, tags: ["dressing"] }),
    model(assets.gullsiegeGatehouseMeshy, { name: PROP_IDS.gatehouse, position: [13.4, 0, -3.2], rotation: [0, -0.5, 0], targetMaxDimension: 3.6 })
      .runtime({ id: PROP_IDS.gatehouse, tags: ["dressing"] }),
    model(assets.gullsiegeWindmillMeshy, { name: PROP_IDS.windmillProp, position: [-11, 0, -4.6], rotation: [0, 0.35, 0], targetMaxDimension: 4.2 })
      .runtime({ id: PROP_IDS.windmillProp, tags: ["dressing"] }),
    model(assets.gullsiegeBridgeMeshy, { name: PROP_IDS.stoneBridge, position: [14.5, 0.1, 3.4], rotation: [0, -0.7, 0], targetMaxDimension: 3.4 })
      .runtime({ id: PROP_IDS.stoneBridge, tags: ["dressing"] }),
    model(assets.gullsiegePlanksMeshy, { name: PROP_IDS.plankScatter, position: [3.2, 0.06, 3.1], rotation: [0, 0.9, 0], targetMaxDimension: 2.6 })
      .runtime({ id: PROP_IDS.plankScatter, tags: ["dressing"] })
  );

  // Fortress flag — Player Studio recolors the pennant.
  nodes.push(
    primitives.cylinder({ name: "flag-pole", material: pbr("#6a4a2a", { roughness: 0.8 }) })
      .position(7.2, 2.4, -0.6).scale([0.05, 2.4, 0.05]).runtime({ id: PROP_IDS.flagPole, tags: ["flag"] }),
    primitives.box({ name: "flag-pennant", material: pbr("#ff4d5a", { roughness: 0.7 }) })
      .position(7.52, 4.45, -0.6).scale([0.62, 0.3, 0.04]).runtime({ id: PROP_IDS.flag, tags: ["flag"] })
  );

  // --------------------------------------------------------- lights + fx ----
  if (!reducedMotion) {
    nodes.push(
      effects.vignette({ intensity: 0.32 }),
      effects.antiAlias({ mode: "fxaa" })
    );
  }

  // ---------------------------------------------------------- camera spec ---
  const cameraSpec = camera.perspective({
    position: [-1.2, 3.4, 14.5],
    target: [1.4, 1.4, 0],
    fov: 46
  });

  return { nodes, cameraSpec };
}

export function buildScene(chapter: ChapterDef, reducedMotion: boolean): ReturnType<typeof scene> {
  const { nodes, cameraSpec } = buildStage(chapter, reducedMotion);
  let s = scene().background(chapter.look.background ?? "#9fd8ff");
  for (const node of nodes) s = s.add(node);
  s = s.camera(cameraSpec);
  return s;
}
