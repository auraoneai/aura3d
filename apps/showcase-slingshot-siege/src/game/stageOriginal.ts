/**
 * Slingshot Siege: the 4.6.2 look (GU47 blind-panel fix pass). A blind panel of three judges picked the 4.6.2
 * frames over the GU47 look on default and chapters 0-4 (0/3 each: crushed backlit cliffs, a flat grey sky, haze,
 * sun glare, sea showing through the island). This module is the 4.6.2 `buildStage` verbatim (outdoor-day look
 * with no fog, the ambient/hemisphere/sun/rim/bounce rig, the flat seabed sea, palette-tinted rocks, vignette and
 * FXAA) with the chapter palette that levels.ts used to carry. Presentation only (D8): node ids and pools are the
 * live stage's, so main.ts and the sim drive it unchanged. The puff sphere pool is gone (the runtime VFX pack
 * replaced it).
 */
import {
  camera,
  effects,
  geometry,
  lights,
  looks,
  material,
  primitives,
  scene,
  type AuraColor,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  CRAFT_MATS,
  bevelBoxMesh,
  buildArchedStoneBridgeNode,
  buildFacetedSeaCliffMesh,
  buildFortressFoundationNode,
  buildGatehouseNode,
  buildHeroSiegeBirdNode,
  buildLaunchBastionNode,
  buildPlankScatterNode,
  buildProceduralBarrelSpec,
  buildProceduralCrateSpec,
  buildProceduralPlankSpec,
  buildRaiderBossNode,
  buildSiegeSlingshotRigNode,
  buildWatchtowerNode,
  buildWindmillNode,
  buildWindmillSailBladeNode,
  latheMesh,
  mergeRawMeshes
} from "../art/proceduralModels";
import type { AmmoId } from "./ammo";
import {
  POOL, PROP_IDS, SLING_IDS, barrelNodeId, bladeNodeId, blockNodeId, crateNodeId, debrisNodeId, dotNodeId, gullPartId,
  millHubNodeId, millPoleNodeId, plankNodeId, projectileNodeId, type StageNodes, type StageOptions
} from "./stage";

type StageNode = AuraSceneNode | AuraNodeBuilder<AuraSceneNode>;

/** The 4.6.2 chapter look and terrain palette (levels.ts `look`, `ground`, `farGround` before GU47). */
export interface OriginalChapterLook {
  readonly id: number;
  readonly look: {
    readonly sun: { readonly azimuthDeg: number; readonly elevationDeg: number };
    readonly accent: string;
    readonly background: string;
  };
  readonly ground: string;
  readonly farGround: string;
}

export const ORIGINAL_CHAPTER_LOOKS: readonly OriginalChapterLook[] = [
  { id: 0, look: { sun: { azimuthDeg: 118, elevationDeg: 52 }, accent: "#ffd9a0", background: "#2b6cb0" }, ground: "#3d8c40", farGround: "#2d6e32" },
  { id: 1, look: { sun: { azimuthDeg: 140, elevationDeg: 58 }, accent: "#ffe2b8", background: "#245d9c" }, ground: "#8c7a5b", farGround: "#6e5e44" },
  { id: 2, look: { sun: { azimuthDeg: 100, elevationDeg: 54 }, accent: "#c8ffd8", background: "#2b6cb0" }, ground: "#3b8a44", farGround: "#2b6b33" },
  { id: 3, look: { sun: { azimuthDeg: 215, elevationDeg: 42 }, accent: "#ffb35c", background: "#1e4e8c" }, ground: "#4d8c3a", farGround: "#386b28" },
  { id: 4, look: { sun: { azimuthDeg: 235, elevationDeg: 38 }, accent: "#ff9a5c", background: "#1e4e8c" }, ground: "#3d8c40", farGround: "#2d6e32" },
  { id: 5, look: { sun: { azimuthDeg: 280, elevationDeg: 32 }, accent: "#8090ff", background: "#121838" }, ground: "#484d75", farGround: "#343859" }
];

/** The 4.6.2 palette row of a chapter (clamped). */
export function originalChapterLook(chapter: number): OriginalChapterLook {
  return ORIGINAL_CHAPTER_LOOKS[Math.min(Math.max(0, Math.trunc(chapter) || 0), ORIGINAL_CHAPTER_LOOKS.length - 1)]!;
}

function pbr(color: AuraColor, opts: { roughness?: number; metallic?: number; opacity?: number } = {}): AuraMaterialSpec {
  return material.pbr({ color, roughness: opts.roughness ?? 0.65, metallic: opts.metallic ?? 0, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) });
}
function glow(color: AuraColor, intensity = 0.9): AuraMaterialSpec {
  return material.emissive({ color, emissive: color, emissiveIntensity: intensity });
}
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

function buildStageOriginal(chapter: OriginalChapterLook, options: StageOptions): StageNodes {
  const nodes: StageNode[] = [];

  // Chapter look preset — outdoor-day with zero fog and balanced studio exposure.
  const look = looks.preset("outdoor-day", {
    fogDensityScale: 0,
    exposureEv: -0.08,
    sun: { ...chapter.look.sun },
    ...(chapter.look.accent ? { accent: chapter.look.accent as AuraColor } : {})
    // No `background` override: since GU47 E-A (9001eb1f8) a colour background hides the look's HDRI, and that HDRI is
    // the gradient sky with clouds 4.6.2 drew (the override turned it into a flat blue wall).
  });
  if (options.ambientOcclusion === false) {
    const group = look.toJSON() as AuraSceneNode & { readonly children?: readonly AuraSceneNode[] };
    nodes.push({ ...group, children: (group.children ?? []).filter((c) => (c as { name?: string }).name !== "look ambient occlusion") } as AuraSceneNode);
  } else {
    nodes.push(look);
  }
  nodes.push(
    lights.hemisphere({ name: "siege-hemi", skyColor: "#68a8e8", groundColor: "#3a5a34", intensity: 0.48, position: [0, 18, 0] }),
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
    buildLaunchBastionNode(),
    buildFortressFoundationNode()
  );

  // Sculpted procedural coastal sea-cliffs and Monterey pines (zero GLBs).
  const cliffMeshSpec = mergeRawMeshes([buildFacetedSeaCliffMesh(11)]);
  const rockPlacements: readonly { x: number; y: number; z: number; s: number; ry: number; kind: "A" | "B" }[] = [
    { x: -13.5, y: -0.25, z: -10.5, s: 2.4, ry: 0.4, kind: "B" },
    { x: -6.2, y: -0.25, z: -12.8, s: 2.8, ry: 1.2, kind: "B" },
    { x: 1.5, y: -0.25, z: -13.4, s: 3.0, ry: 2.1, kind: "B" },
    { x: 9.8, y: -0.25, z: -12.2, s: 2.7, ry: 0.8, kind: "B" },
    { x: 15.2, y: -0.25, z: -9.6, s: 2.2, ry: 1.7, kind: "B" },
    { x: -6.0, y: -0.08, z: -5.4, s: 7.2, ry: 2.5, kind: "A" },
    { x: 9.4, y: -0.08, z: -4.8, s: 7.8, ry: 0.9, kind: "A" },
    { x: -11.6, y: -0.2, z: -3.0, s: 3.4, ry: 0.6, kind: "A" },
    { x: 8.1, y: 0, z: 2.9, s: 2.8, ry: 1.9, kind: "A" }
  ];
  rockPlacements.forEach((place, i) => {
    nodes.push(
      geometry.custom(cliffMeshSpec, {
        name: `hill-${i}`,
        material: pbr(place.kind === "A" ? rockTintSmall : rockTint, { roughness: 0.92, metallic: 0.02 }),
        castShadow: true,
        receiveShadow: true
      }).position(place.x, place.y, place.z).rotate(0, place.ry, 0).scale(place.s * 0.42).runtime({ id: `hill-${i}`, tags: ["dressing"] })
    );
  });
  const pineCanopySpec = mergeRawMeshes([latheMesh([[0, 0], [1.1, 0.2], [0.75, 1.4], [0.35, 2.5], [0, 3.1]], 10)]);
  const treePlacements: readonly [number, number, number, number][] = [
    [-10.2, 0, -2.8, 0.42],
    [-5.0, 0, -3.6, 0.38],
    [3.8, 0, -3.8, 0.44],
    [10.8, 0, -2.6, 0.46],
    [11.6, 0, 2.2, 0.38]
  ];
  treePlacements.forEach(([x, y, z, s], i) => {
    nodes.push(
      geometry.custom(pineCanopySpec, { name: `cloud-${i}`, material: pbr(grassDark, { roughness: 0.86 }), castShadow: true, receiveShadow: true })
        .position(x, y, z).rotate(0, i * 1.1, 0).scale(s).runtime({ id: `cloud-${i}`, tags: ["cloud"] })
    );
  });

  // ------------------------------------------------------------- slingshot --
  const blockSpec = mergeRawMeshes([bevelBoxMesh(1, 1, 1, 0.06)]);
  const crateSpec = buildProceduralCrateSpec();
  const barrelSpec = buildProceduralBarrelSpec();
  const plankSpec = buildProceduralPlankSpec();
  const hubSpec = mergeRawMeshes([latheMesh([[0, -0.6], [0.75, -0.5], [0.75, 0.5], [0, 0.6]], 12)]);

  nodes.push(
    buildSiegeSlingshotRigNode([-7.4, 0.42, 0], 0.35, SLING_IDS.catapult),
    primitives.cylinder({ name: "sling-fork-l", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, -0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkL, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-fork-r", material: pbr("#8a5a2e", { roughness: 0.75 }) })
      .position(-7.62, 1.5, 0.22).rotate(0, 0, 0.42).scale([0.055, 0.85, 0.055]).runtime({ id: SLING_IDS.forkR, tags: ["sling"] }),
    primitives.cylinder({ name: "sling-trunk", material: pbr("#7a4e26", { roughness: 0.8 }) })
      .position(-7.4, 1.0, 0).scale([0.09, 0.8, 0.09]).runtime({ id: "sling-trunk", tags: ["sling"] }),
    primitives.roundedBox({ name: "sling-pouch", params: { radius: 0.045, widthSegments: 2 }, material: pbr("#5e3419", { roughness: 0.64 }) })
      .position(-7.4, 1.6, 0).scale([0.26, 0.12, 0.26]).runtime({ id: SLING_IDS.pouch, tags: ["sling"] }),
    primitives.box({ name: "sling-band-l", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, -0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandL, tags: ["sling"] }),
    primitives.box({ name: "sling-band-r", material: pbr("#d94f30", { roughness: 0.6 }) })
      .position(-7.5, 1.7, 0.16).scale([0.05, 0.05, 0.05]).runtime({ id: SLING_IDS.bandR, tags: ["sling"] }),
    buildHeroSiegeBirdNode("sling-loaded", "pebble", [-7.4, 1.62, 0], Math.PI * 0.5, 0.46, SLING_IDS.loaded, "sling"),
    buildHeroSiegeBirdNode("ammo-wait-0", "stone", [-8.35, 0.25, 0.52], Math.PI * 0.42, 0.52, "ammo-wait-0", "stage"),
    buildHeroSiegeBirdNode("ammo-wait-1", "triple", [-8.95, 0.2, -0.42], Math.PI * 0.48, 0.48, "ammo-wait-1", "stage"),
    buildHeroSiegeBirdNode("ammo-wait-2", "ember", [-9.45, 0.16, 0.28], Math.PI * 0.45, 0.45, "ammo-wait-2", "stage")
  );

  // ------------------------------------------------------- piece pools ------
  for (let i = 0; i < POOL.blocks; i += 1) {
    nodes.push(geometry.custom(blockSpec, { name: blockNodeId(i), material: CRAFT_MATS.limestoneAshlar, castShadow: true, receiveShadow: true })
      .position(0, -120, 0).scale(0.45).runtime({ id: blockNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.crates; i += 1) {
    nodes.push(geometry.custom(crateSpec, { name: crateNodeId(i), material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: true })
      .position(0, -120, 0).scale(0.38).runtime({ id: crateNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.barrels; i += 1) {
    nodes.push(geometry.custom(barrelSpec, { name: barrelNodeId(i), material: CRAFT_MATS.seasonedOak, castShadow: true, receiveShadow: true })
      .position(0, -120, 0).scale(0.42).runtime({ id: barrelNodeId(i), tags: ["piece"] }));
  }
  for (let i = 0; i < POOL.planks; i += 1) {
    nodes.push(geometry.custom(plankSpec, { name: plankNodeId(i), material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: true })
      .position(0, -120, 0).scale([0.65, 0.6, 0.45]).runtime({ id: plankNodeId(i), tags: ["piece"] }));
  }

  // ------------------------------------------------------- gull rigs --------
  for (let g = 0; g < POOL.gullRigs; g += 1) {
    nodes.push(buildRaiderBossNode(g, gullPartId(g, "body")));
  }

  // ------------------------------------------------- projectiles + debris ---
  const projAmmos: readonly AmmoId[] = ["pebble", "stone", "triple", "squid", "ember"];
  for (let i = 0; i < POOL.projectiles; i += 1) {
    nodes.push(buildHeroSiegeBirdNode(projectileNodeId(i), projAmmos[i % projAmmos.length]!, [0, -120, 0], Math.PI * 0.5, 0.5, projectileNodeId(i), "projectile"));
  }
  for (let i = 0; i < POOL.debris; i += 1) {
    nodes.push(geometry.custom(plankSpec, { name: debrisNodeId(i), material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: false })
      .position(0, -120, 0).scale(0.18).runtime({ id: debrisNodeId(i), tags: ["debris"] }));
  }
  for (let i = 0; i < POOL.dots; i += 1) {
    nodes.push(primitives.sphere({ name: dotNodeId(i), material: glow("#fff7d8", 1.8), castShadow: false, receiveShadow: false })
      .position(0, -120, 0).scale(0.07).runtime({ id: dotNodeId(i), tags: ["trajectory"] }));
  }

  // ------------------------------------------------------- windmill rigs ----
  for (let m = 0; m < POOL.windmills; m += 1) {
    nodes.push(
      buildWindmillNode(millPoleNodeId(m), millPoleNodeId(m), ["windmill"], [0, -120, 0], 0, 0.9, false),
      geometry.custom(hubSpec, { name: millHubNodeId(m), material: CRAFT_MATS.navalBrass, castShadow: true, receiveShadow: true })
        .position(0, -120, 0).scale([0.18, 0.18, 0.18]).runtime({ id: millHubNodeId(m), tags: ["windmill"] })
    );
    for (let b = 0; b < POOL.windmillBlades; b += 1) {
      nodes.push(buildWindmillSailBladeNode(bladeNodeId(m, b), bladeNodeId(m, b)));
    }
  }

  // -------------------------------------------------- chapter dressing ------
  nodes.push(
    buildWatchtowerNode(PROP_IDS.watchtower),
    buildGatehouseNode(PROP_IDS.gatehouse),
    buildWindmillNode(PROP_IDS.windmillProp, PROP_IDS.windmillProp, ["dressing"], [4.2, 0, -3.2], 0.25, 1.35, true),
    buildArchedStoneBridgeNode(),
    buildPlankScatterNode(PROP_IDS.plankScatter)
  );

  // -------------------------------------------------- foreground framing ----
  nodes.push(
    geometry.custom(crateSpec, { name: "fg-crate-a", material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: true })
      .position(-4.9, 0.34, 4.6).rotate(0, 0.35, 0).scale(0.44).runtime({ id: "fg-crate-a", tags: ["dressing"] }),
    geometry.custom(crateSpec, { name: "fg-crate-b", material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: true })
      .position(-4.95, 0.92, 4.55).rotate(0, 0.9, 0).scale(0.32).runtime({ id: "fg-crate-b", tags: ["dressing"] }),
    geometry.custom(barrelSpec, { name: "fg-barrel", material: CRAFT_MATS.seasonedOak, castShadow: true, receiveShadow: true })
      .position(-4.0, 0.34, 4.95).rotate(0, 0.2, 0).scale(0.44).runtime({ id: "fg-barrel", tags: ["dressing"] }),
    geometry.custom(crateSpec, { name: "fg-sling-crate", material: CRAFT_MATS.cratePine, castShadow: true, receiveShadow: true })
      .position(-10.2, 0.28, 3.6).rotate(0, 0.7, 0).scale(0.34).runtime({ id: "fg-sling-crate", tags: ["dressing"] }),
    geometry.custom(barrelSpec, { name: "fg-sling-barrel", material: CRAFT_MATS.seasonedOak, castShadow: true, receiveShadow: true })
      .position(-9.6, 0.27, 4.1).rotate(0, 0.5, 0).scale(0.36).runtime({ id: "fg-sling-barrel", tags: ["dressing"] }),
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

/** The 4.6.2 scene for a chapter (same node ids and pools as the GU47 stage). */
export function buildSceneOriginal(chapterId: number, options: StageOptions): ReturnType<typeof scene> {
  const chapter = originalChapterLook(chapterId);
  const { nodes, cameraSpec } = buildStageOriginal(chapter, options);
  let s = scene().background(chapter.look.background, { toneMapped: false });
  for (const node of nodes) s = s.add(node);
  s = s.camera(cameraSpec);
  return s;
}
