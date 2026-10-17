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
  lights,
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
  crates: 18,
  barrels: 12,
  planks: 24,
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
export function plankNodeId(i: number): string { return `v-plank-${i}`; }
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
  return material.pbr({ color: m.color, roughness: id === "wood" ? 0.58 : 0.46, metallic: 0.08 });
}

export function debrisMaterial(matId: string): AuraMaterialSpec {
  const key = (matId in MATERIALS ? matId : "wood") as SiegeMaterialId;
  return material.pbr({ color: MATERIALS[key].debrisColor, roughness: 0.55 });
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
  return material.pbr({ color, roughness: opts.roughness ?? 0.65, metallic: opts.metallic ?? 0, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) });
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

  // Chapter look preset — outdoor-day with zero fog and balanced studio exposure.
  nodes.push(
    looks.preset("outdoor-day", {
      fogDensityScale: 0,
      exposureEv: -0.08,
      sun: chapter.look.sun,
      ...(chapter.look.accent ? { accent: chapter.look.accent as AuraColor } : {}),
      background: (chapter.look.background ?? "#2b6cb0") as AuraColor
    }),
    lights.ambient({ name: "siege-ambient", color: "#dce8f8", intensity: 0.22 }),
    lights.hemisphere({ name: "siege-hemi", skyColor: "#5aa0e8", groundColor: "#2d5e2e", intensity: 0.35, position: [0, 18, 0] }),
    lights.directional({ name: "siege-sun", color: "#ffe6bd", intensity: 0.65, position: [-10, 24, 16] })
  );

  // ------------------------------------------------------------- terrain --
  nodes.push(
    primitives.cylinder({ name: "stage-ground", material: pbr(chapter.ground ?? "#3d8c40", { roughness: 0.72, metallic: 0.04 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.4, 0).scale([18, 0.35, 14]).runtime({ id: "stage-ground", tags: ["stage"] }),
    primitives.cylinder({ name: "stage-far-ground", material: pbr(chapter.farGround ?? "#2d6e32", { roughness: 0.78, metallic: 0.04 }), castShadow: false, receiveShadow: true })
      .position(1.6, -0.5, -0.4).scale([19.6, 0.32, 15.2]).runtime({ id: "stage-far-ground", tags: ["stage"] }),
    primitives.cylinder({ name: "stage-ocean", material: pbr("#144272", { roughness: 0.35, metallic: 0.12 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.62, -2.0).scale([64, 0.24, 52]).runtime({ id: "stage-ocean", tags: ["stage"] }),
    model(assets.gullsiegeBridgeMeshy, { name: "launch-knoll", position: [-7.4, -0.1, 0], rotation: [0, 0, 0] })
      .scale([2.2, 1.1, 2.2]).runtime({ id: "launch-knoll", tags: ["stage"] }),
    model(assets.gullsiegeBridgeMeshy, { name: "fortress-pad", position: [7.2, -0.22, 0], rotation: [0, 0, 0] })
      .scale([4.2, 0.55, 3.8]).runtime({ id: "fortress-pad", tags: ["stage"] })
  );

  // 3D Meshy coastal rocks, pine trees, and siege architecture around the stage (replaces primitive sphere hills)
  const rockPlacements: readonly [number, number, number, number, number][] = [
    [-13.5, -0.2, -10.5, 2.8, 0.4],
    [-6.2, -0.2, -12.8, 3.2, 1.2],
    [1.5, -0.2, -13.4, 3.5, 2.1],
    [9.8, -0.2, -12.2, 3.1, 0.8],
    [15.2, -0.2, -9.6, 2.6, 1.7],
    [-14.8, -0.2, -7.2, 2.4, 2.5],
    [14.4, -0.2, -6.8, 2.4, 0.9]
  ];
  rockPlacements.forEach(([x, y, z, s, ry], i) => {
    const asset = i % 2 === 0 ? assets.propRockA : assets.propRockB;
    nodes.push(
      model(asset, { name: `hill-${i}`, position: [x, y, z], rotation: [0, ry, 0] })
        .scale(s).runtime({ id: `hill-${i}`, tags: ["dressing"] })
    );
  });
  const treePlacements: readonly [number, number, number, number][] = [
    [-10.2, 0, -2.8, 0.24],
    [-5.0, 0, -3.6, 0.22],
    [3.8, 0, -3.8, 0.25],
    [10.8, 0, -2.6, 0.26],
    [11.6, 0, 2.2, 0.22]
  ];
  treePlacements.forEach(([x, y, z, s], i) => {
    const treeAsset = i % 2 === 0 ? assets.propPineTree : assets.propConifer;
    nodes.push(
      model(treeAsset, { name: `cloud-${i}`, position: [x, y, z], rotation: [0, i * 1.1, 0] })
        .scale(s).runtime({ id: `cloud-${i}`, tags: ["cloud"] })
    );
  });

  // ------------------------------------------------------------- slingshot --
  // Hero typed asset — the 3D Meshy siege catapult — as the launcher on the knoll.
  nodes.push(
    model(assets.gullsiegeCatapultMeshy, { name: "slingshot-base", position: [-7.4, 0.42, 0], rotation: [0, 0.35, 0] })
      .scale(1.35)
      .runtime({ id: SLING_IDS.catapult, tags: ["sling"] }),
    // Y-fork arms.
    primitives.cylinder({ name: "sling-fork-l", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, -0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkL, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-fork-r", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, 0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkR, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-trunk", material: pbr("#7a4e26", { roughness: 0.8 }) })
      .position(-7.4, 1.0, 0).scale([0.09, 0.8, 0.09]).runtime({ id: "sling-trunk", tags: ["sling"] }),
    // Pouch + bands + loaded 3D Meshy Hero Gull + waiting Hero Gull squad on the launch knoll.
    model(assets.gullsiegeCrateMeshy, { name: "sling-pouch", position: [-7.4, 1.6, 0] })
      .scale([0.22, 0.08, 0.18]).runtime({ id: SLING_IDS.pouch, tags: ["sling"] }),
    primitives.box({ name: "sling-band-l", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, -0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandL, tags: ["sling"] }),
    primitives.box({ name: "sling-band-r", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, 0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandR, tags: ["sling"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "sling-loaded", position: [-7.4, 1.62, 0], rotation: [0, Math.PI * 0.5, 0] })
      .scale(0.46).runtime({ id: SLING_IDS.loaded, tags: ["sling"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-0", position: [-8.35, 0.25, 0.52], rotation: [0, Math.PI * 0.42, 0] })
      .scale(0.52).runtime({ id: "ammo-wait-0", tags: ["stage"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-1", position: [-8.95, 0.2, -0.42], rotation: [0, Math.PI * 0.48, 0] })
      .scale(0.48).runtime({ id: "ammo-wait-1", tags: ["stage"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-2", position: [-9.45, 0.16, 0.28], rotation: [0, Math.PI * 0.45, 0] })
      .scale(0.45).runtime({ id: "ammo-wait-2", tags: ["stage"] })
  );

  // ------------------------------------------------------- piece pools ------
  // Every fortress piece is a real 3D Meshy GLB model (crates, barrels, planks, stone bridge blocks).
  for (let i = 0; i < POOL.blocks; i += 1) {
    const asset = i % 3 === 0 ? assets.gullsiegeCrateMeshy : i % 3 === 1 ? assets.gullsiegePlanksMeshy : assets.gullsiegeBridgeMeshy;
    nodes.push(model(asset, { name: blockNodeId(i), position: [0, -120, 0] })
      .scale(0.45).runtime({ id: blockNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.crates; i += 1) {
    nodes.push(model(assets.gullsiegeCrateMeshy, { name: crateNodeId(i), position: [0, -120, 0] })
      .scale(0.38).runtime({ id: crateNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.barrels; i += 1) {
    nodes.push(model(assets.gullsiegeBarrelMeshy, { name: barrelNodeId(i), position: [0, -120, 0] })
      .scale(0.42).runtime({ id: barrelNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.planks; i += 1) {
    nodes.push(model(assets.gullsiegePlanksMeshy, { name: plankNodeId(i), position: [0, -120, 0] })
      .scale([0.65, 0.6, 0.45]).runtime({ id: plankNodeId(i), tags: ["piece"] }));
  }

  // ------------------------------------------------------- gull rigs --------
  // Bespoke 3D Meshy Raider Bosses (pirate boar kings) perched inside the fortress!
  for (let g = 0; g < POOL.gullRigs; g += 1) {
    nodes.push(
      model(assets.gullsiegeRaiderBossMeshy, { name: gullPartId(g, "body"), position: [0, -120, 0], rotation: [0, -Math.PI * 0.45, 0] })
        .scale([0.54, 0.54, 0.54]).runtime({ id: gullPartId(g, "body"), tags: ["gull"] })
    );
  }

  // ------------------------------------------------- projectiles + debris ---
  for (let i = 0; i < POOL.projectiles; i += 1) {
    nodes.push(model(assets.gullsiegeHeroGullMeshy, { name: projectileNodeId(i), position: [0, -120, 0], rotation: [0, Math.PI * 0.5, 0] })
      .scale(0.48).runtime({ id: projectileNodeId(i), tags: ["projectile"] }));
  }
  for (let i = 0; i < POOL.debris; i += 1) {
    nodes.push(model(assets.gullsiegePlanksMeshy, { name: debrisNodeId(i), position: [0, -120, 0] })
      .scale(0.18).runtime({ id: debrisNodeId(i), tags: ["debris"] }));
  }
  for (let i = 0; i < POOL.puffs; i += 1) {
    nodes.push(primitives.sphere({ name: puffNodeId(i), material: puffMaterial("dust"), castShadow: false, receiveShadow: false })
      .position(0, -120, 0).scale(0.3).runtime({ id: puffNodeId(i), tags: ["puff"] }));
  }
  for (let i = 0; i < POOL.dots; i += 1) {
    nodes.push(primitives.sphere({ name: dotNodeId(i), material: glow("#fff7d8", 1.8), castShadow: false, receiveShadow: false })
      .position(0, -120, 0).scale(0.07).runtime({ id: dotNodeId(i), tags: ["trajectory"] }));
  }

  // ------------------------------------------------------- windmill rigs ----
  for (let m = 0; m < POOL.windmills; m += 1) {
    nodes.push(
      model(assets.gullsiegeWindmillMeshy, { name: millPoleNodeId(m), position: [0, -120, 0] })
        .scale(0.9).runtime({ id: millPoleNodeId(m), tags: ["windmill"] }),
      model(assets.gullsiegeBarrelMeshy, { name: millHubNodeId(m), position: [0, -120, 0] })
        .scale([0.18, 0.18, 0.18]).runtime({ id: millHubNodeId(m), tags: ["windmill"] })
    );
    for (let b = 0; b < POOL.windmillBlades; b += 1) {
      nodes.push(model(assets.gullsiegePlanksMeshy, { name: bladeNodeId(m, b), position: [0, -120, 0] })
        .scale([0.22, 0.9, 0.12]).runtime({ id: bladeNodeId(m, b), tags: ["windmill"] }));
    }
  }

  // -------------------------------------------------- chapter dressing ------
  // Hero typed 3D Meshy props placed right around the slingshot and fortress so they frame every shot!
  nodes.push(
    model(assets.gullsiegeWatchtowerMeshy, { name: PROP_IDS.watchtower, position: [-9.4, 0, -2.2], rotation: [0, 0.5, 0] })
      .scale(1.85).runtime({ id: PROP_IDS.watchtower, tags: ["dressing"] }),
    model(assets.gullsiegeGatehouseMeshy, { name: PROP_IDS.gatehouse, position: [9.8, 0, -2.4], rotation: [0, -0.45, 0] })
      .scale(2.1).runtime({ id: PROP_IDS.gatehouse, tags: ["dressing"] }),
    model(assets.gullsiegeWindmillMeshy, { name: PROP_IDS.windmillProp, position: [4.2, 0, -3.2], rotation: [0, 0.25, 0] })
      .scale(2.2).runtime({ id: PROP_IDS.windmillProp, tags: ["dressing"] }),
    model(assets.gullsiegeBridgeMeshy, { name: PROP_IDS.stoneBridge, position: [0.2, 0.05, -2.4], rotation: [0, 0.1, 0] })
      .scale(2.0).runtime({ id: PROP_IDS.stoneBridge, tags: ["dressing"] }),
    model(assets.gullsiegePlanksMeshy, { name: PROP_IDS.plankScatter, position: [5.2, 0.08, 2.1], rotation: [0, 0.7, 0] })
      .scale(1.45).runtime({ id: PROP_IDS.plankScatter, tags: ["dressing"] })
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
      effects.vignette({ intensity: 0.18 }),
      effects.antiAlias({ mode: "fxaa" })
    );
  }

  // ---------------------------------------------------------- camera spec ---
  const cameraSpec = camera.perspective({
    position: [-1.4, 4.1, 13.8],
    target: [2.0, 1.8, 0],
    fov: 48
  });

  return { nodes, cameraSpec };
}

export function buildScene(chapter: ChapterDef, reducedMotion: boolean): ReturnType<typeof scene> {
  const { nodes, cameraSpec } = buildStage(chapter, reducedMotion);
  let s = scene().background(chapter.look.background ?? "#2b6cb0", { toneMapped: false });
  for (const node of nodes) s = s.add(node);
  s = s.camera(cameraSpec);
  return s;
}
