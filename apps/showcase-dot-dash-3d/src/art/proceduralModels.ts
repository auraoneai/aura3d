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
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  computePositionsBounds,
  extrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  subdivideSmoothMesh,
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
  poolEyes: instancedGlowPbr(1.45, 0.18),
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
    color: "#ffffff",
    roughness: 0.2,
    metalness: 0.18,
    clearcoat: 0.94,
    clearcoatRoughness: 0.08,
    rim: { color: "#d8ebff", power: 2.4, intensity: 0.82 }
  }),
  poolSentryVisor: instancedGlowPbr(2.1, 0.14),
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
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
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
  // Compound optical sensor pod facing +Z with hooded barrel & convex cornea dome
  const barrel = transformMesh(
    latheMesh([[0, -0.38], [0.34, -0.36], [0.44, 0.05], [0.42, 0.28], [0.22, 0.44], [0, 0.48]], 14, false),
    { rot: [Math.PI * 0.5, 0, 0] }
  );
  return unitSpec([
    barrel,
    transformMesh(bevelBoxMesh(0.22, 0.16, 0.46, 0.03), { pos: [0, 0.36, -0.06] })
  ]);
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
  // V-swept wrap-around chevron optical visor facing +Z
  const chevron: V2[] = [[-0.48, -0.18], [0, 0.46], [0.48, -0.18], [0.36, -0.44], [0, 0.08], [-0.36, -0.44]];
  return unitSpec([transformMesh(extrudePolygonMesh(chevron, 0.72, 0.08, false), { rot: [Math.PI * 0.5, 0, 0] })]);
}

function buildCourierHaloRingSpec(): AuraCustomGeometrySpec {
  // Equator gimbal stator ring with 4 radial vernier inductor pods
  const parts: RawMesh[] = [closedRingTube(0.42, 0.055, 24, 8)];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(transformMesh(bevelBoxMesh(0.14, 0.16, 0.18, 0.03), { pos: [Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42], rot: [0, a, 0] }));
  }
  return unitSpec(parts, [0.992, 0.32, 0.992]);
}

function buildSentryVisorSpec(): AuraCustomGeometrySpec {
  // Curved wrap-around twin-optic sentry visor facing +Z
  const lens = transformMesh(latheMesh([[0, -0.18], [0.22, -0.08], [0.18, 0.28], [0, 0.36]], 10, false), { rot: [Math.PI * 0.5, 0, 0] });
  return unitSpec([
    bevelBoxMesh(0.96, 0.62, 0.54, 0.1),
    transformMesh(lens, { pos: [-0.24, 0.02, 0.18] }),
    transformMesh(lens, { pos: [0.24, 0.02, 0.18] })
  ]);
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
// 4 Distinct Sculpted Hunter / Sentinel Drone Silhouettes (`shC`, `shB`, `shT`, `shY`)
// Local +Z is forward (`yawOf` in `world.ts`: d.z > 0 => yaw = 0).
// ---------------------------------------------------------------------------

function buildScallopedGhostBody(opts: {
  readonly lobes: number;
  readonly skirtR: number;
  readonly waistR: number;
  readonly crownR: number;
  readonly crownY: number;
  readonly flat: boolean;
}): RawMesh {
  const segs = opts.lobes * 4;
  const ring = (y: number, rBase: number, scallopAmp: number, zBias = 0): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const wave = Math.cos(a * opts.lobes);
      const r = rBase * (1 + scallopAmp * wave);
      pts.push([Math.sin(a) * r, y + wave * scallopAmp * 0.16, Math.cos(a) * r + zBias]);
    }
    return pts;
  };
  const raw = loftSectionsMesh(
    [
      ring(-0.44, opts.skirtR * 0.96, 0.14),
      ring(-0.22, opts.skirtR, 0.08),
      ring(0.04, opts.waistR, 0.02, 0.02),
      ring(opts.crownY * 0.68, opts.crownR, 0, 0.03),
      ring(opts.crownY, Math.max(0.04, opts.crownR * 0.28), 0, 0.04)
    ],
    true,
    opts.flat
  );
  return opts.flat ? raw : subdivideSmoothMesh(raw, 1, 0.42);
}

function addTwinOpticalDomesAndCore(parts: RawMesh[], eyeY: number, eyeZ: number, eyeSpread: number): void {
  const dome = transformMesh(
    latheMesh([[0, -0.05], [0.115, -0.02], [0.095, 0.09], [0, 0.13]], 14, false),
    { rot: [Math.PI * 0.5, 0, 0] }
  );
  parts.push(
    transformMesh(dome, { pos: [-eyeSpread, eyeY, eyeZ] }),
    transformMesh(dome, { pos: [eyeSpread, eyeY, eyeZ] }),
    // Ventral plasma repulsor core bell + stator ring
    latheMesh([[0.05, -0.48], [0.24, -0.47], [0.18, -0.34], [0, -0.31]], 14, false),
    transformMesh(closedRingTube(0.28, 0.028, 16, 6), { pos: [0, -0.4, 0] })
  );
}

function buildSentryHunterSpec(): AuraCustomGeometrySpec {
  // "blitz" — Aggressive interceptor sentinel drone: smooth 8-lobe carapace, streamlined predator dorsal cowl,
  // swept attack mandibles & twin rear interceptor winglets
  const cowl = sculptStreamlinedHullMesh(0.68, 0.42, 0.24, {
    noseSharpness: 0.95,
    tailTaper: 0.7,
    canopyBulge: 0.28,
    undersideFlat: 0.65,
    stations: 9,
    ringPoints: 12
  });
  const fin: V2[] = [[0, -0.12], [0.36, -0.28], [0.2, 0.24], [-0.08, 0.45]];
  const parts: RawMesh[] = [
    buildScallopedGhostBody({ lobes: 8, skirtR: 0.39, waistR: 0.35, crownR: 0.25, crownY: 0.44, flat: false }),
    transformMesh(cowl, { pos: [0, 0.24, 0.04] }),
    transformMesh(extrudePolygonMesh(fin, 0.055, 0.015, true), { pos: [0, 0.18, -0.08], rot: [0, Math.PI * 0.5, 0] }),
    transformMesh(bevelBoxMesh(0.16, 0.075, 0.44, 0.024), { pos: [-0.36, -0.01, -0.03], rot: [0, -0.26, -0.34] }),
    transformMesh(bevelBoxMesh(0.16, 0.075, 0.44, 0.024), { pos: [0.36, -0.01, -0.03], rot: [0, 0.26, 0.34] })
  ];
  addTwinOpticalDomesAndCore(parts, 0.11, 0.32, 0.13);
  return unitSpec(parts);
}

function buildSentryAmbusherSpec(): AuraCustomGeometrySpec {
  // "sly" — Arachnid stealth sentinel drone: smooth armored dome + 4 multi-joint `sculptHumanoidLimbMesh` hover-stabilizer legs
  const parts: RawMesh[] = [
    buildScallopedGhostBody({ lobes: 6, skirtR: 0.38, waistR: 0.4, crownR: 0.33, crownY: 0.39, flat: false }),
    transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.64, 0.15, 0.34, 0.045), 1, 0.45), {
      pos: [0, 0.24, 0.13],
      rot: [0.18, 0, 0]
    })
  ];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        sculptHumanoidLimbMesh(
          [
            [sx * 0.25, 0.12, sz * 0.18, 0.052],
            [sx * 0.43, 0.22, sz * 0.31, 0.042],
            [sx * 0.45, -0.26, sz * 0.36, 0.028]
          ],
          8,
          0.12
        )
      );
    }
  }
  addTwinOpticalDomesAndCore(parts, 0.08, 0.36, 0.15);
  return unitSpec(parts);
}

function buildSentryDrifterSpec(): AuraCustomGeometrySpec {
  // "flick" — Gyro-stabilized telemetry sentinel drone: smooth 10-lobe bell + dual crossed gyro rings + curved whip antennas
  const parts: RawMesh[] = [
    buildScallopedGhostBody({ lobes: 10, skirtR: 0.34, waistR: 0.32, crownR: 0.26, crownY: 0.41, flat: false }),
    transformMesh(closedRingTube(0.45, 0.044, 22, 7), { pos: [0, 0.03, 0], rot: [0.26, 0, -0.22] }),
    transformMesh(closedRingTube(0.42, 0.032, 20, 6), { pos: [0, 0.03, 0], rot: [-0.28, 0.45, 0.24] }),
    tubeSweepMesh([[-0.11, 0.28, -0.04, 0.03], [-0.17, 0.39, -0.09, 0.022], [-0.22, 0.48, -0.15, 0.014]], 7, true),
    tubeSweepMesh([[0.11, 0.28, -0.04, 0.03], [0.17, 0.39, -0.09, 0.022], [0.22, 0.48, -0.15, 0.014]], 7, true)
  ];
  addTwinOpticalDomesAndCore(parts, 0.1, 0.31, 0.12);
  return unitSpec(parts);
}

function buildSentrySkittishSpec(): AuraCustomGeometrySpec {
  // "dim" — Wide-brim recon saucer sentinel drone: smooth 12-lobe hover-bell + lathed saucer flange + 4 vernier pods
  const parts: RawMesh[] = [
    buildScallopedGhostBody({ lobes: 12, skirtR: 0.35, waistR: 0.42, crownR: 0.28, crownY: 0.43, flat: false }),
    latheMesh([[0.22, -0.06], [0.48, 0.01], [0.48, 0.1], [0.26, 0.22]], 22, false)
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i + 0.5) * Math.PI * 0.5;
    parts.push(
      transformMesh(bevelBoxMesh(0.11, 0.09, 0.14, 0.026), {
        pos: [Math.sin(a) * 0.42, 0.06, Math.cos(a) * 0.42],
        rot: [0, a, 0]
      })
    );
  }
  addTwinOpticalDomesAndCore(parts, 0.14, 0.34, 0.14);
  return unitSpec(parts);
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
  const coreSpec = memoizeGeometry("dd-courier-core-v2", () =>
    mergeRawMeshes([
      subdivideSmoothMesh(icosphereSmoothMesh(0.145, 1, 0.03, 7, 0.22), 1, 0.52),
      transformMesh(extrudeStarPolygonMesh(6, 0.205, 0.115, 0.045, 0.01, true), {
        rot: [-Math.PI * 0.5, 0, 0]
      }),
      transformMesh(closedRingTube(0.19, 0.02, 18, 6), { rot: [0.32, 0, -0.24] }),
      transformMesh(closedRingTube(0.175, 0.016, 16, 6), { rot: [-0.36, 0.5, 0.26] })
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
  // Sculpted Electric Gold (#ffc422 / #ffaa18) & Electric Cyan (#18f0ff) hover-courier speeder + leaned-forward cyber-courier rider, facing +Z.
  const mats: readonly AuraMaterialSpec[] = [
    DD_MATERIALS.courierClearcoatShell,
    DD_MATERIALS.courierBurnishedGold,
    DD_MATERIALS.anisotropicTitanium,
    DD_MATERIALS.courierPorcelainTrim,
    DD_MATERIALS.statorBraidedGasket,
    DD_MATERIALS.cyanThrusterPlasma
  ];

  const cached = memoizeGeometry("dd-courier-hover-pod-v2", () => {
    const streamlinedHull = subdivideSmoothMesh(
      sculptStreamlinedHullMesh(1.04, 0.78, 0.34, {
        noseSharpness: 0.92,
        tailTaper: 0.62,
        canopyBulge: 0.26,
        undersideFlat: 0.72,
        stations: 12,
        ringPoints: 16
      }),
      1,
      0.46
    );
    // Swept delta winglet profile in XY (extruded across Z, then rotated horizontal in XZ)
    const wingRight: V2[] = [[0.22, -0.28], [0.59, -0.39], [0.55, -0.14], [0.27, 0.2]];
    const wingLeft: V2[] = [[-0.27, 0.2], [-0.55, -0.14], [-0.59, -0.39], [-0.22, -0.28]];
    const dorsalCrest: V2[] = [[0, -0.02], [0.32, -0.1], [0.2, 0.18], [-0.12, 0.24]];
    const prowMandibleR: V2[] = [[0.08, 0.26], [0.22, 0.18], [0.18, 0.54], [0.06, 0.47]];
    const prowMandibleL: V2[] = [[-0.06, 0.47], [-0.18, 0.54], [-0.22, 0.18], [-0.08, 0.26]];

    // Sculpted leaned-forward cyber-courier pilot helmet + shoulders + handlebar-gripping arms (`sculptHumanoidLimbMesh`)
    const pilotHelmet = subdivideSmoothMesh(icosphereSmoothMesh(0.115, 1, 0.02, 23, 0.24), 1, 0.55);
    const pilotTorso = subdivideSmoothMesh(bevelBoxMesh(0.22, 0.16, 0.22, 0.055), 1, 0.5);
    const pilotArmL = sculptHumanoidLimbMesh(
      [
        [-0.12, 0.52, -0.04, 0.038],
        [-0.17, 0.46, 0.08, 0.032],
        [-0.14, 0.44, 0.2, 0.026]
      ],
      8,
      0.14
    );
    const pilotArmR = sculptHumanoidLimbMesh(
      [
        [0.12, 0.52, -0.04, 0.038],
        [0.17, 0.46, 0.08, 0.032],
        [0.14, 0.44, 0.2, 0.026]
      ],
      8,
      0.14
    );

    const slots: MultiMatSlot[] = [
      // 0: Smooth sculpted Electric Gold (#ffc422) speeder hull + swept delta winglets + pilot aero helmet
      { mesh: transformMesh(streamlinedHull, { pos: [0, 0.34, 0.02] }), materialIndex: 0 },
      {
        mesh: transformMesh(extrudePolygonMesh(wingRight, 0.075, 0.02, true), {
          pos: [0, 0.33, 0],
          rot: [-Math.PI * 0.5, 0, -0.08]
        }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(extrudePolygonMesh(wingLeft, 0.075, 0.02, true), {
          pos: [0, 0.33, 0],
          rot: [-Math.PI * 0.5, 0, 0.08]
        }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(pilotHelmet, { pos: [0, 0.58, 0.05], scale: [0.94, 0.96, 1.18] }),
        materialIndex: 0
      },
      // 1: Burnished Gold (#ffaa18) dorsal 6-point star reactor cradle, V-prow mandibles & dorsal blade crest
      {
        mesh: transformMesh(extrudeStarPolygonMesh(6, 0.31, 0.19, 0.07, 0.016, true), {
          pos: [0, 0.49, -0.06],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(extrudePolygonMesh(prowMandibleR, 0.07, 0.015, true), {
          pos: [0, 0.3, 0.04],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(extrudePolygonMesh(prowMandibleL, 0.07, 0.015, true), {
          pos: [0, 0.3, 0.04],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(extrudePolygonMesh(dorsalCrest, 0.058, 0.014, true), {
          pos: [0, 0.54, -0.24],
          rot: [0, Math.PI * 0.5, 0]
        }),
        materialIndex: 1
      },
      // 2: Brushed gold-bronze lateral intake conduits, handlebar yoke & twin rear thruster bells (-Z)
      {
        mesh: tubeSweepMesh([[-0.31, 0.41, 0.24, 0.042], [-0.39, 0.39, -0.06, 0.048], [-0.18, 0.35, -0.43, 0.054]], 9, false),
        materialIndex: 2
      },
      {
        mesh: tubeSweepMesh([[0.31, 0.41, 0.24, 0.042], [0.39, 0.39, -0.06, 0.048], [0.18, 0.35, -0.43, 0.054]], 9, false),
        materialIndex: 2
      },
      {
        mesh: tubeSweepMesh([[-0.16, 0.45, 0.2, 0.02], [0, 0.47, 0.24, 0.022], [0.16, 0.45, 0.2, 0.02]], 7, true),
        materialIndex: 2
      },
      {
        mesh: transformMesh(latheMesh([[0.06, 0], [0.135, 0.02], [0.12, 0.14], [0.07, 0.17]], 14, false), {
          pos: [-0.17, 0.35, -0.41],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 2
      },
      {
        mesh: transformMesh(latheMesh([[0.06, 0], [0.135, 0.02], [0.12, 0.14], [0.07, 0.17]], 14, false), {
          pos: [0.17, 0.35, -0.41],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 2
      },
      // 3: Deep obsidian contrast cockpit cowl & pilot visor band
      { mesh: transformMesh(bevelBoxMesh(0.42, 0.11, 0.16, 0.025), { pos: [0, 0.42, 0.29], rot: [0.18, 0, 0] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.18, 0.055, 0.12, 0.02), { pos: [0, 0.58, 0.13], rot: [0.12, 0, 0] }), materialIndex: 3 },
      // 4: Braided fabric pilot flight jacket + handlebar arms + low ventral stator damper collar
      { mesh: transformMesh(pilotTorso, { pos: [0, 0.48, -0.02], rot: [0.36, 0, 0] }), materialIndex: 4 },
      { mesh: pilotArmL, materialIndex: 4 },
      { mesh: pilotArmR, materialIndex: 4 },
      { mesh: latheMesh([[0.18, 0.08], [0.31, 0.1], [0.31, 0.17], [0.18, 0.18]], 18, false), materialIndex: 4 },
      // 5: Vivid Electric Cyan (#18f0ff) wrap-around chevron visor, wingtip plasma runners & twin rear thrusters
      {
        mesh: tubeSweepMesh([[-0.24, 0.43, 0.25, 0.038], [0, 0.44, 0.42, 0.044], [0.24, 0.43, 0.25, 0.038]], 8, false),
        materialIndex: 5
      },
      {
        mesh: tubeSweepMesh([[-0.49, 0.34, -0.1, 0.026], [-0.56, 0.33, -0.35, 0.03]], 6, false),
        materialIndex: 5
      },
      {
        mesh: tubeSweepMesh([[0.49, 0.34, -0.1, 0.026], [0.56, 0.33, -0.35, 0.03]], 6, false),
        materialIndex: 5
      },
      {
        mesh: transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.07, 0.13], [0, 0.15]], 12, false), {
          pos: [-0.17, 0.35, -0.45],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 5
      },
      {
        mesh: transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.07, 0.13], [0, 0.15]], 12, false), {
          pos: [0.17, 0.35, -0.45],
          rot: [-Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 5
      },
      { mesh: latheMesh([[0, 0.02], [0.16, 0.03], [0.14, 0.07], [0, 0.07]], 14, false), materialIndex: 5 }
    ];

    const proto = assembleMultiMaterialNode("courier-pod-proto", slots, mats, {
      castShadow: true,
      receiveShadow: true
    }).toJSON();
    const visorDomeSpec = mergeRawMeshes([
      transformMesh(
        latheMesh([[0, 0.17], [0.15, 0.145], [0.25, 0.065], [0.27, 0]], 18, false),
        { pos: [0, 0.48, 0.23], rot: [Math.PI * 0.5 - 0.24, 0, 0], scale: [1.16, 0.76, 0.96] }
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
