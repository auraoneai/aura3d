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
  type AuraModelMaterialOverride,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import { MATERIALS, type SiegeMaterialId } from "./materials";
import type { ChapterDef } from "./levels";

// ----------------------------------------------------------------- pools --

/**
 * Node pools. `blocks` (stone-bridge GLB) carries the stone, glass, ice and
 * obsidian blocks; wood blocks draw from the crate and plank pools, so every
 * level fits (Gull Keep, the largest, needs 80 stone-family block nodes;
 * `tests/unit/slingshot-siege/pools.test.ts` asserts every level fits).
 */
export const POOL = {
  blocks: 80,
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

/**
 * GLB material overrides for a pooled piece node. Model nodes take their look
 * through the actor's override list (applied on every level load, so a pooled
 * node never keeps the previous level's material). Wood and stone keep the
 * authored GLB textures; glass and ice get a flat pale tint with their
 * opacity; obsidian a dark multiply.
 */
export function blockLook(id: SiegeMaterialId): readonly AuraModelMaterialOverride[] {
  const m = MATERIALS[id];
  if (id === "glass" || id === "ice") {
    return [{ color: m.color, colorMode: "replace", replaceTextures: true, roughness: 0.16, metallic: 0.05, opacity: m.opacity ?? 0.85 }];
  }
  if (id === "obsidian") return [{ color: m.color, colorMode: "multiply", roughness: 0.35, metallic: 0.35 }];
  if (id === "stone") return [{ color: "#d6dde6", colorMode: "multiply" }];
  return [];
}

/** Debris chips take the colour of the material they broke off. */
export function debrisLook(matId: string): readonly AuraModelMaterialOverride[] {
  const key = (matId in MATERIALS ? matId : "wood") as SiegeMaterialId;
  return [{ color: MATERIALS[key].debrisColor, colorMode: "replace", replaceTextures: true, roughness: 0.6 }];
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
/** Blend two authored hex colors — terrain decor stays derived from the chapter palette. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

// ------------------------------------------------------------------ scene --

export interface StageNodes {
  readonly nodes: readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[];
  readonly cameraSpec: ReturnType<typeof camera.perspective>;
}

type StageNode = AuraSceneNode | AuraNodeBuilder<AuraSceneNode>;

export interface StageOptions {
  /** prefers-reduced-motion or `?still=1`: drops the vignette (FXAA stays on). */
  readonly reducedMotion: boolean;
  /** `?ao=0` evidence switch: removes the look's ambient-occlusion pass for an AO-on/off capture pair. */
  readonly ambientOcclusion?: boolean;
}

export function buildStage(chapter: ChapterDef, options: StageOptions): StageNodes {
  const nodes: StageNode[] = [];

  // Chapter look preset — outdoor-day with zero fog and balanced studio exposure.
  const look = looks.preset("outdoor-day", {
    fogDensityScale: 0,
    exposureEv: -0.08,
    sun: chapter.look.sun,
    ...(chapter.look.accent ? { accent: chapter.look.accent as AuraColor } : {}),
    background: (chapter.look.background ?? "#2b6cb0") as AuraColor
  });
  if (options.ambientOcclusion === false) {
    const group = look.toJSON() as AuraSceneNode & { readonly children?: readonly AuraSceneNode[] };
    nodes.push({ ...group, children: (group.children ?? []).filter((c) => (c as { name?: string }).name !== "look ambient occlusion") } as AuraSceneNode);
  } else {
    nodes.push(look);
  }
  nodes.push(
    lights.ambient({ name: "siege-ambient", color: "#dce8f8", intensity: 0.2 }),
    lights.hemisphere({ name: "siege-hemi", skyColor: "#68a8e8", groundColor: "#3a5a34", intensity: 0.4, position: [0, 18, 0] }),
    lights.directional({ name: "siege-sun", color: "#ffe6bd", intensity: 0.85, position: [-10, 24, 16] }),
    // Cool rim from behind separates the fort, rocks, and trees from the water band.
    lights.directional({ name: "siege-rim", color: "#bfe0ff", intensity: 0.5, position: [12, 9, -16] }),
    lights.directional({ name: "siege-warm-bounce", color: "#ffd9a0", intensity: 0.28, position: [2, 6, 18] })
  );

  // ------------------------------------------------------------- terrain --
  // Palette-derived tones keep all six chapters coherent (green cove, quarry,
  // greenhouse, moon roost) without new textures or assets.
  const groundColor = chapter.ground ?? "#3d8c40";
  const farColor = chapter.farGround ?? "#2d6e32";
  const backdrop = chapter.look.background ?? "#2b6cb0";
  const accentColor = chapter.look.accent ?? "#ffd9a0";
  const grassLight = mixHex(groundColor, "#dceab0", 0.2);
  const grassDark = mixHex(groundColor, "#1b3520", 0.34);
  const dirtColor = mixHex(groundColor, "#8a6a44", 0.6);
  const rimColor = mixHex(groundColor, "#20281c", 0.55);
  const shallowColor = mixHex(backdrop, "#4aa8b4", 0.42);
  const hazeColor = mixHex(farColor, backdrop, 0.62);
  const rockTint = mixHex(farColor, "#8b8c82", 0.56);
  const rockTintSmall = mixHex(farColor, "#a09a88", 0.62);
  const rockOverrides = [
    { color: rockTint, colorMode: "replace" as const, replaceTextures: true, roughness: 0.9, metallic: 0.02 }
  ];
  const boulderOverrides = [
    { color: rockTintSmall, colorMode: "replace" as const, replaceTextures: true, roughness: 0.94, metallic: 0 }
  ];

  const moundSpecs: readonly { position: readonly [number, number, number]; scale: readonly [number, number, number] }[] = [
    { position: [-6.8, -0.42, -4.6], scale: [4.4, 1.3, 3.2] },
    { position: [10.4, -0.46, -4.9], scale: [4.2, 1.25, 3.1] },
    { position: [-4.0, -0.5, -6.3], scale: [5.0, 1.6, 3.6] },
    { position: [3.0, -0.52, -6.7], scale: [5.4, 1.65, 3.8] },
    { position: [8.6, -0.48, -6.2], scale: [4.4, 1.5, 3.3] },
    { position: [-6.9, -0.26, 1.9], scale: [3.0, 0.85, 2.2] },
    { position: [9.6, -0.28, 2.6], scale: [3.2, 0.8, 2.4] }
  ];
  const moundColors = [mixHex(groundColor, farColor, 0.35), mixHex(farColor, groundColor, 0.25), grassDark, mixHex(groundColor, grassLight, 0.35)];
  const moundInst = moundSpecs.map((m, i) => ({ ...m, rotation: [0, i * 1.37, 0] as [number, number, number] }));

  const patchSpecs: readonly { position: readonly [number, number, number]; scale: readonly [number, number, number] }[] = [
    { position: [-3.4, -0.02, 2.4], scale: [3.2, 0.07, 2.2] },
    { position: [4.6, -0.02, 4.0], scale: [2.8, 0.06, 1.9] },
    { position: [-0.6, -0.02, -3.4], scale: [3.6, 0.07, 2.4] },
    { position: [7.2, -0.02, -3.9], scale: [3.0, 0.06, 2.0] },
    { position: [-5.0, -0.02, -1.2], scale: [2.4, 0.06, 1.7] },
    { position: [9.2, -0.02, 1.0], scale: [2.2, 0.06, 1.6] },
    { position: [1.6, -0.02, 5.3], scale: [3.4, 0.07, 1.8] }
  ];
  const patchColors = patchSpecs.map((_, i) => (i % 2 === 0 ? mixHex(groundColor, grassLight, 0.5) : mixHex(groundColor, grassDark, 0.4)));

  const pathInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 7; i += 1) {
    pathInst.push({
      position: [-6.6 + i * 1.75, 0.008, 0.72 + Math.sin(i * 1.9) * 0.22],
      rotation: [0, Math.sin(i * 2.1) * 0.1, 0],
      scale: [1.55, 0.02, 1.05 - (i % 2) * 0.12]
    });
  }

  const tuftInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 46; i += 1) {
    const zz = 1.35 + (((i * 41) % 46) / 46) * 4.6;
    const half = 9 * Math.sqrt(Math.max(0.12, 1 - (zz / 7) ** 2)) - 0.55;
    const xx = 1.5 + ((((i * 29) % 46) / 46) * 2 - 1) * half;
    tuftInst.push({ position: [xx, 0.13, zz], rotation: [0, i * 1.71, 0], scale: [0.055, 0.26, 0.055] });
  }
  for (let i = 0; i < 18; i += 1) {
    const zz = -1.2 - (((i * 13) % 17) / 17) * 3.8;
    const half = 9 * Math.sqrt(Math.max(0.12, 1 - (zz / 7) ** 2)) - 0.8;
    const xx = 1.5 + ((((i * 7) % 17) / 17) * 2 - 1) * half;
    tuftInst.push({ position: [xx, 0.11, zz], rotation: [0, i * 2.13, 0], scale: [0.05, 0.22, 0.05] });
  }
  const tuftColors = tuftInst.map((_, i) => (i % 3 === 0 ? grassLight : i % 3 === 1 ? grassDark : mixHex(groundColor, "#9ab060", 0.3)));

  const pebbleInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [
    { position: [-2.9, 0.05, 4.9], rotation: [0, 0.4, 0], scale: [0.5, 0.16, 0.35] as [number, number, number] },
    { position: [2.4, 0.04, 5.6], rotation: [0, 1.1, 0], scale: [0.34, 0.12, 0.28] as [number, number, number] },
    { position: [7.6, 0.05, 4.2], rotation: [0, 2.0, 0], scale: [0.44, 0.14, 0.3] as [number, number, number] },
    { position: [-4.6, 0.04, 3.4], rotation: [0, 0.8, 0], scale: [0.3, 0.1, 0.24] as [number, number, number] },
    { position: [4.2, 0.05, 6.2], rotation: [0, 1.5, 0], scale: [0.5, 0.15, 0.36] as [number, number, number] }
  ];

  const foamInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const foamColors: string[] = [];
  for (let i = 0; i < 34; i += 1) {
    const a = Math.PI + ((i + 0.5) / 34) * Math.PI;
    const cx = 1.6 + Math.cos(a) * 10.15;
    const cz = -0.4 + Math.sin(a) * 8.0;
    const tx = -10.15 * Math.sin(a);
    const tz = 8.0 * Math.cos(a);
    foamInst.push({
      position: [cx, -0.27, cz],
      rotation: [0, -Math.atan2(tz, tx), 0],
      scale: [0.72 + (i % 4) * 0.1, 0.018, 0.16]
    });
    foamColors.push(i % 3 === 0 ? "#d7eee9" : "#eef8f2");
  }

  const headlandSpecs: readonly { position: readonly [number, number, number]; scale: readonly [number, number, number] }[] = [
    { position: [-19, 0.2, -23], scale: [9, 2.4, 3.6] },
    { position: [-7, 0.1, -27], scale: [7, 1.8, 3.0] },
    { position: [4, 0.3, -25], scale: [6, 2.1, 2.8] },
    { position: [13, -0.1, -28], scale: [8, 1.5, 3.2] },
    { position: [23, 0.2, -24], scale: [9, 2.0, 3.4] }
  ];
  const headlandInst = headlandSpecs.map((h, i) => ({ ...h, rotation: [0, i * 0.9, 0] as [number, number, number] }));
  const headlandColors = headlandSpecs.map((_, i) => mixHex(hazeColor, backdrop, 0.25 + (i % 3) * 0.12));

  nodes.push(
    primitives.cylinder({ name: "stage-ground", material: pbr(groundColor, { roughness: 0.78, metallic: 0.03 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.175, 0).scale([18, 0.35, 14]).runtime({ id: "stage-ground", tags: ["stage"] }),
    // Dark earth lip peeks above the grass at the island edge so the disc reads as terrain, not a decal.
    primitives.cylinder({ name: "stage-ground-rim", material: pbr(rimColor, { roughness: 0.9, metallic: 0.02 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.17, 0).scale([18.5, 0.36, 14.5]),
    primitives.cylinder({ name: "stage-far-ground", material: pbr(mixHex(farColor, grassDark, 0.18), { roughness: 0.84, metallic: 0.02 }), castShadow: false, receiveShadow: true })
      .position(1.6, -0.26, -0.4).scale([19.6, 0.32, 15.2]).runtime({ id: "stage-far-ground", tags: ["stage"] }),
    primitives.cylinder({ name: "stage-shallows", material: pbr(shallowColor, { roughness: 0.18, metallic: 0.15 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.315, -0.4).scale([22, 0.05, 17]),
    primitives.cylinder({ name: "stage-ocean", material: pbr(mixHex(backdrop, "#0d2f4e", 0.55), { roughness: 0.22, metallic: 0.24 }), castShadow: false, receiveShadow: true })
      .position(1.5, -0.45, -2.0).scale([64, 0.24, 52]).runtime({ id: "stage-ocean", tags: ["stage"] }),
    primitives.box({ name: "shore-foam", material: pbr("#ffffff", { roughness: 0.55 }), instances: foamInst, instanceColors: foamColors, castShadow: false, receiveShadow: false }),
    primitives.sphere({ name: "terrain-mounds", material: pbr("#ffffff", { roughness: 0.92, metallic: 0.02 }), instances: moundInst, instanceColors: moundSpecs.map((_, i) => moundColors[i % moundColors.length]!), castShadow: false, receiveShadow: true }),
    primitives.sphere({ name: "grass-patches", material: pbr("#ffffff", { roughness: 0.95 }), instances: patchSpecs.map((p) => ({ ...p, rotation: [0, 0, 0] as [number, number, number] })), instanceColors: patchColors, castShadow: false, receiveShadow: true }),
    primitives.box({ name: "dirt-path", material: pbr(dirtColor, { roughness: 0.96, metallic: 0 }), instances: pathInst, instanceColors: pathInst.map((_, i) => (i % 2 === 0 ? dirtColor : mixHex(dirtColor, groundColor, 0.28))), castShadow: false, receiveShadow: true }),
    primitives.box({ name: "grass-tufts", material: pbr("#ffffff", { roughness: 0.9 }), instances: tuftInst, instanceColors: tuftColors, castShadow: false, receiveShadow: false }),
    primitives.sphere({ name: "foreground-pebbles", material: pbr(rockTintSmall, { roughness: 0.94 }), instances: pebbleInst, castShadow: false, receiveShadow: true }),
    primitives.sphere({ name: "distant-headlands", material: pbr("#ffffff", { roughness: 1, metallic: 0 }), instances: headlandInst, instanceColors: headlandColors, castShadow: false, receiveShadow: false }),
    model(assets.gullsiegeBridgeMeshy, { name: "launch-knoll", position: [-7.4, -0.1, 0], rotation: [0, 0, 0] })
      .scale([2.2, 1.1, 2.2]).runtime({ id: "launch-knoll", tags: ["stage"] }),
    model(assets.gullsiegeBridgeMeshy, { name: "fortress-pad", position: [7.2, -0.22, 0], rotation: [0, 0, 0] })
      .scale([4.2, 0.55, 3.8]).runtime({ id: "fortress-pad", tags: ["stage"] })
  );

  // Stylized chapter rocks: the photoreal GLBs keep their silhouettes but get
  // flat palette-derived materials so they read as the same art style as the fort.
  const rockPlacements: readonly { x: number; y: number; z: number; s: number; ry: number; kind: "A" | "B" }[] = [
    { x: -13.5, y: -0.25, z: -10.5, s: 2.4, ry: 0.4, kind: "B" },
    { x: -6.2, y: -0.25, z: -12.8, s: 2.8, ry: 1.2, kind: "B" },
    { x: 1.5, y: -0.25, z: -13.4, s: 3.0, ry: 2.1, kind: "B" },
    { x: 9.8, y: -0.25, z: -12.2, s: 2.7, ry: 0.8, kind: "B" },
    { x: 15.2, y: -0.25, z: -9.6, s: 2.2, ry: 1.7, kind: "B" },
    { x: -6.0, y: -0.08, z: -5.4, s: 7.2, ry: 2.5, kind: "A" },
    { x: 9.4, y: -0.08, z: -4.8, s: 7.8, ry: 0.9, kind: "A" },
    // Kept clear of the aim sight-line: at its old spot (-5.6, 3.6) this rock sat
    // directly between the aim camera and the slingshot at x -7.4.
    { x: -11.6, y: -0.2, z: -3.0, s: 3.4, ry: 0.6, kind: "A" },
    { x: 8.1, y: 0, z: 2.9, s: 2.8, ry: 1.9, kind: "A" }
  ];
  rockPlacements.forEach((place, i) => {
    const asset = place.kind === "A" ? assets.propRockA : assets.propRockB;
    nodes.push(
      model(asset, {
        name: `hill-${i}`,
        position: [place.x, place.y, place.z],
        rotation: [0, place.ry, 0],
        materialOverrides: place.kind === "A" ? boulderOverrides : rockOverrides
      }).scale(place.s).runtime({ id: `hill-${i}`, tags: ["dressing"] })
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
      .scale(0.46)
      .animate({ clip: "Ready", loop: true, speed: 1.0 })
      .runtime({ id: SLING_IDS.loaded, tags: ["sling"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-0", position: [-8.35, 0.25, 0.52], rotation: [0, Math.PI * 0.42, 0] })
      .scale(0.52)
      .animate({ clip: "Idle_Loop", loop: true, speed: 0.95 })
      .runtime({ id: "ammo-wait-0", tags: ["stage"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-1", position: [-8.95, 0.2, -0.42], rotation: [0, Math.PI * 0.48, 0] })
      .scale(0.48)
      .animate({ clip: "Idle_Loop", loop: true, speed: 1.05 })
      .runtime({ id: "ammo-wait-1", tags: ["stage"] }),
    model(assets.gullsiegeHeroGullMeshy, { name: "ammo-wait-2", position: [-9.45, 0.16, 0.28], rotation: [0, Math.PI * 0.45, 0] })
      .scale(0.45)
      .animate({ clip: "Idle_Loop", loop: true, speed: 0.9 })
      .runtime({ id: "ammo-wait-2", tags: ["stage"] })
  );

  // ------------------------------------------------------- piece pools ------
  // Every fortress piece is a real 3D Meshy GLB model (crates, barrels, planks, stone bridge blocks).
  // Block pool = the stone-bridge GLB (stone, glass, ice, obsidian); wood blocks use the crate/plank pools below.
  for (let i = 0; i < POOL.blocks; i += 1) {
    nodes.push(model(assets.gullsiegeBridgeMeshy, { name: blockNodeId(i), position: [0, -120, 0] })
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
        .scale([0.54, 0.54, 0.54])
        .animate({ clip: "Idle_Loop", loop: true, speed: 0.95 + (g % 3) * 0.08 })
        .runtime({ id: gullPartId(g, "body"), tags: ["gull"] })
    );
  }

  // ------------------------------------------------- projectiles + debris ---
  for (let i = 0; i < POOL.projectiles; i += 1) {
    nodes.push(model(assets.gullsiegeHeroGullMeshy, { name: projectileNodeId(i), position: [0, -120, 0], rotation: [0, Math.PI * 0.5, 0] })
      .scale(0.48)
      .animate({ clip: "Jump_Loop", loop: true, speed: 1.45 })
      .runtime({ id: projectileNodeId(i), tags: ["projectile"] }));
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
    // Off to the far left-front so it frames the launch knoll without standing
    // between the camera and the slingshot.
    model(assets.gullsiegeWatchtowerMeshy, { name: PROP_IDS.watchtower, position: [-12.4, 0, 4.2], rotation: [0, 0.5, 0] })
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

  // -------------------------------------------------- foreground framing ----
  // Static props at the edges of the launch knoll populate the lower third
  // without entering the flight lane (z ≈ 0 between sling and fort).
  nodes.push(
    model(assets.gullsiegeCrateMeshy, { name: "fg-crate-a", position: [-4.9, 0, 4.6], rotation: [0, 0.35, 0] })
      .scale(0.6).runtime({ id: "fg-crate-a", tags: ["dressing"] }),
    model(assets.gullsiegeCrateMeshy, { name: "fg-crate-b", position: [-4.95, 0.8, 4.55], rotation: [0, 0.9, 0] })
      .scale(0.42).runtime({ id: "fg-crate-b", tags: ["dressing"] }),
    model(assets.gullsiegeBarrelMeshy, { name: "fg-barrel", position: [-4.0, 0, 4.95], rotation: [0, 0.2, 0] })
      .scale(0.5).runtime({ id: "fg-barrel", tags: ["dressing"] }),
    model(assets.gullsiegeCrateMeshy, { name: "fg-sling-crate", position: [-10.2, 0, 3.6], rotation: [0, 0.7, 0] })
      .scale(0.42).runtime({ id: "fg-sling-crate", tags: ["dressing"] }),
    model(assets.gullsiegeBarrelMeshy, { name: "fg-sling-barrel", position: [-9.6, 0, 4.1], rotation: [0, 0.5, 0] })
      .scale(0.38).runtime({ id: "fg-sling-barrel", tags: ["dressing"] }),
    primitives.cylinder({ name: "fg-banner-pole", material: pbr("#7a4e26", { roughness: 0.82 }), castShadow: true })
      .position(6.3, 1.35, 5.15).scale([0.06, 2.7, 0.06]),
    primitives.box({ name: "fg-banner", material: pbr(mixHex(accentColor, "#c8452e", 0.4), { roughness: 0.72 }), castShadow: false })
      .position(6.66, 2.14, 5.13).scale([0.72, 0.92, 0.035]),
    primitives.box({ name: "fg-banner-trim", material: pbr(mixHex(accentColor, "#ffe9b0", 0.5), { roughness: 0.5, metallic: 0.25 }), castShadow: false })
      .position(6.66, 2.62, 5.12).scale([0.76, 0.08, 0.045]),
    primitives.sphere({ name: "fg-banner-finial", material: pbr(mixHex(accentColor, "#ffe9b0", 0.55), { roughness: 0.45, metallic: 0.3 }), castShadow: false })
      .position(6.3, 2.75, 5.15).scale([0.13, 0.13, 0.13])
  );

  // Fortress flag — a stone bastion plus a full-height mast through the central
  // keep, so the pennant always reads as attached instead of floating.
  nodes.push(
    primitives.box({ name: "fortress-flag-bastion", material: pbr(mixHex("#738296", farColor, 0.22), { roughness: 0.82, metallic: 0.05 }), castShadow: true, receiveShadow: true })
      .position(7.2, 0.55, -0.6).scale([1.15, 1.1, 1.15]),
    primitives.cylinder({ name: "fortress-flag-plinth", material: pbr("#5a5448", { roughness: 0.85 }), castShadow: true })
      .position(7.2, 1.14, -0.6).scale([0.42, 0.18, 0.42]),
    primitives.cylinder({ name: "flag-pole", material: pbr("#6a4a2a", { roughness: 0.8 }), castShadow: true })
      .position(7.2, 3.4, -0.6).scale([0.07, 4.5, 0.07]).runtime({ id: PROP_IDS.flagPole, tags: ["flag"] }),
    primitives.sphere({ name: "flag-finial", material: pbr(mixHex(accentColor, "#ffe9b0", 0.55), { roughness: 0.4, metallic: 0.35 }), castShadow: false })
      .position(7.2, 5.7, -0.6).scale([0.16, 0.16, 0.16]),
    primitives.box({ name: "flag-pennant", material: pbr("#ff4d5a", { roughness: 0.7 }), castShadow: false })
      .position(7.74, 5.15, -0.6).scale([1.04, 0.5, 0.04]).runtime({ id: PROP_IDS.flag, tags: ["flag"] }),
    primitives.box({ name: "flag-hoist-rope", material: pbr("#3a2c20", { roughness: 0.9 }), castShadow: false })
      .position(7.74, 5.42, -0.6).scale([1.06, 0.022, 0.022]),
    primitives.box({ name: "flag-ribbon", material: pbr(mixHex(accentColor, "#f0b45a", 0.5), { roughness: 0.68 }), castShadow: false })
      .position(7.62, 4.82, -0.605).scale([0.78, 0.075, 0.02])
  );

  // --------------------------------------------------------- lights + fx ----
  // FXAA is an image-quality pass, not motion: it stays on for reduced-motion players. Only the vignette is dropped.
  if (!options.reducedMotion) nodes.push(effects.vignette({ intensity: 0.18 }));
  nodes.push(effects.antiAlias({ mode: "fxaa" }));

  // ---------------------------------------------------------- camera spec ---
  const cameraSpec = camera.perspective({
    position: [-2.5, 4.0, 15.5],
    target: [-0.5, 1.5, 0],
    fov: 55
  });

  return { nodes, cameraSpec };
}

export function buildScene(chapter: ChapterDef, options: StageOptions): ReturnType<typeof scene> {
  const { nodes, cameraSpec } = buildStage(chapter, options);
  let s = scene().background(chapter.look.background ?? "#2b6cb0", { toneMapped: false });
  for (const node of nodes) s = s.add(node);
  s = s.camera(cameraSpec);
  return s;
}
