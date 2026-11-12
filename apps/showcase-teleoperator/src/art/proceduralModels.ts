/**
 * Procedural multi-material 3D vehicle, SF landmark, and streetscape sculpting library
 * for Grid Dispatch (`apps/showcase-teleoperator`, WP-04).
 *
 * Replaces all 23 static clay GLB models with smooth-normal lofted AV fleet hulls,
 * historic Powell-Mason cable cars, 6 San Francisco traffic classes, 10 iconic bay-city
 * architectural landmarks & street props, and WebGPU-safe clearcoated glazing built purely
 * from `showcase-port-shared/proceduralKernel` + `@aura3d/engine` (zero `three` imports).
 *
 * Coordinate & simulation contract (`src/rules.ts`, `src/sim.ts`, `src/carMotion.ts`):
 * - Vehicles face `-Z` (`yaw = 0` for `direction === 1`), `+X` is right, `+Y` is up, `minY = 0`.
 * - Headlights sit on `-Z`; conformal & sculpted rear LED brake/tail lightbars sit on `+Z`.
 * - Street-front buildings (`sf-bldg-l/r-*`) orient their primary street facade toward `+Z`
 *   so `main.ts` (`+pi/2` left, `-pi/2` right) aims bays, stoops, and storefronts at the road.
 */
import {
  geometry,
  group,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride
} from "@aura3d/engine";

type GroupNodeBuilder = ReturnType<typeof group>;

import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";

import type { GridAssetKey } from "../aura-assets";
import { BRAKE_RED, SODIUM, type SkyLook } from "../look";
import { PLAYABLE_FLEET, type PlayableCarId } from "../rules";

// ---------------------------------------------------------------------------
// Physical Multi-Lobe Material Library (WebGPU-Safe Glazing & Practicals)
// ---------------------------------------------------------------------------

/** WebGPU-safe clearcoated automotive glazing & optical lidar lens (`castShadow: false`). */
export function avGlazingMaterial(color = "#cde6f5", opacity = 0.42): AuraMaterialSpec {
  return material.physical({
    name: "av-glazing",
    color,
    roughness: 0.04,
    metallic: 0,
    opacity,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.5
  });
}

export const TELEOP_MATERIALS = {
  podPearl: material.carPaint({ name: "av-pod-pearl", color: "#eef2f6", roughness: 0.18, metallic: 0.24, clearcoat: 1, clearcoatRoughness: 0.03 }),
  crossoverSilver: material.carPaint({ name: "av-crossover-silver", color: "#cbd5e1", roughness: 0.22, metallic: 0.62, clearcoat: 1, clearcoatRoughness: 0.03 }),
  shuttleTitanium: material.carPaint({ name: "av-shuttle-titanium", color: "#dfe6ee", roughness: 0.2, metallic: 0.38, clearcoat: 1, clearcoatRoughness: 0.04 }),
  champagneGold: material.carPaint({ name: "av-champagne-gold", color: "#e8c27a", roughness: 0.22, metallic: 0.68, clearcoat: 1, clearcoatRoughness: 0.03 }),
  gtCrimson: material.carPaint({ name: "av-gt-crimson", color: "#991b1b", roughness: 0.2, metallic: 0.66, clearcoat: 1, clearcoatRoughness: 0.02 }),
  volcanicAmber: material.carPaint({ name: "av-volcanic-amber", color: "#d95b16", roughness: 0.22, metallic: 0.64, clearcoat: 1, clearcoatRoughness: 0.025 }),
  interceptorCobalt: material.carPaint({ name: "av-interceptor-cobalt", color: "#1e3a5f", roughness: 0.22, metallic: 0.6, clearcoat: 1, clearcoatRoughness: 0.03 }),
  responseWhite: material.carPaint({ name: "av-response-white", color: "#f1f5f9", roughness: 0.2, metallic: 0.22, clearcoat: 1, clearcoatRoughness: 0.03 }),
  cableRedwood: material.carPaint({ name: "sf-cable-redwood", color: "#b3262b", roughness: 0.26, metallic: 0.14, clearcoat: 0.92, clearcoatRoughness: 0.05 }),
  cableCream: material.ceramic({ name: "sf-cable-cream", color: "#f3e5c8", roughness: 0.24, clearcoat: 0.72, clearcoatRoughness: 0.08 }),
  cableTeak: material.lacquer({ name: "sf-cable-teak", color: "#6b3418", roughness: 0.32, clearcoat: 0.95, clearcoatRoughness: 0.04 }),
  semiStainless: material.brushedMetal({ name: "av-semi-stainless", color: "#cbd5e1", roughness: 0.24, metallic: 0.86 }),
  darkTrim: material.pbr({ name: "av-satin-trim", color: "#151921", roughness: 0.42, metalness: 0.24 }),
  sensorHousing: material.pbr({ name: "av-sensor-pod", color: "#0f141c", roughness: 0.24, metalness: 0.48 }),
  tireRubber: material.blackRubber({ name: "av-tire-rubber", color: "#14171c", roughness: 0.9 }),
  forgedRim: material.chrome({ name: "av-forged-alloy", color: "#dbe4ee", roughness: 0.14, metallic: 0.92 }),
  brakeRotor: material.brushedMetal({ name: "av-brake-rotor", color: "#64748b", roughness: 0.34, metallic: 0.82 }),
  polishedBrass: material.metal({ name: "sf-polished-brass", color: "#c8a04b", roughness: 0.2, metallic: 0.9, clearcoat: 0, sheen: 0 }),
  headlampWarm: material.emissive({ name: "av-headlamp", color: "#fff6e0", emissive: "#ffe9b8", emissiveIntensity: 2.2, practical: true }),
  taillampRuby: material.emissive({ name: "av-taillamp", color: BRAKE_RED, emissive: BRAKE_RED, emissiveIntensity: 1.9, practical: true }),
  tealBeacon: material.emissive({ name: "av-teal-status", color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.85, practical: true }),
  amberStrobe: material.emissive({ name: "av-amber-strobe", color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 1.9, practical: true }),
  violetStrobe: material.emissive({ name: "av-violet-strobe", color: "#c084fc", emissive: "#a855f7", emissiveIntensity: 1.75, practical: true }),
  bridgeOrange: material.pbr({ name: "sf-international-orange", color: "#c0362c", roughness: 0.54, metalness: 0.28, clearcoat: 0, sheen: 0 }),
  quartzConcrete: material.ceramic({ name: "sf-quartz-concrete", color: "#e2e6ec", roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.24 }),
  sandstoneWarm: material.ceramic({ name: "sf-colusa-sandstone", color: "#d6c5ad", roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.28 }),
  granitePier: material.pbr({ name: "sf-granite-pier", color: "#64748b", roughness: 0.78, metalness: 0.08, clearcoat: 0, sheen: 0 }),
  glazingClear: avGlazingMaterial("#cde6f5", 0.42),
  glazingSkyline: avGlazingMaterial("#8cb8d8", 0.46)
} as const;

/** Instancing-safe (`clearcoat: 0, sheen: 0`) street-furniture & foliage materials for pools with `> 16` instances. */
export const INSTANCED_STREET_MATERIALS = {
  gantrySteel: material.metal({ name: "sf-gantry-steel", color: "#334155", roughness: 0.34, metallic: 0.76, clearcoat: 0, sheen: 0 }),
  castIronPole: material.metal({ name: "sf-cast-iron", color: "#1e293b", roughness: 0.42, metallic: 0.68, clearcoat: 0, sheen: 0 }),
  treeBark: material.pbr({ name: "sf-london-plane-bark", color: "#524135", roughness: 0.9, metalness: 0.02, clearcoat: 0, sheen: 0 }),
  treeFoliage: material.pbr({ name: "sf-street-foliage", color: "#23633b", roughness: 0.82, metalness: 0.02, clearcoat: 0, sheen: 0 }),
  parkedCoat: material.pbr({ name: "sf-parked-coat", color: "#ffffff", roughness: 0.32, metalness: 0.28, clearcoat: 0, sheen: 0 })
} as const;

/** Upgraded physical fabric sheen + specular trims for the preserved rigged commuter (`assets.gridPassenger`). */
export function passengerMaterialOverrides(): readonly AuraModelMaterialOverride[] {
  return [
    { roughness: 0.72, metallic: 0.04, sheen: 0.52, sheenRoughness: 0.58, sheenColor: "#cbd5e1", clearcoat: 0.08, clearcoatRoughness: 0.35 }
  ];
}

// ---------------------------------------------------------------------------
// Node Assembly, Vertex-Color & Smooth Automotive Lofting Helpers
// ---------------------------------------------------------------------------

interface ColoredRawMesh extends RawMesh {
  readonly colors?: Float32Array;
}

function tintRawMesh(mesh: RawMesh, hex: string): ColoredRawMesh {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const vCount = mesh.positions.length / 3;
  const colors = new Float32Array(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const o = i * 4;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = 1;
  }
  return { ...mesh, colors };
}

function mergeColoredMeshesToSpec(parts: readonly ColoredRawMesh[]): AuraCustomGeometrySpec {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 4);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const vc = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (p.colors && p.colors.length === vc * 4) colors.set(p.colors, vOff * 4);
    else colors.fill(1, vOff * 4, (vOff + vc) * 4);
    for (let k = 0; k < p.indices.length; k += 1) indices[iOff + k] = p.indices[k]! + vOff;
    vOff += vc;
    iOff += p.indices.length;
  }
  return geometry.define({ positions, normals, uvs, colors, indices, bounds: computePositionsBounds(positions) });
}

/**
 * Assembles opaque multi-material coachwork/structure (`castShadow` enabled by default) paired with
 * a dedicated `castShadow: false` clearcoat glazing child so WebGPU shadow maps stay 100% artifact-free.
 */
function assembleGlazedMultiMaterialNode(
  name: string,
  opaqueSlots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  glassMeshes: readonly RawMesh[],
  options: {
    readonly id?: string;
    readonly tags?: readonly string[];
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly glassMaterial?: AuraMaterialSpec;
    readonly shadowMaterialIndices?: readonly number[];
  } = {}
): GroupNodeBuilder {
  const cast = options.castShadow ?? true;
  const receive = options.receiveShadow ?? true;
  const casterSet = new Set(options.shadowMaterialIndices ?? [0]);
  const children = [];
  if (cast) {
    const casterSlots = opaqueSlots.filter((s) => casterSet.has(s.materialIndex));
    const detailSlots = opaqueSlots.filter((s) => !casterSet.has(s.materialIndex));
    if (casterSlots.length > 0) {
      children.push(
        geometry.multiMaterial(buildGroupedGeometrySpec(casterSlots), materials, {
          name: `${name}-opaque`,
          castShadow: true,
          receiveShadow: receive
        })
      );
    }
    if (detailSlots.length > 0) {
      children.push(
        geometry.multiMaterial(buildGroupedGeometrySpec(detailSlots), materials, {
          name: `${name}-detail`,
          castShadow: false,
          receiveShadow: receive
        })
      );
    }
  } else if (opaqueSlots.length > 0) {
    children.push(
      geometry.multiMaterial(buildGroupedGeometrySpec(opaqueSlots), materials, {
        name: `${name}-opaque`,
        castShadow: false,
        receiveShadow: receive
      })
    );
  }
  if (glassMeshes.length > 0) {
    children.push(
      geometry.custom(mergeRawMeshes(glassMeshes), {
        name: `${name}-glazing`,
        material: options.glassMaterial ?? TELEOP_MATERIALS.glazingClear,
        castShadow: false,
        receiveShadow: receive
      })
    );
  }
  let root = group(name, children, {
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.scale !== undefined ? { scale: options.scale } : {})
  });
  if (options.id) {
    root = root.runtime({ id: options.id, ...(options.tags ? { tags: [...options.tags] } : {}) });
  }
  return root;
}
/**
 * 12-point smooth automotive cross-section ring at longitudinal station `z`:
 * rocker underbody -> lower sill -> flared wheel/shoulder beltline -> tumbled-home roof crown.
 */
function coachStationRing(opts: {
  readonly z: number;
  readonly yBottom: number;
  readonly yBelt: number;
  readonly yTop: number;
  readonly halfWidthBottom: number;
  readonly halfWidthBelt: number;
  readonly halfWidthTop: number;
  readonly crown?: number;
}): V3[] {
  const { z, yBottom, yBelt, yTop, halfWidthBottom, halfWidthBelt, halfWidthTop } = opts;
  const crown = opts.crown ?? 0.04;
  const yLow = yBottom + (yBelt - yBottom) * 0.34;
  const yHigh = yBelt + (yTop - yBelt) * 0.68;
  const hwLow = halfWidthBottom + (halfWidthBelt - halfWidthBottom) * 0.78;
  const hwHigh = halfWidthTop + (halfWidthBelt - halfWidthTop) * 0.42;
  return [
    [0, yBottom, z],
    [hwLow * 0.72, yBottom + 0.015, z],
    [hwLow, yLow, z],
    [halfWidthBelt, yBelt, z],
    [hwHigh, yHigh, z],
    [halfWidthTop * 0.74, yTop, z],
    [0, yTop + crown, z],
    [-halfWidthTop * 0.74, yTop, z],
    [-hwHigh, yHigh, z],
    [-halfWidthBelt, yBelt, z],
    [-hwLow, yLow, z],
    [-hwLow * 0.72, yBottom + 0.015, z]
  ];
}

const SPEC_CACHE = new Map<string, AuraCustomGeometrySpec>();
const WHEEL_CACHE = new Map<string, readonly MultiMatSlot[]>();

function memoGeometrySpec(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;
  const built = build();
  SPEC_CACHE.set(key, built);
  return built;
}

function pushWheelSet(
  slots: MultiMatSlot[],
  opts: {
    readonly trackHalfX: number;
    readonly axleZs: readonly number[];
    readonly radius: number;
    readonly width: number;
    readonly spokeCount?: number;
    readonly tireMat: number;
    readonly rimMat: number;
    readonly rotorMat?: number;
  }
): void {
  const wheelKey = `${opts.radius}:${opts.width}:${opts.spokeCount ?? 5}:${opts.tireMat}:${opts.rimMat}:${opts.rotorMat ?? -1}`;
  let unitWheel = WHEEL_CACHE.get(wheelKey);
  if (!unitWheel) {
    unitWheel = wheelAssemblySlots({
      radius: opts.radius,
      width: opts.width,
      spokeCount: opts.spokeCount ?? 5,
      tireMat: opts.tireMat,
      rimMat: opts.rimMat,
      rotorMat: opts.rotorMat
    });
    WHEEL_CACHE.set(wheelKey, unitWheel);
  }
  for (const az of opts.axleZs) {
    for (const side of [-1, 1] as const) {
      for (const s of unitWheel) {
        slots.push({
          mesh: transformMesh(s.mesh, { pos: [side * opts.trackHalfX, opts.radius, az] }),
          materialIndex: s.materialIndex
        });
      }
    }
  }
}

function pushLidarPuck(
  slots: MultiMatSlot[],
  glassMeshes: RawMesh[],
  pos: V3,
  radius: number,
  height: number,
  housingMat: number,
  tealMat?: number
): void {
  const baseH = height * 0.38;
  const lensH = height * 0.42;
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [radius * 1.08, 0], [radius * 1.04, baseH], [radius * 0.92, baseH]], 18),
      { pos }
    ),
    materialIndex: housingMat
  });
  glassMeshes.push(
    transformMesh(
      latheMesh([[radius * 0.92, baseH], [radius * 0.95, baseH + lensH * 0.5], [radius * 0.88, baseH + lensH]], 18),
      { pos }
    )
  );
  slots.push({
    mesh: transformMesh(
      latheMesh([[radius * 0.88, baseH + lensH], [radius * 0.94, height], [0, height + radius * 0.14]], 18),
      { pos }
    ),
    materialIndex: housingMat
  });
  if (tealMat !== undefined) {
    slots.push({
      mesh: transformMesh(
        latheMesh([[radius * 0.96, baseH + lensH * 0.35], [radius * 0.99, baseH + lensH * 0.5], [radius * 0.96, baseH + lensH * 0.65]], 16),
        { pos }
      ),
      materialIndex: tealMat
    });
  }
}

// ---------------------------------------------------------------------------
// 7 Sculpted AV Fleet Archetypes (Smooth-Normal Lofted Coachwork)
// ---------------------------------------------------------------------------

/** 1. Bidirectional Robotaxi Pod (`cruiser`, 3.90 m): roof lidar bridge, 4 corner sensor pucks & wraparound glass. */
export function buildBidirectionalRobotaxiPodNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
} = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.podPearl,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  // Symmetrical capsule lower & upper carriage (`z in [-1.92, +1.92]`, belt at 0.86 m, roof at 2.18 m)
  const hullSections: V3[][] = [
    coachStationRing({ z: -1.92, yBottom: 0.28, yBelt: 0.72, yTop: 1.48, halfWidthBottom: 0.58, halfWidthBelt: 0.74, halfWidthTop: 0.56, crown: 0.04 }),
    coachStationRing({ z: -1.62, yBottom: 0.22, yBelt: 0.84, yTop: 1.98, halfWidthBottom: 0.78, halfWidthBelt: 0.89, halfWidthTop: 0.74, crown: 0.06 }),
    coachStationRing({ z: -0.95, yBottom: 0.2, yBelt: 0.88, yTop: 2.16, halfWidthBottom: 0.84, halfWidthBelt: 0.91, halfWidthTop: 0.79, crown: 0.06 }),
    coachStationRing({ z: 0, yBottom: 0.2, yBelt: 0.88, yTop: 2.18, halfWidthBottom: 0.84, halfWidthBelt: 0.91, halfWidthTop: 0.8, crown: 0.06 }),
    coachStationRing({ z: 0.95, yBottom: 0.2, yBelt: 0.88, yTop: 2.16, halfWidthBottom: 0.84, halfWidthBelt: 0.91, halfWidthTop: 0.79, crown: 0.06 }),
    coachStationRing({ z: 1.62, yBottom: 0.22, yBelt: 0.84, yTop: 1.98, halfWidthBottom: 0.78, halfWidthBelt: 0.89, halfWidthTop: 0.74, crown: 0.06 }),
    coachStationRing({ z: 1.92, yBottom: 0.28, yBelt: 0.72, yTop: 1.48, halfWidthBottom: 0.58, halfWidthBelt: 0.74, halfWidthTop: 0.56, crown: 0.04 })
  ];
  slots.push({ mesh: loftSectionsMesh(hullSections, true, false), materialIndex: 0 });

  // Wraparound panoramic glass belt (`y in [0.94, 1.96]`) slightly proud of coachwork
  const glassBand: V3[][] = [-1.66, -1.02, 0, 1.02, 1.66].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({
      z: z * 1.015,
      yBottom: 0.94,
      yBelt: 1.42,
      yTop: end ? 1.84 : 1.96,
      halfWidthBottom: end ? 0.76 : 0.915,
      halfWidthBelt: end ? 0.78 : 0.89,
      halfWidthTop: end ? 0.68 : 0.81,
      crown: 0.02
    });
  });
  glass.push(loftSectionsMesh(glassBand, true, false));

  // Lower obsidian rocker skirt, twin sliding door split-rails & roof sensor bridge under spinning crown (`y = 2.54 m`)
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.78, 0.16, 3.46, 0.03), { pos: [0, 0.24, 0] }), materialIndex: 1 });
  for (const sx of [-0.912, 0.912]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.03, 1.42, 0.05, 0.008), { pos: [sx, 1.24, 0] }), materialIndex: 1 });
  }
  const bridgeSec: V3[][] = [-0.62, -0.16, 0.34].map((z, idx) =>
    coachStationRing({
      z,
      yBottom: 2.18,
      yBelt: 2.38,
      yTop: idx === 1 ? 2.53 : 2.44,
      halfWidthBottom: 0.42,
      halfWidthBelt: 0.34,
      halfWidthTop: 0.22,
      crown: 0.015
    })
  );
  slots.push({ mesh: loftSectionsMesh(bridgeSec, true, false), materialIndex: 2 });

  // 4 roof-corner lidar/camera sensor pods + teal autonomous status lightbands
  for (const sx of [-0.68, 0.68]) {
    for (const sz of [-1.42, 1.42]) {
      pushLidarPuck(slots, glass, [sx, 2.08, sz], 0.11, 0.16, 2, 8);
    }
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.32, 0.045, 0.06, 0.012), { pos: [0, 2.04, -1.64] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.32, 0.045, 0.06, 0.012), { pos: [0, 2.04, 1.64] }), materialIndex: 8 });

  // Matrix DRL headlights (`-Z`) & conformal-height rear LED tailbar (`+Z` at y = 0.83 m)
  for (const sx of [-0.52, 0.52]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.36, 0.085, 0.07, 0.018), { pos: [sx, 0.82, -1.89] }), materialIndex: 6 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.36, 0.09, 0.07, 0.02), { pos: [0, 0.83, 1.88] }), materialIndex: 7 });

  pushWheelSet(slots, { trackHalfX: 0.82, axleZs: [-1.26, 1.26], radius: 0.35, width: 0.23, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-robotaxi-pod", slots, mats, glass, options);
}

/** 2. Crossover AV (`coupe`, 4.00 m): sculpted EV crossover with roof lidar dome & radar pods. */
export function buildCrossoverAvNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
  readonly bodyMaterial?: AuraMaterialSpec;
} = {}): GroupNodeBuilder {
  const mats = [
    options.bodyMaterial ?? TELEOP_MATERIALS.crossoverSilver,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  const bodySec: V3[][] = [
    coachStationRing({ z: -1.98, yBottom: 0.26, yBelt: 0.62, yTop: 0.78, halfWidthBottom: 0.68, halfWidthBelt: 0.82, halfWidthTop: 0.68, crown: 0.03 }),
    coachStationRing({ z: -1.45, yBottom: 0.21, yBelt: 0.78, yTop: 0.96, halfWidthBottom: 0.86, halfWidthBelt: 0.96, halfWidthTop: 0.84, crown: 0.04 }),
    coachStationRing({ z: -0.62, yBottom: 0.2, yBelt: 0.88, yTop: 1.56, halfWidthBottom: 0.88, halfWidthBelt: 0.98, halfWidthTop: 0.76, crown: 0.05 }),
    coachStationRing({ z: 0.28, yBottom: 0.2, yBelt: 0.9, yTop: 1.64, halfWidthBottom: 0.88, halfWidthBelt: 0.98, halfWidthTop: 0.75, crown: 0.05 }),
    coachStationRing({ z: 1.24, yBottom: 0.22, yBelt: 0.92, yTop: 1.48, halfWidthBottom: 0.86, halfWidthBelt: 0.96, halfWidthTop: 0.7, crown: 0.04 }),
    coachStationRing({ z: 1.96, yBottom: 0.28, yBelt: 0.86, yTop: 1.14, halfWidthBottom: 0.72, halfWidthBelt: 0.84, halfWidthTop: 0.64, crown: 0.03 })
  ];
  slots.push({ mesh: loftSectionsMesh(bodySec, true, false), materialIndex: 0 });

  const cabinGlass: V3[][] = [
    coachStationRing({ z: -1.05, yBottom: 0.94, yBelt: 1.18, yTop: 1.48, halfWidthBottom: 0.82, halfWidthBelt: 0.79, halfWidthTop: 0.7, crown: 0.03 }),
    coachStationRing({ z: -0.15, yBottom: 0.96, yBelt: 1.32, yTop: 1.66, halfWidthBottom: 0.88, halfWidthBelt: 0.83, halfWidthTop: 0.73, crown: 0.04 }),
    coachStationRing({ z: 0.88, yBottom: 0.98, yBelt: 1.3, yTop: 1.56, halfWidthBottom: 0.85, halfWidthBelt: 0.8, halfWidthTop: 0.68, crown: 0.03 }),
    coachStationRing({ z: 1.58, yBottom: 1.0, yBelt: 1.18, yTop: 1.32, halfWidthBottom: 0.72, halfWidthBelt: 0.68, halfWidthTop: 0.6, crown: 0.02 })
  ];
  glass.push(loftSectionsMesh(cabinGlass, true, false));

  // Roof lidar crown fairing (`y = 1.79 m, z = -0.08 m`) + bumper & front-fender radar pods + side camera wings
  pushLidarPuck(slots, glass, [0, 1.64, -0.08], 0.17, 0.16, 2, 8);
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.11, 0], [0.09, 0.09], [0, 0.11]], 14), { pos: [0, 0.46, -1.97], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 });
  for (const sx of [-0.97, 0.97]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.07, 0.22, 0.02), { pos: [sx, 0.82, -1.12] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.06, 0.14, 0.018), { pos: [sx * 1.04, 1.04, -0.68] }), materialIndex: 1 });
  }

  slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.065, 0.07, 0.016), { pos: [0, 0.72, -1.95] }), materialIndex: 6 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.56, 0.085, 0.07, 0.018), { pos: [0, 0.87, 1.94] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.88, axleZs: [-1.28, 1.28], radius: 0.36, width: 0.24, spokeCount: 5, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-crossover", slots, mats, glass, options);
}
/** 3. Autonomous Origin Shuttle (`rival-car-0`, 3.90 m): flat-floor commuter shuttle with dual roof lidars. */
export function buildAutonomousShuttleNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly position?: V3;
} = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.shuttleTitanium,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  const bodySec: V3[][] = [-1.92, -1.68, -0.88, 0, 0.88, 1.68, 1.92].map((z, idx) => {
    const end = idx === 0 || idx === 6;
    return coachStationRing({
      z,
      yBottom: end ? 0.26 : 0.18,
      yBelt: 0.72,
      yTop: end ? 2.18 : 2.48,
      halfWidthBottom: end ? 0.72 : 0.88,
      halfWidthBelt: end ? 0.82 : 0.93,
      halfWidthTop: end ? 0.74 : 0.86,
      crown: 0.05
    });
  });
  slots.push({ mesh: loftSectionsMesh(bodySec, true, false), materialIndex: 0 });

  const vistaGlass: V3[][] = [-1.74, -0.95, 0, 0.95, 1.74].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({
      z: z * 1.012,
      yBottom: 0.76,
      yBelt: 1.52,
      yTop: end ? 2.08 : 2.26,
      halfWidthBottom: end ? 0.8 : 0.938,
      halfWidthBelt: end ? 0.81 : 0.92,
      halfWidthTop: end ? 0.75 : 0.86,
      crown: 0.02
    });
  });
  glass.push(loftSectionsMesh(vistaGlass, true, false));

  pushLidarPuck(slots, glass, [0, 2.5, -1.24], 0.16, 0.18, 2, 8);
  pushLidarPuck(slots, glass, [0, 2.5, 1.24], 0.16, 0.18, 2, 8);
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.54, 0.05, 0.07, 0.015), { pos: [0, 2.34, -1.78] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.075, 0.07, 0.018), { pos: [0, 0.64, -1.91] }), materialIndex: 6 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.52, 0.09, 0.07, 0.018), { pos: [0, 0.78, 1.91] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.84, axleZs: [-1.32, 1.32], radius: 0.34, width: 0.22, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-origin-shuttle", slots, mats, glass, options);
}

/** 4. Autonomous Sidewalk Delivery Bot (6-wheel kerbside courier pod with lidar puck & safety flag mast). */
export function deliveryBotSlotGroup(offset: V3, matMap: {
  readonly shell: number;
  readonly trim: number;
  readonly tire: number;
  readonly rim: number;
  readonly head: number;
  readonly tail: number;
  readonly beacon: number;
}): { readonly slots: MultiMatSlot[]; readonly glass: RawMesh[] } {
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];
  const podSec: V3[][] = [-0.56, -0.34, 0, 0.34, 0.56].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({
      z,
      yBottom: 0.14,
      yBelt: 0.42,
      yTop: end ? 0.64 : 0.74,
      halfWidthBottom: end ? 0.26 : 0.34,
      halfWidthBelt: end ? 0.32 : 0.38,
      halfWidthTop: end ? 0.24 : 0.32,
      crown: 0.03
    });
  });
  slots.push({ mesh: transformMesh(loftSectionsMesh(podSec, true, false), { pos: offset }), materialIndex: matMap.shell });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.54, 0.06, 0.66, 0.02), { pos: [offset[0], offset[1] + 0.76, offset[2] + 0.02] }), materialIndex: matMap.trim });
  pushLidarPuck(slots, glass, [offset[0], offset[1] + 0.79, offset[2] - 0.16], 0.075, 0.1, matMap.trim, matMap.beacon);

  // Flexible orange/teal visibility flag mast (`tubeSweepMesh`)
  const mast: V4[] = [
    [offset[0] + 0.24, offset[1] + 0.74, offset[2] + 0.28, 0.014],
    [offset[0] + 0.25, offset[1] + 1.18, offset[2] + 0.3, 0.011],
    [offset[0] + 0.27, offset[1] + 1.54, offset[2] + 0.34, 0.008]
  ];
  slots.push({ mesh: tubeSweepMesh(mast, 6), materialIndex: matMap.trim });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.02, 0.14, 0.22, 0.005), { pos: [offset[0] + 0.27, offset[1] + 1.48, offset[2] + 0.44] }), materialIndex: matMap.beacon });

  // Friendly dual LED eyes (`-Z`) & rear brake strip (`+Z`) + 6 bogie wheels
  for (const sx of [-0.14, 0.14]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.055, 0.04, 0.012), { pos: [offset[0] + sx, offset[1] + 0.48, offset[2] - 0.56] }), materialIndex: matMap.head });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.05, 0.04, 0.012), { pos: [offset[0], offset[1] + 0.46, offset[2] + 0.56] }), materialIndex: matMap.tail });

  const bogieWheel = wheelAssemblySlots({ radius: 0.12, width: 0.08, spokeCount: 5, tireMat: matMap.tire, rimMat: matMap.rim });
  for (const az of [-0.36, 0, 0.36]) {
    for (const side of [-1, 1] as const) {
      for (const s of bogieWheel) {
        slots.push({ mesh: transformMesh(s.mesh, { pos: [offset[0] + side * 0.35, offset[1] + 0.12, offset[2] + az] }), materialIndex: s.materialIndex });
      }
    }
  }
  return { slots, glass };
}

export function buildDeliveryBotNode(options: { readonly id?: string; readonly name?: string; readonly position?: V3 } = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.podPearl,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const { slots, glass } = deliveryBotSlotGroup([0, 0, 0], { shell: 0, trim: 1, tire: 2, rim: 3, head: 4, tail: 5, beacon: 6 });
  return assembleGlazedMultiMaterialNode(options.name ?? "av-delivery-bot", slots, mats, glass, options);
}

/** 5. Heavy AV Semi-Tractor (`truck`, 5.55 m): aero Class-8 cab, roof lidar array, tandem axles & fifth-wheel deck. */
export function buildHeavyAvSemiNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
} = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.semiStainless,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  // Streamlined bullet-nose cab (`z in [-2.74, +0.58]`, peak roof 2.08 m)
  const cabSec: V3[][] = [
    coachStationRing({ z: -2.74, yBottom: 0.32, yBelt: 0.86, yTop: 1.18, halfWidthBottom: 0.82, halfWidthBelt: 1.02, halfWidthTop: 0.84, crown: 0.04 }),
    coachStationRing({ z: -1.92, yBottom: 0.28, yBelt: 1.06, yTop: 1.72, halfWidthBottom: 0.98, halfWidthBelt: 1.11, halfWidthTop: 0.94, crown: 0.05 }),
    coachStationRing({ z: -0.78, yBottom: 0.28, yBelt: 1.14, yTop: 2.06, halfWidthBottom: 1.02, halfWidthBelt: 1.12, halfWidthTop: 0.98, crown: 0.06 }),
    coachStationRing({ z: 0.48, yBottom: 0.28, yBelt: 1.14, yTop: 2.08, halfWidthBottom: 1.02, halfWidthBelt: 1.12, halfWidthTop: 0.98, crown: 0.05 })
  ];
  slots.push({ mesh: loftSectionsMesh(cabSec, true, false), materialIndex: 0 });

  // Wraparound raked panoramic cab windshield
  const cabGlass: V3[][] = [
    coachStationRing({ z: -1.96, yBottom: 1.12, yBelt: 1.38, yTop: 1.66, halfWidthBottom: 0.92, halfWidthBelt: 0.88, halfWidthTop: 0.8, crown: 0.03 }),
    coachStationRing({ z: -0.96, yBottom: 1.16, yBelt: 1.54, yTop: 1.88, halfWidthBottom: 1.02, halfWidthBelt: 0.98, halfWidthTop: 0.9, crown: 0.03 }),
    coachStationRing({ z: 0.16, yBottom: 1.18, yBelt: 1.56, yTop: 1.88, halfWidthBottom: 1.02, halfWidthBelt: 0.98, halfWidthTop: 0.9, crown: 0.02 })
  ];
  glass.push(loftSectionsMesh(cabGlass, true, false));

  // Rear tractor frame rails, aero side skirts, fifth-wheel coupling plate (`latheMesh`) & roof lidar bar
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.28, 2.25, 0.03), { pos: [0, 0.68, 1.58] }), materialIndex: 1 });
  for (const sx of [-1.04, 1.04]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.44, 1.95, 0.03), { pos: [sx, 0.52, -0.45] }), materialIndex: 0 });
  }
  slots.push({ mesh: transformMesh(latheMesh([[0.18, 0], [0.58, 0], [0.62, 0.09], [0.22, 0.11]], 20), { pos: [0, 0.84, 1.62] }), materialIndex: 5 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.52, 0.11, 0.28, 0.03), { pos: [0, 2.09, -0.92] }), materialIndex: 2 });
  pushLidarPuck(slots, glass, [-0.58, 2.11, -0.92], 0.09, 0.11, 2, 8);
  pushLidarPuck(slots, glass, [0.58, 2.11, -0.92], 0.09, 0.11, 2, 8);

  for (const sx of [-0.78, 0.78]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.12, 0.08, 0.02), { pos: [sx, 0.74, -2.72] }), materialIndex: 6 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.78, 0.12, 0.09, 0.02), { pos: [0, 0.93, 2.62] }), materialIndex: 7 });

  pushWheelSet(slots, { trackHalfX: 1.0, axleZs: [-1.86, 0.96, 2.06], radius: 0.48, width: 0.29, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-heavy-semi", slots, mats, glass, options);
}

/** 6. Teleop Emergency / Rapid-Response SUV-Interceptor (`interceptor` & `rival-car-2`, 4.50 m). */
export function buildTeleopResponseSuvNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
  readonly emergencyLiveried?: boolean;
} = {}): GroupNodeBuilder {
  const emergency = options.emergencyLiveried ?? false;
  const mats = [
    emergency ? TELEOP_MATERIALS.responseWhite : TELEOP_MATERIALS.interceptorCobalt,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    emergency ? TELEOP_MATERIALS.violetStrobe : TELEOP_MATERIALS.tealBeacon,
    TELEOP_MATERIALS.amberStrobe
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];
  const roofH = emergency ? 1.56 : 1.18;

  const hullSec: V3[][] = [
    coachStationRing({ z: -2.22, yBottom: 0.24, yBelt: 0.58, yTop: 0.76, halfWidthBottom: 0.76, halfWidthBelt: 0.94, halfWidthTop: 0.78, crown: 0.03 }),
    coachStationRing({ z: -1.38, yBottom: 0.2, yBelt: 0.74, yTop: 0.92, halfWidthBottom: 0.9, halfWidthBelt: 1.01, halfWidthTop: 0.88, crown: 0.04 }),
    coachStationRing({ z: -0.45, yBottom: 0.2, yBelt: 0.78, yTop: roofH, halfWidthBottom: 0.92, halfWidthBelt: 1.02, halfWidthTop: 0.79, crown: 0.04 }),
    coachStationRing({ z: 0.85, yBottom: 0.2, yBelt: 0.8, yTop: roofH * 0.98, halfWidthBottom: 0.92, halfWidthBelt: 1.02, halfWidthTop: 0.77, crown: 0.04 }),
    coachStationRing({ z: 1.72, yBottom: 0.22, yBelt: 0.78, yTop: roofH * 0.84, halfWidthBottom: 0.88, halfWidthBelt: 0.98, halfWidthTop: 0.7, crown: 0.03 }),
    coachStationRing({ z: 2.22, yBottom: 0.28, yBelt: 0.68, yTop: 0.92, halfWidthBottom: 0.76, halfWidthBelt: 0.88, halfWidthTop: 0.68, crown: 0.02 })
  ];
  slots.push({ mesh: loftSectionsMesh(hullSec, true, false), materialIndex: 0 });

  const glassSec: V3[][] = [-1.18, -0.25, 0.88, 1.62].map((z, idx) =>
    coachStationRing({
      z,
      yBottom: 0.8,
      yBelt: 0.96,
      yTop: idx === 0 || idx === 3 ? roofH * 0.86 : roofH * 1.01,
      halfWidthBottom: 0.84,
      halfWidthBelt: 0.81,
      halfWidthTop: 0.72,
      crown: 0.02
    })
  );
  glass.push(loftSectionsMesh(glassSec, true, false));

  // Tubular push-bumper guard + roof telemetry lightbar & lidar dome
  const barSpine: V4[] = [
    [-0.58, 0.34, -2.26, 0.032],
    [-0.54, 0.68, -2.27, 0.032],
    [0.54, 0.68, -2.27, 0.032],
    [0.58, 0.34, -2.26, 0.032]
  ];
  slots.push({ mesh: tubeSweepMesh(barSpine, 7), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.06, 0.24, 0.02), { pos: [0, roofH + 0.05, -0.22] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.065, 0.16, 0.018), { pos: [-0.34, roofH + 0.07, -0.22] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.065, 0.16, 0.018), { pos: [0.34, roofH + 0.07, -0.22] }), materialIndex: 9 });
  if (emergency) pushLidarPuck(slots, glass, [0, roofH + 0.08, -0.22], 0.12, 0.13, 2, 8);

  slots.push({ mesh: transformMesh(bevelBoxMesh(1.62, 0.07, 0.07, 0.018), { pos: [0, 0.62, -2.21] }), materialIndex: 6 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.66, 0.085, 0.07, 0.018), { pos: [0, 0.59, 2.2] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.91, axleZs: [-1.44, 1.42], radius: 0.37, width: 0.25, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-response-suv", slots, mats, glass, options);
}
/** 7. Rival & Grand-Tourer Luxury AV (`gt`, Kaya champagne `#e8c27a`, Marcus volcanic amber). */
export function buildRivalLuxuryAvNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
  readonly lengthM?: number;
  readonly finish?: "crimson" | "champagne" | "amber";
} = {}): GroupNodeBuilder {
  const lenScale = (options.lengthM ?? 4.66) / 4.66;
  const paint =
    options.finish === "champagne"
      ? TELEOP_MATERIALS.champagneGold
      : options.finish === "amber"
        ? TELEOP_MATERIALS.volcanicAmber
        : TELEOP_MATERIALS.gtCrimson;
  const mats = [
    paint,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.sensorHousing,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.tealBeacon
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  const hullSec: V3[][] = [
    coachStationRing({ z: -2.3 * lenScale, yBottom: 0.18, yBelt: 0.48, yTop: 0.62, halfWidthBottom: 0.78, halfWidthBelt: 0.96, halfWidthTop: 0.78, crown: 0.03 }),
    coachStationRing({ z: -1.42 * lenScale, yBottom: 0.16, yBelt: 0.68, yTop: 0.84, halfWidthBottom: 0.94, halfWidthBelt: 1.07, halfWidthTop: 0.9, crown: 0.04 }),
    coachStationRing({ z: -0.35 * lenScale, yBottom: 0.16, yBelt: 0.72, yTop: 1.24, halfWidthBottom: 0.92, halfWidthBelt: 1.02, halfWidthTop: 0.76, crown: 0.04 }),
    coachStationRing({ z: 0.86 * lenScale, yBottom: 0.17, yBelt: 0.76, yTop: 1.18, halfWidthBottom: 0.96, halfWidthBelt: 1.09, halfWidthTop: 0.74, crown: 0.04 }),
    coachStationRing({ z: 1.88 * lenScale, yBottom: 0.2, yBelt: 0.74, yTop: 0.96, halfWidthBottom: 0.92, halfWidthBelt: 1.04, halfWidthTop: 0.76, crown: 0.03 }),
    coachStationRing({ z: 2.28 * lenScale, yBottom: 0.24, yBelt: 0.64, yTop: 0.82, halfWidthBottom: 0.78, halfWidthBelt: 0.92, halfWidthTop: 0.72, crown: 0.02 })
  ];
  slots.push({ mesh: loftSectionsMesh(hullSec, true, false), materialIndex: 0 });

  const domeSec: V3[][] = [-1.18, -0.25, 0.78, 1.56].map((z, idx) =>
    coachStationRing({
      z: z * lenScale,
      yBottom: 0.74,
      yBelt: 0.94,
      yTop: idx === 0 || idx === 3 ? 1.06 : 1.26,
      halfWidthBottom: 0.84,
      halfWidthBelt: 0.78,
      halfWidthTop: 0.68,
      crown: 0.03
    })
  );
  glass.push(loftSectionsMesh(domeSec, true, false));

  // Flush optical lidar brow + rear aero diffuser + forged 7-spoke alloys
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.56, 0.055, 0.22, 0.015), { pos: [0, 1.26, -0.58 * lenScale] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.03, 0.05, 0.008), { pos: [0, 1.27, -0.69 * lenScale] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.62, 0.14, 0.22, 0.02), { pos: [0, 0.24, 2.2 * lenScale] }), materialIndex: 1 });
  for (const sx of [-0.72, 0.72]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.065, 0.08, 0.016), { pos: [sx, 0.56, -2.26 * lenScale] }), materialIndex: 6 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.74, 0.075, 0.07, 0.018), { pos: [0, 0.59, 2.24 * lenScale] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.96, axleZs: [-1.42 * lenScale, 1.38 * lenScale], radius: 0.35, width: 0.26, spokeCount: 7, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-luxury-gt", slots, mats, glass, options);
}

// ---------------------------------------------------------------------------
// Historic San Francisco Powell-Mason Cable Car (`rival-car-3`, 8.20 m)
// ---------------------------------------------------------------------------

export function buildSfCableCarNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly position?: V3;
} = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.cableRedwood,
    TELEOP_MATERIALS.cableCream,
    TELEOP_MATERIALS.cableTeak,
    TELEOP_MATERIALS.polishedBrass,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.amberStrobe
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  // Enclosed rear saloon (`z in [-0.2, +2.75]`) + open front California section (`z in [-2.85, -0.2]`)
  const lowerHull: V3[][] = [-2.95, -1.5, 0, 1.5, 2.85].map((z) =>
    coachStationRing({ z, yBottom: 0.46, yBelt: 1.05, yTop: 1.36, halfWidthBottom: 1.08, halfWidthBelt: 1.24, halfWidthTop: 1.22, crown: 0.02 })
  );
  slots.push({ mesh: loftSectionsMesh(lowerHull, true, false), materialIndex: 0 });

  // Cream upper window belt on enclosed saloon + corner teak posts across open gripman section
  const saloonUpper: V3[][] = [-0.22, 1.25, 2.75].map((z) =>
    coachStationRing({ z, yBottom: 1.34, yBelt: 1.92, yTop: 2.54, halfWidthBottom: 1.22, halfWidthBelt: 1.24, halfWidthTop: 1.18, crown: 0.03 })
  );
  slots.push({ mesh: loftSectionsMesh(saloonUpper, true, false), materialIndex: 1 });
  glass.push(transformMesh(bevelBoxMesh(2.5, 0.92, 2.68, 0.02), { pos: [0, 1.94, 1.26] }));
  glass.push(transformMesh(bevelBoxMesh(2.18, 0.88, 0.08, 0.015), { pos: [0, 1.94, -0.24] }));

  // Full-length curved main canopy (`z in [-3.95, +3.95]`) + raised clerestory monitor roof (`loftSectionsMesh`)
  const canopySec: V3[][] = [-3.95, -2.4, 0, 2.4, 3.95].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({ z, yBottom: 2.54, yBelt: 2.68, yTop: 2.84, halfWidthBottom: end ? 1.02 : 1.3, halfWidthBelt: end ? 0.98 : 1.26, halfWidthTop: end ? 0.72 : 0.96, crown: 0.06 });
  });
  slots.push({ mesh: loftSectionsMesh(canopySec, true, false), materialIndex: 0 });
  const clerestorySec: V3[][] = [-2.85, 0, 2.85].map((z) =>
    coachStationRing({ z, yBottom: 2.82, yBelt: 3.12, yTop: 3.36, halfWidthBottom: 0.72, halfWidthBelt: 0.74, halfWidthTop: 0.58, crown: 0.06 })
  );
  slots.push({ mesh: loftSectionsMesh(clerestorySec, true, false), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.36, 0.22, 0.06, 0.01), { pos: [0, 3.04, -2.9] }), materialIndex: 8 });

  // Open outward-facing teak benches, running boards, fore/aft gripman dash aprons, brass stanchions & grip levers
  for (const sx of [-1.28, 1.28]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.07, 6.8, 0.015), { pos: [sx, 0.36, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.12, 2.52, 0.02), { pos: [sx * 0.72, 0.96, -1.55] }), materialIndex: 2 });
    for (const pz of [-3.72, -2.85, -1.55, -0.25, 2.82, 3.72]) {
      slots.push({ mesh: tubeSweepMesh([[sx * 0.88, 0.48, pz, 0.026], [sx * 0.88, 2.58, pz, 0.026]], 7), materialIndex: 3 });
    }
  }
  for (const endZ of [-3.92, 3.92]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.08, 0.92, 0.12, 0.03), { pos: [0, 0.92, endZ] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.24, 0.1, 0.96, 0.02), { pos: [0, 0.44, endZ * 0.86] }), materialIndex: 2 });
  }
  // Gripman slot levers + turned `latheMesh` polished brass Powell-Mason bell!
  slots.push({ mesh: tubeSweepMesh([[-0.12, 0.48, -2.15, 0.028], [-0.08, 1.48, -2.42, 0.024]], 6), materialIndex: 5 });
  slots.push({ mesh: tubeSweepMesh([[0.16, 0.48, -2.05, 0.028], [0.18, 1.42, -2.28, 0.024]], 6), materialIndex: 3 });
  const bellProfile: V2[] = [[0.2, 0], [0.16, 0.05], [0.13, 0.16], [0.1, 0.24], [0.03, 0.28], [0, 0.3]];
  slots.push({ mesh: transformMesh(latheMesh(bellProfile, 18), { pos: [0, 2.58, -3.55] }), materialIndex: 3 });

  // Dual 4-wheel flanged steel rail bogies (`latheMesh` flanged wheels) + brass bullseye headlamp (`-Z`) & ruby tail lamps (`+Z`)
  const railWheel = latheMesh([[0, -0.06], [0.31, -0.06], [0.36, -0.04], [0.31, -0.02], [0.31, 0.06], [0, 0.06]], 18);
  for (const bogieZ of [-2.2, 2.2]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.76, 0.22, 1.65, 0.03), { pos: [0, 0.34, bogieZ] }), materialIndex: 4 });
    for (const wz of [-0.54, 0.54]) {
      for (const sx of [-0.74, 0.74]) {
        slots.push({ mesh: transformMesh(railWheel, { pos: [sx, 0.31, bogieZ + wz], rot: [0, 0, -Math.PI * 0.5] }), materialIndex: 5 });
      }
    }
  }
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.24, 0.12], [0.18, 0.16]], 16), { pos: [0, 0.98, -3.98], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.17, 0.02], [0, 0.06]], 14), { pos: [0, 0.98, -4.08], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 6 });
  for (const sx of [-0.78, 0.78]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.22, 0.14, 0.08, 0.02), { pos: [sx, 1.02, 3.98] }), materialIndex: 7 });
  }

  return assembleGlazedMultiMaterialNode(options.name ?? "sf-powell-mason-cablecar", slots, mats, glass, options);
}

// ---------------------------------------------------------------------------
// 6 San Francisco Traffic Vehicle Classes + Instanced Cross-Street Parked Cars
// ---------------------------------------------------------------------------

export type SfTrafficClass = "sedan" | "hatchback" | "muniBus" | "boxTruck" | "pickup" | "coupe";

const TRAFFIC_COAT: Readonly<Record<string, AuraMaterialSpec>> = {
  slate: material.carPaint({ name: "sf-sedan-slate", color: "#475569", roughness: 0.24, metallic: 0.58, clearcoat: 1, clearcoatRoughness: 0.04 }),
  pearl: material.carPaint({ name: "sf-sedan-pearl", color: "#dce3ec", roughness: 0.22, metallic: 0.36, clearcoat: 1, clearcoatRoughness: 0.03 }),
  mint: material.carPaint({ name: "sf-hatch-mint", color: "#3b8f7b", roughness: 0.25, metallic: 0.44, clearcoat: 0.95, clearcoatRoughness: 0.04 }),
  coral: material.carPaint({ name: "sf-hatch-coral", color: "#c95b42", roughness: 0.25, metallic: 0.42, clearcoat: 0.95, clearcoatRoughness: 0.04 }),
  saffronCab: material.carPaint({ name: "sf-medallion-cab", color: "#eab308", roughness: 0.22, metallic: 0.22, clearcoat: 0.96, clearcoatRoughness: 0.03 }),
  pacificNavy: material.carPaint({ name: "sf-coupe-navy", color: "#1d3557", roughness: 0.22, metallic: 0.62, clearcoat: 1, clearcoatRoughness: 0.03 }),
  muniSilver: material.carPaint({ name: "sf-muni-silver", color: "#d8dee6", roughness: 0.26, metallic: 0.48, clearcoat: 0.9, clearcoatRoughness: 0.05 }),
  muniVermilion: material.carPaint({ name: "sf-muni-vermilion", color: "#c81e1e", roughness: 0.24, metallic: 0.2, clearcoat: 0.92, clearcoatRoughness: 0.04 }),
  sierraBronze: material.carPaint({ name: "sf-pickup-bronze", color: "#7c583c", roughness: 0.26, metallic: 0.54, clearcoat: 0.94, clearcoatRoughness: 0.04 }),
  graphite: material.carPaint({ name: "sf-pickup-graphite", color: "#334155", roughness: 0.26, metallic: 0.58, clearcoat: 0.94, clearcoatRoughness: 0.04 }),
  cargoWhite: material.ceramic({ name: "sf-cargo-white", color: "#edf2f7", roughness: 0.34, clearcoat: 0.58, clearcoatRoughness: 0.1 })
};
export function buildTrafficVehicleNode(
  kind: SfTrafficClass,
  options: {
    readonly id?: string;
    readonly name?: string;
    readonly position?: V3;
    readonly coatKey?: keyof typeof TRAFFIC_COAT;
    readonly taxiMedallion?: boolean;
  } = {}
): GroupNodeBuilder {
  const defaultCoat: Record<SfTrafficClass, keyof typeof TRAFFIC_COAT> = {
    sedan: "slate",
    hatchback: "mint",
    muniBus: "muniSilver",
    boxTruck: "cargoWhite",
    pickup: "sierraBronze",
    coupe: "pacificNavy"
  };
  const bodyMat = TRAFFIC_COAT[options.coatKey ?? defaultCoat[kind]] ?? TRAFFIC_COAT.slate!;
  const mats = [
    bodyMat,
    TELEOP_MATERIALS.darkTrim,
    TRAFFIC_COAT.muniVermilion!,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.headlampWarm,
    TELEOP_MATERIALS.taillampRuby,
    TELEOP_MATERIALS.amberStrobe
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  if (kind === "muniBus") {
    // SF Muni Transit Shuttle Bus (`4.70 m` length, silver & vermilion livery, amber destination headsign)
    const busSec: V3[][] = [-2.32, -2.02, -0.9, 0.9, 2.04, 2.32].map((z, idx) => {
      const end = idx === 0 || idx === 5;
      return coachStationRing({
        z,
        yBottom: 0.24,
        yBelt: 1.02,
        yTop: end ? 2.38 : 2.58,
        halfWidthBottom: end ? 0.92 : 1.06,
        halfWidthBelt: end ? 1.0 : 1.1,
        halfWidthTop: end ? 0.94 : 1.04,
        crown: 0.05
      });
    });
    slots.push({ mesh: loftSectionsMesh(busSec, true, false), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.22, 0.34, 4.46, 0.02), { pos: [0, 0.96, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.46, 0.16, 2.28, 0.04), { pos: [0, 2.66, 0.15] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.38, 0.2, 0.06, 0.01), { pos: [0, 2.36, -2.28] }), materialIndex: 8 });
    glass.push(transformMesh(bevelBoxMesh(2.23, 0.92, 4.18, 0.02), { pos: [0, 1.72, -0.04] }));
    for (const sx of [-0.82, 0.82]) slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.12, 0.07, 0.015), { pos: [sx, 0.68, -2.31] }), materialIndex: 6 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.88, 0.12, 0.07, 0.018), { pos: [0, 0.88, 2.31] }), materialIndex: 7 });
    pushWheelSet(slots, { trackHalfX: 0.98, axleZs: [-1.42, 1.42], radius: 0.41, width: 0.25, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });
  } else if (kind === "boxTruck") {
    // Bay Area Box Delivery Truck (`7.60 m` length: tilt-cab + aero fairing + ribbed cargo box + roll-up shutter)
    const cabSec: V3[][] = [-3.74, -3.15, -2.18, -1.58].map((z, idx) =>
      coachStationRing({
        z,
        yBottom: 0.32,
        yBelt: 1.06,
        yTop: idx === 0 ? 1.56 : 2.24,
        halfWidthBottom: 0.98,
        halfWidthBelt: 1.14,
        halfWidthTop: idx === 0 ? 0.96 : 1.06,
        crown: 0.04
      })
    );
    slots.push({ mesh: loftSectionsMesh(cabSec, true, false), materialIndex: 2 });
    const fairingSec: V3[][] = [-2.35, -1.62].map((z, idx) =>
      coachStationRing({ z, yBottom: 2.22, yBelt: 2.58, yTop: idx === 0 ? 2.68 : 3.24, halfWidthBottom: 1.02, halfWidthBelt: 1.08, halfWidthTop: 1.16, crown: 0.03 })
    );
    slots.push({ mesh: loftSectionsMesh(fairingSec, true, false), materialIndex: 0 });
    glass.push(transformMesh(bevelBoxMesh(2.14, 0.72, 1.18, 0.02), { pos: [0, 1.66, -2.55] }));
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.48, 2.48, 5.18, 0.05), { pos: [0, 2.12, 1.12] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.92, 0.3, 4.95, 0.03), { pos: [0, 0.72, 1.15] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.12, 2.08, 0.06, 0.015), { pos: [0, 2.08, 3.72] }), materialIndex: 5 });
    for (const sx of [-0.88, 0.88]) slots.push({ mesh: transformMesh(bevelBoxMesh(0.36, 0.14, 0.08, 0.02), { pos: [sx, 0.78, -3.72] }), materialIndex: 6 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.16, 0.12, 0.08, 0.02), { pos: [0, 0.82, 3.73] }), materialIndex: 7 });
    pushWheelSet(slots, { trackHalfX: 1.06, axleZs: [-2.68, 1.56, 2.68], radius: 0.46, width: 0.28, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });
  } else if (kind === "pickup") {
    // Crew-Cab Utility Pickup (`5.25 m`: sculpted nose & crew cab + open cargo bed + tubular utility rack)
    const cabSec: V3[][] = [-2.58, -1.72, -0.82, 0.36].map((z, idx) =>
      coachStationRing({
        z,
        yBottom: 0.26,
        yBelt: idx === 0 ? 0.84 : 1.02,
        yTop: idx < 2 ? 1.06 : 1.78,
        halfWidthBottom: 0.86,
        halfWidthBelt: 0.99,
        halfWidthTop: idx < 2 ? 0.88 : 0.84,
        crown: 0.04
      })
    );
    slots.push({ mesh: loftSectionsMesh(cabSec, true, false), materialIndex: 0 });
    glass.push(transformMesh(bevelBoxMesh(1.74, 0.58, 1.56, 0.02), { pos: [0, 1.38, -0.32] }));
    // Sculpted bed walls, floor & tailgate (`z in [0.4, +2.58]`)
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.94, 0.24, 2.16, 0.025), { pos: [0, 0.56, 1.48] }), materialIndex: 1 });
    for (const sx of [-0.91, 0.91]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.48, 2.16, 0.025), { pos: [sx, 0.88, 1.48] }), materialIndex: 0 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.88, 0.48, 0.12, 0.02), { pos: [0, 0.88, 2.52] }), materialIndex: 0 });
    slots.push({ mesh: tubeSweepMesh([[-0.86, 1.12, 0.48, 0.03], [-0.78, 1.78, 0.52, 0.03], [0.78, 1.78, 0.52, 0.03], [0.86, 1.12, 0.48, 0.03]], 6), materialIndex: 1 });
    for (const sx of [-0.76, 0.76]) slots.push({ mesh: transformMesh(bevelBoxMesh(0.34, 0.12, 0.07, 0.018), { pos: [sx, 0.78, -2.56] }), materialIndex: 6 });
    for (const sx of [-0.88, 0.88]) slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.32, 0.08, 0.018), { pos: [sx, 0.88, 2.56] }), materialIndex: 7 });
    pushWheelSet(slots, { trackHalfX: 0.9, axleZs: [-1.68, 1.56], radius: 0.4, width: 0.26, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });
  } else {
    // Sedan (`4.75 m`), Hatchback (`3.90 m`), and Fastback Coupe / SF Medallion Cab (`4.60 m`)
    const halfL = kind === "hatchback" ? 1.92 : kind === "coupe" ? 2.26 : 2.34;
    const roofY = kind === "hatchback" ? 1.52 : kind === "coupe" ? 1.36 : 1.46;
    const rearDeckZ = kind === "hatchback" ? halfL * 0.88 : kind === "coupe" ? halfL * 0.76 : halfL * 0.62;
    const carSec: V3[][] = [
      coachStationRing({ z: -halfL, yBottom: 0.22, yBelt: 0.56, yTop: 0.72, halfWidthBottom: 0.72, halfWidthBelt: 0.86, halfWidthTop: 0.72, crown: 0.03 }),
      coachStationRing({ z: -halfL * 0.62, yBottom: 0.19, yBelt: 0.74, yTop: 0.9, halfWidthBottom: 0.84, halfWidthBelt: 0.94, halfWidthTop: 0.82, crown: 0.03 }),
      coachStationRing({ z: -halfL * 0.18, yBottom: 0.19, yBelt: 0.78, yTop: roofY, halfWidthBottom: 0.86, halfWidthBelt: 0.95, halfWidthTop: 0.74, crown: 0.04 }),
      coachStationRing({ z: rearDeckZ * 0.65, yBottom: 0.19, yBelt: 0.8, yTop: roofY * 0.97, halfWidthBottom: 0.86, halfWidthBelt: 0.95, halfWidthTop: 0.72, crown: 0.04 }),
      coachStationRing({ z: halfL * 0.84, yBottom: 0.21, yBelt: 0.8, yTop: kind === "hatchback" ? 1.24 : 0.98, halfWidthBottom: 0.82, halfWidthBelt: 0.92, halfWidthTop: 0.7, crown: 0.03 }),
      coachStationRing({ z: halfL, yBottom: 0.25, yBelt: 0.72, yTop: 0.9, halfWidthBottom: 0.72, halfWidthBelt: 0.84, halfWidthTop: 0.66, crown: 0.02 })
    ];
    slots.push({ mesh: loftSectionsMesh(carSec, true, false), materialIndex: 0 });
    const glassSec: V3[][] = [-halfL * 0.48, -halfL * 0.08, rearDeckZ * 0.62, rearDeckZ].map((z, idx) =>
      coachStationRing({
        z,
        yBottom: 0.8,
        yBelt: 1.0,
        yTop: idx === 0 || idx === 3 ? roofY * 0.82 : roofY * 1.01,
        halfWidthBottom: 0.82,
        halfWidthBelt: 0.78,
        halfWidthTop: 0.68,
        crown: 0.02
      })
    );
    glass.push(loftSectionsMesh(glassSec, true, false));
    if (options.taxiMedallion) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.58, 0.13, 0.22, 0.02), { pos: [0, roofY + 0.08, -0.14] }), materialIndex: 8 });
    }
    for (const sx of [-0.66, 0.66]) slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.075, 0.07, 0.015), { pos: [sx, 0.62, -halfL + 0.03] }), materialIndex: 6 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.085, 0.07, 0.018), { pos: [0, 0.74, halfL - 0.03] }), materialIndex: 7 });
    pushWheelSet(slots, { trackHalfX: 0.85, axleZs: [-halfL * 0.62, halfL * 0.6], radius: 0.34, width: 0.22, spokeCount: 5, tireMat: 3, rimMat: 4, rotorMat: 5 });
  }

  return assembleGlazedMultiMaterialNode(options.name ?? `sf-traffic-${kind}`, slots, mats, glass, options);
}

/** Multi-tone vertex-colored instanced parked-car geometry (`sf-parked-0` sedan, `sf-parked-1` hatchback). */
export function parkedVehicleGeometrySpec(kind: "sedan" | "hatchback"): AuraCustomGeometrySpec {
  return memoGeometrySpec(`parked-${kind}`, () => {
    const halfL = kind === "hatchback" ? 1.92 : 2.34;
    const roofY = kind === "hatchback" ? 1.48 : 1.42;
    const parts: ColoredRawMesh[] = [];
    const bodySec: V3[][] = [
      coachStationRing({ z: -halfL, yBottom: 0.22, yBelt: 0.56, yTop: 0.72, halfWidthBottom: 0.7, halfWidthBelt: 0.86, halfWidthTop: 0.72, crown: 0.03 }),
      coachStationRing({ z: -halfL * 0.52, yBottom: 0.19, yBelt: 0.74, yTop: roofY, halfWidthBottom: 0.84, halfWidthBelt: 0.94, halfWidthTop: 0.74, crown: 0.04 }),
      coachStationRing({ z: halfL * 0.48, yBottom: 0.19, yBelt: 0.78, yTop: roofY * 0.96, halfWidthBottom: 0.84, halfWidthBelt: 0.94, halfWidthTop: 0.72, crown: 0.04 }),
      coachStationRing({ z: halfL, yBottom: 0.24, yBelt: 0.72, yTop: 0.92, halfWidthBottom: 0.7, halfWidthBelt: 0.84, halfWidthTop: 0.68, crown: 0.02 })
    ];
    parts.push(tintRawMesh(loftSectionsMesh(bodySec, true, false), "#dde5ef"));
    parts.push(tintRawMesh(transformMesh(bevelBoxMesh(1.52, 0.48, halfL * 1.05, 0.03), { pos: [0, 1.08, -0.05] }), "#1e293b"));
    parts.push(tintRawMesh(transformMesh(bevelBoxMesh(1.42, 0.08, 0.06, 0.015), { pos: [0, 0.62, -halfL + 0.02] }), "#fef3c7"));
    parts.push(tintRawMesh(transformMesh(bevelBoxMesh(1.46, 0.09, 0.06, 0.015), { pos: [0, 0.72, halfL - 0.02] }), "#dc2626"));
    const wSlots = wheelAssemblySlots({ radius: 0.33, width: 0.21, spokeCount: 5, tireMat: 0, rimMat: 1 });
    for (const az of [-halfL * 0.6, halfL * 0.58]) {
      for (const sx of [-0.84, 0.84]) {
        for (const s of wSlots) {
          parts.push(tintRawMesh(transformMesh(s.mesh, { pos: [sx, 0.33, az] }), s.materialIndex === 0 ? "#111827" : "#cbd5e1"));
        }
      }
    }
    return mergeColoredMeshesToSpec(parts);
  });
}

/** Playable fleet dispatcher (`player-car-cruiser|coupe|truck|gt|interceptor`). */
export function buildPlayableFleetCarNode(
  id: PlayableCarId,
  options: { readonly nodeId: string; readonly position: V3; readonly scale: number | V3; readonly tags?: readonly string[] }
): GroupNodeBuilder {
  const common = { id: options.nodeId, name: options.nodeId, position: options.position, scale: options.scale, tags: options.tags };
  if (id === "cruiser") return buildBidirectionalRobotaxiPodNode(common);
  if (id === "coupe") return buildCrossoverAvNode(common);
  if (id === "truck") return buildHeavyAvSemiNode(common);
  if (id === "gt") return buildRivalLuxuryAvNode({ ...common, lengthM: PLAYABLE_FLEET.gt.maxDim, finish: "crimson" });
  return buildTeleopResponseSuvNode({ ...common, emergencyLiveried: false });
}

/** AI rival fleet dispatcher (`rival-car-0..4`: Origin shuttle, Kaya champagne AV, Elena response SUV, SF Cable Car, Marcus GT). */
export function buildRivalFleetCarNode(rivalIndex: number, position: V3): GroupNodeBuilder {
  const id = `rival-car-${rivalIndex}`;
  if (rivalIndex === 0) return buildAutonomousShuttleNode({ id, name: id, position });
  if (rivalIndex === 1) return buildRivalLuxuryAvNode({ id, name: id, position, lengthM: 4.0, finish: "champagne" });
  if (rivalIndex === 2) return buildTeleopResponseSuvNode({ id, name: id, position, emergencyLiveried: true });
  if (rivalIndex === 3) return buildSfCableCarNode({ id, name: id, position });
  return buildRivalLuxuryAvNode({ id, name: id, position, lengthM: 4.66, finish: "amber" });
}

/** Avenue traffic dispatcher (`traffic-0..9` spanning all 6 San Francisco traffic classes). */
export function buildAvenueTrafficCarNode(slotIndex: number, asset: GridAssetKey, position: V3): GroupNodeBuilder {
  const id = `traffic-${slotIndex}`;
  if (asset === "gridVan") return buildTrafficVehicleNode("muniBus", { id, name: id, position });
  if (asset === "gridBoxTruck") return buildTrafficVehicleNode("boxTruck", { id, name: id, position });
  if (asset === "gridPickup") {
    return buildTrafficVehicleNode("pickup", { id, name: id, position, coatKey: slotIndex % 2 === 0 ? "graphite" : "sierraBronze" });
  }
  if (asset === "gridHatch") {
    return buildTrafficVehicleNode("hatchback", { id, name: id, position, coatKey: slotIndex % 2 === 0 ? "coral" : "mint" });
  }
  if (asset === "gridTaxi") {
    const isCab = slotIndex === 1;
    return buildTrafficVehicleNode("coupe", { id, name: id, position, coatKey: isCab ? "saffronCab" : "pacificNavy", taxiMedallion: isCab });
  }
  return buildTrafficVehicleNode("sedan", { id, name: id, position, coatKey: slotIndex === 0 ? "slate" : "pearl" });
}
// ---------------------------------------------------------------------------
// San Francisco Skyline & Waterfront Landmarks
// ---------------------------------------------------------------------------

function practicalWindowMat(look: SkyLook, baseColor = "#fde68a", mult = 1): AuraMaterialSpec {
  const intensity = Math.max(0.12, 0.22 + look.street.windowGlow * 0.95 * mult);
  return material.emissive({
    name: "sf-window-practical",
    color: baseColor,
    emissive: SODIUM,
    emissiveIntensity: intensity,
    roughness: 0.28,
    practical: true
  });
}

function squareTaperingSection(halfW: number, halfD: number, y: number, twistRad = 0): V3[] {
  const c = Math.cos(twistRad);
  const s = Math.sin(twistRad);
  const pts: readonly [number, number][] = [
    [-halfW, halfD],
    [halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD]
  ];
  return pts.map(([x, z]) => [x * c - z * s, y, x * s + z * c]);
}

/** Landmark 1: Transamerica-style 150 m tapered quartz-white spire with East/West wing shafts & glazed lantern. */
export function buildTransamericaSpireNode(look: SkyLook, position: V3): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.quartzConcrete,
    TELEOP_MATERIALS.darkTrim,
    practicalWindowMat(look, "#fef3c7", 1.15),
    TELEOP_MATERIALS.taillampRuby
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  // Base tetrahedral colonnade struts (`y in [0, 14]`)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      slots.push({ mesh: tubeSweepMesh([[sx * 14.5, 0, sz * 14.5, 0.95], [sx * 11.2, 14, sz * 11.2, 0.8]], 6, true), materialIndex: 0 });
      slots.push({ mesh: tubeSweepMesh([[sx * 7.2, 0, sz * 14.5, 0.72], [sx * 11.2, 14, sz * 11.2, 0.65]], 6, true), materialIndex: 0 });
    }
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(25, 3.2, 25, 0.35), { pos: [0, 14.5, 0] }), materialIndex: 0 });

  // Main tapered obelisk (`y in [14, 128]`) + East/West elevator wing shafts (`y in [28, 108]`)
  const mainSpire: V3[][] = [
    squareTaperingSection(12.2, 12.2, 14),
    squareTaperingSection(9.4, 9.4, 48),
    squareTaperingSection(6.5, 6.5, 86),
    squareTaperingSection(3.4, 3.4, 128)
  ];
  slots.push({ mesh: loftSectionsMesh(mainSpire, true, true), materialIndex: 0 });
  for (const wx of [-1, 1]) {
    const wing: V3[][] = [
      squareTaperingSection(2.4, 3.6, 28).map(([x, y, z]) => [x + wx * 9.8, y, z]),
      squareTaperingSection(2.2, 3.3, 74).map(([x, y, z]) => [x + wx * 6.9, y, z]),
      squareTaperingSection(1.6, 2.5, 108).map(([x, y, z]) => [x + wx * 4.4, y, z])
    ];
    slots.push({ mesh: loftSectionsMesh(wing, true, true), materialIndex: 0 });
  }
  for (let tier = 0; tier < 9; tier += 1) {
    const ty = 22 + tier * 10.5;
    const hw = 11.4 - tier * 0.84;
    slots.push({ mesh: transformMesh(bevelBoxMesh(hw * 1.72, 1.8, hw * 2.03, 0.08), { pos: [0, ty, 0] }), materialIndex: 2 });
  }

  // Glazed aluminum crown pyramid (`y in [128, 148]`, `castShadow: false`) + aviation jewel beacon
  const crownGlass: V3[][] = [
    squareTaperingSection(3.35, 3.35, 128),
    squareTaperingSection(1.5, 1.5, 140),
    squareTaperingSection(0.18, 0.18, 148.5)
  ];
  glass.push(loftSectionsMesh(crownGlass, true, true));
  slots.push({ mesh: transformMesh(icosphereFacetMesh(0.75, 1), { pos: [0, 149.4, 0] }), materialIndex: 3 });

  return assembleGlazedMultiMaterialNode("sf-pyramid-tower", slots, mats, glass, {
    position,
    castShadow: false,
    receiveShadow: false,
    glassMaterial: TELEOP_MATERIALS.glazingSkyline
  });
}

/** Landmark 2a: International-Orange Suspension Bridge Tower (`118 m`, stepped Art Deco legs + lattice trusses). */
export function buildSuspensionBridgeTowerNode(name: string, position: V3, yaw = 0): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.bridgeOrange,
    TELEOP_MATERIALS.granitePier,
    TELEOP_MATERIALS.darkTrim,
    TELEOP_MATERIALS.taillampRuby
  ];
  const slots: MultiMatSlot[] = [];

  // Elliptical concrete ocean fender pier (`extrudePolygonMesh` rotated into XZ)
  const pierRing: V2[] = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return [Math.cos(a) * 11.5, Math.sin(a) * 6.8] as const;
  });
  slots.push({ mesh: transformMesh(extrudePolygonMesh(pierRing, 7.2, 0.45, true), { pos: [0, 3.4, 0], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 1 });

  // Twin stepped Art Deco tower legs (`z = ±6.2 m` in local space; tower rotated `±pi/2` so portal straddles roadway)
  for (const lz of [-6.2, 6.2]) {
    const leg: V3[][] = [
      squareTaperingSection(2.6, 2.2, 6.5).map(([x, y, z]) => [x, y, z + lz]),
      squareTaperingSection(2.2, 1.9, 42).map(([x, y, z]) => [x, y, z + lz]),
      squareTaperingSection(1.85, 1.6, 78).map(([x, y, z]) => [x, y, z + lz]),
      squareTaperingSection(1.45, 1.3, 116).map(([x, y, z]) => [x, y, z + lz])
    ];
    slots.push({ mesh: loftSectionsMesh(leg, true, true), materialIndex: 0 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [1.75, 0], [1.5, 2.2], [0, 2.5]], 12, true), { pos: [0, 116, lz] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.62, 1), { pos: [0, 119.2, lz] }), materialIndex: 3 });
  }

  // Roadway cross-girder (`y = 30.2`) + 4 open Art Deco `latticeTrussMesh` portal cross-struts above & below deck
  slots.push({ mesh: transformMesh(bevelBoxMesh(4.4, 2.6, 15.6, 0.2), { pos: [0, 29.2, 0] }), materialIndex: 0 });
  for (const py of [18, 52, 78, 104]) {
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [2.6, 5.2, 10.4], bays: 4, chordRadius: 0.28, braceRadius: 0.18 }), { pos: [0, py, 0] }),
      materialIndex: 0
    });
  }

  return assembleMultiMaterialNode(name, slots, mats, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: false });
}

/** Landmark 2b: Suspension Bridge Stiffening Deck Truss + Parabolic Main Cables & Suspender Ropes. */
export function buildSuspensionBridgeSpanNode(position: V3, towerX = 88): GroupNodeBuilder {
  const mats = [TELEOP_MATERIALS.bridgeOrange, TELEOP_MATERIALS.darkTrim, TELEOP_MATERIALS.amberStrobe];
  const slots: MultiMatSlot[] = [];
  const totalSpan = towerX * 2 + 56;

  // Open 4-chord stiffening truss (`latticeTrussMesh`) + asphalt roadway deck
  slots.push({
    mesh: latticeTrussMesh({ span: [totalSpan, 4.4, 13.6], bays: 14, chordRadius: 0.42, braceRadius: 0.24 }),
    materialIndex: 0
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(totalSpan, 0.65, 13.8, 0.12), { pos: [0, 2.35, 0] }), materialIndex: 1 });

  // Parabolic center-span + side-span catenary cables (`catmullRomSpline3` + `tubeSweepMesh`) relative to `y = 30.2`
  const saddleY = 117.2 - position[1];
  const sagY = 5.4;
  for (const cz of [-6.2, 6.2]) {
    const centerPts = catmullRomSpline3([[-towerX, saddleY, cz], [-towerX * 0.5, sagY + 22, cz], [0, sagY, cz], [towerX * 0.5, sagY + 22, cz], [towerX, saddleY, cz]], 6);
    slots.push({ mesh: tubeSweepMesh(centerPts.map((p) => [p[0], p[1], p[2], 0.46] as const), 8), materialIndex: 0 });
    for (const sideSign of [-1, 1]) {
      const approachPts = catmullRomSpline3([[sideSign * towerX, saddleY, cz], [sideSign * (towerX + 16), saddleY * 0.52, cz], [sideSign * (towerX + 28), 3.2, cz]], 5);
      slots.push({ mesh: tubeSweepMesh(approachPts.map((p) => [p[0], p[1], p[2], 0.44] as const), 8), materialIndex: 0 });
    }
    for (let sx = -towerX + 11; sx <= towerX - 11; sx += 11) {
      const u = sx / towerX;
      const cy = sagY + (saddleY - sagY) * u * u;
      slots.push({ mesh: tubeSweepMesh([[sx, 2.4, cz, 0.11], [sx, cy, cz, 0.11]], 5, true), materialIndex: 1 });
    }
  }
  for (let lx = -towerX; lx <= towerX; lx += 22) {
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.42, 0), { pos: [lx, 4.8, 6.6] }), materialIndex: 2 });
  }

  return assembleMultiMaterialNode("sf-bridge-span", slots, mats, { position, castShadow: false, receiveShadow: false });
}

/** Landmark 4: Embarcadero Ferry Building Clocktower + Waterfront Nave Arcade & Canary Island Palms. */
export function buildFerryClocktowerNode(look: SkyLook, position: V3): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.sandstoneWarm,
    TELEOP_MATERIALS.quartzConcrete,
    TELEOP_MATERIALS.darkTrim,
    practicalWindowMat(look, "#fffbeb", 1.35),
    INSTANCED_STREET_MATERIALS.treeBark,
    INSTANCED_STREET_MATERIALS.treeFoliage
  ];
  const slots: MultiMatSlot[] = [];

  // Waterfront grand nave hall (`92 m` wide) with `archwayVoussoirSlots` Romanesque entry arches facing `+Z`
  slots.push({ mesh: transformMesh(bevelBoxMesh(92, 14.5, 18, 0.35), { pos: [0, 7.25, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(94, 1.4, 19.2, 0.25), { pos: [0, 15.1, 0] }), materialIndex: 1 });
  const naveArch = archwayVoussoirSlots({ radius: 2.9, thickness: 0.75, depth: 1.4, voussoirs: 9, stoneMatA: 0, stoneMatB: 1, keystoneMat: 1 });
  for (const ax of [-32, -20, -8, 0, 8, 20, 32]) {
    for (const s of naveArch) {
      slots.push({ mesh: transformMesh(s.mesh, { pos: [ax, 5.2, 9.1] }), materialIndex: s.materialIndex });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(4.8, 5.2, 0.5, 0.08), { pos: [ax, 2.6, 8.8] }), materialIndex: 3 });
  }

  // Rising 74 m Beaux-Arts clock shaft (`loftSectionsMesh`) + 4 luminous clock dials + pyramidal finial
  const shaft: V3[][] = [
    squareTaperingSection(5.2, 5.2, 15),
    squareTaperingSection(4.9, 4.9, 44),
    squareTaperingSection(4.5, 4.5, 62),
    squareTaperingSection(3.8, 3.8, 69)
  ];
  slots.push({ mesh: loftSectionsMesh(shaft, true, true), materialIndex: 0 });
  const dial = latheMesh([[0, 0], [2.45, 0], [2.45, 0.24], [0, 0.28]], 20);
  slots.push({ mesh: transformMesh(dial, { pos: [0, 52.5, 4.72], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(dial, { pos: [0, 52.5, -4.72], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.28, 1.9, 0.18, 0.04), { pos: [0, 53.2, 5.04], rot: [0, 0, 0.42] }), materialIndex: 2 });
  const spireCap: V3[][] = [squareTaperingSection(4.1, 4.1, 69), squareTaperingSection(0.25, 0.25, 76.5)];
  slots.push({ mesh: loftSectionsMesh(spireCap, true, true), materialIndex: 2 });

  // Embarcadero Canary Island palm colonnade flanking the plaza (`tubeSweepMesh` ringed trunk + arched fronds)
  for (const px of [-42, -26, 26, 42]) {
    slots.push({ mesh: tubeSweepMesh([[px, 0, 13.5, 0.52], [px, 6.5, 13.6, 0.42], [px, 12.2, 13.8, 0.36]], 7), materialIndex: 4 });
    for (let f = 0; f < 8; f += 1) {
      const a = (f / 8) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const frond: V4[] = [
        [px, 12.3, 13.8, 0.22],
        [px + ca * 2.1, 13.1, 13.8 + sa * 2.1, 0.28],
        [px + ca * 3.8, 11.4, 13.8 + sa * 3.8, 0.08]
      ];
      slots.push({ mesh: tubeSweepMesh(frond, 5, true), materialIndex: 5 });
    }
  }

  return assembleMultiMaterialNode("sf-ferry-clocktower", slots, mats, { position, castShadow: false, receiveShadow: false });
}

/** Landmark 5: Coit-Style Fluted Tower atop Telegraph Hill (`stratifiedCliffMesh` + `coniferBoughTierMesh` + `latheMesh`). */
export function buildCoitTowerLandmarkNode(look: SkyLook, position: V3): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.granitePier,
    TELEOP_MATERIALS.quartzConcrete,
    practicalWindowMat(look, "#fde68a", 1.25),
    INSTANCED_STREET_MATERIALS.treeBark,
    INSTANCED_STREET_MATERIALS.treeFoliage
  ];
  const slots: MultiMatSlot[] = [];

  // Terraced Telegraph Hill bluff (`y in [0, 22]`) + coastal Monterey cypress grove (`coniferBoughTierMesh`)
  slots.push({ mesh: stratifiedCliffMesh({ radiusX: 24, radiusZ: 20, height: 22, terraces: 5, seed: 37 }), materialIndex: 0 });
  for (const [cx, cy, cz] of [[-11, 15, 8], [12, 14, 7], [-7, 18, -8], [9, 17, -6]] as const) {
    slots.push({ mesh: tubeSweepMesh([[cx, cy, cz, 0.38], [cx, cy + 3.4, cz, 0.26]], 6), materialIndex: 3 });
    slots.push({ mesh: transformMesh(coniferBoughTierMesh({ baseRadius: 3.1, height: 8.8, tiers: 5, seed: 19 + Math.abs(cx) }), { pos: [cx, cy + 2.2, cz] }), materialIndex: 4 });
  }

  // Fluted Art Deco cylindrical tower (`y in [21, 78]`, `latheMesh` + 16 vertical flutes + belvedere lantern)
  slots.push({ mesh: transformMesh(bevelBoxMesh(14, 5.5, 14, 0.3), { pos: [0, 23.5, 0] }), materialIndex: 1 });
  const colProfile: V2[] = [[4.6, 26], [4.35, 42], [4.05, 64], [3.65, 64.6], [3.65, 71.2], [4.1, 71.8], [3.2, 75.2], [2.4, 78.4], [0, 78.8]];
  slots.push({ mesh: latheMesh(colProfile, 24), materialIndex: 1 });
  slots.push({ mesh: latheMesh([[3.72, 65.2], [3.72, 70.6]], 20), materialIndex: 2 });

  return assembleMultiMaterialNode("sf-coit-tower", slots, mats, { position, castShadow: false, receiveShadow: false });
}
/** Landmark 6: Skyline Torqued Crystal Diagrid Spire & Stepped Art Deco Tower (`sf-glass-landmark`, `sf-skyline-tower-*`). */
export function buildSkylineTowerNode(
  kind: "glass" | "artDeco",
  name: string,
  look: SkyLook,
  position: V3,
  height: number
): GroupNodeBuilder {
  if (kind === "glass") {
    const mats = [
      TELEOP_MATERIALS.semiStainless,
      TELEOP_MATERIALS.darkTrim,
      practicalWindowMat(look, "#bae6fd", 0.9),
      TELEOP_MATERIALS.tealBeacon
    ];
    const slots: MultiMatSlot[] = [];
    const glass: RawMesh[] = [];
    const glassSkin: V3[][] = [
      squareTaperingSection(11.5, 11.5, 0, 0),
      squareTaperingSection(10.2, 10.2, height * 0.38, 0.12),
      squareTaperingSection(8.4, 8.4, height * 0.76, 0.24),
      squareTaperingSection(5.8, 5.8, height * 0.96, 0.34)
    ];
    glass.push(loftSectionsMesh(glassSkin, true, false));
    const core: V3[][] = [
      squareTaperingSection(7.6, 7.6, 0, 0),
      squareTaperingSection(6.4, 6.4, height * 0.5, 0.15),
      squareTaperingSection(4.2, 4.2, height * 0.94, 0.3)
    ];
    slots.push({ mesh: loftSectionsMesh(core, true, true), materialIndex: 2 });
    slots.push({ mesh: latticeTrussMesh({ span: [16.5, height * 0.92, 16.5], bays: 7, chordRadius: 0.32, braceRadius: 0.2 }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(latheMesh([[5.6, height * 0.95], [2.4, height], [0, height + 4.5]], 12, true), { pos: [0, 0, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.55, 0), { pos: [0, height + 5.1, 0] }), materialIndex: 3 });
    return assembleGlazedMultiMaterialNode(name, slots, mats, glass, {
      position,
      castShadow: false,
      receiveShadow: false,
      glassMaterial: TELEOP_MATERIALS.glazingSkyline
    });
  }

  const mats = [
    TELEOP_MATERIALS.sandstoneWarm,
    TELEOP_MATERIALS.darkTrim,
    practicalWindowMat(look, "#fde68a", 1.1),
    TELEOP_MATERIALS.polishedBrass
  ];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(21, height * 0.52, 21, 0.35), { pos: [0, height * 0.26, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(16.2, height * 0.3, 16.2, 0.3), { pos: [0, height * 0.65, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(11.4, height * 0.18, 11.4, 0.25), { pos: [0, height * 0.88, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(17.2, height * 0.78, 17.2, 0.12), { pos: [0, height * 0.42, 0] }), materialIndex: 2 },
    { mesh: latheMesh([[4.4, height * 0.96], [2.1, height * 1.03], [0.4, height * 1.09], [0, height * 1.11]], 12, true), materialIndex: 3 }
  ];
  return assembleMultiMaterialNode(name, slots, mats, { position, castShadow: false, receiveShadow: false });
}

// ---------------------------------------------------------------------------
// Street-Front San Francisco Buildings (`sf-bldg-l/r-0..7`, Facade on `+Z`)
// ---------------------------------------------------------------------------

const VICTORIAN_PASTELS = ["#d8b4a0", "#8fb8b0", "#c9b37e", "#9cb4cc", "#cfa3a8", "#b8c49b"] as const;
const MIDRISE_MASONRY = ["#9a5b4a", "#cbd5e1", "#bfa588", "#7c8b99"] as const;
const VICTORIAN_PASTEL_MATS = VICTORIAN_PASTELS.map((color, idx) =>
  material.ceramic({ name: `sf-victorian-${idx}`, color, roughness: 0.48, clearcoat: 0.25 })
);
const MIDRISE_MASONRY_MATS = MIDRISE_MASONRY.map((color, idx) =>
  material.ceramic({ name: `sf-midrise-${idx}`, color, roughness: 0.58, clearcoat: 0.18 })
);
const ART_DECO_MASONRY_MAT = material.ceramic({ name: "sf-artdeco-masonry", color: "#d4c3aa", roughness: 0.58, clearcoat: 0.18 });
const SHOP_AWNING_GREEN = material.pbr({ name: "sf-awning-green", color: "#194d33", roughness: 0.78, clearcoat: 0, sheen: 0 });
const SHOP_AWNING_RED = material.pbr({ name: "sf-awning-red", color: "#991b1b", roughness: 0.78, clearcoat: 0, sheen: 0 });

/**Landmark 10 helper: Teleop kerbside dispatch beacon totem integrated onto storefront aprons & standalone export. */
function pushDispatchTotemSlots(slots: MultiMatSlot[], offset: V3, bodyMat: number, trimMat: number, tealMat: number): void {
  const colProfile: V2[] = [[0.34, 0], [0.28, 0.18], [0.18, 0.26], [0.16, 2.35], [0.26, 2.52], [0.08, 2.78], [0, 2.82]];
  slots.push({ mesh: transformMesh(latheMesh(colProfile, 14), { pos: offset }), materialIndex: bodyMat });
  slots.push({ mesh: transformMesh(latheMesh([[0.19, 1.55], [0.23, 1.85], [0.19, 2.15]], 14), { pos: offset }), materialIndex: tealMat });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.56, 0.08, 0.02), { pos: [offset[0], offset[1] + 1.32, offset[2] + 0.16] }), materialIndex: trimMat });
}

export function buildDispatchBeaconTotemNode(options: { readonly id?: string; readonly name?: string; readonly position?: V3 } = {}): GroupNodeBuilder {
  const mats = [TELEOP_MATERIALS.semiStainless, TELEOP_MATERIALS.darkTrim, TELEOP_MATERIALS.tealBeacon];
  const slots: MultiMatSlot[] = [];
  pushDispatchTotemSlots(slots, [0, 0, 0], 0, 1, 2);
  return assembleMultiMaterialNode(options.name ?? "teleop-dispatch-totem", slots, mats, options);
}

/**
 * Street-front building generator (`sf-bldg-l/r-0..7`):
 * - `gridBldgVictorian` / `gridBldgNew2`: Painted Lady Victorian rowhouse ensemble with canted bay windows, gables & stoops.
 * - `gridBldgArtDeco`: Stepped terracotta Art Deco building with arched lobby & vertical piers.
 * - `gridBldgGlassTower`: Glazed curtain-wall tower with ground-floor colonnade & teleop dispatch totem.
 * - `gridBldgMidrise` / `gridBldgNew1`: Brick/limestone SF midrise with shopfront awnings & sidewalk delivery bot.
 */
export function buildStreetBuildingNode(
  specKey: GridAssetKey,
  name: string,
  dims: { readonly frontage: number; readonly height: number; readonly depth: number },
  look: SkyLook,
  position: V3,
  seed: number
): GroupNodeBuilder {
  const w = Math.min(28, Math.max(11, dims.frontage));
  const h = Math.max(16, dims.height);
  const d = Math.min(23.5, Math.max(11, dims.depth));
  const winMat = practicalWindowMat(look, "#fde68a", 1.05);

  if (specKey === "gridBldgVictorian" || specKey === "gridBldgNew2") {
    const pastelA = VICTORIAN_PASTEL_MATS[seed % VICTORIAN_PASTEL_MATS.length]!;
    const pastelB = VICTORIAN_PASTEL_MATS[(seed + 2) % VICTORIAN_PASTEL_MATS.length]!;
    const mats = [pastelA, pastelB, TELEOP_MATERIALS.quartzConcrete, TELEOP_MATERIALS.cableTeak, winMat];
    const slots: MultiMatSlot[] = [];
    const bays = w >= 18 ? 3 : 2;
    const unitW = w / bays;

    for (let b = 0; b < bays; b += 1) {
      const cx = -w * 0.5 + unitW * (b + 0.5);
      const unitH = h * (0.86 + ((b + seed) % 3) * 0.06);
      const pMat = b % 2 === 0 ? 0 : 1;
      slots.push({ mesh: transformMesh(bevelBoxMesh(unitW * 0.96, unitH, d * 0.86, 0.14), { pos: [cx, unitH * 0.5, -d * 0.05] }), materialIndex: pMat });

      // Projecting canted 3-facet Victorian bay window stack (`loftSectionsMesh`) on `+Z` street face
      const bayZ0 = d * 0.38;
      const bayZ1 = d * 0.47;
      const bw = unitW * 0.34;
      const bayRing = (yy: number): V3[] => [
        [cx - bw, yy, bayZ0], [cx - bw * 0.62, yy, bayZ1], [cx + bw * 0.62, yy, bayZ1], [cx + bw, yy, bayZ0],
        [cx + bw, yy, bayZ0 - 0.3], [cx - bw, yy, bayZ0 - 0.3]
      ];
      slots.push({ mesh: loftSectionsMesh([bayRing(3.6), bayRing(unitH - 1.8)], true, true), materialIndex: pMat });
      for (let fl = 1; fl <= 3; fl += 1) {
        const fy = 3.2 + (fl * (unitH - 5.2)) / 3.4;
        slots.push({ mesh: transformMesh(bevelBoxMesh(bw * 1.18, 1.65, 0.14, 0.03), { pos: [cx, fy, bayZ1 + 0.03] }), materialIndex: 4 });
        slots.push({ mesh: transformMesh(bevelBoxMesh(bw * 2.15, 0.28, 0.95, 0.05), { pos: [cx, fy + 1.05, bayZ0 + 0.25] }), materialIndex: 2 });
      }

      // Queen Anne peaked gable (`extrudePolygonMesh`) + bracketed cornice + carved front stoop & teak entry door
      const gablePoly: V2[] = [[-unitW * 0.48, 0], [unitW * 0.48, 0], [0, 2.85]];
      slots.push({ mesh: transformMesh(extrudePolygonMesh(gablePoly, d * 0.84, 0.12, true), { pos: [cx, unitH, -d * 0.05] }), materialIndex: 2 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(unitW * 0.32, 2.35, 0.18, 0.03), { pos: [cx + unitW * 0.22, 1.85, bayZ0 + 0.04] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(unitW * 0.38, 0.72, 1.35, 0.06), { pos: [cx + unitW * 0.22, 0.36, bayZ0 + 0.55] }), materialIndex: 2 });
    }
    return assembleGlazedMultiMaterialNode(name, slots, mats, [], {
      id: name,
      position,
      shadowMaterialIndices: [0, 1]
    });
  }

  if (specKey === "gridBldgGlassTower") {
    const mats = [TELEOP_MATERIALS.semiStainless, TELEOP_MATERIALS.darkTrim, winMat, TELEOP_MATERIALS.tealBeacon];
    const slots: MultiMatSlot[] = [];
    const glass: RawMesh[] = [];
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.78, h, d * 0.78, 0.18), { pos: [0, h * 0.5, 0] }), materialIndex: 2 });
    glass.push(transformMesh(bevelBoxMesh(w * 0.94, h * 0.88, d * 0.92, 0.16), { pos: [0, h * 0.54, 0] }));
    for (const px of [-w * 0.44, 0, w * 0.44]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.65, h, d * 0.95, 0.08), { pos: [px, h * 0.5, 0] }), materialIndex: 0 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.98, 0.65, d * 0.98, 0.12), { pos: [0, 4.4, 0] }), materialIndex: 0 });
    pushDispatchTotemSlots(slots, [w * 0.28, 0, d * 0.5 + 1.15], 0, 1, 3);
    return assembleGlazedMultiMaterialNode(name, slots, mats, glass, {
      id: name,
      position,
      glassMaterial: TELEOP_MATERIALS.glazingSkyline,
      shadowMaterialIndices: [2]
    });
  }

  // Stepped Art Deco terracotta (`gridBldgArtDeco`) & Brick/Limestone Storefront Midrise (`gridBldgMidrise`, `gridBldgNew1`)
  const masonryMat = specKey === "gridBldgArtDeco" ? ART_DECO_MASONRY_MAT : MIDRISE_MASONRY_MATS[seed % MIDRISE_MASONRY_MATS.length]!;
  const awningMat = seed % 2 === 0 ? SHOP_AWNING_GREEN : SHOP_AWNING_RED;
  const mats = [
    masonryMat,
    TELEOP_MATERIALS.quartzConcrete,
    awningMat,
    winMat
  ];
  const slots: MultiMatSlot[] = [];

  const lowerH = specKey === "gridBldgArtDeco" ? h * 0.68 : h * 0.94;
  slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.95, lowerH, d * 0.92, 0.22), { pos: [0, lowerH * 0.5, 0] }), materialIndex: 0 });
  if (specKey === "gridBldgArtDeco") {
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.72, h * 0.32, d * 0.72, 0.2), { pos: [0, lowerH + h * 0.15, 0] }), materialIndex: 0 });
    const arch = archwayVoussoirSlots({ radius: 1.9, thickness: 0.52, depth: 0.85, voussoirs: 7, stoneMatA: 1, stoneMatB: 0, keystoneMat: 1 });
    for (const s of arch) slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 2.2, d * 0.46] }), materialIndex: s.materialIndex });
  } else {
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.99, 0.95, d * 0.98, 0.16), { pos: [0, lowerH + 0.35, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.82, 0.55, 1.45, 0.08), { pos: [0, 3.65, d * 0.48], rot: [0.26, 0, 0] }), materialIndex: 2 });
  }
  const floors = Math.max(3, Math.floor((lowerH - 5) / 3.8));
  for (let fl = 0; fl < floors; fl += 1) {
    const fy = 5.6 + fl * 3.6;
    slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.82, 1.65, 0.16, 0.04), { pos: [0, fy, d * 0.46] }), materialIndex: 3 });
  }

  return assembleGlazedMultiMaterialNode(name, slots, mats, [], { id: name, position, shadowMaterialIndices: [0] });
}

// ---------------------------------------------------------------------------
// Instanced Street Furniture, Foliage, Kerb Beacon & Roof LiDAR Geometries
// ---------------------------------------------------------------------------

/** Landmark 7a: Fluted SF gantry pole (`y in [-3.4, +3.4]`, centered for `ry(3.4)`). */
export function signalPoleGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("signal-pole", () => {
    const profile: V2[] = [[0.24, -3.4], [0.22, -2.65], [0.15, -2.45], [0.13, 3.25], [0.18, 3.34], [0, 3.4]];
    return mergeRawMeshes([latheMesh(profile, 10, true)]);
  });
}

/** Landmark 7b: Open-chord cantilevered signal mast arm (`x in [-2.8, +2.8]`). */
export function signalArmGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("signal-arm", () =>
    mergeRawMeshes([
      latticeTrussMesh({ span: [5.6, 0.26, 0.24], bays: 8, chordRadius: 0.028, braceRadius: 0.018 }),
      bevelBoxMesh(0.38, 0.42, 0.34, 0.03)
    ])
  );
}

/** Landmark 7c: 3-aspect hooded traffic signal luminaire (`sf-signal-lights`). */
export function signalLightGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("signal-light", () => {
    const hood = transformMesh(latheMesh([[0.15, 0], [0.16, 0.16]], 12), { rot: [Math.PI * 0.5, 0, 0] });
    return mergeRawMeshes([
      bevelBoxMesh(0.36, 0.92, 0.24, 0.04),
      transformMesh(hood, { pos: [0, 0.28, 0.12] }),
      transformMesh(hood, { pos: [0, 0, 0.12] }),
      transformMesh(hood, { pos: [0, -0.28, 0.12] })
    ]);
  });
}

/** Landmark 8a: Historic Path-of-Gold cast-iron fluted streetlamp standard (`y in [-3.1, +3.1]`). */
export function streetLampPoleGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("lamp-pole", () => {
    const profile: V2[] = [[0.26, -3.1], [0.24, -2.55], [0.15, -2.25], [0.1, -1.9], [0.08, 2.75], [0.16, 2.98], [0.09, 3.1]];
    return mergeRawMeshes([latheMesh(profile, 12, true)]);
  });
}

/** Landmark 8b: Ribbed teardrop acorn streetlamp lantern (`sf-lamp-globes`). */
export function streetLampGlobeGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("lamp-globe", () => {
    const profile: V2[] = [[0, -0.26], [0.14, -0.2], [0.23, -0.04], [0.21, 0.14], [0.09, 0.26], [0, 0.31]];
    return mergeRawMeshes([latheMesh(profile, 14)]);
  });
}

/** Landmark 9a: Root-flared, multi-limb London plane trunk (`y in [-1.65, +1.95]`). */
export function streetTreeTrunkGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("tree-trunk", () =>
    mergeRawMeshes([
      tubeSweepMesh([[0, -1.65, 0, 0.22], [0.02, -0.4, 0.01, 0.15], [-0.02, 1.15, 0, 0.12], [0, 1.75, 0, 0.08]], 8),
      tubeSweepMesh([[-0.01, 0.85, 0, 0.09], [-0.46, 1.88, 0.28, 0.055]], 6),
      tubeSweepMesh([[0.01, 0.92, 0, 0.09], [0.44, 1.92, -0.26, 0.055]], 6)
    ])
  );
}

/** Landmark 9b: Multi-puff sculpted foliage canopy cluster (`layeredCanopyMesh`, centered around `y = 0`). */
export function streetTreeCrownGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("tree-crown", () =>
    mergeRawMeshes([transformMesh(layeredCanopyMesh({ radius: 1.16, height: 1.95, puffs: 7, seed: 23 }), { pos: [0, -0.95, 0] })])
  );
}

/** Landmark 10a/b: Segmented kerb docking ring (XY plane to match `main.ts` `rx = pi/2`) & concentric pad disc. */
export function beaconRingGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("beacon-ring", () => {
    const pts: V4[] = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0, 0.072] as const;
    });
    return mergeRawMeshes([tubeSweepMesh(pts, 8)]);
  });
}

export function beaconDiscGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("beacon-disc", () =>
    mergeRawMeshes([latheMesh([[0, -0.02], [0.92, -0.02], [0.94, 0.01], [0.76, 0.025], [0, 0.025]], 24)])
  );
}

/** Roof 10 Hz spinning LiDAR optical lens dome & dual-aperture laser rotor (`pod-sensor-housing`, `pod-sensor-laser`). */
export function podSensorHousingGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("pod-sensor-housing", () =>
    mergeRawMeshes([latheMesh([[0, -0.05], [0.16, -0.05], [0.155, 0.03], [0.11, 0.06], [0, 0.065]], 20)])
  );
}

export function podSensorLaserGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("pod-sensor-laser", () =>
    mergeRawMeshes([bevelBoxMesh(0.32, 0.026, 0.064, 0.008), bevelBoxMesh(0.064, 0.022, 0.28, 0.006)])
  );
}
