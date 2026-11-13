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
  sculptStylizedHeadMesh,
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
  // Expressive defeated-phantom cartoon eyeball scurrying home (+Z): plump cornea + iris relief + arched brow + ectoplasm wisp tail
  const eyeball = subdivideSmoothMesh(icosphereSmoothMesh(0.32, 1, 0.01, 13, 0.2), 1, 0.52);
  const browSpline = catmullRomSpline3([[-0.26, 0.26, 0.14], [0, 0.37, 0.22], [0.26, 0.24, 0.14]], 3);
  const wispTail = catmullRomSpline3([[0, -0.04, -0.24], [0.05, -0.14, -0.38], [-0.03, -0.22, -0.48]], 3);
  return unitSpec([
    transformMesh(eyeball, { pos: [0, 0.02, 0.08], scale: [1.0, 1.08, 0.88] }),
    transformMesh(icosphereSmoothMesh(0.12, 1, 0, 5), { pos: [-0.07, 0.12, 0.37], scale: [1, 1, 0.45] }),
    tubeSweepMesh(browSpline.map(([x, y, z]) => [x, y, z, 0.058] as V4), 7, false),
    tubeSweepMesh(wispTail.map(([x, y, z], i) => [x, y, z, Math.max(0.024, 0.11 - i * 0.014)] as V4), 7, false)
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
  // Sculpted Star-Runner winged V-star crown crest jewel facing +Z
  const wingStar: V2[] = [
    [0, 0.48],
    [0.14, 0.16],
    [0.48, 0.28],
    [0.26, -0.14],
    [0, -0.44],
    [-0.26, -0.14],
    [-0.48, 0.28],
    [-0.14, 0.16]
  ];
  return unitSpec([
    transformMesh(subdivideSmoothMesh(extrudePolygonMesh(wingStar, 0.56, 0.07, false), 1, 0.42), {
      rot: [Math.PI * 0.5, 0, 0]
    })
  ]);
}

function buildCourierHaloRingSpec(): AuraCustomGeometrySpec {
  // Star-Runner hover-boot repulsor wake halo ring with 6 sculpted starlight nodes
  const parts: RawMesh[] = [closedRingTube(0.42, 0.046, 24, 8)];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      transformMesh(extrudeStarPolygonMesh(5, 0.095, 0.048, 0.09, 0.015, false), {
        pos: [Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42],
        rot: [-Math.PI * 0.5, a, 0]
      })
    );
  }
  return unitSpec(parts, [0.992, 0.28, 0.992]);
}

function buildSentryVisorSpec(): AuraCustomGeometrySpec {
  // Twin big glowing expressive cartoon phantom eyes + catchlight gleams + fierce arched cartoon brows facing +Z
  const eyeOval = subdivideSmoothMesh(icosphereSmoothMesh(0.2, 1, 0, 9), 1, 0.5);
  const catchPip = icosphereSmoothMesh(0.068, 0, 0, 3);
  const browL = catmullRomSpline3([[-0.44, 0.24, -0.02], [-0.26, 0.36, 0.12], [-0.07, 0.18, 0.18]], 3);
  const browR = catmullRomSpline3([[0.07, 0.18, 0.18], [0.26, 0.36, 0.12], [0.44, 0.24, -0.02]], 3);
  return unitSpec([
    transformMesh(eyeOval, { pos: [-0.23, -0.04, 0.04], rot: [0, -0.14, -0.08], scale: [0.92, 1.24, 0.68] }),
    transformMesh(eyeOval, { pos: [0.23, -0.04, 0.04], rot: [0, 0.14, 0.08], scale: [0.92, 1.24, 0.68] }),
    transformMesh(catchPip, { pos: [-0.18, 0.11, 0.22], scale: [1, 1, 0.55] }),
    transformMesh(catchPip, { pos: [0.28, 0.11, 0.22], scale: [1, 1, 0.55] }),
    tubeSweepMesh(browL.map(([x, y, z]) => [x, y, z, 0.056] as V4), 7, false),
    tubeSweepMesh(browR.map(([x, y, z]) => [x, y, z, 0.056] as V4), 7, false)
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
// 4 Distinct Toy-Grade 3D Arcade Maze Phantoms (`shC`, `shB`, `shT`, `shY`)
// Local +Z is forward (`yawOf` in `world.ts`: d.z > 0 => yaw = 0).
// Painted in neutral luminance [0.74..1.0] + `bakeMeshCavityAO(..., 0.25)` so
// runtime `GHOST_TINT` instance colors stay 100% vivid with rich 3D fold shading!
// ---------------------------------------------------------------------------

function buildScallopedPhantomRobe(opts: {
  readonly lobes: number;
  readonly hemR: number;
  readonly bellyR: number;
  readonly headR: number;
  readonly topY: number;
  readonly flareCurl: number;
}): RawMesh {
  const segs = opts.lobes * 3;
  const ring = (y: number, rBase: number, pleatAmp: number, hemDrop: number, zBias = 0): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const wave = Math.cos(a * opts.lobes);
      const cheek = y > 0.02 && y < opts.topY * 0.78 && Math.cos(a) > 0.15 ? 1.06 : 1.0;
      const r = rBase * cheek * (1 + pleatAmp * wave);
      pts.push([
        Math.sin(a) * r,
        y + wave * hemDrop,
        Math.cos(a) * r + zBias - (y < -0.18 ? opts.flareCurl * (1 - Math.cos(a)) * 0.05 : 0)
      ]);
    }
    return pts;
  };
  const raw = loftSectionsMesh(
    [
      ring(-0.43, opts.hemR * 0.92, 0.19, 0.065, -0.02),
      ring(-0.28, opts.hemR, 0.15, 0.038, -0.01),
      ring(-0.08, opts.bellyR, 0.07, 0.012, 0.015),
      ring(0.11, opts.headR, 0.02, 0, 0.03),
      ring(opts.topY * 0.74, opts.headR * 0.88, 0, 0, 0.025),
      ring(opts.topY, Math.max(0.05, opts.headR * 0.28), 0, 0, 0.015)
    ],
    true,
    false
  );
  return paintMeshColors(subdivideSmoothMesh(raw, 1, 0.52), (pos, norm): V3 => {
    const v = Math.max(0, Math.min(1, (pos[1] + 0.46) / 0.92));
    const crestLift = Math.max(0, norm[1] * 0.14 + norm[2] * 0.1);
    const hemShade = pos[1] < -0.24 ? (pos[1] + 0.24) * 0.35 : 0;
    const lum = Math.max(0.72, Math.min(1.0, 0.8 + v * 0.16 + crestLift + hemShade));
    return [lum, lum, Math.min(1.0, lum + (1 - v) * 0.03)];
  });
}

function addPhantomHandsAndFaceRelief(
  parts: RawMesh[],
  opts: { readonly eyeY: number; readonly eyeZ: number; readonly eyeSpread: number; readonly browTilt: number; readonly handReachZ: number }
): void {
  for (const sgn of [-1, 1] as const) {
    // Sculpted stubby ghostly sleeve + cuffed mitten reaching playfully forward (+Z)
    const arm = subdivideSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [sgn * 0.28, 0.02, 0.02], rx: 0.088, rz: 0.085 },
          { pos: [sgn * 0.39, -0.04, 0.13], rx: 0.078, rz: 0.076 },
          { pos: [sgn * 0.36, -0.01, opts.handReachZ], rx: 0.095, rz: 0.092 }
        ],
        { ringPoints: 8, capEnds: true }
      ),
      1,
      0.48
    );
    const cuff = transformMesh(latheMesh([[0.075, -0.025], [0.112, 0], [0.082, 0.03]], 10, false), {
      pos: [sgn * 0.37, -0.025, opts.handReachZ - 0.055],
      rot: [Math.PI * 0.42, sgn * -0.18, 0]
    });
    parts.push(
      paintMeshColors(arm, [0.96, 0.97, 1.0]),
      paintMeshColors(cuff, [1.0, 1.0, 1.0])
    );

    // Recessed dark-rimmed eye socket frame & expressive 3D brow ridge on +Z
    const socketRim = transformMesh(closedRingTube(0.095, 0.024, 12, 6), {
      pos: [sgn * opts.eyeSpread, opts.eyeY, opts.eyeZ],
      rot: [Math.PI * 0.5, sgn * 0.16, 0]
    });
    const browPts = catmullRomSpline3(
      [
        [sgn * 0.035, opts.eyeY + 0.085 - opts.browTilt * 0.04, opts.eyeZ + 0.035],
        [sgn * opts.eyeSpread, opts.eyeY + 0.115, opts.eyeZ + 0.025],
        [sgn * (opts.eyeSpread + 0.11), opts.eyeY + 0.085 + opts.browTilt * 0.05, opts.eyeZ - 0.02]
      ],
      3
    );
    parts.push(
      paintMeshColors(socketRim, [0.74, 0.75, 0.8]),
      paintMeshColors(tubeSweepMesh(browPts.map(([x, y, z]) => [x, y, z, 0.032] as V4), 7, false), [0.98, 0.98, 1.0])
    );
  }
  // Cute cheeky ghostly smile ridge + twin tiny fang relief on +Z
  const smilePts = catmullRomSpline3([[-0.12, opts.eyeY - 0.13, opts.eyeZ + 0.01], [0, opts.eyeY - 0.16, opts.eyeZ + 0.035], [0.12, opts.eyeY - 0.13, opts.eyeZ + 0.01]], 3);
  parts.push(paintMeshColors(tubeSweepMesh(smilePts.map(([x, y, z]) => [x, y, z, 0.018] as V4), 6, false), [0.76, 0.77, 0.82]));
}

function finalizePhantomSpec(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  const baked = bakeMeshCavityAO(mergeRawParts(parts), 0.25);
  return mergeRawMeshes([normalizeUnitCubeMesh(baked)]);
}

function buildSentryHunterSpec(): AuraCustomGeometrySpec {
  // "blitz" (Red Chaser) — Fierce Oni Warlord Phantom: 7-scallop flame-hem robe, spiked mantle collar & twin curved Oni horns!
  const parts: RawMesh[] = [
    buildScallopedPhantomRobe({ lobes: 7, hemR: 0.39, bellyR: 0.35, headR: 0.31, topY: 0.32, flareCurl: 1.2 }),
    // Spiked shoulder battle collar
    paintMeshColors(
      transformMesh(extrudeStarPolygonMesh(7, 0.38, 0.27, 0.065, 0.015, false), {
        pos: [0, 0.05, 0.01],
        rot: [-Math.PI * 0.5 + 0.08, 0, 0]
      }),
      [0.98, 0.98, 1.0]
    )
  ];
  for (const sgn of [-1, 1] as const) {
    const hornSpline = catmullRomSpline3(
      [
        [sgn * 0.13, 0.26, 0.05],
        [sgn * 0.27, 0.35, 0.08],
        [sgn * 0.31, 0.47, 0.02],
        [sgn * 0.22, 0.54, -0.04]
      ],
      3
    );
    const horn = tubeSweepMesh(
      hornSpline.map(([x, y, z], i, arr) => [x, y, z, Math.max(0.014, 0.068 * (1 - (i / Math.max(1, arr.length - 1)) * 0.78))] as V4),
      8,
      false
    );
    const boss = transformMesh(latheMesh([[0.055, -0.02], [0.082, 0], [0.062, 0.025]], 10, false), {
      pos: [sgn * 0.14, 0.27, 0.05],
      rot: [0, 0, sgn * -0.55]
    });
    parts.push(paintMeshColors(horn, [1.0, 0.99, 0.96]), paintMeshColors(boss, [0.92, 0.92, 0.96]));
  }
  addPhantomHandsAndFaceRelief(parts, { eyeY: 0.14, eyeZ: 0.29, eyeSpread: 0.12, browTilt: 0.8, handReachZ: 0.27 });
  return finalizePhantomSpec(parts);
}

function buildSentryAmbusherSpec(): AuraCustomGeometrySpec {
  // "sly" (Pink Ambusher) — Whimsical Trickster Jester Phantom: 6-scallop ruffle robe, 3-pronged curled Jester-Tiara & pearl bobbles!
  const parts: RawMesh[] = [
    buildScallopedPhantomRobe({ lobes: 6, hemR: 0.4, bellyR: 0.34, headR: 0.3, topY: 0.3, flareCurl: 0.9 }),
    // Ruffled jester neck-collar
    paintMeshColors(
      subdivideSmoothMesh(
        latheMesh([[0.24, 0.02], [0.39, 0.05], [0.37, 0.1], [0.25, 0.12]], 14, false),
        1,
        0.45
      ),
      [0.99, 0.99, 1.0]
    ),
    // Tiara circlet band
    paintMeshColors(
      transformMesh(latheMesh([[0.2, 0.24], [0.25, 0.27], [0.23, 0.32]], 14, false), { pos: [0, 0, 0.02] }),
      [1.0, 1.0, 1.0]
    )
  ];
  // 3 curled jester-tiara plumes (left, center-tall, right) with glossy bobble pearls
  for (const [ang, reachX, topH, tipZ] of [
    [-0.95, -0.3, 0.49, -0.05],
    [0, 0, 0.53, -0.12],
    [0.95, 0.3, 0.49, -0.05]
  ] as const) {
    const prong = catmullRomSpline3(
      [
        [reachX * 0.35, 0.28, 0.03],
        [reachX * 0.78, topH, 0.01],
        [reachX, topH - 0.05, tipZ]
      ],
      3
    );
    parts.push(
      paintMeshColors(
        tubeSweepMesh(
          prong.map(([x, y, z], i, arr) => [x, y, z, Math.max(0.022, 0.072 * (1 - (i / Math.max(1, arr.length - 1)) * 0.62))] as V4),
          8,
          false
        ),
        [0.98, 0.98, 1.0]
      ),
      paintMeshColors(
        transformMesh(icosphereSmoothMesh(0.054 + (ang === 0 ? 0.008 : 0), 1, 0, 11), {
          pos: [reachX, topH - 0.055, tipZ]
        }),
        [1.0, 1.0, 1.0]
      )
    );
  }
  addPhantomHandsAndFaceRelief(parts, { eyeY: 0.13, eyeZ: 0.285, eyeSpread: 0.12, browTilt: -0.35, handReachZ: 0.25 });
  return finalizePhantomSpec(parts);
}

function buildSentryDrifterSpec(): AuraCustomGeometrySpec {
  // "flick" (Cyan Technomancer) — Arcane Spark-Antenna Phantom: 8-scallop pleated robe, floating glyph collar & twin S-coil bobble antennae!
  const parts: RawMesh[] = [
    buildScallopedPhantomRobe({ lobes: 8, hemR: 0.37, bellyR: 0.33, headR: 0.3, topY: 0.31, flareCurl: 1.0 }),
    // Floating tilted arcane mantle ring + forehead star crest
    paintMeshColors(
      transformMesh(closedRingTube(0.36, 0.034, 18, 7), { pos: [0, 0.06, 0.01], rot: [0.16, 0, -0.1] }),
      [0.98, 0.99, 1.0]
    ),
    paintMeshColors(
      transformMesh(extrudeStarPolygonMesh(4, 0.1, 0.042, 0.04, 0.01, false), {
        pos: [0, 0.26, 0.24],
        rot: [0.22, 0, 0]
      }),
      [1.0, 1.0, 1.0]
    )
  ];
  for (const sgn of [-1, 1] as const) {
    const antSpline = catmullRomSpline3(
      [
        [sgn * 0.1, 0.28, 0.02],
        [sgn * 0.22, 0.37, -0.02],
        [sgn * 0.14, 0.45, 0.04],
        [sgn * 0.24, 0.53, 0.01]
      ],
      3
    );
    parts.push(
      paintMeshColors(
        tubeSweepMesh(antSpline.map(([x, y, z], i) => [x, y, z, Math.max(0.018, 0.042 - i * 0.0025)] as V4), 7, false),
        [0.96, 0.98, 1.0]
      ),
      paintMeshColors(
        transformMesh(closedRingTube(0.052, 0.016, 10, 5), { pos: [sgn * 0.18, 0.41, 0.01], rot: [0.2, 0, sgn * -0.35] }),
        [1.0, 1.0, 1.0]
      ),
      paintMeshColors(
        transformMesh(icosphereSmoothMesh(0.064, 1, 0, 17), { pos: [sgn * 0.24, 0.54, 0.01] }),
        [1.0, 1.0, 1.0]
      )
    );
  }
  addPhantomHandsAndFaceRelief(parts, { eyeY: 0.13, eyeZ: 0.285, eyeSpread: 0.115, browTilt: 0.25, handReachZ: 0.26 });
  return finalizePhantomSpec(parts);
}

function buildSentrySkittishSpec(): AuraCustomGeometrySpec {
  // "dim" (Amber Monarch) — Regal 5-Spire King Phantom: 9-scallop royal robe, plush shoulder mantle & tall 5-point jeweled King Crown!
  const parts: RawMesh[] = [
    buildScallopedPhantomRobe({ lobes: 9, hemR: 0.41, bellyR: 0.37, headR: 0.32, topY: 0.31, flareCurl: 0.85 }),
    // Plush royal ermine-style shoulder mantle capelet
    paintMeshColors(
      subdivideSmoothMesh(
        latheMesh([[0.25, 0.0], [0.42, 0.04], [0.43, 0.12], [0.28, 0.17]], 16, false),
        1,
        0.5
      ),
      [0.98, 0.98, 1.0]
    ),
    // Royal King Crown circlet band + velvet cushion dome
    paintMeshColors(
      latheMesh([[0.2, 0.26], [0.255, 0.29], [0.27, 0.4], [0.21, 0.41]], 16, false),
      [1.0, 1.0, 1.0]
    ),
    paintMeshColors(
      subdivideSmoothMesh(latheMesh([[0.18, 0.34], [0.21, 0.42], [0.11, 0.48], [0, 0.5]], 12, false), 1, 0.5),
      [0.9, 0.9, 0.95]
    )
  ];
  for (let p = 0; p < 5; p += 1) {
    const a = (p / 5) * Math.PI * 2;
    const spire = latheMesh([[0, 0], [0.055, 0.02], [0.038, 0.1], [0, 0.16]], 7, false);
    parts.push(
      paintMeshColors(
        transformMesh(spire, {
          pos: [Math.sin(a) * 0.235, 0.38, Math.cos(a) * 0.235],
          rot: [Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18]
        }),
        [1.0, 1.0, 1.0]
      ),
      paintMeshColors(
        transformMesh(icosphereSmoothMesh(0.028, 0, 0, 7), {
          pos: [Math.sin(a) * 0.265, 0.54, Math.cos(a) * 0.265]
        }),
        [1.0, 1.0, 1.0]
      )
    );
  }
  addPhantomHandsAndFaceRelief(parts, { eyeY: 0.13, eyeZ: 0.3, eyeSpread: 0.125, browTilt: 0.1, handReachZ: 0.26 });
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
  // Pulsing Star-Core heart nestled inside the Glint Courier mascot's torso/star-pack (`coreHeight: 0.43`)
  const coreSpec = memoizeGeometry("dd-courier-core-v3", () =>
    mergeRawMeshes([
      subdivideSmoothMesh(icosphereSmoothMesh(0.11, 1, 0.02, 7, 0.2), 1, 0.52),
      transformMesh(extrudeStarPolygonMesh(5, 0.155, 0.082, 0.04, 0.008, false), {
        rot: [Math.PI * 0.5, 0, 0]
      }),
      transformMesh(closedRingTube(0.145, 0.016, 16, 6), { rot: [0.34, 0, -0.24] })
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
  // Toy-Grade 3D Arcade Mascot "Glint Courier" (Astro-Bot / Star-Runner caliber), hovering dynamically forward (+Z):
  // Visored Star-Runner Helmet + Swept Star-Wing Ears + Big Expressive Cyan Eyes & Pure-White Catchlights +
  // Billowing Scalloped Energy Capelet + Cuffed Hover-Gloves + Hovering Plasma Jet-Boots!
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
    roughness: 0.36,
    sheen: 0.92,
    sheenRoughness: 0.28,
    sheenColor: "#9cfaff",
    practical: true
  });
  const mats: readonly AuraMaterialSpec[] = [
    DD_MATERIALS.courierClearcoatShell, // 0: Electric Gold sculpted helmet, chest armor, cuffs & jet-boots
    DD_MATERIALS.courierBurnishedGold,  // 1: Burnished Gold ear-pods, shoulder clasps, belt & boot trim
    DD_MATERIALS.anisotropicTitanium,   // 2: Brushed gold-bronze thruster bells & collar bezel
    DD_MATERIALS.courierPorcelainTrim,  // 3: Glossy deep-obsidian face visor bay & boot soles
    DD_MATERIALS.statorBraidedGasket,   // 4: Woven midnight-teal star-runner undersuit limbs
    DD_MATERIALS.cyanThrusterPlasma,    // 5: Glowing Electric Cyan expressive eyes, brows, wingtips, cape trim & jet plumes
    catchlightWhiteMat,                 // 6: Crisp pure-white eye catchlights
    capeStarlightMat                    // 7: Vertex-gradient fluttering scalloped energy capelet
  ];

  const cached = memoizeGeometry("dd-courier-hover-pod-v3", () => {
    const slots: MultiMatSlot[] = [];

    const ovalStation = (rx: number, rz: number, y: number, n: number, zOff = 0, xOff = 0): V3[] => {
      const pts: V3[] = [];
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        pts.push([xOff + Math.sin(a) * rx, y, zOff + Math.cos(a) * rz]);
      }
      return pts;
    };

    // 1. Oversized Chibi/Astro-Bot Star-Runner Helmet (`sculptStylizedHeadMesh` + dorsal crest + swept Star-Wing ears)
    const helmetRaw = transformMesh(
      sculptStylizedHeadMesh(0.265, {
        jawTaper: 0.14,
        cheekFullness: 0.24,
        noseBridge: 0.02,
        browRidge: 0.08,
        subdivisions: 1,
        seed: 19
      }),
      { pos: [0, 0.8, 0.02], scale: [1.06, 0.98, 1.04] }
    );
    const paintedHelmet = bakeMeshCavityAO(
      paintMeshColors(helmetRaw, (pos, norm): V3 => {
        const t = Math.max(0, Math.min(1, (pos[1] - 0.56) / 0.48));
        const sun = Math.max(0, norm[1] * 0.14 + norm[2] * 0.08);
        return [
          Math.min(1, 0.92 + t * 0.08 + sun),
          Math.min(1, 0.84 + t * 0.14 + sun),
          Math.min(1, 0.72 + t * 0.22 + sun)
        ];
      }),
      0.25
    );
    slots.push({ mesh: paintedHelmet, materialIndex: 0 });

    // Dorsal swept Star-Runner Aero Crest arching over the crown
    const aeroCrest = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalStation(0.032, 0.05, 0.96, 8, 0.19),
          ovalStation(0.048, 0.085, 1.08, 8, 0.02),
          ovalStation(0.042, 0.095, 1.06, 8, -0.16),
          ovalStation(0.016, 0.035, 0.96, 8, -0.3)
        ],
        true,
        false
      ),
      1,
      0.48
    );
    slots.push({ mesh: bakeMeshCavityAO(aeroCrest, 0.22), materialIndex: 1 });
    const crestGlow = catmullRomSpline3([[0, 0.99, 0.2], [0, 1.1, 0.01], [0, 1.05, -0.22]], 3);
    slots.push({
      mesh: tubeSweepMesh(crestGlow.map(([x, y, z]) => [x, y, z, 0.022] as V4), 6, false),
      materialIndex: 5
    });

    // Swept Star-Wing Ear Fins & Headphone Pods (`±X`)
    for (const sgn of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(latheMesh([[0, -0.035], [0.095, -0.03], [0.105, 0.015], [0.07, 0.045], [0, 0.05]], 14, false), {
          pos: [sgn * 0.265, 0.79, 0.01],
          rot: [0, 0, sgn * -Math.PI * 0.5]
        }),
        materialIndex: 1
      });
      const wingEar = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ovalStation(0.028, 0.075, 0, 8, 0),
            ovalStation(0.032, 0.095, 0.12, 8, -0.06),
            ovalStation(0.022, 0.065, 0.24, 8, -0.15),
            ovalStation(0.008, 0.022, 0.33, 8, -0.24)
          ],
          true,
          false
        ),
        1,
        0.5
      );
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(wingEar, {
            pos: [sgn * 0.29, 0.8, 0.01],
            rot: [-0.22, sgn * -0.18, sgn * -0.58]
          }),
          0.24
        ),
        materialIndex: 0
      });
      // Glowing cyan wing-ear starlight leading edge
      const earTipGlow = catmullRomSpline3(
        [
          [sgn * 0.32, 0.83, 0.02],
          [sgn * 0.41, 0.92, -0.08],
          [sgn * 0.47, 1.0, -0.2]
        ],
        3
      );
      slots.push({
        mesh: tubeSweepMesh(earTipGlow.map(([x, y, z], i) => [x, y, z, Math.max(0.012, 0.022 - i * 0.002)] as V4), 6, false),
        materialIndex: 5
      });
    }

    // 2. Recessed Obsidian Face Screen + Big Expressive Cyan Arcade Eyes + Pure-White Catchlights
    const faceScreen = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalStation(0.18, 0.055, 0.67, 12, 0.21),
          ovalStation(0.215, 0.07, 0.78, 12, 0.225),
          ovalStation(0.185, 0.055, 0.89, 12, 0.205)
        ],
        true,
        false
      ),
      1,
      0.52
    );
    slots.push({ mesh: bakeMeshCavityAO(faceScreen, 0.25), materialIndex: 3 });

    for (const sgn of [-1, 1] as const) {
      const ex = sgn * 0.092;
      const ey = 0.785;
      const ez = 0.268;
      // Big expressive glowing cyan Astro-Bot oval eye
      slots.push({
        mesh: transformMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.056, 1, 0, 7), 1, 0.5), {
          pos: [ex, ey, ez],
          rot: [0, sgn * 0.18, sgn * -0.08],
          scale: [0.92, 1.26, 0.42]
        }),
        materialIndex: 5
      });
      // Dual pure-white catchlight gleams so the eyes sparkle behind the glass visor
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.02, 0, 0, 3), {
          pos: [ex - sgn * 0.016, ey + 0.028, ez + 0.024],
          scale: [1, 1, 0.45]
        }),
        materialIndex: 6
      });
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.011, 0, 0, 5), {
          pos: [ex + sgn * 0.018, ey - 0.024, ez + 0.023],
          scale: [1, 1, 0.45]
        }),
        materialIndex: 6
      });
      // Expressive heroic arched cyan brow tick
      const brow = catmullRomSpline3(
        [
          [sgn * 0.038, ey + 0.068, ez + 0.012],
          [ex, ey + 0.086, ez + 0.008],
          [sgn * 0.148, ey + 0.072, ez - 0.016]
        ],
        3
      );
      slots.push({
        mesh: tubeSweepMesh(brow.map(([x, y, z]) => [x, y, z, 0.013] as V4), 6, false),
        materialIndex: 5
      });
    }

    // 3. Compact Heroic Star-Runner Torso, Cinched Belt & Star-Core Bezel (`y = 0.28 .. 0.59`)
    const torsoMesh = bakeMeshCavityAO(
      paintMeshColors(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              ovalStation(0.135, 0.115, 0.28, 12, 0.0),
              ovalStation(0.175, 0.145, 0.39, 12, 0.015),
              ovalStation(0.19, 0.155, 0.51, 12, 0.02),
              ovalStation(0.13, 0.11, 0.59, 12, 0.015)
            ],
            true,
            false
          ),
          1,
          0.52
        ),
        (pos): V3 => {
          const v = Math.max(0, Math.min(1, (pos[1] - 0.28) / 0.32));
          return [0.9 + v * 0.1, 0.82 + v * 0.16, 0.72 + v * 0.2];
        }
      ),
      0.25
    );
    slots.push({ mesh: torsoMesh, materialIndex: 0 });

    // Cinched Burnished Gold utility belt + front 5-point Star-Core emblem bezel + glowing cyan heart
    slots.push({
      mesh: transformMesh(latheMesh([[0.15, 0.31], [0.188, 0.325], [0.188, 0.365], [0.15, 0.38]], 16, false), {
        pos: [0, 0, 0.01]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(extrudeStarPolygonMesh(5, 0.095, 0.048, 0.036, 0.008, false), {
        pos: [0, 0.47, 0.175],
        rot: [Math.PI * 0.5 - 0.08, 0, 0]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.042, 1, 0, 11), {
        pos: [0, 0.47, 0.192],
        scale: [1, 1, 0.55]
      }),
      materialIndex: 5
    });

    // 4. Fluttering Scalloped Energy Capelet (`loftSectionsMesh` + `subdivideSmoothMesh` + vertex gradient + AO)
    // Streams backward (-Z) from the shoulder mantle with 5 pleated waves & glowing cyan scalloped trim!
    const capeCols = 9;
    const capeStations: V3[][] = [];
    for (let s = 0; s < 5; s += 1) {
      const u = s / 4;
      const width = 0.18 + u * 0.24;
      const yBase = 0.56 - u * 0.21 + Math.sin(u * Math.PI) * 0.03;
      const zBase = -0.05 - u * 0.45;
      const thick = 0.022 * (1 - u * 0.35);
      const topRow: V3[] = [];
      const botRow: V3[] = [];
      for (let c = 0; c < capeCols; c += 1) {
        const w = (c / (capeCols - 1)) * 2 - 1; // -1 .. +1
        const pleat = Math.cos(w * Math.PI * 2.5) * 0.028 * u;
        const archY = (1 - w * w * 0.45) * 0.025 + pleat;
        const x = w * width;
        const z = zBase - (1 - w * w) * 0.045 * u;
        topRow.push([x, yBase + archY + thick, z]);
        botRow.unshift([x, yBase + archY - thick, z]);
      }
      capeStations.push([...topRow, ...botRow]);
    }
    const capeMesh = bakeMeshCavityAO(
      paintMeshColors(subdivideSmoothMesh(loftSectionsMesh(capeStations, true, false), 1, 0.48), (pos): V3 => {
        const trail = Math.max(0, Math.min(1, (-pos[2] - 0.05) / 0.46));
        // Royal sapphire-indigo at shoulders -> luminous electric cyan-gold starlight at the scalloped hem!
        return [
          0.18 + trail * 0.56,
          0.42 + trail * 0.54,
          0.88 + trail * 0.12
        ];
      }),
      0.25
    );
    slots.push({ mesh: capeMesh, materialIndex: 7 });

    // Glowing cyan scalloped trailing ribbon along the cape hem + Burnished Gold shoulder mantle & star brooches
    const capeHemRibbon = catmullRomSpline3(
      [
        [-0.4, 0.34, -0.48],
        [-0.2, 0.38, -0.52],
        [0, 0.34, -0.55],
        [0.2, 0.38, -0.52],
        [0.4, 0.34, -0.48]
      ],
      3
    );
    slots.push({
      mesh: tubeSweepMesh(capeHemRibbon.map(([x, y, z]) => [x, y, z, 0.018] as V4), 6, false),
      materialIndex: 5
    });
    slots.push({
      mesh: bakeMeshCavityAO(
        subdivideSmoothMesh(latheMesh([[0.13, 0.53], [0.225, 0.555], [0.215, 0.595], [0.135, 0.605]], 14, false), 1, 0.45),
        0.22
      ),
      materialIndex: 1
    });
    for (const sgn of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(extrudeStarPolygonMesh(5, 0.052, 0.025, 0.026, 0.006, false), {
          pos: [sgn * 0.145, 0.555, 0.115],
          rot: [Math.PI * 0.42, sgn * 0.25, 0]
        }),
        materialIndex: 1
      });
    }

    // 5. Sculpted Arms & Cuffed Toy-Grade Hover-Gloves + Anatomical Legs & Hovering Plasma Jet-Boots!
    for (const sgn of [-1, 1] as const) {
      // Dynamic asymmetric sprint pose: right arm/left boot forward, left arm/right boot trailing!
      const armFwd = sgn > 0 ? 0.15 : -0.09;
      const legFwd = sgn > 0 ? -0.06 : 0.08;

      const arm = subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [sgn * 0.185, 0.52, 0.01], rx: 0.052, rz: 0.052 },
            { pos: [sgn * 0.255, 0.44, armFwd * 0.45], rx: 0.046, rz: 0.046 },
            { pos: [sgn * 0.275, 0.39, armFwd], rx: 0.044, rz: 0.044 }
          ],
          { ringPoints: 8, capEnds: true }
        ),
        1,
        0.46
      );
      slots.push({ mesh: bakeMeshCavityAO(arm, 0.22), materialIndex: 4 });

      // Flared gauntlet cuff + plump rounded hover-mitten + thumb + cyan palm repulsor
      slots.push({
        mesh: transformMesh(latheMesh([[0.048, -0.03], [0.082, 0.01], [0.072, 0.045]], 12, false), {
          pos: [sgn * 0.27, 0.4, armFwd - (sgn > 0 ? 0.03 : -0.02)],
          rot: [sgn > 0 ? 0.85 : -0.45, 0, sgn * -0.25]
        }),
        materialIndex: 1
      });
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.076, 1, 0.01, 5), 1, 0.52), {
            pos: [sgn * 0.28, 0.375, armFwd + (sgn > 0 ? 0.04 : -0.02)],
            scale: [0.95, 0.92, 1.12]
          }),
          0.22
        ),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.032, 0, 0, 9), {
          pos: [sgn * 0.235, 0.395, armFwd + (sgn > 0 ? 0.055 : 0.0)]
        }),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.026, 0, 0, 3), {
          pos: [sgn * 0.28, 0.34, armFwd + (sgn > 0 ? 0.04 : -0.02)],
          scale: [1, 0.5, 1]
        }),
        materialIndex: 5
      });

      // Short athletic leg connecting hip to hovering jet-boot
      const leg = subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [sgn * 0.1, 0.3, 0.0], rx: 0.055, rz: 0.055 },
            { pos: [sgn * 0.125, 0.22, legFwd * 0.6], rx: 0.05, rz: 0.05 },
            { pos: [sgn * 0.135, 0.15, legFwd], rx: 0.048, rz: 0.048 }
          ],
          { ringPoints: 8, capEnds: true }
        ),
        1,
        0.46
      );
      slots.push({ mesh: bakeMeshCavityAO(leg, 0.22), materialIndex: 4 });

      // Toy-grade sculpted Hovering Jet-Boot (`loftSectionsMesh` + flared cuff + titanium nozzle + cyan plasma plume)
      const bootShell = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ovalStation(0.078, 0.115, 0.075, 10, legFwd + 0.035, sgn * 0.138),
            ovalStation(0.088, 0.132, 0.115, 10, legFwd + 0.04, sgn * 0.138),
            ovalStation(0.074, 0.095, 0.165, 10, legFwd + 0.015, sgn * 0.138),
            ovalStation(0.062, 0.072, 0.2, 10, legFwd + 0.005, sgn * 0.135)
          ],
          true,
          false
        ),
        1,
        0.52
      );
      slots.push({ mesh: bakeMeshCavityAO(bootShell, 0.25), materialIndex: 0 });
      slots.push({
        mesh: transformMesh(latheMesh([[0.062, 0], [0.092, 0.015], [0.088, 0.045], [0.064, 0.05]], 12, false), {
          pos: [sgn * 0.135, 0.175, legFwd + 0.005]
        }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(latheMesh([[0.035, 0.035], [0.076, 0.05], [0.078, 0.078], [0, 0.08]], 12, false), {
          pos: [sgn * 0.138, 0, legFwd + 0.03]
        }),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(latheMesh([[0, 0.005], [0.058, 0.025], [0.048, 0.052], [0, 0.055]], 10, false), {
          pos: [sgn * 0.138, 0, legFwd + 0.03]
        }),
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

    // Curved bubble Star-Runner optical visor dome over the glowing eyes (`castShadow: false`, ior 1.52, opacity 0.44)
    const visorDomeSpec = mergeRawMeshes([
      transformMesh(
        subdivideSmoothMesh(
          latheMesh([[0, 0.145], [0.12, 0.13], [0.205, 0.065], [0.225, 0]], 16, false),
          1,
          0.5
        ),
        { pos: [0, 0.785, 0.18], rot: [Math.PI * 0.5 - 0.06, 0, 0], scale: [1.08, 0.76, 0.88] }
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
