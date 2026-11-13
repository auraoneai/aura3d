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
  buildGroupedGeometrySpec,
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
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
  runnerSuitFabric: material.fabric({
    name: "sss-runner-suit-fabric",
    color: "#28324a",
    roughness: 0.62
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
  for (const m of parts) {
    const base = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + base);
  }
  return { positions, normals, uvs, indices };
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

function buildWingedSprintBootSlots(
  anklePos: V3,
  pitch: number,
  armorMat: number,
  wingMat: number,
  soleMat: number,
  glowMat: number
): MultiMatSlot[] {
  const bootStations: readonly [number, number, number, number][] = [
    [-0.068, 0.048, 0.098, -0.022],
    [-0.042, 0.052, 0.104, -0.024],
    [-0.008, 0.045, 0.076, -0.006],
    [0.028, 0.039, 0.052, 0.008]
  ];
  const rings: V3[][] = bootStations.map(([by, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      const sa = Math.sin(a);
      const stretch = sa < 0 ? 1.25 : 0.78;
      ring.push([Math.cos(a) * rx, by, cz + sa * rz * stretch]);
    }
    return ring;
  });
  const upper = subdivideSmoothMesh(loftSectionsMesh(rings, true, true), 1, 0.28);
  const sole = transformMesh(bevelBoxMesh(0.092, 0.02, 0.175, 0.006), { pos: [0, -0.068, -0.022] });
  const hermesWingPoly: V2[] = [
    [0, -0.02],
    [0.095, 0.048],
    [0.125, 0.096],
    [0.038, 0.064]
  ];
  const out: MultiMatSlot[] = [
    { mesh: transformMesh(upper, { pos: anklePos, rot: [pitch, 0, 0] }), materialIndex: armorMat },
    { mesh: transformMesh(sole, { pos: anklePos, rot: [pitch, 0, 0] }), materialIndex: soleMat },
    {
      mesh: transformMesh(
        transformMesh(bevelBoxMesh(0.052, 0.022, 0.045, 0.005), { pos: [0, -0.045, 0.058] }),
        { pos: anklePos, rot: [pitch, 0, 0] }
      ),
      materialIndex: glowMat
    }
  ];
  for (const wSide of [-1, 1] as const) {
    const wing = transformMesh(extrudePolygonMesh(hermesWingPoly, 0.014, 0.003, true), {
      pos: [wSide * 0.046, -0.018, 0.015],
      rot: [0.18, -wSide * 1.18, wSide * 0.25]
    });
    out.push({
      mesh: transformMesh(wing, { pos: anklePos, rot: [pitch, 0, 0] }),
      materialIndex: wingMat
    });
  }
  return out;
}

function buildGyroRunnerMorphSlots(): MultiMatSlot[] {
  // 0: sphereCarPaint (metallic crimson), 1: slateBrushedMetal (carbon-slate undersuit),
  // 2: champagneStudioMetal (silver-champagne wings & trim), 3: brassStudioMetal (thruster bells),
  // 4: cockpitSmokePaint (visor bezel & soles), 5: boostCyanEmissive (glowing cyan visor & thrusters)
  const slots: MultiMatSlot[] = [];

  // 1. Sleek Sculpted Crimson Aero-Helmet (`sculptStylizedHeadMesh` + swept aero crest + wraparound cyan visor)
  const rawHead = sculptStylizedHeadMesh(0.118, {
    jawTaper: 0.34,
    cheekFullness: 0.08,
    browRidge: 0.14,
    noseBridge: 0.14,
    subdivisions: 2
  });
  const sweptHelm = deformMesh(
    transformMesh(rawHead, { rot: [0.1, Math.PI, 0] }),
    ([x, y, z]) => {
      const aft = Math.max(0, z / 0.12);
      const taper = 1 - Math.min(0.52, aft * 0.32);
      return [x * taper * 0.94, y * 0.95 + aft * 0.018, z > 0 ? z * 1.46 + aft * 0.024 : z * 1.12];
    }
  );
  const headY = 0.365;
  const headZ = -0.045;
  slots.push({
    mesh: transformMesh(sweptHelm, { pos: [0, headY, headZ] }),
    materialIndex: 0
  });
  // Sculpted carbon-slate jaw chin-guard
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.125, 0.052, 0.132, 0.016), {
      pos: [0, headY - 0.062, headZ - 0.048],
      rot: [0.22, 0, 0]
    }),
    materialIndex: 1
  });
  // Swept dorsal aero-crest + twin lateral ear-winglets (`extrudePolygonMesh`)
  const crestPoly: V2[] = [
    [-0.065, 0.045],
    [0.065, 0.128],
    [0.215, 0.145],
    [0.145, 0.025]
  ];
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(crestPoly, 0.022, 0.005, true), {
      pos: [0, headY + 0.036, headZ],
      rot: [0, -Math.PI * 0.5, 0]
    }),
    materialIndex: 2
  });
  const earWingPoly: V2[] = [
    [0, -0.018],
    [0.14, 0.056],
    [0.175, 0.095],
    [0.052, 0.044]
  ];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(earWingPoly, 0.015, 0.003, true), {
        pos: [side * 0.096, headY + 0.006, headZ + 0.012],
        rot: [0.16, -side * 1.22, side * 0.28]
      }),
      materialIndex: 2
    });
  }
  // Wide wraparound glowing cyan visor (`-Z` front wrapping past `±X` temples) + rear helmet telemetry chevron (`+Z`)
  const visorPoly: V2[] = [
    [-0.112, -0.062],
    [0.0, -0.142],
    [0.112, -0.062],
    [0.118, 0.038],
    [0.092, 0.042],
    [0.0, -0.108],
    [-0.092, 0.042],
    [-0.118, 0.038]
  ];
  slots.push(
    {
      mesh: transformMesh(extrudePolygonMesh(visorPoly, 0.038, 0.006, true), {
        pos: [0, headY - 0.006, headZ],
        rot: [Math.PI * 0.5 + 0.12, 0, 0]
      }),
      materialIndex: 5
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.062, 0.024, 0.028, 0.005), {
        pos: [0, headY + 0.015, headZ + 0.168]
      }),
      materialIndex: 5
    }
  );

  // 2. Contoured Metallic-Crimson & Carbon-Slate V-Tapered Armored Chestplate + Twin Micro-Thruster Pack
  const torsoStations: readonly [number, number, number, number][] = [
    [-0.095, 0.108, 0.078, 0.022], // contoured hip/pelvis
    [-0.015, 0.084, 0.064, 0.01],  // narrow athletic V-waist
    [0.085, 0.136, 0.094, -0.008], // lower ribcage
    [0.185, 0.186, 0.116, -0.022], // broad pectoral & lat chestplate
    [0.258, 0.148, 0.088, -0.028], // trapezius shoulder yoke
    [0.305, 0.062, 0.056, -0.032]  // armored neck collar
  ];
  const torsoRings: V3[][] = torsoStations.map(([ty, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      const keel = 1 + 0.08 * Math.cos(2 * a) - 0.04 * Math.cos(4 * a);
      ring.push([Math.cos(a) * rx * keel, ty, cz + Math.sin(a) * rz * keel]);
    }
    return ring;
  });
  slots.push({
    mesh: subdivideSmoothMesh(loftSectionsMesh(torsoRings, true, true), 1, 0.28),
    materialIndex: 1
  });

  // Sculpted metallic-crimson upper cuirass + champagne sternum chevron & belt buckle
  const cuirassStations: readonly [number, number, number, number][] = [
    [0.065, 0.142, 0.102, -0.01],
    [0.182, 0.196, 0.124, -0.022],
    [0.255, 0.158, 0.094, -0.028]
  ];
  const cuirassRings: V3[][] = cuirassStations.map(([ty, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      ring.push([Math.cos(a) * rx, ty, cz + Math.sin(a) * rz]);
    }
    return ring;
  });
  slots.push(
    { mesh: subdivideSmoothMesh(loftSectionsMesh(cuirassRings, true, true), 1, 0.24), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.215, 0.048, 0.158, 0.014), { pos: [0, -0.055, 0.015] }), materialIndex: 2 }
  );

  // Twin Micro-Thruster Pack on upper back (`+Z`, directly facing the chase camera!) + swept dorsal aero-fins
  slots.push({
    mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.205, 0.195, 0.085, 0.024), 1, 0.35), {
      pos: [0, 0.165, 0.098],
      rot: [-0.12, 0, 0]
    }),
    materialIndex: 2
  });
  const packWingPoly: V2[] = [
    [0, -0.04],
    [0.145, 0.055],
    [0.175, 0.125],
    [0.04, 0.065]
  ];
  const microBell = latheMesh(
    [
      [0, 0],
      [0.042, 0],
      [0.052, 0.048],
      [0.038, 0.085],
      [0, 0.085]
    ],
    14,
    false
  );
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(extrudePolygonMesh(packWingPoly, 0.016, 0.004, true), {
          pos: [side * 0.082, 0.185, 0.105],
          rot: [-0.18, -side * 0.68, side * 0.22]
        }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(microBell, {
          pos: [side * 0.062, 0.115, 0.132],
          rot: [Math.PI * 0.42, 0, -side * 0.1]
        }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(gyroRingRaw(0.038, 0.011, Math.PI * 0.42, 0, 12), {
          pos: [side * 0.066, 0.098, 0.198]
        }),
        materialIndex: 5
      }
    );
  }
  // Glowing cyan spine energy core between micro-thrusters
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.032, 0.145, 0.026, 0.006), {
      pos: [0, 0.175, 0.142],
      rot: [-0.12, 0, 0]
    }),
    materialIndex: 5
  });

  // 3. Seamless Sculpted Arms & Legs (`sculptAnatomicalLimbMesh` + `sculptHumanoidLimbMesh`)
  for (const side of [-1, 1] as const) {
    const shPos: V3 = [side * 0.198, 0.215, -0.018];
    const elbowPos: V3 = side < 0 ? [-0.242, 0.085, 0.068] : [0.238, 0.095, -0.065];
    const wristPos: V3 = side < 0 ? [-0.185, 0.145, -0.175] : [0.215, 0.005, 0.165];
    const midArm: V3 = [(shPos[0] + elbowPos[0]) * 0.5, (shPos[1] + elbowPos[1]) * 0.5, (shPos[2] + elbowPos[2]) * 0.5];

    // Layered crimson deltoid pauldron
    slots.push({
      mesh: transformMesh(
        extrudePolygonMesh(
          [
            [-0.055, -0.036],
            [0.058, -0.024],
            [0.072, 0.044],
            [-0.028, 0.058]
          ],
          0.112,
          0.016,
          true
        ),
        { pos: [shPos[0], shPos[1] + 0.018, shPos[2]], rot: [0.12, 0, -side * 0.42] }
      ),
      materialIndex: 0
    });

    // Carbon-slate anatomical bicep + crimson forearm gauntlet + champagne elbow guard
    slots.push(
      {
        mesh: sculptAnatomicalLimbMesh(
          [
            { pos: shPos, rx: 0.052, rz: 0.058 },
            { pos: midArm, rx: 0.046, rz: 0.054 },
            { pos: elbowPos, rx: 0.04, rz: 0.042 }
          ],
          { ringPoints: 12, capEnds: true, muscleBiasZ: -0.006 }
        ),
        materialIndex: 1
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.054, 0.052, 0.054, 0.012), { pos: elbowPos }),
        materialIndex: 2
      },
      {
        mesh: sculptHumanoidLimbMesh(
          [
            [elbowPos[0], elbowPos[1], elbowPos[2], 0.044],
            [(elbowPos[0] + wristPos[0]) * 0.5, (elbowPos[1] + wristPos[1]) * 0.5, (elbowPos[2] + wristPos[2]) * 0.5, 0.052],
            [wristPos[0], wristPos[1], wristPos[2], 0.038]
          ],
          10,
          0.18
        ),
        materialIndex: 0
      },
      {
        mesh: transformMesh(icosphereFacetMesh(0.042, 1, 0.004, 29 + side), { pos: wristPos }),
        materialIndex: 1
      }
    );

    // Contra-lateral athletic sprint legs (`sculptAnatomicalLimbMesh`)
    const legFwd = side < 0;
    const hipPos: V3 = [side * 0.095, -0.085, 0.018];
    const kneePos: V3 = legFwd ? [-0.102, -0.245, -0.115] : [0.102, -0.265, 0.095];
    const anklePos: V3 = legFwd ? [-0.098, -0.425, -0.055] : [0.098, -0.395, 0.215];
    const midThigh: V3 = [(hipPos[0] + kneePos[0]) * 0.5, (hipPos[1] + kneePos[1]) * 0.5, (hipPos[2] + kneePos[2]) * 0.5 - 0.012];
    const midCalf: V3 = [(kneePos[0] + anklePos[0]) * 0.5, (kneePos[1] + anklePos[1]) * 0.5, (kneePos[2] + anklePos[2]) * 0.5 + 0.015];

    slots.push(
      {
        mesh: sculptAnatomicalLimbMesh(
          [
            { pos: hipPos, rx: 0.066, rz: 0.078 },
            { pos: midThigh, rx: 0.062, rz: 0.076 },
            { pos: kneePos, rx: 0.048, rz: 0.052 }
          ],
          { ringPoints: 12, capEnds: true, muscleBiasZ: -0.012, peakT: 0.42 }
        ),
        materialIndex: 1
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.074, 0.068, 0.064, 0.016), {
          pos: [kneePos[0], kneePos[1] + 0.008, kneePos[2] - 0.022],
          rot: [0.18, 0, 0]
        }),
        materialIndex: 2
      },
      {
        mesh: sculptAnatomicalLimbMesh(
          [
            { pos: kneePos, rx: 0.048, rz: 0.052 },
            { pos: midCalf, rx: 0.052, rz: 0.064 },
            { pos: anklePos, rx: 0.038, rz: 0.042 }
          ],
          { ringPoints: 12, capEnds: true, muscleBiasZ: 0.014, peakT: 0.36 }
        ),
        materialIndex: 0
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
    jawTaper: 0.32,
    browRidge: 0.12,
    subdivisions: 1
  });
  const swept = deformMesh(transformMesh(head, { rot: [0.08, Math.PI, 0] }), ([x, y, z]) => [
    x * 0.94,
    y * 0.94,
    z > 0 ? z * 1.32 : z * 1.08
  ]);
  const shoulders = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.24 * scale, 0.095 * scale, 0.15 * scale, 0.025 * scale), 1, 0.4), {
    pos: [pos[0], pos[1] - 0.085 * scale, pos[2] + 0.015 * scale]
  });
  const visor = transformMesh(bevelBoxMesh(0.145 * scale, 0.038 * scale, 0.05 * scale, 0.008 * scale), {
    pos: [pos[0], pos[1] + 0.004 * scale, pos[2] - 0.085 * scale],
    rot: [0.12, 0, 0]
  });
  return [
    { mesh: shoulders, materialIndex: helmMat },
    { mesh: transformMesh(swept, { pos }), materialIndex: helmMat },
    { mesh: visor, materialIndex: visorGlowMat }
  ];
}

function buildSolarGtCoupeMorphSlots(): MultiMatSlot[] {
  // 0: cubeClearcoat (solar GT body), 1: cockpitSmokePaint, 2: tireBlackRubber, 3: champagneStudioMetal, 4: slateBrushedMetal, 5: stencilCubeEmissive
  const slots: MultiMatSlot[] = [];

  // Sleek compound-curve GT hypercar monocoque oriented nose-forward toward -Z (`rot: [0, Math.PI, 0]`)
  const bodyHull = subdivideSmoothMesh(
    sculptStreamlinedHullMesh(1.34, 0.86, 0.33, {
      noseSharpness: 0.86,
      tailTaper: 0.52,
      canopyBulge: 0.28,
      undersideFlat: 0.86,
      stations: 14,
      ringPoints: 16
    }),
    1,
    0.38
  );
  slots.push({
    mesh: transformMesh(bodyHull, { pos: [0, -0.025, 0], rot: [0, Math.PI, 0] }),
    materialIndex: 0
  });

  // Sculpted widebody front & rear aero fenders + side Venturi intake pods + wheel-arch louvers
  for (const side of [-1, 1] as const) {
    for (const zAxle of [-0.39, 0.39] as const) {
      const arch = sculptStreamlinedHullMesh(0.42, 0.16, 0.19, {
        noseSharpness: 0.65,
        tailTaper: 0.65,
        canopyBulge: 0.32,
        undersideFlat: 0.88,
        stations: 9,
        ringPoints: 12
      });
      slots.push({
        mesh: transformMesh(arch, { pos: [side * 0.39, -0.05, zAxle], rot: [0, Math.PI, 0] }),
        materialIndex: 0
      });
    }
    // Side Venturi air-intake scoop + ground-effect carbon-slate skirt
    slots.push(
      {
        mesh: transformMesh(bevelBoxMesh(0.085, 0.11, 0.36, 0.022), {
          pos: [side * 0.405, -0.04, 0.04],
          rot: [0, -side * 0.08, 0]
        }),
        materialIndex: 4
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.068, 0.046, 0.68, 0.012), { pos: [side * 0.415, -0.15, 0] }),
        materialIndex: 4
      }
    );
  }

  // Contoured wraparound smoked glass GT cockpit dome + visible helmeted pilot bust & glowing HUD visor
  const canopy = subdivideSmoothMesh(
    sculptStreamlinedHullMesh(0.68, 0.54, 0.23, {
      noseSharpness: 0.92,
      tailTaper: 0.68,
      canopyBulge: 0.3,
      undersideFlat: 0.9,
      stations: 11,
      ringPoints: 14
    }),
    1,
    0.45
  );
  slots.push(
    {
      mesh: transformMesh(canopy, { pos: [0, 0.135, 0.02], rot: [0, Math.PI, 0] }),
      materialIndex: 1
    },
    // Roof NACA ram-air snorkel scoop + dorsal shark-fin stabilizer
    {
      mesh: transformMesh(bevelBoxMesh(0.11, 0.058, 0.24, 0.016), { pos: [0, 0.245, 0.12], rot: [-0.08, 0, 0] }),
      materialIndex: 3
    },
    {
      mesh: transformMesh(
        extrudePolygonMesh(
          [
            [-0.08, 0],
            [0.24, 0],
            [0.22, 0.11],
            [0.02, 0.09]
          ],
          0.02,
          0.004,
          true
        ),
        { pos: [0, 0.19, 0.24], rot: [0, -Math.PI * 0.5, 0] }
      ),
      materialIndex: 3
    },
    ...buildCockpitPilotBustSlots([0, 0.195, -0.05], 0.72, 3, 5)
  );

  // Front aero splitter + hood NACA vent + rear twin-tunnel Venturi diffuser + multi-element swan-neck GT wing
  slots.push(
    { mesh: transformMesh(bevelBoxMesh(0.84, 0.038, 0.2, 0.01), { pos: [0, -0.158, -0.59] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.34, 0.024, 0.22, 0.006), { pos: [0, 0.092, -0.36], rot: [0.18, 0, 0] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.78, 0.072, 0.17, 0.016), { pos: [0, -0.132, 0.595] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.86, 0.032, 0.2, 0.009), { pos: [0, 0.248, 0.545], rot: [0.14, 0, 0] }), materialIndex: 4 }
  );
  const strutPoly: V2[] = [
    [-0.06, 0],
    [0.07, 0],
    [0.04, 0.18],
    [-0.04, 0.18]
  ];
  const exhaustBell = latheMesh(
    [
      [0, 0],
      [0.048, 0],
      [0.056, 0.06],
      [0.044, 0.1],
      [0, 0.1]
    ],
    14,
    false
  );
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(extrudePolygonMesh(strutPoly, 0.028, 0.005, true), {
          pos: [side * 0.24, 0.08, 0.52],
          rot: [0, Math.PI * 0.5, 0]
        }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.026, 0.13, 0.23, 0.006), { pos: [side * 0.43, 0.245, 0.545] }),
        materialIndex: 0
      },
      // Twin titanium turbo exhausts + glowing afterburner rings at +Z rear
      {
        mesh: transformMesh(exhaustBell, { pos: [side * 0.145, -0.105, 0.58], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(gyroRingRaw(0.042, 0.01, Math.PI * 0.5, 0, 12), { pos: [side * 0.145, -0.105, 0.675] }),
        materialIndex: 5
      }
    );
  }

  // Crisp angled LED blade headlamps (-Z) & full-width cyber GT lightbar (+Z)
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.18, 0.036, 0.055, 0.009), {
        pos: [side * 0.265, -0.018, -0.618],
        rot: [0, side * 0.22, -side * 0.08]
      }),
      materialIndex: 5
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.72, 0.038, 0.042, 0.009), { pos: [0, 0.035, 0.628] }),
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

  // Sleek contoured supersonic stealth fuselage oriented nose-forward along -Z (`rot: [0, Math.PI, 0]`)
  const fuselage = subdivideSmoothMesh(
    sculptStreamlinedHullMesh(1.36, 0.4, 0.29, {
      noseSharpness: 1.18,
      tailTaper: 0.72,
      canopyBulge: 0.32,
      undersideFlat: 0.52,
      stations: 14,
      ringPoints: 16
    }),
    1,
    0.42
  );
  slots.push({
    mesh: transformMesh(fuselage, { pos: [0, -0.02, 0], rot: [0, Math.PI, 0] }),
    materialIndex: 0
  });

  // Precision lathed brass pitot/radome nose cone at -Z
  const radome = latheMesh(
    [
      [0, 0],
      [0.095, 0],
      [0.068, 0.11],
      [0.024, 0.21],
      [0, 0.24]
    ],
    18,
    false
  );
  slots.push({
    mesh: transformMesh(radome, { pos: [0, -0.02, -0.58], rot: [-Math.PI * 0.5, 0, 0] }),
    materialIndex: 2
  });

  // Bubble fighter cockpit canopy + visible helmeted flight pilot & glowing cyan HUD visor
  const canopy = subdivideSmoothMesh(
    sculptStreamlinedHullMesh(0.56, 0.25, 0.18, {
      noseSharpness: 0.95,
      tailTaper: 0.85,
      canopyBulge: 0.36,
      undersideFlat: 0.85,
      stations: 10,
      ringPoints: 14
    }),
    1,
    0.48
  );
  slots.push(
    {
      mesh: transformMesh(canopy, { pos: [0, 0.108, -0.11], rot: [0, Math.PI, 0] }),
      materialIndex: 4
    },
    ...buildCockpitPilotBustSlots([0, 0.145, -0.12], 0.64, 1, 5)
  );

  // Forward aero canards + swept cranked-arrow delta wings + twin wingtip ducted turbo-rotors + canted V-tails
  for (const side of [-1, 1] as const) {
    const canardPoly: V2[] = [
      [side * 0.08, -0.44],
      [side * 0.26, -0.31],
      [side * 0.24, -0.24],
      [side * 0.08, -0.3]
    ];
    const wingPoly: V2[] = [
      [side * 0.12, -0.26],
      [side * 0.525, 0.24],
      [side * 0.505, 0.44],
      [side * 0.11, 0.41]
    ];
    const wingTrimPoly: V2[] = [
      [side * 0.15, -0.22],
      [side * 0.51, 0.25],
      [side * 0.49, 0.31],
      [side * 0.15, -0.14]
    ];
    const vTailPoly: V2[] = [
      [0, 0],
      [0.24, 0.12],
      [0.19, 0.34],
      [0.03, 0.32]
    ];
    slots.push(
      {
        mesh: transformMesh(extrudePolygonMesh(canardPoly, 0.024, 0.005, true), {
          pos: [0, -0.015, 0],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(extrudePolygonMesh(wingPoly, 0.036, 0.009, true), {
          pos: [0, -0.035, 0.04],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(extrudePolygonMesh(wingTrimPoly, 0.042, 0.006, true), {
          pos: [0, -0.031, 0.04],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 5
      },
      {
        mesh: transformMesh(extrudePolygonMesh(vTailPoly, 0.028, 0.006, true), {
          pos: [side * 0.12, 0.04, 0.34],
          rot: [0, Math.PI * 0.5, -side * 0.52]
        }),
        materialIndex: 1
      }
    );

    // Wingtip shrouded tilt-rotor nacelle (`x = ±0.43, z = 0.33`) with glowing cyan intake ring & 3 blades
    const rotorX = side * 0.43;
    const rotorZ = 0.34;
    slots.push(
      { mesh: transformMesh(gyroRingRaw(0.115, 0.02, 0, 0, 14), { pos: [rotorX, -0.02, rotorZ] }), materialIndex: 1 },
      { mesh: transformMesh(gyroRingRaw(0.102, 0.009, 0, 0, 12), { pos: [rotorX, 0.002, rotorZ] }), materialIndex: 5 },
      {
        mesh: transformMesh(
          latheMesh([[0, 0], [0.034, 0], [0.026, 0.055], [0, 0.064]], 12, false),
          { pos: [rotorX, -0.04, rotorZ] }
        ),
        materialIndex: 2
      }
    );
    for (let rb = 0; rb < 3; rb += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.19, 0.009, 0.026, 0.003), {
          pos: [rotorX, -0.018, rotorZ],
          rot: [0, (rb / 3) * Math.PI + 0.25, 0]
        }),
        materialIndex: 3
      });
    }
  }

  // Shrouded dorsal turbo-rotor lift fan + 4 sculpted rotor blades
  slots.push(
    { mesh: transformMesh(gyroRingRaw(0.185, 0.022, 0, 0, 16), { pos: [0, 0.168, 0.22] }), materialIndex: 1 },
    { mesh: transformMesh(gyroRingRaw(0.168, 0.01, 0, 0, 14), { pos: [0, 0.182, 0.22] }), materialIndex: 5 },
    {
      mesh: transformMesh(
        latheMesh(
          [
            [0, 0],
            [0.055, 0],
            [0.045, 0.075],
            [0, 0.085]
          ],
          14,
          false
        ),
        { pos: [0, 0.14, 0.22] }
      ),
      materialIndex: 2
    }
  );
  for (let b = 0; b < 4; b += 1) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.32, 0.012, 0.036, 0.004), {
        pos: [0, 0.175, 0.22],
        rot: [0, (b / 4) * Math.PI + 0.35, 0]
      }),
      materialIndex: 3
    });
  }

  // Twin lathed Venturi plasma thrusters + cyan afterburner rings at +Z tail
  const nozzle = latheMesh(
    [
      [0, 0],
      [0.088, 0],
      [0.105, 0.08],
      [0.082, 0.16],
      [0, 0.16]
    ],
    16,
    false
  );
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(nozzle, { pos: [side * 0.115, -0.02, 0.52], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(gyroRingRaw(0.078, 0.016, Math.PI * 0.5, 0, 12), {
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
      SPRINT_MATERIALS.sphereCarPaint,
      SPRINT_MATERIALS.slateBrushedMetal,
      SPRINT_MATERIALS.champagneStudioMetal,
      SPRINT_MATERIALS.brassStudioMetal,
      SPRINT_MATERIALS.cockpitSmokePaint,
      SPRINT_MATERIALS.boostCyanEmissive
    ];
    const slots = memoizeGeometry(`sss-morph-player-0:v4:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
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
      SPRINT_MATERIALS.cubeClearcoat,
      SPRINT_MATERIALS.cockpitSmokePaint,
      SPRINT_MATERIALS.tireBlackRubber,
      SPRINT_MATERIALS.champagneStudioMetal,
      SPRINT_MATERIALS.slateBrushedMetal,
      SPRINT_MATERIALS.stencilCubeEmissive
    ];
    const slots = memoizeGeometry(`sss-morph-player-1:v4:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
      fitSlotsWithinEnvelope(buildSolarGtCoupeMorphSlots(), maxSpanX, maxSpanY)
    );
    return assembleMultiMaterialNode(id, slots, mats, {
      id,
      castShadow: true,
      receiveShadow: true
    });
  }

  const mats: readonly AuraMaterialSpec[] = [
    SPRINT_MATERIALS.coneLacquer,
    SPRINT_MATERIALS.champagneStudioMetal,
    SPRINT_MATERIALS.brassStudioMetal,
    SPRINT_MATERIALS.slateBrushedMetal,
    SPRINT_MATERIALS.cockpitSmokePaint,
    SPRINT_MATERIALS.boostCyanEmissive
  ];
  const slots = memoizeGeometry(`sss-morph-player-2:v4:${maxSpanX.toFixed(3)}:${maxSpanY.toFixed(3)}`, () =>
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
 * - `variant === 0`: **Spiral Auger Drill-Boat Pacer** — sleek `sculptStreamlinedHullMesh` hydro-planing hull +
 *   twin catamaran hydrofoil sponsons + lathed conical titanium bore head wrapped with dual-start helical
 *   `tubeSweepMesh` spiral auger flutes + smoked bubble cockpit + helmeted pilot bust + twin rear Venturi thrusters.
 * - `variant === 1`: **Plum/Coral Rival Aero-Coupe Pacer** — sculpted streamlined GT/glider pacer with
 *   helmeted pilot bust, swept aero bodywork, and 4 `wheelAssemblySlots`.
 */
export function buildRivalMorphPacerNode(id: string, variant: 0 | 1): GroupNodeBuilder {
  if (variant === 0) {
    const mats: readonly AuraMaterialSpec[] = [
      SPRINT_MATERIALS.coralPaint,
      SPRINT_MATERIALS.champagneStudioMetal,
      SPRINT_MATERIALS.brassStudioMetal,
      SPRINT_MATERIALS.slateBrushedMetal,
      SPRINT_MATERIALS.cockpitSmokePaint,
      SPRINT_MATERIALS.boostCyanEmissive
    ];
    const slots = memoizeGeometry("sss-rival-drill-boat-v3", () => {
      const s: MultiMatSlot[] = [];
      // Sleek hydro-planing monohull facing -Z
      const planingHull = subdivideSmoothMesh(
        sculptStreamlinedHullMesh(1.38, 0.72, 0.32, {
          noseSharpness: 0.9,
          tailTaper: 0.58,
          canopyBulge: 0.28,
          undersideFlat: 0.78,
          stations: 12,
          ringPoints: 14
        }),
        1,
        0.42
      );
      s.push({
        mesh: transformMesh(planingHull, { pos: [0, 0.02, 0.14], rot: [0, Math.PI, 0] }),
        materialIndex: 0
      });
      // Twin catamaran hydrofoil sponsons + glowing cyan hydrofoil intake strips
      for (const side of [-1, 1] as const) {
        const sponson = sculptStreamlinedHullMesh(0.96, 0.18, 0.16, {
          noseSharpness: 1.05,
          tailTaper: 0.7,
          canopyBulge: 0.12,
          undersideFlat: 0.75,
          stations: 9,
          ringPoints: 10
        });
        s.push(
          {
            mesh: transformMesh(sponson, { pos: [side * 0.42, -0.06, 0.18], rot: [0, Math.PI, 0] }),
            materialIndex: 1
          },
          {
            mesh: transformMesh(bevelBoxMesh(0.032, 0.03, 0.52, 0.008), {
              pos: [side * 0.48, -0.04, 0.18]
            }),
            materialIndex: 5
          }
        );
      }
      // Smoked bubble fighter canopy + helmeted hydro-pilot bust inside
      const canopy = subdivideSmoothMesh(
        sculptStreamlinedHullMesh(0.58, 0.38, 0.2, {
          noseSharpness: 0.9,
          tailTaper: 0.76,
          canopyBulge: 0.32,
          undersideFlat: 0.88,
          stations: 10,
          ringPoints: 12
        }),
        1,
        0.46
      );
      s.push(
        { mesh: transformMesh(canopy, { pos: [0, 0.16, 0.12], rot: [0, Math.PI, 0] }), materialIndex: 4 },
        ...buildCockpitPilotBustSlots([0, 0.205, 0.08], 0.68, 1, 5)
      );

      // Precision lathed conical titanium bore head at -Z bow + brass drive collar
      const augerCone = latheMesh(
        [
          [0, 0],
          [0.24, 0],
          [0.21, 0.14],
          [0.14, 0.34],
          [0.06, 0.52],
          [0, 0.62]
        ],
        20,
        false
      );
      s.push(
        {
          mesh: transformMesh(augerCone, { pos: [0, 0.02, -0.46], rot: [-Math.PI * 0.5, 0, 0] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(gyroRingRaw(0.245, 0.028, Math.PI * 0.5, 0, 16), { pos: [0, 0.02, -0.46] }),
          materialIndex: 2
        }
      );

      // Dual-start helical spiral auger cutting flutes (`tubeSweepMesh`)
      for (const startPhase of [0, Math.PI] as const) {
        const helixPts: V4[] = [];
        const steps = 18;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const ang = startPhase + t * TAU * 2.25;
          const rad = (1 - t * 0.88) * 0.235;
          const z = -0.47 - t * 0.56;
          const fluteR = (1 - t * 0.65) * 0.028 + 0.006;
          helixPts.push([Math.cos(ang) * rad, 0.02 + Math.sin(ang) * rad, z, fluteR]);
        }
        s.push({ mesh: tubeSweepMesh(helixPts, 7, true), materialIndex: 2 });
      }

      // Twin rear hydro-jet thrusters
      for (const side of [-1, 1] as const) {
        s.push(
          {
            mesh: transformMesh(
              latheMesh(
                [
                  [0, 0],
                  [0.09, 0],
                  [0.11, 0.1],
                  [0.08, 0.16],
                  [0, 0.16]
                ],
                14,
                false
              ),
              { pos: [side * 0.18, 0.0, 0.72], rot: [Math.PI * 0.5, 0, 0] }
            ),
            materialIndex: 3
          },
          {
            mesh: transformMesh(gyroRingRaw(0.08, 0.016, Math.PI * 0.5, 0, 12), {
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
    SPRINT_MATERIALS.plumLacquer,
    SPRINT_MATERIALS.cockpitSmokePaint,
    SPRINT_MATERIALS.tireBlackRubber,
    SPRINT_MATERIALS.champagneStudioMetal,
    SPRINT_MATERIALS.slateBrushedMetal,
    SPRINT_MATERIALS.stencilTorusEmissive
  ];
  const slots = memoizeGeometry("sss-rival-aero-coupe-v3", () =>
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

    const frameJson = assembleMultiMaterialNode("portal-proto", slots, mats, {
      castShadow: false,
      receiveShadow: false
    }).toJSON();
    return {
      frameSpec: frameJson.geometry ?? buildGroupedGeometrySpec(slots),
      frameMaterials: (frameJson.materials ?? mats) as readonly AuraMaterialSpec[],
      glassSpec: mergeRawMeshes(glassParts)
    };
  });

  const opaqueNode = geometry.multiMaterial(cached.frameSpec, cached.frameMaterials, {
    name: `${id}-frame`,
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

  const cached = memoizeGeometry(`sss-castle-island:${targetMaxDim.toFixed(2)}:${variant % 3}`, () => {
    const normalized = normalizeGroundedAssembly(slots, [], targetMaxDim);
    const proto = assembleMultiMaterialNode("castle-proto", normalized.slots, mats, {
      castShadow: false,
      receiveShadow: false
    }).toJSON();
    return {
      spec: proto.geometry ?? buildGroupedGeometrySpec(normalized.slots),
      materials: (proto.materials ?? mats) as readonly AuraMaterialSpec[]
    };
  });
  return geometry.multiMaterial(cached.spec, cached.materials, {
    name: id,
    castShadow: false,
    receiveShadow: false
  }).runtime({ id });
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

  const cached = memoizeGeometry(`sss-block-tower:${targetMaxDim.toFixed(2)}:${variant % 3}`, () => {
    const normalized = normalizeGroundedAssembly(slots, [], targetMaxDim);
    const proto = assembleMultiMaterialNode("tower-proto", normalized.slots, mats, {
      castShadow: false,
      receiveShadow: false
    }).toJSON();
    return {
      spec: proto.geometry ?? buildGroupedGeometrySpec(normalized.slots),
      materials: (proto.materials ?? mats) as readonly AuraMaterialSpec[]
    };
  });
  return geometry.multiMaterial(cached.spec, cached.materials, {
    name: id,
    castShadow: false,
    receiveShadow: false
  }).runtime({ id });
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

  const cached = memoizeGeometry(`sss-viaduct-station:${index % 6}`, () => {
    const proto = assembleMultiMaterialNode("viaduct-proto", slots, mats, {
      castShadow: false,
      receiveShadow: false
    }).toJSON();
    return {
      structSpec: proto.geometry ?? buildGroupedGeometrySpec(slots),
      structMaterials: (proto.materials ?? mats) as readonly AuraMaterialSpec[],
      crystalSpec: mergeRawMeshes(glassCaps)
    };
  });

  const children: GroupChildInput[] = [
    geometry.multiMaterial(cached.structSpec, cached.structMaterials, {
      name: `${id}-structure`,
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
