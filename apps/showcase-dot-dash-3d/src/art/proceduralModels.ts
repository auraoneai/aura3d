/**
 * Glint Courier (`dot-dash-3d`) — Procedural Multi-Material 3D Art & Unit-Bounded Pool Kit (`WP-12`).
 *
 * Pure `@aura3d/engine` procedural geometry and physical multi-material assemblies built on
 * `apps/showcase-port-shared/proceduralKernel.ts` with zero `three` imports:
 * - Sculpted Glint Courier hover-sphere/bot (`latheMesh` clearcoat hull + brass equator gimbal ring,
 *   `tubeSweepMesh` intake conduits, `fabric` stator damper collar, `physical` optical visor dome,
 *   and `practical: true` thruster core).
 * - 4 distinct sculpted Hunter/Ghost automaton silhouettes (`shC`, `shB`, `shT`, `shY`) with
 *   `loftSectionsMesh` scalloped hover-skirts, twin optical sensor domes, and ventral plasma bells.
 * - Faceted energy pellets, gyroscopic power-orbs, 6 sculpted bonus arcade relics (cherries, berry,
 *   skeleton key, arcade bell, gyro chalice, Galaxian starfighter), `archwayVoussoirSlots` warp-tunnel
 *   archways, articulated workshop desk lamp, and beveled SMD IC maze wall modules.
 * - Every `pool-${k}` geometry is strictly normalized inside `[-0.5 .. +0.5]^3` unit bounds.
 */
import {
  game,
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";

type GroupBuilder = ReturnType<typeof group>;
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  deformMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  smaxPoly,
  sminPoly,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { FruitKind } from "../game/grid.js";
import { BOARD_PARTS } from "../game/look.js";

export const POOL_CAPS = {
  wall: 420,
  wallTrim: 420,
  rail: 1700,
  trace: 640,
  traceLit: 640,
  dot: 220,
  orb: 8,
  prism: 8,
  vent: 8,
  marker: 8,
  eyes: 12,
  dress: 140,
  cap: 80,
  glow: 120,
  hero: 2,
  halo: 2,
  shC: 2,
  shB: 2,
  shT: 2,
  shY: 2,
  visor: 8,
  scan: 8,
  trophy: 12,
  gem: 12
} as const;

export type PoolKey = keyof typeof POOL_CAPS;

export type GemCacheId =
  | "ruby"
  | "emerald"
  | "sapphire"
  | "amber"
  | "amethyst"
  | "cyan"
  | "coral"
  | "lime";

export interface GemCacheSpec {
  readonly id: GemCacheId;
  readonly label: string;
  readonly hex: string;
  readonly coreHex: string;
  readonly rimHex: string;
  readonly pedestalIndex: number;
  readonly spinPhase: number;
}

/** All 8 distinct vivid faceted crystal gem caches framing the perimeter of the maze. */
export const GEM_CACHE_SPECS: readonly GemCacheSpec[] = [
  { id: "ruby", label: "RUBY CACHE", hex: "#ff2a55", coreHex: "#ff90a8", rimHex: "#ffc0cf", pedestalIndex: 0, spinPhase: 0.0 },
  { id: "emerald", label: "EMERALD CACHE", hex: "#18e07a", coreHex: "#8effc4", rimHex: "#c4ffe0", pedestalIndex: 1, spinPhase: 0.8 },
  { id: "sapphire", label: "SAPPHIRE CACHE", hex: "#2888ff", coreHex: "#8ec6ff", rimHex: "#c8e4ff", pedestalIndex: 2, spinPhase: 1.6 },
  { id: "amber", label: "AMBER CACHE", hex: "#ffb01f", coreHex: "#ffe08a", rimHex: "#fff0be", pedestalIndex: 3, spinPhase: 2.4 },
  { id: "amethyst", label: "AMETHYST CACHE", hex: "#b44cff", coreHex: "#dfabff", rimHex: "#f0d4ff", pedestalIndex: 6, spinPhase: 3.2 },
  { id: "cyan", label: "CYAN CACHE", hex: "#18e8f0", coreHex: "#96fbff", rimHex: "#ccfdff", pedestalIndex: 7, spinPhase: 4.0 },
  { id: "coral", label: "CORAL CACHE", hex: "#ff6438", coreHex: "#ffb39a", rimHex: "#ffd6c8", pedestalIndex: 8, spinPhase: 4.8 },
  { id: "lime", label: "LIME CACHE", hex: "#92f428", coreHex: "#d4ff96", rimHex: "#ebffcc", pedestalIndex: 9, spinPhase: 5.6 }
] as const;

// ---------------------------------------------------------------------------
// Physical Material Library (>= 6 distinct @aura3d/engine presets)
// - Every emissive material sets `practical: true`.
// - Every >16-instance batch uses `material.pbr` or `material.metal` with `clearcoat: 0, sheen: 0`.
// - Glass domes/visors/prism shells use `material.physical` (castShadow: false).
// ---------------------------------------------------------------------------

const instancedGlowPbr = (emissiveIntensity: number, roughness = 0.22): AuraMaterialSpec =>
  material.pbr({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity,
    roughness,
    metalness: 0.06,
    clearcoat: 0,
    sheen: 0,
    practical: true
  });

export const DD_MATERIALS = {
  // Hero Electric Gold & Electric Cyan courier materials (never grey/colorless)
  courierClearcoatShell: material.carPaint({
    name: "courier electric gold shell",
    color: "#ffc422",
    emissive: "#ffaa18",
    emissiveIntensity: 0.34,
    roughness: 0.14,
    metalness: 0.62,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.8,
    rim: { color: "#fff08a", power: 2.2, intensity: 0.85 },
    practical: true
  }),
  courierBurnishedGold: material.studioMetal({
    name: "courier burnished amber gold",
    color: "#ffaa18",
    emissive: "#ff9410",
    emissiveIntensity: 0.24,
    roughness: 0.18,
    metalness: 0.94,
    envMapIntensity: 1.65,
    practical: true
  }),
  courierPorcelainTrim: material.ceramic({
    name: "courier obsidian contrast cowl",
    color: "#141d2e",
    roughness: 0.22,
    clearcoat: 0.76,
    clearcoatRoughness: 0.08
  }),
  gimbalForgedBrass: material.studioMetal({
    name: "forged gimbal brass",
    color: "#ffc422",
    roughness: 0.18,
    metalness: 1
  }),
  anisotropicTitanium: material.brushedMetal({
    name: "anisotropic gold-bronze trim",
    color: "#ffaa18",
    roughness: 0.24,
    anisotropy: 0.78
  }),
  anisotropicCopper: material.brushedMetal({
    name: "anisotropic inductor copper",
    color: "#d47c42",
    roughness: 0.24,
    anisotropy: 0.82
  }),
  statorBraidedGasket: material.fabric({
    name: "braided stator damper",
    color: "#16283a",
    roughness: 0.82,
    sheen: 0.62,
    sheenRoughness: 0.48,
    sheenColor: "#18f0ff"
  }),
  opticalVisorGlass: material.physical({
    name: "optical visor glass",
    color: "#18f0ff",
    roughness: 0.04,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.52,
    alphaMode: "blend",
    depthWrite: false
  }),
  cyanThrusterPlasma: material.emissive({
    name: "courier cyan plasma",
    color: "#9cfaff",
    emissive: "#18f0ff",
    emissiveIntensity: 2.55,
    practical: true
  }),
  amberBeaconPlasma: material.emissive({
    name: "amber beacon plasma",
    color: "#ffe7bd",
    emissive: "#ffb23e",
    emissiveIntensity: 2.05,
    practical: true
  }),
  crimsonRubyGlaze: material.clearcoatPaint({
    name: "arcade cherry ruby",
    color: "#e62244",
    roughness: 0.12,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04
  }),
  emeraldLeafGlaze: material.clearcoatPaint({
    name: "arcade emerald glaze",
    color: "#1fb86c",
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08
  }),
  roseBerryGlaze: material.clearcoatPaint({
    name: "arcade rose glaze",
    color: "#f2559c",
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 0.92,
    clearcoatRoughness: 0.06
  }),
  galaxianCobaltPaint: material.clearcoatPaint({
    name: "galaxian starfighter paint",
    color: "#2258d8",
    roughness: 0.18,
    metalness: 0.28,
    clearcoat: 0.94,
    clearcoatRoughness: 0.06
  }),
  lampShadeEnamel: material.clearcoatPaint({
    name: "workbench lamp enamel",
    color: "#1f2a26",
    roughness: 0.26,
    metalness: 0.18,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12
  }),
  darkSlateCeramic: material.ceramic({
    name: "portal slate ceramic",
    color: "#1d2733",
    roughness: 0.32,
    clearcoat: 0.45,
    clearcoatRoughness: 0.14
  }),

  // Instanced pool materials (strictly clearcoat: 0, sheen: 0 on all CAP > 16 batches)
  poolWall: material.pbr({
    color: "#ffffff",
    roughness: BOARD_PARTS.epoxy.roughness,
    metalness: 0.14,
    clearcoat: 0,
    sheen: 0
  }),
  poolWallTrim: instancedGlowPbr(0.92, 0.24),
  poolRail: material.metal({
    color: "#ffffff",
    roughness: BOARD_PARTS.pin.roughness,
    metalness: 1,
    anisotropy: 0.68,
    clearcoat: 0,
    sheen: 0
  }),
  poolTrace: material.metal({
    color: "#ffffff",
    roughness: 0.28,
    metalness: 1,
    anisotropy: 0.55,
    clearcoat: 0,
    sheen: 0
  }),
  poolTraceLit: instancedGlowPbr(1.9, 0.24),
  poolDot: instancedGlowPbr(1.55, 0.15),
  poolOrb: material.brushedMetal({
    color: BOARD_PARTS.can.color,
    roughness: 0.24,
    anisotropy: 0.62
  }),
  poolPrism: material.physical({
    color: "#b6f0ff",
    roughness: 0.04,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.52,
    alphaMode: "blend",
    depthWrite: false
  }),
  poolVent: instancedGlowPbr(2.1, 0.2),
  poolMarker: material.pbr({
    color: "#ffffff",
    roughness: 0.38,
    metalness: 0.1,
    clearcoat: 0,
    sheen: 0
  }),
  poolEyes: material.clearcoatPaint({
    name: "specter glossy multi-part eye",
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.14,
    roughness: 0.07,
    metalness: 0.04,
    clearcoat: 0.96,
    clearcoatRoughness: 0.04,
    practical: true
  }),
  poolDress: material.metal({
    color: "#ffffff",
    roughness: 0.34,
    metalness: 0.76,
    clearcoat: 0,
    sheen: 0
  }),
  poolCap: material.metal({
    color: "#ffffff",
    roughness: 0.24,
    metalness: 1,
    anisotropy: 0.65,
    clearcoat: 0,
    sheen: 0
  }),
  poolGlow: instancedGlowPbr(1.65, 0.22),
  poolHeroVisor: instancedGlowPbr(2.25, 0.12),
  poolHalo: material.pbr({
    color: "#ffffff",
    emissive: "#ffaa18",
    emissiveIntensity: 1.18,
    roughness: 0.18,
    metalness: 0.72,
    clearcoat: 0,
    sheen: 0,
    practical: true
  }),
  poolSentryArmor: material.clearcoatPaint({
    name: "sentry porcelain ghost mantle",
    color: "#ffffff",
    roughness: 0.14,
    metalness: 0.12,
    clearcoat: 0.98,
    clearcoatRoughness: 0.04,
    rim: { color: "#e4f2ff", power: 2.3, intensity: 0.88 }
  }),
  poolSentryVisor: material.clearcoatPaint({
    name: "sentry expressive multi-part eyes",
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.14,
    roughness: 0.07,
    metalness: 0.04,
    clearcoat: 0.96,
    clearcoatRoughness: 0.04,
    practical: true
  }),
  poolSentryScan: material.pbr({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.85,
    opacity: 0.22,
    blend: "additive",
    depthWrite: false,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    practical: true
  }),
  poolTrophyGlass: material.physical({
    color: "#b6f0ff",
    roughness: 0.04,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.52,
    alphaMode: "blend",
    depthWrite: false
  }),
  poolGem: material.pbr({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.46,
    roughness: 0.04,
    metalness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.85,
    practical: true
  })
} as const;

// ---------------------------------------------------------------------------
// Unit-Bounds (`[-0.5 .. +0.5]^3`) Normalization & Star-Bezel Helpers
// ---------------------------------------------------------------------------

export function extrudeStarPolygonMesh(
  points: number,
  outerRadius: number,
  innerRadius: number,
  height: number,
  bevel = 0.02,
  flatShaded = true
): RawMesh {
  const n = Math.max(4, Math.floor(points));
  const ring: V2[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return extrudePolygonMesh(ring, height, bevel, flatShaded);
}

function mergeRawParts(parts: readonly RawMesh[]): RawMesh {
  return mergeRawMeshesToRaw(parts);
}

/**
 * Centers and scales any compound `RawMesh` strictly inside `[-0.5 .. +0.5]^3`
 * (`[-0.496 .. +0.496]^3` default) so runtime `setScale(sx, sy, sz)` sizes every
 * pooled instance identically to the `world.ts` unit-cube contract.
 */
export function normalizeUnitCubeMesh(
  src: RawMesh,
  fill: readonly [number, number, number] = [0.992, 0.992, 0.992]
): RawMesh {
  if (src.positions.length < 3) return src;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < src.positions.length; i += 3) {
    const x = src.positions[i]!, y = src.positions[i + 1]!, z = src.positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const fx = Math.min(0.996, Math.max(0.1, fill[0]));
  const fy = Math.min(0.996, Math.max(0.1, fill[1]));
  const fz = Math.min(0.996, Math.max(0.1, fill[2]));
  const sx = fx / Math.max(1e-4, maxX - minX);
  const sy = fy / Math.max(1e-4, maxY - minY);
  const sz = fz / Math.max(1e-4, maxZ - minZ);
  const centered = transformMesh(src, { pos: [-cx, -cy, -cz] });
  return transformMesh(centered, { scale: [sx, sy, sz] });
}

function unitSpec(
  parts: readonly RawMesh[],
  fill: readonly [number, number, number] = [0.992, 0.992, 0.992]
): AuraCustomGeometrySpec {
  return mergeRawMeshes([normalizeUnitCubeMesh(mergeRawParts(parts), fill)]);
}

function closedRingTube(radius: number, tubeR: number, segs = 18, radial = 6): RawMesh {
  const spine: V4[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    spine.push([Math.cos(a) * radius, 0, Math.sin(a) * radius, tubeR]);
  }
  return tubeSweepMesh(spine, radial, false);
}

// ---------------------------------------------------------------------------
// Sculpted PCB, Corridor, Pellet, Power-Orb & Component Pool Meshes
// ---------------------------------------------------------------------------

function buildWallModuleSpec(): AuraCustomGeometrySpec {
  // Sculpted multi-tier beveled neon labyrinth IC monolith: stepped solder plinth, chamfered epoxy block,
  // mitered corner buttresses, beveled heat-spreader crown plate & embossed central silicon die boss.
  const octDie: V2[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    octDie.push([Math.cos(a) * 0.28, Math.sin(a) * 0.28]);
  }
  const parts: RawMesh[] = [
    transformMesh(bevelBoxMesh(0.98, 0.2, 0.98, 0.045), { pos: [0, -0.36, 0] }),
    transformMesh(bevelBoxMesh(0.92, 0.64, 0.92, 0.085), { pos: [0, 0.01, 0] }),
    transformMesh(bevelBoxMesh(0.78, 0.13, 0.78, 0.04), { pos: [0, 0.38, 0] }),
    transformMesh(extrudePolygonMesh(octDie, 0.06, 0.016, true), {
      pos: [0, 0.45, 0],
      rot: [Math.PI * 0.5, 0, 0]
    })
  ];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        transformMesh(bevelBoxMesh(0.14, 0.56, 0.14, 0.03), {
          pos: [sx * 0.41, 0.01, sz * 0.41],
          rot: [0, Math.PI * 0.25, 0]
        })
      );
    }
  }
  return unitSpec(parts);
}

function buildWallTrimBezelSpec(): AuraCustomGeometrySpec {
  // Mitered beveled neon labyrinth light-pipe crown & waist rail + chamfered corner posts
  const parts: RawMesh[] = [
    transformMesh(bevelBoxMesh(0.98, 0.34, 0.12, 0.032), { pos: [0, 0.24, 0.43] }),
    transformMesh(bevelBoxMesh(0.98, 0.34, 0.12, 0.032), { pos: [0, 0.24, -0.43] }),
    transformMesh(bevelBoxMesh(0.12, 0.34, 0.74, 0.032), { pos: [0.43, 0.24, 0] }),
    transformMesh(bevelBoxMesh(0.12, 0.34, 0.74, 0.032), { pos: [-0.43, 0.24, 0] }),
    transformMesh(bevelBoxMesh(0.96, 0.18, 0.09, 0.024), { pos: [0, -0.26, 0.44] }),
    transformMesh(bevelBoxMesh(0.96, 0.18, 0.09, 0.024), { pos: [0, -0.26, -0.44] }),
    transformMesh(bevelBoxMesh(0.09, 0.18, 0.78, 0.024), { pos: [0.44, -0.26, 0] }),
    transformMesh(bevelBoxMesh(0.09, 0.18, 0.78, 0.024), { pos: [-0.44, -0.26, 0] })
  ];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        transformMesh(bevelBoxMesh(0.15, 0.84, 0.15, 0.035), {
          pos: [sx * 0.42, 0, sz * 0.42]
        })
      );
    }
  }
  return unitSpec(parts);
}

function buildGullWingPinSpec(): AuraCustomGeometrySpec {
  // Stepped 4-way symmetric gull-wing SMD lead & solder fillet (low-poly faceted lathe for >=60 FPS across 1,700 pins)
  return unitSpec([
    transformMesh(
      latheMesh([[0, -0.48], [0.48, -0.46], [0.46, -0.14], [0.32, 0.12], [0.24, 0.46], [0, 0.48]], 4, true),
      { rot: [0, Math.PI * 0.25, 0] }
    )
  ]);
}

function buildCopperTraceSpec(): AuraCustomGeometrySpec {
  // Raised etched copper bus bar with midpoint octagonal via pad (X/Z symmetric, mobile-friendly triangle budget)
  return unitSpec([
    bevelBoxMesh(0.98, 0.74, 0.98, 0.1),
    latheMesh([[0, -0.46], [0.47, -0.46], [0.48, 0.46], [0, 0.46]], 8, true)
  ]);
}

function buildLitTraceSpec(): AuraCustomGeometrySpec {
  // Crowned trapezoidal conduction pulse rib + center node jewel
  return unitSpec([
    bevelBoxMesh(0.98, 0.68, 0.98, 0.14),
    transformMesh(icosphereFacetMesh(0.38, 0), { scale: [1.1, 0.95, 1.1] })
  ]);
}

function buildEnergyPelletSpec(): AuraCustomGeometrySpec {
  // Multifaceted 12-cut royal brilliant optical jewel set on an octagonal chamfered SMD carrier pad
  const octPad: V2[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    octPad.push([Math.cos(a) * 0.44, Math.sin(a) * 0.44]);
  }
  const jewel = latheMesh(
    [[0, -0.26], [0.34, -0.06], [0.48, 0.12], [0.42, 0.28], [0.24, 0.45], [0, 0.48]],
    12,
    true
  );
  return unitSpec([
    transformMesh(extrudePolygonMesh(octPad, 0.18, 0.035, true), {
      pos: [0, -0.34, 0],
      rot: [Math.PI * 0.5, 0, 0]
    }),
    jewel
  ]);
}

function buildPowerCollarSpec(): AuraCustomGeometrySpec {
  // Precision lathed superconducting power-core turret with dual knurled flanges & 8 radial field coils
  const collar = latheMesh(
    [
      [0.24, -0.47],
      [0.48, -0.47],
      [0.48, -0.3],
      [0.39, -0.2],
      [0.42, 0.0],
      [0.39, 0.2],
      [0.48, 0.3],
      [0.48, 0.47],
      [0.26, 0.47],
      [0.22, 0.0],
      [0.24, -0.47]
    ],
    20,
    false
  );
  const parts: RawMesh[] = [collar];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      transformMesh(bevelBoxMesh(0.095, 0.82, 0.13, 0.024), {
        pos: [Math.sin(a) * 0.435, 0, Math.cos(a) * 0.435],
        rot: [0, a, 0]
      })
    );
  }
  return unitSpec(parts);
}

function buildGyroPrismShellSpec(): AuraCustomGeometrySpec {
  // 12-facet royal bipyramid power crystal shell + triple orthogonal gyroscopic gimbal rings
  const crystal = latheMesh(
    [[0, -0.48], [0.28, -0.24], [0.42, -0.05], [0.42, 0.05], [0.28, 0.24], [0, 0.48]],
    12,
    true
  );
  const ringA = transformMesh(closedRingTube(0.455, 0.034, 22, 7), { rot: [Math.PI * 0.32, 0, 0.22] });
  const ringB = transformMesh(closedRingTube(0.455, 0.034, 22, 7), { rot: [-Math.PI * 0.32, 0.6, -0.22] });
  const ringC = closedRingTube(0.46, 0.026, 22, 6);
  return unitSpec([crystal, ringA, ringB, ringC]);
}

function buildPlasmaStarCoreSpec(): AuraCustomGeometrySpec {
  // Smooth pulsing reactor core + 3 orthogonal 8-point star plasma vanes
  const vane = extrudeStarPolygonMesh(4, 0.48, 0.17, 0.065, 0.015, true);
  return unitSpec([
    subdivideSmoothMesh(icosphereSmoothMesh(0.28, 1, 0.04, 19, 0.2), 1, 0.5),
    vane,
    transformMesh(vane, { rot: [0, Math.PI * 0.5, 0] }),
    transformMesh(vane, { rot: [Math.PI * 0.5, 0, 0] })
  ]);
}

function buildReticleMarkerSpec(): AuraCustomGeometrySpec {
  // 4 PCB HUD corner L-brackets + central target diamond
  const cornerL: V2[] = [[-0.48, -0.48], [-0.14, -0.48], [-0.14, -0.35], [-0.35, -0.35], [-0.35, -0.14], [-0.48, -0.14]];
  const lMesh = transformMesh(extrudePolygonMesh(cornerL, 0.6, 0.04, true), { rot: [Math.PI * 0.5, 0, 0] });
  return unitSpec([
    lMesh,
    transformMesh(lMesh, { rot: [0, Math.PI * 0.5, 0] }),
    transformMesh(lMesh, { rot: [0, Math.PI, 0] }),
    transformMesh(lMesh, { rot: [0, -Math.PI * 0.5, 0] }),
    transformMesh(bevelBoxMesh(0.22, 0.72, 0.22, 0.04), { rot: [0, Math.PI * 0.25, 0] })
  ]);
}

function buildSpecterEyePodSpec(): AuraCustomGeometrySpec {
  // Multi-part defeated-phantom eyeball scurrying home (+Z): smooth white sclera + directional cobalt iris + dark pupil + dual catchlights + sculpted brow & wisp tail
  const sclera = paintMeshColors(
    transformMesh(
      taubinSmoothMesh(icosphereSmoothMesh(0.31, 2, 0.0, 13, 0.1), 4),
      { pos: [0, 0.01, 0.06], scale: [0.98, 1.08, 0.86] }
    ),
    [1.0, 1.0, 1.0]
  );
  const iris = paintMeshColors(
    transformMesh(
      taubinSmoothMesh(icosphereSmoothMesh(0.165, 1, 0, 5), 3),
      { pos: [0, 0.02, 0.295], scale: [0.94, 1.04, 0.42] }
    ),
    [0.04, 0.42, 1.0]
  );
  const pupil = paintMeshColors(
    transformMesh(
      taubinSmoothMesh(icosphereSmoothMesh(0.095, 1, 0, 7), 3),
      { pos: [0, 0.02, 0.345], scale: [0.92, 1.02, 0.34] }
    ),
    [0.015, 0.02, 0.05]
  );
  const catchMain = paintMeshColors(
    transformMesh(taubinSmoothMesh(icosphereSmoothMesh(0.054, 1, 0, 3), 2), {
      pos: [-0.058, 0.105, 0.375],
      scale: [1, 1, 0.45]
    }),
    [1.0, 1.0, 1.0]
  );
  const catchSub = paintMeshColors(
    transformMesh(taubinSmoothMesh(icosphereSmoothMesh(0.030, 1, 0, 9), 2), {
      pos: [0.052, -0.055, 0.372],
      scale: [1, 1, 0.45]
    }),
    [1.0, 1.0, 1.0]
  );
  const brow = paintMeshColors(
    taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [-0.26, 0.25, 0.13],
        mid: [0, 0.37, 0.23],
        tip: [0.26, 0.23, 0.13],
        width: 0.11,
        thickness: 0.085,
        segments: 9,
        radialSegments: 10
      }),
      3
    ),
    [0.06, 0.10, 0.24]
  );
  const wispTail = paintMeshColors(
    taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0, -0.03, -0.18],
        mid: [0.04, -0.14, -0.34],
        tip: [-0.03, -0.23, -0.48],
        width: 0.18,
        thickness: 0.15,
        segments: 9,
        radialSegments: 10
      }),
      3
    ),
    [0.72, 0.94, 1.0]
  );
  return unitSpec([sclera, iris, pupil, catchMain, catchSub, brow, wispTail]);
}

function buildFinnedHeatsinkSpec(): AuraCustomGeometrySpec {
  // Extruded anodized heatsink / socket block with 5 cooling blades & corner bosses
  const parts: RawMesh[] = [transformMesh(bevelBoxMesh(0.98, 0.38, 0.98, 0.04), { pos: [0, -0.28, 0] })];
  for (const fx of [-0.38, -0.19, 0, 0.19, 0.38]) {
    parts.push(transformMesh(bevelBoxMesh(0.08, 0.62, 0.92, 0.02), { pos: [fx, 0.16, 0] }));
  }
  return unitSpec(parts);
}

function buildElectrolyticCapSpec(): AuraCustomGeometrySpec {
  // Aluminum electrolytic capacitor can with crimp waist groove & embossed K-vent relief cross
  const can = latheMesh(
    [[0, -0.48], [0.45, -0.48], [0.47, -0.32], [0.41, -0.22], [0.47, -0.12], [0.47, 0.42], [0.43, 0.47], [0, 0.46]],
    18,
    false
  );
  return unitSpec([
    can,
    transformMesh(bevelBoxMesh(0.62, 0.05, 0.08, 0.015), { pos: [0, 0.46, 0] }),
    transformMesh(bevelBoxMesh(0.08, 0.05, 0.62, 0.015), { pos: [0, 0.46, 0] })
  ]);
}

function buildNixieFilamentSpec(): AuraCustomGeometrySpec {
  // Helical glowing Nixie cathode filament + top/bottom mica insulator discs
  const helix: V4[] = [];
  const turns = 3.5;
  const pts = 26;
  for (let i = 0; i <= pts; i += 1) {
    const t = i / pts;
    const a = t * turns * Math.PI * 2;
    helix.push([Math.cos(a) * 0.31, -0.4 + t * 0.8, Math.sin(a) * 0.31, 0.065]);
  }
  const disc = latheMesh([[0.12, -0.04], [0.46, -0.04], [0.46, 0.04], [0.12, 0.04]], 12, true);
  return unitSpec([
    tubeSweepMesh(helix, 6, false),
    transformMesh(disc, { pos: [0, -0.42, 0] }),
    transformMesh(disc, { pos: [0, 0.42, 0] })
  ]);
}

function buildHeroVisorSpec(): AuraCustomGeometrySpec {
  // Smoothly faired winged V-star crown crest jewel facing +Z
  const wingL = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0, -0.12, 0.14],
      mid: [-0.24, 0.12, 0.06],
      tip: [-0.47, 0.36, -0.14],
      width: 0.24,
      thickness: 0.18,
      segments: 9,
      radialSegments: 12
    }),
    3
  );
  const wingR = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0, -0.12, 0.14],
      mid: [0.24, 0.12, 0.06],
      tip: [0.47, 0.36, -0.14],
      width: 0.24,
      thickness: 0.18,
      segments: 9,
      radialSegments: 12
    }),
    3
  );
  const centerGem = transformMesh(
    taubinSmoothMesh(
      sculptStreamlinedHullMesh(0.46, 0.26, 0.72, {
        noseSharpness: 0.56,
        tailTaper: 0.52,
        canopyBulge: 0.24,
        stations: 11,
        ringPoints: 14
      }),
      3
    ),
    { pos: [0, 0.04, 0.06] }
  );
  return unitSpec([wingL, wingR, centerGem]);
}

function buildCourierHaloRingSpec(): AuraCustomGeometrySpec {
  // Smooth hover-boot repulsor wake halo ring with 6 streamlined starlight pods
  const parts: RawMesh[] = [taubinSmoothMesh(closedRingTube(0.42, 0.044, 28, 10), 2)];
  const pod = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.16, 0.095, 0.075, {
      noseSharpness: 0.54,
      tailTaper: 0.54,
      canopyBulge: 0.22,
      stations: 9,
      ringPoints: 12
    }),
    3
  );
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      transformMesh(pod, {
        pos: [Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42],
        rot: [0, a + Math.PI * 0.5, 0]
      })
    );
  }
  return unitSpec(parts, [0.992, 0.28, 0.992]);
}

function buildSentryVisorSpec(): AuraCustomGeometrySpec {
  // Expressive multi-part directional ghost eyes & sculpted brows facing +Z:
  // pure-white glossy sclera + directional cobalt-sapphire iris + obsidian pupil + dual white catchlights + arched brows
  const baseSphere = taubinSmoothMesh(icosphereSmoothMesh(1.0, 2, 0, 9), 4);
  const smallSphere = taubinSmoothMesh(icosphereSmoothMesh(1.0, 1, 0, 5), 3);
  const parts: RawMesh[] = [];

  for (const sgn of [-1, 1] as const) {
    const ex = sgn * 0.225;
    const ey = -0.045;
    // Slight inward-forward gaze so the chaser locks onto the courier ahead (+Z)
    const gazeX = ex - sgn * 0.022;

    // 1. Crisp porcelain-white sclera oval
    parts.push(
      paintMeshColors(
        transformMesh(baseSphere, {
          pos: [ex, ey, 0.02],
          rot: [0, sgn * 0.14, sgn * 0.06],
          scale: [0.185, 0.255, 0.135]
        }),
        [1.0, 1.0, 1.0]
      )
    );
    // 2. Vivid directional cobalt-sapphire iris dome
    parts.push(
      paintMeshColors(
        transformMesh(smallSphere, {
          pos: [gazeX, ey + 0.008, 0.132],
          rot: [0, sgn * 0.12, 0],
          scale: [0.108, 0.148, 0.058]
        }),
        [0.04, 0.40, 1.0]
      )
    );
    // 3. Deep obsidian-indigo pupil core
    parts.push(
      paintMeshColors(
        transformMesh(smallSphere, {
          pos: [gazeX - sgn * 0.006, ey + 0.010, 0.168],
          rot: [0, sgn * 0.12, 0],
          scale: [0.064, 0.092, 0.040]
        }),
        [0.015, 0.02, 0.05]
      )
    );
    // 4. Dual pure-white specular catchlights (primary upper-inner + secondary lower-outer)
    parts.push(
      paintMeshColors(
        transformMesh(smallSphere, {
          pos: [gazeX - sgn * 0.036, ey + 0.088, 0.192],
          scale: [0.044, 0.052, 0.032]
        }),
        [1.0, 1.0, 1.0]
      ),
      paintMeshColors(
        transformMesh(smallSphere, {
          pos: [gazeX + sgn * 0.034, ey - 0.062, 0.186],
          scale: [0.025, 0.030, 0.024]
        }),
        [1.0, 1.0, 1.0]
      )
    );
    // 5. Smooth sculpted expressive brow ridge above each eye
    parts.push(
      paintMeshColors(
        taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [sgn * 0.055, 0.175, 0.165],
            mid: [sgn * 0.245, 0.345, 0.115],
            tip: [sgn * 0.445, 0.235, -0.025],
            width: 0.105,
            thickness: 0.082,
            segments: 9,
            radialSegments: 10
          }),
          3
        ),
        [0.06, 0.09, 0.22]
      )
    );
  }

  return unitSpec(parts);
}

function buildSentryScanFanSpec(): AuraCustomGeometrySpec {
  // Tapered holographic radar sweep wedge from emitter (-Z) to curved forward arc (+Z)
  const fan: V2[] = [[-0.08, -0.48], [0.08, -0.48], [0.48, 0.36], [0.24, 0.48], [-0.24, 0.48], [-0.48, 0.36]];
  return unitSpec([transformMesh(extrudePolygonMesh(fan, 0.64, 0.06, false), { rot: [Math.PI * 0.5, 0, 0] })]);
}

function buildNixieEnvelopeSpec(): AuraCustomGeometrySpec {
  // Borosilicate vacuum tube envelope with shoulder taper and top exhaust tip-off pip
  return unitSpec([
    latheMesh(
      [[0, -0.48], [0.46, -0.48], [0.48, -0.4], [0.47, 0.18], [0.42, 0.33], [0.24, 0.41], [0.07, 0.43], [0.04, 0.48], [0, 0.49]],
      20,
      false
    )
  ]);
}

function buildCrownGemSpec(): AuraCustomGeometrySpec {
  // 12-facet royal brilliant diamond cut (pavilion + star girdle + crown facets + table facet)
  return unitSpec([
    latheMesh(
      [[0, -0.48], [0.26, -0.22], [0.46, 0.04], [0.46, 0.14], [0.34, 0.34], [0.2, 0.46], [0, 0.48]],
      12,
      true
    ),
    transformMesh(extrudeStarPolygonMesh(10, 0.49, 0.39, 0.09, 0.018, true), {
      pos: [0, 0.08, 0],
      rot: [-Math.PI * 0.5, 0, 0]
    })
  ]);
}

// ---------------------------------------------------------------------------
// 4 Distinct Ultra-Smooth Domed & Scalloped Ghost / Sentry Chasers (`shC`, `shB`, `shT`, `shY`)
// Local +Z is forward (`yawOf` in `world.ts`: d.z > 0 => yaw = 0).
// Built from a continuous 15-station `sculptDrapedGarmentMesh` + sinusoidal scalloped
// hem deformation + `taubinSmoothMesh` so the domed upper mantle flows seamlessly
// into the pleated scalloped ghost skirt with ZERO horizontal ring seams!
// Painted in neutral luminance [0.76..1.0] + `bakeMeshCavityAO(..., 0.22)` so
// runtime `GHOST_TINT` instance colors stay 100% vivid with silky 3D fold shading.
// ---------------------------------------------------------------------------

function buildSeamlessGhostMantle(opts: {
  readonly lobes: number;
  readonly hemR: number;
  readonly waistR: number;
  readonly domeR: number;
  readonly domeBaseY: number;
  readonly topY: number;
  readonly scallopAmp: number;
  readonly trailSweep: number;
  readonly browTilt: number;
}): RawMesh {
  const ringPoints = Math.max(36, opts.lobes * 6);
  const stations: {
    y: number;
    rx: number;
    rz: number;
    z: number;
    folds: number;
    foldAmp: number;
    superellipseN: number;
  }[] = [];

  // Lower & mid flowing ghost skirt (`y = -0.42 .. domeBaseY`) smoothly transitioning folds -> 0
  const skirtSteps = 8;
  for (let s = 0; s <= skirtSteps; s += 1) {
    const u = s / skirtSteps; // 0 = hem (-0.42), 1 = dome equator (domeBaseY)
    const y = -0.42 + u * (opts.domeBaseY + 0.42);
    const bell = Math.pow(1 - u, 1.35);
    const r = opts.domeR + (opts.hemR - opts.domeR) * bell + (opts.waistR - opts.domeR) * Math.sin(u * Math.PI) * 0.35;
    const foldEnv = Math.pow(Math.max(0, 1 - u * 0.96), 1.55);
    const zDrift = -opts.trailSweep * Math.pow(1 - u, 1.7) * 0.055 + 0.018 * Math.sin(u * Math.PI);
    stations.push({
      y,
      rx: r,
      rz: r * 1.02,
      z: zDrift,
      folds: foldEnv > 0.008 ? opts.lobes : 0,
      foldAmp: 0.135 * foldEnv,
      superellipseN: 2.0
    });
  }

  // True smooth hemispherical upper mantle dome (`domeBaseY .. topY`) with zero folds or creases
  const domeSteps = 6;
  const domeH = Math.max(0.14, opts.topY - opts.domeBaseY);
  for (let d = 1; d <= domeSteps; d += 1) {
    const v = d / domeSteps;
    const theta = v * Math.PI * 0.485;
    const r = Math.max(0.028, opts.domeR * Math.cos(theta));
    const y = opts.domeBaseY + domeH * Math.sin(theta);
    stations.push({
      y,
      rx: r,
      rz: r * 1.01,
      z: 0.016 * Math.cos(theta),
      folds: 0,
      foldAmp: 0,
      superellipseN: 2.0
    });
  }

  const draped = sculptDrapedGarmentMesh(stations, {
    ringPoints,
    capEnds: true,
    smoothPasses: 5
  });

  // Smoothly scallop the lower skirt hem, flare trailing pleats, and contour forward cheek/brow relief (+Z)
  const sculpted = taubinSmoothMesh(
    deformMesh(draped, ([x, y, z]) => {
      const a = Math.atan2(x, z);
      const hemWeight = Math.max(0, Math.min(1, (-0.12 - y) / 0.30));
      const scallopWave = Math.cos(a * opts.lobes);
      const yScallop = y + scallopWave * opts.scallopAmp * hemWeight * hemWeight;
      const radialFlare = 1 + 0.055 * scallopWave * hemWeight;
      const aftDrag = z < 0 ? -opts.trailSweep * 0.038 * hemWeight * (-z / Math.max(0.12, opts.hemR)) : 0;

      // Subtle sculpted eye-bay hollow & plump ghost cheeks on +Z (`y ≈ 0.04..0.24`)
      let zFace = z * radialFlare + aftDrag;
      let xFace = x * radialFlare;
      if (z > 0.05) {
        const cheek =
          0.020 *
          Math.exp(-(((y - 0.03) / 0.09) ** 2)) *
          Math.exp(-(((Math.abs(x) - 0.16) / 0.09) ** 2));
        const eyeBay =
          -0.016 *
          Math.exp(-(((y - 0.135) / 0.075) ** 2)) *
          Math.exp(-(((Math.abs(x) - 0.115) / 0.075) ** 2));
        const browShelf =
          0.022 *
          Math.exp(-(((y - (0.225 + opts.browTilt * (Math.abs(x) - 0.11) * 0.18)) / 0.045) ** 2)) *
          Math.exp(-((x / 0.22) ** 2));
        zFace += cheek + eyeBay + browShelf;
        xFace += Math.sign(x) * cheek * 0.45;
      }
      return [xFace, yScallop, zFace];
    }),
    6
  );

  return paintMeshColors(sculpted, (pos, norm): V3 => {
    const v = Math.max(0, Math.min(1, (pos[1] + 0.46) / 0.92));
    const crestLift = Math.max(0, norm[1] * 0.13 + norm[2] * 0.09);
    const foldLight = pos[1] < -0.10 ? Math.max(-0.08, Math.min(0.06, norm[2] * 0.04 + norm[1] * 0.05)) : 0;
    const lum = Math.max(0.76, Math.min(1.0, 0.82 + v * 0.14 + crestLift + foldLight));
    return [lum, lum, Math.min(1.0, lum + (1 - v) * 0.025)];
  });
}

function addSculptedGhostArmsAndSmile(
  parts: RawMesh[],
  opts: {
    readonly eyeY: number;
    readonly eyeZ: number;
    readonly handReachZ: number;
    readonly armLiftY: number;
  }
): void {
  // Seamless SDF ghostly reaching sleeves/mittens (`sculptOrganicSdfMesh`, zero sphere/cylinder seams!)
  const ghostArmsSdf = sculptOrganicSdfMesh({
    boundsMin: [-0.47, -0.18, -0.08],
    boundsMax: [0.47, 0.18, 0.38],
    resolution: 22,
    taubinIterations: 5,
    evaluate: (x, y, z) => {
      const pSym: V3 = [Math.abs(x), y, z];
      const upper = sdfTaperedCapsule(pSym, [0.24, 0.02, 0.01], [0.365, -0.025 + opts.armLiftY, 0.13], 0.084, 0.072);
      const fore = sdfTaperedCapsule(
        pSym,
        [0.365, -0.025 + opts.armLiftY, 0.13],
        [0.345, 0.005 + opts.armLiftY, opts.handReachZ],
        0.072,
        0.082
      );
      const thumb = sdfEllipsoid(
        pSym,
        [0.305, 0.052 + opts.armLiftY, opts.handReachZ - 0.018],
        [0.032, 0.040, 0.034]
      );
      return sminPoly(sminPoly(upper, fore, 0.028), thumb, 0.022);
    }
  });
  parts.push(paintMeshColors(ghostArmsSdf, [0.97, 0.98, 1.0]));

  // Smooth sculpted cheeky ghost smile curve on +Z (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
  const smileArc = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [-0.115, opts.eyeY - 0.125, opts.eyeZ + 0.008],
      mid: [0, opts.eyeY - 0.158, opts.eyeZ + 0.036],
      tip: [0.115, opts.eyeY - 0.125, opts.eyeZ + 0.008],
      width: 0.032,
      thickness: 0.026,
      segments: 8,
      radialSegments: 10
    }),
    3
  );
  parts.push(paintMeshColors(smileArc, [0.76, 0.77, 0.83]));
}

function finalizePhantomSpec(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  const baked = bakeMeshCavityAO(mergeRawParts(parts), 0.22);
  return mergeRawMeshes([normalizeUnitCubeMesh(baked)]);
}

function buildSentryHunterSpec(): AuraCustomGeometrySpec {
  // "blitz" (Red Chaser) — Fierce Oni Phantom: ultra-smooth domed upper mantle flowing into 7-scallop skirt + curved Oni horns!
  const parts: RawMesh[] = [
    buildSeamlessGhostMantle({
      lobes: 7,
      hemR: 0.395,
      waistR: 0.345,
      domeR: 0.312,
      domeBaseY: 0.11,
      topY: 0.38,
      scallopAmp: 0.058,
      trailSweep: 1.15,
      browTilt: 0.75
    }),
    // Smooth streamlined forehead war-crest jewel
    paintMeshColors(
      transformMesh(
        taubinSmoothMesh(
          sculptStreamlinedHullMesh(0.085, 0.072, 0.12, {
            noseSharpness: 0.55,
            tailTaper: 0.50,
            canopyBulge: 0.25,
            stations: 9,
            ringPoints: 12
          }),
          3
        ),
        { pos: [0, 0.29, 0.255], rot: [-0.28, 0, 0] }
      ),
      [1.0, 0.99, 0.96]
    )
  ];
  for (const sgn of [-1, 1] as const) {
    const horn = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [sgn * 0.135, 0.285, 0.055],
        mid: [sgn * 0.295, 0.405, 0.065],
        tip: [sgn * 0.225, 0.545, -0.035],
        width: 0.128,
        thickness: 0.118,
        segments: 10,
        radialSegments: 12
      }),
      4
    );
    parts.push(paintMeshColors(horn, [1.0, 0.99, 0.96]));
  }
  addSculptedGhostArmsAndSmile(parts, { eyeY: 0.14, eyeZ: 0.29, handReachZ: 0.265, armLiftY: 0.01 });
  return finalizePhantomSpec(parts);
}

function buildSentryAmbusherSpec(): AuraCustomGeometrySpec {
  // "sly" (Pink Ambusher) — Trickster Phantom: ultra-smooth domed upper mantle flowing into 6-scallop flared skirt + 3 swept curled plumes!
  const parts: RawMesh[] = [
    buildSeamlessGhostMantle({
      lobes: 6,
      hemR: 0.405,
      waistR: 0.34,
      domeR: 0.304,
      domeBaseY: 0.10,
      topY: 0.365,
      scallopAmp: 0.062,
      trailSweep: 0.95,
      browTilt: -0.35
    })
  ];
  // 3 smooth curled crest plumes (left, center-tall, right) with Taubin-smoothed pearl tips
  for (const [reachX, topH, tipZ, rTip] of [
    [-0.285, 0.485, -0.055, 0.050],
    [0, 0.525, -0.115, 0.058],
    [0.285, 0.485, -0.055, 0.050]
  ] as const) {
    const plume = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [reachX * 0.32, 0.295, 0.035],
        mid: [reachX * 0.76, topH, 0.012],
        tip: [reachX, topH - 0.048, tipZ],
        width: 0.125,
        thickness: 0.112,
        segments: 10,
        radialSegments: 12
      }),
      4
    );
    const pearl = transformMesh(taubinSmoothMesh(icosphereSmoothMesh(rTip, 1, 0, 11), 4), {
      pos: [reachX, topH - 0.052, tipZ]
    });
    parts.push(paintMeshColors(plume, [0.99, 0.99, 1.0]), paintMeshColors(pearl, [1.0, 1.0, 1.0]));
  }
  addSculptedGhostArmsAndSmile(parts, { eyeY: 0.13, eyeZ: 0.285, handReachZ: 0.25, armLiftY: 0.025 });
  return finalizePhantomSpec(parts);
}

function buildSentryDrifterSpec(): AuraCustomGeometrySpec {
  // "flick" (Cyan Technomancer) — Arcane Wave Phantom: ultra-smooth domed upper mantle flowing into 8-scallop skirt + swept wave-antennae & halo ring!
  const parts: RawMesh[] = [
    buildSeamlessGhostMantle({
      lobes: 8,
      hemR: 0.382,
      waistR: 0.334,
      domeR: 0.304,
      domeBaseY: 0.105,
      topY: 0.372,
      scallopAmp: 0.054,
      trailSweep: 1.05,
      browTilt: 0.22
    }),
    // Smooth floating orbital glyph ring
    paintMeshColors(
      transformMesh(taubinSmoothMesh(closedRingTube(0.365, 0.028, 24, 9), 3), {
        pos: [0, 0.055, 0.01],
        rot: [0.15, 0, -0.09]
      }),
      [0.98, 0.99, 1.0]
    )
  ];
  for (const sgn of [-1, 1] as const) {
    const waveFin = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [sgn * 0.105, 0.30, 0.02],
        mid: [sgn * 0.225, 0.425, -0.015],
        tip: [sgn * 0.245, 0.535, 0.015],
        width: 0.092,
        thickness: 0.078,
        segments: 10,
        radialSegments: 10
      }),
      4
    );
    const orb = transformMesh(taubinSmoothMesh(icosphereSmoothMesh(0.058, 1, 0, 17), 4), {
      pos: [sgn * 0.245, 0.54, 0.015]
    });
    parts.push(paintMeshColors(waveFin, [0.97, 0.99, 1.0]), paintMeshColors(orb, [1.0, 1.0, 1.0]));
  }
  addSculptedGhostArmsAndSmile(parts, { eyeY: 0.13, eyeZ: 0.285, handReachZ: 0.258, armLiftY: 0.0 });
  return finalizePhantomSpec(parts);
}

function buildSentrySkittishSpec(): AuraCustomGeometrySpec {
  // "dim" (Amber Monarch) — Regal Phantom: ultra-smooth domed upper mantle flowing into 9-scallop royal skirt + smooth 5-point Monarch Crown!
  const parts: RawMesh[] = [
    buildSeamlessGhostMantle({
      lobes: 9,
      hemR: 0.412,
      waistR: 0.362,
      domeR: 0.318,
      domeBaseY: 0.11,
      topY: 0.375,
      scallopAmp: 0.052,
      trailSweep: 0.88,
      browTilt: 0.10
    }),
    // Smoothly draped plush royal shoulder capelet (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
    paintMeshColors(
      taubinSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.015, rx: 0.395, rz: 0.385, z: -0.01, folds: 9, foldAmp: 0.035, superellipseN: 2.0 },
            { y: 0.075, rx: 0.382, rz: 0.372, z: -0.005, folds: 9, foldAmp: 0.022, superellipseN: 2.0 },
            { y: 0.135, rx: 0.325, rz: 0.318, z: 0.005, folds: 0, foldAmp: 0, superellipseN: 2.0 }
          ],
          { ringPoints: 36, capEnds: true, smoothPasses: 4 }
        ),
        4
      ),
      [0.98, 0.98, 1.0]
    )
  ];
  // Unified smooth SDF 5-spire Monarch Crown (`sculptOrganicSdfMesh`, zero cone-tack seams!)
  const royalCrownSdf = sculptOrganicSdfMesh({
    boundsMin: [-0.30, 0.25, -0.30],
    boundsMax: [0.30, 0.57, 0.30],
    resolution: 24,
    taubinIterations: 5,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const cushion = sdfEllipsoid(p, [0, 0.37, 0.008], [0.215, 0.095, 0.215]);
      const bandOuter = sdfTaperedCapsule(p, [0, 0.295, 0.008], [0, 0.395, 0.008], 0.235, 0.248);
      let d = sminPoly(cushion, bandOuter, 0.022);
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2;
        const sx = Math.sin(a);
        const cz = Math.cos(a);
        const spire = sdfTaperedCapsule(
          p,
          [sx * 0.215, 0.365, cz * 0.215 + 0.008],
          [sx * 0.252, 0.515, cz * 0.252 + 0.008],
          0.048,
          0.018
        );
        const tipPearl = sdfEllipsoid(p, [sx * 0.255, 0.532, cz * 0.255 + 0.008], [0.028, 0.028, 0.028]);
        d = sminPoly(d, sminPoly(spire, tipPearl, 0.014), 0.020);
      }
      return d;
    }
  });
  parts.push(paintMeshColors(royalCrownSdf, [1.0, 0.99, 0.96]));
  addSculptedGhostArmsAndSmile(parts, { eyeY: 0.13, eyeZ: 0.3, handReachZ: 0.26, armLiftY: -0.01 });
  return finalizePhantomSpec(parts);
}

export const POOL_GEOMETRIES: Readonly<Record<PoolKey, AuraCustomGeometrySpec>> = {
  wall: buildWallModuleSpec(),
  wallTrim: buildWallTrimBezelSpec(),
  rail: buildGullWingPinSpec(),
  trace: buildCopperTraceSpec(),
  traceLit: buildLitTraceSpec(),
  dot: buildEnergyPelletSpec(),
  orb: buildPowerCollarSpec(),
  prism: buildGyroPrismShellSpec(),
  vent: buildPlasmaStarCoreSpec(),
  marker: buildReticleMarkerSpec(),
  eyes: buildSpecterEyePodSpec(),
  dress: buildFinnedHeatsinkSpec(),
  cap: buildElectrolyticCapSpec(),
  glow: buildNixieFilamentSpec(),
  hero: buildHeroVisorSpec(),
  halo: buildCourierHaloRingSpec(),
  shC: buildSentryHunterSpec(),
  shB: buildSentryAmbusherSpec(),
  shT: buildSentryDrifterSpec(),
  shY: buildSentrySkittishSpec(),
  visor: buildSentryVisorSpec(),
  scan: buildSentryScanFanSpec(),
  trophy: buildNixieEnvelopeSpec(),
  gem: buildCrownGemSpec()
};

export function buildInstancedPoolNodes(
  pad: (count: number) => AuraTransformSpec[]
): AuraNodeBuilder<AuraPrimitiveNode>[] {
  const pool = (
    key: PoolKey,
    name: string,
    mat: AuraMaterialSpec,
    opts: {
      readonly castShadow?: boolean;
      readonly receiveShadow?: boolean;
      readonly instanceColorTarget?: "base" | "emissive" | "both";
    } = {}
  ): AuraNodeBuilder<AuraPrimitiveNode> =>
    instances
      .custom(POOL_GEOMETRIES[key], {
        name,
        material: mat,
        transforms: pad(POOL_CAPS[key]),
        castShadow: opts.castShadow ?? false,
        receiveShadow: opts.receiveShadow ?? false,
        ...(opts.instanceColorTarget ? { instanceColorTarget: opts.instanceColorTarget } : {})
      })
      .runtime(game.runtimeNode(`pool-${key}`));

  return [
    pool("wall", "walls", DD_MATERIALS.poolWall, { castShadow: true, receiveShadow: true }),
    pool("wallTrim", "wall-trim", DD_MATERIALS.poolWallTrim, { instanceColorTarget: "both" }),
    pool("rail", "pins", DD_MATERIALS.poolRail),
    pool("trace", "traces", DD_MATERIALS.poolTrace, { receiveShadow: true }),
    pool("traceLit", "traces lit", DD_MATERIALS.poolTraceLit, { instanceColorTarget: "emissive" }),
    pool("dot", "shards", DD_MATERIALS.poolDot, { instanceColorTarget: "both" }),
    pool("orb", "cells", DD_MATERIALS.poolOrb, { castShadow: true }),
    pool("prism", "prisms", DD_MATERIALS.poolPrism, { castShadow: false }),
    pool("vent", "cell vents", DD_MATERIALS.poolVent, { instanceColorTarget: "both" }),
    pool("marker", "markers", DD_MATERIALS.poolMarker),
    pool("eyes", "eyes", DD_MATERIALS.poolEyes, { instanceColorTarget: "both" }),
    pool("dress", "dress", DD_MATERIALS.poolDress, { castShadow: true }),
    pool("cap", "capacitors", DD_MATERIALS.poolCap, { castShadow: true }),
    pool("glow", "glow", DD_MATERIALS.poolGlow, { instanceColorTarget: "both" }),
    pool("hero", "courier-visor", DD_MATERIALS.poolHeroVisor, { instanceColorTarget: "both" }),
    pool("halo", "courier-halo", DD_MATERIALS.poolHalo),
    pool("shC", "sentry-hunter", DD_MATERIALS.poolSentryArmor, { castShadow: true }),
    pool("shB", "sentry-ambusher", DD_MATERIALS.poolSentryArmor, { castShadow: true }),
    pool("shT", "sentry-drifter", DD_MATERIALS.poolSentryArmor, { castShadow: true }),
    pool("shY", "sentry-skittish", DD_MATERIALS.poolSentryArmor, { castShadow: true }),
    pool("visor", "sentry-visors", DD_MATERIALS.poolSentryVisor, { instanceColorTarget: "both" }),
    pool("scan", "sentry-scans", DD_MATERIALS.poolSentryScan, { instanceColorTarget: "both" }),
    pool("trophy", "nixie-tubes", DD_MATERIALS.poolTrophyGlass, { castShadow: false }),
    pool("gem", "cache-gem", DD_MATERIALS.poolGem, { instanceColorTarget: "both", castShadow: true })
  ];
}

// ---------------------------------------------------------------------------
// Hero Glint Courier Hover-Sphere / Bot & Warp-Tunnel Archway Assemblies
// ---------------------------------------------------------------------------

export function buildCourierCoreNode(
  id: string,
  position: V3
): AuraNodeBuilder<AuraPrimitiveNode> {
  // Smooth Taubin-faired pulsing Star-Core heart nestled inside the Glint Courier mascot's torso (`coreHeight: 0.43`)
  const coreSpec = memoizeGeometry("dd-courier-core-v4", () =>
    mergeRawMeshes([
      taubinSmoothMesh(icosphereSmoothMesh(0.11, 2, 0.01, 7, 0.15), 4),
      transformMesh(
        taubinSmoothMesh(
          sculptStreamlinedHullMesh(0.22, 0.22, 0.075, {
            noseSharpness: 0.48,
            tailTaper: 0.48,
            canopyBulge: 0.25,
            stations: 9,
            ringPoints: 14
          }),
          3
        ),
        { rot: [Math.PI * 0.5, 0, 0] }
      ),
      transformMesh(taubinSmoothMesh(closedRingTube(0.145, 0.016, 20, 8), 2), { rot: [0.34, 0, -0.24] })
    ])
  );
  return geometry
    .custom(coreSpec, {
      name: id,
      material: DD_MATERIALS.cyanThrusterPlasma,
      position,
      castShadow: false,
      receiveShadow: false
    })
    .runtime(game.runtimeNode(id));
}

export function buildCourierHoverPodNode(
  id: string,
  position: V3
): GroupBuilder {
  // Ultra-Smooth 3D Chomper-Courier Arcade Mascot ("Glint Courier"), hovering dynamically forward (+Z):
  // Seamless `sculptOrganicSdfMesh` + `taubinSmoothMesh` golden Chomper-Courier head & body with organically filleted
  // smiling chomper mouth & plump cheeks, sculpted brow ridges, glossy multi-part sclera/iris/pupil/catchlight eyes,
  // smooth SDF sculpted gloves, sleek rounded dash boots, and flowing draped starlight capelet!
  const catchlightWhiteMat = material.emissive({
    name: "courier eye catchlight gleam",
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 2.8,
    practical: true
  });
  const capeStarlightMat = material.fabric({
    name: "courier fluttering energy capelet",
    color: "#ffffff",
    emissive: "#14b8ff",
    emissiveIntensity: 0.42,
    roughness: 0.34,
    sheen: 0.94,
    sheenRoughness: 0.26,
    sheenColor: "#9cfaff",
    practical: true
  });
  const scleraGlossMat = material.clearcoatPaint({
    name: "courier glossy porcelain eye sclera",
    color: "#f8fcff",
    emissive: "#d8f2ff",
    emissiveIntensity: 0.24,
    roughness: 0.06,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    practical: true
  });
  const irisGlossMat = material.clearcoatPaint({
    name: "courier glossy sapphire cyan iris",
    color: "#0b88ff",
    emissive: "#18f0ff",
    emissiveIntensity: 0.65,
    roughness: 0.05,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    practical: true
  });
  const mats: readonly AuraMaterialSpec[] = [
    DD_MATERIALS.courierClearcoatShell, // 0: Electric Gold seamless Chomper-Courier head/body, filleted ears, gloves & dash boots
    DD_MATERIALS.courierBurnishedGold,  // 1: Burnished Gold ear-pods, dorsal aero-crest, belt, star bezel & boot cuffs
    DD_MATERIALS.anisotropicTitanium,   // 2: Brushed gold-bronze thruster bells
    DD_MATERIALS.courierPorcelainTrim,  // 3: Glossy deep-obsidian eye bay, chomper oral cavity, eye pupils & boot soles
    DD_MATERIALS.statorBraidedGasket,   // 4: Woven midnight-teal star-runner undersuit arms & legs
    DD_MATERIALS.cyanThrusterPlasma,    // 5: Glowing Electric Cyan brows, crest/ear trim, chest heart, cape ribbon & jet plumes
    catchlightWhiteMat,                 // 6: Crisp pure-white dual eye catchlights
    capeStarlightMat,                   // 7: Smoothly draped billowing scalloped starlight capelet
    scleraGlossMat,                     // 8: Glossy porcelain-white eye sclera
    irisGlossMat,                       // 9: Glossy electric sapphire-cyan eye iris
    DD_MATERIALS.roseBerryGlaze         // 10: Glossy coral-rose chomper tongue
  ];

  const cached = memoizeGeometry("dd-courier-hover-pod-v4", () => {
    const slots: MultiMatSlot[] = [];
    const smoothSphereHi = taubinSmoothMesh(icosphereSmoothMesh(1.0, 2, 0, 11), 4);
    const smoothSphereMid = taubinSmoothMesh(icosphereSmoothMesh(1.0, 1, 0, 7), 3);

    // 1. Unified Seamless Golden Chomper-Courier Head, Filleted Cheeks/Mouth, Brow Ridges, Swept Wing-Ears & Torso
    //    (`sculptOrganicSdfMesh` + `taubinSmoothMesh`, zero primitive sphere/cone/loft seams!)
    const chomperBodySdf = sculptOrganicSdfMesh({
      boundsMin: [-0.50, 0.24, -0.34],
      boundsMax: [0.50, 1.09, 0.34],
      resolution: 36,
      taubinIterations: 5,
      evaluate: (x, y, z) => {
        const ax = Math.abs(x);
        const p: V3 = [x, y, z];
        const pSym: V3 = [ax, y, z];

        // Plump golden Chomper cranium + smiling cheek puffs + rounded lower jaw lip
        const cranium = sdfEllipsoid(p, [0, 0.805, 0.015], [0.278, 0.258, 0.268]);
        const cheekPuff = sdfEllipsoid(pSym, [0.168, 0.722, 0.148], [0.105, 0.088, 0.102]);
        const lowerChin = sdfTaperedCapsule(p, [-0.075, 0.618, 0.162], [0.075, 0.618, 0.162], 0.056, 0.056);

        // Sculpted expressive arched brow ridges framing the upper eyes
        const browArch = sdfTaperedCapsule(pSym, [0.032, 0.878, 0.232], [0.168, 0.862, 0.188], 0.034, 0.028);

        // Seamlessly filleted swept star-wing aero ears (`±X`, sweeping up and back)
        const earRoot = sdfEllipsoid(pSym, [0.272, 0.795, 0.008], [0.055, 0.078, 0.078]);
        const earWingLow = sdfTaperedCapsule(pSym, [0.275, 0.80, 0.005], [0.395, 0.905, -0.085], 0.044, 0.028);
        const earWingTip = sdfTaperedCapsule(pSym, [0.395, 0.905, -0.085], [0.455, 0.995, -0.185], 0.028, 0.014);

        // Seamless neck collar flowing into compact athletic golden courier torso
        const neck = sdfTaperedCapsule(p, [0, 0.545, 0.012], [0, 0.645, 0.015], 0.128, 0.142);
        const chest = sdfEllipsoid(p, [0, 0.455, 0.018], [0.188, 0.148, 0.156]);
        const waist = sdfTaperedCapsule(p, [0, 0.295, 0.006], [0, 0.405, 0.014], 0.136, 0.164);

        let d = sminPoly(cranium, cheekPuff, 0.038);
        d = sminPoly(d, lowerChin, 0.032);
        d = sminPoly(d, browArch, 0.024);
        d = sminPoly(d, earRoot, 0.026);
        d = sminPoly(d, sminPoly(earWingLow, earWingTip, 0.018), 0.024);
        d = sminPoly(d, neck, 0.036);
        d = sminPoly(d, sminPoly(chest, waist, 0.038), 0.034);

        // Organically filleted joyful open Chomper smile recess on lower-front face (`+Z`)
        const mouthCavity = sdfEllipsoid(p, [0, 0.668, 0.268], [0.124, 0.054, 0.088]);
        d = smaxPoly(d, -mouthCavity, 0.026);

        // Subtle recessed upper visor-eye bay so glossy sclera/iris eyes nestle cleanly under the brow ridge
        const eyeBayRecess = sdfEllipsoid(p, [0, 0.795, 0.292], [0.178, 0.082, 0.056]);
        d = smaxPoly(d, -eyeBayRecess, 0.020);
        return d;
      }
    });

    const paintedChomperBody = bakeMeshCavityAO(
      paintMeshColors(chomperBodySdf, (pos, norm): V3 => {
        const t = Math.max(0, Math.min(1, (pos[1] - 0.28) / 0.76));
        const sun = Math.max(0, norm[1] * 0.14 + norm[2] * 0.09);
        return [
          Math.min(1, 0.92 + t * 0.08 + sun),
          Math.min(1, 0.84 + t * 0.14 + sun),
          Math.min(1, 0.72 + t * 0.22 + sun)
        ];
      }),
      0.22
    );
    slots.push({ mesh: paintedChomperBody, materialIndex: 0 });

    // Dorsal streamlined aero-crest + glowing cyan crest spine + headphone trim pods & wing-ear leading glow
    const aeroCrest = transformMesh(
      taubinSmoothMesh(
        sculptStreamlinedHullMesh(0.46, 0.086, 0.115, {
          noseSharpness: 0.54,
          tailTaper: 0.48,
          canopyBulge: 0.28,
          undersideFlat: 0.45,
          stations: 11,
          ringPoints: 14
        }),
        4
      ),
      { pos: [0, 1.035, -0.04], rot: [0.08, 0, 0] }
    );
    slots.push({ mesh: bakeMeshCavityAO(aeroCrest, 0.20), materialIndex: 1 });
    slots.push({
      mesh: taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [0, 0.995, 0.185],
          mid: [0, 1.095, -0.015],
          tip: [0, 1.035, -0.235],
          width: 0.042,
          thickness: 0.034,
          segments: 10,
          radialSegments: 10
        }),
        3
      ),
      materialIndex: 5
    });

    for (const sgn of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(
          taubinSmoothMesh(
            latheMesh([[0, -0.025], [0.088, -0.02], [0.096, 0.014], [0.064, 0.038], [0, 0.042]], 18, false),
            3
          ),
          {
            pos: [sgn * 0.268, 0.795, 0.008],
            rot: [0, 0, sgn * -Math.PI * 0.5]
          }
        ),
        materialIndex: 1
      });
      slots.push({
        mesh: taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [sgn * 0.315, 0.835, 0.022],
            mid: [sgn * 0.405, 0.925, -0.075],
            tip: [sgn * 0.462, 1.002, -0.192],
            width: 0.036,
            thickness: 0.028,
            segments: 9,
            radialSegments: 10
          }),
          3
        ),
        materialIndex: 5
      });
    }

    // 2. Recessed Obsidian Visor Screen + Chomper Oral Bay & Glossy Coral Tongue +
    //    Multi-Part Glossy Sclera / Sapphire-Cyan Iris / Pupil / Dual Catchlight Eyes!
    slots.push({
      mesh: bakeMeshCavityAO(
        transformMesh(smoothSphereHi, {
          pos: [0, 0.795, 0.218],
          scale: [0.188, 0.092, 0.052]
        }),
        0.22
      ),
      materialIndex: 3
    });
    // Smooth dark oral interior + plump glossy rose-coral chomper tongue inside the filleted smile cavity
    slots.push({
      mesh: transformMesh(smoothSphereMid, {
        pos: [0, 0.668, 0.212],
        rot: [0.16, 0, 0],
        scale: [0.106, 0.042, 0.046]
      }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(smoothSphereMid, {
        pos: [0, 0.646, 0.226],
        rot: [0.22, 0, 0],
        scale: [0.074, 0.026, 0.048]
      }),
      materialIndex: 10
    });

    for (const sgn of [-1, 1] as const) {
      const ex = sgn * 0.092;
      const ey = 0.796;
      const ez = 0.248;
      const gazeX = ex - sgn * 0.008;

      // Glossy porcelain-white sclera oval
      slots.push({
        mesh: transformMesh(smoothSphereHi, {
          pos: [ex, ey, ez],
          rot: [0, sgn * 0.16, sgn * -0.06],
          scale: [0.060, 0.076, 0.032]
        }),
        materialIndex: 8
      });
      // Glossy electric sapphire-cyan iris dome
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [gazeX, ey - 0.002, ez + 0.019],
          rot: [0, sgn * 0.15, 0],
          scale: [0.040, 0.052, 0.020]
        }),
        materialIndex: 9
      });
      // Deep obsidian pupil core
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [gazeX - sgn * 0.002, ey - 0.002, ez + 0.029],
          rot: [0, sgn * 0.15, 0],
          scale: [0.023, 0.032, 0.014]
        }),
        materialIndex: 3
      });
      // Dual pure-white catchlight gleams
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [gazeX - sgn * 0.014, ey + 0.026, ez + 0.036],
          scale: [0.016, 0.018, 0.010]
        }),
        materialIndex: 6
      });
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [gazeX + sgn * 0.015, ey - 0.022, ez + 0.034],
          scale: [0.009, 0.010, 0.008]
        }),
        materialIndex: 6
      });
      // Glowing cyan brow accent crowning the sculpted golden brow ridge
      slots.push({
        mesh: taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [sgn * 0.036, ey + 0.076, ez + 0.010],
            mid: [ex, ey + 0.094, ez + 0.004],
            tip: [sgn * 0.152, ey + 0.076, ez - 0.022],
            width: 0.026,
            thickness: 0.022,
            segments: 8,
            radialSegments: 10
          }),
          3
        ),
        materialIndex: 5
      });
    }

    // 3. Contoured Utility Belt & Smooth Star-Core Chest Bezel (`y = 0.31 .. 0.50`)
    slots.push({
      mesh: transformMesh(
        taubinSmoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.312, rx: 0.156, rz: 0.132, z: 0.01, superellipseN: 2.05 },
              { y: 0.345, rx: 0.184, rz: 0.154, z: 0.012, superellipseN: 2.05 },
              { y: 0.378, rx: 0.162, rz: 0.138, z: 0.012, superellipseN: 2.05 }
            ],
            { ringPoints: 24, capEnds: true, smoothPasses: 4 }
          ),
          3
        ),
        { pos: [0, 0, 0] }
      ),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(
        taubinSmoothMesh(extrudeStarPolygonMesh(5, 0.088, 0.048, 0.034, 0.009, false), 3),
        {
          pos: [0, 0.468, 0.172],
          rot: [Math.PI * 0.5 - 0.08, 0, 0]
        }
      ),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(smoothSphereMid, {
        pos: [0, 0.468, 0.190],
        scale: [0.040, 0.040, 0.024]
      }),
      materialIndex: 5
    });

    // 4. Smoothly Draped Scalloped Starlight Capelet (`loftSectionsMesh` + `taubinSmoothMesh`)
    const capeCols = 13;
    const capeStations: V3[][] = [];
    for (let s = 0; s < 7; s += 1) {
      const u = s / 6;
      const width = 0.175 + u * 0.245;
      const yBase = 0.565 - u * 0.215 + Math.sin(u * Math.PI) * 0.028;
      const zBase = -0.055 - u * 0.455;
      const thick = 0.020 * (1 - u * 0.35);
      const topRow: V3[] = [];
      const botRow: V3[] = [];
      for (let c = 0; c < capeCols; c += 1) {
        const w = (c / (capeCols - 1)) * 2 - 1;
        const pleat = Math.cos(w * Math.PI * 2.5) * 0.026 * u;
        const scallopY = Math.cos(w * Math.PI * 3.0) * 0.016 * u * u;
        const archY = (1 - w * w * 0.42) * 0.024 + pleat + scallopY;
        const x = w * width;
        const z = zBase - (1 - w * w) * 0.046 * u;
        topRow.push([x, yBase + archY + thick, z]);
        botRow.unshift([x, yBase + archY - thick, z]);
      }
      capeStations.push([...topRow, ...botRow]);
    }
    const capeMesh = bakeMeshCavityAO(
      paintMeshColors(taubinSmoothMesh(loftSectionsMesh(capeStations, true, false), 5), (pos): V3 => {
        const trail = Math.max(0, Math.min(1, (-pos[2] - 0.05) / 0.46));
        return [
          0.18 + trail * 0.56,
          0.42 + trail * 0.54,
          0.88 + trail * 0.12
        ];
      }),
      0.22
    );
    slots.push({ mesh: capeMesh, materialIndex: 7 });

    const capeHemRibbon = catmullRomSpline3(
      [
        [-0.41, 0.345, -0.485],
        [-0.205, 0.382, -0.525],
        [0, 0.342, -0.555],
        [0.205, 0.382, -0.525],
        [0.41, 0.345, -0.485]
      ],
      4
    );
    slots.push({
      mesh: taubinSmoothMesh(
        tubeSweepMesh(capeHemRibbon.map(([x, y, z]) => [x, y, z, 0.017] as V4), 8, true),
        3
      ),
      materialIndex: 5
    });
    slots.push({
      mesh: bakeMeshCavityAO(
        taubinSmoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.535, rx: 0.215, rz: 0.185, z: 0.01, superellipseN: 2.0 },
              { y: 0.575, rx: 0.205, rz: 0.175, z: 0.01, superellipseN: 2.0 },
              { y: 0.605, rx: 0.142, rz: 0.132, z: 0.012, superellipseN: 2.0 }
            ],
            { ringPoints: 24, capEnds: true, smoothPasses: 4 }
          ),
          3
        ),
        0.20
      ),
      materialIndex: 1
    });
    for (const sgn of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [sgn * 0.148, 0.558, 0.118],
          rot: [0.35, sgn * 0.25, 0],
          scale: [0.036, 0.036, 0.020]
        }),
        materialIndex: 1
      });
    }

    // 5. Smooth Anatomical Arms + Seamless SDF Sculpted Gloves + Sleek Rounded Dash Boots (`taubinSmoothMesh`)
    //    Precompute symmetric canonical left/right SDF glove & dash boot with zero primitive sphere/cone seams!
    const buildSmoothCourierGlove = (sgn: -1 | 1, armFwd: number): RawMesh =>
      sculptOrganicSdfMesh({
        boundsMin: [sgn > 0 ? 0.16 : -0.40, 0.28, armFwd - 0.14],
        boundsMax: [sgn > 0 ? 0.40 : -0.16, 0.50, armFwd + 0.16],
        resolution: 24,
        taubinIterations: 5,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const cuffZ = armFwd - (sgn > 0 ? 0.028 : -0.018);
          const palmZ = armFwd + (sgn > 0 ? 0.038 : -0.016);
          const cuff = sdfTaperedCapsule(p, [sgn * 0.264, 0.415, cuffZ], [sgn * 0.274, 0.388, palmZ * 0.65 + cuffZ * 0.35], 0.062, 0.054);
          const palm = sdfEllipsoid(p, [sgn * 0.282, 0.374, palmZ], [0.068, 0.066, 0.082]);
          const thumb = sdfTaperedCapsule(
            p,
            [sgn * 0.252, 0.386, palmZ + 0.005],
            [sgn * 0.226, 0.408, palmZ + 0.032],
            0.030,
            0.024
          );
          return sminPoly(sminPoly(cuff, palm, 0.020), thumb, 0.018);
        }
      });

    const buildSmoothDashBoot = (sgn: -1 | 1, legFwd: number): RawMesh =>
      sculptOrganicSdfMesh({
        boundsMin: [sgn > 0 ? 0.03 : -0.26, 0.04, legFwd - 0.14],
        boundsMax: [sgn > 0 ? 0.26 : -0.03, 0.24, legFwd + 0.22],
        resolution: 26,
        taubinIterations: 5,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const cx = sgn * 0.138;
          // Plump rounded dash-shoe forefoot + midfoot arch + rolled ankle collar + swept heel fin
          const toeDome = sdfEllipsoid(p, [cx, 0.106, legFwd + 0.072], [0.080, 0.056, 0.096]);
          const heelBody = sdfEllipsoid(p, [cx, 0.114, legFwd - 0.018], [0.072, 0.060, 0.078]);
          const ankleShaft = sdfTaperedCapsule(p, [cx, 0.122, legFwd + 0.004], [sgn * 0.135, 0.188, legFwd - 0.004], 0.064, 0.058);
          const heelFin = sdfTaperedCapsule(p, [cx, 0.128, legFwd - 0.055], [cx, 0.162, legFwd - 0.102], 0.032, 0.014);
          let d = sminPoly(toeDome, heelBody, 0.030);
          d = sminPoly(d, ankleShaft, 0.024);
          d = sminPoly(d, heelFin, 0.018);
          // Flatten underside cleanly at `y ≈ 0.068`
          d = smaxPoly(d, 0.068 - y, 0.012);
          return d;
        }
      });

    for (const sgn of [-1, 1] as const) {
      const armFwd = sgn > 0 ? 0.15 : -0.09;
      const legFwd = sgn > 0 ? -0.06 : 0.08;

      const arm = taubinSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [sgn * 0.178, 0.525, 0.012], rx: 0.052, rz: 0.052 },
            { pos: [sgn * 0.232, 0.472, armFwd * 0.35], rx: 0.048, rz: 0.048 },
            { pos: [sgn * 0.268, 0.408, armFwd * 0.85], rx: 0.045, rz: 0.045 }
          ],
          { ringPoints: 14, capEnds: true }
        ),
        4
      );
      slots.push({ mesh: bakeMeshCavityAO(arm, 0.20), materialIndex: 4 });

      const gloveMesh = bakeMeshCavityAO(buildSmoothCourierGlove(sgn, armFwd), 0.20);
      slots.push({ mesh: gloveMesh, materialIndex: 0 });
      // Smooth burnished-gold wrist collar ring & flush cyan palm repulsor
      const palmZ = armFwd + (sgn > 0 ? 0.038 : -0.016);
      slots.push({
        mesh: transformMesh(taubinSmoothMesh(closedRingTube(0.058, 0.016, 18, 8), 3), {
          pos: [sgn * 0.266, 0.412, armFwd - (sgn > 0 ? 0.024 : -0.014)],
          rot: [sgn > 0 ? 0.55 : -0.32, 0, sgn * -0.28]
        }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(smoothSphereMid, {
          pos: [sgn * 0.282, 0.332, palmZ],
          scale: [0.026, 0.013, 0.028]
        }),
        materialIndex: 5
      });

      const leg = taubinSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [sgn * 0.102, 0.305, 0.004], rx: 0.055, rz: 0.055 },
            { pos: [sgn * 0.124, 0.232, legFwd * 0.55], rx: 0.050, rz: 0.050 },
            { pos: [sgn * 0.135, 0.168, legFwd], rx: 0.048, rz: 0.048 }
          ],
          { ringPoints: 14, capEnds: true }
        ),
        4
      );
      slots.push({ mesh: bakeMeshCavityAO(leg, 0.20), materialIndex: 4 });

      // Sleek rounded dash boot + rolled gold ankle ring + dark sole + smooth ventral hover bell & plume
      const bootShell = bakeMeshCavityAO(buildSmoothDashBoot(sgn, legFwd), 0.22);
      slots.push({ mesh: bootShell, materialIndex: 0 });
      slots.push({
        mesh: transformMesh(taubinSmoothMesh(closedRingTube(0.064, 0.018, 20, 8), 3), {
          pos: [sgn * 0.135, 0.188, legFwd - 0.002],
          rot: [0.08, 0, 0]
        }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(
          taubinSmoothMesh(
            sculptStreamlinedHullMesh(0.195, 0.145, 0.026, {
              noseSharpness: 0.45,
              tailTaper: 0.45,
              canopyBulge: 0.1,
              undersideFlat: 0.75,
              stations: 11,
              ringPoints: 16
            }),
            3
          ),
          { pos: [sgn * 0.138, 0.068, legFwd + 0.030] }
        ),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(
          taubinSmoothMesh(latheMesh([[0.032, 0.032], [0.072, 0.048], [0.074, 0.068], [0, 0.070]], 16, false), 3),
          { pos: [sgn * 0.138, 0, legFwd + 0.028] }
        ),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(
          taubinSmoothMesh(latheMesh([[0, 0.006], [0.054, 0.024], [0.046, 0.048], [0, 0.052]], 14, false), 3),
          { pos: [sgn * 0.138, 0, legFwd + 0.028] }
        ),
        materialIndex: 5
      });
    }

    const proto = assembleMultiMaterialNode("courier-pod-proto", slots, mats, {
      castShadow: true,
      receiveShadow: true
    }).toJSON() as unknown as {
      readonly geometry?: AuraCustomGeometrySpec;
      readonly materials?: readonly AuraMaterialSpec[];
    };

    // Smooth Taubin-faired Star-Runner optical visor dome over the glossy multi-part eyes (`castShadow: false`, ior 1.52, opacity 0.44)
    const visorDomeSpec = mergeRawMeshes([
      transformMesh(
        taubinSmoothMesh(
          latheMesh([[0, 0.148], [0.122, 0.132], [0.208, 0.068], [0.228, 0]], 22, false),
          4
        ),
        { pos: [0, 0.796, 0.184], rot: [Math.PI * 0.5 - 0.06, 0, 0], scale: [1.08, 0.76, 0.88] }
      )
    ]);
    return {
      chassisSpec: proto.geometry ?? buildGroupedGeometrySpec(slots),
      chassisMats: (proto.materials ?? mats) as readonly AuraMaterialSpec[],
      visorDomeSpec
    };
  });

  const opaqueBody = geometry.multiMaterial(cached.chassisSpec, cached.chassisMats, {
    name: `${id}-chassis`,
    castShadow: true,
    receiveShadow: true
  });
  // Translucent physical electric-cyan visor canopy at +Z (`castShadow: false`, ior 1.52, opacity 0.44)
  const visorDome = geometry.custom(cached.visorDomeSpec, {
    name: `${id}-visor-dome`,
    material: DD_MATERIALS.opticalVisorGlass,
    castShadow: false,
    receiveShadow: false
  });

  return group(id, [opaqueBody, visorDome], { position }).runtime(game.runtimeNode(id));
}

export function buildGemCacheNode(spec: GemCacheSpec): GroupBuilder {
  const facetMat = material.clearcoatPaint({
    name: `${spec.id} crystal facet`,
    color: spec.hex,
    emissive: spec.hex,
    emissiveIntensity: 0.52,
    roughness: 0.04,
    metalness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.95,
    rim: { color: spec.rimHex, power: 2.0, intensity: 0.95 },
    practical: true
  });
  const innerFireMat = material.emissive({
    name: `${spec.id} crystal fire`,
    color: spec.coreHex,
    emissive: spec.hex,
    emissiveIntensity: 1.45,
    practical: true
  });
  const glassCrownMat = material.physical({
    name: `${spec.id} crystal glass`,
    color: spec.coreHex,
    emissive: spec.hex,
    emissiveIntensity: 0.24,
    roughness: 0.02,
    opacity: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    ior: 1.76,
    envMapIntensity: 2.1,
    alphaMode: "blend",
    depthWrite: false,
    practical: true
  });

  const shared = memoizeGeometry("dd-gem-cache-geometry-v2", () => {
    const slots: MultiMatSlot[] = [
      // 0: Crisp flat-shaded 12-facet royal brilliant pavilion + crown + 10-point star girdle
      {
        mesh: latheMesh(
          [[0, -0.44], [0.26, -0.18], [0.46, 0.05], [0.45, 0.16], [0.31, 0.36], [0.18, 0.45], [0, 0.46]],
          12,
          true
        ),
        materialIndex: 0
      },
      {
        mesh: transformMesh(extrudeStarPolygonMesh(10, 0.48, 0.37, 0.095, 0.018, true), {
          pos: [0, 0.06, 0],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 0
      },
      // 1: Sculpted burnished-gold 8-point star bezel setting + 6 jeweler's claw prongs
      {
        mesh: transformMesh(extrudeStarPolygonMesh(8, 0.43, 0.29, 0.085, 0.016, true), {
          pos: [0, -0.38, 0],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      },
      // 2: Luminous faceted inner starfire heart + crown starlet
      { mesh: icosphereFacetMesh(0.19, 1, 0.04, 11), materialIndex: 2 },
      {
        mesh: transformMesh(extrudeStarPolygonMesh(8, 0.24, 0.12, 0.04, 0.008, true), {
          pos: [0, 0.45, 0],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 2
      }
    ];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.06, 0.36, 0.06, 0.016), {
          pos: [Math.cos(a) * 0.36, -0.15, Math.sin(a) * 0.36],
          rot: [Math.sin(a) * -0.26, -a, Math.cos(a) * 0.26]
        }),
        materialIndex: 1
      });
    }
    return {
      bodySpec: buildGroupedGeometrySpec(slots),
      crownSpec: mergeRawMeshes([
        latheMesh([[0.44, 0.05], [0.48, 0.16], [0.32, 0.45], [0, 0.5]], 12, true)
      ])
    };
  });

  const crystalBody = geometry.multiMaterial(
    shared.bodySpec,
    [facetMat, DD_MATERIALS.courierBurnishedGold, innerFireMat],
    { name: `gem-cache-${spec.id}-body`, castShadow: true, receiveShadow: true }
  );
  const crystalCrown = geometry.custom(shared.crownSpec, {
    name: `gem-cache-${spec.id}-crown`,
    material: glassCrownMat,
    castShadow: false,
    receiveShadow: false
  });
  return group(`gem-cache-${spec.id}`, [crystalBody, crystalCrown], { position: [0, -999, 0] }).runtime(
    game.runtimeNode(`gem-cache-${spec.id}`)
  );
}

export function buildWarpTunnelArchNode(id: string): GroupBuilder {
  // Frames a wrap-tunnel portal centered on X=0, grounded at Y=0, spanning Z in [-0.58..+0.58] (rotated 90deg in Y when wrapY).
  const rawArch = archwayVoussoirSlots({
    radius: 0.38,
    thickness: 0.13,
    depth: 0.2,
    voussoirs: 7,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 3
  });
  const slots: MultiMatSlot[] = rawArch.map((s) => ({
    mesh: transformMesh(s.mesh, { pos: [0, 0.36, 0], rot: [0, Math.PI * 0.5, 0] }),
    materialIndex: s.materialIndex
  }));

  for (const sz of [-0.445, 0.445]) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.24, 0.38, 0.15, 0.025), { pos: [0, 0.19, sz] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.28, 0.06, 0.2, 0.015), { pos: [0, 0.03, sz] }), materialIndex: 1 },
      {
        mesh: tubeSweepMesh([[0, 0.08, sz, 0.038], [0.09, 0.22, sz * 1.04, 0.034], [0, 0.36, sz, 0.038]], 8, false),
        materialIndex: 2
      }
    );
  }

  return assembleMultiMaterialNode(
    id,
    slots,
    [
      DD_MATERIALS.darkSlateCeramic,
      DD_MATERIALS.anisotropicTitanium,
      DD_MATERIALS.anisotropicCopper,
      DD_MATERIALS.cyanThrusterPlasma
    ],
    { id, position: [0, -999, 0], castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// 6 Sculpted Bonus Arcade Relics & Articulated Workbench Architect Lamp
// ---------------------------------------------------------------------------

export const BONUS_RELIC_KINDS: readonly FruitKind[] = [
  "cherry",
  "strawberry",
  "orange",
  "apple",
  "melon",
  "star"
] as const;

export function buildBonusArcadeRelicNode(kind: FruitKind): GroupBuilder {
  const id = `bonus-relic-${kind}`;
  const slots: MultiMatSlot[] = [];

  switch (kind) {
    case "cherry": {
      const berry = latheMesh(
        [[0, -0.14], [0.11, -0.12], [0.15, -0.02], [0.13, 0.09], [0.05, 0.13], [0, 0.1]],
        16,
        false
      );
      const leafPoly: V2[] = [[0, 0], [0.12, 0.06], [0.24, 0.02], [0.14, -0.06]];
      slots.push(
        { mesh: transformMesh(berry, { pos: [-0.13, -0.08, 0.04], rot: [0, 0, -0.18] }), materialIndex: 0 },
        { mesh: transformMesh(berry, { pos: [0.13, -0.1, -0.03], rot: [0, 0, 0.22] }), materialIndex: 0 },
        {
          mesh: tubeSweepMesh([[-0.12, 0.02, 0.04, 0.022], [-0.05, 0.18, 0.02, 0.018], [0.02, 0.28, 0, 0.024]], 7, false),
          materialIndex: 2
        },
        {
          mesh: tubeSweepMesh([[0.12, 0.0, -0.03, 0.022], [0.07, 0.16, -0.01, 0.018], [0.02, 0.28, 0, 0.024]], 7, false),
          materialIndex: 2
        },
        {
          mesh: transformMesh(extrudePolygonMesh(leafPoly, 0.026, 0.008, false), {
            pos: [0.02, 0.27, 0],
            rot: [0.45, 0.3, 0.25]
          }),
          materialIndex: 1
        }
      );
      break;
    }
    case "strawberry": {
      const hull = latheMesh(
        [[0, -0.22], [0.08, -0.16], [0.18, 0.02], [0.16, 0.14], [0.06, 0.18], [0, 0.18]],
        12,
        true
      );
      const calyx: V2[] = [];
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.19 : 0.08;
        calyx.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      slots.push(
        { mesh: hull, materialIndex: 4 },
        { mesh: transformMesh(extrudePolygonMesh(calyx, 0.035, 0.008, true), { pos: [0, 0.18, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 1 },
        { mesh: latheMesh([[0, 0.18], [0.03, 0.19], [0.02, 0.28], [0, 0.29]], 8, false), materialIndex: 2 }
      );
      break;
    }
    case "orange": {
      // Ornate Golden Arcade Skeleton Key
      const bitPoly: V2[] = [[0, -0.08], [0.16, -0.08], [0.16, -0.03], [0.09, -0.03], [0.09, 0.02], [0.16, 0.02], [0.16, 0.07], [0, 0.07]];
      slots.push(
        { mesh: transformMesh(closedRingTube(0.13, 0.034, 20, 7), { pos: [0, 0.18, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 },
        { mesh: latheMesh([[0, -0.24], [0.036, -0.24], [0.036, 0.07], [0.06, 0.09], [0, 0.09]], 12, false), materialIndex: 2 },
        { mesh: transformMesh(extrudePolygonMesh(bitPoly, 0.038, 0.008, true), { pos: [0.02, -0.15, 0] }), materialIndex: 2 },
        { mesh: transformMesh(icosphereFacetMesh(0.065, 0), { pos: [0, 0.18, 0] }), materialIndex: 6 }
      );
      break;
    }
    case "apple": {
      // Gilded Brass Sanctuary / Arcade Bell with emerald band & glowing cyan clapper
      const bell = latheMesh(
        [[0.22, -0.14], [0.24, -0.11], [0.17, -0.02], [0.14, 0.12], [0.08, 0.2], [0, 0.22]],
        20,
        false
      );
      slots.push(
        { mesh: bell, materialIndex: 2 },
        { mesh: latheMesh([[0.155, 0.0], [0.18, 0.01], [0.175, 0.06], [0.15, 0.07]], 18, false), materialIndex: 1 },
        { mesh: transformMesh(closedRingTube(0.055, 0.018, 14, 6), { pos: [0, 0.25, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 },
        { mesh: transformMesh(icosphereFacetMesh(0.065, 1), { pos: [0, -0.16, 0] }), materialIndex: 5 }
      );
      break;
    }
    case "melon": {
      // Cyber-Emerald Gyro Chalice Relic
      const pod = latheMesh(
        [[0, -0.2], [0.14, -0.18], [0.07, -0.1], [0.18, 0.02], [0.15, 0.16], [0, 0.2]],
        12,
        true
      );
      slots.push(
        { mesh: pod, materialIndex: 1 },
        { mesh: tubeSweepMesh([[-0.14, -0.02, 0, 0.022], [-0.23, 0.06, 0, 0.02], [-0.13, 0.15, 0, 0.022]], 6, false), materialIndex: 2 },
        { mesh: tubeSweepMesh([[0.14, -0.02, 0, 0.022], [0.23, 0.06, 0, 0.02], [0.13, 0.15, 0, 0.022]], 6, false), materialIndex: 2 },
        { mesh: transformMesh(icosphereFacetMesh(0.075, 0), { pos: [0, 0.25, 0] }), materialIndex: 5 }
      );
      break;
    }
    case "star": {
      // Galaxian Delta Starfighter Craft (+Z nose, swept W-wings, brass blasters & glass canopy)
      const wingPoly: V2[] = [
        [0, 0.24], [-0.28, -0.08], [-0.26, -0.22], [-0.12, -0.12], [0, -0.2],
        [0.12, -0.12], [0.26, -0.22], [0.28, -0.08]
      ];
      const fuselage = loftSectionsMesh(
        [
          [[-0.06, -0.03, -0.22], [0.06, -0.03, -0.22], [0.05, 0.05, -0.22], [-0.05, 0.05, -0.22]],
          [[-0.09, -0.04, 0.0], [0.09, -0.04, 0.0], [0.07, 0.08, 0.0], [-0.07, 0.08, 0.0]],
          [[-0.02, -0.01, 0.28], [0.02, -0.01, 0.28], [0.015, 0.02, 0.28], [-0.015, 0.02, 0.28]]
        ],
        true,
        false
      );
      slots.push(
        { mesh: fuselage, materialIndex: 3 },
        { mesh: transformMesh(extrudePolygonMesh(wingPoly, 0.036, 0.01, true), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(0.04, 0.04, 0.18, 0.01), { pos: [-0.25, 0.01, 0.02] }), materialIndex: 2 },
        { mesh: transformMesh(bevelBoxMesh(0.04, 0.04, 0.18, 0.01), { pos: [0.25, 0.01, 0.02] }), materialIndex: 2 },
        { mesh: transformMesh(icosphereFacetMesh(0.045, 0), { pos: [-0.05, 0.0, -0.23] }), materialIndex: 5 },
        { mesh: transformMesh(icosphereFacetMesh(0.045, 0), { pos: [0.05, 0.0, -0.23] }), materialIndex: 5 }
      );
      const fighterBody = assembleMultiMaterialNode(
        `${id}-hull`,
        slots,
        [
          DD_MATERIALS.crimsonRubyGlaze,
          DD_MATERIALS.emeraldLeafGlaze,
          DD_MATERIALS.gimbalForgedBrass,
          DD_MATERIALS.galaxianCobaltPaint,
          DD_MATERIALS.roseBerryGlaze,
          DD_MATERIALS.cyanThrusterPlasma,
          DD_MATERIALS.amberBeaconPlasma
        ],
        { castShadow: true, receiveShadow: true }
      );
      const canopySpec = mergeRawMeshes([
        transformMesh(icosphereFacetMesh(0.068, 1), { pos: [0, 0.075, 0.03], scale: [0.78, 0.65, 1.55] })
      ]);
      const canopy = geometry.custom(canopySpec, {
        name: `${id}-canopy`,
        material: DD_MATERIALS.opticalVisorGlass,
        castShadow: false,
        receiveShadow: false
      });
      return group(id, [fighterBody, canopy], { position: [0, -999, 0] }).runtime(game.runtimeNode(id));
    }
  }

  return assembleMultiMaterialNode(
    id,
    slots,
    [
      DD_MATERIALS.crimsonRubyGlaze,
      DD_MATERIALS.emeraldLeafGlaze,
      DD_MATERIALS.gimbalForgedBrass,
      DD_MATERIALS.galaxianCobaltPaint,
      DD_MATERIALS.roseBerryGlaze,
      DD_MATERIALS.cyanThrusterPlasma,
      DD_MATERIALS.amberBeaconPlasma
    ],
    { id, position: [0, -999, 0], castShadow: true, receiveShadow: true }
  );
}

export function buildArchitectDeskLampNode(
  benchTopY: number,
  lampPos: V3,
  lampTarget: V3
): GroupBuilder {
  // Positioned behind the spot key origin `lampPos` along `lampPos - lampTarget` so the shade never occludes PCSS shadows.
  const dx = lampTarget[0] - lampPos[0];
  const dy = lampTarget[1] - lampPos[1];
  const dz = lampTarget[2] - lampPos[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  const ax: V3 = [dx / dl, dy / dl, dz / dl];

  const basePos: V3 = [-21.8, benchTopY, 10.8];
  const elbowPos: V3 = [-23.4, benchTopY + 7.6, 9.9];
  const neckPos: V3 = [lampPos[0] - ax[0] * 1.35, lampPos[1] - ax[1] * 1.35, lampPos[2] - ax[2] * 1.35];
  const shadeBack: V3 = [lampPos[0] - ax[0] * 0.55, lampPos[1] - ax[1] * 0.55, lampPos[2] - ax[2] * 0.55];
  const yaw = Math.atan2(ax[0], ax[2]);
  const pitch = Math.acos(Math.max(-1, Math.min(1, -ax[1])));

  const slots: MultiMatSlot[] = [
    // 0: Weighted cast-enamel base & spun reflector shade (oriented behind `lampPos`)
    {
      mesh: transformMesh(
        latheMesh([[0, 0], [1.65, 0], [1.6, 0.22], [1.15, 0.42], [0.36, 0.55], [0, 0.58]], 22, false),
        { pos: basePos }
      ),
      materialIndex: 0
    },
    {
      mesh: transformMesh(
        latheMesh([[0.22, 0.9], [0.55, 0.72], [1.18, 0.12], [1.32, 0]], 22, false),
        { pos: shadeBack, rot: [-pitch, yaw, 0] }
      ),
      materialIndex: 0
    },
    // 1: Brushed titanium twin spring-balanced boom tubes
    {
      mesh: tubeSweepMesh(
        [[basePos[0], basePos[1] + 0.52, basePos[2], 0.14], [elbowPos[0], elbowPos[1], elbowPos[2], 0.12]],
        8,
        false
      ),
      materialIndex: 1
    },
    {
      mesh: tubeSweepMesh(
        [[elbowPos[0], elbowPos[1], elbowPos[2], 0.12], [neckPos[0], neckPos[1], neckPos[2], 0.1]],
        8,
        false
      ),
      materialIndex: 1
    },
    // 2: Forged brass knuckles & tension trunnions
    { mesh: transformMesh(icosphereFacetMesh(0.24, 1), { pos: elbowPos }), materialIndex: 2 },
    { mesh: transformMesh(icosphereFacetMesh(0.2, 1), { pos: neckPos }), materialIndex: 2 },
    // 3: Braided fabric power cord slack loop along the arm
    {
      mesh: tubeSweepMesh(
        [
          [basePos[0] - 0.35, basePos[1] + 0.3, basePos[2] + 0.2, 0.045],
          [elbowPos[0] - 0.45, elbowPos[1] - 0.5, elbowPos[2] + 0.25, 0.045],
          [neckPos[0] - 0.2, neckPos[1] + 0.15, neckPos[2] + 0.15, 0.042]
        ],
        6,
        false
      ),
      materialIndex: 3
    },
    // 4: Practical warm tungsten emitter bulb recessed inside the shade behind `lampPos`
    {
      mesh: transformMesh(icosphereFacetMesh(0.26, 1), {
        pos: [lampPos[0] - ax[0] * 0.42, lampPos[1] - ax[1] * 0.42, lampPos[2] - ax[2] * 0.42]
      }),
      materialIndex: 4
    }
  ];

  return assembleMultiMaterialNode(
    "desk-lamp-rig",
    slots,
    [
      DD_MATERIALS.lampShadeEnamel,
      DD_MATERIALS.anisotropicTitanium,
      DD_MATERIALS.gimbalForgedBrass,
      DD_MATERIALS.statorBraidedGasket,
      DD_MATERIALS.amberBeaconPlasma
    ],
    { id: "desk-lamp-rig", castShadow: false, receiveShadow: true }
  );
}

/** Returns exact precomputed local `[min, max]` bounds for any `PoolKey` geometry. */
export function getPoolBounds(key: PoolKey): { readonly min: [number, number, number]; readonly max: [number, number, number] } {
  const spec = POOL_GEOMETRIES[key];
  if (spec.bounds) {
    return { min: [...spec.bounds.min], max: [...spec.bounds.max] };
  }
  const computed = computePositionsBounds(spec.positions as Float32Array);
  return computed ?? { min: [0, 0, 0], max: [0, 0, 0] };
}
