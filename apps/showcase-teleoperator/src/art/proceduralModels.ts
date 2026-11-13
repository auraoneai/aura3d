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
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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

/** Dark tinted clearcoat `studioGlass` cabin canopy (`#0b1828`, `opacity: 1` for WebGPU transmission safety). */
export function cruiserCanopyGlassMaterial(): AuraMaterialSpec {
  return material.studioGlass({
    name: "av-cruiser-canopy",
    color: "#0b1828",
    tint: "#0b1828",
    attenuationColor: "#07111e",
    roughness: 0.03,
    opacity: 1,
    transmission: 0.82,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.52
  });
}

/** Sleek obsidian/metallic rooftop optical LiDAR turret housing material (`castShadow: false`). */
export function podTurretMaterial(): AuraMaterialSpec {
  return material.pbr({
    name: "av-lidar-turret",
    color: "#0d121a",
    roughness: 0.16,
    metalness: 0.64,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04
  });
}

export const TELEOP_MATERIALS = {
  cruiserPearlWhite: material.carPaint({ name: "av-cruiser-pearl-white", color: "#f6f9fc", roughness: 0.13, metallic: 0.16, clearcoat: 1, clearcoatRoughness: 0.02 }),
  cruiserObsidianTrim: material.carPaint({ name: "av-cruiser-obsidian", color: "#0d121a", roughness: 0.2, metallic: 0.34, clearcoat: 0.88, clearcoatRoughness: 0.04 }),
  cruiserCabinInterior: material.pbr({ name: "av-cruiser-cabin", color: "#080c12", roughness: 0.68, metalness: 0.08 }),
  cruiserCrimsonLed: material.emissive({ name: "av-cruiser-crimson-led", color: "#ff1f33", emissive: BRAKE_RED, emissiveIntensity: 2.35, practical: true }),
  cruiserMatrixDrl: material.emissive({ name: "av-cruiser-matrix-drl", color: "#f8fbff", emissive: "#dbeafe", emissiveIntensity: 2.45, practical: true }),
  cruiserCanopyGlass: cruiserCanopyGlassMaterial(),
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
  batchedFacadeMasonry: material.ceramic({ name: "sf-batched-facade", color: "#ffffff", roughness: 0.52, clearcoat: 0.16, clearcoatRoughness: 0.24 }),
  batchedLandmarkSurface: material.pbr({ name: "sf-batched-landmark", color: "#ffffff", roughness: 0.56, metalness: 0.12, clearcoat: 0, sheen: 0 }),
  batchedVehicleCoat: material.carPaint({ name: "av-batched-coachwork", color: "#ffffff", roughness: 0.19, metallic: 0.28, clearcoat: 0.96, clearcoatRoughness: 0.03 }),
  batchedCommuterCloth: material.fabric({ name: "commuter-batched-cloth", color: "#ffffff", roughness: 0.66, sheen: 0.44, sheenColor: "#cbd5e1", sheenRoughness: 0.5 }),
  glazingClear: avGlazingMaterial("#cde6f5", 0.42),
  glazingSkyline: avGlazingMaterial("#8cb8d8", 0.46)
} as const;

/** Instancing-safe (`clearcoat: 0, sheen: 0`) street-furniture & lush sunlit foliage materials for pools with `> 16` instances. */
export const INSTANCED_STREET_MATERIALS = {
  gantrySteel: material.metal({ name: "sf-gantry-steel", color: "#334155", roughness: 0.34, metallic: 0.76, clearcoat: 0, sheen: 0 }),
  castIronPole: material.metal({ name: "sf-cast-iron", color: "#1e293b", roughness: 0.42, metallic: 0.68, clearcoat: 0, sheen: 0 }),
  treeBark: material.pbr({ name: "sf-london-plane-bark", color: "#564336", roughness: 0.88, metalness: 0.02, clearcoat: 0, sheen: 0 }),
  treeFoliage: material.pbr({ name: "sf-street-foliage", color: "#2e7f47", roughness: 0.72, metalness: 0.02, clearcoat: 0, sheen: 0 }),
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

function isEmissiveMaterialSpec(mat: AuraMaterialSpec | undefined): boolean {
  if (!mat) return false;
  const rec = mat as Record<string, unknown>;
  return rec.emissive !== undefined || (typeof rec.emissiveIntensity === "number" && rec.emissiveIntensity > 0.01);
}

function materialHexColor(mat: AuraMaterialSpec | undefined, fallback = "#dce4ee"): string {
  if (mat && typeof mat.color === "string" && mat.color.startsWith("#")) return mat.color;
  return fallback;
}

interface CoalescedVehicleGeometry {
  readonly opaqueSpec: AuraCustomGeometrySpec | null;
  readonly emissiveSpec: AuraCustomGeometrySpec | null;
  readonly emissiveMaterials: readonly AuraMaterialSpec[];
  readonly glassSpec: AuraCustomGeometrySpec | null;
}

/**
 * Coalesces multi-material vehicle coachwork into 1 memoized vertex-colored + cavity-AO clearcoat draw call,
 * 1 `castShadow: false` emissive lamp draw call, and 1 `castShadow: false` wrap-around glazing draw call.
 */
function assembleGlazedMultiMaterialNode(
  name: string,
  opaqueSlots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  glassMeshes: readonly RawMesh[],
  options: {
    readonly id?: string;
    readonly cacheKey?: string;
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
  const matSig = materials.map((m) => materialHexColor(m)).join(",");
  const memoKey = `teleop-veh:${options.cacheKey ?? name}:${matSig}:${opaqueSlots.length}:${glassMeshes.length}`;
  const geo = memoizeGeometry<CoalescedVehicleGeometry>(memoKey, () => {
    const paintedOpaque: RawMesh[] = [];
    const emissiveSlots: MultiMatSlot[] = [];
    const emissiveRemap = new Map<number, number>();
    const emissiveMaterials: AuraMaterialSpec[] = [];

    for (const s of opaqueSlots) {
      if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
      const mat = materials[s.materialIndex];
      if (isEmissiveMaterialSpec(mat)) {
        let emIdx = emissiveRemap.get(s.materialIndex);
        if (emIdx === undefined) {
          emIdx = emissiveMaterials.length;
          emissiveRemap.set(s.materialIndex, emIdx);
          emissiveMaterials.push(mat!);
        }
        emissiveSlots.push({ mesh: s.mesh, materialIndex: emIdx });
      } else {
        paintedOpaque.push(bakeMeshCavityAO(paintMeshColors(s.mesh, materialHexColor(mat), true), 0.14));
      }
    }

    return {
      opaqueSpec: paintedOpaque.length > 0 ? mergeRawMeshes(paintedOpaque) : null,
      emissiveSpec: emissiveSlots.length > 0 ? buildGroupedGeometrySpec(emissiveSlots) : null,
      emissiveMaterials,
      glassSpec: glassMeshes.length > 0 ? mergeRawMeshes(glassMeshes) : null
    };
  });

  const children = [];
  if (geo.opaqueSpec) {
    children.push(
      geometry.custom(geo.opaqueSpec, {
        name: `${name}-opaque`,
        material: TELEOP_MATERIALS.batchedVehicleCoat,
        castShadow: cast,
        receiveShadow: receive
      })
    );
  }
  if (geo.emissiveSpec && geo.emissiveMaterials.length > 0) {
    children.push(
      geometry.multiMaterial(geo.emissiveSpec, geo.emissiveMaterials, {
        name: `${name}-practicals`,
        castShadow: false,
        receiveShadow: false
      })
    );
  }
  if (geo.glassSpec) {
    children.push(
      geometry.custom(geo.glassSpec, {
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
 * Batches multi-color static architectural facades & skyline landmarks into 1 vertex-colored opaque
 * `geometry.custom` draw call (+ 1 optional emissive window/beacon draw call + 1 optional glazing draw call).
 */
function assembleBatchedVertexColorNode(
  name: string,
  cacheKey: string,
  build: () => {
    readonly opaque: readonly ColoredRawMesh[];
    readonly emissive?: readonly ColoredRawMesh[];
    readonly glass?: readonly RawMesh[];
  },
  options: {
    readonly id?: string;
    readonly position?: V3;
    readonly rotation?: V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly opaqueMaterial?: AuraMaterialSpec;
    readonly emissiveMaterial?: AuraMaterialSpec;
    readonly glassMaterial?: AuraMaterialSpec;
  } = {}
): GroupNodeBuilder {
  const opaqueKey = `${cacheKey}:opaque`;
  const emissiveKey = `${cacheKey}:emissive`;
  const glassKey = `${cacheKey}:glass`;
  let opaqueSpec = SPEC_CACHE.get(opaqueKey);
  let emissiveSpec = SPEC_CACHE.get(emissiveKey);
  let glassSpec = SPEC_CACHE.get(glassKey);
  if (!opaqueSpec) {
    const built = build();
    opaqueSpec = mergeColoredMeshesToSpec(built.opaque);
    SPEC_CACHE.set(opaqueKey, opaqueSpec);
    if (built.emissive && built.emissive.length > 0) {
      emissiveSpec = mergeColoredMeshesToSpec(built.emissive);
      SPEC_CACHE.set(emissiveKey, emissiveSpec);
    }
    if (built.glass && built.glass.length > 0) {
      glassSpec = mergeRawMeshes(built.glass);
      SPEC_CACHE.set(glassKey, glassSpec);
    }
  }
  const cast = options.castShadow ?? false;
  const receive = options.receiveShadow ?? false;
  const children = [
    geometry.custom(opaqueSpec, {
      name: `${name}-opaque`,
      material: options.opaqueMaterial ?? TELEOP_MATERIALS.batchedLandmarkSurface,
      castShadow: cast,
      receiveShadow: receive
    })
  ];
  if (emissiveSpec && options.emissiveMaterial) {
    children.push(
      geometry.custom(emissiveSpec, {
        name: `${name}-emissive`,
        material: options.emissiveMaterial,
        castShadow: false,
        receiveShadow: false
      })
    );
  }
  if (glassSpec) {
    children.push(
      geometry.custom(glassSpec, {
        name: `${name}-glazing`,
        material: options.glassMaterial ?? TELEOP_MATERIALS.glazingSkyline,
        castShadow: false,
        receiveShadow: receive
      })
    );
  }
  let root = group(name, children, {
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {})
  });
  if (options.id) root = root.runtime({ id: options.id });
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

/**
 * 16-point high-resolution cross-section station for the two-tone `Apex Lidar Cruiser` (`cruiser`):
 * carves circular front/rear wheel-well cutouts (`z = ±1.24 m`, lifting outer arch lip up to `y = 0.77 m`
 * above the `0.72 m` tire crown while keeping the inner floor `0.56 m` inside the `0.71 m` inner tire wall),
 * sculpted wheel-arch fender flares, and a sharp nose-to-tail character crease.
 */
function cruiserLowerBodyRing(z: number): V3[] {
  const df = Math.abs(z + 1.24) / 0.43;
  const dr = Math.abs(z - 1.24) / 0.43;
  const arch = Math.max(
    df < 1 ? Math.sqrt(Math.max(0, 1 - df * df)) : 0,
    dr < 1 ? Math.sqrt(Math.max(0, 1 - dr * dr)) : 0
  );
  const endFrac = Math.max(0, (Math.abs(z) - 1.48) / 0.46);
  const taper = 1 - 0.27 * endFrac * endFrac;
  const flare = 0.052 * arch;

  const yFloor = 0.17 + 0.09 * endFrac * endFrac;
  const yArchLip = 0.2 + 0.07 * endFrac + 0.57 * arch;
  const yBelt = z < 0 ? 0.88 - 0.14 * Math.pow(Math.max(0, -z / 1.94), 1.7) : 0.88 + 0.03 * Math.sin(Math.min(1, z / 1.5) * Math.PI) - 0.03 * endFrac;
  const yCrease = Math.max(yArchLip + 0.055, yBelt - 0.095);
  const yFlank = Math.max(yArchLip + 0.022, (yArchLip + yCrease) * 0.54);
  const yDeck = yBelt + 0.022;

  const hwFloor = 0.55 * taper;
  const hwLip = (0.855 + 0.045 * arch) * taper;
  const hwFlank = 0.895 * taper + flare;
  const hwCrease = 0.91 * taper + flare * 1.08;
  const hwBelt = 0.84 * taper + flare * 0.38;
  const hwDeck = 0.68 * taper;

  return [
    [0, yFloor, z],
    [hwFloor, yFloor + 0.01, z],
    [hwLip, yArchLip, z],
    [hwFlank, yFlank, z],
    [hwCrease, yCrease, z],
    [hwBelt, yBelt, z],
    [hwDeck, yDeck, z],
    [0, yDeck + 0.012, z],
    [-hwDeck, yDeck, z],
    [-hwBelt, yBelt, z],
    [-hwCrease, yCrease, z],
    [-hwFlank, yFlank, z],
    [-hwLip, yArchLip, z],
    [-hwFloor, yFloor + 0.01, z]
  ];
}

/**
 * 1. Hero `Apex Lidar Cruiser` (`cruiser`, 3.90 m): sleek two-tone pearl-gloss white (`#f6f9fc`) &
 * obsidian-black (`#0d121a`) autonomous pod/cruiser with open sculpted wheel-arch fender flares,
 * dark `#0b1828` `studioGlass` cabin canopy, full-width crimson rear LED lightbar + corner brake blades,
 * sharp matrix LED DRL headlamps, and obsidian aero rooftop sensor mast + 4 corner LiDAR pucks.
 */
export function buildBidirectionalRobotaxiPodNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly position?: V3;
  readonly scale?: number | V3;
} = {}): GroupNodeBuilder {
  const mats = [
    TELEOP_MATERIALS.cruiserPearlWhite,
    TELEOP_MATERIALS.cruiserObsidianTrim,
    TELEOP_MATERIALS.cruiserCabinInterior,
    TELEOP_MATERIALS.tireRubber,
    TELEOP_MATERIALS.forgedRim,
    TELEOP_MATERIALS.brakeRotor,
    TELEOP_MATERIALS.cruiserMatrixDrl,
    TELEOP_MATERIALS.cruiserCrimsonLed,
    TELEOP_MATERIALS.tealBeacon,
    TELEOP_MATERIALS.forgedRim
  ];
  const slots: MultiMatSlot[] = [];
  const glass: RawMesh[] = [];

  // 1a. Sculpted pearl-gloss white (`#f6f9fc`) lower/mid body with smooth Loop subdivision + aero upper fuselage shell
  const zStations = [
    -1.94, -1.85, -1.68, -1.54, -1.39, -1.24, -1.09, -0.92, -0.52,
    0, 0.52, 0.92, 1.09, 1.24, 1.39, 1.54, 1.68, 1.83, 1.91
  ];
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(zStations.map((z) => cruiserLowerBodyRing(z)), true, false), 1, 0.42), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(
      sculptStreamlinedHullMesh(3.72, 1.62, 0.62, {
        stations: 18,
        ringPoints: 16,
        noseSharpness: 1.32,
        tailTaper: 1.18,
        canopyBulge: 0.22,
        underbodyFlat: 0.72
      }),
      { pos: [0, 0.56, -0.02], rot: [0, Math.PI, 0] }
    ),
    materialIndex: 0
  });

  // 1b. Obsidian-black (`#0d121a`) wheel-arch claddings + dark inner wheel-well splash liners around all 4 wheels
  for (const sx of [-1, 1] as const) {
    for (const az of [-1.24, 1.24] as const) {
      const archTrimPts: V4[] = Array.from({ length: 13 }, (_, i) => {
        const a = (0.06 + (i / 12) * 0.88) * Math.PI;
        return [sx * 0.895, 0.36 + Math.sin(a) * 0.415, az - Math.cos(a) * 0.425, 0.028] as const;
      });
      slots.push({ mesh: tubeSweepMesh(archTrimPts, 8), materialIndex: 1 });

      const linerInner: V3[] = [];
      const linerOuter: V3[] = [];
      for (let i = 0; i <= 10; i += 1) {
        const a = (0.05 + (i / 10) * 0.9) * Math.PI;
        const ly = 0.36 + Math.sin(a) * 0.395;
        const lz = az - Math.cos(a) * 0.405;
        linerInner.push([sx * 0.58, ly, lz]);
        linerOuter.push([sx * 0.875, ly, lz]);
      }
      slots.push({ mesh: loftSectionsMesh([linerInner, linerOuter], false, false), materialIndex: 2 });
    }
    // Sculpted obsidian lower rocker aero sills & side camera aero blades
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.09, 0.11, 1.62, 0.024), { pos: [sx * 0.865, 0.215, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.05, 0.036, 2.52, 0.01), { pos: [sx * 0.835, 0.892, 0.02] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.15, 0.052, 0.18, 0.016), { pos: [sx * 0.9, 0.93, -0.76] }), materialIndex: 1 });
  }

  // 1c. Obsidian-black (`#0d121a`) front aero splitter + intake (`-Z`) & multi-strake rear diffuser (`+Z`)
  const splitterPoly: V2[] = [[-0.68, -1.72], [-0.76, -1.84], [-0.58, -1.96], [0.58, -1.96], [0.76, -1.84], [0.68, -1.72]];
  slots.push({ mesh: transformMesh(extrudePolygonMesh(splitterPoly, 0.055, 0.015, false), { pos: [0, 0.185, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.13, 0.09, 0.02), { pos: [0, 0.32, -1.9] }), materialIndex: 1 });
  for (const sx of [-0.67, 0.67]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.075, 0.19, 0.12, 0.018), { pos: [sx, 0.49, -1.86], rot: [0, 0, sx > 0 ? -0.18 : 0.18] }), materialIndex: 1 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.44, 0.16, 0.18, 0.028), { pos: [0, 0.26, 1.84], rot: [-0.18, 0, 0] }), materialIndex: 1 });
  for (const dx of [-0.48, -0.16, 0.16, 0.48]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.028, 0.15, 0.22, 0.008), { pos: [dx, 0.25, 1.86], rot: [-0.16, 0, 0] }), materialIndex: 1 });
  }

  // 1d. Dark cabin interior tub (`#080c12`) + wraparound `#0b1828` `studioGlass` canopy (`castShadow: false`)
  const cabinTub: V3[][] = [-1.22, -0.68, 0, 0.68, 1.24].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({
      z,
      yBottom: 0.84,
      yBelt: 1.12,
      yTop: end ? 1.24 : 1.4,
      halfWidthBottom: end ? 0.58 : 0.68,
      halfWidthBelt: end ? 0.56 : 0.65,
      halfWidthTop: end ? 0.46 : 0.54,
      crown: 0.02
    });
  });
  slots.push({ mesh: loftSectionsMesh(cabinTub, true, false), materialIndex: 2 });

  const canopyStations: readonly [number, number, number, number, number][] = [
    [-1.44, 0.83, 0.91, 0.66, 0.54],
    [-1.18, 0.86, 1.22, 0.77, 0.63],
    [-0.82, 0.88, 1.49, 0.81, 0.64],
    [-0.32, 0.89, 1.56, 0.82, 0.63],
    [0.18, 0.89, 1.56, 0.82, 0.63],
    [0.78, 0.9, 1.48, 0.8, 0.62],
    [1.16, 0.9, 1.24, 0.76, 0.6],
    [1.44, 0.88, 0.94, 0.66, 0.52]
  ];
  const canopyRings: V3[][] = canopyStations.map(([z, yB, yT, hwB, hwT]) =>
    coachStationRing({ z, yBottom: yB, yBelt: (yB + yT) * 0.54, yTop: yT, halfWidthBottom: hwB, halfWidthBelt: (hwB + hwT) * 0.52, halfWidthTop: hwT, crown: 0.028 })
  );
  glass.push(subdivideSmoothMesh(loftSectionsMesh(canopyRings, true, false), 1, 0.52));

  // 1e. Obsidian-black (`#0d121a`) upper greenhouse roof arch & sculpted A / B / C pillars
  const roofArch: V3[][] = [-0.94, -0.45, 0.08, 0.58, 1.02].map((z, idx) => {
    const end = idx === 0 || idx === 4;
    return coachStationRing({
      z,
      yBottom: end ? 1.47 : 1.52,
      yBelt: end ? 1.51 : 1.565,
      yTop: end ? 1.54 : 1.6,
      halfWidthBottom: end ? 0.58 : 0.64,
      halfWidthBelt: end ? 0.56 : 0.62,
      halfWidthTop: end ? 0.48 : 0.54,
      crown: 0.022
    });
  });
  slots.push({ mesh: loftSectionsMesh(roofArch, true, false), materialIndex: 1 });
  for (const sx of [-1, 1] as const) {
    // A-pillar, B-pillar, and C-pillar buttress in gloss obsidian black
    slots.push({
      mesh: tubeSweepMesh([[sx * 0.72, 0.85, -1.4, 0.036], [sx * 0.68, 1.21, -1.12, 0.034], [sx * 0.61, 1.52, -0.82, 0.032]], 8),
      materialIndex: 1
    });
    slots.push({
      mesh: tubeSweepMesh([[sx * 0.815, 0.89, -0.04, 0.034], [sx * 0.73, 1.24, -0.03, 0.032], [sx * 0.63, 1.55, -0.02, 0.03]], 8),
      materialIndex: 1
    });
    slots.push({
      mesh: tubeSweepMesh([[sx * 0.6, 1.51, 0.84, 0.038], [sx * 0.68, 1.23, 1.15, 0.044], [sx * 0.72, 0.9, 1.44, 0.048]], 8),
      materialIndex: 1
    });
  }

  // 1f. Obsidian aerodynamic rooftop sensor mast (`y = 1.57..1.85 m, z = -0.156 m`) + 4 corner LiDAR pucks
  const mastSec: V3[][] = [-0.42, -0.156, 0.14].map((z, idx) =>
    coachStationRing({
      z,
      yBottom: 1.57,
      yBelt: 1.71,
      yTop: idx === 1 ? 1.842 : 1.79,
      halfWidthBottom: idx === 1 ? 0.28 : 0.2,
      halfWidthBelt: idx === 1 ? 0.21 : 0.15,
      halfWidthTop: idx === 1 ? 0.165 : 0.11,
      crown: 0.01
    })
  );
  slots.push({ mesh: loftSectionsMesh(mastSec, true, false), materialIndex: 1 });
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.175, 0], [0.168, 0.028], [0.145, 0.036]], 20), { pos: [0, 1.825, -0.156] }), materialIndex: 9 });
  slots.push({ mesh: transformMesh(latheMesh([[0.169, 0.008], [0.174, 0.018], [0.169, 0.028]], 20), { pos: [0, 1.825, -0.156] }), materialIndex: 8 });
  for (const sx of [-0.53, 0.53]) {
    pushLidarPuck(slots, glass, [sx, 1.51, -0.88], 0.078, 0.11, 1, 8);
    pushLidarPuck(slots, glass, [sx, 1.5, 0.9], 0.074, 0.105, 1, 8);
  }

  // 1g. Sharp matrix LED DRL headlamps (`-Z`) & full-width sculpted crimson rear LED lightbar + corner blades (`+Z`)
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.46, 0.105, 0.07, 0.02), { pos: [0, 0.735, -1.87] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.026, 0.05, 0.008), { pos: [0, 0.735, -1.905] }), materialIndex: 8 });
  for (const sx of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh([[sx * 0.28, 0.735, -1.9, 0.018], [sx * 0.58, 0.745, -1.86, 0.022], [sx * 0.71, 0.79, -1.78, 0.018]], 7),
      materialIndex: 6
    });
    for (let m = 0; m < 3; m += 1) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.055, 0.042, 0.05, 0.01), { pos: [sx * (0.38 + m * 0.09), 0.71, -1.89 + m * 0.014] }), materialIndex: 6 });
    }
  }

  slots.push({ mesh: transformMesh(bevelBoxMesh(1.54, 0.135, 0.08, 0.024), { pos: [0, 0.826, 1.855] }), materialIndex: 1 });
  const rearBarPts: V4[] = [
    [-0.73, 0.826, 1.83, 0.026],
    [-0.44, 0.826, 1.878, 0.028],
    [0, 0.826, 1.892, 0.03],
    [0.44, 0.826, 1.878, 0.028],
    [0.73, 0.826, 1.83, 0.026]
  ];
  slots.push({ mesh: tubeSweepMesh(rearBarPts, 8), materialIndex: 7 });
  for (const sx of [-0.73, 0.73]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.055, 0.165, 0.09, 0.016), { pos: [sx, 0.805, 1.825], rot: [0, sx > 0 ? -0.22 : 0.22, 0] }), materialIndex: 7 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.03, 0.05, 0.008), { pos: [0, 0.29, 1.9] }), materialIndex: 7 });

  // 1h. Flush cyan autonomous dispatch side lightblades + 4 exposed 7-spoke forged wheels (`minY = 0`)
  for (const sx of [-0.885, 0.885]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.022, 0.024, 1.48, 0.008), { pos: [sx, 0.44, 0] }), materialIndex: 8 });
  }
  pushWheelSet(slots, { trackHalfX: 0.83, axleZs: [-1.24, 1.24], radius: 0.36, width: 0.24, spokeCount: 7, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-apex-lidar-cruiser", slots, mats, glass, {
    ...options,
    cacheKey: "av-apex-lidar-cruiser",
    glassMaterial: TELEOP_MATERIALS.cruiserCanopyGlass
  });
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
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(bodySec, true, false), 1, 0.44), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(
      sculptStreamlinedHullMesh(3.84, 1.78, 0.68, { stations: 16, ringPoints: 14, noseSharpness: 1.25, tailTaper: 1.18, canopyBulge: 0.24, underbodyFlat: 0.7 }),
      { pos: [0, 0.58, -0.02], rot: [0, Math.PI, 0] }
    ),
    materialIndex: 0
  });

  const cabinGlass: V3[][] = [
    coachStationRing({ z: -1.05, yBottom: 0.94, yBelt: 1.18, yTop: 1.48, halfWidthBottom: 0.82, halfWidthBelt: 0.79, halfWidthTop: 0.7, crown: 0.03 }),
    coachStationRing({ z: -0.15, yBottom: 0.96, yBelt: 1.32, yTop: 1.66, halfWidthBottom: 0.88, halfWidthBelt: 0.83, halfWidthTop: 0.73, crown: 0.04 }),
    coachStationRing({ z: 0.88, yBottom: 0.98, yBelt: 1.3, yTop: 1.56, halfWidthBottom: 0.85, halfWidthBelt: 0.8, halfWidthTop: 0.68, crown: 0.03 }),
    coachStationRing({ z: 1.58, yBottom: 1.0, yBelt: 1.18, yTop: 1.32, halfWidthBottom: 0.72, halfWidthBelt: 0.68, halfWidthTop: 0.6, crown: 0.02 })
  ];
  glass.push(subdivideSmoothMesh(loftSectionsMesh(cabinGlass, true, false), 1, 0.5));

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

  return assembleGlazedMultiMaterialNode(options.name ?? "av-crossover", slots, mats, glass, { cacheKey: "av-crossover", ...options });
}
/** 3. Autonomous Origin Shuttle (`rival-car-0`, 3.90 m): flat-floor commuter shuttle with dual roof lidars. */
export function buildAutonomousShuttleNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly position?: V3;
  readonly castShadow?: boolean;
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
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(bodySec, true, false), 1, 0.46), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(
      sculptStreamlinedHullMesh(3.76, 1.76, 1.12, { stations: 16, ringPoints: 14, noseSharpness: 0.92, tailTaper: 0.92, canopyBulge: 0.16, underbodyFlat: 0.8 }),
      { pos: [0, 0.76, 0], rot: [0, Math.PI, 0] }
    ),
    materialIndex: 0
  });

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
  glass.push(subdivideSmoothMesh(loftSectionsMesh(vistaGlass, true, false), 1, 0.48));

  pushLidarPuck(slots, glass, [0, 2.5, -1.24], 0.16, 0.18, 2, 8);
  pushLidarPuck(slots, glass, [0, 2.5, 1.24], 0.16, 0.18, 2, 8);
  for (const sx of [-0.92, 0.92]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.022, 0.03, 1.62, 0.008), { pos: [sx, 0.74, 0] }), materialIndex: 8 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.54, 0.05, 0.07, 0.015), { pos: [0, 2.34, -1.78] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.075, 0.07, 0.018), { pos: [0, 0.64, -1.91] }), materialIndex: 6 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.52, 0.09, 0.07, 0.018), { pos: [0, 0.78, 1.91] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.84, axleZs: [-1.32, 1.32], radius: 0.34, width: 0.22, spokeCount: 6, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-origin-shuttle", slots, mats, glass, { cacheKey: "av-origin-shuttle", ...options });
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
  readonly castShadow?: boolean;
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

  return assembleGlazedMultiMaterialNode(options.name ?? "av-response-suv", slots, mats, glass, { cacheKey: `av-response-suv:${emergency ? 1 : 0}`, ...options });
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
  readonly castShadow?: boolean;
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
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(hullSec, true, false), 1, 0.45), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(
      sculptStreamlinedHullMesh(4.42 * lenScale, 1.94, 0.56, { stations: 16, ringPoints: 14, noseSharpness: 1.44, tailTaper: 1.24, canopyBulge: 0.24, underbodyFlat: 0.76 }),
      { pos: [0, 0.5, -0.02 * lenScale], rot: [0, Math.PI, 0] }
    ),
    materialIndex: 0
  });

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
  glass.push(subdivideSmoothMesh(loftSectionsMesh(domeSec, true, false), 1, 0.5));

  // Flush optical lidar brow + rear aero diffuser + forged 7-spoke alloys
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.56, 0.055, 0.22, 0.015), { pos: [0, 1.26, -0.58 * lenScale] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.03, 0.05, 0.008), { pos: [0, 1.27, -0.69 * lenScale] }), materialIndex: 8 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.62, 0.14, 0.22, 0.02), { pos: [0, 0.24, 2.2 * lenScale] }), materialIndex: 1 });
  for (const sx of [-0.72, 0.72]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.065, 0.08, 0.016), { pos: [sx, 0.56, -2.26 * lenScale] }), materialIndex: 6 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.74, 0.075, 0.07, 0.018), { pos: [0, 0.59, 2.24 * lenScale] }), materialIndex: 7 });
  pushWheelSet(slots, { trackHalfX: 0.96, axleZs: [-1.42 * lenScale, 1.38 * lenScale], radius: 0.35, width: 0.26, spokeCount: 7, tireMat: 3, rimMat: 4, rotorMat: 5 });

  return assembleGlazedMultiMaterialNode(options.name ?? "av-luxury-gt", slots, mats, glass, { cacheKey: `av-luxury-gt:${lenScale.toFixed(2)}:${options.finish ?? "crimson"}`, ...options });
}

// ---------------------------------------------------------------------------
// Historic San Francisco Powell-Mason Cable Car (`rival-car-3`, 8.20 m)
// ---------------------------------------------------------------------------

export function buildSfCableCarNode(options: {
  readonly id?: string;
  readonly name?: string;
  readonly position?: V3;
  readonly castShadow?: boolean;
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

  return assembleGlazedMultiMaterialNode(options.name ?? "sf-powell-mason-cablecar", slots, mats, glass, { cacheKey: "sf-powell-mason-cablecar", ...options });
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

  return assembleGlazedMultiMaterialNode(options.name ?? `sf-traffic-${kind}`, slots, mats, glass, {
    cacheKey: `sf-traffic-${kind}:${options.coatKey ?? defaultCoat[kind]}:${options.taxiMedallion ? 1 : 0}`,
    castShadow: false,
    ...options
  });
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
  if (rivalIndex === 0) return buildAutonomousShuttleNode({ id, name: id, position, castShadow: false });
  if (rivalIndex === 1) return buildRivalLuxuryAvNode({ id, name: id, position, lengthM: 4.0, finish: "champagne", castShadow: false });
  if (rivalIndex === 2) return buildTeleopResponseSuvNode({ id, name: id, position, emergencyLiveried: true, castShadow: false });
  if (rivalIndex === 3) return buildSfCableCarNode({ id, name: id, position, castShadow: false });
  return buildRivalLuxuryAvNode({ id, name: id, position, lengthM: 4.66, finish: "amber", castShadow: false });
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
  return assembleBatchedVertexColorNode(
    "sf-pyramid-tower",
    "landmark-pyramid-tower",
    () => {
      const opaque: ColoredRawMesh[] = [];
      const emissive: ColoredRawMesh[] = [];
      const glass: RawMesh[] = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          opaque.push(tintRawMesh(tubeSweepMesh([[sx * 14.5, 0, sz * 14.5, 0.95], [sx * 11.2, 14, sz * 11.2, 0.8]], 8), "#e2e6ec"));
          opaque.push(tintRawMesh(tubeSweepMesh([[sx * 7.2, 0, sz * 14.5, 0.72], [sx * 11.2, 14, sz * 11.2, 0.65]], 8), "#d9dee6"));
        }
      }
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(25, 3.2, 25, 0.35), { pos: [0, 14.5, 0] }), "#e2e6ec"));
      const mainSpire: V3[][] = [
        squareTaperingSection(12.2, 12.2, 14),
        squareTaperingSection(9.4, 9.4, 48),
        squareTaperingSection(6.5, 6.5, 86),
        squareTaperingSection(3.4, 3.4, 128)
      ];
      opaque.push(tintRawMesh(loftSectionsMesh(mainSpire, true, true), "#e6eaf0"));
      for (const wx of [-1, 1]) {
        const wing: V3[][] = [
          squareTaperingSection(2.4, 3.6, 28).map(([x, y, z]) => [x + wx * 9.8, y, z]),
          squareTaperingSection(2.2, 3.3, 74).map(([x, y, z]) => [x + wx * 6.9, y, z]),
          squareTaperingSection(1.6, 2.5, 108).map(([x, y, z]) => [x + wx * 4.4, y, z])
        ];
        opaque.push(tintRawMesh(loftSectionsMesh(wing, true, true), "#dce2ea"));
      }
      for (let tier = 0; tier < 9; tier += 1) {
        const ty = 22 + tier * 10.5;
        const hw = 11.4 - tier * 0.84;
        emissive.push(tintRawMesh(transformMesh(bevelBoxMesh(hw * 1.72, 1.8, hw * 2.03, 0.08), { pos: [0, ty, 0] }), "#fef3c7"));
      }
      const crownGlass: V3[][] = [
        squareTaperingSection(3.35, 3.35, 128),
        squareTaperingSection(1.5, 1.5, 140),
        squareTaperingSection(0.18, 0.18, 148.5)
      ];
      glass.push(loftSectionsMesh(crownGlass, true, true));
      emissive.push(tintRawMesh(transformMesh(icosphereFacetMesh(0.75, 1), { pos: [0, 149.4, 0] }), "#ff4a3d"));
      return { opaque, emissive, glass };
    },
    {
      position,
      emissiveMaterial: practicalWindowMat(look, "#fef3c7", 1.15),
      glassMaterial: TELEOP_MATERIALS.glazingSkyline
    }
  );
}

/** Landmark 2a: International-Orange Suspension Bridge Tower (`118 m`, stepped Art Deco legs + lattice trusses). */
export function buildSuspensionBridgeTowerNode(name: string, position: V3, yaw = 0): GroupNodeBuilder {
  return assembleBatchedVertexColorNode(
    name,
    "landmark-bridge-tower",
    () => {
      const opaque: ColoredRawMesh[] = [];
      const pierRing: V2[] = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [Math.cos(a) * 11.5, Math.sin(a) * 6.8] as const;
      });
      opaque.push(tintRawMesh(transformMesh(extrudePolygonMesh(pierRing, 7.2, 0.45, false), { pos: [0, 3.4, 0], rot: [-Math.PI * 0.5, 0, 0] }), "#64748b"));
      for (const lz of [-6.2, 6.2]) {
        const leg: V3[][] = [
          squareTaperingSection(2.6, 2.2, 6.5).map(([x, y, z]) => [x, y, z + lz]),
          squareTaperingSection(2.2, 1.9, 42).map(([x, y, z]) => [x, y, z + lz]),
          squareTaperingSection(1.85, 1.6, 78).map(([x, y, z]) => [x, y, z + lz]),
          squareTaperingSection(1.45, 1.3, 116).map(([x, y, z]) => [x, y, z + lz])
        ];
        opaque.push(tintRawMesh(loftSectionsMesh(leg, true, true), "#c0362c"));
        opaque.push(tintRawMesh(transformMesh(latheMesh([[0, 0], [1.75, 0], [1.5, 2.2], [0, 2.5]], 14), { pos: [0, 116, lz] }), "#1e293b"));
        opaque.push(tintRawMesh(transformMesh(icosphereSmoothMesh(0.62, 1), { pos: [0, 119.2, lz] }), "#ef4444"));
      }
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(4.4, 2.6, 15.6, 0.2), { pos: [0, 29.2, 0] }), "#c0362c"));
      for (const py of [18, 52, 78, 104]) {
        opaque.push(
          tintRawMesh(transformMesh(latticeTrussMesh({ span: [2.6, 5.2, 10.4], bays: 4, chordRadius: 0.28, braceRadius: 0.18 }), { pos: [0, py, 0] }), "#c0362c")
        );
      }
      return { opaque };
    },
    { position, rotation: [0, yaw, 0] }
  );
}

/** Landmark 2b: Suspension Bridge Stiffening Deck Truss, Aero Wind Fairings, Glazed Skybridge Portals & Parabolic Main Cables. */
export function buildSuspensionBridgeSpanNode(position: V3, towerX = 88): GroupNodeBuilder {
  return assembleBatchedVertexColorNode(
    "sf-bridge-span",
    `landmark-bridge-span-${towerX}`,
    () => {
      const opaque: ColoredRawMesh[] = [];
      const glass: RawMesh[] = [];
      const totalSpan = towerX * 2 + 56;
      opaque.push(tintRawMesh(latticeTrussMesh({ span: [totalSpan, 4.4, 13.6], bays: 14, chordRadius: 0.42, braceRadius: 0.24 }), "#c0362c"));
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(totalSpan, 0.65, 13.8, 0.12), { pos: [0, 2.35, 0] }), "#1e293b"));
      // Sculpted aerodynamic deck wind-fairing edge pods + glazed pedestrian skybridge observation gallery
      const deckFairing = subdivideSmoothMesh(
        sculptStreamlinedHullMesh(totalSpan * 0.96, 15.2, 1.35, {
          stations: 14,
          ringPoints: 12,
          noseSharpness: 0.72,
          tailTaper: 0.72,
          canopyBulge: 0.08,
          underbodyFlat: 0.55
        }),
        1,
        0.48
      );
      opaque.push(tintRawMesh(transformMesh(deckFairing, { pos: [0, 2.1, 0], rot: [0, Math.PI * 0.5, 0] }), "#b63329"));
      glass.push(transformMesh(subdivideSmoothMesh(bevelBoxMesh(totalSpan * 0.52, 1.95, 2.6, 0.35), 1, 0.52), { pos: [0, 3.65, 5.4] }));
      const saddleY = 117.2 - position[1];
      const sagY = 5.4;
      for (const cz of [-6.2, 6.2]) {
        const centerPts = catmullRomSpline3([[-towerX, saddleY, cz], [-towerX * 0.5, sagY + 22, cz], [0, sagY, cz], [towerX * 0.5, sagY + 22, cz], [towerX, saddleY, cz]], 6);
        opaque.push(tintRawMesh(tubeSweepMesh(centerPts.map((p) => [p[0], p[1], p[2], 0.46] as const), 8), "#c0362c"));
        for (const sideSign of [-1, 1]) {
          const approachPts = catmullRomSpline3([[sideSign * towerX, saddleY, cz], [sideSign * (towerX + 16), saddleY * 0.52, cz], [sideSign * (towerX + 28), 3.2, cz]], 5);
          opaque.push(tintRawMesh(tubeSweepMesh(approachPts.map((p) => [p[0], p[1], p[2], 0.44] as const), 8), "#c0362c"));
        }
        for (let sx = -towerX + 11; sx <= towerX - 11; sx += 11) {
          const u = sx / towerX;
          const cy = sagY + (saddleY - sagY) * u * u;
          opaque.push(tintRawMesh(tubeSweepMesh([[sx, 2.4, cz, 0.11], [sx, cy, cz, 0.11]], 6), "#334155"));
        }
      }
      for (let lx = -towerX; lx <= towerX; lx += 22) {
        opaque.push(tintRawMesh(transformMesh(icosphereSmoothMesh(0.42, 1), { pos: [lx, 4.8, 6.6] }), "#fbbf24"));
      }
      return { opaque, glass };
    },
    { position, glassMaterial: TELEOP_MATERIALS.glazingSkyline }
  );
}

/** Landmark 4: Embarcadero Ferry Building Clocktower + Waterfront Nave Arcade & Canary Island Palms. */
export function buildFerryClocktowerNode(look: SkyLook, position: V3): GroupNodeBuilder {
  return assembleBatchedVertexColorNode(
    "sf-ferry-clocktower",
    "landmark-ferry-clocktower",
    () => {
      const opaque: ColoredRawMesh[] = [];
      const emissive: ColoredRawMesh[] = [];
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(92, 14.5, 18, 0.35), { pos: [0, 7.25, 0] }), "#d6c5ad"));
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(94, 1.4, 19.2, 0.25), { pos: [0, 15.1, 0] }), "#e2e6ec"));
      const naveArch = archwayVoussoirSlots({ radius: 2.9, thickness: 0.75, depth: 1.4, voussoirs: 9, stoneMatA: 0, stoneMatB: 1, keystoneMat: 1 });
      for (const ax of [-32, -20, -8, 0, 8, 20, 32]) {
        for (const s of naveArch) {
          opaque.push(tintRawMesh(transformMesh(s.mesh, { pos: [ax, 5.2, 9.1] }), s.materialIndex === 0 ? "#d6c5ad" : "#e2e6ec"));
        }
        emissive.push(tintRawMesh(transformMesh(bevelBoxMesh(4.8, 5.2, 0.5, 0.08), { pos: [ax, 2.6, 8.8] }), "#fffbeb"));
      }
      const shaft: V3[][] = [
        squareTaperingSection(5.2, 5.2, 15),
        squareTaperingSection(4.9, 4.9, 44),
        squareTaperingSection(4.5, 4.5, 62),
        squareTaperingSection(3.8, 3.8, 69)
      ];
      opaque.push(tintRawMesh(loftSectionsMesh(shaft, true, true), "#d6c5ad"));
      const dial = latheMesh([[0, 0], [2.45, 0], [2.45, 0.24], [0, 0.28]], 20);
      emissive.push(tintRawMesh(transformMesh(dial, { pos: [0, 52.5, 4.72], rot: [Math.PI * 0.5, 0, 0] }), "#fffbeb"));
      emissive.push(tintRawMesh(transformMesh(dial, { pos: [0, 52.5, -4.72], rot: [-Math.PI * 0.5, 0, 0] }), "#fffbeb"));
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(0.28, 1.9, 0.18, 0.04), { pos: [0, 53.2, 5.04], rot: [0, 0, 0.42] }), "#151921"));
      const spireCap: V3[][] = [squareTaperingSection(4.1, 4.1, 69), squareTaperingSection(0.25, 0.25, 76.5)];
      opaque.push(tintRawMesh(loftSectionsMesh(spireCap, true, true), "#1e293b"));
      for (const px of [-42, -26, 26, 42]) {
        opaque.push(tintRawMesh(tubeSweepMesh([[px, 0, 13.5, 0.52], [px, 6.5, 13.6, 0.42], [px, 12.2, 13.8, 0.36]], 8), "#564336"));
        opaque.push(tintRawMesh(transformMesh(layeredCanopyMesh({ radius: 2.35, height: 2.2, puffs: 7, seed: 31 + Math.abs(px) }), { pos: [px, 11.4, 13.8] }), "#2e7f47"));
      }
      return { opaque, emissive };
    },
    { position, emissiveMaterial: practicalWindowMat(look, "#fffbeb", 1.35) }
  );
}

/** Landmark 5: Coit-Style Fluted Tower atop Telegraph Hill (`stratifiedCliffMesh` + `coniferBoughTierMesh` + `latheMesh`). */
export function buildCoitTowerLandmarkNode(look: SkyLook, position: V3): GroupNodeBuilder {
  return assembleBatchedVertexColorNode(
    "sf-coit-tower",
    "landmark-coit-tower",
    () => {
      const opaque: ColoredRawMesh[] = [];
      const emissive: ColoredRawMesh[] = [];
      opaque.push(tintRawMesh(stratifiedCliffMesh({ radiusX: 24, radiusZ: 20, height: 22, terraces: 5, seed: 37 }), "#64748b"));
      for (const [cx, cy, cz] of [[-11, 15, 8], [12, 14, 7], [-7, 18, -8], [9, 17, -6]] as const) {
        opaque.push(tintRawMesh(tubeSweepMesh([[cx, cy, cz, 0.38], [cx, cy + 3.4, cz, 0.26]], 8), "#564336"));
        opaque.push(tintRawMesh(transformMesh(coniferBoughTierMesh({ baseRadius: 3.1, height: 8.8, tiers: 5, seed: 19 + Math.abs(cx) }), { pos: [cx, cy + 2.2, cz] }), "#2d7a44"));
      }
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(14, 5.5, 14, 0.3), { pos: [0, 23.5, 0] }), "#e2e6ec"));
      const colProfile: V2[] = [[4.6, 26], [4.35, 42], [4.05, 64], [3.65, 64.6], [3.65, 71.2], [4.1, 71.8], [3.2, 75.2], [2.4, 78.4], [0, 78.8]];
      opaque.push(tintRawMesh(latheMesh(colProfile, 24), "#e2e6ec"));
      emissive.push(tintRawMesh(latheMesh([[3.72, 65.2], [3.72, 70.6]], 20), "#fde68a"));
      return { opaque, emissive };
    },
    { position, emissiveMaterial: practicalWindowMat(look, "#fde68a", 1.25) }
  );
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
    return assembleBatchedVertexColorNode(
      name,
      `skyline-glass-${height.toFixed(1)}`,
      () => {
        const opaque: ColoredRawMesh[] = [];
        const emissive: ColoredRawMesh[] = [];
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
        emissive.push(tintRawMesh(loftSectionsMesh(core, true, true), "#bae6fd"));
        opaque.push(tintRawMesh(latticeTrussMesh({ span: [16.5, height * 0.92, 16.5], bays: 7, chordRadius: 0.32, braceRadius: 0.2 }), "#cbd5e1"));
        opaque.push(tintRawMesh(latheMesh([[5.6, height * 0.95], [2.4, height], [0, height + 4.5]], 14), "#cbd5e1"));
        emissive.push(tintRawMesh(transformMesh(icosphereSmoothMesh(0.55, 1), { pos: [0, height + 5.1, 0] }), "#3fd6c6"));
        return { opaque, emissive, glass };
      },
      {
        position,
        emissiveMaterial: practicalWindowMat(look, "#bae6fd", 0.9),
        glassMaterial: TELEOP_MATERIALS.glazingSkyline
      }
    );
  }

  return assembleBatchedVertexColorNode(
    name,
    `skyline-artdeco-${height.toFixed(1)}`,
    () => ({
      opaque: [
        tintRawMesh(transformMesh(bevelBoxMesh(21, height * 0.52, 21, 0.35), { pos: [0, height * 0.26, 0] }), "#d6c5ad"),
        tintRawMesh(transformMesh(bevelBoxMesh(16.2, height * 0.3, 16.2, 0.3), { pos: [0, height * 0.65, 0] }), "#d6c5ad"),
        tintRawMesh(transformMesh(bevelBoxMesh(11.4, height * 0.18, 11.4, 0.25), { pos: [0, height * 0.88, 0] }), "#e2d4be"),
        tintRawMesh(latheMesh([[4.4, height * 0.96], [2.1, height * 1.03], [0.4, height * 1.09], [0, height * 1.11]], 14), "#c8a04b")
      ],
      emissive: [
        tintRawMesh(transformMesh(bevelBoxMesh(17.2, height * 0.78, 17.2, 0.12), { pos: [0, height * 0.42, 0] }), "#fde68a")
      ]
    }),
    { position, emissiveMaterial: practicalWindowMat(look, "#fde68a", 1.1) }
  );
}

// ---------------------------------------------------------------------------
// Street-Front San Francisco Buildings (`sf-bldg-l/r-0..7`, Facade on `+Z`)
// ---------------------------------------------------------------------------

const VICTORIAN_PASTELS = ["#dfc0ad", "#94c0b8", "#d4bf89", "#a3bcd4", "#d6aab0", "#c0cc9f"] as const;
const MIDRISE_MASONRY = ["#a46352", "#cbd5e1", "#c5ac8f", "#8392a1"] as const;

/** Landmark 10 helper: Teleop kerbside dispatch beacon totem integrated onto storefront aprons & standalone export. */
function pushDispatchTotemSlots(slots: MultiMatSlot[], offset: V3, bodyMat: number, trimMat: number, tealMat: number): void {
  const colProfile: V2[] = [[0.36, 0], [0.29, 0.18], [0.19, 0.28], [0.165, 2.25], [0.28, 2.52], [0.11, 2.84], [0, 2.92]];
  slots.push({ mesh: transformMesh(subdivideSmoothMesh(latheMesh(colProfile, 16), 1, 0.48), { pos: offset }), materialIndex: bodyMat });
  const aeroShroud = subdivideSmoothMesh(
    sculptStreamlinedHullMesh(0.54, 0.44, 0.88, { stations: 12, ringPoints: 12, noseSharpness: 1.15, tailTaper: 1.15, canopyBulge: 0.18, underbodyFlat: 0.3 }),
    1,
    0.5
  );
  slots.push({ mesh: transformMesh(aeroShroud, { pos: [offset[0], offset[1] + 1.88, offset[2]], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: trimMat });
  slots.push({ mesh: transformMesh(latheMesh([[0.225, 1.54], [0.26, 1.88], [0.225, 2.22]], 18), { pos: offset }), materialIndex: tealMat });
  slots.push({ mesh: transformMesh(latheMesh([[0.16, 2.58], [0.21, 2.68], [0.14, 2.78]], 16), { pos: offset }), materialIndex: tealMat });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.56, 0.08, 0.024), { pos: [offset[0], offset[1] + 1.24, offset[2] + 0.17] }), materialIndex: trimMat });
}

export function buildDispatchBeaconTotemNode(options: { readonly id?: string; readonly name?: string; readonly position?: V3 } = {}): GroupNodeBuilder {
  const mats = [TELEOP_MATERIALS.semiStainless, TELEOP_MATERIALS.darkTrim, TELEOP_MATERIALS.tealBeacon];
  const slots: MultiMatSlot[] = [];
  pushDispatchTotemSlots(slots, [0, 0, 0], 0, 1, 2);
  return assembleMultiMaterialNode(options.name ?? "teleop-dispatch-totem", slots, mats, options);
}

/**
 * Batched street-front building generator (`sf-bldg-l/r-0..7`): merges all opaque architectural masonry,
 * pastel bays, Queen Anne gables, voussoir arches & shopfront awnings into 1 vertex-colored draw call
 * (+ 1 lit window draw call + 1 optional glazing draw call) while preserving runtime IDs & silhouettes.
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
  const dimsTag = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;

  if (specKey === "gridBldgVictorian" || specKey === "gridBldgNew2") {
    const colorA = VICTORIAN_PASTELS[seed % VICTORIAN_PASTELS.length]!;
    const colorB = VICTORIAN_PASTELS[(seed + 2) % VICTORIAN_PASTELS.length]!;
    return assembleBatchedVertexColorNode(
      name,
      `bldg-vic:${seed % VICTORIAN_PASTELS.length}:${dimsTag}`,
      () => {
        const opaque: ColoredRawMesh[] = [];
        const emissive: ColoredRawMesh[] = [];
        const bays = w >= 18 ? 3 : 2;
        const unitW = w / bays;
        for (let b = 0; b < bays; b += 1) {
          const cx = -w * 0.5 + unitW * (b + 0.5);
          const unitH = h * (0.86 + ((b + seed) % 3) * 0.06);
          const bayHex = b % 2 === 0 ? colorA : colorB;
          opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(unitW * 0.96, unitH, d * 0.86, 0.14), { pos: [cx, unitH * 0.5, -d * 0.05] }), bayHex));
          const bayZ0 = d * 0.38;
          const bayZ1 = d * 0.47;
          const bw = unitW * 0.34;
          const bayRing = (yy: number): V3[] => [
            [cx - bw, yy, bayZ0], [cx - bw * 0.62, yy, bayZ1], [cx + bw * 0.62, yy, bayZ1], [cx + bw, yy, bayZ0],
            [cx + bw, yy, bayZ0 - 0.3], [cx - bw, yy, bayZ0 - 0.3]
          ];
          opaque.push(tintRawMesh(loftSectionsMesh([bayRing(3.6), bayRing(unitH - 1.8)], true, true), bayHex));
          for (let fl = 1; fl <= 3; fl += 1) {
            const fy = 3.2 + (fl * (unitH - 5.2)) / 3.4;
            emissive.push(tintRawMesh(transformMesh(bevelBoxMesh(bw * 1.18, 1.65, 0.14, 0.03), { pos: [cx, fy, bayZ1 + 0.03] }), "#fde68a"));
            opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(bw * 2.15, 0.28, 0.95, 0.05), { pos: [cx, fy + 1.05, bayZ0 + 0.25] }), "#e8ecf2"));
          }
          const gablePoly: V2[] = [[-unitW * 0.48, 0], [unitW * 0.48, 0], [0, 2.85]];
          opaque.push(tintRawMesh(transformMesh(extrudePolygonMesh(gablePoly, d * 0.84, 0.12, true), { pos: [cx, unitH, -d * 0.05] }), "#e8ecf2"));
          opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(unitW * 0.32, 2.35, 0.18, 0.03), { pos: [cx + unitW * 0.22, 1.85, bayZ0 + 0.04] }), "#6b3418"));
          opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(unitW * 0.38, 0.72, 1.35, 0.06), { pos: [cx + unitW * 0.22, 0.36, bayZ0 + 0.55] }), "#e2e6ec"));
        }
        return { opaque, emissive };
      },
      {
        id: name,
        position,
        castShadow: seed < 4,
        receiveShadow: true,
        opaqueMaterial: TELEOP_MATERIALS.batchedFacadeMasonry,
        emissiveMaterial: winMat
      }
    );
  }

  if (specKey === "gridBldgGlassTower") {
    return assembleBatchedVertexColorNode(
      name,
      `bldg-glass:${dimsTag}`,
      () => {
        const opaque: ColoredRawMesh[] = [];
        const emissive: ColoredRawMesh[] = [
          tintRawMesh(transformMesh(bevelBoxMesh(w * 0.78, h, d * 0.78, 0.18), { pos: [0, h * 0.5, 0] }), "#e0f2fe")
        ];
        const glass: RawMesh[] = [
          transformMesh(bevelBoxMesh(w * 0.94, h * 0.88, d * 0.92, 0.16), { pos: [0, h * 0.54, 0] }),
          // Sculpted flush glazed skybridge atrium canopy projecting cleanly over the lobby colonnade
          transformMesh(
            subdivideSmoothMesh(
              sculptStreamlinedHullMesh(w * 0.72, 2.8, 2.15, { stations: 12, ringPoints: 12, noseSharpness: 0.85, tailTaper: 0.85, canopyBulge: 0.18, underbodyFlat: 0.55 }),
              1,
              0.5
            ),
            { pos: [0, 8.6, d * 0.49], rot: [0, Math.PI * 0.5, 0] }
          )
        ];
        for (const px of [-w * 0.44, 0, w * 0.44]) {
          opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(0.65, h, d * 0.95, 0.08), { pos: [px, h * 0.5, 0] }), "#cbd5e1"));
        }
        opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.98, 0.65, d * 0.98, 0.12), { pos: [0, 4.4, 0] }), "#cbd5e1"));
        const totemSlots: MultiMatSlot[] = [];
        pushDispatchTotemSlots(totemSlots, [w * 0.28, 0, d * 0.5 + 1.15], 0, 1, 2);
        for (const s of totemSlots) {
          if (s.materialIndex === 2) emissive.push(tintRawMesh(s.mesh, "#3fd6c6"));
          else opaque.push(tintRawMesh(s.mesh, s.materialIndex === 0 ? "#cbd5e1" : "#151921"));
        }
        return { opaque, emissive, glass };
      },
      {
        id: name,
        position,
        castShadow: seed < 4,
        receiveShadow: true,
        opaqueMaterial: TELEOP_MATERIALS.batchedFacadeMasonry,
        emissiveMaterial: winMat,
        glassMaterial: TELEOP_MATERIALS.glazingSkyline
      }
    );
  }

  const masonryHex = specKey === "gridBldgArtDeco" ? "#dac9b0" : MIDRISE_MASONRY[seed % MIDRISE_MASONRY.length]!;
  const awningHex = seed % 2 === 0 ? "#194d33" : "#991b1b";
  return assembleBatchedVertexColorNode(
    name,
    `bldg-${specKey}:${seed % 4}:${dimsTag}`,
    () => {
      const opaque: ColoredRawMesh[] = [];
      const emissive: ColoredRawMesh[] = [];
      const lowerH = specKey === "gridBldgArtDeco" ? h * 0.68 : h * 0.94;
      opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.95, lowerH, d * 0.92, 0.22), { pos: [0, lowerH * 0.5, 0] }), masonryHex));
      if (specKey === "gridBldgArtDeco") {
        opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.72, h * 0.32, d * 0.72, 0.2), { pos: [0, lowerH + h * 0.15, 0] }), masonryHex));
        const arch = archwayVoussoirSlots({ radius: 1.9, thickness: 0.52, depth: 0.85, voussoirs: 7, stoneMatA: 1, stoneMatB: 0, keystoneMat: 1 });
        for (const s of arch) {
          opaque.push(tintRawMesh(transformMesh(s.mesh, { pos: [0, 2.2, d * 0.46] }), s.materialIndex === 1 ? "#e8ecf2" : masonryHex));
        }
      } else {
        opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.99, 0.95, d * 0.98, 0.16), { pos: [0, lowerH + 0.35, 0] }), "#e8ecf2"));
        opaque.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.82, 0.55, 1.45, 0.08), { pos: [0, 3.65, d * 0.48], rot: [0.26, 0, 0] }), awningHex));
      }
      const floors = Math.max(3, Math.floor((lowerH - 5) / 3.8));
      for (let fl = 0; fl < floors; fl += 1) {
        const fy = 5.6 + fl * 3.6;
        emissive.push(tintRawMesh(transformMesh(bevelBoxMesh(w * 0.82, 1.65, 0.16, 0.04), { pos: [0, fy, d * 0.46] }), "#fde68a"));
      }
      return { opaque, emissive };
    },
    {
      id: name,
      position,
      castShadow: seed < 4,
      receiveShadow: true,
      opaqueMaterial: TELEOP_MATERIALS.batchedFacadeMasonry,
      emissiveMaterial: winMat
    }
  );
}

// ---------------------------------------------------------------------------
// Instanced Street Furniture, Foliage, Kerb Beacon & Roof LiDAR Geometries
// ---------------------------------------------------------------------------

/** Landmark 7a: Smooth SF gantry pole (`y in [-3.4, +3.4]`, centered for `ry(3.4)`). */
export function signalPoleGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("signal-pole", () => {
    const profile: V2[] = [[0.24, -3.4], [0.22, -2.65], [0.15, -2.45], [0.13, 3.25], [0.18, 3.34], [0, 3.4]];
    return mergeRawMeshes([latheMesh(profile, 14)]);
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
    const hood = transformMesh(latheMesh([[0.15, 0], [0.16, 0.16]], 14), { rot: [Math.PI * 0.5, 0, 0] });
    return mergeRawMeshes([
      bevelBoxMesh(0.36, 0.92, 0.24, 0.04),
      transformMesh(hood, { pos: [0, 0.28, 0.12] }),
      transformMesh(hood, { pos: [0, 0, 0.12] }),
      transformMesh(hood, { pos: [0, -0.28, 0.12] })
    ]);
  });
}

/** Landmark 8a: Historic Path-of-Gold cast-iron streetlamp standard (`y in [-3.1, +3.1]`, smooth normals). */
export function streetLampPoleGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("lamp-pole", () => {
    const profile: V2[] = [[0.26, -3.1], [0.24, -2.55], [0.15, -2.25], [0.1, -1.9], [0.08, 2.75], [0.16, 2.98], [0.09, 3.1]];
    return mergeRawMeshes([latheMesh(profile, 16)]);
  });
}

/** Landmark 8b: Ribbed teardrop acorn streetlamp lantern (`sf-lamp-globes`). */
export function streetLampGlobeGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("lamp-globe", () => {
    const profile: V2[] = [[0, -0.26], [0.14, -0.2], [0.23, -0.04], [0.21, 0.14], [0.09, 0.26], [0, 0.31]];
    return mergeRawMeshes([latheMesh(profile, 16)]);
  });
}

/** Landmark 8c: Cast-iron kerbside pedestrian bollard (`y in [0, 0.94]`, instanced across crossings). */
export function curbBollardGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("curb-bollard", () => {
    const profile: V2[] = [[0.15, 0], [0.14, 0.12], [0.095, 0.18], [0.088, 0.78], [0.105, 0.83], [0.075, 0.91], [0, 0.94]];
    return mergeRawMeshes([latheMesh(profile, 14)]);
  });
}

/** Landmark 9a: Root-flared, multi-limb London plane trunk (`y in [-1.65, +2.05]`, smooth `tubeSweepMesh` + grate collar). */
export function streetTreeTrunkGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("tree-trunk", () =>
    mergeRawMeshes([
      latheMesh([[0.48, -1.65], [0.5, -1.61], [0.26, -1.59], [0.24, -1.65]], 14),
      tubeSweepMesh([[0, -1.65, 0, 0.23], [0.02, -0.42, 0.01, 0.155], [-0.02, 1.05, 0, 0.125], [0, 1.85, 0, 0.082]], 10),
      tubeSweepMesh([[-0.01, 0.82, 0, 0.095], [-0.52, 1.92, 0.32, 0.058]], 8),
      tubeSweepMesh([[0.01, 0.88, 0, 0.095], [0.48, 1.96, -0.3, 0.058]], 8),
      tubeSweepMesh([[0, 1.08, 0.02, 0.082], [0.14, 2.02, 0.44, 0.052]], 8)
    ])
  );
}

/**
 * Landmark 9b: Smooth multi-bough London-plane foliage crown (`layeredCanopyMesh` from `proceduralKernel`,
 * zero faceted triangles, upward-biased botanical normals, single merged GPU-instanced draw call).
 */
export function streetTreeCrownGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("tree-crown", () =>
    mergeRawMeshes([
      transformMesh(layeredCanopyMesh({ radius: 1.56, height: 2.38, puffs: 9, seed: 23 }), { pos: [0, -1.02, 0] }),
      transformMesh(layeredCanopyMesh({ radius: 1.02, height: 1.52, puffs: 5, seed: 41 }), { pos: [-0.62, -1.28, 0.36] }),
      transformMesh(layeredCanopyMesh({ radius: 1.0, height: 1.48, puffs: 5, seed: 59 }), { pos: [0.58, -1.22, -0.38] })
    ])
  );
}

/** Landmark 10a/b: Smooth subdivided kerb docking ring (XY plane to match `main.ts` `rx = pi/2`) & concentric pad disc. */
export function beaconRingGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("beacon-ring", () => {
    const outerPts: V4[] = Array.from({ length: 29 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      return [Math.cos(a) * 1.06, Math.sin(a) * 1.06, 0, 0.072] as const;
    });
    const innerPts: V4[] = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.014, 0.03] as const;
    });
    return mergeRawMeshes([subdivideSmoothMesh(tubeSweepMesh(outerPts, 8), 1, 0.45), tubeSweepMesh(innerPts, 6)]);
  });
}

export function beaconDiscGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("beacon-disc", () =>
    mergeRawMeshes([
      subdivideSmoothMesh(
        latheMesh([[0, -0.02], [0.92, -0.02], [0.95, 0.012], [0.76, 0.028], [0.34, 0.02], [0, 0.03]], 28),
        1,
        0.44
      )
    ])
  );
}

/** Crisp rooftop optical LiDAR turret puck & 10 Hz spinning teal laser rotor (`pod-sensor-housing`, `pod-sensor-laser`). */
export function podSensorHousingGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("pod-sensor-housing", () =>
    mergeRawMeshes([
      latheMesh(
        [
          [0, -0.042],
          [0.148, -0.042],
          [0.154, -0.022],
          [0.138, -0.015],
          [0.138, 0.032],
          [0.15, 0.04],
          [0.128, 0.064],
          [0, 0.072]
        ],
        24
      )
    ])
  );
}

export function podSensorLaserGeometrySpec(): AuraCustomGeometrySpec {
  return memoGeometrySpec("pod-sensor-laser", () => {
    const ringPts: V4[] = Array.from({ length: 21 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2;
      return [Math.cos(a) * 0.143, 0.008, Math.sin(a) * 0.143, 0.009] as const;
    });
    return mergeRawMeshes([
      tubeSweepMesh(ringPts, 6),
      bevelBoxMesh(0.295, 0.022, 0.048, 0.007),
      bevelBoxMesh(0.048, 0.018, 0.26, 0.006)
    ]);
  });
}

// ---------------------------------------------------------------------------
// Sculpted Multi-Material Articulated Urban Commuter Rig (`taxi-passenger`)
// ---------------------------------------------------------------------------

export const PASSENGER_RIG_IDS = {
  root: "taxi-passenger",
  pelvis: "taxi-passenger-pelvis",
  torso: "taxi-passenger-torso",
  head: "taxi-passenger-head",
  bag: "taxi-passenger-bag",
  armL: "taxi-passenger-arm-l",
  armR: "taxi-passenger-arm-r",
  forearmR: "taxi-passenger-forearm-r",
  legL: "taxi-passenger-leg-l",
  shinL: "taxi-passenger-shin-l",
  legR: "taxi-passenger-leg-r",
  shinR: "taxi-passenger-shin-r"
} as const;

export const COMMUTER_MATERIALS = [
  // 0: Tailored slate-navy wool commuter trench coat
  material.fabric({
    name: "commuter-coat",
    color: "#25394f",
    roughness: 0.68,
    sheen: 0.56,
    sheenColor: "#94a3b8",
    sheenRoughness: 0.46
  }),
  // 1: Warm terracotta knit turtleneck inner sweater
  material.fabric({
    name: "commuter-sweater",
    color: "#c96a38",
    roughness: 0.74,
    sheen: 0.44,
    sheenColor: "#fed7aa",
    sheenRoughness: 0.52
  }),
  // 2: Tailored charcoal tapered trousers
  material.fabric({
    name: "commuter-trousers",
    color: "#1e242d",
    roughness: 0.76,
    sheen: 0.28,
    sheenColor: "#64748b",
    sheenRoughness: 0.58
  }),
  // 3: Cognac saddle-leather messenger bag, strap & waist belt
  material.pbr({
    name: "commuter-leather",
    color: "#734124",
    roughness: 0.44,
    metalness: 0.06,
    clearcoat: 0.22,
    clearcoatRoughness: 0.32
  }),
  // 4: Espresso urban Chelsea boot upper & obsidian phone bezel
  material.pbr({
    name: "commuter-boot-upper",
    color: "#171a21",
    roughness: 0.46,
    metalness: 0.08
  }),
  // 5: Ivory vulcanized sneaker-boot outsole (planted flat at y = 0)
  material.pbr({
    name: "commuter-boot-sole",
    color: "#e2e8f0",
    roughness: 0.82,
    metalness: 0.02
  }),
  // 6: Stylized warm natural skin
  material.pbr({
    name: "commuter-skin",
    color: "#d99d7b",
    roughness: 0.58,
    metalness: 0.02
  }),
  // 7: Sculpted espresso-chestnut wavy hair & expressive eyes/brows
  material.pbr({
    name: "commuter-hair",
    color: "#241712",
    roughness: 0.5,
    metalness: 0.05
  }),
  // 8: Brushed brass coat buttons & messenger bag buckles
  material.metal({
    name: "commuter-brass",
    color: "#c8a04b",
    roughness: 0.24,
    metallic: 0.88,
    clearcoat: 0,
    sheen: 0
  }),
  // 9: Dispatch-teal ride-hail smartphone screen
  material.emissive({
    name: "commuter-phone-screen",
    color: "#3fd6c6",
    emissive: "#3fd6c6",
    emissiveIntensity: 1.95,
    practical: true
  })
] as const;

export interface UrbanCommuterPoseInput {
  readonly time: number;
  readonly mode: "hail" | "board" | "alight";
  readonly walkProgress: number;
  readonly motionOk: boolean;
}

export interface UrbanCommuterPose {
  readonly pelvisPos: V3;
  readonly pelvisRot: V3;
  readonly torsoRot: V3;
  readonly headRot: V3;
  readonly bagRot: V3;
  readonly armLRot: V3;
  readonly armRRot: V3;
  readonly forearmRRot: V3;
  readonly legLRot: V3;
  readonly shinLRot: V3;
  readonly legRRot: V3;
  readonly shinRRot: V3;
  readonly yawOffset: number;
  readonly rootScale: number;
}

/**
 * Deterministic bounded joint pose for the kerbside Urban Commuter Rig (`1.72 m` tall, `minY = 0`).
 * Never accumulates angles across frames; reduced-motion holds a poised static hail stance (PRD §6.3).
 */
export function computeUrbanCommuterPose(input: UrbanCommuterPoseInput): UrbanCommuterPose {
  const { time, mode, walkProgress, motionOk } = input;
  if (mode === "hail") {
    const wave = motionOk ? Math.sin(time * 4.6) : 0;
    const breath = motionOk ? Math.sin(time * 1.9) : 0;
    const shift = motionOk ? Math.sin(time * 1.15) : 0;
    return {
      pelvisPos: [shift * 0.014, 0.9 + breath * 0.004, 0],
      pelvisRot: [0, shift * 0.04, shift * -0.025],
      torsoRot: [-0.03 + breath * 0.018, 0.06 + shift * 0.03, shift * 0.02],
      headRot: [-0.05 + breath * 0.015, 0.16 + wave * 0.045, wave * 0.03],
      bagRot: [0.02, 0, -0.03 + shift * -0.035],
      armLRot: [-0.58 + breath * 0.025, 0.24, 0.14],
      // Friendly raised cab-hail wave toward the approaching AV pod
      armRRot: [-2.18, 0.14, -0.34 + wave * 0.2],
      forearmRRot: [-0.36, 0, wave * 0.34],
      legLRot: [shift * 0.03, 0, -0.02],
      shinLRot: [Math.max(0, -shift * 0.04), 0, 0],
      legRRot: [-shift * 0.03, 0, 0.02],
      shinRRot: [Math.max(0, shift * 0.04), 0, 0],
      yawOffset: 0,
      rootScale: 1
    };
  }

  // Boarding / alighting stride across the kerb (hip swing + swing-phase-only positive knee flex)
  const w = Math.max(0, Math.min(1, walkProgress));
  const phase = motionOk ? w * Math.PI * 4.2 + time * 1.2 : 0;
  const s = motionOk ? Math.sin(phase) : 0;
  const c = motionOk ? Math.cos(phase) : 1;
  const kneeL = motionOk ? Math.max(0, -c) * 0.58 : 0;
  const kneeR = motionOk ? Math.max(0, c) * 0.58 : 0;
  const bob = motionOk ? Math.abs(s) * 0.024 : 0;
  const doorDuck = mode === "board" && w > 0.82 ? 1 - ((w - 0.82) / 0.18) * 0.24 : 1;
  return {
    pelvisPos: [0, 0.9 + bob, 0],
    pelvisRot: [0.04, s * 0.06, s * 0.03],
    torsoRot: [0.07, -s * 0.08, -s * 0.025],
    headRot: [mode === "board" && w > 0.7 ? 0.14 : -0.02, s * 0.04, 0],
    bagRot: [-s * 0.06, 0, -0.05 - Math.abs(s) * 0.05],
    armLRot: [-0.42 + s * 0.24, 0.18, 0.12],
    armRRot: [-s * 0.44, 0, -0.08],
    forearmRRot: [-0.28 - Math.max(0, s) * 0.22, 0, 0],
    legLRot: [-s * 0.46, 0, 0],
    shinLRot: [kneeL, 0, 0],
    legRRot: [s * 0.46, 0, 0],
    shinRRot: [kneeR, 0, 0],
    yawOffset: mode === "board" ? -0.68 : 2.38,
    rootScale: doorDuck
  };
}

function commuterGroupedMesh(name: string, cacheKey: string, buildSlots: () => readonly MultiMatSlot[]) {
  const geo = memoizeGeometry<{
    readonly opaqueSpec: AuraCustomGeometrySpec;
    readonly phoneSpec: AuraCustomGeometrySpec | null;
  }>(`teleop-commuter:${cacheKey}`, () => {
    const slots = buildSlots();
    const opaqueMeshes: RawMesh[] = [];
    const phoneMeshes: RawMesh[] = [];
    for (const s of slots) {
      if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
      const mat = COMMUTER_MATERIALS[s.materialIndex];
      if (isEmissiveMaterialSpec(mat)) {
        phoneMeshes.push(s.mesh);
      } else {
        opaqueMeshes.push(bakeMeshCavityAO(paintMeshColors(s.mesh, materialHexColor(mat, "#25394f"), true), 0.15));
      }
    }
    return {
      opaqueSpec: mergeRawMeshes(opaqueMeshes),
      phoneSpec: phoneMeshes.length > 0 ? mergeRawMeshes(phoneMeshes) : null
    };
  });

  if (!geo.phoneSpec) {
    return geometry.custom(geo.opaqueSpec, {
      name,
      material: TELEOP_MATERIALS.batchedCommuterCloth,
      castShadow: false,
      receiveShadow: true
    });
  }
  return group(`${name}-wrap`, [
    geometry.custom(geo.opaqueSpec, {
      name,
      material: TELEOP_MATERIALS.batchedCommuterCloth,
      castShadow: false,
      receiveShadow: true
    }),
    geometry.custom(geo.phoneSpec, {
      name: `${name}-screen`,
      material: COMMUTER_MATERIALS[9],
      castShadow: false,
      receiveShadow: false
    })
  ]);
}

/**
 * Builds the 100% `@aura3d/engine` sculpted, multi-material, articulated **Urban Commuter Rig**
 * (`1.72 m` tall, boot soles planted cleanly at `local y = 0.00 m`, facing `+Z` in local rig space).
 */
export function buildUrbanCommuterNode(options: {
  readonly id?: string;
  readonly position?: V3;
  readonly rotation?: V3;
  readonly scale?: V3;
} = {}): GroupNodeBuilder {
  const rootId = options.id ?? PASSENGER_RIG_IDS.root;

  // Pelvis & flared trench-coat lower skirt (`y = -0.18 .. +0.08` around hip pivot `y = 0.90`)
  const pelvisGeo = commuterGroupedMesh("commuter-pelvis-mesh", "pelvis", () => [
    {
      materialIndex: 0,
      mesh: transformMesh(
        latheMesh(
          [
            [0.145, -0.18],
            [0.195, -0.175],
            [0.182, -0.06],
            [0.16, 0.05],
            [0.14, 0.085],
            [0, 0.085]
          ],
          18
        ),
        { scale: [1.06, 1, 0.74] }
      )
    },
    {
      materialIndex: 2,
      mesh: transformMesh(icosphereSmoothMesh(0.135, 2), { pos: [0, -0.03, 0], scale: [1.08, 0.78, 0.78] })
    },
    {
      materialIndex: 3,
      mesh: transformMesh(
        latheMesh(
          [
            [0.158, 0.025],
            [0.166, 0.04],
            [0.166, 0.068],
            [0.156, 0.074]
          ],
          18
        ),
        { scale: [1.05, 1, 0.75] }
      )
    },
    {
      materialIndex: 8,
      mesh: transformMesh(bevelBoxMesh(0.044, 0.034, 0.018, 0.005), { pos: [0, 0.052, 0.126] })
    }
  ]);

  // Tailored trench-coat torso, notched lapels, warm turtleneck sweater, brass buttons & cross-body strap
  const torsoGeo = commuterGroupedMesh("commuter-torso-mesh", "torso", () => [
    // Coat body (`y = 0 .. 0.43`)
    {
      materialIndex: 0,
      mesh: transformMesh(
        latheMesh(
          [
            [0, 0],
            [0.152, 0.01],
            [0.162, 0.14],
            [0.188, 0.3],
            [0.205, 0.39],
            [0.145, 0.43],
            [0, 0.432]
          ],
          20
        ),
        { scale: [1.08, 1, 0.68] }
      )
    },
    // Sculpted coat collar & left/right lapels
    {
      materialIndex: 0,
      mesh: mergeRawMeshes([
        transformMesh(
          latheMesh(
            [
              [0.082, 0.39],
              [0.106, 0.42],
              [0.112, 0.465],
              [0.088, 0.468]
            ],
            16
          ),
          { scale: [1.05, 1, 0.92], pos: [0, 0, -0.01] }
        ),
        transformMesh(bevelBoxMesh(0.058, 0.22, 0.026, 0.008), {
          pos: [-0.058, 0.3, 0.118],
          rot: [-0.08, -0.18, 0.24]
        }),
        transformMesh(bevelBoxMesh(0.058, 0.22, 0.026, 0.008), {
          pos: [0.058, 0.3, 0.118],
          rot: [-0.08, 0.18, -0.24]
        })
      ])
    },
    // Terracotta knit sweater front & rolled turtleneck
    {
      materialIndex: 1,
      mesh: mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.11, 0.25, 0.04, 0.014), { pos: [0, 0.29, 0.106] }),
        latheMesh(
          [
            [0.062, 0.41],
            [0.072, 0.435],
            [0.07, 0.476],
            [0.054, 0.482],
            [0, 0.482]
          ],
          16
        )
      ])
    },
    // Diagonal cognac leather messenger strap across front & back
    {
      materialIndex: 3,
      mesh: mergeRawMeshes([
        tubeSweepMesh(
          [
            [0.145, 0.425, 0.02, 0.018],
            [0.05, 0.28, 0.132, 0.018],
            [-0.08, 0.12, 0.122, 0.018],
            [-0.175, -0.02, 0.02, 0.018]
          ],
          8
        ),
        tubeSweepMesh(
          [
            [0.145, 0.425, -0.02, 0.018],
            [0.03, 0.26, -0.128, 0.018],
            [-0.09, 0.11, -0.12, 0.018],
            [-0.175, -0.02, -0.02, 0.018]
          ],
          8
        )
      ])
    },
    // Double-breasted brass coat buttons
    {
      materialIndex: 8,
      mesh: mergeRawMeshes([
        transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [-0.042, 0.19, 0.122], scale: [1, 1, 0.55] }),
        transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [0.042, 0.19, 0.122], scale: [1, 1, 0.55] }),
        transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [-0.042, 0.1, 0.118], scale: [1, 1, 0.55] }),
        transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [0.042, 0.1, 0.118], scale: [1, 1, 0.55] })
      ])
    }
  ]);

  // Cognac leather messenger bag at left hip
  const bagGeo = commuterGroupedMesh("commuter-bag-mesh", "bag", () => [
    {
      materialIndex: 3,
      mesh: mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.095, 0.22, 0.27, 0.024), { pos: [0, -0.11, 0] }),
        transformMesh(bevelBoxMesh(0.104, 0.12, 0.278, 0.022), { pos: [0.004, -0.065, 0] })
      ])
    },
    {
      materialIndex: 8,
      mesh: mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.018, 0.032, 0.024, 0.004), { pos: [-0.052, -0.13, -0.065] }),
        transformMesh(bevelBoxMesh(0.018, 0.032, 0.024, 0.004), { pos: [-0.052, -0.13, 0.065] })
      ])
    }
  ]);

  // Stylized sculpted head, neck, ears, expressive eyes/brows & modern swept hair (`crown at +0.30` -> `1.72 m` total height)
  const headGeo = commuterGroupedMesh("commuter-head-mesh", "head", () => [
    {
      materialIndex: 6,
      mesh: mergeRawMeshes([
        latheMesh(
          [
            [0.052, 0],
            [0.048, 0.065],
            [0, 0.075]
          ],
          14
        ),
        transformMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.106, 2), 1, 0.5), { pos: [0, 0.165, 0.008], scale: [0.92, 1.08, 0.98] }),
        // Sculpted nose & ears
        transformMesh(icosphereSmoothMesh(0.018, 1), { pos: [0, 0.158, 0.108], scale: [0.68, 1.05, 0.95] }),
        transformMesh(icosphereSmoothMesh(0.022, 1), { pos: [-0.096, 0.162, 0.002], scale: [0.45, 0.95, 0.7] }),
        transformMesh(icosphereSmoothMesh(0.022, 1), { pos: [0.096, 0.162, 0.002], scale: [0.45, 0.95, 0.7] })
      ])
    },
    {
      materialIndex: 7,
      mesh: mergeRawMeshes([
        // Sculpted modern wavy hair cap, back taper & swept side fringe
        transformMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.114, 2), 1, 0.48), { pos: [0, 0.194, -0.01], scale: [0.97, 0.96, 1.03] }),
        transformMesh(icosphereSmoothMesh(0.078, 2), { pos: [0.028, 0.252, 0.036], scale: [1.18, 0.56, 0.95], rot: [0.18, 0.12, -0.22] }),
        tubeSweepMesh(
          [
            [-0.075, 0.242, 0.055, 0.028],
            [-0.01, 0.262, 0.088, 0.032],
            [0.065, 0.238, 0.082, 0.024],
            [0.095, 0.198, 0.048, 0.015]
          ],
          8
        ),
        // Expressive eyes & eyebrows
        transformMesh(icosphereSmoothMesh(0.012, 1), { pos: [-0.036, 0.174, 0.098], scale: [0.9, 1.05, 0.55] }),
        transformMesh(icosphereSmoothMesh(0.012, 1), { pos: [0.036, 0.174, 0.098], scale: [0.9, 1.05, 0.55] }),
        transformMesh(bevelBoxMesh(0.028, 0.007, 0.01, 0.002), { pos: [-0.037, 0.196, 0.098], rot: [0, 0, 0.08] }),
        transformMesh(bevelBoxMesh(0.028, 0.007, 0.01, 0.002), { pos: [0.037, 0.196, 0.098], rot: [0, 0, -0.08] })
      ])
    }
  ]);

  // Left arm holding glowing #3fd6c6 dispatch smartphone
  const armLGeo = commuterGroupedMesh("commuter-arm-l-mesh", "arm-l", () => [
    {
      materialIndex: 0,
      mesh: sculptHumanoidLimbMesh(
        [
          [0, 0, 0, 0.054],
          [-0.03, -0.14, 0.01, 0.048],
          [-0.035, -0.25, 0.03, 0.045],
          [0.01, -0.31, 0.15, 0.043],
          [0.045, -0.32, 0.24, 0.041]
        ],
        12,
        0.13
      )
    },
    {
      materialIndex: 6,
      mesh: transformMesh(icosphereSmoothMesh(0.034, 2), { pos: [0.055, -0.32, 0.275], scale: [0.85, 0.78, 1.12] })
    },
    {
      materialIndex: 4,
      mesh: transformMesh(bevelBoxMesh(0.068, 0.125, 0.012, 0.004), {
        pos: [0.068, -0.295, 0.305],
        rot: [-0.52, -0.22, 0.08]
      })
    },
    {
      materialIndex: 9,
      mesh: transformMesh(bevelBoxMesh(0.058, 0.108, 0.006, 0.002), {
        pos: [0.07, -0.292, 0.309],
        rot: [-0.52, -0.22, 0.08]
      })
    }
  ]);

  // Right upper arm + elbow-articulated forearm & open hailing hand
  const armRUpperGeo = commuterGroupedMesh("commuter-arm-r-mesh", "arm-r-upper", () => [
    {
      materialIndex: 0,
      mesh: sculptHumanoidLimbMesh(
        [
          [0, 0, 0, 0.054],
          [0.025, -0.12, 0.008, 0.048],
          [0.038, -0.24, 0.016, 0.044]
        ],
        12,
        0.14
      )
    }
  ]);

  const forearmRGeo = commuterGroupedMesh("commuter-forearm-r-mesh", "forearm-r", () => [
    {
      materialIndex: 0,
      mesh: sculptHumanoidLimbMesh(
        [
          [0, 0, 0, 0.044],
          [0.008, -0.12, 0.01, 0.041],
          [0.012, -0.22, 0.016, 0.039]
        ],
        12,
        0.12
      )
    },
    {
      materialIndex: 1,
      mesh: transformMesh(latheMesh([[0.038, -0.215], [0.041, -0.235], [0.035, -0.242]], 12), { pos: [0.012, 0, 0.016] })
    },
    {
      materialIndex: 6,
      mesh: mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.026, 0.082, 0.054, 0.01), { pos: [0.014, -0.278, 0.02] }),
        transformMesh(icosphereSmoothMesh(0.016, 1), { pos: [0.014, -0.268, 0.054], scale: [0.65, 1.2, 0.85], rot: [-0.45, 0, 0] })
      ])
    }
  ]);

  // Left & right thighs (`y = 0 .. -0.43`) + shins & grounded Chelsea sneaker-boots (`y = 0 .. -0.47` -> exact `y = 0.00` ground)
  const buildThigh = (side: -1 | 1, key: string) =>
    commuterGroupedMesh(`commuter-thigh-${key}`, `thigh-${key}`, () => [
      {
        materialIndex: 2,
        mesh: sculptHumanoidLimbMesh(
          [
            [0, 0.02, 0, 0.078],
            [side * 0.004, -0.2, 0.006, 0.068],
            [side * 0.006, -0.43, 0.004, 0.056]
          ],
          12,
          0.15
        )
      }
    ]);

  const buildShinAndBoot = (key: string) =>
    commuterGroupedMesh(`commuter-shin-${key}`, `shin-${key}`, () => [
      // Tapered trouser shin + rolled cuff (`y = 0 .. -0.365`)
      {
        materialIndex: 2,
        mesh: mergeRawMeshes([
          sculptHumanoidLimbMesh(
            [
              [0, 0.01, 0, 0.055],
              [0, -0.19, -0.006, 0.049],
              [0, -0.355, 0, 0.044]
            ],
            12,
            0.13
          ),
          latheMesh(
            [
              [0.045, -0.335],
              [0.051, -0.345],
              [0.051, -0.368],
              [0.043, -0.372]
            ],
            14
          )
        ])
      },
      // Contoured Chelsea boot upper (`y = -0.36 .. -0.446`)
      {
        materialIndex: 4,
        mesh: mergeRawMeshes([
          latheMesh(
            [
              [0.043, -0.362],
              [0.047, -0.405],
              [0.052, -0.446],
              [0, -0.446]
            ],
            14
          ),
          transformMesh(icosphereSmoothMesh(0.052, 2), {
            pos: [0, -0.424, 0.046],
            scale: [0.88, 0.56, 1.58]
          })
        ])
      },
      // Flat vulcanized rubber sole whose bottom sits at exact `y = -0.47` (`0.90 - 0.43 - 0.47 = 0.000 m` sidewalk contact)
      {
        materialIndex: 5,
        mesh: mergeRawMeshes([
          transformMesh(bevelBoxMesh(0.094, 0.026, 0.215, 0.009), { pos: [0, -0.457, 0.036] })
        ])
      }
    ]);

  const initial = computeUrbanCommuterPose({ time: 0, mode: "hail", walkProgress: 0, motionOk: true });

  const forearmR = group(PASSENGER_RIG_IDS.forearmR, [forearmRGeo], {
    position: [0.038, -0.24, 0.016],
    rotation: initial.forearmRRot
  }).runtime({ id: PASSENGER_RIG_IDS.forearmR });

  const armR = group(PASSENGER_RIG_IDS.armR, [armRUpperGeo, forearmR], {
    position: [0.205, 0.385, 0],
    rotation: initial.armRRot
  }).runtime({ id: PASSENGER_RIG_IDS.armR });

  const armL = group(PASSENGER_RIG_IDS.armL, [armLGeo], {
    position: [-0.205, 0.385, 0],
    rotation: initial.armLRot
  }).runtime({ id: PASSENGER_RIG_IDS.armL });

  const head = group(PASSENGER_RIG_IDS.head, [headGeo], {
    position: [0, 0.455, 0],
    rotation: initial.headRot
  }).runtime({ id: PASSENGER_RIG_IDS.head });

  const bag = group(PASSENGER_RIG_IDS.bag, [bagGeo], {
    position: [-0.185, -0.02, -0.01],
    rotation: initial.bagRot
  }).runtime({ id: PASSENGER_RIG_IDS.bag });

  const torso = group(PASSENGER_RIG_IDS.torso, [torsoGeo, bag, head, armL, armR], {
    position: [0, 0.06, 0],
    rotation: initial.torsoRot
  }).runtime({ id: PASSENGER_RIG_IDS.torso });

  const shinL = group(PASSENGER_RIG_IDS.shinL, [buildShinAndBoot("l")], {
    position: [-0.006, -0.43, 0.004],
    rotation: initial.shinLRot
  }).runtime({ id: PASSENGER_RIG_IDS.shinL });

  const legL = group(PASSENGER_RIG_IDS.legL, [buildThigh(-1, "l"), shinL], {
    position: [-0.095, 0, 0],
    rotation: initial.legLRot
  }).runtime({ id: PASSENGER_RIG_IDS.legL });

  const shinR = group(PASSENGER_RIG_IDS.shinR, [buildShinAndBoot("r")], {
    position: [0.006, -0.43, 0.004],
    rotation: initial.shinRRot
  }).runtime({ id: PASSENGER_RIG_IDS.shinR });

  const legR = group(PASSENGER_RIG_IDS.legR, [buildThigh(1, "r"), shinR], {
    position: [0.095, 0, 0],
    rotation: initial.legRRot
  }).runtime({ id: PASSENGER_RIG_IDS.legR });

  const pelvis = group(PASSENGER_RIG_IDS.pelvis, [pelvisGeo, torso, legL, legR], {
    position: initial.pelvisPos,
    rotation: initial.pelvisRot
  }).runtime({ id: PASSENGER_RIG_IDS.pelvis });

  return group(rootId, [pelvis], {
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.scale ? { scale: options.scale } : {})
  }).runtime({ id: rootId });
}
