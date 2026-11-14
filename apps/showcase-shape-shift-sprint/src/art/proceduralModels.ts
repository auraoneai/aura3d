/**
 * WP-14 — Shape Shift Sprint (`apps/showcase-shape-shift-sprint`)
 * 100% Native `@aura3d/engine` 5.5.1 Sculpted Multi-Material Procedural 3D Art Library.
 *
 * Replaces every static Meshy clay `.glb` landmark (`toyCastleIsland`, `toyBlockTower`) and upgrades
 * the Toybox Skyway corridor with curved, multi-part, multi-material `@aura3d/engine` assemblies
 * (`geometry.define`, `geometry.multiMaterial`, `instances.custom`, zero `three` imports):
 * - Multi-lobe morph player forms (`player-0..2`) within the pinned `1.1 m` gameplay envelope,
 * - Sculpted shape-gate portals (`archwayVoussoirSlots` + `latticeTrussMesh` + `extrudePolygonMesh`
 *   glowing shape-stencil frames for Sphere/Cube/Pyramid/Torus + translucent prism lunettes),
 * - Floating storybook castle sky-islands (`stratifiedCliffMesh` + `material.strata` + turrets + conifers),
 * - Architectural toy-block spires & polyhedral gyroscopic shrine towers,
 * - Fluted viaduct bridge stations with kinetic trackside monoliths, gyroscopic rings & chevron boost pads,
 * - Instanced futuristic stadium/horizon pylons & faceted prism crystal clusters.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraMaterialSpec,
  type AuraTransformSpec
} from "@aura3d/engine";

type GroupNodeBuilder = ReturnType<typeof group>;
type GroupChildInput = NonNullable<Parameters<typeof group>[1]>[number];
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  computePositionsBounds,
  coniferBoughTierMesh,
  deformMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  layeredCanopyMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
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
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import { limbChainTagger, sculptSdfLimbChainMesh, splitMeshByTag, type SdfLimbChain } from "../../../showcase-port-shared/sdfLimbs";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Multi-Lobe Physical `@aura3d/engine` 5.5.1 Material Palette
// ---------------------------------------------------------------------------

export const SPRINT_MATERIALS = {
  sphereCarPaint: material.carPaint({
    name: "sss-sphere-car-paint",
    color: "#e8453c",
    roughness: 0.22,
    metallic: 0.54,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.5
  }),
  cubeClearcoat: material.clearcoatPaint({
    name: "sss-cube-clearcoat",
    color: "#f7c531",
    roughness: 0.075,
    metallic: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.018,
    envMapIntensity: 1.56
  }),
  coneLacquer: material.lacquer({
    name: "sss-cone-lacquer",
    color: "#2f6fe4",
    roughness: 0.2,
    metallic: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.024,
    envMapIntensity: 1.44
  }),
  creamCeramic: material.ceramic({
    name: "sss-cream-ceramic",
    color: "#fff4e2",
    roughness: 0.2,
    clearcoat: 0.82,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.22
  }),
  blushCeramic: material.ceramic({
    name: "sss-blush-ceramic",
    color: "#ffc2b8",
    roughness: 0.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.18
  }),
  mintCeramic: material.ceramic({
    name: "sss-mint-ceramic",
    color: "#b8f2dc",
    roughness: 0.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.18
  }),
  lilacCeramic: material.ceramic({
    name: "sss-lilac-ceramic",
    color: "#decaff",
    roughness: 0.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.18
  }),
  coralPaint: material.clearcoatPaint({
    name: "sss-coral-paint",
    color: "#ff7a6b",
    roughness: 0.09,
    metallic: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.024,
    envMapIntensity: 1.42
  }),
  ceruleanPaint: material.clearcoatPaint({
    name: "sss-cerulean-paint",
    color: "#3982f0",
    roughness: 0.09,
    metallic: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.024,
    envMapIntensity: 1.42
  }),
  solarPaint: material.clearcoatPaint({
    name: "sss-solar-paint",
    color: "#f9cb38",
    roughness: 0.085,
    metallic: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.022,
    envMapIntensity: 1.45
  }),
  rubyLacquer: material.lacquer({
    name: "sss-ruby-lacquer",
    color: "#e23d35",
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.32
  }),
  royalLacquer: material.lacquer({
    name: "sss-royal-lacquer",
    color: "#2b67dc",
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.32
  }),
  plumLacquer: material.lacquer({
    name: "sss-plum-lacquer",
    color: "#8e4ce0",
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.32
  }),
  brassStudioMetal: material.studioMetal({
    name: "sss-brass-studio-metal",
    color: "#f6cf7a",
    roughness: 0.16,
    metallic: 1,
    envMapIntensity: 1.45
  }),
  champagneStudioMetal: material.studioMetal({
    name: "sss-champagne-studio-metal",
    color: "#eef2f8",
    roughness: 0.14,
    metallic: 1,
    envMapIntensity: 1.5
  }),
  gantryBrushedMetal: material.studioMetal({
    name: "sss-gantry-brushed-metal",
    color: "#d4dfec",
    roughness: 0.22,
    metallic: 0.94,
    envMapIntensity: 1.38
  }),
  slateBrushedMetal: material.studioMetal({
    name: "sss-slate-brushed-metal",
    color: "#435068",
    roughness: 0.28,
    metallic: 0.9,
    envMapIntensity: 1.25
  }),
  skyIslandStrata: material.matteClay({
    name: "sss-sky-island-strata",
    color: "#c88766",
    roughness: 0.86
  }),
  meadowTurfPbr: material.pbr({
    name: "sss-meadow-turf",
    color: "#72c856",
    roughness: 0.78,
    metallic: 0,
    clearcoat: 0,
    sheen: 0
  }),
  coniferFoliagePbr: material.pbr({
    name: "sss-conifer-foliage",
    color: "#4da85b",
    roughness: 0.74,
    metallic: 0,
    clearcoat: 0,
    sheen: 0
  }),
  timberBarkPbr: material.pbr({
    name: "sss-timber-bark",
    color: "#8e5f44",
    roughness: 0.84,
    metallic: 0,
    clearcoat: 0,
    sheen: 0
  }),
  mineralPlinthPbr: material.pbr({
    name: "sss-mineral-plinth",
    color: "#e6dccf",
    roughness: 0.62,
    metallic: 0.04,
    clearcoat: 0,
    sheen: 0
  }),
  prismPortalPhysical: material.physical({
    name: "sss-prism-portal-glass",
    color: "#9ee8ff",
    roughness: 0.04,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.52
  }),
  rosePrismPhysical: material.physical({
    name: "sss-rose-prism-glass",
    color: "#ffc4f0",
    roughness: 0.05,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.52
  }),
  stencilSphereEmissive: material.emissive({
    name: "sss-stencil-sphere-glow",
    color: "#ff5a4f",
    emissive: "#ff5a4f",
    emissiveIntensity: 2.2,
    roughness: 0.2,
    practical: true
  }),
  stencilCubeEmissive: material.emissive({
    name: "sss-stencil-cube-glow",
    color: "#ffd84d",
    emissive: "#ffd84d",
    emissiveIntensity: 2.1,
    roughness: 0.2,
    practical: true
  }),
  stencilPyramidEmissive: material.emissive({
    name: "sss-stencil-pyramid-glow",
    color: "#4d94ff",
    emissive: "#4d94ff",
    emissiveIntensity: 2.25,
    roughness: 0.2,
    practical: true
  }),
  stencilTorusEmissive: material.emissive({
    name: "sss-stencil-torus-glow",
    color: "#c97bff",
    emissive: "#c97bff",
    emissiveIntensity: 2.3,
    roughness: 0.18,
    practical: true
  }),
  boostCyanEmissive: material.emissive({
    name: "sss-boost-cyan-glow",
    color: "#4be8ff",
    emissive: "#4be8ff",
    emissiveIntensity: 2.4,
    roughness: 0.18,
    practical: true
  }),
  instancedPylonMetal: material.metal({
    name: "sss-instanced-pylon-metal",
    color: "#dce7f5",
    roughness: 0.24,
    metallic: 0.9,
    clearcoat: 0,
    sheen: 0,
    envMapIntensity: 1.25
  }),
  instancedCrystalPbr: material.pbr({
    name: "sss-instanced-crystal-pbr",
    color: "#ffffff",
    roughness: 0.18,
    metallic: 0.12,
    clearcoat: 0,
    sheen: 0,
    envMapIntensity: 1.3
  }),
  tireBlackRubber: material.blackRubber({
    name: "sss-tire-black-rubber",
    color: "#1c212b",
    roughness: 0.8
  }),
  runnerSuitFabric: material.pbr({
    name: "sss-runner-suit-fabric",
    color: "#28324a",
    roughness: 0.56,
    metallic: 0.04,
    clearcoat: 0,
    sheen: 0.14,
    sheenRoughness: 0.65,
    envMapIntensity: 0.1
  }),
  cockpitSmokePaint: material.carPaint({
    name: "sss-cockpit-smoke-paint",
    color: "#1b2b48",
    roughness: 0.06,
    metallic: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.015,
    envMapIntensity: 1.65
  })
} as const;

/** Streak-free soft-shaded hero morph materials (zero noisy outdoor IBL reflections on close-up curved surfaces). */
const HERO_MORPH_MATERIALS = {
  runnerCrimson: material.pbr({
    name: "sss-hero-runner-crimson",
    color: "#e8453c",
    roughness: 0.48,
    metallic: 0.08,
    clearcoat: 0,
    sheen: 0.14,
    sheenRoughness: 0.62,
    envMapIntensity: 0.12
  }),
  coupeSolar: material.pbr({
    name: "sss-hero-coupe-solar",
    color: "#f7c531",
    roughness: 0.42,
    metallic: 0.12,
    clearcoat: 0.18,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.14
  }),
  gliderCobalt: material.pbr({
    name: "sss-hero-glider-cobalt",
    color: "#2f6fe4",
    roughness: 0.46,
    metallic: 0.14,
    clearcoat: 0,
    sheen: 0.1,
    sheenRoughness: 0.6,
    envMapIntensity: 0.12
  }),
  boatCoral: material.pbr({
    name: "sss-hero-boat-coral",
    color: "#ff7a6b",
    roughness: 0.44,
    metallic: 0.1,
    clearcoat: 0,
    sheen: 0.1,
    sheenRoughness: 0.6,
    envMapIntensity: 0.12
  }),
  rivalPlum: material.pbr({
    name: "sss-hero-rival-plum",
    color: "#8e4ce0",
    roughness: 0.44,
    metallic: 0.14,
    clearcoat: 0.18,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.14
  }),
  champagneTrim: material.pbr({
    name: "sss-hero-champagne-trim",
    color: "#eef2f8",
    roughness: 0.44,
    metallic: 0.82,
    clearcoat: 0,
    envMapIntensity: 0.14
  }),
  brassTrim: material.pbr({
    name: "sss-hero-brass-trim",
    color: "#f6cf7a",
    roughness: 0.46,
    metallic: 0.84,
    clearcoat: 0,
    envMapIntensity: 0.14
  }),
  slateTrim: material.pbr({
    name: "sss-hero-slate-trim",
    color: "#435068",
    roughness: 0.48,
    metallic: 0.78,
    clearcoat: 0,
    envMapIntensity: 0.12
  }),
  visorSmoke: material.pbr({
    name: "sss-hero-visor-smoke",
    color: "#1b2b48",
    roughness: 0.3,
    metallic: 0.18,
    clearcoat: 0.26,
    clearcoatRoughness: 0.24,
    envMapIntensity: 0.15
  })
} as const;


// ---------------------------------------------------------------------------
// Mesh Conversion, Bounding Normalization & Sculpted Sub-Assembly Helpers
// ---------------------------------------------------------------------------

export interface PlainMeshLike {
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
}

export function meshLikeToRaw(src: PlainMeshLike): RawMesh {
  return {
    positions: [...src.positions],
    normals: [...src.normals],
    uvs: [...src.uvs],
    indices: [...src.indices]
  };
}

export function mergeRawList(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let allAnalytic = parts.length > 0;
  for (const m of parts) {
    if (m.analyticNormals !== true) allAnalytic = false;
    const base = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + base);
  }
  return allAnalytic ? { positions, normals, uvs, indices, analyticNormals: true } : { positions, normals, uvs, indices };
}

export function rawBounds(mesh: RawMesh): { readonly min: [number, number, number]; readonly max: [number, number, number] } {
  return (
    computePositionsBounds(Float32Array.from(mesh.positions)) ?? {
      min: [0, 0, 0],
      max: [0, 0, 0]
    }
  );
}

/**
 * Grounds (`minY = 0`), centers X/Z (`cx = cz = 0`), and uniformly normalizes a multi-material
 * assembly (plus optional translucent glass child meshes) so its maximum AABB span equals `targetMaxDim`.
 */
export function normalizeGroundedAssembly(
  slots: readonly MultiMatSlot[],
  glassMeshes: readonly RawMesh[],
  targetMaxDim: number
): {
  readonly slots: MultiMatSlot[];
  readonly glassMeshes: RawMesh[];
  readonly bounds: { readonly min: [number, number, number]; readonly max: [number, number, number] };
} {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const visit = (m: RawMesh): void => {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  };
  for (const s of slots) visit(s.mesh);
  for (const g of glassMeshes) visit(g);
  if (!Number.isFinite(minX)) {
    return { slots: [...slots], glassMeshes: [...glassMeshes], bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
  }
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const span = Math.max(1e-4, maxX - minX, maxY - minY, maxZ - minZ);
  const k = targetMaxDim / span;
  const shiftAndScale = (m: RawMesh): RawMesh => {
    const shifted = transformMesh(m, { pos: [-cx, -minY, -cz] });
    return transformMesh(shifted, { scale: k });
  };
  return {
    slots: slots.map((s) => ({ mesh: shiftAndScale(s.mesh), materialIndex: s.materialIndex })),
    glassMeshes: glassMeshes.map(shiftAndScale),
    bounds: {
      min: [(minX - cx) * k, 0, (minZ - cz) * k],
      max: [(maxX - cx) * k, (maxY - minY) * k, (maxZ - cz) * k]
    }
  };
}

function regularPolygon2D(sides: number, radius: number, phase = 0): V2[] {
  const n = Math.max(3, Math.floor(sides));
  const out: V2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = phase + (i / n) * TAU;
    out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return out;
}

/**
 * Mitered hollow geometric stencil frame (`sides` = 24 circle/torus, 4 cube, 3 pyramid)
 * with bevelled outer metallic casing (`frameMat`) and recessed glowing inner liner (`glowMat`).
 */
function hollowPolygonFrameSlots(opts: {
  readonly sides: number;
  readonly rOuter: number;
  readonly rInner: number;
  readonly depth: number;
  readonly phase?: number;
  readonly pos?: V3;
  readonly frameMat: number;
  readonly glowMat: number;
}): MultiMatSlot[] {
  const n = Math.max(3, Math.floor(opts.sides));
  const phase = opts.phase ?? 0;
  const rMid = (opts.rOuter + opts.rInner) * 0.5;
  const outer = regularPolygon2D(n, opts.rOuter, phase);
  const mid = regularPolygon2D(n, rMid, phase);
  const inner = regularPolygon2D(n, opts.rInner, phase);
  const pos = opts.pos ?? [0, 0, 0];
  const slots: MultiMatSlot[] = [];

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const casingQuad: V2[] = [mid[i]!, outer[i]!, outer[j]!, mid[j]!];
    const glowQuad: V2[] = [inner[i]!, mid[i]!, mid[j]!, inner[j]!];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(casingQuad, opts.depth, opts.depth * 0.1, true), { pos }),
      materialIndex: opts.frameMat
    });
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(glowQuad, opts.depth * 0.78, opts.depth * 0.06, true), { pos }),
      materialIndex: opts.glowMat
    });
  }
  return slots;
}

/** Closed 3D Catmull-Rom + parallel-transport tube ring tilted in X/Z for kinetic gyroscopes & halos. */
function gyroRingRaw(radius: number, tubeR: number, tiltX = 0, tiltZ = 0, controlPts = 12): RawMesh {
  const ctrl: V3[] = [];
  for (let i = 0; i < controlPts; i += 1) {
    const a = (i / controlPts) * TAU;
    ctrl.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  const curve = catmullRomSpline3(ctrl, 3, true);
  curve.push(curve[0]!);
  const spine: V4[] = curve.map((p) => [p[0], p[1], p[2], tubeR]);
  return transformMesh(tubeSweepMesh(spine, 8, false), { rot: [tiltX, 0, tiltZ] });
}

/** Smooth cubic-Bezier lathed column/urn/monolith body (`y in [0, height]`). */
function bezierUrnRaw(rFoot: number, rBelly: number, rNeck: number, rLip: number, height: number, segs = 18): RawMesh {
  const lower = bezierCurve2([rFoot, 0], [rFoot * 1.08, height * 0.18], [rBelly, height * 0.36], [rBelly * 0.92, height * 0.56], 7);
  const upper = bezierCurve2([rBelly * 0.92, height * 0.56], [rNeck, height * 0.76], [rNeck * 0.95, height * 0.9], [rLip, height], 7);
  const profile: V2[] = [[0, 0], ...lower, ...upper.slice(1), [0, height]];
  return latheMesh(profile, segs, false);
}

/** Faceted hexagonal crystal prism cluster (`y >= 0`) with flat-shaded polyhedral refraction facets. */
export function hexPrismClusterRaw(scale = 1, seed = 13): RawMesh {
  const specs: readonly { readonly x: number; readonly z: number; readonly r: number; readonly h: number; readonly tiltX: number; readonly tiltZ: number }[] = [
    { x: 0, z: 0, r: 0.28 * scale, h: 1.35 * scale, tiltX: 0.04, tiltZ: -0.03 },
    { x: -0.24 * scale, z: 0.14 * scale, r: 0.2 * scale, h: 0.94 * scale, tiltX: -0.18, tiltZ: 0.22 },
    { x: 0.25 * scale, z: 0.12 * scale, r: 0.19 * scale, h: 0.88 * scale, tiltX: 0.16, tiltZ: -0.24 },
    { x: 0.05 * scale, z: -0.25 * scale, r: 0.18 * scale, h: 0.82 * scale, tiltX: -0.22, tiltZ: -0.08 },
    { x: -0.18 * scale, z: -0.2 * scale, r: 0.15 * scale, h: 0.64 * scale, tiltX: 0.2, tiltZ: 0.18 }
  ];
  const parts: RawMesh[] = [
    transformMesh(icosphereFacetMesh(0.32 * scale, 1, 0.14, seed), { pos: [0, 0.18 * scale, 0], scale: [1.15, 0.62, 1.15] })
  ];
  for (let sIdx = 0; sIdx < specs.length; sIdx += 1) {
    const sp = specs[sIdx]!;
    const yaw = hash01(seed * 19 + sIdx * 31) * TAU;
    const mkRing = (rad: number, y: number): V3[] => {
      const ring: V3[] = [];
      for (let i = 0; i < 6; i += 1) {
        const a = yaw + (i / 6) * TAU;
        const wob = 0.92 + hash01(seed * 43 + sIdx * 11 + i * 7) * 0.16;
        ring.push([Math.cos(a) * rad * wob, y, Math.sin(a) * rad * wob]);
      }
      return ring;
    };
    const crystal = toFlatShaded(
      loftSectionsMesh([mkRing(sp.r * 1.05, 0), mkRing(sp.r * 0.92, sp.h * 0.74), mkRing(sp.r * 0.04, sp.h)], true, true)
    );
    parts.push(transformMesh(crystal, { pos: [sp.x, 0.04 * scale, sp.z], rot: [sp.tiltX, 0, sp.tiltZ] }));
  }
  return mergeRawList(parts);
}


// ---------------------------------------------------------------------------
// 1. Sculpted Multi-Material Morph Player Forms (`player-0..2`) & Rival Pacers
// ---------------------------------------------------------------------------

function fitSlotsWithinEnvelope(
  slots: readonly MultiMatSlot[],
  maxSpanX: number,
  maxSpanY: number,
  emissiveMatIdx = 5
): MultiMatSlot[] {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const s of slots) {
    const p = s.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return [...slots];
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);
  const spanZ = Math.max(1e-4, maxZ - minZ);
  const capX = Math.min(1.09, maxSpanX);
  const capY = Math.min(1.09, maxSpanY);
  const capZ = Math.min(1.09, Math.max(capX, capY) * 1.04);
  const k = Math.min(1, capX / spanX, capY / spanY, capZ / spanZ);
  return slots.map((s) => {
    const fitted = transformMesh(transformMesh(s.mesh, { pos: [-cx, -cy, -cz] }), { scale: k });
    const shaded =
      s.materialIndex === emissiveMatIdx
        ? fitted
        : bakeMeshCavityAO(paintMeshColors(fitted, "#ffffff"), 0.24);
    return {
      mesh: shaded,
      materialIndex: s.materialIndex
    };
  });
}

/** Welded, Taubin-faired torus ring (`tubeSweepMesh` + `taubinSmoothMesh`) for seamless thruster & rotor halos. */
function smoothGyroRingRaw(
  radius: number,
  tubeR: number,
  tiltX = 0,
  tiltZ = 0,
  controlPts = 14,
  radialSegs = 10
): RawMesh {
  const ctrl: V3[] = [];
  for (let i = 0; i < controlPts; i += 1) {
    const a = (i / controlPts) * TAU;
    ctrl.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  const curve = catmullRomSpline3(ctrl, 3, true);
  curve.push(curve[0]!);
  const spine: V4[] = curve.map((p) => [p[0], p[1], p[2], tubeR]);
  const ring = taubinSmoothMesh(tubeSweepMesh(spine, radialSegs, false), 2, 0.44, -0.46);
  return transformMesh(ring, { rot: [tiltX, 0, tiltZ] });
}

/**
 * Lofts a cambered NACA-profile 3D airfoil (`rootLE..rootTE` -> `tipLE..tipTE`) with smooth welded normals
 * and Taubin surface fairing — eliminates flat-shaded polygon slabs & boxy primitives on wings, fins, and rotors.
 */
function sculptSweptAirfoilMesh(opts: {
  readonly rootLE: V3;
  readonly rootTE: V3;
  readonly tipLE: V3;
  readonly tipTE: V3;
  readonly rootThickness: number;
  readonly tipThickness: number;
  readonly camber?: number;
  readonly normalDir?: V3;
  readonly stations?: number;
  readonly ringPoints?: number;
  readonly smoothPasses?: number;
}): RawMesh {
  const stations = Math.max(4, Math.floor(opts.stations ?? 7));
  const ringPts = Math.max(12, Math.floor(opts.ringPoints ?? 16));
  const camber = opts.camber ?? 0.012;
  const rawUp = opts.normalDir ?? [0, 1, 0];
  const upLen = Math.hypot(rawUp[0], rawUp[1], rawUp[2]) || 1;
  const up: V3 = [rawUp[0] / upLen, rawUp[1] / upLen, rawUp[2] / upLen];

  const rings: V3[][] = [];
  for (let s = 0; s < stations; s += 1) {
    const u = s / (stations - 1);
    const le: V3 = [
      opts.rootLE[0] + (opts.tipLE[0] - opts.rootLE[0]) * u,
      opts.rootLE[1] + (opts.tipLE[1] - opts.rootLE[1]) * u,
      opts.rootLE[2] + (opts.tipLE[2] - opts.rootLE[2]) * u
    ];
    const te: V3 = [
      opts.rootTE[0] + (opts.tipTE[0] - opts.rootTE[0]) * u,
      opts.rootTE[1] + (opts.tipTE[1] - opts.rootTE[1]) * u,
      opts.rootTE[2] + (opts.tipTE[2] - opts.rootTE[2]) * u
    ];
    const tipRound = s === stations - 1 ? 0.55 : 1;
    const th = Math.max(0.004, (opts.rootThickness + (opts.tipThickness - opts.rootThickness) * u) * tipRound);
    const cam = camber * (1 - 0.35 * u);
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * TAU;
      const chordT = 0.5 * (1 - Math.cos(a));
      const nacaProfile =
        1.42 * Math.sqrt(Math.max(1e-4, chordT)) -
        0.58 * chordT -
        0.78 * chordT * chordT;
      const halfThick = Math.max(th * 0.08, th * 0.52 * nacaProfile);
      const camberOff = cam * 4 * chordT * (1 - chordT);
      const off = camberOff + Math.sin(a) * halfThick;
      ring.push([
        le[0] + (te[0] - le[0]) * chordT + up[0] * off,
        le[1] + (te[1] - le[1]) * chordT + up[1] * off,
        le[2] + (te[2] - le[2]) * chordT + up[2] * off
      ]);
    }
    rings.push(ring);
  }
  return taubinSmoothMesh(loftSectionsMesh(rings, true, false), opts.smoothPasses ?? 3, 0.44, -0.46);
}

function buildWingedSprintBootSlots(
  anklePos: V3,
  pitch: number,
  armorMat: number,
  wingMat: number,
  soleMat: number,
  glowMat: number
): MultiMatSlot[] {
  // Sculpted anatomical sprint-shoe upper (`sculptStreamlinedHullMesh` + `deformMesh` + `taubinSmoothMesh`)
  const rawShoeUpper = sculptStreamlinedHullMesh(0.215, 0.098, 0.092, {
    noseSharpness: 0.88,
    tailTaper: 0.48,
    canopyBulge: 0.32,
    undersideFlat: 0.84,
    stations: 11,
    ringPoints: 14
  });
  const sculptedUpper = taubinSmoothMesh(
    deformMesh(transformMesh(rawShoeUpper, { pos: [0, -0.028, -0.026], rot: [0, Math.PI, 0] }), ([x, y, z]) => {
      // Raise sculpted ankle collar at rear (`z > 0.01`) and sleek arched toe prow toward `-Z`
      const collarLift = z > -0.005 && y > -0.03 ? 0.036 * Math.exp(-Math.pow((z - 0.028) / 0.045, 2)) : 0;
      const instepArch = y < -0.045 ? 0.008 * Math.exp(-Math.pow((z + 0.015) / 0.045, 2)) : 0;
      return [x, y + collarLift + instepArch, z];
    }),
    4,
    0.48,
    -0.505
  );

  // Sculpted carbon-plate rocker outsole (replaces boxy `bevelBoxMesh` slab)
  const rockerSole = taubinSmoothMesh(
    deformMesh(
      transformMesh(
        sculptStreamlinedHullMesh(0.222, 0.096, 0.028, {
          noseSharpness: 0.82,
          tailTaper: 0.52,
          canopyBulge: 0.08,
          undersideFlat: 0.78,
          stations: 9,
          ringPoints: 12
        }),
        { pos: [0, -0.066, -0.026], rot: [0, Math.PI, 0] }
      ),
      ([x, y, z]) => {
        const toeSpring = z < -0.07 ? Math.pow((-z - 0.07) / 0.07, 1.6) * 0.014 : 0;
        return [x, y + toeSpring, z];
      }
    ),
    3,
    0.48,
    -0.505
  );

  // Recessed heel kinetic glow capsule
  const heelGlowPod = taubinSmoothMesh(
    transformMesh(
      sculptStreamlinedHullMesh(0.064, 0.056, 0.024, {
        noseSharpness: 0.65,
        tailTaper: 0.65,
        canopyBulge: 0.18,
        undersideFlat: 0.5,
        stations: 7,
        ringPoints: 10
      }),
      { pos: [0, -0.046, 0.064] }
    ),
    2,
    0.46,
    -0.48
  );

  const out: MultiMatSlot[] = [
    { mesh: transformMesh(sculptedUpper, { pos: anklePos, rot: [pitch, 0, 0] }), materialIndex: armorMat },
    { mesh: transformMesh(rockerSole, { pos: anklePos, rot: [pitch, 0, 0] }), materialIndex: soleMat },
    { mesh: transformMesh(heelGlowPod, { pos: anklePos, rot: [pitch, 0, 0] }), materialIndex: glowMat }
  ];

  // Swept curved Hermes ankle aero-winglets (`sculptCurvedHairLockMesh`)
  for (const wSide of [-1, 1] as const) {
    const wing = sculptCurvedHairLockMesh({
      root: [wSide * 0.042, -0.024, -0.004],
      mid: [wSide * 0.068, 0.014, 0.058],
      tip: [wSide * 0.084, 0.062, 0.125],
      width: 0.036,
      thickness: 0.014,
      segments: 8,
      radialSegments: 10
    });
    out.push({
      mesh: transformMesh(wing, { pos: anklePos, rot: [pitch, 0, 0] }),
      materialIndex: wingMat
    });
  }
  return out;
}

function buildGyroRunnerMorphSlots(): MultiMatSlot[] {
  // 0: sphereCarPaint (metallic crimson helmet, chest singlet & sprint shoes),
  // 1: runnerSuitFabric (sleek athletic compression sprint suit),
  // 2: champagneStudioMetal (silver-champagne aero crests, speed belt & Hermes wings),
  // 3: brassStudioMetal (Venturi micro-thruster bells),
  // 4: cockpitSmokePaint (smoked aero-visor dome & carbon rocker soles),
  // 5: boostCyanEmissive (glowing cyan HUD visor rim & thruster halos)
  const slots: MultiMatSlot[] = [];

  const headY = 0.365;
  const headZ = -0.045;

  // 1. Sculpted Stylized Head + Faired Teardrop Aero-Visor Sprint Helmet
  const neckMesh = taubinSmoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.275, -0.03], rx: 0.054, rz: 0.052 },
        { pos: [0, 0.312, -0.036], rx: 0.046, rz: 0.046 },
        { pos: [0, 0.348, -0.042], rx: 0.048, rz: 0.048 }
      ],
      { ringPoints: 14, capEnds: true }
    ),
    3,
    0.48,
    -0.505
  );
  slots.push({ mesh: neckMesh, materialIndex: 1 });

  const rawHead = sculptStylizedHeadMesh(0.116, {
    jawTaper: 0.3,
    cheekFullness: 0.1,
    browRidge: 0.12,
    noseBridge: 0.15,
    subdivisions: 2
  });
  const sweptHelm = taubinSmoothMesh(
    deformMesh(
      transformMesh(rawHead, { rot: [0.09, Math.PI, 0] }),
      ([x, y, z]) => {
        const aft = Math.max(0, z / 0.12);
        const taper = 1 - Math.min(0.48, aft * 0.3);
        return [x * taper * 0.95, y * 0.96 + aft * 0.016, z > 0 ? z * 1.44 + aft * 0.022 : z * 1.1];
      }
    ),
    4,
    0.48,
    -0.505
  );
  slots.push({
    mesh: transformMesh(sweptHelm, { pos: [0, headY, headZ] }),
    materialIndex: 0
  });

  // Faired aerodynamic chin guard (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`)
  const chinFairing = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.132, 0.118, 0.052, {
      noseSharpness: 0.85,
      tailTaper: 0.62,
      canopyBulge: 0.18,
      undersideFlat: 0.45,
      stations: 9,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );
  slots.push({
    mesh: transformMesh(chinFairing, {
      pos: [0, headY - 0.062, headZ - 0.044],
      rot: [0.22, Math.PI, 0]
    }),
    materialIndex: 2
  });

  // Curved smoked aero-visor shield (`loftSectionsMesh(..., true, false)` + `taubinSmoothMesh`) + glowing cyan HUD rim
  const visorStations: readonly [number, number, number][] = [
    [-0.028, 0.106, 0.088],
    [-0.004, 0.118, 0.118],
    [0.022, 0.112, 0.104],
    [0.042, 0.094, 0.078]
  ];
  const visorRings: V3[][] = visorStations.map(([vy, rx, rz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Wrap smoothly across `-Z` front (`sa < 0`) and tuck inside helmet shell (`sa > 0`)
      const zReach = sa < 0 ? rz * 1.18 : rz * 0.25;
      ring.push([ca * rx, vy, sa * zReach - 0.032]);
    }
    return ring;
  });
  const smokedVisorShield = taubinSmoothMesh(loftSectionsMesh(visorRings, true, false), 4, 0.46, -0.48);
  slots.push({
    mesh: transformMesh(smokedVisorShield, { pos: [0, headY, headZ], rot: [0.08, 0, 0] }),
    materialIndex: 4
  });

  // Swept glowing cyan HUD visor arc wrapping `-Z` brow & temples + rear telemetry capsule
  const visorArcPts = catmullRomSpline3(
    [
      [-0.108, headY + 0.012, headZ + 0.015],
      [-0.086, headY - 0.004, headZ - 0.092],
      [0, headY - 0.012, headZ - 0.136],
      [0.086, headY - 0.004, headZ - 0.092],
      [0.108, headY + 0.012, headZ + 0.015]
    ],
    4,
    false
  );
  const visorGlowBand = taubinSmoothMesh(
    tubeSweepMesh(
      visorArcPts.map((p, idx): V4 => {
        const u = idx / Math.max(1, visorArcPts.length - 1);
        const r = 0.012 + 0.007 * Math.sin(Math.PI * u);
        return [p[0], p[1], p[2], r];
      }),
      10,
      false
    ),
    2,
    0.44,
    -0.46
  );
  const rearHelmPod = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.068, 0.048, 0.024, {
      noseSharpness: 0.72,
      tailTaper: 0.72,
      canopyBulge: 0.2,
      undersideFlat: 0.4,
      stations: 7,
      ringPoints: 10
    }),
    2,
    0.46,
    -0.48
  );
  slots.push(
    { mesh: visorGlowBand, materialIndex: 5 },
    { mesh: transformMesh(rearHelmPod, { pos: [0, headY + 0.016, headZ + 0.162] }), materialIndex: 5 }
  );

  // Swept dorsal aero-crest & twin temple winglets (`sculptCurvedHairLockMesh`)
  slots.push({
    mesh: sculptCurvedHairLockMesh({
      root: [0, headY + 0.082, headZ - 0.055],
      mid: [0, headY + 0.132, headZ + 0.055],
      tip: [0, headY + 0.118, headZ + 0.205],
      width: 0.032,
      thickness: 0.046,
      segments: 9,
      radialSegments: 12
    }),
    materialIndex: 2
  });
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: sculptCurvedHairLockMesh({
        root: [side * 0.092, headY + 0.002, headZ - 0.012],
        mid: [side * 0.126, headY + 0.036, headZ + 0.072],
        tip: [side * 0.145, headY + 0.078, headZ + 0.168],
        width: 0.028,
        thickness: 0.016,
        segments: 8,
        radialSegments: 10
      }),
      materialIndex: 2
    });
  }

  // 2. Unified SDF-Sculpted Athletic Sprint Suit & Crimson Cuirass (`sculptOrganicSdfMesh`, `analyticNormals: true`, zero post-pass)
  const sprintSuit = sculptOrganicSdfMesh({
    boundsMin: [-0.22, -0.15, -0.16],
    boundsMax: [0.22, 0.32, 0.14],
    resolution: [22, 26, 22],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const ribcage = sdfEllipsoid(p, [0, 0.185, -0.02], [0.172, 0.105, 0.112]);
      const waist = sdfTaperedCapsule(p, [0, -0.055, 0.016], [0, 0.155, -0.014], 0.102, 0.132);
      const pelvis = sdfEllipsoid(p, [0, -0.078, 0.018], [0.114, 0.064, 0.086]);
      const neckCollar = sdfTaperedCapsule(p, [0, 0.225, -0.025], [0, 0.292, -0.032], 0.092, 0.058);
      return sminPoly(sminPoly(sminPoly(ribcage, waist, 0.048), pelvis, 0.042), neckCollar, 0.036);
    }
  });
  slots.push({ mesh: sprintSuit, materialIndex: 1 });

  const crimsonSinglet = sculptOrganicSdfMesh({
    boundsMin: [-0.22, 0.04, -0.17],
    boundsMax: [0.22, 0.29, 0.13],
    resolution: 22,
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const ax = Math.abs(x);
      const chest = sdfEllipsoid(p, [0, 0.185, -0.022], [0.184, 0.096, 0.12]);
      const pec = sdfEllipsoid([ax, y, z], [0.068, 0.192, -0.082], [0.072, 0.058, 0.055]);
      const lowerRib = sdfTaperedCapsule(p, [0, 0.078, -0.008], [0, 0.175, -0.018], 0.142, 0.168);
      const shell = sminPoly(sminPoly(chest, pec, 0.035), lowerRib, 0.04);
      const neckScoop = sdfEllipsoid(p, [0, 0.278, -0.052], [0.078, 0.045, 0.082]);
      return smaxPoly(shell, -neckScoop, 0.024);
    }
  });
  const speedBelt = sculptDrapedGarmentMesh(
    [
      { y: -0.082, rx: 0.118, rz: 0.09, z: 0.018, superellipseN: 2.3 },
      { y: -0.055, rx: 0.124, rz: 0.094, z: 0.015, superellipseN: 2.35 },
      { y: -0.028, rx: 0.11, rz: 0.084, z: 0.012, superellipseN: 2.25 }
    ],
    { ringPoints: 22, capEnds: true, smoothPasses: 4 }
  );
  slots.push(
    { mesh: crimsonSinglet, materialIndex: 0 },
    { mesh: speedBelt, materialIndex: 2 }
  );

  // Streamlined Teardrop Dorsal Speed-Cowling (`+Z` back) + Twin Venturi Micro-Thrusters
  const dorsalCowling = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.215, 0.185, 0.092, {
      noseSharpness: 0.78,
      tailTaper: 0.72,
      canopyBulge: 0.34,
      undersideFlat: 0.72,
      stations: 11,
      ringPoints: 14
    }),
    4,
    0.48,
    -0.505
  );
  slots.push({
    mesh: transformMesh(dorsalCowling, {
      pos: [0, 0.168, 0.095],
      rot: [Math.PI * 0.5 - 0.12, 0, 0]
    }),
    materialIndex: 2
  });

  const microBell = taubinSmoothMesh(
    latheMesh(
      [
        [0, 0],
        [0.04, 0],
        [0.05, 0.046],
        [0.036, 0.084],
        [0, 0.084]
      ],
      16,
      false
    ),
    2,
    0.44,
    -0.46
  );
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: sculptCurvedHairLockMesh({
          root: [side * 0.068, 0.175, 0.095],
          mid: [side * 0.145, 0.225, 0.135],
          tip: [side * 0.195, 0.278, 0.188],
          width: 0.034,
          thickness: 0.016,
          segments: 8,
          radialSegments: 10
        }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(microBell, {
          pos: [side * 0.06, 0.115, 0.128],
          rot: [Math.PI * 0.42, 0, -side * 0.1]
        }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(smoothGyroRingRaw(0.036, 0.01, Math.PI * 0.42, 0, 12, 8), {
          pos: [side * 0.064, 0.098, 0.194]
        }),
        materialIndex: 5
      }
    );
  }

  // Smooth glowing cyan dorsal spine energy core
  const spineCore = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.148, 0.034, 0.028, {
      noseSharpness: 0.85,
      tailTaper: 0.85,
      canopyBulge: 0.24,
      undersideFlat: 0.5,
      stations: 9,
      ringPoints: 10
    }),
    3,
    0.46,
    -0.48
  );
  slots.push({
    mesh: transformMesh(spineCore, {
      pos: [0, 0.175, 0.14],
      rot: [Math.PI * 0.5 - 0.12, 0, 0]
    }),
    materialIndex: 5
  });

  // 3. Smooth Anatomical Sprint Limbs (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh` + noise-free spherical joint bridges)
  const cupShellBase = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.056, 3 as 2, 0), ([x, y, z]) => [
      x * 1.12,
      y > 0 ? y * 0.92 : y * 0.52,
      z * 1.18
    ]),
    3,
    0.48,
    -0.505
  );
  const jointCupBase = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.035, 2, 0), ([x, y, z]) => [
      x * 0.95,
      y * 1.12,
      z * 0.85
    ]),
    2,
    0.46,
    -0.48
  );
  // One G1-continuous SDF surface per limb, split into material slots along shared vertices (no socket spheres).
  const pushLimbChain = (chain: SdfLimbChain, matByTag: Readonly<Record<number, number>>): void => {
    const parts = splitMeshByTag(sculptSdfLimbChainMesh(chain), limbChainTagger(chain));
    for (const [tag, mesh] of parts) slots.push({ mesh, materialIndex: matByTag[tag] ?? 1 });
  };
  const LIMB_CELL = 0.011;

  for (const side of [-1, 1] as const) {
    const shPos: V3 = [side * 0.186, 0.215, -0.018];
    const elbowPos: V3 = side < 0 ? [-0.236, 0.085, 0.068] : [0.232, 0.095, -0.065];
    const wristPos: V3 = side < 0 ? [-0.182, 0.145, -0.175] : [0.212, 0.005, 0.165];
    const midArm: V3 = [(shPos[0] + elbowPos[0]) * 0.5, (shPos[1] + elbowPos[1]) * 0.5, (shPos[2] + elbowPos[2]) * 0.5];
    const midFore: V3 = [(elbowPos[0] + wristPos[0]) * 0.5, (elbowPos[1] + wristPos[1]) * 0.5, (elbowPos[2] + wristPos[2]) * 0.5];

    // Cupped deltoid shoulder pad over a seamless SDF arm: deltoid -> bicep -> elbow -> crimson forearm -> mitten glove
    slots.push({
      mesh: transformMesh(cupShellBase, {
        pos: [shPos[0] + side * 0.01, shPos[1] + 0.018, shPos[2]],
        rot: [0.1, 0, -side * 0.48]
      }),
      materialIndex: 0
    });
    pushLimbChain(
      {
        cell: LIMB_CELL,
        blend: 0.02,
        capsules: [
          { a: [shPos[0] - side * 0.02, shPos[1] + 0.004, shPos[2]], b: shPos, ra: 0.05, rb: 0.052, tag: 0 },
          { a: shPos, b: midArm, ra: 0.052, rb: 0.049, tag: 0 },
          { a: midArm, b: elbowPos, ra: 0.049, rb: 0.04, tag: 0 },
          { a: elbowPos, b: midFore, ra: 0.041, rb: 0.047, tag: 1 },
          { a: midFore, b: wristPos, ra: 0.047, rb: 0.034, tag: 1 }
        ],
        hands: [
          {
            wrist: wristPos,
            dir: [wristPos[0] - elbowPos[0], wristPos[1] - elbowPos[1] - 0.03, wristPos[2] - elbowPos[2]],
            palm: [-side, 0, 0],
            radius: 0.03,
            thumbSide: side < 0 ? 1 : -1,
            tag: 2
          }
        ]
      },
      { 0: 1, 1: 0, 2: 1 }
    );
    slots.push({ mesh: transformMesh(jointCupBase, { pos: elbowPos }), materialIndex: 2 });

    // Contra-lateral athletic sprint legs (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh` + spherical hip joint)
    const legFwd = side < 0;
    const hipPos: V3 = [side * 0.092, -0.082, 0.018];
    const kneePos: V3 = legFwd ? [-0.1, -0.245, -0.115] : [0.1, -0.265, 0.095];
    const anklePos: V3 = legFwd ? [-0.098, -0.425, -0.055] : [0.098, -0.395, 0.215];
    const midThigh: V3 = [(hipPos[0] + kneePos[0]) * 0.5, (hipPos[1] + kneePos[1]) * 0.5, (hipPos[2] + kneePos[2]) * 0.5 - 0.012];
    const midCalf: V3 = [(kneePos[0] + anklePos[0]) * 0.5, (kneePos[1] + anklePos[1]) * 0.5, (kneePos[2] + anklePos[2]) * 0.5 + 0.015];

    // Seamless SDF leg: glute -> thigh -> knee -> crimson calf -> ankle (blends under the winged sprint boot collar)
    pushLimbChain(
      {
        cell: LIMB_CELL,
        blend: 0.024,
        capsules: [
          { a: [hipPos[0] * 0.55, hipPos[1] + 0.012, hipPos[2]], b: hipPos, ra: 0.066, rb: 0.07, tag: 0 },
          { a: hipPos, b: midThigh, ra: 0.07, rb: 0.068, tag: 0 },
          { a: midThigh, b: kneePos, ra: 0.068, rb: 0.049, tag: 0 },
          { a: kneePos, b: midCalf, ra: 0.049, rb: 0.056, tag: 1 },
          { a: midCalf, b: anklePos, ra: 0.056, rb: 0.037, tag: 1 }
        ]
      },
      { 0: 1, 1: 0 }
    );
    slots.push(
      {
        mesh: transformMesh(jointCupBase, {
          pos: [kneePos[0], kneePos[1] + 0.006, kneePos[2] - 0.026],
          rot: [0.18, 0, 0],
          scale: [1.18, 1.24, 1.08]
        }),
        materialIndex: 2
      },
      ...buildWingedSprintBootSlots(anklePos, legFwd ? 0.08 : -0.34, 0, 2, 4, 5)
    );
  }

  return slots;
}

function buildCockpitPilotBustSlots(
  pos: V3,
  scale: number,
  helmMat: number,
  visorGlowMat: number
): MultiMatSlot[] {
  const head = sculptStylizedHeadMesh(0.095 * scale, {
    jawTaper: 0.3,
    cheekFullness: 0.09,
    browRidge: 0.12,
    subdivisions: 2
  });
  const swept = taubinSmoothMesh(
    deformMesh(transformMesh(head, { rot: [0.08, Math.PI, 0] }), ([x, y, z]) => [
      x * 0.94,
      y * 0.95,
      z > 0 ? z * 1.32 : z * 1.08
    ]),
    3,
    0.48,
    -0.505
  );
  const shoulders = transformMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.125 * scale, rx: 0.122 * scale, rz: 0.078 * scale, z: 0.015 * scale, superellipseN: 2.2 },
        { y: -0.075 * scale, rx: 0.108 * scale, rz: 0.07 * scale, z: 0.012 * scale, superellipseN: 2.2 },
        { y: -0.035 * scale, rx: 0.054 * scale, rz: 0.048 * scale, z: 0.008 * scale, superellipseN: 2.05 }
      ],
      { ringPoints: 14, capEnds: true, smoothPasses: 3 }
    ),
    { pos }
  );
  const visor = transformMesh(
    taubinSmoothMesh(
      sculptStreamlinedHullMesh(0.068 * scale, 0.152 * scale, 0.042 * scale, {
        noseSharpness: 0.82,
        tailTaper: 0.65,
        canopyBulge: 0.24,
        undersideFlat: 0.4,
        stations: 8,
        ringPoints: 12
      }),
      3,
      0.46,
      -0.48
    ),
    {
      pos: [pos[0], pos[1] + 0.004 * scale, pos[2] - 0.082 * scale],
      rot: [0.12, Math.PI, 0]
    }
  );
  return [
    { mesh: shoulders, materialIndex: helmMat },
    { mesh: transformMesh(swept, { pos }), materialIndex: helmMat },
    { mesh: visor, materialIndex: visorGlowMat }
  ];
}

function buildSolarGtCoupeMorphSlots(): MultiMatSlot[] {
  // 0: cubeClearcoat (solar GT body), 1: cockpitSmokePaint, 2: tireBlackRubber, 3: champagneStudioMetal, 4: slateBrushedMetal, 5: stencilCubeEmissive
  const slots: MultiMatSlot[] = [];

  // Sleek SDF-sculpted GT hypercar monocoque oriented nose-forward toward -Z (`sculptOrganicSdfMesh`, `analyticNormals: true`, zero post-pass)
  const bodyHull = sculptOrganicSdfMesh({
    boundsMin: [-0.48, -0.22, -0.74],
    boundsMax: [0.48, 0.22, 0.74],
    resolution: [22, 22, 26],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const core = sdfTaperedCapsule(p, [0, -0.045, -0.52], [0, -0.015, 0.48], 0.2, 0.255);
      const cabinSwell = sdfEllipsoid(p, [0, 0.02, -0.02], [0.41, 0.165, 0.56]);
      const noseWedge = sdfEllipsoid(p, [0, -0.065, -0.44], [0.38, 0.095, 0.28]);
      const rearHaunch = sdfEllipsoid(p, [0, -0.01, 0.36], [0.43, 0.145, 0.31]);
      const blended = sminPoly(sminPoly(sminPoly(core, cabinSwell, 0.065), noseWedge, 0.06), rearHaunch, 0.06);
      const flatFloor = -y - 0.165;
      return smaxPoly(blended, flatFloor, 0.028);
    }
  });
  slots.push({
    mesh: bodyHull,
    materialIndex: 0
  });

  // Sculpted widebody front & rear aero fenders + streamlined Venturi intake pods & ground-effect skirts
  const fenderArchBase = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.44, 0.17, 0.195, {
      noseSharpness: 0.68,
      tailTaper: 0.68,
      canopyBulge: 0.34,
      undersideFlat: 0.88,
      stations: 11,
      ringPoints: 14
    }),
    4,
    0.48,
    -0.505
  );
  const sideVenturiPod = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.42, 0.105, 0.118, {
      noseSharpness: 0.84,
      tailTaper: 0.58,
      canopyBulge: 0.24,
      undersideFlat: 0.78,
      stations: 10,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );
  const sideSkirtBlade = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.72, 0.072, 0.048, {
      noseSharpness: 0.76,
      tailTaper: 0.76,
      canopyBulge: 0.14,
      undersideFlat: 0.86,
      stations: 9,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );

  for (const side of [-1, 1] as const) {
    for (const zAxle of [-0.39, 0.39] as const) {
      slots.push({
        mesh: transformMesh(fenderArchBase, { pos: [side * 0.39, -0.05, zAxle], rot: [0, Math.PI, 0] }),
        materialIndex: 0
      });
    }
    slots.push(
      {
        mesh: transformMesh(sideVenturiPod, {
          pos: [side * 0.402, -0.04, 0.04],
          rot: [0, Math.PI - side * 0.08, 0]
        }),
        materialIndex: 4
      },
      {
        mesh: transformMesh(sideSkirtBlade, { pos: [side * 0.414, -0.15, 0], rot: [0, Math.PI, 0] }),
        materialIndex: 4
      }
    );
  }

  // Contoured wraparound smoked glass GT cockpit dome + visible helmeted pilot bust & glowing HUD visor
  const canopy = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptStreamlinedHullMesh(0.68, 0.54, 0.23, {
        noseSharpness: 0.92,
        tailTaper: 0.68,
        canopyBulge: 0.3,
        undersideFlat: 0.9,
        stations: 12,
        ringPoints: 16
      }),
      1,
      0.45
    ),
    4,
    0.48,
    -0.505
  );
  const roofRamScoop = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.26, 0.118, 0.062, {
      noseSharpness: 0.86,
      tailTaper: 0.68,
      canopyBulge: 0.3,
      undersideFlat: 0.85,
      stations: 9,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );
  const dorsalSharkFin = sculptSweptAirfoilMesh({
    rootLE: [0, 0.18, 0.14],
    rootTE: [0, 0.16, 0.48],
    tipLE: [0, 0.295, 0.24],
    tipTE: [0, 0.285, 0.46],
    rootThickness: 0.024,
    tipThickness: 0.012,
    camber: 0,
    normalDir: [1, 0, 0],
    stations: 6,
    ringPoints: 14
  });

  slots.push(
    {
      mesh: transformMesh(canopy, { pos: [0, 0.135, 0.02], rot: [0, Math.PI, 0] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(roofRamScoop, { pos: [0, 0.245, 0.12], rot: [-0.08, Math.PI, 0] }),
      materialIndex: 3
    },
    {
      mesh: dorsalSharkFin,
      materialIndex: 3
    },
    ...buildCockpitPilotBustSlots([0, 0.195, -0.05], 0.72, 3, 5)
  );

  // Sculpted cambered front aero splitter + recessed hood NACA cowl + rear Venturi diffuser + cambered GT rear wing
  const frontSplitter = sculptSweptAirfoilMesh({
    rootLE: [-0.42, -0.158, -0.68],
    rootTE: [-0.42, -0.15, -0.49],
    tipLE: [0.42, -0.158, -0.68],
    tipTE: [0.42, -0.15, -0.49],
    rootThickness: 0.028,
    tipThickness: 0.028,
    camber: -0.008,
    normalDir: [0, 1, 0],
    stations: 7,
    ringPoints: 14
  });
  const hoodNacaCowl = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.25, 0.34, 0.032, {
      noseSharpness: 0.9,
      tailTaper: 0.55,
      canopyBulge: 0.22,
      undersideFlat: 0.75,
      stations: 8,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );
  const rearDiffuser = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.2, 0.78, 0.078, {
      noseSharpness: 0.65,
      tailTaper: 0.58,
      canopyBulge: 0.2,
      undersideFlat: 0.82,
      stations: 9,
      ringPoints: 14
    }),
    3,
    0.48,
    -0.505
  );
  const gtRearWing = sculptSweptAirfoilMesh({
    rootLE: [-0.43, 0.242, 0.455],
    rootTE: [-0.43, 0.264, 0.64],
    tipLE: [0.43, 0.242, 0.455],
    tipTE: [0.43, 0.264, 0.64],
    rootThickness: 0.03,
    tipThickness: 0.026,
    camber: -0.014,
    normalDir: [0, 1, 0],
    stations: 8,
    ringPoints: 16
  });

  slots.push(
    { mesh: frontSplitter, materialIndex: 4 },
    { mesh: transformMesh(hoodNacaCowl, { pos: [0, 0.09, -0.36], rot: [0.18, Math.PI, 0] }), materialIndex: 4 },
    { mesh: transformMesh(rearDiffuser, { pos: [0, -0.132, 0.59] }), materialIndex: 4 },
    { mesh: gtRearWing, materialIndex: 4 }
  );

  const exhaustBell = taubinSmoothMesh(
    latheMesh(
      [
        [0, 0],
        [0.048, 0],
        [0.056, 0.06],
        [0.044, 0.1],
        [0, 0.1]
      ],
      16,
      false
    ),
    2,
    0.44,
    -0.46
  );
  for (const side of [-1, 1] as const) {
    const swanNeckStrut = sculptSweptAirfoilMesh({
      rootLE: [side * 0.23, 0.075, 0.45],
      rootTE: [side * 0.23, 0.075, 0.57],
      tipLE: [side * 0.24, 0.248, 0.48],
      tipTE: [side * 0.24, 0.252, 0.58],
      rootThickness: 0.026,
      tipThickness: 0.02,
      camber: side * 0.004,
      normalDir: [1, 0, 0],
      stations: 6,
      ringPoints: 12
    });
    const wingEndplate = sculptSweptAirfoilMesh({
      rootLE: [side * 0.435, 0.182, 0.45],
      rootTE: [side * 0.435, 0.19, 0.65],
      tipLE: [side * 0.435, 0.305, 0.47],
      tipTE: [side * 0.435, 0.308, 0.66],
      rootThickness: 0.022,
      tipThickness: 0.016,
      camber: 0,
      normalDir: [1, 0, 0],
      stations: 5,
      ringPoints: 12
    });
    slots.push(
      { mesh: swanNeckStrut, materialIndex: 3 },
      { mesh: wingEndplate, materialIndex: 0 },
      {
        mesh: transformMesh(exhaustBell, { pos: [side * 0.145, -0.105, 0.58], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(smoothGyroRingRaw(0.042, 0.01, Math.PI * 0.5, 0, 12, 8), { pos: [side * 0.145, -0.105, 0.675] }),
        materialIndex: 5
      }
    );
  }

  // Swept curved LED blade headlamps (-Z) & wraparound cyber GT lightbar (+Z)
  for (const side of [-1, 1] as const) {
    const headlampArc = catmullRomSpline3(
      [
        [side * 0.17, -0.032, -0.642],
        [side * 0.265, -0.018, -0.618],
        [side * 0.355, 0.002, -0.562]
      ],
      4,
      false
    );
    const headlampBlade = taubinSmoothMesh(
      tubeSweepMesh(
        headlampArc.map((p, idx): V4 => {
          const u = idx / Math.max(1, headlampArc.length - 1);
          return [p[0], p[1], p[2], 0.014 + 0.008 * Math.sin(Math.PI * u)];
        }),
        10,
        false
      ),
      2,
      0.44,
      -0.46
    );
    slots.push({ mesh: headlampBlade, materialIndex: 5 });
  }
  const tailLightArc = catmullRomSpline3(
    [
      [-0.365, 0.036, 0.605],
      [-0.18, 0.038, 0.634],
      [0, 0.04, 0.642],
      [0.18, 0.038, 0.634],
      [0.365, 0.036, 0.605]
    ],
    4,
    false
  );
  slots.push({
    mesh: taubinSmoothMesh(
      tubeSweepMesh(tailLightArc.map((p): V4 => [p[0], p[1], p[2], 0.018]), 10, false),
      2,
      0.44,
      -0.46
    ),
    materialIndex: 5
  });

  // 4 forged alloy performance wheels (`wheelAssemblySlots`: rubber tire + alloy spokes + rotor/caliper)
  const wheelBase = wheelAssemblySlots({
    radius: 0.158,
    width: 0.108,
    tireMat: 2,
    rimMat: 3,
    spokeCount: 5,
    rotorMat: 4
  });
  for (const side of [-1, 1] as const) {
    for (const zAxle of [-0.39, 0.39] as const) {
      for (const ws of wheelBase) {
        slots.push({
          mesh: transformMesh(ws.mesh, {
            pos: [side * 0.398, -0.145, zAxle],
            rot: [0, side < 0 ? Math.PI : 0, 0]
          }),
          materialIndex: ws.materialIndex
        });
      }
    }
  }

  return slots;
}

function buildAeroGliderRotorMorphSlots(): MultiMatSlot[] {
  // 0: coneLacquer (cobalt fuselage & delta wings), 1: champagneStudioMetal, 2: brassStudioMetal, 3: slateBrushedMetal, 4: cockpitSmokePaint, 5: boostCyanEmissive
  const slots: MultiMatSlot[] = [];

  // Sleek SDF-sculpted supersonic stealth fuselage oriented nose-forward along -Z (`sculptOrganicSdfMesh`, `analyticNormals: true`, zero post-pass)
  const fuselage = sculptOrganicSdfMesh({
    boundsMin: [-0.28, -0.2, -0.74],
    boundsMax: [0.28, 0.22, 0.74],
    resolution: [22, 22, 26],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const spine = sdfTaperedCapsule(p, [0, -0.02, -0.58], [0, -0.015, 0.52], 0.075, 0.145);
      const chineBody = sdfEllipsoid(p, [0, -0.015, 0.04], [0.21, 0.135, 0.62]);
      const dorsalSpine = sdfEllipsoid(p, [0, 0.045, 0.08], [0.125, 0.12, 0.46]);
      const blended = sminPoly(sminPoly(spine, chineBody, 0.055), dorsalSpine, 0.05);
      const bellyPlane = -y - 0.135;
      return smaxPoly(blended, bellyPlane, 0.025);
    }
  });
  slots.push({
    mesh: fuselage,
    materialIndex: 0
  });

  // Precision lathed & Taubin-faired brass pitot/radome nose cone at -Z
  const radome = taubinSmoothMesh(
    latheMesh(
      [
        [0, 0],
        [0.095, 0],
        [0.068, 0.11],
        [0.024, 0.21],
        [0, 0.24]
      ],
      20,
      false
    ),
    2,
    0.44,
    -0.46
  );
  slots.push({
    mesh: transformMesh(radome, { pos: [0, -0.02, -0.58], rot: [-Math.PI * 0.5, 0, 0] }),
    materialIndex: 2
  });

  // Bubble fighter cockpit canopy + visible helmeted flight pilot & glowing cyan HUD visor
  const canopy = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptStreamlinedHullMesh(0.56, 0.25, 0.18, {
        noseSharpness: 0.95,
        tailTaper: 0.85,
        canopyBulge: 0.36,
        undersideFlat: 0.85,
        stations: 11,
        ringPoints: 16
      }),
      1,
      0.48
    ),
    4,
    0.48,
    -0.505
  );
  slots.push(
    {
      mesh: transformMesh(canopy, { pos: [0, 0.108, -0.11], rot: [0, Math.PI, 0] }),
      materialIndex: 4
    },
    ...buildCockpitPilotBustSlots([0, 0.145, -0.12], 0.64, 1, 5)
  );

  // Cambered 3D Airfoil Forward Canards + Swept Cranked-Arrow Delta Wings + Wingtip Ducted Rotors + Canted V-Tails
  const tipRotorBlade = sculptSweptAirfoilMesh({
    rootLE: [-0.092, 0, -0.014],
    rootTE: [-0.092, 0, 0.014],
    tipLE: [0.092, 0, -0.012],
    tipTE: [0.092, 0, 0.012],
    rootThickness: 0.009,
    tipThickness: 0.006,
    camber: 0.003,
    normalDir: [0, 1, 0],
    stations: 5,
    ringPoints: 12
  });
  const tipSpinner = taubinSmoothMesh(
    latheMesh([[0, 0], [0.034, 0], [0.026, 0.055], [0, 0.064]], 14, false),
    2,
    0.44,
    -0.46
  );

  for (const side of [-1, 1] as const) {
    const canard = sculptSweptAirfoilMesh({
      rootLE: [side * 0.08, -0.015, -0.44],
      rootTE: [side * 0.08, -0.015, -0.29],
      tipLE: [side * 0.26, -0.008, -0.31],
      tipTE: [side * 0.24, -0.008, -0.235],
      rootThickness: 0.024,
      tipThickness: 0.012,
      camber: 0.005,
      normalDir: [0, 1, 0],
      stations: 6,
      ringPoints: 14
    });
    const deltaWing = sculptSweptAirfoilMesh({
      rootLE: [side * 0.115, -0.032, -0.22],
      rootTE: [side * 0.11, -0.036, 0.45],
      tipLE: [side * 0.525, -0.02, 0.27],
      tipTE: [side * 0.5, -0.022, 0.47],
      rootThickness: 0.042,
      tipThickness: 0.018,
      camber: 0.009,
      normalDir: [0, 1, 0],
      stations: 8,
      ringPoints: 16
    });
    const leadingPlasmaStrake = sculptSweptAirfoilMesh({
      rootLE: [side * 0.14, -0.028, -0.19],
      rootTE: [side * 0.145, -0.028, -0.12],
      tipLE: [side * 0.51, -0.018, 0.27],
      tipTE: [side * 0.485, -0.018, 0.33],
      rootThickness: 0.022,
      tipThickness: 0.014,
      camber: 0.004,
      normalDir: [0, 1, 0],
      stations: 6,
      ringPoints: 12
    });
    const cantedVTail = sculptSweptAirfoilMesh({
      rootLE: [side * 0.115, 0.035, 0.26],
      rootTE: [side * 0.115, 0.035, 0.54],
      tipLE: [side * 0.275, 0.295, 0.41],
      tipTE: [side * 0.265, 0.295, 0.57],
      rootThickness: 0.028,
      tipThickness: 0.014,
      camber: 0,
      normalDir: [Math.cos(0.54), side * Math.sin(0.54), 0],
      stations: 6,
      ringPoints: 14
    });

    slots.push(
      { mesh: canard, materialIndex: 1 },
      { mesh: deltaWing, materialIndex: 0 },
      { mesh: leadingPlasmaStrake, materialIndex: 5 },
      { mesh: cantedVTail, materialIndex: 1 }
    );

    // Wingtip shrouded tilt-rotor nacelle (`x = ±0.43, z = 0.34`) with smooth annular shroud & cambered airfoil blades
    const rotorX = side * 0.43;
    const rotorZ = 0.34;
    slots.push(
      { mesh: transformMesh(smoothGyroRingRaw(0.115, 0.02, 0, 0, 14, 10), { pos: [rotorX, -0.02, rotorZ] }), materialIndex: 1 },
      { mesh: transformMesh(smoothGyroRingRaw(0.102, 0.009, 0, 0, 12, 8), { pos: [rotorX, 0.002, rotorZ] }), materialIndex: 5 },
      { mesh: transformMesh(tipSpinner, { pos: [rotorX, -0.04, rotorZ] }), materialIndex: 2 }
    );
    for (let rb = 0; rb < 3; rb += 1) {
      slots.push({
        mesh: transformMesh(tipRotorBlade, {
          pos: [rotorX, -0.018, rotorZ],
          rot: [0.14, (rb / 3) * Math.PI + 0.25, 0]
        }),
        materialIndex: 3
      });
    }
  }

  // Shrouded dorsal turbo-rotor lift fan + 4 sculpted airfoil rotor blades
  const dorsalBlade = sculptSweptAirfoilMesh({
    rootLE: [-0.158, 0, -0.018],
    rootTE: [-0.158, 0, 0.018],
    tipLE: [0.158, 0, -0.015],
    tipTE: [0.158, 0, 0.015],
    rootThickness: 0.012,
    tipThickness: 0.008,
    camber: 0.004,
    normalDir: [0, 1, 0],
    stations: 6,
    ringPoints: 12
  });
  slots.push(
    { mesh: transformMesh(smoothGyroRingRaw(0.185, 0.022, 0, 0, 16, 10), { pos: [0, 0.168, 0.22] }), materialIndex: 1 },
    { mesh: transformMesh(smoothGyroRingRaw(0.168, 0.01, 0, 0, 14, 8), { pos: [0, 0.182, 0.22] }), materialIndex: 5 },
    {
      mesh: transformMesh(
        taubinSmoothMesh(
          latheMesh(
            [
              [0, 0],
              [0.055, 0],
              [0.045, 0.075],
              [0, 0.085]
            ],
            16,
            false
          ),
          2,
          0.44,
          -0.46
        ),
        { pos: [0, 0.14, 0.22] }
      ),
      materialIndex: 2
    }
  );
  for (let b = 0; b < 4; b += 1) {
    slots.push({
      mesh: transformMesh(dorsalBlade, {
        pos: [0, 0.175, 0.22],
        rot: [0.12, (b / 4) * Math.PI + 0.35, 0]
      }),
      materialIndex: 3
    });
  }

  // Twin lathed Venturi plasma thrusters + smooth cyan afterburner rings at +Z tail
  const nozzle = taubinSmoothMesh(
    latheMesh(
      [
        [0, 0],
        [0.088, 0],
        [0.105, 0.08],
        [0.082, 0.16],
        [0, 0.16]
      ],
      18,
      false
    ),
    2,
    0.44,
    -0.46
  );
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(nozzle, { pos: [side * 0.115, -0.02, 0.52], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(smoothGyroRingRaw(0.078, 0.016, Math.PI * 0.5, 0, 12, 8), {
          pos: [side * 0.115, -0.02, 0.67]
        }),
        materialIndex: 5
      }
    );
  }

  return slots;
}

export function buildMorphPlayerNode(
  shapeIndex: 0 | 1 | 2,
  coreMesh: PlainMeshLike
): GroupNodeBuilder {
  const id = `player-${shapeIndex}`;
  const coreRaw = meshLikeToRaw(coreMesh);
  const coreB = rawBounds(coreRaw);
  const maxSpanX = coreB.max[0] - coreB.min[0] + 0.012;
  const maxSpanY = coreB.max[1] - coreB.min[1] + 0.012;

  if (shapeIndex === 0) {
    const mats: readonly AuraMaterialSpec[] = [
      HERO_MORPH_MATERIALS.runnerCrimson,
      SPRINT_MATERIALS.runnerSuitFabric,
      HERO_MORPH_MATERIALS.champagneTrim,
      HERO_MORPH_MATERIALS.brassTrim,
      HERO_MORPH_MATERIALS.visorSmoke,
      SPRINT_MATERIALS.boostCyanEmissive
    ];
    const slots = memoizeGeometry(`sss-morph-player-0:v6:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
      fitSlotsWithinEnvelope(buildGyroRunnerMorphSlots(), maxSpanX, maxSpanY)
    );
    return assembleMultiMaterialNode(id, slots, mats, {
      id,
      castShadow: true,
      receiveShadow: true
    });
  }

  if (shapeIndex === 1) {
    const mats: readonly AuraMaterialSpec[] = [
      HERO_MORPH_MATERIALS.coupeSolar,
      HERO_MORPH_MATERIALS.visorSmoke,
      SPRINT_MATERIALS.tireBlackRubber,
      HERO_MORPH_MATERIALS.champagneTrim,
      HERO_MORPH_MATERIALS.slateTrim,
      SPRINT_MATERIALS.stencilCubeEmissive
    ];
    const slots = memoizeGeometry(`sss-morph-player-1:v6:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
      fitSlotsWithinEnvelope(buildSolarGtCoupeMorphSlots(), maxSpanX, maxSpanY)
    );
    return assembleMultiMaterialNode(id, slots, mats, {
      id,
      castShadow: true,
      receiveShadow: true
    });
  }

  const mats: readonly AuraMaterialSpec[] = [
    HERO_MORPH_MATERIALS.gliderCobalt,
    HERO_MORPH_MATERIALS.champagneTrim,
    HERO_MORPH_MATERIALS.brassTrim,
    HERO_MORPH_MATERIALS.slateTrim,
    HERO_MORPH_MATERIALS.visorSmoke,
    SPRINT_MATERIALS.boostCyanEmissive
  ];
  const slots = memoizeGeometry(`sss-morph-player-2:v6:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
    fitSlotsWithinEnvelope(buildAeroGliderRotorMorphSlots(), maxSpanX, maxSpanY)
  );
  return assembleMultiMaterialNode(id, slots, mats, {
    id,
    castShadow: true,
    receiveShadow: true
  });
}

/**
 * 4th Sculpted Terrain Morph & Flank Rival Pacer (`rival-0`, `rival-1`):
 * - `variant === 0`: **Spiral Auger Hydrofoil Drill-Boat Pacer** — sleek `sculptOrganicSdfMesh` (`analyticNormals: true`)
 *   hydro-planing hull + twin catamaran hydrofoil sponsons & airfoil outrigger struts + lathed conical titanium bore head
 *   wrapped with dual-start smooth helical `tubeSweepMesh` spiral auger flutes + smoked bubble cockpit + pilot bust.
 * - `variant === 1`: **Plum/Coral Rival Aero-Coupe Pacer** — sculpted streamlined GT/glider pacer with
 *   helmeted pilot bust, swept aero bodywork, and 4 `wheelAssemblySlots`.
 */
export function buildRivalMorphPacerNode(id: string, variant: 0 | 1): GroupNodeBuilder {
  if (variant === 0) {
    const mats: readonly AuraMaterialSpec[] = [
      HERO_MORPH_MATERIALS.boatCoral,
      HERO_MORPH_MATERIALS.champagneTrim,
      HERO_MORPH_MATERIALS.brassTrim,
      HERO_MORPH_MATERIALS.slateTrim,
      HERO_MORPH_MATERIALS.visorSmoke,
      SPRINT_MATERIALS.boostCyanEmissive
    ];
    const slots = memoizeGeometry("sss-rival-drill-boat-v6", () => {
      const s: MultiMatSlot[] = [];
      // Sleek SDF-sculpted hydro-planing monohull facing -Z (`analyticNormals: true`, zero post-pass)
      const planingHull = sculptOrganicSdfMesh({
        boundsMin: [-0.42, -0.18, -0.58],
        boundsMax: [0.42, 0.24, 0.86],
        resolution: [22, 22, 26],
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const keel = sdfTaperedCapsule(p, [0, 0.01, -0.44], [0, 0.02, 0.68], 0.14, 0.22);
          const hullBody = sdfEllipsoid(p, [0, 0.03, 0.14], [0.35, 0.155, 0.64]);
          const blended = sminPoly(keel, hullBody, 0.06);
          const planingChine = -y - 0.115;
          return smaxPoly(blended, planingChine, 0.026);
        }
      });
      s.push({
        mesh: planingHull,
        materialIndex: 0
      });

      // Twin catamaran hydrofoil sponsons + sculpted hydrofoil outrigger struts + smooth cyan intake strips
      const sponsonHull = taubinSmoothMesh(
        sculptStreamlinedHullMesh(0.96, 0.18, 0.16, {
          noseSharpness: 1.05,
          tailTaper: 0.7,
          canopyBulge: 0.16,
          undersideFlat: 0.75,
          stations: 11,
          ringPoints: 14
        }),
        4,
        0.48,
        -0.505
      );
      const sponsonGlowStrip = taubinSmoothMesh(
        sculptStreamlinedHullMesh(0.54, 0.036, 0.032, {
          noseSharpness: 0.85,
          tailTaper: 0.85,
          canopyBulge: 0.18,
          undersideFlat: 0.5,
          stations: 8,
          ringPoints: 10
        }),
        3,
        0.46,
        -0.48
      );
      for (const side of [-1, 1] as const) {
        const hydrofoilStrut = sculptSweptAirfoilMesh({
          rootLE: [side * 0.24, -0.01, -0.08],
          rootTE: [side * 0.24, -0.01, 0.34],
          tipLE: [side * 0.42, -0.06, -0.02],
          tipTE: [side * 0.42, -0.06, 0.38],
          rootThickness: 0.032,
          tipThickness: 0.022,
          camber: 0.006,
          normalDir: [0, 1, 0],
          stations: 5,
          ringPoints: 12
        });
        s.push(
          { mesh: hydrofoilStrut, materialIndex: 3 },
          {
            mesh: transformMesh(sponsonHull, { pos: [side * 0.42, -0.06, 0.18], rot: [0, Math.PI, 0] }),
            materialIndex: 1
          },
          {
            mesh: transformMesh(sponsonGlowStrip, { pos: [side * 0.478, -0.04, 0.18], rot: [0, Math.PI, 0] }),
            materialIndex: 5
          }
        );
      }

      // Smoked bubble fighter canopy + helmeted hydro-pilot bust inside
      const canopy = taubinSmoothMesh(
        subdivideSmoothMesh(
          sculptStreamlinedHullMesh(0.58, 0.38, 0.2, {
            noseSharpness: 0.9,
            tailTaper: 0.76,
            canopyBulge: 0.32,
            undersideFlat: 0.88,
            stations: 11,
            ringPoints: 14
          }),
          1,
          0.46
        ),
        4,
        0.48,
        -0.505
      );
      s.push(
        { mesh: transformMesh(canopy, { pos: [0, 0.16, 0.12], rot: [0, Math.PI, 0] }), materialIndex: 4 },
        ...buildCockpitPilotBustSlots([0, 0.205, 0.08], 0.68, 1, 5)
      );

      // Precision lathed conical titanium bore head at -Z bow + smooth brass drive collar
      const augerCone = taubinSmoothMesh(
        latheMesh(
          [
            [0, 0],
            [0.24, 0],
            [0.21, 0.14],
            [0.14, 0.34],
            [0.06, 0.52],
            [0, 0.62]
          ],
          22,
          false
        ),
        2,
        0.44,
        -0.46
      );
      s.push(
        {
          mesh: transformMesh(augerCone, { pos: [0, 0.02, -0.46], rot: [-Math.PI * 0.5, 0, 0] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(smoothGyroRingRaw(0.245, 0.028, Math.PI * 0.5, 0, 16, 10), { pos: [0, 0.02, -0.46] }),
          materialIndex: 2
        }
      );

      // Dual-start smooth helical spiral auger cutting flutes (`tubeSweepMesh` + `taubinSmoothMesh`)
      for (const startPhase of [0, Math.PI] as const) {
        const helixPts: V4[] = [];
        const steps = 20;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const ang = startPhase + t * TAU * 2.25;
          const rad = (1 - t * 0.88) * 0.235;
          const z = -0.47 - t * 0.56;
          const fluteR = (1 - t * 0.65) * 0.028 + 0.006;
          helixPts.push([Math.cos(ang) * rad, 0.02 + Math.sin(ang) * rad, z, fluteR]);
        }
        s.push({
          mesh: taubinSmoothMesh(tubeSweepMesh(helixPts, 9, false), 2, 0.44, -0.46),
          materialIndex: 2
        });
      }

      // Twin rear hydro-jet thrusters
      const hydroJetNozzle = taubinSmoothMesh(
        latheMesh(
          [
            [0, 0],
            [0.09, 0],
            [0.11, 0.1],
            [0.08, 0.16],
            [0, 0.16]
          ],
          16,
          false
        ),
        2,
        0.44,
        -0.46
      );
      for (const side of [-1, 1] as const) {
        s.push(
          {
            mesh: transformMesh(hydroJetNozzle, { pos: [side * 0.18, 0.0, 0.72], rot: [Math.PI * 0.5, 0, 0] }),
            materialIndex: 3
          },
          {
            mesh: transformMesh(smoothGyroRingRaw(0.08, 0.016, Math.PI * 0.5, 0, 12, 8), {
              pos: [side * 0.18, 0.0, 0.86]
            }),
            materialIndex: 5
          }
        );
      }
      return fitSlotsWithinEnvelope(s, 1.06, 1.06);
    });
    return assembleMultiMaterialNode(id, slots, mats, {
      id,
      castShadow: false,
      receiveShadow: false
    });
  }

  const mats: readonly AuraMaterialSpec[] = [
    HERO_MORPH_MATERIALS.rivalPlum,
    HERO_MORPH_MATERIALS.visorSmoke,
    SPRINT_MATERIALS.tireBlackRubber,
    HERO_MORPH_MATERIALS.champagneTrim,
    HERO_MORPH_MATERIALS.slateTrim,
    SPRINT_MATERIALS.stencilTorusEmissive
  ];
  const slots = memoizeGeometry("sss-rival-aero-coupe-v6", () =>
    fitSlotsWithinEnvelope(buildSolarGtCoupeMorphSlots(), 1.06, 1.06)
  );
  return assembleMultiMaterialNode(id, slots, mats, {
    id,
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// 2. Sculpted Multi-Material Shape-Gate Portal (`gate-portal-0..9`)
// ---------------------------------------------------------------------------

export function buildShapeGatePortalNode(id: string, variant = 0): GroupNodeBuilder {
  const vKey = ((variant % 2) + 2) % 2;
  const accentPierMat = vKey === 0 ? SPRINT_MATERIALS.coralPaint : SPRINT_MATERIALS.ceruleanPaint;
  // Deck lane-shape inlays use glossy clearcoat paints so `assembleMultiMaterialNode` coalesces them
  // into a single vertex-colored coat draw call while keeping 1 beacon emissive + 1 prism lunette!
  const mats: readonly AuraMaterialSpec[] = [
    SPRINT_MATERIALS.creamCeramic,         // 0: stepped plinths & capital collars
    accentPierMat,                         // 1: lacquered flank bollard casing
    SPRINT_MATERIALS.gantryBrushedMetal,   // 2: brushed-metal side channels & flush deck stencil frames
    SPRINT_MATERIALS.brassStudioMetal,     // 3: Bezier urn finials & trim rings
    SPRINT_MATERIALS.coralPaint,           // 4: Sphere lane deck inlay (-2.3)
    SPRINT_MATERIALS.solarPaint,           // 5: Cube lane deck inlay (0)
    SPRINT_MATERIALS.ceruleanPaint,        // 6: Cone/Pyramid lane deck inlay (+2.3)
    SPRINT_MATERIALS.stencilTorusEmissive  // 7: Flank beacon ring glow
  ];

  const cached = memoizeGeometry(`sss-gate-portal-v2:${vKey}`, () => {
    const slots: MultiMatSlot[] = [];
    const glassParts: RawMesh[] = [];
    const pierX = 4.38;

    // Low-profile flanking trackside bollards (`x = ±4.38, y <= 1.92`) — 100% open forward track sightline!
    for (const side of [-1, 1] as const) {
      const px = side * pierX;
      slots.push({
        mesh: transformMesh(
          latheMesh(
            [
              [0, 0],
              [0.44, 0],
              [0.42, 0.18],
              [0.33, 0.24],
              [0.31, 0.42],
              [0, 0.42]
            ],
            18,
            false
          ),
          { pos: [px, 0, 0] }
        ),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.42, 1.02, 0.48, 0.05), { pos: [px, 0.93, 0] }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.11, 0.92, 0.52, 0.024), { pos: [px - side * 0.255, 0.93, 0] }),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.54, 0.18, 0.58, 0.035), { pos: [px, 1.5, 0] }),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(bezierUrnRaw(0.18, 0.22, 0.09, 0.14, 0.42, 16), { pos: [px, 1.58, 0] }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(gyroRingRaw(0.24, 0.022, 0.35 * side, 0.2, 14), { pos: [px, 1.78, 0] }),
        materialIndex: 7
      });
      glassParts.push(
        transformMesh(icosphereFacetMesh(0.14, 1, 0.03, 17 + vKey + side), { pos: [px, 1.78, 0] })
      );
    }

    // Flush road-deck lane-shape inlays (`y = 0.018`, flat in XZ ahead of the wall) — zero vertical sightline block
    const addDeckStencil = (sides: number, rOuter: number, rInner: number, phase: number, laneX: number, glowMat: number): void => {
      for (const s of hollowPolygonFrameSlots({
        sides,
        rOuter,
        rInner,
        depth: 0.022,
        phase,
        frameMat: 2,
        glowMat
      })) {
        slots.push({
          mesh: transformMesh(s.mesh, { pos: [laneX, 0.018, 0.92], rot: [Math.PI * 0.5, 0, 0] }),
          materialIndex: s.materialIndex
        });
      }
    };
    addDeckStencil(16, 0.34, 0.22, 0, -2.3, 4);
    addDeckStencil(4, 0.38, 0.24, Math.PI * 0.25, 0, 5);
    addDeckStencil(3, 0.4, 0.24, Math.PI * 0.5, 2.3, 6);

    return {
      slots,
      glassSpec: mergeRawMeshes(glassParts)
    };
  });

  const opaqueNode = assembleMultiMaterialNode(`${id}-frame`, cached.slots, mats, {
    castShadow: false,
    receiveShadow: false
  });
  const glassNode = geometry.custom(cached.glassSpec, {
    name: `${id}-lunette`,
    material: SPRINT_MATERIALS.prismPortalPhysical,
    castShadow: false,
    receiveShadow: false
  });
  return group(id, [opaqueNode, glassNode]).runtime({ id });
}


// ---------------------------------------------------------------------------
// 3. Floating Storybook Castle Sky-Island (`meshy-castle-0..2`)
// ---------------------------------------------------------------------------

function curvedTreeSlots(
  x: number,
  y: number,
  z: number,
  height: number,
  trunkMat: number,
  crownMat: number,
  conifer: boolean,
  seed: number
): MultiMatSlot[] {
  const leanX = (hash01(seed * 17 + 3) - 0.5) * 0.24 * height;
  const leanZ = (hash01(seed * 29 + 7) - 0.5) * 0.24 * height;
  const pts = catmullRomSpline3(
    [
      [0, 0, 0],
      [leanX * 0.45, height * 0.36, leanZ * 0.45],
      [leanX, height * 0.72, leanZ]
    ],
    4,
    false
  );
  const spine: V4[] = pts.map((p, idx) => {
    const t = idx / Math.max(1, pts.length - 1);
    return [p[0], p[1], p[2], height * (0.095 * (1 - t * 0.48))];
  });
  const trunk = transformMesh(tubeSweepMesh(spine, 7, false), { pos: [x, y, z] });
  const crownRaw = conifer
    ? coniferBoughTierMesh({ baseRadius: height * 0.44, height: height * 0.92, tiers: 4, seed })
    : layeredCanopyMesh({ radius: height * 0.48, height: height * 0.72, puffs: 11, seed });
  const crown = transformMesh(crownRaw, {
    pos: [x + leanX, y + height * (conifer ? 0.44 : 0.52), z + leanZ]
  });
  return [
    { mesh: trunk, materialIndex: trunkMat },
    { mesh: crown, materialIndex: crownMat }
  ];
}

export function buildToyCastleIslandNode(
  id: string,
  targetMaxDim: number,
  variant = 0
): GroupNodeBuilder {
  const wallMat =
    variant % 3 === 0
      ? SPRINT_MATERIALS.creamCeramic
      : variant % 3 === 1
        ? SPRINT_MATERIALS.blushCeramic
        : SPRINT_MATERIALS.mintCeramic;
  const roofMat =
    variant % 3 === 0
      ? SPRINT_MATERIALS.rubyLacquer
      : variant % 3 === 1
        ? SPRINT_MATERIALS.royalLacquer
        : SPRINT_MATERIALS.plumLacquer;
  const trimPaint =
    variant % 3 === 0
      ? SPRINT_MATERIALS.ceruleanPaint
      : variant % 3 === 1
        ? SPRINT_MATERIALS.solarPaint
        : SPRINT_MATERIALS.coralPaint;

  const mats: readonly AuraMaterialSpec[] = [
    SPRINT_MATERIALS.skyIslandStrata,   // 0: stratified rock undercroft
    SPRINT_MATERIALS.meadowTurfPbr,     // 1: emerald meadow terrace
    SPRINT_MATERIALS.mineralPlinthPbr,  // 2: stone terrace curb & gatehouse voussoirs
    wallMat,                            // 3: ceramic keep & turret walls
    roofMat,                            // 4: glossy lacquer conical roofs
    trimPaint,                          // 5: accent trim & banners
    SPRINT_MATERIALS.brassStudioMetal,  // 6: golden finials & keystones
    SPRINT_MATERIALS.timberBarkPbr,     // 7: curved tree trunks
    SPRINT_MATERIALS.coniferFoliagePbr, // 8: scalloped bough & layered canopies
    SPRINT_MATERIALS.stencilTorusEmissive // 9: crystal spire glow
  ];

  const slots: MultiMatSlot[] = [];
  const seed = 41 + variant * 23;

  // Inverted stratified sedimentary cliff undercroft (`y in [0, 3.8]` inverted to `[-3.8, 0]`)
  const cliff = transformMesh(
    stratifiedCliffMesh({ radiusX: 3.35, radiusZ: 3.25, height: 3.7, terraces: 5, seed }),
    { pos: [0, 0.05, 0], rot: [Math.PI, 0, 0] }
  );
  slots.push({ mesh: cliff, materialIndex: 0 });

  // 12-sided bevelled meadow deck + mineral parapet rim
  const deckPoly = regularPolygon2D(12, 3.32, Math.PI / 12);
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(deckPoly, 0.46, 0.1, false), {
      pos: [0, 0.16, 0],
      rot: [Math.PI * 0.5, 0, 0]
    }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(
      latheMesh(
        [
          [2.75, 0.34],
          [3.12, 0.34],
          [3.12, 0.56],
          [2.82, 0.58]
        ],
        18,
        false
      ),
      { pos: [0, 0, 0] }
    ),
    materialIndex: 2
  });

  // Central chamfered keep + crenellations + front voussoir gatehouse
  slots.push({
    mesh: transformMesh(bevelBoxMesh(2.05, 1.85, 1.95, 0.09), { pos: [0, 1.28, -0.15] }),
    materialIndex: 3
  });
  for (let mx = -1; mx <= 1; mx += 1) {
    for (let mz = -1; mz <= 1; mz += 1) {
      if (mx === 0 && mz === 0) continue;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.38, 0.32, 0.38, 0.04), {
          pos: [mx * 0.78, 2.34, -0.15 + mz * 0.74]
        }),
        materialIndex: 2
      });
    }
  }
  for (const vSlot of archwayVoussoirSlots({
    radius: 0.46,
    thickness: 0.2,
    depth: 0.36,
    voussoirs: 7,
    stoneMatA: 2,
    stoneMatB: 5,
    keystoneMat: 6
  })) {
    slots.push({
      mesh: transformMesh(vSlot.mesh, { pos: [0, 0.38, 0.88] }),
      materialIndex: vSlot.materialIndex
    });
  }

  // 3 cylindrical turrets with flared Bezier witch-cone roofs & brass finials
  const turretSpots: readonly { readonly x: number; readonly z: number; readonly r: number; readonly h: number }[] = [
    { x: 0, z: -0.2, r: 0.62, h: 3.15 },
    { x: -1.25, z: -0.95, r: 0.48, h: 2.35 },
    { x: 1.28, z: -0.88, r: 0.46, h: 2.2 }
  ];
  for (const t of turretSpots) {
    const shaftProfile: V2[] = [
      [0, 0.36],
      [t.r * 1.08, 0.36],
      [t.r, 0.62],
      [t.r * 0.93, t.h],
      [t.r * 1.12, t.h + 0.14],
      [t.r * 1.12, t.h + 0.3],
      [0, t.h + 0.3]
    ];
    const roofCurve = bezierCurve2(
      [t.r * 1.28, t.h + 0.28],
      [t.r * 0.74, t.h + 0.68],
      [t.r * 0.26, t.h + 1.22],
      [0, t.h + 1.68],
      9
    );
    slots.push(
      { mesh: transformMesh(latheMesh([[0, t.h + 0.28], ...roofCurve], 20, false), { pos: [t.x, 0, t.z] }), materialIndex: 4 },
      { mesh: transformMesh(latheMesh(shaftProfile, 20, false), { pos: [t.x, 0, t.z] }), materialIndex: 3 },
      { mesh: transformMesh(bezierUrnRaw(0.08, 0.13, 0.04, 0.09, 0.46, 12), { pos: [t.x, t.h + 1.64, t.z] }), materialIndex: 6 }
    );
  }

  // Sculpted island trees + glowing crystal cluster + translucent rose-prism shrine dome
  slots.push(
    ...curvedTreeSlots(-1.95, 0.36, 0.95, 1.75, 7, 8, true, seed + 5),
    ...curvedTreeSlots(1.88, 0.36, 1.02, 1.55, 7, 8, false, seed + 19),
    { mesh: transformMesh(hexPrismClusterRaw(0.78, seed + 31), { pos: [-0.95, 0.34, 1.85] }), materialIndex: 9 }
  );

  const shrineDome = transformMesh(icosphereFacetMesh(0.46, 1, 0.04, seed + 9), {
    pos: [1.05, 0.78, 1.72]
  });
  slots.push({ mesh: shrineDome, materialIndex: 5 });

  const cachedSlots = memoizeGeometry(`sss-castle-island:${targetMaxDim.toFixed(2)}:${variant % 3}`, () =>
    normalizeGroundedAssembly(slots, [], targetMaxDim).slots
  );
  return assembleMultiMaterialNode(id, cachedSlots, mats, {
    id,
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// 4. Architectural Toy-Block Spire & Polyhedral Gyro Tower (`meshy-tower-0..2`)
// ---------------------------------------------------------------------------

export function buildToyBlockTowerNode(
  id: string,
  targetMaxDim: number,
  variant = 0
): GroupNodeBuilder {
  const mats: readonly AuraMaterialSpec[] = [
    SPRINT_MATERIALS.mineralPlinthPbr,     // 0: stepped foundation plinth
    SPRINT_MATERIALS.creamCeramic,         // 1: cream architectural blocks
    SPRINT_MATERIALS.coralPaint,           // 2: coral clearcoat tier
    SPRINT_MATERIALS.ceruleanPaint,        // 3: cerulean clearcoat tier
    SPRINT_MATERIALS.solarPaint,           // 4: solar clearcoat tier
    SPRINT_MATERIALS.lilacCeramic,         // 5: lilac gallery tier
    SPRINT_MATERIALS.gantryBrushedMetal,   // 6: lattice beacon cage & fins
    SPRINT_MATERIALS.brassStudioMetal,     // 7: gyroscopic rings & balusters
    SPRINT_MATERIALS.boostCyanEmissive     // 8: hovering polyhedral shrine core
  ];

  const slots: MultiMatSlot[] = [];
  const rotOff = variant * 0.28;

  // Stepped octagonal stone plinth + chamfered base block with 4-sided voussoir colonnade
  slots.push(
    {
      mesh: transformMesh(extrudePolygonMesh(regularPolygon2D(8, 2.35, Math.PI / 8), 0.9, 0.14, true), {
        pos: [0, 0.45, 0],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 0
    },
    {
      mesh: transformMesh(bevelBoxMesh(3.2, 3.1, 3.2, 0.16), { pos: [0, 2.45, 0] }),
      materialIndex: 1
    }
  );

  for (let side = 0; side < 4; side += 1) {
    const yaw = (side / 4) * TAU;
    for (const vSlot of archwayVoussoirSlots({
      radius: 0.78,
      thickness: 0.28,
      depth: 0.34,
      voussoirs: 7,
      stoneMatA: 2 + (variant % 3),
      stoneMatB: 1,
      keystoneMat: 7
    })) {
      slots.push({
        mesh: transformMesh(
          transformMesh(vSlot.mesh, { pos: [0, 1.45, 1.62] }),
          { rot: [0, yaw, 0] }
        ),
        materialIndex: vSlot.materialIndex
      });
    }
  }

  // Stacked offset chamfered toy-block & octagonal tiers with turned corner balusters
  const tierSpecs: readonly { readonly y: number; readonly h: number; readonly w: number; readonly mat: number; readonly yaw: number }[] = [
    { y: 5.1, h: 2.2, w: 2.55, mat: 2 + (variant % 3), yaw: 0.12 + rotOff },
    { y: 7.25, h: 2.1, w: 2.1, mat: 5, yaw: -0.16 + rotOff },
    { y: 9.2, h: 1.85, w: 1.72, mat: 2 + ((variant + 1) % 3), yaw: 0.22 + rotOff }
  ];
  for (const tier of tierSpecs) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(tier.w, tier.h, tier.w, 0.14), {
        pos: [0, tier.y, 0],
        rot: [0, tier.yaw, 0]
      }),
      materialIndex: tier.mat
    });
    const rBal = tier.w * 0.54;
    for (let c = 0; c < 4; c += 1) {
      const a = tier.yaw + (c + 0.5) * (Math.PI * 0.5);
      slots.push({
        mesh: transformMesh(bezierUrnRaw(0.14, 0.2, 0.09, 0.15, 0.62, 12), {
          pos: [Math.cos(a) * rBal, tier.y + tier.h * 0.5, Math.sin(a) * rBal]
        }),
        materialIndex: 7
      });
    }
  }

  // Open steel lattice beacon observatory + 4 swept aerodynamic spire fins
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [1.42, 2.7, 1.42], bays: 4, chordRadius: 0.065, braceRadius: 0.038 }),
      { pos: [0, 11.45, 0] }
    ),
    materialIndex: 6
  });
  const finPoly: V2[] = [
    [0.65, 9.8],
    [1.48, 10.1],
    [1.15, 12.6],
    [0.56, 13.0]
  ];
  for (let f = 0; f < 4; f += 1) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(finPoly, 0.12, 0.03, true), { rot: [0, (f / 4) * TAU, 0] }),
      materialIndex: 6
    });
  }

  // Crown polyhedral shrine + dual crossed brass gyroscopic rings + finial spire
  slots.push(
    { mesh: transformMesh(icosphereFacetMesh(0.56, 1, 0.06, 19 + variant), { pos: [0, 13.85, 0] }), materialIndex: 8 },
    { mesh: transformMesh(gyroRingRaw(1.06, 0.065, 0.42, -0.28, 16), { pos: [0, 13.85, 0] }), materialIndex: 7 },
    { mesh: transformMesh(gyroRingRaw(0.86, 0.055, -0.48, 0.36, 16), { pos: [0, 13.85, 0] }), materialIndex: 7 },
    { mesh: transformMesh(bezierUrnRaw(0.24, 0.3, 0.08, 0.02, 1.75, 16), { pos: [0, 14.95, 0] }), materialIndex: 7 }
  );

  const crownGlass = transformMesh(icosphereFacetMesh(0.72, 1, 0.02, 31 + variant), { pos: [0, 13.85, 0] });
  slots.push({ mesh: crownGlass, materialIndex: 5 });

  const cachedSlots = memoizeGeometry(`sss-block-tower:${targetMaxDim.toFixed(2)}:${variant % 3}`, () =>
    normalizeGroundedAssembly(slots, [], targetMaxDim).slots
  );
  return assembleMultiMaterialNode(id, cachedSlots, mats, {
    id,
    castShadow: false,
    receiveShadow: false
  });
}


// ---------------------------------------------------------------------------
// 5. Fluted Viaduct Station, Kinetic Monoliths, Gyro Rings & Chevron Boost Pads
// ---------------------------------------------------------------------------

function chevronBoostPadSlots(padMat: number, glowMat: number): MultiMatSlot[] {
  const outerPlate: V2[] = [
    [-1.42, -2.05],
    [1.42, -2.05],
    [1.62, 0],
    [1.42, 2.05],
    [-1.42, 2.05],
    [-1.62, 0]
  ];
  const chevronV: V2[] = [
    [-1.12, 0.42],
    [0, -0.52],
    [1.12, 0.42],
    [1.12, 0.78],
    [0, -0.14],
    [-1.12, 0.78]
  ];
  const slots: MultiMatSlot[] = [
    {
      mesh: transformMesh(extrudePolygonMesh(outerPlate, 0.018, 0.004, true), {
        pos: [0, 0.01, 0],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: padMat
    }
  ];
  for (const zOff of [-1.1, 0, 1.1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(chevronV, 0.022, 0.004, true), {
        pos: [0, 0.018, zOff],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: glowMat
    });
  }
  return slots;
}

export function buildBridgeViaductStationNode(
  id: string,
  index: number
): GroupNodeBuilder {
  const bandPaint =
    index % 3 === 0
      ? SPRINT_MATERIALS.coralPaint
      : index % 3 === 1
        ? SPRINT_MATERIALS.mintCeramic
        : SPRINT_MATERIALS.solarPaint;
  const mats: readonly AuraMaterialSpec[] = [
    SPRINT_MATERIALS.creamCeramic,       // 0: fluted viaduct column & capital
    bandPaint,                           // 1: candy column drum bands
    SPRINT_MATERIALS.gantryBrushedMetal, // 2: cantilevered outrigger trusses
    SPRINT_MATERIALS.slateBrushedMetal,  // 3: kinetic monolith body & boost pad deck
    SPRINT_MATERIALS.brassStudioMetal,   // 4: gyroscopic rings & collar trim
    SPRINT_MATERIALS.boostCyanEmissive   // 5: monolith energy core & chevron boost glow
  ];

  const slots: MultiMatSlot[] = [];

  // Fluted Bezier-profiled viaduct column (`y in [-26, -0.75]`) + flared bridge capital
  const shaftProfile: V2[] = [
    [0, -26],
    [1.08, -26],
    [0.98, -21],
    [0.88, -13],
    [0.8, -2.1],
    [1.16, -1.55],
    [1.56, -0.92],
    [1.56, -0.75],
    [0, -0.75]
  ];
  slots.push({ mesh: latheMesh(shaftProfile, 20, false), materialIndex: 0 });

  for (let b = 0; b < 5; b += 1) {
    const y0 = -3.4 - b * 4.1;
    const rBand = 0.86 + b * 0.032;
    slots.push({
      mesh: latheMesh(
        [
          [rBand - 0.04, y0],
          [rBand + 0.055, y0 + 0.08],
          [rBand + 0.055, y0 + 0.52],
          [rBand - 0.04, y0 + 0.6]
        ],
        18,
        false
      ),
      materialIndex: 1
    });
  }

  // Twin cantilevered trackside kinetic monoliths & gyroscopic rings (`x = ±5.75`)
  const glassCaps: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    const mx = side * 5.75;
    slots.push(
      {
        mesh: transformMesh(
          latticeTrussMesh({ span: [2.2, 0.36, 0.42], bays: 3, chordRadius: 0.038, braceRadius: 0.022 }),
          { pos: [side * 4.65, -0.36, 0] }
        ),
        materialIndex: 2
      },
      {
        mesh: transformMesh(bezierUrnRaw(0.42, 0.5, 0.28, 0.36, 0.56, 16), { pos: [mx, -0.56, 0] }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(bezierUrnRaw(0.32, 0.38, 0.22, 0.16, 2.35, 16), { pos: [mx, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(gyroRingRaw(0.76, 0.042, 0.38 * side, 0.28, 16), { pos: [mx, 1.48, 0] }),
        materialIndex: 4
      },
      {
        mesh: transformMesh(gyroRingRaw(0.58, 0.034, -0.44 * side, -0.32, 14), { pos: [mx, 1.48, 0] }),
        materialIndex: 4
      },
      {
        mesh: transformMesh(icosphereFacetMesh(0.24, 1, 0.05, 61 + index), { pos: [mx, 1.48, 0] }),
        materialIndex: 5
      }
    );
    glassCaps.push(transformMesh(hexPrismClusterRaw(0.52, 83 + index + side), { pos: [mx, 2.32, 0] }));
  }

  // Fold road-deck chevron speed-boost pad directly into `slots` (materials 3 & 5) to save sub-draws!
  if (index % 2 === 0) {
    slots.push(...chevronBoostPadSlots(3, 5));
  }

  const cached = memoizeGeometry(`sss-viaduct-station:${index % 6}`, () => ({
    slots,
    crystalSpec: mergeRawMeshes(glassCaps)
  }));

  const children: GroupChildInput[] = [
    assembleMultiMaterialNode(`${id}-structure`, cached.slots, mats, {
      castShadow: false,
      receiveShadow: false
    }),
    geometry.custom(cached.crystalSpec, {
      name: `${id}-monolith-crystals`,
      material: SPRINT_MATERIALS.prismPortalPhysical,
      castShadow: false,
      receiveShadow: false
    })
  ];

  return group(id, children).runtime({ id });
}

// ---------------------------------------------------------------------------
// 6. Instanced Horizon Stadium Pylons & Floating Faceted Prism Clusters (`>16`)
// ---------------------------------------------------------------------------

function stadiumPylonRaw(): RawMesh {
  const heights = [0, 4.5, 10.5, 16.5, 21.5, 24.5];
  const widths = [1.55, 1.28, 1.02, 0.78, 0.52, 0.16];
  const depths = [2.2, 1.85, 1.48, 1.12, 0.78, 0.24];
  const lean = [0, 0.35, 1.05, 2.05, 3.25, 4.35];
  const sections: V3[][] = heights.map((y, idx) => {
    const w = widths[idx]!;
    const d = depths[idx]!;
    const xShift = lean[idx]!;
    return [
      [xShift - w, y, -d * 0.5],
      [xShift + w * 0.55, y, -d],
      [xShift + w, y, 0],
      [xShift + w * 0.55, y, d],
      [xShift - w, y, d * 0.5],
      [xShift - w * 1.15, y, 0]
    ];
  });
  const mast = loftSectionsMesh(sections, true, false);
  const halo = transformMesh(gyroRingRaw(1.35, 0.11, 0.32, -0.25, 14), { pos: [3.6, 22.4, 0] });
  return mergeRawList([mast, halo]);
}

export function buildHorizonStadiumPylonsNode() {
  const count = 20;
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const x = side * (36 + hash01(i * 19 + 5) * 18);
    const y = -16 + hash01(i * 29 + 11) * 5;
    const z = 16 - row * 22 - hash01(i * 37 + 17) * 6;
    const s = 0.85 + hash01(i * 43 + 23) * 0.45;
    transforms.push({
      position: [x, y, z],
      rotation: [0, side < 0 ? 0.18 : Math.PI - 0.18, 0],
      scale: s
    });
  }
  return instances.custom(mergeRawMeshes([stadiumPylonRaw()]), {
    name: "horizon-stadium-pylons",
    material: SPRINT_MATERIALS.instancedPylonMetal,
    transforms,
    castShadow: false,
    receiveShadow: false
  });
}

export function buildFloatingPrismClustersNode() {
  const count = 24;
  const palette: readonly AuraColor[] = ["#ff9ec7", "#8ee8ff", "#ffe380", "#c6a4ff", "#9ef5cf"];
  const transforms: AuraTransformSpec[] = [];
  const colors: AuraColor[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (15.5 + hash01(i * 23 + 7) * 20);
    const y = 1.8 + hash01(i * 31 + 13) * 11.5;
    const z = 14 - i * 8.2 - hash01(i * 41 + 19) * 3.5;
    const s = 0.9 + hash01(i * 53 + 29) * 0.75;
    transforms.push({
      position: [x, y, z],
      rotation: [(hash01(i * 17) - 0.5) * 0.35, hash01(i * 61) * TAU, (hash01(i * 71) - 0.5) * 0.35],
      scale: s
    });
    colors.push(palette[i % palette.length]!);
  }
  return instances.custom(mergeRawMeshes([hexPrismClusterRaw(1.15, 107)]), {
    name: "floating-prism-clusters",
    material: SPRINT_MATERIALS.instancedCrystalPbr,
    transforms,
    colors,
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// 7. Scenery Mesh Helpers for GPU-Drifted Parallax Sky-Islands (`scenery.ts`)
// ---------------------------------------------------------------------------

export function sculptedParallaxTreeParts(
  x: number,
  z: number,
  height: number,
  scale: number,
  conifer: boolean,
  seed: number
): { readonly trunk: RawMesh; readonly crown: RawMesh } {
  const slots = curvedTreeSlots(0, 0, 0, height, 0, 1, conifer, seed);
  return {
    trunk: transformMesh(slots[0]!.mesh, { pos: [x, 0, z], scale }),
    crown: transformMesh(slots[1]!.mesh, { pos: [x, 0, z], scale })
  };
}

export function sculptedParallaxTurretParts(
  x: number,
  z: number,
  height: number
): { readonly wall: RawMesh; readonly band: RawMesh; readonly roof: RawMesh; readonly finial: RawMesh } {
  const wall = transformMesh(
    latheMesh(
      [
        [0, 0],
        [0.78, 0],
        [0.72, height * 0.18],
        [0.66, height],
        [0, height]
      ],
      16,
      false
    ),
    { pos: [x, 0, z] }
  );
  const band = transformMesh(
    latheMesh(
      [
        [0.66, height - 0.06],
        [0.86, height - 0.02],
        [0.86, height + 0.24],
        [0, height + 0.24]
      ],
      16,
      false
    ),
    { pos: [x, 0, z] }
  );
  const roofCurve = bezierCurve2([0.98, height + 0.22], [0.58, height + 0.72], [0.22, height + 1.24], [0, height + 1.66], 7);
  const roof = transformMesh(latheMesh([[0, height + 0.22], ...roofCurve], 16, false), { pos: [x, 0, z] });
  const finial = transformMesh(bezierUrnRaw(0.08, 0.12, 0.04, 0.08, 0.36, 10), { pos: [x, height + 1.64, z] });
  return { wall, band, roof, finial };
}
