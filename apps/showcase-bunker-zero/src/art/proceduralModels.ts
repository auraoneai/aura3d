/**
 * Bunker Zero — 100% Native `@aura3d/engine` Multi-Material Procedural 3D Craft (`WP-11`).
 *
 * Replaces all static Meshy clay GLBs and Lego primitive placeholders with sculpted,
 * bevelled, multi-material `@aura3d/engine` assemblies built on `proceduralKernel.ts`
 * (`loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`, `bevelBoxMesh`,
 * `latticeTrussMesh`, `mergeRawMeshes`, `buildGroupedGeometrySpec`, `assembleMultiMaterialNode`).
 * Zero `three` imports; zero GLSL-only shaders; `clearcoat: 0` on high-count instanced pools.
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
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  deformMesh,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh as sculptDrapedGarmentKernel,
  sculptHumanoidLimbMesh,
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
  type V3
} from "../../../showcase-port-shared/proceduralKernel";

function bzSmoothMesh(src: RawMesh, passes = 4): RawMesh {
  if (src.analyticNormals) return src;
  return passes > 0 ? taubinSmoothMesh(src, passes, 0.48, -0.505) : src;
}

const BZ_UNIT_SPHERE_CACHE = new Map<number, RawMesh>();
function bzSmoothSphereMesh(radius: number, detail: 1 | 2 | 3 = 3): RawMesh {
  let unit = BZ_UNIT_SPHERE_CACHE.get(detail);
  if (!unit) {
    const base = icosphereSmoothMesh(1, Math.min(2, detail) as 1 | 2, 0);
    const refined = detail === 3 ? subdivideSmoothMesh(base, 1, 0.52) : base;
    const positions = new Array<number>(refined.positions.length);
    const normals = new Array<number>(refined.normals.length);
    for (let i = 0; i < refined.positions.length; i += 3) {
      const x = refined.positions[i]!;
      const y = refined.positions[i + 1]!;
      const z = refined.positions[i + 2]!;
      const len = Math.hypot(x, y, z) || 1;
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      positions[i] = nx;
      positions[i + 1] = ny;
      positions[i + 2] = nz;
      normals[i] = nx;
      normals[i + 1] = ny;
      normals[i + 2] = nz;
    }
    unit = {
      positions,
      normals,
      uvs: refined.uvs,
      indices: refined.indices,
      ...(refined.colors ? { colors: refined.colors } : {}),
      analyticNormals: true
    };
    BZ_UNIT_SPHERE_CACHE.set(detail, unit);
  }
  return radius === 1 ? unit : transformMesh(unit, { scale: [radius, radius, radius] });
}

interface BzGarmentStation {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly x?: number;
  readonly z?: number;
  readonly xBias?: number;
  readonly zBias?: number;
  readonly folds?: number;
  readonly foldAmp?: number;
  readonly superellipseN?: number;
}

interface BzGarmentOpts {
  readonly ringPoints?: number;
  readonly segments?: number;
  readonly foldCount?: number;
  readonly wallThickness?: number;
  readonly openFrontArc?: number;
  readonly frontCenterAngle?: number;
  readonly capEnds?: boolean;
  readonly smoothPasses?: number;
  readonly seed?: number;
}

function sculptDrapedGarmentMesh(stations: readonly BzGarmentStation[], opts: BzGarmentOpts = {}): RawMesh {
  const segs = Math.max(14, Math.floor(opts.segments ?? opts.ringPoints ?? 24));
  const folds = Math.max(0, Math.floor(opts.foldCount ?? 6));
  const phase = (opts.seed ?? 0) * 0.37;
  if (opts.openFrontArc !== undefined && opts.openFrontArc > 0.02) {
    const gap = Math.min(Math.PI * 1.5, opts.openFrontArc);
    const center = opts.frontCenterAngle ?? Math.PI * 0.5;
    const startA = center + gap * 0.5;
    const sweepA = Math.PI * 2 - gap;
    const thick = Math.max(0.004, opts.wallThickness ?? 0.016);
    const arcPts = Math.max(10, Math.floor(segs * 0.65));
    const rings: V3[][] = stations.map((st, rIdx) => {
      const cx = st.xBias ?? st.x ?? 0;
      const cz = st.zBias ?? st.z ?? 0;
      const fAmp = st.foldAmp ?? 0;
      const ring: V3[] = [];
      for (let i = 0; i <= arcPts; i += 1) {
        const a = startA + (i / arcPts) * sweepA;
        const pleat = folds > 0 ? 1 + fAmp * Math.sin(a * folds + rIdx * 0.7 + phase) : 1;
        ring.push([cx + Math.cos(a) * st.rx * pleat, st.y, cz + Math.sin(a) * st.rz * pleat]);
      }
      for (let i = arcPts; i >= 0; i -= 1) {
        const a = startA + (i / arcPts) * sweepA;
        const pleat = folds > 0 ? 1 + fAmp * 0.85 * Math.sin(a * folds + rIdx * 0.7 + phase) : 1;
        ring.push([
          cx + Math.cos(a) * Math.max(0.01, st.rx - thick) * pleat,
          st.y,
          cz + Math.sin(a) * Math.max(0.01, st.rz - thick) * pleat
        ]);
      }
      return ring;
    });
    return bzSmoothMesh(loftSectionsMesh(rings, false, true), opts.smoothPasses ?? 4);
  }
  return sculptDrapedGarmentKernel(
    stations.map((st) => ({
      y: st.y,
      rx: st.rx,
      rz: st.rz,
      x: st.xBias ?? st.x ?? 0,
      z: st.zBias ?? st.z ?? 0,
      folds: st.folds ?? folds,
      foldAmp: st.foldAmp ?? 0,
      superellipseN: st.superellipseN
    })),
    {
      ringPoints: segs,
      capEnds: opts.capEnds ?? true,
      smoothPasses: opts.smoothPasses ?? 3
    }
  );
}

type AnatomicalStation = Parameters<typeof sculptAnatomicalLimbMesh>[0][number];
type AuraGroupNode = ReturnType<typeof geometry.multiMaterial> extends AuraNodeBuilder<infer T> ? T : AuraPrimitiveNode;
export type BunkerEnemyKind = "guard" | "dog" | "gunner" | "boss";

// ---------------------------------------------------------------------------
// Physical Material Palette (paired WebGL2 + WebGPU native presets; practicals)
// ---------------------------------------------------------------------------

export const BZ_PROC_MATERIALS = {
  gunmetalBrushed: material.brushedMetal({ color: "#323842", roughness: 0.28, metallic: 0.9 }),
  darkSteelBrushed: material.brushedMetal({ color: "#21262e", roughness: 0.34, metallic: 0.88 }),
  chromeStudio: material.studioMetal({ color: "#c9d2de", roughness: 0.18, metallic: 0.96 }),
  brassStudio: material.studioMetal({ color: "#d8aa48", roughness: 0.22, metallic: 0.94 }),
  copperStudio: material.studioMetal({ color: "#c97442", roughness: 0.25, metallic: 0.92 }),
  goldBullion: material.studioMetal({ color: "#f4c244", roughness: 0.16, metallic: 0.98 }),
  silverBullion: material.studioMetal({ color: "#dce6f2", roughness: 0.18, metallic: 0.96 }),
  polymerGrip: material.blackRubber({ color: "#20252c", roughness: 0.68, clearcoat: 0, envMapIntensity: 0.08 }),
  corduraOlive: material.fabric({
    color: "#525b38",
    roughness: 0.84,
    clearcoat: 0,
    envMapIntensity: 0.06,
    sheen: 0.22,
    sheenColor: "#899468",
    rim: { color: "#b6c294", power: 3.1, intensity: 0.24 }
  }),
  velvetLiner: material.fabric({ color: "#2c1d21", roughness: 0.9, sheen: 0.34, sheenColor: "#6e424a" }),
  ceramicPlate: material.ceramic({ color: "#4a5158", roughness: 0.32 }),
  oliveClearcoat: material.clearcoatPaint({
    color: "#444d31", roughness: 0.26, metallic: 0.18, clearcoat: 0.72, clearcoatRoughness: 0.14
  }),
  hazardClearcoat: material.clearcoatPaint({
    color: "#d49b1a", roughness: 0.2, metallic: 0.22, clearcoat: 0.86, clearcoatRoughness: 0.08
  }),
  crimsonClearcoat: material.clearcoatPaint({
    color: "#b83a24", roughness: 0.24, metallic: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1
  }),
  crimsonDrumLacquer: material.lacquer({ color: "#a82419", roughness: 0.34 }),
  hazardDrumBand: material.lacquer({ color: "#d89e18", roughness: 0.32 }),
  lacquerMag: material.lacquer({ color: "#272d34", roughness: 0.22 }),
  lacquerBadge: material.lacquer({ color: "#9e261b", roughness: 0.18 }),
  consoleSlate: material.lacquer({ color: "#242b35", roughness: 0.26 }),
  opticGlass: material.studioGlass({ tint: "#8fe6ff", roughness: 0.03, thickness: 0.16, ior: 1.52 }),
  visorGlass: material.studioGlass({ tint: "#9ad8eb", roughness: 0.05, thickness: 0.32, ior: 1.5 }),
  concreteCoffer: material.pbr({ color: "#5e5b54", roughness: 0.86, metalness: 0.04 }),
  concreteSlab: material.pbr({ color: "#5e5b54", roughness: 0.86, metalness: 0.04, clearcoat: 0 }),
  timberOrdnance: material.pbr({ color: "#6c5338", roughness: 0.8, metalness: 0.03 }),
  tritiumGreen: material.emissive({
    color: "#9effb8", emissive: "#49f282", emissiveIntensity: 0.42, roughness: 0.2, practical: true
  }),
  reticleCyan: material.emissive({
    color: "#9ff2ff", emissive: "#42dcfa", emissiveIntensity: 1.45, roughness: 0.18, practical: true
  }),
  cryoCoreCyan: material.emissive({
    color: "#c8f8ff", emissive: "#52e0ff", emissiveIntensity: 1.55, roughness: 0.14, practical: true
  }),
  laserAmber: material.emissive({
    color: "#ffe0a3", emissive: "#ff9b28", emissiveIntensity: 1.4, roughness: 0.2, practical: true
  }),
  thrusterFlame: material.emissive({
    color: "#ffe4ac", emissive: "#ff781f", emissiveIntensity: 1.6, roughness: 0.18, practical: true
  }),
  muzzleCore: material.emissive({
    color: "#fff0c4", emissive: "#ffab36", emissiveIntensity: 1.75, roughness: 0.18, practical: true
  }),
  gunmetalSteel: material.metal({ color: "#343b45", roughness: 0.34, metallic: 0.86 }),
  tacticalSlateArmor: material.pbr({
    color: "#33393f",
    roughness: 0.74,
    metalness: 0.14,
    clearcoat: 0,
    envMapIntensity: 0.10,
    rim: { color: "#9ba7b0", power: 3.0, intensity: 0.24 }
  }),
  tacticalOliveArmor: material.pbr({
    color: "#434d34",
    roughness: 0.78,
    metalness: 0.08,
    clearcoat: 0,
    envMapIntensity: 0.10,
    rim: { color: "#b5bf98", power: 3.0, intensity: 0.24 }
  }),
  wardenExoArmor: material.pbr({
    color: "#2b2f35",
    roughness: 0.74,
    metalness: 0.16,
    clearcoat: 0,
    envMapIntensity: 0.10,
    rim: { color: "#cfa088", power: 2.9, intensity: 0.25 }
  }),
  darkFatigues: material.fabric({
    color: "#465239",
    roughness: 0.84,
    clearcoat: 0,
    envMapIntensity: 0.06,
    sheen: 0.18,
    sheenColor: "#788565",
    rim: { color: "#a1af8e", power: 3.2, intensity: 0.22 }
  }),
  coyoteMolle: material.fabric({
    color: "#766144",
    roughness: 0.84,
    clearcoat: 0,
    envMapIntensity: 0.06,
    sheen: 0.2,
    sheenColor: "#a68e6c",
    rim: { color: "#c2ab88", power: 3.1, intensity: 0.22 }
  }),
  humanSkinWarm: material.pbr({
    color: "#c89070",
    roughness: 0.54,
    metalness: 0.02,
    clearcoat: 0,
    envMapIntensity: 0.08,
    rim: { color: "#ebbfa2", power: 3.2, intensity: 0.18 }
  }),
  humanSkinTan: material.pbr({
    color: "#b78061",
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0,
    envMapIntensity: 0.08,
    rim: { color: "#dfa988", power: 3.2, intensity: 0.18 }
  }),
  humanSkinScarred: material.pbr({
    color: "#be8669",
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0,
    envMapIntensity: 0.08,
    rim: { color: "#e5b498", power: 3.1, intensity: 0.2 }
  }),
  humanEyeDark: material.pbr({ color: "#1c1512", roughness: 0.22, metalness: 0.02, clearcoat: 0, envMapIntensity: 0.10 }),
  humanSclera: material.pbr({ color: "#e3dbd0", roughness: 0.34, metalness: 0.01, clearcoat: 0, envMapIntensity: 0.08 }),
  darkBrowHair: material.fabric({
    color: "#26201c",
    roughness: 0.62,
    clearcoat: 0,
    envMapIntensity: 0.06,
    sheen: 0.14,
    sheenColor: "#4a3f38"
  }),
  leatherBootBlack: material.pbr({ color: "#1b1d20", roughness: 0.56, metalness: 0.04, clearcoat: 0, envMapIntensity: 0.08 }),
  leatherGloveTan: material.pbr({ color: "#6d573e", roughness: 0.58, metalness: 0.02, clearcoat: 0, envMapIntensity: 0.08 }),
  smokedPolyVisor: material.physical({
    color: "#22292f",
    roughness: 0.22,
    metalness: 0.02,
    opacity: 0.42,
    clearcoat: 0.14,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.12,
    ior: 1.52
  }),
  officerCrimsonCloth: material.fabric({
    color: "#8c1d19",
    roughness: 0.58,
    clearcoat: 0,
    envMapIntensity: 0.08,
    sheen: 0.26,
    sheenColor: "#cc433b",
    rim: { color: "#e06b63", power: 3.0, intensity: 0.24 }
  }),
  officerCharcoalCoat: material.fabric({
    color: "#23262b",
    roughness: 0.60,
    clearcoat: 0,
    envMapIntensity: 0.08,
    sheen: 0.2,
    sheenColor: "#4c525c",
    rim: { color: "#8c94a1", power: 3.1, intensity: 0.22 }
  }),
  k9SableBlack: material.fabric({
    color: "#1e1b19",
    roughness: 0.56,
    clearcoat: 0,
    envMapIntensity: 0.08,
    sheen: 0.24,
    sheenColor: "#4a423b",
    rim: { color: "#786c62", power: 3.0, intensity: 0.22 }
  }),
  k9RustTan: material.fabric({
    color: "#8f5630",
    roughness: 0.58,
    clearcoat: 0,
    envMapIntensity: 0.08,
    sheen: 0.22,
    sheenColor: "#bf7d4e",
    rim: { color: "#d99b6c", power: 3.1, intensity: 0.2 }
  }),
  k9IvoryFang: material.ceramic({ color: "#f0eadc", roughness: 0.36, clearcoat: 0, envMapIntensity: 0.10 }),
  k9GumCrimson: material.pbr({ color: "#5e2224", roughness: 0.50, metalness: 0.02, clearcoat: 0, envMapIntensity: 0.08 }),
  enamelMedkit: material.ceramic({ color: "#dfd9cc", roughness: 0.34 }),
  visorCrimson: material.emissive({
    color: "#ff9b8a", emissive: "#ff3b24", emissiveIntensity: 1.85, roughness: 0.14, practical: true
  }),
  visorAmber: material.emissive({
    color: "#ffe39e", emissive: "#ff9c24", emissiveIntensity: 1.8, roughness: 0.16, practical: true
  }),
  reactorCrimson: material.emissive({
    color: "#ffb088", emissive: "#ff4d1f", emissiveIntensity: 1.95, roughness: 0.14, practical: true
  })
} as const;

const SPEC_CACHE = new Map<string, AuraCustomGeometrySpec>();
function isEmissiveOrGlass(mat: AuraMaterialSpec | undefined): boolean {
  if (!mat) return false;
  const rec = mat as unknown as { readonly emissiveIntensity?: number; readonly transmission?: number; readonly opacity?: number };
  return (rec.emissiveIntensity ?? 0) > 0.01 || (rec.transmission ?? 0) > 0.05 || (rec.opacity ?? 1) < 0.98;
}
function memoGroupedSpec(
  key: string,
  materials: readonly AuraMaterialSpec[],
  build: () => readonly MultiMatSlot[]
): AuraCustomGeometrySpec {
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;
  const spec = memoizeGeometry(`bz-v3:${key}`, () => {
    const shaded = build().map((slot) =>
      isEmissiveOrGlass(materials[slot.materialIndex])
        ? slot
        : { mesh: bakeMeshCavityAO(slot.mesh, 0.26), materialIndex: slot.materialIndex }
    );
    return buildGroupedGeometrySpec(shaded);
  });
  SPEC_CACHE.set(key, spec);
  return spec;
}
function memoMergedSpec(key: string, build: () => readonly RawMesh[]): AuraCustomGeometrySpec {
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;
  const spec = memoizeGeometry(`bz-merge:${key}`, () => mergeRawMeshes(build()));
  SPEC_CACHE.set(key, spec);
  return spec;
}

function multiMatFromMemo(
  cacheKey: string,
  name: string,
  materials: readonly AuraMaterialSpec[],
  buildSlots: () => readonly MultiMatSlot[],
  opts: { readonly castShadow?: boolean; readonly receiveShadow?: boolean } = {}
): AuraNodeBuilder<AuraGroupNode> {
  return geometry.multiMaterial(memoGroupedSpec(cacheKey, materials, buildSlots), materials, {
    name,
    castShadow: opts.castShadow ?? false,
    receiveShadow: opts.receiveShadow ?? true
  });
}

// ---------------------------------------------------------------------------
// 1. First-Person Viewmodels & Tactical Sleeves / Armored-Knuckle Gloves
// ---------------------------------------------------------------------------
// Viewmodel yaw note (`main.ts` -> `-p.yaw + Math.PI / 2 + VIEWMODEL_YAW_OFFSET[id]`):
// - `pistol` & `mg` use `VIEWMODEL_YAW_OFFSET = Math.PI` -> local `-X` points forward (`-Z`), `+X` toward grip/stock.
// - `rocket` uses `VIEWMODEL_YAW_OFFSET = 0` -> local `+X` points forward (`-Z`), `-X` toward Venturi exhaust.

/** Full-tang tactical combat bolo/machete (`0.62 m` span, tip along `+X/+Y`, grip at `-X` for `VIEWMODEL_YAW_OFFSET.knife = 0`). */
export function buildCombatMacheteNode(name = "vm knife"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.darkSteelBrushed, // 0 full-tang spine, fuller ridge & sawback teeth
    BZ_PROC_MATERIALS.chromeStudio,     // 1 razor-ground bolo bevel & clip-point edge
    BZ_PROC_MATERIALS.polymerGrip,      // 2 contoured stippled G10 handle scales & finger choils
    BZ_PROC_MATERIALS.brassStudio,      // 3 milled S-crossguard, flush rivets & lanyard loop
    BZ_PROC_MATERIALS.laserAmber        // 4 practical tritium combat index pip
  ];
  return multiMatFromMemo("vm-combat-machete", name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Full-tang dark steel spine & fuller core (`x in [-0.03, +0.39]`)
    const spinePoly: V2[] = [
      [-0.03, 0.012], [0.16, 0.056], [0.34, 0.118], [0.42, 0.132], [0.37, 0.088], [0.15, 0.032], [-0.03, -0.004]
    ];
    slots.push({ mesh: extrudePolygonMesh(spinePoly, 0.009, 0.002, true), materialIndex: 0 });
    // Sawback spine serration teeth along upper ridge
    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      const sx = 0.05 + t * 0.21;
      const sy = 0.032 + t * 0.058;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.018, 0.014, 0.008, 0.002), { pos: [sx, sy, 0], rot: [0, 0, 0.42] }),
        materialIndex: 0
      });
    }
    // Satin chrome primary cutting bevel & bolo belly (`x in [-0.02, +0.43]`)
    const edgePoly: V2[] = [
      [-0.02, -0.004], [0.15, 0.034], [0.37, 0.09], [0.425, 0.132],
      [0.405, 0.072], [0.31, 0.012], [0.14, -0.022], [0.01, -0.024]
    ];
    slots.push({ mesh: extrudePolygonMesh(edgePoly, 0.006, 0.0015, true), materialIndex: 1 });
    // Milled S-curve brass tactical crossguard
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.022, 0.096, 0.028, 0.005), { pos: [-0.032, 0.002, 0], rot: [0, 0, -0.26] }),
      materialIndex: 3
    });
    // Contoured ergonomic G10 grip scales + transverse traction ribs (`x in [-0.19, -0.035]`)
    const gripPoly: V2[] = [
      [-0.036, 0.016], [-0.036, -0.024], [-0.085, -0.038], [-0.145, -0.058],
      [-0.192, -0.068], [-0.198, -0.026], [-0.135, -0.006]
    ];
    slots.push({ mesh: extrudePolygonMesh(gripPoly, 0.028, 0.006, true), materialIndex: 2 });
    for (let r = 0; r < 4; r += 1) {
      const t = r / 3;
      const gx = -0.065 - t * 0.096;
      const gy = -0.012 - t * 0.032;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.009, 0.038, 0.031, 0.002), { pos: [gx, gy, 0], rot: [0, 0, 0.28] }),
        materialIndex: 2
      });
    }
    // 3 flush brass handle rivets + skull-crusher pommel lug + swept lanyard loop
    for (let r = 0; r < 3; r += 1) {
      const t = r / 2;
      slots.push({
        mesh: transformMesh(latheMesh([[0, -0.016], [0.0055, -0.016], [0.0055, 0.016], [0, 0.016]], 10), {
          pos: [-0.068 - t * 0.095, -0.011 - t * 0.032, 0],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 3
      });
    }
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.026, 0.032, 0.022, 0.004), { pos: [-0.202, -0.052, 0], rot: [0, 0, 0.3] }),
      materialIndex: 0
    });
    slots.push({
      mesh: tubeSweepMesh([
        [-0.208, -0.048, 0, 0.004], [-0.228, -0.056, 0, 0.004],
        [-0.226, -0.076, 0, 0.004], [-0.204, -0.064, 0, 0.004]
      ], 6),
      materialIndex: 3
    });
    // Practical combat tritium index pip on upper guard
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.01, 0.008, 0.01, 0.002), { pos: [-0.026, 0.044, 0] }), materialIndex: 4 });
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

/** Two-tone ported tactical service pistol (`0.38 m` span, muzzle at `-X`, grip at `+X`, under-barrel laser/HUD module). */
export function buildServicePistolNode(name = "vm pistol"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 machined compensated slide & under-barrel LAM housing
    BZ_PROC_MATERIALS.polymerGrip,     // 1 dust-cover rail + stippled ergonomic grip + flared magwell
    BZ_PROC_MATERIALS.chromeStudio,    // 2 ported match barrel + extractor + skeletonized hammer
    BZ_PROC_MATERIALS.lacquerMag,      // 3 extended magazine baseplate
    BZ_PROC_MATERIALS.tritiumGreen,    // 4 3-dot tritium night sights
    BZ_PROC_MATERIALS.reticleCyan      // 5 side HUD round-counter strip & under-barrel LAM emitter
  ];
  return multiMatFromMemo("vm-service-pistol", name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Bevelled machined top slide + angled front/rear cocking serrations + top compensator cut
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.282, 0.045, 0.038, 0.006), { pos: [-0.03, 0.036, 0] }), materialIndex: 0 });
    for (let i = 0; i < 5; i += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.006, 0.034, 0.041, 0.0015), { pos: [0.044 + i * 0.012, 0.036, 0], rot: [0, 0, -0.18] }),
        materialIndex: 0
      });
    }
    for (let i = 0; i < 3; i += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.005, 0.028, 0.04, 0.0012), { pos: [-0.135 + i * 0.012, 0.036, 0], rot: [0, 0, -0.18] }),
        materialIndex: 0
      });
    }
    // Under-barrel tactical laser aiming module (LAM) with bevelled shroud + cyan emitter lens
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.088, 0.024, 0.034, 0.004), { pos: [-0.098, -0.014, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.008, 0.011, 0.018, 0.002), { pos: [-0.143, -0.014, 0] }), materialIndex: 5 });
    // Lower polymer dust-cover rail + smooth-contoured ergonomic raked grip + flared magwell
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.244, 0.024, 0.036, 0.004), { pos: [-0.015, 0.006, 0] }), materialIndex: 1 });
    const gripPoly: V2[] = [[0.035, 0.006], [0.099, 0.009], [0.128, -0.118], [0.056, -0.122]];
    slots.push({ mesh: subdivideSmoothMesh(extrudePolygonMesh(gripPoly, 0.035, 0.005), 1, 0.34), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.082, 0.014, 0.042, 0.003), { pos: [0.092, -0.116, 0] }), materialIndex: 1 });
    // Trigger guard loop + curved swept trigger
    slots.push({
      mesh: tubeSweepMesh([
        [0.036, -0.004, 0, 0.0045], [0.032, -0.042, 0, 0.0045],
        [-0.018, -0.042, 0, 0.0045], [-0.026, -0.004, 0, 0.0045]
      ], 6),
      materialIndex: 1
    });
    slots.push({
      mesh: tubeSweepMesh([[0.014, -0.004, 0, 0.0038], [0.008, -0.022, 0, 0.0035], [0.015, -0.033, 0, 0.003]], 6),
      materialIndex: 1
    });
    // Revolved rifled barrel crown (`latheMesh` rotated so +Y maps to -X) + ejection port + skeletonized hammer
    const barrelProf: V2[] = [[0.006, 0], [0.011, 0.002], [0.011, 0.062], [0.013, 0.068], [0.008, 0.074], [0.005, 0.06]];
    slots.push({
      mesh: transformMesh(latheMesh(barrelProf, 14), { pos: [-0.145, 0.036, 0], rot: [0, 0, Math.PI * 0.5] }),
      materialIndex: 2
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.052, 0.018, 0.039, 0.002), { pos: [-0.005, 0.044, 0.002] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.018, 0.018, 0.01, 0.002), { pos: [0.114, 0.042, 0], rot: [0, 0, 0.38] }), materialIndex: 2 });
    // Magazine floorplate
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.076, 0.02, 0.039, 0.004), { pos: [0.093, -0.128, 0] }), materialIndex: 3 });
    // 3-dot tritium combat sights + side slide HUD charge bar
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.008, 0.002), { pos: [-0.152, 0.062, 0] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.007, 0.002), { pos: [0.092, 0.062, -0.01] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.007, 0.002), { pos: [0.092, 0.062, 0.01] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.048, 0.006, 0.041, 0.0015), { pos: [0.012, 0.028, 0] }), materialIndex: 5 });
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

/** Bullpup / carbine tactical pulse rifle (`0.68 m` span, muzzle at `-X`, buttstock at `+X`, angled HUD ammo display). */
export function buildPulseCarbineNode(name = "vm mg", castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 monolithic upper/lower receiver, rail & HUD bezel
    BZ_PROC_MATERIALS.chromeStudio,    // 1 multi-port muzzle brake, gas block & lattice shroud
    BZ_PROC_MATERIALS.polymerGrip,     // 2 smooth cheek-riser buttstock, grip & angled foregrip
    BZ_PROC_MATERIALS.lacquerMag,      // 3 curved box magazine
    BZ_PROC_MATERIALS.reticleCyan,     // 4 HUD ammo-counter telemetry screen & rail bars
    BZ_PROC_MATERIALS.tritiumGreen     // 5 ready-status telemetry pip
  ];
  return multiMatFromMemo(`pulse-carbine-${castShadow ? 1 : 0}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Monolithic bevelled upper + lower machined receiver + brass deflector + Picatinny rail teeth
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.326, 0.068, 0.054, 0.007), { pos: [-0.01, 0.034, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.19, 0.036, 0.048, 0.005), { pos: [0.015, -0.006, 0] }), materialIndex: 0 });
    for (let i = 0; i < 9; i += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.014, 0.012, 0.035, 0.002), { pos: [-0.132 + i * 0.03, 0.072, 0] }),
        materialIndex: 0
      });
    }
    // Slotted lattice barrel shroud (`latticeTrussMesh`) + revolved fluted barrel & 3-baffle muzzle brake
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.225, 0.05, 0.05], bays: 4, chordRadius: 0.0055 }), { pos: [-0.242, 0.034, 0] }),
      materialIndex: 1
    });
    const barrelProf: V2[] = [
      [0.009, 0], [0.012, 0.16], [0.018, 0.166], [0.018, 0.22],
      [0.013, 0.226], [0.019, 0.246], [0.019, 0.29], [0.008, 0.298]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(barrelProf, 14), { pos: [-0.14, 0.034, 0], rot: [0, 0, Math.PI * 0.5] }),
      materialIndex: 1
    });
    // Smooth-contoured cheek-riser buttstock (`subdivideSmoothMesh`), raked grip & angled tactical foregrip
    const stockPoly: V2[] = [[0.14, 0.058], [0.292, 0.05], [0.302, -0.052], [0.255, -0.06], [0.14, -0.008]];
    slots.push({ mesh: subdivideSmoothMesh(extrudePolygonMesh(stockPoly, 0.042, 0.006), 1, 0.36), materialIndex: 2 });
    const gripPoly: V2[] = [[0.06, 0.0], [0.116, 0.0], [0.146, -0.116], [0.088, -0.118]];
    slots.push({ mesh: subdivideSmoothMesh(extrudePolygonMesh(gripPoly, 0.036, 0.005), 1, 0.32), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.036, 0.082, 0.032, 0.006), { pos: [-0.212, -0.026, 0], rot: [0, 0, 0.24] }), materialIndex: 2 });
    // Curved box magazine (`loftSectionsMesh`) + cyan window strip
    const magRings: V3[][] = [
      [[-0.085, 0.0, -0.016], [-0.035, 0.0, -0.016], [-0.035, 0.0, 0.016], [-0.085, 0.0, 0.016]],
      [[-0.096, -0.085, -0.016], [-0.046, -0.082, -0.016], [-0.046, -0.082, 0.016], [-0.096, -0.085, 0.016]],
      [[-0.122, -0.168, -0.015], [-0.072, -0.158, -0.015], [-0.072, -0.158, 0.015], [-0.122, -0.168, 0.015]]
    ];
    slots.push({ mesh: loftSectionsMesh(magRings, true, true), materialIndex: 3 });
    // Angled side-mounted digital HUD ammo counter pod + dual cyan telemetry bars
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.058, 0.028, 0.02, 0.003), { pos: [0.055, 0.052, -0.034], rot: [0.38, 0, 0] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.044, 0.017, 0.006, 0.0015), { pos: [0.055, 0.055, -0.043], rot: [0.38, 0, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.009, 0.009, 0.006, 0.0015), { pos: [0.082, 0.055, -0.042], rot: [0.38, 0, 0] }),
      materialIndex: 5
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.096, 0.009, 0.008, 0.002), { pos: [-0.048, 0.046, -0.028] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.096, 0.009, 0.008, 0.002), { pos: [-0.048, 0.046, 0.028] }), materialIndex: 4 });
    return slots;
  }, { castShadow, receiveShadow: castShadow });
}

/** Twin-collar recoilless rocket launcher (`0.88 m` span, muzzle at `+X`, Venturi exhaust at `-X`, smart HUD optic at `-Z`). */
export function buildRocketLauncherNode(name = "vm rocket", castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.oliveClearcoat,  // 0 composite main launch tube & blast shield
    BZ_PROC_MATERIALS.chromeStudio,    // 1 flared Venturi exhaust bell & heavy clamp collars
    BZ_PROC_MATERIALS.polymerGrip,     // 2 smooth-contoured shoulder rest & twin grips
    BZ_PROC_MATERIALS.gunmetalBrushed, // 3 smart target-acquisition optic pod & carry truss
    BZ_PROC_MATERIALS.opticGlass,      // 4 coated objective lens
    BZ_PROC_MATERIALS.laserAmber,      // 5 HUD rangefinder lock pip
    BZ_PROC_MATERIALS.reticleCyan      // 6 HUD rear ocular telemetry screen
  ];
  return multiMatFromMemo(`rocket-launcher-${castShadow ? 1 : 0}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Stepped main launch tube along X (`latheMesh` rotated by -PI/2 around Z so +Y -> +X)
    const tubeProf: V2[] = [
      [0.052, -0.34], [0.057, -0.32], [0.057, 0.36], [0.066, 0.37], [0.066, 0.425], [0.044, 0.425]
    ];
    slots.push({ mesh: transformMesh(latheMesh(tubeProf, 18), { rot: [0, 0, -Math.PI * 0.5] }), materialIndex: 0 });
    // Angled blast-deflector cheek shield
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.095, 0.022, 0.005), { pos: [0.22, 0.03, -0.062], rot: [0, 0.22, 0] }), materialIndex: 0 });
    // Flared Venturi exhaust cone at `-X` + twin heavy steel reinforcement collars
    const bellProf: V2[] = [[0.042, 0], [0.054, 0.03], [0.08, 0.11], [0.086, 0.132], [0.068, 0.132]];
    slots.push({ mesh: transformMesh(latheMesh(bellProf, 18), { pos: [-0.34, 0, 0], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 1 });
    for (const cx of [-0.14, 0.18, 0.32]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.056, -0.018], [0.066, -0.014], [0.066, 0.014], [0.056, 0.018]], 18), { pos: [cx, 0, 0], rot: [0, 0, -Math.PI * 0.5] }),
        materialIndex: 1
      });
    }
    // Twin ergonomic pistol grips + smooth-sculpted contoured shoulder saddle
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.038, 0.112, 0.036, 0.006), { pos: [0.06, -0.096, 0], rot: [0, 0, -0.2] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.036, 0.102, 0.034, 0.006), { pos: [0.24, -0.09, 0], rot: [0, 0, -0.14] }), materialIndex: 2 });
    slots.push({
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.168, 0.038, 0.082, 0.01), 1, 0.42), { pos: [-0.18, -0.068, 0] }),
      materialIndex: 2
    });
    // Carry handle truss + smart optical targeting pod on `-Z` with rear HUD telemetry screen
    slots.push({
      mesh: tubeSweepMesh([[-0.08, 0.058, 0, 0.007], [-0.06, 0.094, 0, 0.007], [0.14, 0.094, 0, 0.007], [0.16, 0.058, 0, 0.007]], 8),
      materialIndex: 3
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.148, 0.042, 0.046, 0.006), { pos: [0.08, 0.028, -0.078] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.032, 0.032, 0.002), { pos: [0.156, 0.028, -0.078] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.018, 0.012, 0.012, 0.002), { pos: [0.146, 0.054, -0.078] }), materialIndex: 5 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.008, 0.028, 0.032, 0.002), { pos: [0.004, 0.028, -0.078] }), materialIndex: 6 });
    return slots;
  }, { castShadow, receiveShadow: castShadow });
}

/** Hooded holographic reflex sight (`vm-optic`: `brushedMetal` shroud + `studioGlass` window + `practical: true` cyan HUD reticle). */
export function buildReflexOpticNode(name = "vm reflex optic"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [BZ_PROC_MATERIALS.gunmetalBrushed, BZ_PROC_MATERIALS.opticGlass, BZ_PROC_MATERIALS.reticleCyan];
  return multiMatFromMemo("vm-reflex-optic", name, mats, () => {
    const hoodPoly: V2[] = [
      [-0.023, -0.016], [0.023, -0.016], [0.025, 0.017], [0.017, 0.024], [-0.017, 0.024], [-0.025, 0.017],
      [-0.018, 0.015], [0.018, 0.015], [0.018, -0.009], [-0.018, -0.009]
    ];
    return [
      { mesh: transformMesh(bevelBoxMesh(0.048, 0.011, 0.054, 0.0025), { pos: [0, -0.015, 0] }), materialIndex: 0 },
      { mesh: extrudePolygonMesh(hoodPoly, 0.04, 0.0025, true), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.034, 0.025, 0.004, 0.001), { pos: [0, 0.003, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.0045, 0.0045, 0.006, 0.001), { pos: [0, 0.004, -0.003] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.016, 0.0022, 0.004, 0.0006), { pos: [0, 0.004, -0.003] }), materialIndex: 2 }
    ];
  }, { castShadow: false, receiveShadow: false });
}

/** Paints organic 3-tone woodland camouflage mottling onto a fatigue `RawMesh` prior to cavity AO baking. */
function paintWoodlandCamoMesh(src: RawMesh, scale = 11.5, seed = 1.7): RawMesh {
  const vCount = src.positions.length / 3;
  const colors = new Array<number>(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]! * scale + seed;
    const y = src.positions[i * 3 + 1]! * scale * 0.85 - seed * 0.6;
    const z = src.positions[i * 3 + 2]! * scale + seed * 1.3;
    const n1 = Math.sin(x * 1.35 + Math.cos(y * 1.7 + z * 0.9)) + Math.cos(z * 1.5 - Math.sin(x * 1.1 + y * 1.3));
    const n2 = Math.sin(y * 2.4 + x * 1.6 - z * 1.9);
    let r = 0.98, g = 0.99, b = 0.9; // khaki-olive highlight
    if (n1 > 0.48) {
      r = 0.62; g = 0.56; b = 0.46; // dark earth bark blotch
    } else if (n1 < -0.22 || n2 > 0.58) {
      r = 0.74; g = 0.84; b = 0.66; // deep woodland moss patch
    }
    colors[i * 4] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = 1;
  }
  return { ...src, colors };
}

/** Paints subtle natural human skin warmth (nose/cheek/knuckle flush & jaw shading) prior to cavity AO baking. */
function paintWarmSkinMesh(src: RawMesh): RawMesh {
  const vCount = src.positions.length / 3;
  const colors = new Array<number>(vCount * 4);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < vCount; i += 1) {
    const y = src.positions[i * 3 + 1]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(1e-4, maxY - minY);
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!;
    const y = src.positions[i * 3 + 1]!;
    const z = src.positions[i * 3 + 2]!;
    const v = (y - minY) / spanY;
    const forwardFlush = z > 0 ? Math.min(0.08, z * 0.45) : 0;
    const jawShade = v < 0.3 ? (0.3 - v) * 0.22 : 0;
    const micro = Math.sin(x * 34 + y * 29 + z * 31) * 0.018;
    colors[i * 4] = Math.min(1, Math.max(0.68, 0.96 + forwardFlush - jawShade * 0.7 + micro));
    colors[i * 4 + 1] = Math.min(1, Math.max(0.62, 0.92 - forwardFlush * 0.25 - jawShade + micro));
    colors[i * 4 + 2] = Math.min(1, Math.max(0.58, 0.90 - forwardFlush * 0.35 - jawShade + micro));
    colors[i * 4 + 3] = 1;
  }
  return { ...src, colors };
}

interface OrientedLimbStation {
  readonly pos: V3;
  readonly rx: number;
  readonly rz: number;
  readonly bulge?: number;
}

/**
 * Lofts an anatomical muscular limb along any 3D bone trajectory (including horizontal rifle-aiming forearms)
 * using a perpendicular tangent frame so cross-sections never pinch flat when `dY` is small.
 */
function sculptOrientedLimbMesh(stations: readonly OrientedLimbStation[], ringPoints = 12): RawMesh {
  const rings: V3[][] = [];
  let prevN: V3 = [1, 0, 0];
  for (let s = 0; s < stations.length; s += 1) {
    const cur = stations[s]!;
    const p0 = stations[Math.max(0, s - 1)]!.pos;
    const p1 = stations[Math.min(stations.length - 1, s + 1)]!.pos;
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    // Gram-Schmidt project previous normal perpendicular to tangent for twist-free framing
    let dot = prevN[0] * tx + prevN[1] * ty + prevN[2] * tz;
    let nx = prevN[0] - dot * tx, ny = prevN[1] - dot * ty, nz = prevN[2] - dot * tz;
    let nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-4) {
      const ux = Math.abs(ty) < 0.9 ? 0 : 1;
      const uy = Math.abs(ty) < 0.9 ? 1 : 0;
      nx = uy * tz; ny = -ux * tz; nz = ux * ty - uy * tx;
      nLen = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nLen; ny /= nLen; nz /= nLen;
    prevN = [nx, ny, nz];
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    const bulge = cur.bulge ?? 0.14;
    const ring: V3[] = [];
    for (let i = 0; i < ringPoints; i += 1) {
      const a = (i / ringPoints) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const muscle = 1 + bulge * Math.max(0, sa) - bulge * 0.28 * Math.max(0, -sa) + Math.sin(a * 2) * 0.03;
      const u = ca * cur.rx * muscle;
      const v = sa * cur.rz * muscle;
      ring.push([
        cur.pos[0] + nx * u + bx * v,
        cur.pos[1] + ny * u + by * v,
        cur.pos[2] + nz * u + bz * v
      ]);
    }
    rings.push(ring);
  }
  return bzSmoothMesh(loftSectionsMesh(rings, true, true), 4);
}

/** Tailored woodland-camo combat fatigue sleeve (`sculptDrapedGarmentMesh` + `sculptAnatomicalLimbMesh` + `taubinSmoothMesh`, `vm-sleeve-r/l`). */
export function buildTacticalSleeveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const s = hand === "right" ? 1 : -1;
  const mats = [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 matte woodland combat fatigue cloth (`roughness: 0.84`)
    BZ_PROC_MATERIALS.coyoteMolle,        // 1 coyote Cordura cuff binding & pad retention straps
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 2 matte olive contoured forearm/elbow pad
    BZ_PROC_MATERIALS.humanSkinWarm       // 3 muscular human wrist/forearm skin emerging from rolled cuff
  ];
  return multiMatFromMemo(`vm-sleeve-${hand}`, name, mats, () => {
    const drapedSleeve = bzSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.13, rx: 0.047, rz: 0.048, zBias: -0.002, foldAmp: 0.003 },
          { y: -0.064, rx: 0.049, rz: 0.05, zBias: 0.003, foldAmp: 0.0035 },
          { y: 0.004, rx: 0.045, rz: 0.046, zBias: 0.002, foldAmp: 0.003 },
          { y: 0.058, rx: 0.043, rz: 0.044, zBias: 0, foldAmp: 0.0025 }
        ],
        { segments: 24, foldCount: 8, wallThickness: 0.006, seed: hand === "right" ? 301 : 302 }
      ),
      4
    );
    const rolledCuff = bzSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.05, rx: 0.046, rz: 0.047, foldAmp: 0.002 },
          { y: 0.068, rx: 0.048, rz: 0.049, foldAmp: 0.0025 },
          { y: 0.082, rx: 0.044, rz: 0.045, foldAmp: 0.002 }
        ],
        { segments: 22, foldCount: 7, wallThickness: 0.006, seed: hand === "right" ? 303 : 304 }
      ),
      4
    );
    const wristSkinStations: AnatomicalStation[] = [
      { pos: [0, 0.068, 0], rx: 0.036, rz: 0.035 },
      { pos: [0, 0.102, -0.001], rx: 0.034, rz: 0.032 },
      { pos: [0, 0.128, 0], rx: 0.032, rz: 0.03 }
    ];
    return [
      {
        mesh: paintWoodlandCamoMesh(drapedSleeve, 14.0, hand === "right" ? 1.3 : 2.9),
        materialIndex: 0
      },
      {
        mesh: paintWoodlandCamoMesh(rolledCuff, 14.0, 2.1),
        materialIndex: 0
      },
      // Smooth contoured matte olive forearm/elbow pad + coyote Cordura retention straps
      {
        mesh: bzSmoothMesh(
          transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.058, 0.088, 0.018, 0.007), 2, 0.48), { pos: [0.01 * s, -0.022, 0.042] }),
          4
        ),
        materialIndex: 2
      },
      {
        mesh: bzSmoothMesh(latheMesh([[0.041, -0.056], [0.047, -0.053], [0.047, -0.041], [0.041, -0.038]], 20), 3),
        materialIndex: 1
      },
      {
        mesh: bzSmoothMesh(latheMesh([[0.039, -0.004], [0.045, -0.001], [0.045, 0.011], [0.039, 0.014]], 20), 3),
        materialIndex: 1
      },
      // Smooth warm muscular human wrist skin extending into the fingerless glove
      {
        mesh: paintWarmSkinMesh(
          bzSmoothMesh(sculptAnatomicalLimbMesh(wristSkinStations, { ringPoints: 20, muscleBiasZ: 0.1 }), 4)
        ),
        materialIndex: 3
      }
    ];
  }, { castShadow: false, receiveShadow: false });
}

/** Woven olive paracord wrist strap + contoured matte dark-steel military field watch (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`, `vm-cuff-r`). */
export function buildTacticalWristCuffNode(name = "vm wrist cuff right"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.corduraOlive,     // 0 woven olive nylon/paracord field watch band
    BZ_PROC_MATERIALS.darkSteelBrushed, // 1 rugged matte steel field watch case & buckle
    BZ_PROC_MATERIALS.brassStudio,      // 2 knurled watch crown
    BZ_PROC_MATERIALS.tritiumGreen      // 3 subtle tritium luminous watch hands (`practical: true`)
  ];
  return multiMatFromMemo("vm-wrist-cuff", name, mats, () => [
    {
      mesh: bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.016, rx: 0.036, rz: 0.036, foldAmp: 0.0015 },
            { y: 0.0, rx: 0.039, rz: 0.039, foldAmp: 0.002 },
            { y: 0.016, rx: 0.036, rz: 0.036, foldAmp: 0.0015 }
          ],
          { segments: 20, foldCount: 10, wallThickness: 0.004, seed: 311 }
        ),
        3
      ),
      materialIndex: 0
    },
    {
      mesh: bzSmoothMesh(
        transformMesh(latheMesh([[0, -0.006], [0.016, -0.006], [0.017, 0], [0.016, 0.006], [0, 0.006]], 18), {
          pos: [-0.016, 0, 0.038],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        3
      ),
      materialIndex: 1
    },
    { mesh: transformMesh(bzSmoothSphereMesh(0.0032, 2), { pos: [-0.001, 0.0, 0.038] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.011, 0.003, 0.003, 0.0008), { pos: [-0.016, 0.001, 0.044], rot: [0, 0, 0.45] }), materialIndex: 3 }
  ], { castShadow: false, receiveShadow: false });
}

/** Contoured fingerless leather/nomex tactical shooting glove with molded carbon knuckle guard & smooth anatomical fingers (`vm-glove-r/l`). */
export function buildTacticalGloveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const s = hand === "right" ? 1 : -1;
  const mats = [
    BZ_PROC_MATERIALS.leatherGloveTan,  // 0 contoured coyote-tan cowhide/nomex fingerless glove body
    BZ_PROC_MATERIALS.leatherBootBlack, // 1 stippled black leather palm grip patch & wrist velcro strap
    BZ_PROC_MATERIALS.polymerGrip,      // 2 matte molded carbon/rubber dorsal knuckle guard
    BZ_PROC_MATERIALS.humanSkinWarm     // 3 exposed warm human skin fingers & thumb gripping weapon
  ];
  return multiMatFromMemo(`vm-glove-${hand}`, name, mats, () => {
    const gloveBody = sculptOrganicSdfMesh({
      boundsMin: [-0.048, -0.028, -0.036],
      boundsMax: [0.048, 0.032, 0.038],
      resolution: [22, 18, 22],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const palm = sdfEllipsoid(p, [0, 0.001, 0.0], [0.035, 0.022, 0.028]);
        const mcpArch = sdfTaperedCapsule(p, [-0.024, 0.005, -0.022], [0.024, 0.005, -0.022], 0.013, 0.013);
        const thenar = sdfEllipsoid(p, [-0.026 * s, -0.004, -0.006], [0.016, 0.015, 0.018]);
        const wristTaper = sdfEllipsoid(p, [0, 0.0, 0.020], [0.033, 0.020, 0.016]);
        let d = sminPoly(palm, mcpArch, 0.010);
        d = sminPoly(d, thenar, 0.012);
        d = sminPoly(d, wristTaper, 0.010);
        return d;
      }
    });
    const wristVelcroCuff = bzSmoothMesh(
      transformMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.012, rx: 0.036, rz: 0.023, foldAmp: 0.0015 },
            { y: 0.012, rx: 0.035, rz: 0.022, foldAmp: 0.0015 }
          ],
          { segments: 20, foldCount: 5, wallThickness: 0.004, seed: hand === "right" ? 321 : 322 }
        ),
        { pos: [0, 0, 0.028], rot: [Math.PI * 0.5, 0, 0] }
      ),
      3
    );
    const slots: MultiMatSlot[] = [
      { mesh: gloveBody, materialIndex: 0 },
      {
        mesh: bzSmoothMesh(
          transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.056, 0.013, 0.050, 0.005), 2, 0.48), { pos: [0, -0.017, -0.004] }),
          4
        ),
        materialIndex: 1
      },
      { mesh: wristVelcroCuff, materialIndex: 1 },
      // Contoured 4-dome molded carbon-rubber knuckle guard across MCP joints
      {
        mesh: bzSmoothMesh(
          transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.064, 0.016, 0.030, 0.007), 2, 0.5), { pos: [0, 0.021, -0.015] }),
          4
        ),
        materialIndex: 2
      }
    ];
    for (let k = 0; k < 4; k += 1) {
      const kx = (-0.022 + k * 0.0145) * s;
      slots.push({
        mesh: transformMesh(bzSmoothSphereMesh(1, 2), {
          pos: [kx, 0.027, -0.018],
          scale: [0.0071, 0.0045, 0.0078]
        }),
        materialIndex: 2
      });
    }
    // 4 smooth curved articulated fingers (`tubeSweepMesh` + `subdivideSmoothMesh` + `taubinSmoothMesh`)
    for (let f = 0; f < 4; f += 1) {
      const fx = (-0.022 + f * 0.0145) * s;
      const lenScale = f === 1 || f === 2 ? 1.05 : 0.94;
      slots.push({
        mesh: taubinSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh(
              [
                [fx, 0.005, -0.024, 0.0086],
                [fx, 0.002, -0.035, 0.0083],
                [fx, -0.001, -0.045, 0.0078]
              ],
              12,
              true
            ),
            1,
            0.48
          ),
          4
        ),
        materialIndex: 0
      });
      slots.push({
        mesh: paintWarmSkinMesh(
          taubinSmoothMesh(
            subdivideSmoothMesh(
              tubeSweepMesh(
                [
                  [fx, -0.001, -0.043, 0.0075],
                  [fx, -0.010 * lenScale, -0.059 * lenScale, 0.0068],
                  [fx * 0.95, -0.019 * lenScale, -0.060 * lenScale, 0.0063],
                  [fx * 0.92, -0.026 * lenScale, -0.055 * lenScale, 0.0056]
                ],
                12,
                true
              ),
              1,
              0.48
            ),
            4
          )
        ),
        materialIndex: 3
      });
    }
    // Smooth curved thumb: leather thenar sheath + exposed warm human skin thumb phalanges
    slots.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [-0.029 * s, 0.0, -0.006, 0.0102],
              [-0.036 * s, 0.005, -0.019, 0.0094],
              [-0.040 * s, 0.008, -0.030, 0.0085]
            ],
            12,
            true
          ),
          1,
          0.48
        ),
        4
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: paintWarmSkinMesh(
        taubinSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh(
              [
                [-0.039 * s, 0.008, -0.028, 0.0081],
                [-0.042 * s, 0.013, -0.045, 0.0072],
                [-0.035 * s, 0.015, -0.055, 0.0066],
                [-0.028 * s, 0.015, -0.060, 0.0059]
              ],
              12,
              true
            ),
            1,
            0.48
          ),
          4
        )
      ),
      materialIndex: 3
    });
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

// ---------------------------------------------------------------------------
// 2. Blast Door Bulkhead, Secret Push-Wall, Pickups & Destructible/Cover Props
// ---------------------------------------------------------------------------

/** Armored hydraulic sliding blast-door bulkhead (`span ~ 2.94 m <= CELL`, `y in [0, wallH * 0.94]`, sawtooth interlock & HUD keypad). */
export function buildBlastDoorBulkheadNode(
  wallH: number,
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const h = wallH * 0.94;
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 ribbed outer bulkhead frame, sawtooth interlock & hydraulic housing
    BZ_PROC_MATERIALS.hazardClearcoat, // 1 bevelled interlocking blast leaves & diagonal caution bars
    BZ_PROC_MATERIALS.visorGlass,      // 2 armored containment viewport
    BZ_PROC_MATERIALS.chromeStudio,    // 3 hydraulic piston rods, rotary vault handwheel & 4 locking dogs
    BZ_PROC_MATERIALS.laserAmber,      // 4 overhead containment status lightbars
    BZ_PROC_MATERIALS.reticleCyan      // 5 dual-face tactical HUD security access keypads
  ];
  return multiMatFromMemo(`blast-door-${h.toFixed(2)}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Heavy perimeter steel frame + corner gusset plates + horizontal stiffeners
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.94, 0.16, 0.25, 0.025), { pos: [0, 0.08, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.94, 0.2, 0.26, 0.026), { pos: [0, h - 0.1, 0] }), materialIndex: 0 });
    for (const sx of [-1.39, 1.39]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, h, 0.25, 0.022), { pos: [sx, h * 0.5, 0] }), materialIndex: 0 });
    }
    // Overhead twin hydraulic actuator cylinders + chrome piston rods
    for (const hx of [-0.74, 0.74]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0, -0.26], [0.052, -0.26], [0.052, 0.26], [0, 0.26]], 12), { pos: [hx, h - 0.22, 0], rot: [0, 0, -Math.PI * 0.5] }),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(latheMesh([[0, -0.44], [0.024, -0.44], [0.024, 0.44], [0, 0.44]], 10), { pos: [hx * 0.5, h - 0.22, 0], rot: [0, 0, -Math.PI * 0.5] }),
        materialIndex: 3
      });
    }
    // Interlocking central seam stile + 3 heavy shear-tooth lugs
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.13, h - 0.3, 0.22, 0.018), { pos: [0, h * 0.5, 0] }), materialIndex: 0 });
    for (const ty of [0.22, 0.48, 0.8]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.26, 0.11, 0.235, 0.014), { pos: [0, h * ty, 0] }), materialIndex: 0 });
    }
    for (const fy of [0.28, 0.76]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(2.68, 0.09, 0.23, 0.014), { pos: [0, h * fy, 0] }), materialIndex: 0 });
    }
    // Twin bevelled hazard-yellow clearcoat blast leaves + diagonal caution bars
    for (const lx of [-0.68, 0.68]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(1.24, h - 0.32, 0.175, 0.024), { pos: [lx, h * 0.5, 0] }), materialIndex: 1 });
      for (const sideZ of [-0.094, 0.094]) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.86, 0.11, 0.02, 0.005), { pos: [lx, h * 0.2, sideZ], rot: [0, 0, lx < 0 ? 0.22 : -0.22] }),
          materialIndex: 1
        });
      }
    }
    // Armored inspection port bezel + recessed studioGlass window at eye height
    const visorY = Math.min(h - 0.44, Math.max(1.35, h * 0.62));
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.98, 0.42, 0.24, 0.02), { pos: [0, visorY, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.82, 0.28, 0.26, 0.012), { pos: [0, visorY, 0] }), materialIndex: 2 });
    // Spoked rotary vault handwheel + dual-side HUD security access keypad & status lightbar
    const wheelY = Math.max(0.88, h * 0.41);
    const wheelRim: V2[] = [[0.2, -0.02], [0.25, -0.02], [0.25, 0.02], [0.2, 0.02], [0.2, -0.02]];
    const hubProf: V2[] = [[0, -0.035], [0.068, -0.035], [0.056, 0.04], [0, 0.04]];
    for (const wz of [-0.128, 0.128]) {
      const rx = wz > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const zOut = wz + Math.sign(wz) * 0.02;
      slots.push({ mesh: transformMesh(latheMesh(hubProf, 14), { pos: [-0.52, wheelY, wz], rot: [rx, 0, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(latheMesh(wheelRim, 18), { pos: [-0.52, wheelY, zOut], rot: [rx, 0, 0] }), materialIndex: 3 });
      for (let k = 0; k < 2; k += 1) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.44, 0.028, 0.024, 0.004), { pos: [-0.52, wheelY, zOut], rot: [0, 0, (k * Math.PI) / 2 + 0.4] }),
          materialIndex: 3
        });
      }
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.52, 0.038, 0.022, 0.004), { pos: [0, visorY + 0.25, wz] }), materialIndex: 4 });
      // Recessed HUD security terminal bezel + glowing cyan access screen on right leaf
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.26, 0.034, 0.006), { pos: [0.62, wheelY + 0.04, wz] }), materialIndex: 0 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.125, 0.14, 0.018, 0.003), { pos: [0.62, wheelY + 0.075, zOut] }), materialIndex: 5 });
    }
    for (const dy of [h * 0.24, h * 0.72]) {
      for (const sx of [-1.3, 1.3]) {
        slots.push({ mesh: transformMesh(bevelBoxMesh(0.19, 0.08, 0.275, 0.012), { pos: [sx, dy, 0] }), materialIndex: 3 });
      }
    }
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** Secret false bulkhead (`2.76 x (wallH * 0.92) x 2.76 m`, grounded `y = 0`) with recessed pry seams & forged rings. */
export function buildSecretPushWallNode(
  wallH: number,
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const h = wallH * 0.92;
  const span = 2.76;
  const mats = [
    BZ_PROC_MATERIALS.concreteCoffer,  // 0 chamfered masonry block
    BZ_PROC_MATERIALS.darkSteelBrushed, // 1 recessed pry seam channels & riveted corner straps
    BZ_PROC_MATERIALS.chromeStudio     // 2 forged iron pull rings & anchor escutcheons
  ];
  return multiMatFromMemo(`secret-pushwall-${h.toFixed(2)}`, name, mats, () => {
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(span, h, span, 0.07), { pos: [0, h * 0.5, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(span + 0.03, 0.14, span + 0.03, 0.02), { pos: [0, 0.07, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(span + 0.03, 0.14, span + 0.03, 0.02), { pos: [0, h - 0.07, 0] }), materialIndex: 1 }
    ];
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.22, h - 0.16, 0.22, 0.024), { pos: [cx * (span * 0.5 - 0.08), h * 0.5, cz * (span * 0.5 - 0.08)] }),
          materialIndex: 1
        });
      }
    }
    const ringSpine: [number, number, number, number][] = [
      [-0.08, 0.02, 0, 0.018], [-0.11, -0.07, 0.02, 0.018], [0, -0.13, 0.03, 0.018],
      [0.11, -0.07, 0.02, 0.018], [0.08, 0.02, 0, 0.018]
    ];
    for (let f = 0; f < 4; f += 1) {
      const ry = (f * Math.PI) / 2;
      const faceOut = span * 0.5 + 0.01;
      const ox = Math.sin(ry) * faceOut;
      const oz = Math.cos(ry) * faceOut;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(1.9, h * 0.68, 0.05, 0.012), { pos: [ox * 0.99, h * 0.5, oz * 0.99], rot: [0, ry, 0] }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.2, 0.2, 0.06, 0.012), { pos: [ox, h * 0.46, oz], rot: [0, ry, 0] }),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(tubeSweepMesh(ringSpine, 8), { pos: [ox, h * 0.44, oz], rot: [0, ry, 0] }),
        materialIndex: 2
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** RFID security clearance keycard (`0.62 m` hero span: `lacquer` badge + `studioMetal` gold pad + `practical` LED). */
export function buildClearanceKeycardNode(castShadow: boolean, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.lacquerBadge,    // 0 bevelled crimson clearance card body
    BZ_PROC_MATERIALS.goldBullion,     // 1 embossed gold RFID smart-chip & lanyard ring
    BZ_PROC_MATERIALS.gunmetalBrushed, // 2 top header clamp
    BZ_PROC_MATERIALS.laserAmber       // 3 practical clearance LED strip
  ];
  return multiMatFromMemo("pickup-keycard", name, mats, () => {
    const cardPoly: V2[] = [
      [-0.2, -0.28], [0.16, -0.28], [0.2, -0.24], [0.2, 0.25], [-0.2, 0.25]
    ];
    return [
      { mesh: extrudePolygonMesh(cardPoly, 0.036, 0.008), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.42, 0.085, 0.054, 0.01), { pos: [0, 0.24, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.14, 0.11, 0.048, 0.008), { pos: [-0.075, 0.03, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.22, 0.034, 0.044, 0.005), { pos: [0.03, -0.14, 0] }), materialIndex: 1 },
      {
        mesh: tubeSweepMesh([
          [-0.07, 0.27, 0, 0.014], [-0.05, 0.34, 0, 0.014], [0.05, 0.34, 0, 0.014], [0.07, 0.27, 0, 0.014]
        ], 8),
        materialIndex: 1
      },
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.032, 0.056, 0.006), { pos: [0, 0.16, 0] }), materialIndex: 3 }
    ];
  }, { castShadow, receiveShadow: true });
}

/** Latched bullion case with stacked bevelled trapezoidal ingots (`0.82 m` span, `silver` or `gold`). */
export function buildBullionCaseNode(
  tier: "silver" | "gold",
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.darkSteelBrushed,
    BZ_PROC_MATERIALS.velvetLiner,
    tier === "gold" ? BZ_PROC_MATERIALS.goldBullion : BZ_PROC_MATERIALS.silverBullion,
    BZ_PROC_MATERIALS.brassStudio
  ];
  return multiMatFromMemo(`pickup-bullion-${tier}`, name, mats, () => {
    const ingotRings: V3[][] = [
      [[-0.12, -0.035, -0.055], [0.12, -0.035, -0.055], [0.12, -0.035, 0.055], [-0.12, -0.035, 0.055]],
      [[-0.095, 0.035, -0.042], [0.095, 0.035, -0.042], [0.095, 0.035, 0.042], [-0.095, 0.035, 0.042]]
    ];
    const ingot = loftSectionsMesh(ingotRings, true, true);
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(0.82, 0.16, 0.54, 0.022), { pos: [0, -0.1, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.74, 0.05, 0.46, 0.01), { pos: [0, -0.02, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.82, 0.07, 0.52, 0.018), { pos: [0, 0.17, -0.28], rot: [-0.95, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(ingot, { pos: [-0.17, 0.035, 0.04], rot: [0, 0.08, 0] }), materialIndex: 2 },
      { mesh: transformMesh(ingot, { pos: [0.17, 0.035, 0.04], rot: [0, -0.08, 0] }), materialIndex: 2 },
      { mesh: transformMesh(ingot, { pos: [0, 0.035, -0.1], rot: [0, 0.04, 0] }), materialIndex: 2 },
      { mesh: transformMesh(ingot, { pos: [0, 0.105, 0.0], rot: [0, 0.28, 0] }), materialIndex: 2 }
    ];
    if (tier === "gold") {
      slots.push({ mesh: transformMesh(ingot, { pos: [-0.12, 0.105, -0.06], rot: [0, -0.2, 0] }), materialIndex: 2 });
    }
    for (const lx of [-0.24, 0.24]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.08, 0.07, 0.04, 0.008), { pos: [lx, -0.07, 0.275] }), materialIndex: 3 });
    }
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** Olive-drab steel munition box with `latheMesh` brass cartridge belt (`0.72 m` span). */
export function buildMunitionBoxNode(castShadow: boolean, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.oliveClearcoat,  // 0 ribbed steel M2A1 ammo box
    BZ_PROC_MATERIALS.gunmetalBrushed, // 1 cam latch & top bail handle
    BZ_PROC_MATERIALS.brassStudio,     // 2 revolved brass cartridge cases
    BZ_PROC_MATERIALS.copperStudio,    // 3 copper-jacketed ogive bullets
    BZ_PROC_MATERIALS.hazardClearcoat  // 4 ordnance stencil stripe
  ];
  return multiMatFromMemo("pickup-munition-box", name, mats, () => {
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(0.68, 0.36, 0.34, 0.02), { pos: [0, -0.02, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.72, 0.08, 0.38, 0.016), { pos: [0, 0.19, -0.04], rot: [-0.18, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.46, 0.065, 0.355, 0.008), { pos: [0, 0.01, 0] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.09, 0.14, 0.05, 0.01), { pos: [0.35, 0.08, 0] }), materialIndex: 1 },
      {
        mesh: tubeSweepMesh([
          [-0.14, 0.23, -0.04, 0.012], [-0.12, 0.31, -0.04, 0.012], [0.12, 0.31, -0.04, 0.012], [0.14, 0.23, -0.04, 0.012]
        ], 8),
        materialIndex: 1
      }
    ];
    for (let r = -2; r <= 2; r += 1) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.032, 0.26, 0.355, 0.006), { pos: [r * 0.11, -0.03, 0] }), materialIndex: 0 });
    }
    const caseProf: V2[] = [[0, 0], [0.022, 0], [0.022, 0.095], [0.017, 0.115], [0.017, 0.13]];
    const tipProf: V2[] = [[0.017, 0.13], [0.015, 0.165], [0.008, 0.195], [0, 0.21]];
    const caseMesh = latheMesh(caseProf, 10);
    const tipMesh = latheMesh(tipProf, 10);
    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      const px = -0.18 + t * 0.36;
      const py = 0.18 - t * 0.11;
      const pz = 0.12 + Math.sin(t * Math.PI) * 0.08;
      slots.push({ mesh: transformMesh(caseMesh, { pos: [px, py, pz], rot: [Math.PI * 0.44, 0, -0.15 + t * 0.3] }), materialIndex: 2 });
      slots.push({ mesh: transformMesh(tipMesh, { pos: [px, py, pz], rot: [Math.PI * 0.44, 0, -0.15 + t * 0.3] }), materialIndex: 3 });
    }
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** Contoured ceramic ballistic plate carrier (`0.95 m` height: `loftSectionsMesh` Cordura + `ceramic` SAPI plates). */
export function buildBallisticArmorNode(castShadow: boolean, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.corduraOlive,    // 0 lofted Cordura carrier & cummerbund
    BZ_PROC_MATERIALS.ceramicPlate,    // 1 front/back SAPI ballistic strike plates
    BZ_PROC_MATERIALS.polymerGrip,     // 2 shoulder yokes & MOLLE buckles
    BZ_PROC_MATERIALS.reticleCyan      // 3 tactical IFF identification strip
  ];
  return multiMatFromMemo("pickup-ballistic-armor", name, mats, () => {
    const torsoRings: V3[][] = [
      [[-0.27, -0.34, -0.16], [0.27, -0.34, -0.16], [0.29, -0.34, 0.0], [0.27, -0.34, 0.16], [-0.27, -0.34, 0.16], [-0.29, -0.34, 0.0]],
      [[-0.29, -0.06, -0.18], [0.29, -0.06, -0.18], [0.32, -0.06, 0.0], [0.29, -0.06, 0.18], [-0.29, -0.06, 0.18], [-0.32, -0.06, 0.0]],
      [[-0.24, 0.24, -0.15], [0.24, 0.24, -0.15], [0.25, 0.24, 0.0], [0.24, 0.24, 0.15], [-0.24, 0.24, 0.15], [-0.25, 0.24, 0.0]],
      [[-0.18, 0.36, -0.11], [0.18, 0.36, -0.11], [0.19, 0.36, 0.0], [0.18, 0.36, 0.11], [-0.18, 0.36, 0.11], [-0.19, 0.36, 0.0]]
    ];
    const sapiPoly: V2[] = [[-0.2, -0.26], [0.2, -0.26], [0.2, 0.1], [0.13, 0.25], [-0.13, 0.25], [-0.2, 0.1]];
    const slots: MultiMatSlot[] = [
      { mesh: loftSectionsMesh(torsoRings, true), materialIndex: 0 },
      { mesh: transformMesh(extrudePolygonMesh(sapiPoly, 0.055, 0.012), { pos: [0, -0.01, 0.17] }), materialIndex: 1 },
      { mesh: transformMesh(extrudePolygonMesh(sapiPoly, 0.055, 0.012), { pos: [0, -0.01, -0.17] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.22, 0.036, 0.03, 0.006), { pos: [0, 0.16, 0.205] }), materialIndex: 3 }
    ];
    for (const sx of [-0.16, 0.16]) {
      slots.push({
        mesh: tubeSweepMesh([
          [sx, 0.32, 0.12, 0.036], [sx * 1.05, 0.45, 0.0, 0.038], [sx, 0.32, -0.12, 0.036]
        ], 8),
        materialIndex: 2
      });
    }
    for (let m = 0; m < 3; m += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.36, 0.032, 0.025, 0.005), { pos: [0, -0.18 + m * 0.09, 0.202] }),
        materialIndex: 2
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** Latched enameled trauma medkit / field dressing tin (`0.76 m` or `0.56 m` span, `practical: true` biometric seal LED). */
export function buildMedicalBoxNode(
  variant: "medkit" | "plate",
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const s = variant === "plate" ? 0.74 : 1.0;
  const mats = [
    BZ_PROC_MATERIALS.enamelMedkit,    // 0 bevelled off-white enameled steel trauma case
    BZ_PROC_MATERIALS.oliveClearcoat,  // 1 reinforced olive steel bumper rim & corner guards
    BZ_PROC_MATERIALS.crimsonClearcoat,// 2 embossed crimson medical cross emblem (lid & front)
    BZ_PROC_MATERIALS.brassStudio,     // 3 twin machined brass toggle clasps
    BZ_PROC_MATERIALS.gunmetalBrushed, // 4 tubular steel bail handle
    BZ_PROC_MATERIALS.tritiumGreen     // 5 practical medical readiness seal LED
  ];
  return multiMatFromMemo(`pickup-medbox-${variant}`, name, mats, () => {
    const w = 0.68 * s;
    const h = 0.28 * s;
    const d = 0.46 * s;
    const slots: MultiMatSlot[] = [
      // Lower case shell + hinged domed lid
      { mesh: transformMesh(bevelBoxMesh(w, h * 0.68, d, 0.022 * s), { pos: [0, -h * 0.16, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(w, h * 0.42, d, 0.022 * s), { pos: [0, h * 0.34, 0] }), materialIndex: 0 },
      // Olive steel seam bumper collar & base skids
      { mesh: transformMesh(bevelBoxMesh(w + 0.024 * s, 0.036 * s, d + 0.024 * s, 0.008 * s), { pos: [0, h * 0.14, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(w * 0.86, 0.026 * s, 0.07 * s, 0.006 * s), { pos: [0, -h * 0.51, -d * 0.34] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(w * 0.86, 0.026 * s, 0.07 * s, 0.006 * s), { pos: [0, -h * 0.51, d * 0.34] }), materialIndex: 1 },
      // Embossed crimson cross on top lid
      { mesh: transformMesh(bevelBoxMesh(0.24 * s, 0.024 * s, 0.078 * s, 0.005 * s), { pos: [0, h * 0.56, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.078 * s, 0.024 * s, 0.24 * s, 0.005 * s), { pos: [0, h * 0.56, 0] }), materialIndex: 2 },
      // Embossed crimson cross on front & back faces
      { mesh: transformMesh(bevelBoxMesh(0.16 * s, 0.052 * s, 0.02 * s, 0.004 * s), { pos: [0, -0.02 * s, d * 0.505] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.052 * s, 0.16 * s, 0.02 * s, 0.004 * s), { pos: [0, -0.02 * s, d * 0.505] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.16 * s, 0.052 * s, 0.02 * s, 0.004 * s), { pos: [0, -0.02 * s, -d * 0.505] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.052 * s, 0.16 * s, 0.02 * s, 0.004 * s), { pos: [0, -0.02 * s, -d * 0.505] }), materialIndex: 2 },
      // Twin brass front toggle latches
      { mesh: transformMesh(bevelBoxMesh(0.056 * s, 0.088 * s, 0.032 * s, 0.006 * s), { pos: [-w * 0.28, h * 0.12, d * 0.515] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.056 * s, 0.088 * s, 0.032 * s, 0.006 * s), { pos: [w * 0.28, h * 0.12, d * 0.515] }), materialIndex: 3 },
      // Swept gunmetal carry handle
      {
        mesh: tubeSweepMesh([
          [-0.12 * s, h * 0.14, d * 0.52, 0.012 * s],
          [-0.10 * s, h * 0.14, d * 0.64, 0.012 * s],
          [0.10 * s, h * 0.14, d * 0.64, 0.012 * s],
          [0.12 * s, h * 0.14, d * 0.52, 0.012 * s]
        ], 8),
        materialIndex: 4
      },
      // Practical emerald seal indicator
      { mesh: transformMesh(bevelBoxMesh(0.09 * s, 0.022 * s, 0.022 * s, 0.004 * s), { pos: [0, h * 0.36, d * 0.51] }), materialIndex: 5 }
    ];
    return slots;
  }, { castShadow, receiveShadow: true });
}

/** Cast-iron & brass oval caged bulkhead lamp (`height` span along `Y`, wall flange at `-Z`, globe & cage facing `+Z`). */
export function buildBulkheadLampNode(height = 0.5, name = "bulkhead lamp"): AuraNodeBuilder<AuraGroupNode> {
  const k = height / 0.5;
  const mats = [
    BZ_PROC_MATERIALS.darkSteelBrushed, // 0 oval cast-iron wall flange & top conduit gland
    BZ_PROC_MATERIALS.brassStudio,      // 1 machined brass bezel ring & 4 dog-ear lugs
    BZ_PROC_MATERIALS.visorGlass,       // 2 ribbed frosted-amber glass diffuser dome
    BZ_PROC_MATERIALS.laserAmber,       // 3 practical warm tungsten filament core
    BZ_PROC_MATERIALS.gunmetalBrushed   // 4 curved cross-wire protective cage
  ];
  return multiMatFromMemo(`prop-bulkhead-lamp-${height.toFixed(2)}`, name, mats, () => {
    const ovalPoly: V2[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      ovalPoly.push([Math.cos(a) * 0.155 * k, Math.sin(a) * 0.235 * k]);
    }
    const domeProf: V2[] = [
      [0.118 * k, 0], [0.122 * k, 0.035 * k], [0.104 * k, 0.082 * k], [0.064 * k, 0.118 * k], [0, 0.132 * k]
    ];
    const bezelProf: V2[] = [
      [0.112 * k, -0.015 * k], [0.138 * k, -0.012 * k], [0.138 * k, 0.022 * k], [0.116 * k, 0.028 * k]
    ];
    const slots: MultiMatSlot[] = [
      // Cast-iron wall mounting plate at `-Z` + top/bottom conduit gland bosses
      { mesh: transformMesh(extrudePolygonMesh(ovalPoly, 0.036 * k, 0.008 * k, true), { pos: [0, 0, -0.04 * k] }), materialIndex: 0 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.034 * k, 0], [0.034 * k, 0.055 * k], [0.024 * k, 0.07 * k]], 10), { pos: [0, 0.21 * k, -0.035 * k] }), materialIndex: 0 },
      // Brass bezel ring + 4 wing-nut clamp lugs (stretched 1.35x along Y for oval bulkhead silhouette)
      { mesh: transformMesh(latheMesh(bezelProf, 18), { pos: [0, 0, -0.015 * k], rot: [Math.PI * 0.5, 0, 0], scale: [1, 1.38, 1] }), materialIndex: 1 },
      // Ribbed glass diffuser dome + warm practical filament core
      { mesh: transformMesh(latheMesh(domeProf, 16), { pos: [0, 0, -0.01 * k], rot: [Math.PI * 0.5, 0, 0], scale: [1, 1.36, 1] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.056 * k, 0.13 * k, 0.048 * k, 0.012 * k), { pos: [0, 0, 0.038 * k] }), materialIndex: 3 }
    ];
    for (const [lx, ly] of [[-0.135, 0.1], [0.135, 0.1], [-0.135, -0.1], [0.135, -0.1]] as const) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028 * k, 0.028 * k, 0.036 * k, 0.005 * k), { pos: [lx * k, ly * k, 0.005 * k] }),
        materialIndex: 1
      });
    }
    // Protective wire guard arches (vertical + 2 horizontal ribs)
    slots.push({
      mesh: tubeSweepMesh([
        [0, -0.195 * k, 0.002 * k, 0.0075 * k], [0, -0.12 * k, 0.132 * k, 0.0075 * k],
        [0, 0.0, 0.155 * k, 0.0075 * k], [0, 0.12 * k, 0.132 * k, 0.0075 * k], [0, 0.195 * k, 0.002 * k, 0.0075 * k]
      ], 7),
      materialIndex: 4
    });
    for (const wy of [-0.075, 0.075]) {
      slots.push({
        mesh: tubeSweepMesh([
          [-0.132 * k, wy * k, 0.002 * k, 0.007 * k], [-0.08 * k, wy * k, 0.125 * k, 0.007 * k],
          [0, wy * k, 0.148 * k, 0.007 * k], [0.08 * k, wy * k, 0.125 * k, 0.007 * k], [0.132 * k, wy * k, 0.002 * k, 0.007 * k]
        ], 7),
        materialIndex: 4
      });
    }
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

/** Corrugated steel elevator roller-shutter door (`width ~ 2.08 m`, grounded `y in [0, height]`, faces `+Z`). */
export function buildShutterDoorNode(
  height: number,
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const h = Math.max(1.6, height);
  const mats = [
    BZ_PROC_MATERIALS.oliveClearcoat,   // 0 overhead cylindrical drum housing & side guide channels
    BZ_PROC_MATERIALS.darkSteelBrushed, // 1 interlocking corrugated steel roller slats & floor sill
    BZ_PROC_MATERIALS.hazardClearcoat,  // 2 heavy bottom locking bar & caution chevrons
    BZ_PROC_MATERIALS.brassStudio,      // 3 key-switch elevator callbox & manual handles
    BZ_PROC_MATERIALS.tritiumGreen      // 4 practical elevator status indicator
  ];
  return multiMatFromMemo(`world-shutter-door-${h.toFixed(2)}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Grounded threshold plate (`y in [0, 0.05]`, `minY = 0`) + twin vertical steel U-channel tracks (`y in [0, h - 0.24]`)
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.12, 0.05, 0.22, 0.008), { pos: [0, 0.025, 0] }), materialIndex: 1 });
    const trackH = h - 0.22;
    for (const tx of [-0.98, 0.98]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.12, trackH, 0.18, 0.016), { pos: [tx, trackH * 0.5, 0.01] }), materialIndex: 0 });
    }
    // Overhead rolled shutter drum hood (`latheMesh` cylinder along X at `y = h - 0.14`, top at `h`)
    const drumProf: V2[] = [[0, -1.06], [0.14, -1.06], [0.14, 1.06], [0, 1.06]];
    slots.push({
      mesh: transformMesh(latheMesh(drumProf, 16), { pos: [0, h - 0.14, 0.04], rot: [0, 0, -Math.PI * 0.5] }),
      materialIndex: 0
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.14, 0.08, 0.24, 0.012), { pos: [0, h - 0.25, 0.03] }), materialIndex: 0 });
    // Hazard-yellow bottom slam/locking bar (`y = 0.10`)
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.86, 0.11, 0.11, 0.014), { pos: [0, 0.105, 0.01] }), materialIndex: 2 });
    // Corrugated horizontal interlocking steel slats (`y from 0.18 to h - 0.30`)
    const slatBottom = 0.17;
    const slatTop = h - 0.29;
    const slatCount = 13;
    const slatStep = (slatTop - slatBottom) / slatCount;
    for (let i = 0; i < slatCount; i += 1) {
      const sy = slatBottom + (i + 0.5) * slatStep;
      const zJit = i % 2 === 0 ? 0.006 : -0.006;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(1.86, slatStep * 0.92, 0.075, 0.01), { pos: [0, sy, zJit], rot: [0.08, 0, 0] }),
        materialIndex: 1
      });
    }
    // Twin manual lift handles + right-jamb armored brass elevator callbox + practical status lens
    for (const hx of [-0.36, 0.36]) {
      slots.push({
        mesh: tubeSweepMesh([
          [hx - 0.09, 0.28, 0.045, 0.01], [hx - 0.07, 0.28, 0.09, 0.01],
          [hx + 0.07, 0.28, 0.09, 0.01], [hx + 0.09, 0.28, 0.045, 0.01]
        ], 6),
        materialIndex: 3
      });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.24, 0.09, 0.012), { pos: [0.99, 1.15, 0.11] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.056, 0.056, 0.03, 0.006), { pos: [0.99, 1.21, 0.152] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.036, 0.03, 0.006), { pos: [0, h - 0.25, 0.15] }), materialIndex: 4 });
    return slots;
  }, { castShadow, receiveShadow: true });
}

function hazardDrumSlots(): readonly MultiMatSlot[] {
  const segs = 24;
  // Watertight Y-partitioned lathe sections (zero overlapping concentric sleeves, zero stretched UV stripes):
  // Slot 0: clean crimson lacquer body sections + recessed circular top head
  // Slot 1: dark brushed-steel grounded bottom chime, twin proud rolling hoops & top rolled chime rim
  // Slot 2: crisp geometric hazard band ring (`y = 0.548..0.702`) on its own lathed band
  // Slot 3: top brass bung cap, breather plug & swept grab handle lug
  const bungProf: V2[] = [
    [0.064, 0], [0.064, 0.014], [0.048, 0.018], [0.048, 0.042], [0.036, 0.048], [0, 0.048]
  ];
  const bungMesh = latheMesh(bungProf, 8, true);
  return [
    { mesh: latheMesh([[0.416, 0.072], [0.42, 0.225], [0.416, 0.378]], segs), materialIndex: 0 },
    { mesh: latheMesh([[0.416, 0.456], [0.418, 0.502], [0.416, 0.548]], segs), materialIndex: 0 },
    { mesh: latheMesh([[0.416, 0.702], [0.418, 0.748], [0.416, 0.794]], segs), materialIndex: 0 },
    { mesh: latheMesh([[0.416, 0.872], [0.42, 1.025], [0.416, 1.178]], segs), materialIndex: 0 },
    { mesh: latheMesh([[0.392, 1.214], [0.21, 1.216], [0, 1.216]], segs), materialIndex: 0 },
    { mesh: latheMesh([[0, 0.0], [0.422, 0.0], [0.448, 0.016], [0.448, 0.056], [0.416, 0.072]], segs), materialIndex: 1 },
    { mesh: latheMesh([[0.416, 0.378], [0.454, 0.398], [0.456, 0.417], [0.454, 0.436], [0.416, 0.456]], segs), materialIndex: 1 },
    { mesh: latheMesh([[0.416, 0.794], [0.454, 0.814], [0.456, 0.833], [0.454, 0.852], [0.416, 0.872]], segs), materialIndex: 1 },
    { mesh: latheMesh([[0.416, 1.178], [0.448, 1.194], [0.448, 1.242], [0.422, 1.25], [0.394, 1.246], [0.392, 1.214]], segs), materialIndex: 1 },
    { mesh: latheMesh([[0.416, 0.548], [0.426, 0.558], [0.426, 0.692], [0.416, 0.702]], segs), materialIndex: 2 },
    { mesh: transformMesh(bungMesh, { pos: [0.19, 1.214, 0.08] }), materialIndex: 3 },
    { mesh: transformMesh(bungMesh, { pos: [-0.16, 1.214, -0.09], scale: 0.68 }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.044, 0.022, 0.044, 0.005), { pos: [-0.085, 1.222, 0.16] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.044, 0.022, 0.044, 0.005), { pos: [0.085, 1.222, 0.16] }), materialIndex: 3 },
    {
      mesh: tubeSweepMesh([
        [-0.085, 1.218, 0.16, 0.013], [-0.07, 1.262, 0.16, 0.013],
        [0.07, 1.262, 0.16, 0.013], [0.085, 1.218, 0.16, 0.013]
      ], 8),
      materialIndex: 3
    }
  ];
}

/** Ribbed 55-gallon crimson explosive drum (`1.25 m` tall, grounded `y in [0, 1.25]`: watertight `latheMesh` hoops, hazard band & brass bung/lug). */
export function buildHazardDrumNode(castShadow: boolean, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.crimsonDrumLacquer, // 0 crimson lacquer drum body & recessed top head
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 1 dark steel chimes & twin rolling hoops
    BZ_PROC_MATERIALS.hazardDrumBand,     // 2 crisp geometric hazard band ring
    BZ_PROC_MATERIALS.brassStudio         // 3 top brass bung cap, vent plug & handle lug
  ];
  return multiMatFromMemo("prop-hazard-drum", name, mats, hazardDrumSlots, { castShadow, receiveShadow: true });
}

/** Batched per-floor explosive barrel `instances.custom` material pools (`clearcoat: 0`, 4 draws per floor regardless of barrel count). */
export function buildHazardDrumPoolNodes(
  namePrefix: string,
  transforms: readonly AuraTransformSpec[],
  castShadow: boolean
): readonly AuraNodeBuilder<AuraPrimitiveNode>[] {
  const poolMats: readonly AuraMaterialSpec[] = [
    material.pbr({ color: "#a82419", roughness: 0.34, metalness: 0.14, clearcoat: 0 }),
    material.metal({ color: "#21262e", roughness: 0.34, metallic: 0.88, clearcoat: 0 }),
    material.pbr({ color: "#d89e18", roughness: 0.32, metalness: 0.14, clearcoat: 0 }),
    material.metal({ color: "#d8aa48", roughness: 0.24, metallic: 0.92, clearcoat: 0 })
  ];
  const allSlots = hazardDrumSlots();
  return poolMats.map((mat, matIdx) => {
    const spec = memoMergedSpec(`pool-hazard-drum-${matIdx}`, () =>
      allSlots.filter((s) => s.materialIndex === matIdx).map((s) => s.mesh)
    );
    return instances.custom(spec, {
      name: `${namePrefix} slot ${matIdx}`,
      transforms,
      castShadow,
      receiveShadow: true,
      material: mat
    });
  });
}

function militaryCrateSlots(): readonly MultiMatSlot[] {
  const s = 1.12;
  const h = 1.15;
  const slots: MultiMatSlot[] = [
    // Forklift skids (`y in [0, 0.09]`) + main timber core + proud perimeter stiles
    { mesh: transformMesh(bevelBoxMesh(s, 0.09, 0.18, 0.015), { pos: [0, 0.045, -0.36] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(s, 0.09, 0.18, 0.015), { pos: [0, 0.045, 0.36] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(s - 0.08, h - 0.09, s - 0.08, 0.025), { pos: [0, 0.09 + (h - 0.09) * 0.5, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(s, 0.11, s, 0.02), { pos: [0, 0.145, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(s, 0.11, s, 0.02), { pos: [0, h - 0.055, 0] }), materialIndex: 0 }
  ];
  const half = s * 0.5 - 0.055;
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, h - 0.1, 0.11, 0.016), { pos: [cx * half, 0.09 + (h - 0.1) * 0.5, cz * half] }), materialIndex: 0 });
      for (const cy of [0.16, h - 0.07]) {
        slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.18, 0.18, 0.018), { pos: [cx * (s * 0.5 - 0.06), cy, cz * (s * 0.5 - 0.06)] }), materialIndex: 1 });
      }
    }
  }
  for (let f = 0; f < 4; f += 1) {
    const ry = (f * Math.PI) / 2;
    const dist = s * 0.5 - 0.02;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.96, 0.1, 0.05, 0.01), { pos: [Math.sin(ry) * dist, 0.62, Math.cos(ry) * dist], rot: [0, ry, 0.72] }),
      materialIndex: 0
    });
  }
  for (const sx of [-0.3, 0.3]) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.055, h - 0.07, s + 0.03, 0.008), { pos: [sx, 0.09 + (h - 0.07) * 0.5, 0] }),
      materialIndex: 2
    });
  }
  return slots;
}

/** Steel-strapped military ordnance crate (`1.15 m` tall, grounded `y in [0, 1.15]`). */
export function buildMilitaryCrateNode(castShadow: boolean, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.timberOrdnance,   // 0 recessed timber coffer & diagonal Z-battens
    BZ_PROC_MATERIALS.darkSteelBrushed, // 1 bolted corner brackets & forklift skids
    BZ_PROC_MATERIALS.chromeStudio      // 2 tensioned steel strapping bands
  ];
  return multiMatFromMemo("prop-military-crate", name, mats, militaryCrateSlots, { castShadow, receiveShadow: true });
}

/** Batched per-floor military crate `instances.custom` material pools (`clearcoat: 0`, 3 draws per floor regardless of crate count). */
export function buildMilitaryCratePoolNodes(
  namePrefix: string,
  transforms: readonly AuraTransformSpec[],
  castShadow: boolean
): readonly AuraNodeBuilder<AuraPrimitiveNode>[] {
  const poolMats: readonly AuraMaterialSpec[] = [
    material.pbr({ color: "#6c5338", roughness: 0.8, metalness: 0.03, clearcoat: 0 }),
    material.metal({ color: "#21262e", roughness: 0.34, metallic: 0.88, clearcoat: 0 }),
    material.metal({ color: "#adb6c2", roughness: 0.24, metallic: 0.92, clearcoat: 0 })
  ];
  const allSlots = militaryCrateSlots();
  return poolMats.map((mat, matIdx) => {
    const spec = memoMergedSpec(`pool-military-crate-${matIdx}`, () =>
      allSlots.filter((s) => s.materialIndex === matIdx).map((s) => s.mesh)
    );
    return instances.custom(spec, {
      name: `${namePrefix} slot ${matIdx}`,
      transforms,
      castShadow,
      receiveShadow: true,
      material: mat
    });
  });
}

/** Autonomous shrouded-rotor tactical security patrol drone (`0.96 m` wingspan, nose & HUD scanner eye facing `+Z`). */
export function buildPatrolDroneNode(castShadow = false, name = "patrol drone"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 streamlined stealth aero-fuselage & dorsal carapace
    BZ_PROC_MATERIALS.gunmetalBrushed,    // 1 shrouded ducted-fan nacelles, outrigger booms & ventral turret
    BZ_PROC_MATERIALS.hazardClearcoat,    // 2 bevelled wingtip caution chevrons
    BZ_PROC_MATERIALS.chromeStudio,       // 3 rotor spinner hubs, micro-gun barrel & telemetry antennas
    BZ_PROC_MATERIALS.visorCrimson,       // 4 gimbaled optical scanner eye (`+Z`)
    BZ_PROC_MATERIALS.reticleCyan         // 5 ducted-fan HUD thruster glow rings & dorsal status bar
  ];
  return assembleMultiMaterialNode(name, [
    // Streamlined smooth-sculpted central aero-pod (`sculptStreamlinedHullMesh` rotated so length runs along Z)
    {
      mesh: transformMesh(
        subdivideSmoothMesh(
          sculptStreamlinedHullMesh(0.68, 0.34, 0.2, {
            noseSharpness: 1.35,
            tailTaper: 0.42,
            canopyBulge: 0.24,
            undersideFlat: 0.32,
            stations: 12,
            ringPoints: 12
          }),
          1,
          0.46
        ),
        { rot: [0, -Math.PI * 0.5, 0] }
      ),
      materialIndex: 0
    },
    // Bevelled dorsal sensor spine & ventral gimbaled optic turret pod
    { mesh: transformMesh(bevelBoxMesh(0.14, 0.055, 0.36, 0.012), { pos: [0, 0.105, -0.02] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.016, 0.22, 0.004), { pos: [0, 0.134, -0.02] }), materialIndex: 5 },
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.16, 0.13, 0.18, 0.028), 1, 0.48), { pos: [0, -0.105, 0.12] }),
      materialIndex: 1
    },
    // Glowing crimson optical scanner eye + underslung micro-carbine barrel (`+Z`)
    { mesh: transformMesh(bevelBoxMesh(0.11, 0.044, 0.045, 0.008), { pos: [0, -0.1, 0.205] }), materialIndex: 4 },
    {
      mesh: transformMesh(latheMesh([[0.011, 0], [0.012, 0.16], [0.016, 0.17], [0.008, 0.18]], 10), {
        pos: [0, -0.145, 0.16],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 3
    },
    // Swept outrigger booms + shrouded ducted-fan rotor nacelles on left & right flanks
    ...([-1, 1] as const).flatMap((sx): MultiMatSlot[] => [
      {
        mesh: transformMesh(bevelBoxMesh(0.24, 0.042, 0.11, 0.009), { pos: [sx * 0.22, 0.015, -0.01], rot: [0, sx * -0.14, sx * -0.08] }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(latheMesh([[0.115, -0.048], [0.148, -0.042], [0.152, 0.042], [0.115, 0.048], [0.115, -0.048]], 16), {
          pos: [sx * 0.36, 0.02, -0.02],
          rot: [0.12, 0, sx * -0.08]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(latheMesh([[0, -0.02], [0.036, -0.02], [0.024, 0.038], [0, 0.044]], 10), {
          pos: [sx * 0.36, 0.02, -0.02]
        }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(latheMesh([[0.098, -0.014], [0.116, -0.014], [0.116, 0.014], [0.098, 0.014]], 14), {
          pos: [sx * 0.36, -0.018, -0.02]
        }),
        materialIndex: 5
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.032, 0.056, 0.15, 0.006), { pos: [sx * 0.505, 0.024, -0.02] }),
        materialIndex: 2
      }
    ]),
    // Twin swept rear telemetry whip antennas
    {
      mesh: tubeSweepMesh([[-0.055, 0.11, -0.2, 0.007], [-0.08, 0.24, -0.3, 0.0045], [-0.095, 0.34, -0.38, 0.0025]], 6),
      materialIndex: 3
    },
    {
      mesh: tubeSweepMesh([[0.055, 0.11, -0.2, 0.007], [0.08, 0.24, -0.3, 0.0045], [0.095, 0.34, -0.38, 0.0025]], 6),
      materialIndex: 3
    }
  ], mats, { castShadow, receiveShadow: true });
}

/** Pressurized cryo containment canister (`y in [0, 1.38]`, `0.68 m` span: lathed domes, cage struts, frosted cyan core & manifold). */
export function buildCryoCanisterNode(castShadow = false, name = "cryo canister"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.darkSteelBrushed, // 0 heavy grounded base ring, upper collar & 4 protective cage struts
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 upper & lower hemispherical pressure domes
    BZ_PROC_MATERIALS.cryoCoreCyan,     // 2 glowing frosted cryo containment core column & HUD gauge face
    BZ_PROC_MATERIALS.visorGlass,       // 3 armored outer cryo sight-glass sleeve
    BZ_PROC_MATERIALS.brassStudio,      // 4 top manifold neck, pressure gauge bezel & bleed valve
    BZ_PROC_MATERIALS.crimsonClearcoat  // 5 spoked emergency shutoff handwheel
  ];
  const baseProf: V2[] = [[0, 0], [0.33, 0], [0.34, 0.045], [0.3, 0.09], [0.26, 0.14]];
  const lowerDomeProf: V2[] = [[0, 0.12], [0.24, 0.14], [0.275, 0.24], [0.275, 0.36], [0.22, 0.38]];
  const upperDomeProf: V2[] = [[0.22, 0.94], [0.275, 0.96], [0.275, 1.08], [0.21, 1.18], [0.09, 1.24], [0, 1.25]];
  const coreProf: V2[] = [[0, 0.36], [0.175, 0.37], [0.178, 0.95], [0, 0.96]];
  const glassProf: V2[] = [[0.205, 0.37], [0.222, 0.38], [0.222, 0.94], [0.205, 0.95]];
  const wheelRim: V2[] = [[0.085, -0.012], [0.112, -0.012], [0.112, 0.012], [0.085, 0.012], [0.085, -0.012]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(baseProf, 18), materialIndex: 0 },
    { mesh: latheMesh(lowerDomeProf, 18), materialIndex: 1 },
    { mesh: latheMesh(upperDomeProf, 18), materialIndex: 1 },
    { mesh: latheMesh(coreProf, 16), materialIndex: 2 },
    { mesh: latheMesh(glassProf, 16), materialIndex: 3 },
    // Top brass manifold stem + forward-facing pressure gauge dial (`+Z`) + crimson shutoff handwheel
    { mesh: latheMesh([[0, 1.24], [0.068, 1.24], [0.068, 1.33], [0.048, 1.35], [0, 1.35]], 12), materialIndex: 4 },
    { mesh: transformMesh(latheMesh([[0, -0.018], [0.052, -0.018], [0.052, 0.018], [0, 0.018]], 12), { pos: [0, 1.12, 0.235], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.068, 0.012, 0.003), { pos: [0, 1.12, 0.252] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh(wheelRim, 14), { pos: [0, 1.368, 0] }), materialIndex: 5 },
    { mesh: transformMesh(bevelBoxMesh(0.21, 0.018, 0.018, 0.003), { pos: [0, 1.368, 0] }), materialIndex: 5 },
    { mesh: transformMesh(bevelBoxMesh(0.018, 0.018, 0.21, 0.003), { pos: [0, 1.368, 0] }), materialIndex: 5 }
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    slots.push({
      mesh: tubeSweepMesh([
        [cx * 0.285, 0.08, cz * 0.285, 0.022],
        [cx * 0.305, 0.36, cz * 0.305, 0.02],
        [cx * 0.305, 0.96, cz * 0.305, 0.02],
        [cx * 0.255, 1.14, cz * 0.255, 0.018]
      ], 7),
      materialIndex: 0
    });
  }
  return assembleMultiMaterialNode(name, slots, mats, { castShadow, receiveShadow: true });
}

/** Angled tactical bunker command console (`y in [0, 1.32]`, `1.32 m` wide x `0.56 m` deep, operator side facing `+Z`). */
export function buildCommandConsoleNode(castShadow = false, name = "command console"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.consoleSlate,     // 0 bevelled sloped tactical pedestal & upper hood shroud
    BZ_PROC_MATERIALS.gunmetalBrushed,  // 1 raked control deck, screen bezels & side cheek frames
    BZ_PROC_MATERIALS.hazardClearcoat,  // 2 recessed lower kick-plate caution bar
    BZ_PROC_MATERIALS.chromeStudio,     // 3 twin physical throttle levers & rotary encoder dials
    BZ_PROC_MATERIALS.reticleCyan,      // 4 tri-panel glowing cyan HUD radar/telemetry screens
    BZ_PROC_MATERIALS.tritiumGreen,     // 5 illuminated tactical key-matrix pads
    BZ_PROC_MATERIALS.laserAmber        // 6 alert waveform & status indicator bar
  ];
  const cheekPoly: V2[] = [[-0.26, 0], [0.24, 0], [0.26, 0.74], [0.06, 0.92], [-0.14, 1.28], [-0.26, 1.24]];
  const cheek = extrudePolygonMesh(cheekPoly, 0.06, 0.012, true);
  const slots: MultiMatSlot[] = [
    // Grounded base plinth (`minY = 0`) + sloped cabinet body + twin side armor cheeks
    { mesh: transformMesh(bevelBoxMesh(1.32, 0.09, 0.54, 0.016), { pos: [0, 0.045, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(1.16, 0.055, 0.03, 0.006), { pos: [0, 0.12, 0.258] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(1.2, 0.76, 0.44, 0.024), { pos: [0, 0.46, -0.02] }), materialIndex: 0 },
    { mesh: transformMesh(cheek, { pos: [-0.62, 0, 0], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 1 },
    { mesh: transformMesh(cheek, { pos: [0.62, 0, 0], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 1 },
    // Raked ergonomic operator keyboard/control deck (`y ~ 0.84`) + illuminated tactile key-matrix + throttles
    { mesh: transformMesh(bevelBoxMesh(1.22, 0.075, 0.34, 0.014), { pos: [0, 0.84, 0.09], rot: [0.28, 0, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.52, 0.022, 0.16, 0.004), { pos: [-0.16, 0.878, 0.11], rot: [0.28, 0, 0] }), materialIndex: 5 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.022, 0.14, 0.004), { pos: [0.34, 0.878, 0.11], rot: [0.28, 0, 0] }), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(0.028, 0.11, 0.028, 0.005), { pos: [0.3, 0.93, 0.08], rot: [0.42, 0, 0] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.078, 0.028, 0.032, 0.006), { pos: [0.3, 0.98, 0.1], rot: [0.42, 0, 0] }), materialIndex: 3 },
    // Upper anti-glare display hood + 3 angled wrap-around HUD tactical monitors (`y ~ 1.08`)
    { mesh: transformMesh(bevelBoxMesh(1.24, 0.38, 0.22, 0.018), { pos: [0, 1.09, -0.11], rot: [-0.2, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.5, 0.27, 0.024, 0.005), { pos: [0, 1.09, -0.005], rot: [-0.2, 0, 0] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.31, 0.25, 0.024, 0.005), { pos: [-0.41, 1.08, 0.03], rot: [-0.2, 0.24, 0] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.31, 0.25, 0.024, 0.005), { pos: [0.41, 1.08, 0.03], rot: [-0.2, -0.24, 0] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.46, 0.032, 0.026, 0.004), { pos: [0, 1.245, -0.032], rot: [-0.2, 0, 0] }), materialIndex: 6 }
  ];
  return assembleMultiMaterialNode(name, slots, mats, { castShadow, receiveShadow: true });
}

// ---------------------------------------------------------------------------
// 3. Projectiles, Muzzle Starburst, Enemy Armor Overrides & Optic Visors
// ---------------------------------------------------------------------------

/** Fin-stabilized ogive rocket warhead (`0.55 m` along `Z`: nose at `+Z`, fins & `practical` thruster at `-Z`). */
export function buildRocketWarheadNode(name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.oliveClearcoat,  // 0 ogive warhead body
    BZ_PROC_MATERIALS.brassStudio,     // 1 seeker collar ring
    BZ_PROC_MATERIALS.gunmetalBrushed, // 2 cruciform tail fins & Venturi nozzle
    BZ_PROC_MATERIALS.thrusterFlame    // 3 practical rocket motor core
  ];
  return multiMatFromMemo("proj-rocket-warhead", name, mats, () => {
    // Revolved along +Y from -0.275 to +0.275, then rotated +PI/2 around X so +Y -> +Z
    const bodyProf: V2[] = [
      [0.032, -0.23], [0.048, -0.18], [0.048, 0.08], [0.042, 0.16], [0.024, 0.235], [0, 0.275]
    ];
    const collarProf: V2[] = [[0.047, 0.04], [0.052, 0.045], [0.052, 0.085], [0.047, 0.09]];
    const nozzleProf: V2[] = [[0.044, -0.275], [0.03, -0.23], [0.048, -0.19], [0, -0.19]];
    const flameProf: V2[] = [[0, -0.295], [0.036, -0.265], [0.022, -0.225], [0, -0.225]];
    const finPoly: V2[] = [[0.042, -0.265], [0.115, -0.275], [0.095, -0.195], [0.044, -0.145]];
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(latheMesh(bodyProf, 14), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(latheMesh(collarProf, 14), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh(nozzleProf, 12), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(latheMesh(flameProf, 10), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 3 }
    ];
    for (let f = 0; f < 4; f += 1) {
      const fin = extrudePolygonMesh(finPoly, 0.01, 0.002, true);
      slots.push({
        mesh: transformMesh(transformMesh(fin, { rot: [Math.PI * 0.5, 0, 0] }), { rot: [0, 0, (f * Math.PI) / 2] }),
        materialIndex: 2
      });
    }
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

/** Sleek aerodynamic supersonic tracer dart (`Z in [-0.5, +0.5]`, `practical: true` emissive capped `<= 0.45`). */
export function buildBallisticTracerNode(name: string, isEnemy: boolean): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("proj-ballistic-tracer", () => {
    const prof: V2[] = [[0, -0.5], [0.24, -0.36], [0.46, 0.08], [0.28, 0.36], [0, 0.5]];
    return [transformMesh(latheMesh(prof, 10), { rot: [Math.PI * 0.5, 0, 0] })];
  });
  return geometry.custom(spec, {
    name,
    position: [0, -50, 0],
    castShadow: false,
    receiveShadow: false,
    material: material.emissive({
      color: isEnemy ? "#ffd99a" : "#ffe9ab",
      emissive: isEnemy ? "#eb7c22" : "#f09e24",
      emissiveIntensity: isEnemy ? 0.44 : 0.4,
      roughness: 0.24,
      practical: true
    })
  });
}

/** Star-fin 3-axis plasma muzzle flash (`0.26 m` span, `practical: true` dual-core emissive `<= 0.45`). */
export function buildMuzzleStarburstNode(name = "muzzle flash"): AuraNodeBuilder<AuraGroupNode> {
  const starPoly: V2[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.13 : 0.044;
    starPoly.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const fin = extrudePolygonMesh(starPoly, 0.01, 0.002, true);
  const slots: MultiMatSlot[] = [
    { mesh: fin, materialIndex: 0 },
    { mesh: transformMesh(fin, { rot: [0, Math.PI * 0.5, 0.26] }), materialIndex: 0 },
    { mesh: transformMesh(fin, { rot: [Math.PI * 0.5, 0, -0.26], scale: 0.84 }), materialIndex: 1 }
  ];
  return assembleMultiMaterialNode(
    name,
    slots,
    [BZ_PROC_MATERIALS.thrusterFlame, BZ_PROC_MATERIALS.muzzleCore],
    { castShadow: false, receiveShadow: false }
  );
}

/** Skinned enemy armor material overrides (`colorMode: "multiply"` tames lifted GLB maps so tactical armor & rifle silhouette read crisply). */
export function enemyMaterialOverrides(kind: BunkerEnemyKind) {
  switch (kind) {
    case "boss":
      return [{
        color: "#9da6b0",
        colorMode: "multiply" as const,
        roughness: 0.38,
        metallic: 0.56,
        rim: { color: "#c98b55", power: 3.4, intensity: 0.3 }
      }];
    case "gunner":
      return [{
        color: "#96a0aa",
        colorMode: "multiply" as const,
        roughness: 0.44,
        metallic: 0.48,
        rim: { color: "#789ab8", power: 3.5, intensity: 0.26 }
      }];
    case "dog":
      return [{
        color: "#a29d96",
        colorMode: "multiply" as const,
        roughness: 0.5,
        metallic: 0.32,
        rim: { color: "#b58969", power: 3.6, intensity: 0.22 }
      }];
    default:
      return [{
        color: "#9aa4ae",
        colorMode: "multiply" as const,
        roughness: 0.48,
        metallic: 0.42,
        rim: { color: "#6f8ba6", power: 3.6, intensity: 0.24 }
      }];
  }
}

/** Sculpted dark-steel tactical brow cowl + side coms pods + recessed `practical: true` (`<= 0.45`) optic visor slit facing `+Z`. */
export function buildEnemyOpticVisorNode(kind: BunkerEnemyKind, name: string): AuraNodeBuilder<AuraGroupNode> {
  const w = kind === "boss" ? 0.34 : kind === "dog" ? 0.17 : 0.23;
  const h = kind === "boss" ? 0.052 : 0.034;
  const zFwd = kind === "boss" ? 0.23 : kind === "dog" ? 0.31 : 0.165;
  const opticMat = kind === "boss"
    ? BZ_PROC_MATERIALS.thrusterFlame
    : kind === "gunner"
      ? BZ_PROC_MATERIALS.laserAmber
      : BZ_PROC_MATERIALS.reticleCyan;
  return multiMatFromMemo(`enemy-visor-${kind}`, name, [
    BZ_PROC_MATERIALS.darkSteelBrushed,
    BZ_PROC_MATERIALS.gunmetalBrushed,
    opticMat
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(w * 1.18, h * 1.05, 0.11, 0.01), { pos: [0, h * 0.72, zFwd - 0.008], rot: [0.16, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.22, h * 1.7, 0.095, 0.008), { pos: [-w * 0.58, 0.004, zFwd - 0.02] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.22, h * 1.7, 0.095, 0.008), { pos: [w * 0.58, 0.004, zFwd - 0.02] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(w * 1.06, h * 0.48, 0.08, 0.006), { pos: [0, -h * 0.62, zFwd - 0.012] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.94, h, 0.048, 0.006), { pos: [0, 0, zFwd + 0.004] }), materialIndex: 2 }
  ], { castShadow: false, receiveShadow: false });
}

// ---------------------------------------------------------------------------
// 3b. Sculpted, Multi-Material, Hierarchically Articulated Tactical Enemy Rigs
//     (`minY = 0` grounded at boot soles / mechanical paws, forward = `+Z`,
//      `"ZYX"` Euler joint pivots with deterministic zero-drift pose solver)
// ---------------------------------------------------------------------------

export const ENEMY_RIG_PARTS = ["body", "rig", "torso", "head", "armL", "armR", "legL", "legR", "spec"] as const;
export type EnemyRigPart = (typeof ENEMY_RIG_PARTS)[number];

export interface EnemyRigIds {
  readonly body: string;
  readonly rig: string;
  readonly torso: string;
  readonly head: string;
  readonly armL: string;
  readonly armR: string;
  readonly legL: string;
  readonly legR: string;
  readonly spec: string;
}

export function makeEnemyRigIds(bodyId: string): EnemyRigIds {
  return {
    body: bodyId,
    rig: `${bodyId}-rig`,
    torso: `${bodyId}-torso`,
    head: `${bodyId}-head`,
    armL: `${bodyId}-armL`,
    armR: `${bodyId}-armR`,
    legL: `${bodyId}-legL`,
    legR: `${bodyId}-legR`,
    spec: `${bodyId}-spec`
  };
}

export type EnemyRuntimeBinder = (
  partId: string,
  part: EnemyRigPart
) => ReturnType<typeof game.runtimeNode>;

function ellipticalRings(profile: readonly [number, number, number, number?][], segs = 20, foldFreq = 4, foldAmp = 0.032): V3[][] {
  return profile.map(([y, rx, rz, zOff = 0], rIdx) => {
    const ring: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const crease = 1 + Math.sin(a * foldFreq + rIdx * 1.15) * foldAmp;
      ring.push([Math.cos(a) * rx * crease, y, Math.sin(a) * rz * crease + zOff]);
    }
    return ring;
  });
}

function clampMeshMinY(src: RawMesh, minY: number): RawMesh {
  return deformMesh(src, ([x, y, z]) => [x, y < minY ? minY : y, z]);
}

/**
 * Compound-curved molded armor plate or soft Cordura pouch (`bevelBoxMesh` -> `subdivideSmoothMesh` ->
 * parabolic shell curvature -> `taubinSmoothMesh` + `bakeMeshCavityAO`) eliminating boxy Lego edges.
 */
function sculptContouredArmorPlate(
  w: number,
  h: number,
  d: number,
  bevel: number,
  curveZ = 0,
  subdiv = 2,
  passes = 4
): RawMesh {
  const base = subdivideSmoothMesh(bevelBoxMesh(w, h, d, bevel), subdiv, 0.48);
  const curved =
    Math.abs(curveZ) > 1e-5
      ? deformMesh(base, ([x, y, z]) => {
          const nx = x / Math.max(1e-4, w * 0.5);
          const ny = y / Math.max(1e-4, h * 0.5);
          return [x * (1 - 0.04 * ny * ny), y, z - curveZ * nx * nx];
        })
      : base;
  return bakeMeshCavityAO(bzSmoothMesh(curved, passes), 0.22);
}

/**
 * Grounded ergonomic military combat boot (`loftSectionsMesh` 22-point plantar tread at exact `soleBottomY` +
 * `taubinSmoothMesh` leather upper, speed-lace tongue, heel counter & brass eyelets).
 */
function sculptCombatBootSlots(
  soleBottomY: number,
  scale: number,
  leatherIdx: number,
  soleIdx: number,
  brassIdx: number
): MultiMatSlot[] {
  const segs = 22;
  const soleH = 0.036 * scale;
  const makeFootRing = (y: number, w: number, lenBack: number, lenFront: number, zShift: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const zRadius = sa >= 0 ? lenFront : lenBack;
      // Subtle medial arch waisting along the instep
      const archPinch = 1 - 0.13 * Math.pow(Math.max(0, 1 - Math.abs(sa) * 1.4), 2);
      pts.push([ca * w * archPinch, y, sa * zRadius + zShift]);
    }
    return pts;
  };
  // Exact flat grounded lugged sole (`minY === soleBottomY`, zero subdivision shrinkage on plantar plane)
  const soleRings: V3[][] = [
    makeFootRing(soleBottomY, 0.062 * scale, 0.105 * scale, 0.155 * scale, 0.032 * scale),
    makeFootRing(soleBottomY + soleH * 0.55, 0.065 * scale, 0.108 * scale, 0.16 * scale, 0.032 * scale),
    makeFootRing(soleBottomY + soleH, 0.06 * scale, 0.102 * scale, 0.15 * scale, 0.03 * scale)
  ];
  // Smooth sculpted leather vamp, rounded toe box & laced ankle shaft
  const upperBaseY = soleBottomY + soleH * 0.82;
  const upperRings: V3[][] = [
    makeFootRing(upperBaseY, 0.06 * scale, 0.101 * scale, 0.15 * scale, 0.03 * scale),
    makeFootRing(upperBaseY + 0.028 * scale, 0.059 * scale, 0.1 * scale, 0.146 * scale, 0.029 * scale),
    makeFootRing(upperBaseY + 0.058 * scale, 0.057 * scale, 0.094 * scale, 0.128 * scale, 0.022 * scale),
    makeFootRing(upperBaseY + 0.092 * scale, 0.054 * scale, 0.084 * scale, 0.092 * scale, 0.012 * scale),
    makeFootRing(upperBaseY + 0.155 * scale, 0.055 * scale, 0.076 * scale, 0.078 * scale, 0.004 * scale),
    makeFootRing(upperBaseY + 0.205 * scale, 0.058 * scale, 0.078 * scale, 0.08 * scale, 0.002 * scale)
  ];
  const smoothUpper = clampMeshMinY(
    bakeMeshCavityAO(bzSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(upperRings, true, true), 1, 0.48), 5), 0.24),
    soleBottomY + 0.002
  );
  const slots: MultiMatSlot[] = [
    { mesh: loftSectionsMesh(soleRings, true, true), materialIndex: soleIdx },
    { mesh: smoothUpper, materialIndex: leatherIdx },
    // Padded Cordura/rubber ankle collar & molded heel counter
    {
      mesh: transformMesh(
        bzSmoothMesh(
          subdivideSmoothMesh(latheMesh([[0.048 * scale, -0.018 * scale], [0.062 * scale, 0], [0.052 * scale, 0.022 * scale]], 20), 1, 0.44),
          4
        ),
        { pos: [0, upperBaseY + 0.195 * scale, 0.002 * scale] }
      ),
      materialIndex: soleIdx
    }
  ];
  // 3 contoured speed-lace crossbars & brass eyelets along instep
  for (let l = 0; l < 3; l += 1) {
    const ly = upperBaseY + (0.078 + l * 0.038) * scale;
    const lz = (0.086 - l * 0.012) * scale;
    slots.push({
      mesh: transformMesh(sculptContouredArmorPlate(0.054 * scale, 0.012 * scale, 0.018 * scale, 0.004 * scale, 0.006 * scale, 1, 3), {
        pos: [0, ly, lz],
        rot: [-0.32, 0, 0]
      }),
      materialIndex: brassIdx
    });
  }
  return slots;
}

interface HumanHeadBuildOpts {
  readonly scale: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly seed: number;
  readonly skinIdx: number;
  readonly scleraIdx: number;
  readonly irisIdx: number;
  readonly browIdx: number;
  readonly strapIdx?: number;
  readonly eyepatch?: boolean;
  readonly scarIdx?: number;
}

let BZ_SOLDIER_HEAD_SDF_UNIT: RawMesh | null = null;
function getUnifiedSoldierHeadUnitMesh(): RawMesh {
  if (BZ_SOLDIER_HEAD_SDF_UNIT) return BZ_SOLDIER_HEAD_SDF_UNIT;
  BZ_SOLDIER_HEAD_SDF_UNIT = sculptOrganicSdfMesh({
    boundsMin: [-0.13, -0.18, -0.14],
    boundsMax: [0.13, 0.14, 0.155],
    resolution: [26, 30, 28],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const ax = Math.abs(x);
      // Cranial vault, maxilla, cheekbones, jawline, and sternocleidomastoid neck fused with zero seams
      const vault = sdfEllipsoid(p, [0, 0.018, -0.006], [0.098, 0.104, 0.108]);
      const maxilla = sdfEllipsoid(p, [0, -0.026, 0.024], [0.082, 0.074, 0.082]);
      const cheeks = sdfEllipsoid([ax, y, z], [0.054, -0.002, 0.056], [0.038, 0.032, 0.038]);
      const jawBar = sdfTaperedCapsule(p, [-0.044, -0.056, 0.032], [0.044, -0.056, 0.032], 0.032, 0.032);
      const chin = sdfEllipsoid(p, [0, -0.075, 0.070], [0.032, 0.025, 0.032]);
      const neckCol = sdfTaperedCapsule(p, [0, -0.150, -0.016], [0, -0.028, -0.008], 0.062, 0.058);
      const neckBase = sdfEllipsoid(p, [0, -0.152, -0.020], [0.068, 0.026, 0.068]);
      const brow = sdfTaperedCapsule(p, [-0.052, 0.034, 0.082], [0.052, 0.034, 0.082], 0.015, 0.015);
      // Seamless nose dorsum, tip, alar wings, and upper/lower lips
      const noseBridge = sdfTaperedCapsule(p, [0, 0.024, 0.089], [0, -0.008, 0.118], 0.012, 0.0135);
      const noseTip = Math.hypot(x, y + 0.010, z - 0.121) - 0.0142;
      const nostrils = sdfEllipsoid([ax, y, z], [0.013, -0.015, 0.110], [0.010, 0.008, 0.011]);
      const upperLip = sdfEllipsoid(p, [0, -0.033, 0.095], [0.028, 0.009, 0.016]);
      const lowerLip = sdfEllipsoid(p, [0, -0.046, 0.093], [0.025, 0.009, 0.015]);

      let d = sminPoly(vault, maxilla, 0.026);
      d = sminPoly(d, cheeks, 0.022);
      d = sminPoly(d, jawBar, 0.024);
      d = sminPoly(d, chin, 0.020);
      d = sminPoly(d, neckCol, 0.028);
      d = sminPoly(d, neckBase, 0.020);
      d = sminPoly(d, brow, 0.016);
      // Recessed orbital sockets so smooth eyeballs sit naturally beneath the brow
      const socket = sdfEllipsoid([ax, y, z], [0.038, 0.018, 0.104], [0.023, 0.015, 0.018]);
      d = smaxPoly(d, -socket, 0.012);
      d = sminPoly(d, noseBridge, 0.014);
      d = sminPoly(d, noseTip, 0.011);
      d = sminPoly(d, nostrils, 0.009);
      d = sminPoly(d, upperLip, 0.011);
      d = sminPoly(d, lowerLip, 0.010);
      const mouthLine = sdfTaperedCapsule(p, [-0.020, -0.040, 0.106], [0.020, -0.040, 0.106], 0.004, 0.004);
      d = smaxPoly(d, -mouthLine, 0.005);
      return d;
    }
  });
  return BZ_SOLDIER_HEAD_SDF_UNIT;
}

/**
 * Sculpted Meshy-grade organic human soldier head (`sculptOrganicSdfMesh` `[26, 30, 28]` preserving exact analytic SDF normals +
 * curved `tubeSweepMesh` C-helix ears, `detail=3` smooth sclera/iris/catchlight spheres, `sculptCurvedHairLockMesh` brows & optional eyepatch/chinstrap).
 */
function buildHumanSoldierHeadSlots(opts: HumanHeadBuildOpts): MultiMatSlot[] {
  const s = opts.scale;
  const cy = opts.centerY;
  const cz = opts.centerZ;

  const headAndNeck = transformMesh(getUnifiedSoldierHeadUnitMesh(), {
    pos: [0, cy, cz],
    scale: [s * (0.99 + (opts.seed % 3) * 0.01), s, s]
  });

  const slots: MultiMatSlot[] = [
    { mesh: paintWarmSkinMesh(headAndNeck), materialIndex: opts.skinIdx },
    // Subtle lower-lip / philtrum shadow accent
    {
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [-0.018 * s, cy - 0.040 * s, cz + 0.097 * s, 0.0032 * s],
              [0, cy - 0.041 * s, cz + 0.101 * s, 0.0038 * s],
              [0.018 * s, cy - 0.040 * s, cz + 0.097 * s, 0.0032 * s]
            ],
            10,
            true
          ),
          1,
          0.48
        ),
        3
      ),
      materialIndex: opts.browIdx
    }
  ];

  // Sculpted curved human C-helix ears (`±X`) via `tubeSweepMesh` + `subdivideSmoothMesh` + `taubinSmoothMesh`
  for (const ex of [-1, 1] as const) {
    const earHelix = taubinSmoothMesh(
      subdivideSmoothMesh(
        tubeSweepMesh(
          [
            [ex * 0.092 * s, cy + 0.012 * s, cz + 0.008 * s, 0.0075 * s],
            [ex * 0.101 * s, cy + 0.026 * s, cz - 0.004 * s, 0.0095 * s],
            [ex * 0.104 * s, cy + 0.004 * s, cz - 0.019 * s, 0.0102 * s],
            [ex * 0.098 * s, cy - 0.020 * s, cz - 0.012 * s, 0.0090 * s],
            [ex * 0.092 * s, cy - 0.025 * s, cz + 0.002 * s, 0.0078 * s]
          ],
          12,
          true
        ),
        1,
        0.48
      ),
      4
    );
    slots.push({
      mesh: paintWarmSkinMesh(earHelix),
      materialIndex: opts.skinIdx
    });
  }

  // Expressive human eyes (`detail=3` noise-free radial-normal sclera + dark iris + corneal catchlight) & furrowed brows
  const almondScleraUnit = bzSmoothSphereMesh(1, 3);
  const irisUnit = bzSmoothSphereMesh(1, 3);
  const catchlightUnit = bzSmoothSphereMesh(1, 2);
  for (const side of [-1, 1] as const) {
    if (opts.eyepatch && side === -1) {
      // Tactical molded leather eyepatch cupping the right eye (`x < 0`) + diagonal strap across brow
      slots.push({
        mesh: transformMesh(
          sculptContouredArmorPlate(0.05 * s, 0.04 * s, 0.026 * s, 0.008 * s, 0.008 * s, 2, 4),
          { pos: [side * 0.038 * s, cy + 0.018 * s, cz + 0.098 * s], rot: [0, side * 0.22, 0.1] }
        ),
        materialIndex: opts.strapIdx ?? opts.browIdx
      });
      slots.push({
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [-0.085 * s, cy + 0.045 * s, cz + 0.04 * s, 0.006 * s],
            [-0.038 * s, cy + 0.02 * s, cz + 0.106 * s, 0.006 * s],
            [0.055 * s, cy + 0.048 * s, cz + 0.092 * s, 0.006 * s],
            [0.095 * s, cy + 0.052 * s, cz + 0.01 * s, 0.006 * s]
          ], 10, true),
          3
        ),
        materialIndex: opts.strapIdx ?? opts.browIdx
      });
      continue;
    }
    slots.push({
      mesh: transformMesh(almondScleraUnit, {
        pos: [side * 0.038 * s, cy + 0.018 * s, cz + 0.093 * s],
        rot: [0, side * 0.18, 0],
        scale: [0.016 * s, 0.0088 * s, 0.0095 * s]
      }),
      materialIndex: opts.scleraIdx
    });
    slots.push({
      mesh: transformMesh(irisUnit, {
        pos: [side * 0.036 * s, cy + 0.018 * s, cz + 0.100 * s],
        rot: [0, side * 0.16, 0],
        scale: [0.0082 * s, 0.0076 * s, 0.0072 * s]
      }),
      materialIndex: opts.irisIdx
    });
    slots.push({
      mesh: transformMesh(catchlightUnit, {
        pos: [(side * 0.036 - 0.0025) * s, cy + 0.0205 * s, cz + 0.1062 * s],
        scale: [0.0022 * s, 0.0022 * s, 0.0018 * s]
      }),
      materialIndex: opts.scleraIdx
    });
    slots.push({
      mesh: bzSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [side * 0.015 * s, cy + 0.033 * s, cz + 0.103 * s],
          mid: [side * 0.04 * s, cy + 0.040 * s, cz + 0.098 * s],
          tip: [side * 0.064 * s, cy + 0.029 * s, cz + 0.085 * s],
          width: 0.013 * s,
          thickness: 0.009 * s,
          segments: 8
        }),
        3
      ),
      materialIndex: opts.browIdx
    });
  }

  // Optional diagonal facial battle scar
  if (opts.scarIdx !== undefined) {
    slots.push({
      mesh: bzSmoothMesh(
        tubeSweepMesh([
          [-0.046 * s, cy + 0.055 * s, cz + 0.092 * s, 0.004 * s],
          [-0.038 * s, cy - 0.015 * s, cz + 0.104 * s, 0.0045 * s],
          [-0.028 * s, cy - 0.055 * s, cz + 0.092 * s, 0.0035 * s]
        ], 8, true),
        3
      ),
      materialIndex: opts.scarIdx
    });
  }

  // Webbed nylon tactical chinstrap cupping under jaw up to helmet rim
  if (opts.strapIdx !== undefined && !opts.eyepatch) {
    slots.push({
      mesh: bzSmoothMesh(
        tubeSweepMesh([
          [-0.094 * s, cy + 0.045 * s, cz + 0.015 * s, 0.007 * s],
          [-0.068 * s, cy - 0.048 * s, cz + 0.045 * s, 0.007 * s],
          [0, cy - 0.092 * s, cz + 0.065 * s, 0.0085 * s],
          [0.068 * s, cy - 0.048 * s, cz + 0.045 * s, 0.007 * s],
          [0.094 * s, cy + 0.045 * s, cz + 0.015 * s, 0.007 * s]
        ], 10, true),
        3
      ),
      materialIndex: opts.strapIdx
    });
  }

  return slots;
}

function buildGuardRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Grounded at `minY = 0`: `rig` sits at `y = 0.94`, combat boot soles reach `y = -0.940` -> `0.94 - 0.94 = 0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 matte woodland-camo bloused combat trousers (`roughness: 0.84`)
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 contoured matte olive knee pad shell
    BZ_PROC_MATERIALS.coyoteMolle,        // 2 coyote Cordura knee pad backing & elastic straps
    BZ_PROC_MATERIALS.leatherBootBlack,   // 3 grained black leather combat boot upper
    BZ_PROC_MATERIALS.polymerGrip,        // 4 grounded lugged Vibram boot sole (`minY = 0`)
    BZ_PROC_MATERIALS.brassStudio         // 5 speed-lace eyelets
  ];
  const makeLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-guard-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const s = side === "L" ? 1 : -1;
      const thighStations: AnatomicalStation[] = [
        { pos: [-0.012 * s, 0.065, 0], rx: 0.118, rz: 0.124, zOffset: -0.004 },
        { pos: [0.004 * s, -0.13, 0.006], rx: 0.116, rz: 0.124, zOffset: 0.008 },
        { pos: [0.002 * s, -0.29, 0.008], rx: 0.099, rz: 0.106, zOffset: 0.008 },
        { pos: [0, -0.41, 0.006], rx: 0.085, rz: 0.09, zOffset: 0.004 }
      ];
      // Draped bloused BDU trouser lower leg tucked into boot collar
      const blousedCalf = bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.735, rx: 0.068, rz: 0.072, zBias: 0.002, foldAmp: 0.018 },
            { y: -0.68, rx: 0.088, rz: 0.092, zBias: -0.002, foldAmp: 0.026 },
            { y: -0.55, rx: 0.089, rz: 0.094, zBias: -0.005, foldAmp: 0.022 },
            { y: -0.405, rx: 0.083, rz: 0.087, zBias: 0.004, foldAmp: 0.012 }
          ],
          { segments: 24, foldCount: 7, seed: side === "L" ? 13 : 29 }
        ),
        4
      );
      const slots: MultiMatSlot[] = [
        {
          mesh: paintWoodlandCamoMesh(
            bakeMeshCavityAO(
              bzSmoothMesh(sculptAnatomicalLimbMesh(thighStations, { ringPoints: 22, muscleBiasZ: 0.16, peakT: 0.36 }), 4),
              0.22
            ),
            10.5,
            side === "L" ? 1.1 : 3.7
          ),
          materialIndex: 0
        },
        {
          mesh: paintWoodlandCamoMesh(bakeMeshCavityAO(blousedCalf, 0.24), 10.5, side === "L" ? 2.3 : 4.9),
          materialIndex: 0
        },
        // Contoured soft cargo thigh pocket (`±X` outer thigh silhouette)
        {
          mesh: paintWoodlandCamoMesh(
            transformMesh(sculptContouredArmorPlate(0.038, 0.155, 0.125, 0.012, 0.006, 2, 4), { pos: [s * 0.096, -0.2, 0.005] }),
            12.0,
            1.9
          ),
          materialIndex: 0
        },
        // Contoured coyote backing + curved matte olive hard knee cap + dual retention straps
        {
          mesh: transformMesh(sculptContouredArmorPlate(0.126, 0.148, 0.044, 0.014, 0.016, 2, 4), { pos: [0, -0.415, 0.072] }),
          materialIndex: 2
        },
        {
          mesh: transformMesh(sculptContouredArmorPlate(0.108, 0.112, 0.036, 0.012, 0.018, 2, 5), { pos: [0, -0.415, 0.088] }),
          materialIndex: 1
        },
        { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.076, -0.01], [0.086, 0], [0.076, 0.01]], 20), 3), { pos: [0, -0.375, 0.004] }), materialIndex: 2 },
        { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.076, -0.01], [0.086, 0], [0.076, 0.01]], 20), 3), { pos: [0, -0.455, 0.004] }), materialIndex: 2 },
        ...sculptCombatBootSlots(-0.94, 1.0, 3, 4, 5)
      ];
      return slots;
    }, { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-guard-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.darkFatigues,     // 0 woodland fatigue seat & groin gusset
    BZ_PROC_MATERIALS.coyoteMolle,      // 1 heavy MOLLE battle belt & rear dump/IFAK pouches
    BZ_PROC_MATERIALS.leatherBootBlack, // 2 right-hip drop-leg leather holster & pistol grip
    BZ_PROC_MATERIALS.brassStudio       // 3 Cobra belt buckle
  ], () => [
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          bzSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: -0.135, rx: 0.212, rz: 0.138, foldAmp: 0.02 },
                { y: -0.055, rx: 0.218, rz: 0.148, foldAmp: 0.024 },
                { y: 0.02, rx: 0.205, rz: 0.145, foldAmp: 0.018 },
                { y: 0.095, rx: 0.188, rz: 0.136, foldAmp: 0.012 }
              ],
              { segments: 26, foldCount: 6, seed: 11 }
            ),
            4
          ),
          0.22
        ),
        10.5,
        0.7
      ),
      materialIndex: 0
    },
    // Tactical ballistic groin-protector apron flap bridging belt to upper thighs
    {
      mesh: transformMesh(
        bzSmoothMesh(
          subdivideSmoothMesh(
            extrudePolygonMesh([[-0.082, -0.095], [0.082, -0.095], [0.104, 0.045], [-0.104, 0.045]], 0.032, 0.008, true),
            2,
            0.48
          ),
          4
        ),
        { pos: [0, -0.035, 0.142], rot: [-0.08, 0, 0] }
      ),
      materialIndex: 1
    },
    // Padded coyote MOLLE battle belt + Cobra brass buckle
    {
      mesh: bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.018, rx: 0.196, rz: 0.145, foldAmp: 0.01 },
            { y: 0.052, rx: 0.202, rz: 0.15, foldAmp: 0.012 },
            { y: 0.084, rx: 0.194, rz: 0.143, foldAmp: 0.01 }
          ],
          { segments: 26, foldCount: 8, seed: 5 }
        ),
        4
      ),
      materialIndex: 1
    },
    { mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.054, 0.028, 0.006, 0.006, 1, 3), { pos: [0, 0.05, 0.148] }), materialIndex: 3 },
    // Right-hip (`-X`) molded Kydex/leather tactical holster + holstered pistol grip
    { mesh: transformMesh(sculptContouredArmorPlate(0.064, 0.155, 0.104, 0.016, 0.008, 2, 4), { pos: [-0.205, -0.055, 0.015], rot: [0.12, 0, 0.08] }), materialIndex: 2 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.036, 0.078, 0.062, 0.01, 0.004, 1, 4), { pos: [-0.208, 0.032, -0.012], rot: [-0.28, 0, 0.08] }), materialIndex: 2 },
    // Left-hip (`+X`) rolled soft dump pouch + rear-hip IFAK trauma pouch
    { mesh: transformMesh(sculptContouredArmorPlate(0.074, 0.125, 0.108, 0.02, 0.01, 2, 5), { pos: [0.202, -0.035, -0.015] }), materialIndex: 1 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.145, 0.105, 0.078, 0.02, -0.012, 2, 5), { pos: [0, 0.025, -0.168] }), materialIndex: 1 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-guard-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 tailored woodland combat shirt & collar (`roughness: 0.84`)
    BZ_PROC_MATERIALS.coyoteMolle,        // 1 dark coyote-tan MOLLE plate carrier, mag pouches & assault pack
    BZ_PROC_MATERIALS.corduraOlive,       // 2 olive PALS webbing rows, cummerbund & shoulder pads
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 3 PRC tactical radio, whip antenna & STANAG magazine tops
    BZ_PROC_MATERIALS.brassStudio,        // 4 radio SMA connector & snap hardware
    BZ_PROC_MATERIALS.tritiumGreen        // 5 tiny practical PRC radio status LED
  ], () => {
    const platePoly: V2[] = [[-0.162, -0.175], [0.162, -0.175], [0.168, 0.08], [0.108, 0.2], [-0.108, 0.2], [-0.168, 0.08]];
    const makeCurvedSapiPlate = (depth: number, curveDir: number) =>
      bakeMeshCavityAO(
        bzSmoothMesh(
          deformMesh(
            subdivideSmoothMesh(extrudePolygonMesh(platePoly, depth, 0.015, true), 2, 0.48),
            ([x, y, z]) => [x, y, z - curveDir * 0.026 * (x / 0.17) * (x / 0.17)]
          ),
          4
        ),
        0.22
      );
    const slots: MultiMatSlot[] = [
      // Athletic human upper torso in draped woodland BDU tunic (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
      {
        mesh: paintWoodlandCamoMesh(
          bakeMeshCavityAO(
            bzSmoothMesh(
              sculptDrapedGarmentMesh(
                [
                  { y: 0.0, rx: 0.178, rz: 0.128, foldAmp: 0.02 },
                  { y: 0.16, rx: 0.202, rz: 0.144, zBias: 0.004, foldAmp: 0.024 },
                  { y: 0.34, rx: 0.23, rz: 0.158, zBias: 0.006, foldAmp: 0.022 },
                  { y: 0.46, rx: 0.216, rz: 0.145, foldAmp: 0.016 },
                  { y: 0.53, rx: 0.128, rz: 0.106, foldAmp: 0.01 }
                ],
                { segments: 28, foldCount: 7, seed: 17 }
              ),
              4
            ),
            0.24
          ),
          10.5,
          3.1
        ),
        materialIndex: 0
      },
      // Upturned draped woodland combat shirt collar framing the human neck
      {
        mesh: paintWoodlandCamoMesh(
          bzSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: 0.49, rx: 0.102, rz: 0.102, foldAmp: 0.008 },
                { y: 0.525, rx: 0.126, rz: 0.122, foldAmp: 0.012 },
                { y: 0.572, rx: 0.114, rz: 0.112, foldAmp: 0.01 }
              ],
              { segments: 24, foldCount: 5, wallThickness: 0.014, openFrontArc: 0.44, frontCenterAngle: Math.PI * 0.5, seed: 19 }
            ),
            4
          ),
          12.0,
          4.2
        ),
        materialIndex: 0
      },
      // Contoured compound-curved front & rear SAPI ballistic plate carrier bags + draped olive cummerbund
      { mesh: transformMesh(makeCurvedSapiPlate(0.052, 1), { pos: [0, 0.265, 0.144] }), materialIndex: 1 },
      { mesh: transformMesh(makeCurvedSapiPlate(0.048, -1), { pos: [0, 0.265, -0.142] }), materialIndex: 1 },
      {
        mesh: bzSmoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.09, rx: 0.216, rz: 0.158, foldAmp: 0.014 },
              { y: 0.18, rx: 0.226, rz: 0.166, foldAmp: 0.016 },
              { y: 0.26, rx: 0.222, rz: 0.162, foldAmp: 0.014 }
            ],
            { segments: 26, foldCount: 6, seed: 23 }
          ),
          4
        ),
        materialIndex: 2
      },
      // Contoured dorsal hydration / breacher assault pack (`z >= -0.25`)
      { mesh: transformMesh(sculptContouredArmorPlate(0.245, 0.31, 0.115, 0.026, -0.018, 2, 5), { pos: [0, 0.275, -0.195] }), materialIndex: 1 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.21, 0.11, 0.055, 0.016, -0.01, 2, 4), { pos: [0, 0.195, -0.242] }), materialIndex: 2 },
      // Left-chest AN/PRC-152 tactical radio + brass SMA lug + tiny green status LED + rear whip antenna
      { mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.135, 0.044, 0.009, 0.004, 1, 3), { pos: [0.115, 0.355, 0.172], rot: [0, 0, -0.08] }), materialIndex: 3 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.011, 0], [0.011, 0.024], [0, 0.024]], 12), { pos: [0.125, 0.428, 0.172] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.012, 0.008, 0.008, 0.002), { pos: [0.112, 0.395, 0.194] }), materialIndex: 5 },
      { mesh: tubeSweepMesh([[0.115, 0.41, -0.195, 0.007], [0.125, 0.58, -0.21, 0.005], [0.132, 0.75, -0.225, 0.0028]], 8, true), materialIndex: 3 }
    ];
    // Padded olive shoulder yokes
    for (const sx of [-0.132, 0.132]) {
      slots.push({
        mesh: bzSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh([[sx, 0.42, 0.12, 0.028], [sx * 1.05, 0.505, 0, 0.031], [sx, 0.42, -0.12, 0.028]], 12, true),
            1,
            0.44
          ),
          4
        ),
        materialIndex: 2
      });
    }
    // 3 curved PALS MOLLE webbing strips across upper plate carrier
    for (const wy of [0.31, 0.355, 0.4]) {
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.24, 0.018, 0.02, 0.004, 0.018, 1, 3), { pos: [0, wy, 0.174] }),
        materialIndex: 2
      });
    }
    // 3 molded Cordura chest-rig rifle magazine pouches with exposed dark-steel STANAG magazines & brass bungee tabs
    for (let m = -1; m <= 1; m += 1) {
      const mx = m * 0.088;
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.076, 0.138, 0.056, 0.014, 0.008, 2, 4), { pos: [mx, 0.172, 0.18], rot: [0, 0, m * -0.04] }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.058, 0.046, 0.036, 0.007, 0.003, 1, 3), { pos: [mx, 0.248, 0.178], rot: [0.08, 0, m * -0.04] }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.018, 0.022, 0.014, 0.003), { pos: [mx, 0.215, 0.208] }),
        materialIndex: 4
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const headMesh = multiMatFromMemo("en-guard-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.humanSkinWarm,      // 0 sculpted warm human face, jaw, nose, ears & neck (`sculptStylizedHeadMesh`)
    BZ_PROC_MATERIALS.humanSclera,        // 1 recessed almond sclera
    BZ_PROC_MATERIALS.humanEyeDark,       // 2 dark human irises & pupils
    BZ_PROC_MATERIALS.darkBrowHair,       // 3 furrowed eyebrows & lip shadow
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 4 matte olive-drab PASGT/FAST ballistic helmet (`roughness: 0.78`)
    BZ_PROC_MATERIALS.coyoteMolle,        // 5 nylon chinstrap, Velcro patch & rear counterweight pouch
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 6 NVG mount shroud, stowed dual-tube NVGs & ComTac ear-cups
    BZ_PROC_MATERIALS.tritiumGreen        // 7 tiny practical NVG standby indicator pip
  ], () => {
    // Organic contoured PASGT/FAST ballistic helmet shell sculpted from `sculptStylizedHeadMesh` + brow visor & ear-cutout flare
    const rawHelm = sculptStylizedHeadMesh(0.138, {
      jawTaper: 0.08,
      cheekFullness: 0.14,
      noseBridge: 0.0,
      browRidge: 0.16,
      subdivisions: 2,
      seed: 19
    });
    const contouredHelm = bakeMeshCavityAO(
      bzSmoothMesh(
        deformMesh(rawHelm, ([x, y, z]) => {
          // Map upper hemisphere (`y >= -0.04`) into open-face PASGT ballistic dome (`y in [0.165, 0.380]`)
          const ny = Math.max(0, (y + 0.138) / 0.276);
          const archCut = z > 0.04 ? 0.032 * Math.max(0, 1 - Math.abs(x) / 0.11) : 0;
          const earArch = Math.abs(x) > 0.085 && Math.abs(z) < 0.065 ? 0.024 : 0;
          const domeY = 0.162 + ny * 0.218 + archCut + earArch;
          const brimFlare = ny < 0.28 ? 1 + (0.28 - ny) * 0.22 : 1;
          return [x * 1.03 * brimFlare, Math.min(0.38, domeY), z * 1.13 * brimFlare + 0.008];
        }),
        5
      ),
      0.24
    );
    // Flared PASGT/FAST brow & ear-cutout rim skirt
    const brimRings: V3[][] = [
      ellipticalRings([[0.178, 0.128, 0.148, 0.01]], 26, 2, 0.018)[0]!,
      ellipticalRings([[0.215, 0.138, 0.156, 0.012]], 26, 2, 0.014)[0]!
    ];
    return [
      ...buildHumanSoldierHeadSlots({
        scale: 1.0,
        centerY: 0.148,
        centerZ: 0.018,
        seed: 11,
        skinIdx: 0,
        scleraIdx: 1,
        irisIdx: 2,
        browIdx: 3,
        strapIdx: 5
      }),
      // Contoured matte olive-drab ballistic helmet dome (`maxY = 1.54 + 0.38 = 1.92 m`)
      { mesh: contouredHelm, materialIndex: 4 },
      { mesh: bzSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(brimRings, false, false), 1, 0.46), 4), materialIndex: 4 },
      // Rear helmet counterweight battery pouch + curved side Velcro loop panels
      { mesh: transformMesh(sculptContouredArmorPlate(0.092, 0.068, 0.044, 0.012, -0.008, 2, 4), { pos: [0, 0.235, -0.152] }), materialIndex: 5 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.022, 0.048, 0.105, 0.006, 0.006, 1, 4), { pos: [-0.132, 0.255, -0.005] }), materialIndex: 5 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.022, 0.048, 0.105, 0.006, 0.006, 1, 4), { pos: [0.132, 0.255, -0.005] }), materialIndex: 5 },
      // Tactical Peltor ComTac active hearing-protection rounded headset cups (`±X`)
      { mesh: transformMesh(sculptContouredArmorPlate(0.044, 0.088, 0.076, 0.016, 0.008, 2, 5), { pos: [-0.118, 0.152, -0.004] }), materialIndex: 6 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.044, 0.088, 0.076, 0.016, 0.008, 2, 5), { pos: [0.118, 0.152, -0.004] }), materialIndex: 6 },
      // Front aluminum Wilcox NVG mount shroud + stowed dual-tube AN/PVS-31 binoculars flipped up on brow
      { mesh: transformMesh(sculptContouredArmorPlate(0.056, 0.054, 0.032, 0.007, 0.005, 1, 3), { pos: [0, 0.258, 0.158], rot: [-0.2, 0, 0] }), materialIndex: 6 },
      {
        mesh: transformMesh(bzSmoothMesh(latheMesh([[0, -0.042], [0.022, -0.042], [0.024, 0.042], [0, 0.042]], 16), 2), {
          pos: [-0.036, 0.305, 0.168],
          rot: [0.42, 0, 0]
        }),
        materialIndex: 6
      },
      {
        mesh: transformMesh(bzSmoothMesh(latheMesh([[0, -0.042], [0.022, -0.042], [0.024, 0.042], [0, 0.042]], 16), 2), {
          pos: [0.036, 0.305, 0.168],
          rot: [0.42, 0, 0]
        }),
        materialIndex: 6
      },
      { mesh: transformMesh(bevelBoxMesh(0.01, 0.008, 0.008, 0.002), { pos: [0.056, 0.285, 0.175] }), materialIndex: 7 }
    ];
  }, { castShadow, receiveShadow: true });

  const armRightAndCarbine = multiMatFromMemo("en-guard-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 sculpted muscular woodland-camo sleeve (`roughness: 0.84`)
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 strapped matte olive elbow pad
    BZ_PROC_MATERIALS.leatherGloveTan,    // 2 fingerless coyote leather shooting glove
    BZ_PROC_MATERIALS.humanSkinWarm,      // 3 exposed warm human trigger fingers & thumb
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 4 dark gunmetal M4A1 carbine receiver, quad-rail & barrel
    BZ_PROC_MATERIALS.polymerGrip,        // 5 SOPMOD buttstock, pistol grip, foregrip & STANAG magazine
    BZ_PROC_MATERIALS.brassStudio,        // 6 ejection port brass cover & sling swivel
    BZ_PROC_MATERIALS.tritiumGreen        // 7 subtle reflex optic reticle pip
  ], () => [
    // Muscular anatomical right sleeve (`sculptOrientedLimbMesh`, 22 radial points + `bzSmoothMesh`) + contoured deltoid cap
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          sculptOrientedLimbMesh([
            { pos: [-0.015, 0.035, -0.01], rx: 0.082, rz: 0.086, bulge: 0.2 },
            { pos: [-0.028, -0.085, 0.035], rx: 0.072, rz: 0.076, bulge: 0.22 },
            { pos: [-0.032, -0.185, 0.098], rx: 0.062, rz: 0.064, bulge: 0.16 },
            { pos: [0.042, -0.205, 0.232], rx: 0.056, rz: 0.058, bulge: 0.16 },
            { pos: [0.115, -0.18, 0.335], rx: 0.046, rz: 0.048, bulge: 0.1 }
          ], 22),
          0.22
        ),
        12.0,
        1.5
      ),
      materialIndex: 0
    },
    // Contoured olive tactical deltoid shoulder pad bridging shirt yoke cleanly over shoulder socket
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.096, 0.115, 0.132, 0.026, 0.014, 2, 5), {
        pos: [-0.032, 0.018, 0.0],
        rot: [0, 0, 0.22]
      }),
      materialIndex: 1
    },
    // Contoured matte olive elbow pad
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.078, 0.096, 0.042, 0.014, 0.012, 2, 5), {
        pos: [-0.01, -0.2, 0.072],
        rot: [0.55, 0, 0]
      }),
      materialIndex: 1
    },
    // Contoured fingerless leather glove palm + sculpted human skin fingers wrapped around pistol grip
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.066, 0.082, 0.018, 0.008, 2, 5), { pos: [0.125, -0.175, 0.355] }),
      materialIndex: 2
    },
    {
      mesh: paintWarmSkinMesh(
        transformMesh(sculptContouredArmorPlate(0.052, 0.048, 0.054, 0.016, 0.008, 2, 5), { pos: [0.135, -0.18, 0.392] })
      ),
      materialIndex: 3
    },
    // Detailed dark-gunmetal M4A1 carbine aimed along `+Z`
    { mesh: transformMesh(bzSmoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.052, 0.076, 0.24, 0.009), 1, 0.36), 2), { pos: [0.135, -0.112, 0.4] }), materialIndex: 4 },
    { mesh: transformMesh(bzSmoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.05, 0.062, 0.2, 0.009), 1, 0.36), 2), { pos: [0.135, -0.106, 0.595] }), materialIndex: 4 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.044, 0.102, 0.175, 0.012, 0.004, 1, 3), { pos: [0.135, -0.128, 0.205] }), materialIndex: 5 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.036, 0.095, 0.048, 0.009, 0.004, 1, 3), { pos: [0.135, -0.185, 0.355], rot: [-0.24, 0, 0] }), materialIndex: 5 },
    // Curved STANAG magazine (`loftSectionsMesh`) + contoured angled foregrip
    {
      mesh: bzSmoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh([
            [[0.118, -0.145, 0.445], [0.152, -0.145, 0.445], [0.152, -0.145, 0.498], [0.118, -0.145, 0.498]],
            [[0.118, -0.225, 0.455], [0.152, -0.225, 0.455], [0.152, -0.222, 0.508], [0.118, -0.222, 0.508]],
            [[0.119, -0.295, 0.478], [0.151, -0.295, 0.478], [0.151, -0.288, 0.528], [0.119, -0.288, 0.528]]
          ], true, true),
          1,
          0.35
        ),
        2
      ),
      materialIndex: 5
    },
    { mesh: transformMesh(sculptContouredArmorPlate(0.032, 0.082, 0.036, 0.008, 0.003, 1, 3), { pos: [0.135, -0.165, 0.585] }), materialIndex: 5 },
    // Hooded holographic sight + brass ejection port + Parkerized barrel & A2 birdcage flash suppressor (`maxZ ~ +0.89`)
    { mesh: transformMesh(sculptContouredArmorPlate(0.044, 0.042, 0.078, 0.007, 0.003, 1, 3), { pos: [0.135, -0.056, 0.425] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.014, 0.012, 0.01, 0.002), { pos: [0.135, -0.054, 0.39] }), materialIndex: 7 },
    { mesh: transformMesh(bevelBoxMesh(0.008, 0.02, 0.056, 0.002), { pos: [0.161, -0.105, 0.435] }), materialIndex: 6 },
    {
      mesh: transformMesh(
        latheMesh([[0.013, 0], [0.014, 0.165], [0.02, 0.172], [0.02, 0.225], [0.011, 0.232]], 18),
        { pos: [0.135, -0.105, 0.66], rot: [Math.PI * 0.5, 0, 0] }
      ),
      materialIndex: 4
    }
  ], { castShadow, receiveShadow: true });

  const carbineMuzzleTip = multiMatFromMemo("en-guard-muzzle", `${name} muzzle-tip`, [
    BZ_PROC_MATERIALS.darkSteelBrushed,
    BZ_PROC_MATERIALS.muzzleCore
  ], () => [
    {
      mesh: transformMesh(latheMesh([[0.014, -0.02], [0.02, -0.015], [0.02, 0.024], [0.011, 0.03]], 16), {
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 0
    },
    { mesh: transformMesh(bzSmoothSphereMesh(0.01, 2), { pos: [0, 0, 0.026] }), materialIndex: 1 }
  ], { castShadow: false, receiveShadow: false });

  const armLeft = multiMatFromMemo("en-guard-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 sculpted muscular woodland-camo sleeve
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 strapped matte olive elbow pad
    BZ_PROC_MATERIALS.leatherGloveTan,    // 2 fingerless coyote leather support glove
    BZ_PROC_MATERIALS.humanSkinWarm       // 3 exposed warm human fingers cupping carbine handguard
  ], () => [
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          sculptOrientedLimbMesh([
            { pos: [0.015, 0.035, -0.01], rx: 0.082, rz: 0.086, bulge: 0.2 },
            { pos: [0.026, -0.085, 0.055], rx: 0.072, rz: 0.076, bulge: 0.22 },
            { pos: [0.022, -0.17, 0.135], rx: 0.062, rz: 0.064, bulge: 0.16 },
            { pos: [-0.145, -0.175, 0.345], rx: 0.054, rz: 0.056, bulge: 0.16 },
            { pos: [-0.325, -0.148, 0.525], rx: 0.044, rz: 0.046, bulge: 0.1 }
          ], 22),
          0.22
        ),
        12.0,
        2.7
      ),
      materialIndex: 0
    },
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.096, 0.115, 0.132, 0.026, 0.014, 2, 5), {
        pos: [0.032, 0.018, 0.0],
        rot: [0, 0, -0.22]
      }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.078, 0.096, 0.042, 0.014, 0.012, 2, 5), {
        pos: [0.012, -0.182, 0.115],
        rot: [0.62, 0, 0]
      }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.064, 0.082, 0.018, 0.008, 2, 5), { pos: [-0.345, -0.142, 0.55] }),
      materialIndex: 2
    },
    {
      mesh: paintWarmSkinMesh(
        transformMesh(sculptContouredArmorPlate(0.054, 0.048, 0.054, 0.016, 0.008, 2, 5), { pos: [-0.352, -0.135, 0.585] })
      ),
      materialIndex: 3
    }
  ], { castShadow, receiveShadow: true });

  return group(name, [
    group(`${name} rig`, [
      pelvisMesh,
      group(`${name} legL`, [makeLeg("L")]).position(0.135, 0, 0).runtime(bind(ids.legL, "legL")),
      group(`${name} legR`, [makeLeg("R")]).position(-0.135, 0, 0).runtime(bind(ids.legR, "legR")),
      group(`${name} torso`, [
        torsoMesh,
        group(`${name} head`, [headMesh]).position(0, 0.54, 0).runtime(bind(ids.head, "head")),
        group(`${name} armL`, [armLeft]).position(0.245, 0.44, 0).runtime(bind(ids.armL, "armL")),
        group(`${name} armR`, [
          armRightAndCarbine,
          group(`${name} muzzle`, [carbineMuzzleTip]).position(0.135, -0.105, 0.86).runtime(bind(ids.spec, "spec"))
        ]).position(-0.245, 0.44, 0).runtime(bind(ids.armR, "armR"))
      ]).position(0, 0.06, 0).runtime(bind(ids.torso, "torso"))
    ]).position(0, 0.94, 0).runtime(bind(ids.rig, "rig"))
  ]).runtime(bind(ids.body, "body"));
}

function buildRoboHoundRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Fierce organic Doberman / Belgian Malinois tactical attack K9 grounded at `minY = 0`:
  // `rig` sits at `y = 0.52`, digitigrade canine paw pads sit at `y = -0.520` -> `0.52 - 0.52 = 0.000`.
  const chassisMesh = multiMatFromMemo("en-hound-chassis", `${name} chassis`, [
    BZ_PROC_MATERIALS.k9SableBlack, // 0 muscular dark-sable Doberman/Malinois ribcage, loin, croup & tail
    BZ_PROC_MATERIALS.k9RustTan,    // 1 classic mahogany-tan breastplate & flank markings
    BZ_PROC_MATERIALS.corduraOlive, // 2 matte olive Cordura tactical K9 assault saddle
    BZ_PROC_MATERIALS.coyoteMolle,  // 3 coyote MOLLE side tracker/IFAK pouches, chest Y-strap & girth straps
    BZ_PROC_MATERIALS.brassStudio,  // 4 forged brass leash D-ring & strap buckles
    BZ_PROC_MATERIALS.tritiumGreen  // 5 tiny practical K9 IR strobe / GPS tracker pip
  ], () => {
    // Seamless Meshy-grade SDF Doberman torso, deep thoracic brisket, athletic loin, haunches & arched neck (`analyticNormals: true`)
    const canineBodySdf = sculptOrganicSdfMesh({
      boundsMin: [-0.18, -0.20, -0.39],
      boundsMax: [0.18, 0.25, 0.45],
      resolution: [24, 26, 32],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const ax = Math.abs(x);
        const ribcage = sdfEllipsoid(p, [0, 0.010, 0.125], [0.144, 0.178, 0.200]);
        const brisket = sdfEllipsoid(p, [0, -0.020, 0.235], [0.118, 0.142, 0.130]);
        const shoulders = sdfEllipsoid([ax, y, z], [0.092, 0.040, 0.215], [0.056, 0.115, 0.105]);
        const loin = sdfTaperedCapsule(p, [0, 0.048, -0.02], [0, 0.056, -0.22], 0.114, 0.102);
        const croup = sdfEllipsoid(p, [0, 0.046, -0.265], [0.118, 0.120, 0.112]);
        const haunches = sdfEllipsoid([ax, y, z], [0.086, 0.022, -0.250], [0.054, 0.102, 0.096]);
        const neck = sdfTaperedCapsule(p, [0, 0.048, 0.265], [0, 0.176, 0.388], 0.092, 0.078);
        let d = sminPoly(ribcage, brisket, 0.042);
        d = sminPoly(d, shoulders, 0.036);
        d = sminPoly(d, loin, 0.045);
        d = sminPoly(d, croup, 0.038);
        d = sminPoly(d, haunches, 0.034);
        d = sminPoly(d, neck, 0.040);
        return d;
      }
    });

    // Draped olive Cordura K9 tactical harness saddle (`sculptDrapedGarmentMesh` rotated along `+Z`, open belly arc)
    const drapedSaddle = bakeMeshCavityAO(
      bzSmoothMesh(
        transformMesh(
          sculptDrapedGarmentMesh(
            [
              { y: -0.055, rx: 0.138, rz: 0.160, zBias: -0.03, foldAmp: 0.012 },
              { y: 0.08, rx: 0.158, rz: 0.192, zBias: -0.014, foldAmp: 0.016 },
              { y: 0.205, rx: 0.152, rz: 0.184, zBias: -0.024, foldAmp: 0.012 }
            ],
            {
              segments: 26,
              foldCount: 6,
              wallThickness: 0.014,
              openFrontArc: 0.62 * Math.PI,
              frontCenterAngle: Math.PI * 0.5,
              seed: 31
            }
          ),
          { rot: [Math.PI * 0.5, 0, 0] }
        ),
        4
      ),
      0.24
    );

    const slots: MultiMatSlot[] = [
      {
        mesh: canineBodySdf,
        materialIndex: 0
      },
      // Classic Doberman/Malinois mahogany-tan chest breastplate blaze (`+Z`)
      {
        mesh: transformMesh(sculptContouredArmorPlate(0.145, 0.145, 0.095, 0.03, 0.018, 2, 5), {
          pos: [0, 0.018, 0.318],
          rot: [0.28, 0, 0]
        }),
        materialIndex: 1
      },
      // Smooth curved sable K9 tail (`tubeSweepMesh` + `subdivideSmoothMesh` + `taubinSmoothMesh`, `z >= -0.48` so snout `maxZ > |minZ|`)
      {
        mesh: taubinSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh(
              [
                [0, 0.082, -0.325, 0.030],
                [0, 0.125, -0.405, 0.024],
                [0, 0.190, -0.455, 0.017],
                [0, 0.255, -0.478, 0.009]
              ],
              12,
              true
            ),
            1,
            0.48
          ),
          4
        ),
        materialIndex: 0
      },
      // Olive Cordura tactical K9 saddle + coyote Y-chest & girth straps + dorsal grab handle + brass leash D-ring
      { mesh: drapedSaddle, materialIndex: 2 },
      {
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [-0.12, 0.11, 0.2, 0.018], [-0.05, 0.015, 0.345, 0.02],
            [0, -0.06, 0.31, 0.022], [0.05, 0.015, 0.345, 0.02], [0.12, 0.11, 0.2, 0.018]
          ], 12, true),
          3
        ),
        materialIndex: 3
      },
      { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.15, -0.018], [0.165, 0], [0.15, 0.018]], 22), 3), { pos: [0, 0.015, 0.08], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 3 },
      { mesh: bzSmoothMesh(tubeSweepMesh([[0, 0.205, 0.17, 0.011], [0, 0.238, 0.085, 0.012], [0, 0.205, 0.0, 0.011]], 10, true), 3), materialIndex: 3 },
      { mesh: transformMesh(latheMesh([[0.018, -0.006], [0.028, 0], [0.018, 0.006]], 16), { pos: [0, 0.212, -0.02], rot: [0.3, 0, 0] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.024, 0.012, 0.032, 0.003), { pos: [0, 0.215, 0.135] }), materialIndex: 5 }
    ];
    // Twin contoured coyote-tan MOLLE side pouches on the K9 saddle
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.054, 0.125, 0.215, 0.018, 0.008, 2, 5), {
          pos: [sx * 0.164, 0.048, 0.085],
          rot: [0.06, 0, sx * -0.14]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.018, 0.022, 0.022, 0.004), { pos: [sx * 0.188, 0.068, 0.085] }),
        materialIndex: 4
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const headCowlMesh = multiMatFromMemo("en-hound-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.k9SableBlack,     // 0 sculpted canine cranium, brow & upper muzzle bridge
    BZ_PROC_MATERIALS.k9RustTan,        // 1 mahogany-tan muzzle cheeks, brow pips & inner ears
    BZ_PROC_MATERIALS.leatherBootBlack, // 2 wet black canine nose leather & nostrils
    BZ_PROC_MATERIALS.humanEyeDark,     // 3 fierce dark canine eyes
    BZ_PROC_MATERIALS.laserAmber,       // 4 subtle amber predator iris glint (`practical: true`)
    BZ_PROC_MATERIALS.coyoteMolle       // 5 nylon tactical K9 collar & brass ID buckle
  ], () => {
    // Seamless SDF canine cranium, brow stop & wedge snout (`analyticNormals: true`, zero cranium-to-muzzle seam)
    const canineSkullSdf = sculptOrganicSdfMesh({
      boundsMin: [-0.115, -0.045, -0.095],
      boundsMax: [0.115, 0.145, 0.285],
      resolution: [24, 24, 28],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const ax = Math.abs(x);
        const cranium = sdfEllipsoid(p, [0, 0.046, 0.016], [0.092, 0.082, 0.104]);
        const browStop = sdfEllipsoid([ax, y, z], [0.045, 0.066, 0.092], [0.036, 0.024, 0.036]);
        const muzzleBridge = sdfTaperedCapsule(p, [0, 0.032, 0.082], [0, 0.018, 0.246], 0.052, 0.038);
        const flews = sdfEllipsoid([ax, y, z], [0.028, 0.005, 0.180], [0.024, 0.022, 0.072]);
        const snoutTip = sdfEllipsoid(p, [0, 0.017, 0.252], [0.034, 0.028, 0.024]);
        let d = sminPoly(cranium, browStop, 0.022);
        d = sminPoly(d, muzzleBridge, 0.028);
        d = sminPoly(d, flews, 0.018);
        d = sminPoly(d, snoutTip, 0.016);
        const eyeSocket = sdfEllipsoid([ax, y, z], [0.054, 0.052, 0.112], [0.017, 0.015, 0.018]);
        d = smaxPoly(d, -eyeSocket, 0.010);
        return d;
      }
    });

    const slots: MultiMatSlot[] = [
      { mesh: canineSkullSdf, materialIndex: 0 },
      // Tan muzzle flews & classic Doberman tan eyebrow pips
      {
        mesh: transformMesh(sculptContouredArmorPlate(0.094, 0.042, 0.142, 0.016, 0.008, 2, 5), { pos: [0, 0.003, 0.176] }),
        materialIndex: 1
      },
      // Sculpted wet black canine nose leather (`z = +0.270` -> world `0.36 + 0.270 = 0.630 m > |minZ|`)
      {
        mesh: transformMesh(bzSmoothSphereMesh(1, 2), {
          pos: [0, 0.022, 0.268],
          scale: [0.025, 0.019, 0.018]
        }),
        materialIndex: 2
      },
      // Tactical coyote K9 neck collar
      {
        mesh: transformMesh(bzSmoothMesh(latheMesh([[0.078, -0.02], [0.09, 0], [0.078, 0.02]], 20), 3), {
          pos: [0, -0.015, -0.02],
          rot: [Math.PI * 0.35, 0, 0]
        }),
        materialIndex: 5
      }
    ];

    const eyeUnit = bzSmoothSphereMesh(1, 3);
    const glintUnit = bzSmoothSphereMesh(0.0046, 2);
    // Twin tall curved alert Doberman/Malinois cropped ears (`maxY = 0.68 + 0.28 = 0.96 m`, inside `[0.85, 1.15]`)
    for (const sx of [-1, 1] as const) {
      const earOuter = taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [sx * 0.062, 0.092, 0.008, 0.032],
              [sx * 0.070, 0.158, 0.010, 0.026],
              [sx * 0.073, 0.225, 0.013, 0.016],
              [sx * 0.070, 0.278, 0.016, 0.006]
            ],
            14,
            true
          ),
          1,
          0.48
        ),
        4
      );
      const earInner = taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [sx * 0.064, 0.106, 0.020, 0.018],
              [sx * 0.070, 0.172, 0.020, 0.013],
              [sx * 0.071, 0.240, 0.019, 0.006]
            ],
            12,
            true
          ),
          1,
          0.48
        ),
        3
      );
      slots.push({ mesh: earOuter, materialIndex: 0 });
      slots.push({ mesh: earInner, materialIndex: 1 });
      // Fierce forward-angled canine eyes + amber iris glint + tan brow pips
      slots.push({
        mesh: transformMesh(eyeUnit, {
          pos: [sx * 0.054, 0.052, 0.108],
          rot: [0, sx * 0.32, sx * -0.18],
          scale: [0.0115, 0.0095, 0.0125]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(glintUnit, { pos: [sx * 0.058, 0.054, 0.119] }),
        materialIndex: 4
      });
      slots.push({
        mesh: transformMesh(bzSmoothSphereMesh(1, 2), {
          pos: [sx * 0.046, 0.073, 0.111],
          scale: [0.011, 0.007, 0.010]
        }),
        materialIndex: 1
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const lowerJawMesh = multiMatFromMemo("en-hound-jaw", `${name} jaw-mesh`, [
    BZ_PROC_MATERIALS.k9SableBlack, // 0 organic lower canine mandible
    BZ_PROC_MATERIALS.k9GumCrimson, // 1 crimson gums & tongue
    BZ_PROC_MATERIALS.k9IvoryFang   // 2 curved ivory canine fangs & carnassial teeth
  ], () => {
    const mandibleSdf = sculptOrganicSdfMesh({
      boundsMin: [-0.062, -0.036, -0.02],
      boundsMax: [0.062, 0.020, 0.225],
      resolution: [20, 16, 24],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const ax = Math.abs(x);
        const rami = sdfTaperedCapsule([ax, y, z], [0.036, -0.008, 0.005], [0.022, -0.010, 0.185], 0.015, 0.013);
        const chinSym = sdfEllipsoid(p, [0, -0.010, 0.192], [0.028, 0.013, 0.024]);
        const floor = sdfEllipsoid(p, [0, -0.014, 0.105], [0.038, 0.011, 0.095]);
        return sminPoly(sminPoly(rami, chinSym, 0.012), floor, 0.012);
      }
    });
    const slots: MultiMatSlot[] = [
      { mesh: mandibleSdf, materialIndex: 0 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.046, 0.014, 0.155, 0.005, 0.003, 1, 4), { pos: [0, 0.004, 0.115] }), materialIndex: 1 }
    ];
    // Twin large curved lower canine fangs + 4 sharp incisors (`tubeSweepMesh` + `subdivideSmoothMesh` + `taubinSmoothMesh`)
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: taubinSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh(
              [
                [sx * 0.024, 0.003, 0.182, 0.0076],
                [sx * 0.026, 0.022, 0.188, 0.0050],
                [sx * 0.023, 0.039, 0.184, 0.0016]
              ],
              12,
              true
            ),
            1,
            0.46
          ),
          3
        ),
        materialIndex: 2
      });
    }
    for (const ix of [-0.014, -0.005, 0.005, 0.014]) {
      slots.push({
        mesh: taubinSmoothMesh(
          tubeSweepMesh(
            [
              [ix, 0.003, 0.198, 0.0042],
              [ix, 0.013, 0.200, 0.0026],
              [ix, 0.020, 0.199, 0.0010]
            ],
            10,
            true
          ),
          2
        ),
        materialIndex: 2
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const legMats = [
    BZ_PROC_MATERIALS.k9SableBlack,     // 0 muscular upper sable shoulder / haunch thigh
    BZ_PROC_MATERIALS.k9RustTan,        // 1 mahogany-tan lower forearm / hock & digitigrade paw toes
    BZ_PROC_MATERIALS.leatherBootBlack  // 2 grounded keratin paw pads (`minY = 0`) & claws
  ];
  const makeK9Leg = (tag: string, isFront: boolean) =>
    multiMatFromMemo(`en-hound-leg-${tag}`, `${name} leg-${tag}`, legMats, () => {
      const upperStations: AnatomicalStation[] = isFront
        ? [
            { pos: [0, 0.03, 0], rx: 0.052, rz: 0.068, zOffset: -0.005 },
            { pos: [0, -0.12, -0.022], rx: 0.044, rz: 0.056, zOffset: -0.006 },
            { pos: [0, -0.25, -0.035], rx: 0.034, rz: 0.04, zOffset: 0 }
          ]
        : [
            { pos: [0, 0.045, 0], rx: 0.058, rz: 0.092, zOffset: -0.012 },
            { pos: [0, -0.13, 0.012], rx: 0.052, rz: 0.078, zOffset: 0.008 },
            { pos: [0, -0.27, -0.082], rx: 0.036, rz: 0.046, zOffset: -0.01 }
          ];
      const lowerStations: AnatomicalStation[] = isFront
        ? [
            { pos: [0, -0.24, -0.035], rx: 0.033, rz: 0.038 },
            { pos: [0, -0.39, 0.008], rx: 0.026, rz: 0.03 },
            { pos: [0, -0.495, 0.028], rx: 0.025, rz: 0.028 }
          ]
        : [
            { pos: [0, -0.26, -0.082], rx: 0.034, rz: 0.042 },
            { pos: [0, -0.395, -0.022], rx: 0.026, rz: 0.032 },
            { pos: [0, -0.495, 0.024], rx: 0.025, rz: 0.028 }
          ];

      // Exact grounded 20-point plantar canine paw pad (`y = -0.520` -> `0.52 - 0.52 = 0.000`)
      const pawPadRings: V3[][] = [-0.52, -0.506, -0.494].map((py, idx) => {
        const s = idx === 1 ? 1.04 : 0.96;
        const ring: V3[] = [];
        for (let i = 0; i < 20; i += 1) {
          const a = (i / 20) * Math.PI * 2;
          ring.push([Math.cos(a) * 0.038 * s, py, Math.sin(a) * 0.052 * s + 0.038]);
        }
        return ring;
      });

      const slots: MultiMatSlot[] = [
        {
          mesh: bakeMeshCavityAO(
            bzSmoothMesh(sculptAnatomicalLimbMesh(upperStations, { ringPoints: 20, muscleBiasZ: isFront ? -0.14 : 0.18 }), 4),
            0.22
          ),
          materialIndex: 0
        },
        {
          mesh: clampMeshMinY(
            bakeMeshCavityAO(bzSmoothMesh(sculptAnatomicalLimbMesh(lowerStations, { ringPoints: 20, muscleBiasZ: 0.1 }), 4), 0.22),
            -0.516
          ),
          materialIndex: 1
        },
        { mesh: loftSectionsMesh(pawPadRings, true, true), materialIndex: 2 },
        // Arched digitigrade canine toes + 4 dark claws
        {
          mesh: clampMeshMinY(
            transformMesh(sculptContouredArmorPlate(0.074, 0.036, 0.088, 0.014, 0.008, 2, 5), { pos: [0, -0.492, 0.044] }),
            -0.516
          ),
          materialIndex: 1
        }
      ];
      for (const cx of [-0.024, -0.008, 0.008, 0.024]) {
        slots.push({
          mesh: clampMeshMinY(
            bzSmoothMesh(tubeSweepMesh([[cx, -0.496, 0.082, 0.0055], [cx, -0.51, 0.104, 0.002]], 8, true), 2),
            -0.518
          ),
          materialIndex: 2
        });
      }
      return slots;
    }, { castShadow, receiveShadow: true });

  return group(name, [
    group(`${name} rig`, [
      group(`${name} torso`, [
        chassisMesh,
        group(`${name} head`, [
          headCowlMesh,
          group(`${name} jaw`, [lowerJawMesh]).position(0, -0.022, 0.045).runtime(bind(ids.spec, "spec"))
        ]).position(0, 0.16, 0.36).runtime(bind(ids.head, "head"))
      ]).position(0, 0, 0).runtime(bind(ids.torso, "torso")),
      group(`${name} legFL`, [makeK9Leg("FL", true)]).position(0.145, 0, 0.24).runtime(bind(ids.legL, "legL")),
      group(`${name} legFR`, [makeK9Leg("FR", true)]).position(-0.145, 0, 0.24).runtime(bind(ids.legR, "legR")),
      group(`${name} legBL`, [makeK9Leg("BL", false)]).position(0.15, 0, -0.25).runtime(bind(ids.armL, "armL")),
      group(`${name} legBR`, [makeK9Leg("BR", false)]).position(-0.15, 0, -0.25).runtime(bind(ids.armR, "armR"))
    ]).position(0, 0.52, 0).runtime(bind(ids.rig, "rig"))
  ]).runtime(bind(ids.body, "body"));
}

function buildHeavyGunnerRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Bulky human EOD Heavy Suppression Trooper grounded at `minY = 0`:
  // `rig` sits at `y = 0.96`, heavy combat boot soles sit at `-0.960` -> `0.96 - 0.96 = 0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 quilted woodland-olive ballistic trousers (`roughness: 0.84`)
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 heavy wrap-around matte olive EOD Kevlar thigh/shin plates
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 2 articulated slate-charcoal knee blast guards
    BZ_PROC_MATERIALS.coyoteMolle,        // 3 heavy nylon retention straps
    BZ_PROC_MATERIALS.leatherBootBlack,   // 4 heavy leather combat boot upper
    BZ_PROC_MATERIALS.polymerGrip,        // 5 grounded Vibram siege sole (`minY = 0`)
    BZ_PROC_MATERIALS.brassStudio         // 6 heavy boot lace hardware
  ];
  const makeHeavyLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-gunner-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const s = side === "L" ? 1 : -1;
      const thighStations: AnatomicalStation[] = [
        { pos: [0, 0.05, 0], rx: 0.132, rz: 0.14, zOffset: -0.004 },
        { pos: [0.005 * s, -0.17, 0.006], rx: 0.138, rz: 0.146, zOffset: 0.008 },
        { pos: [0, -0.41, 0.006], rx: 0.114, rz: 0.12, zOffset: 0.006 }
      ];
      // Quilted heavy EOD ballistic lower trouser leg (`sculptDrapedGarmentMesh` + `bzSmoothMesh`)
      const quiltedShin = bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.75, rx: 0.096, rz: 0.102, zBias: 0.002, foldAmp: 0.014 },
            { y: -0.59, rx: 0.118, rz: 0.124, zBias: -0.005, foldAmp: 0.022 },
            { y: -0.41, rx: 0.112, rz: 0.118, zBias: 0.004, foldAmp: 0.012 }
          ],
          { segments: 24, foldCount: 8, seed: side === "L" ? 37 : 53 }
        ),
        4
      );
      return [
        {
          mesh: paintWoodlandCamoMesh(
            bakeMeshCavityAO(
              bzSmoothMesh(sculptAnatomicalLimbMesh(thighStations, { ringPoints: 22, muscleBiasZ: 0.16 }), 4),
              0.22
            ),
            9.5,
            side === "L" ? 1.8 : 4.2
          ),
          materialIndex: 0
        },
        {
          mesh: paintWoodlandCamoMesh(bakeMeshCavityAO(quiltedShin, 0.24), 9.5, side === "L" ? 3.1 : 5.6),
          materialIndex: 0
        },
        // Compound-curved EOD Kevlar outer thigh & front shin blast-plates
        {
          mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.24, 0.195, 0.02, 0.014, 2, 5), { pos: [s * 0.118, -0.19, 0.01], rot: [0, 0, s * -0.08] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(sculptContouredArmorPlate(0.148, 0.275, 0.068, 0.02, 0.026, 2, 5), { pos: [0, -0.595, 0.088], rot: [-0.06, 0, 0] }),
          materialIndex: 1
        },
        // Articulated compound-curved dark-slate knee fortress plate + coyote straps
        {
          mesh: transformMesh(sculptContouredArmorPlate(0.162, 0.158, 0.072, 0.022, 0.028, 2, 5), { pos: [0, -0.41, 0.098], rot: [-0.08, 0, 0] }),
          materialIndex: 2
        },
        { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.108, -0.014], [0.122, 0], [0.108, 0.014]], 22), 3), { pos: [0, -0.53, 0] }), materialIndex: 3 },
        { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.1, -0.014], [0.112, 0], [0.1, 0.014]], 22), 3), { pos: [0, -0.66, 0] }), materialIndex: 3 },
        ...sculptCombatBootSlots(-0.96, 1.18, 4, 5, 6)
      ];
    }, { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-gunner-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 padded olive ballistic under-trousers
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 heavy EOD Kevlar groin blast apron & hip plates
    BZ_PROC_MATERIALS.coyoteMolle,        // 2 MOLLE war-belt & apron webbing
    BZ_PROC_MATERIALS.brassStudio         // 3 heavy quick-release buckle
  ], () => [
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          bzSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: -0.09, rx: 0.216, rz: 0.156, foldAmp: 0.018 },
                { y: 0.02, rx: 0.236, rz: 0.17, foldAmp: 0.022 },
                { y: 0.09, rx: 0.226, rz: 0.162, foldAmp: 0.016 }
              ],
              { segments: 26, foldCount: 6, seed: 41 }
            ),
            4
          ),
          0.22
        ),
        9.5,
        2.2
      ),
      materialIndex: 0
    },
    {
      mesh: bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.01, rx: 0.246, rz: 0.178, foldAmp: 0.01 },
            { y: 0.055, rx: 0.254, rz: 0.184, foldAmp: 0.012 },
            { y: 0.09, rx: 0.244, rz: 0.176, foldAmp: 0.01 }
          ],
          { segments: 26, foldCount: 8, seed: 43 }
        ),
        4
      ),
      materialIndex: 2
    },
    // Contoured EOD Kevlar ballistic groin apron (`+Z`) + rear tailbone protector (`-Z`) + curved side hip shields
    { mesh: transformMesh(sculptContouredArmorPlate(0.245, 0.255, 0.068, 0.024, 0.026, 2, 5), { pos: [0, -0.095, 0.165], rot: [-0.08, 0, 0] }), materialIndex: 1 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.225, 0.195, 0.064, 0.022, -0.024, 2, 5), { pos: [0, -0.065, -0.162], rot: [0.08, 0, 0] }), materialIndex: 1 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.065, 0.19, 0.21, 0.02, 0.016, 2, 5), { pos: [-0.245, -0.04, 0], rot: [0, 0, 0.14] }), materialIndex: 1 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.065, 0.19, 0.21, 0.02, 0.016, 2, 5), { pos: [0.245, -0.04, 0], rot: [0, 0, -0.14] }), materialIndex: 1 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.075, 0.056, 0.03, 0.006, 0.006, 1, 3), { pos: [0, 0.052, 0.184] }), materialIndex: 3 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-gunner-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 bulky EOD Kevlar juggernaut vest & blast-collar outer shell
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 heavy slate ballistic chest trauma plate & dorsal ammo pack
    BZ_PROC_MATERIALS.coyoteMolle,        // 2 coyote MOLLE webbing, SAW box-mag pouches & padded collar liner
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 3 backpack ammo-feed frame & radio antenna
    BZ_PROC_MATERIALS.brassStudio,        // 4 articulated 7.62mm brass ammunition belt chute
    BZ_PROC_MATERIALS.tritiumGreen        // 5 subtle tactical comms LED pip (`practical: true`)
  ], () => {
    // High wrap-around EOD ballistic blast-collar (`sculptDrapedGarmentMesh` horseshoe shell + `taubinSmoothMesh`)
    const blastCollar = bakeMeshCavityAO(
      bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.48, rx: 0.185, rz: 0.155, zBias: 0.015, foldAmp: 0.008 },
            { y: 0.555, rx: 0.198, rz: 0.165, zBias: 0.015, foldAmp: 0.01 },
            { y: 0.615, rx: 0.205, rz: 0.17, zBias: 0.015, foldAmp: 0.008 }
          ],
          {
            segments: 28,
            foldCount: 5,
            wallThickness: 0.032,
            openFrontArc: 0.38 * Math.PI,
            frontCenterAngle: Math.PI * 0.5,
            seed: 47
          }
        ),
        4
      ),
      0.24
    );

    const slots: MultiMatSlot[] = [
      // Massive draped EOD ballistic Kevlar juggernaut vest (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
      {
        mesh: bakeMeshCavityAO(
          bzSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: 0, rx: 0.236, rz: 0.17, foldAmp: 0.018 },
                { y: 0.22, rx: 0.294, rz: 0.204, zBias: 0.006, foldAmp: 0.022 },
                { y: 0.46, rx: 0.314, rz: 0.21, zBias: 0.006, foldAmp: 0.018 },
                { y: 0.57, rx: 0.228, rz: 0.156, foldAmp: 0.01 }
              ],
              { segments: 28, foldCount: 6, seed: 51 }
            ),
            5
          ),
          0.24
        ),
        materialIndex: 0
      },
      // Compound-curved dark-slate trauma strike-face chest plate + contoured throat gorget
      { mesh: transformMesh(sculptContouredArmorPlate(0.39, 0.32, 0.088, 0.026, 0.038, 2, 5), { pos: [0, 0.315, 0.188], rot: [0.08, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.21, 0.105, 0.058, 0.018, 0.02, 2, 4), { pos: [0, 0.485, 0.188], rot: [-0.22, 0, 0] }), materialIndex: 0 },
      // High wrap-around EOD blast-collar
      { mesh: blastCollar, materialIndex: 0 },
      // Twin molded coyote SAW drum/box pouches on lower chest + curved MOLLE webbing bar
      { mesh: transformMesh(sculptContouredArmorPlate(0.135, 0.145, 0.078, 0.018, 0.012, 2, 5), { pos: [-0.105, 0.155, 0.205] }), materialIndex: 2 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.135, 0.145, 0.078, 0.018, 0.012, 2, 5), { pos: [0.105, 0.155, 0.205] }), materialIndex: 2 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.28, 0.022, 0.024, 0.004, 0.024, 1, 3), { pos: [0, 0.365, 0.224], rot: [0.08, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.016, 0.012, 0.012, 0.003), { pos: [0.135, 0.425, 0.215] }), materialIndex: 5 },
      // Contoured dorsal ammunition box pack (`z >= -0.38`) + smooth olive drum canister + flexible linked brass 7.62mm ammo feed chute
      { mesh: transformMesh(sculptContouredArmorPlate(0.39, 0.46, 0.21, 0.03, -0.024, 2, 5), { pos: [0, 0.31, -0.25] }), materialIndex: 1 },
      { mesh: transformMesh(bzSmoothMesh(latheMesh([[0, -0.18], [0.108, -0.18], [0.108, 0.18], [0, 0.18]], 22), 2), { pos: [0, 0.145, -0.275], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 0 },
      { mesh: tubeSweepMesh([[0.15, 0.52, -0.24, 0.008], [0.16, 0.68, -0.25, 0.005], [0.168, 0.82, -0.26, 0.003]], 8, true), materialIndex: 3 },
      {
        mesh: bzSmoothMesh(
          subdivideSmoothMesh(
            tubeSweepMesh([
              [-0.16, 0.14, -0.24, 0.036],
              [-0.285, 0.06, -0.1, 0.036],
              [-0.305, 0.02, 0.1, 0.035],
              [-0.205, 0.05, 0.26, 0.034]
            ], 14, true),
            1,
            0.4
          ),
          4
        ),
        materialIndex: 4
      }
    ];
    return slots;
  }, { castShadow, receiveShadow: true });

  const headMesh = multiMatFromMemo("en-gunner-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.humanSkinTan,       // 0 sculpted rugged human face visible behind ballistic shield
    BZ_PROC_MATERIALS.humanSclera,        // 1 recessed sclera
    BZ_PROC_MATERIALS.humanEyeDark,       // 2 dark intense human eyes
    BZ_PROC_MATERIALS.darkBrowHair,       // 3 thick furrowed eyebrows & stubble shadow
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 4 heavy matte olive Altyn/EOD ballistic helmet dome
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 5 steel visor hinge brow-band & mandible cheek guards
    BZ_PROC_MATERIALS.coyoteMolle,        // 6 heavy chinstrap
    BZ_PROC_MATERIALS.smokedPolyVisor     // 7 translucent curved smoked polycarbonate ballistic face-shield (`opacity: 0.42`)
  ], () => {
    // Contoured heavy Altyn/EOD titanium ballistic helmet shell sculpted from `sculptStylizedHeadMesh` + `taubinSmoothMesh`
    const rawAltyn = sculptStylizedHeadMesh(0.168, {
      jawTaper: 0.06,
      cheekFullness: 0.16,
      noseBridge: 0.0,
      browRidge: 0.14,
      subdivisions: 2,
      seed: 59
    });
    const contouredAltyn = bakeMeshCavityAO(
      bzSmoothMesh(
        deformMesh(rawAltyn, ([x, y, z]) => {
          const ny = Math.max(0, (y + 0.168) / 0.336);
          // Open front visor cutout (`z > 0.035`) while wrapping deep around cheeks & nape (`maxY = 0.448` -> `2.068 m`)
          const faceCut = z > 0.035 ? 0.115 * Math.max(0, 1 - Math.pow(Math.abs(x) / 0.145, 2)) * (1 - ny * 0.7) : 0;
          const domeY = 0.135 + ny * 0.313 + faceCut;
          const skirtFlare = ny < 0.25 ? 1 + (0.25 - ny) * 0.16 : 1;
          return [x * 1.02 * skirtFlare, Math.min(0.448, domeY), z * 1.08 * skirtFlare + 0.005];
        }),
        5
      ),
      0.24
    );
    // Curved translucent smoked polycarbonate ballistic face-shield (`z ~ +0.168`, framing human face cleanly behind it!)
    const shieldSections: V3[][] = [0.055, 0.155, 0.255].map((vy) => {
      const ring: V3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = -0.44 * Math.PI + (i / 16) * 0.88 * Math.PI;
        ring.push([Math.sin(a) * 0.158, vy, Math.cos(a) * 0.156 + 0.025]);
      }
      for (let i = 16; i >= 0; i -= 1) {
        const a = -0.44 * Math.PI + (i / 16) * 0.88 * Math.PI;
        ring.push([Math.sin(a) * 0.148, vy, Math.cos(a) * 0.146 + 0.025]);
      }
      return ring;
    });
    // Top steel hinge rim for the polycarbonate shield
    const browBand: V3[][] = [0.245, 0.285].map((vy) => {
      const ring: V3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = -0.46 * Math.PI + (i / 16) * 0.92 * Math.PI;
        ring.push([Math.sin(a) * 0.166, vy, Math.cos(a) * 0.164 + 0.024]);
      }
      for (let i = 16; i >= 0; i -= 1) {
        const a = -0.46 * Math.PI + (i / 16) * 0.92 * Math.PI;
        ring.push([Math.sin(a) * 0.15, vy, Math.cos(a) * 0.148 + 0.024]);
      }
      return ring;
    });

    return [
      ...buildHumanSoldierHeadSlots({
        scale: 1.06,
        centerY: 0.165,
        centerZ: 0.015,
        seed: 23,
        skinIdx: 0,
        scleraIdx: 1,
        irisIdx: 2,
        browIdx: 3,
        strapIdx: 6
      }),
      // Contoured heavy Altyn/EOD ballistic helmet dome (`1.62 + 0.448 = 2.068 m`, inside `[1.95, 2.22]`)
      { mesh: contouredAltyn, materialIndex: 4 },
      // Contoured mandible cheek/ear bolsters + smooth visor hinge bracket
      { mesh: transformMesh(sculptContouredArmorPlate(0.048, 0.135, 0.125, 0.016, 0.01, 2, 5), { pos: [-0.145, 0.155, 0.02] }), materialIndex: 5 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.048, 0.135, 0.125, 0.016, 0.01, 2, 5), { pos: [0.145, 0.155, 0.02] }), materialIndex: 5 },
      { mesh: bzSmoothMesh(loftSectionsMesh(browBand, false, true), 3), materialIndex: 5 },
      // Smooth curved smoked polycarbonate ballistic face-shield (`opacity: 0.42` reveals human eyes, brows & nose clearly!)
      { mesh: bzSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(shieldSections, false, true), 1, 0.35), 3), materialIndex: 7 }
    ];
  }, { castShadow, receiveShadow: true });

  const armLeft = multiMatFromMemo("en-gunner-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 massive layered EOD shoulder pauldron
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 slate forearm brassard & elbow armor
    BZ_PROC_MATERIALS.darkFatigues,       // 2 muscular quilted woodland sleeve (`roughness: 0.84`)
    BZ_PROC_MATERIALS.leatherGloveTan,    // 3 heavy fingerless leather glove
    BZ_PROC_MATERIALS.humanSkinTan        // 4 exposed muscular human fingers gripping chainsaw handle
  ], () => [
    { mesh: transformMesh(sculptContouredArmorPlate(0.215, 0.21, 0.245, 0.04, 0.028, 2, 5), { pos: [0.035, 0.015, 0], rot: [0, 0, -0.24] }), materialIndex: 0 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.185, 0.115, 0.215, 0.026, 0.022, 2, 5), { pos: [0.055, -0.095, 0], rot: [0, 0, -0.18] }), materialIndex: 1 },
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          sculptOrientedLimbMesh([
            { pos: [0.02, -0.04, 0], rx: 0.082, rz: 0.086, bulge: 0.2 },
            { pos: [-0.04, -0.18, 0.085], rx: 0.076, rz: 0.08, bulge: 0.18 },
            { pos: [-0.13, -0.255, 0.215], rx: 0.068, rz: 0.072, bulge: 0.16 },
            { pos: [-0.225, -0.28, 0.34], rx: 0.056, rz: 0.06, bulge: 0.12 }
          ], 22),
          0.22
        ),
        10.5,
        2.4
      ),
      materialIndex: 2
    },
    { mesh: transformMesh(sculptContouredArmorPlate(0.094, 0.084, 0.1, 0.024, 0.012, 2, 5), { pos: [-0.245, -0.28, 0.365] }), materialIndex: 3 },
    { mesh: paintWarmSkinMesh(transformMesh(sculptContouredArmorPlate(0.072, 0.058, 0.064, 0.018, 0.01, 2, 5), { pos: [-0.255, -0.285, 0.405] })), materialIndex: 4 }
  ], { castShadow, receiveShadow: true });

  const armRightAndMinigunBody = multiMatFromMemo("en-gunner-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 massive layered EOD shoulder pauldron
    BZ_PROC_MATERIALS.darkFatigues,       // 1 muscular quilted woodland sleeve
    BZ_PROC_MATERIALS.leatherGloveTan,    // 2 heavy fingerless leather glove
    BZ_PROC_MATERIALS.humanSkinTan,       // 3 exposed human fingers on spade grip
    BZ_PROC_MATERIALS.darkSteelBrushed,   // 4 heavy rotary/SAW receiver drum, spade grip & chainsaw handle
    BZ_PROC_MATERIALS.brassStudio         // 5 brass feed-delinker block & casing chute
  ], () => [
    { mesh: transformMesh(sculptContouredArmorPlate(0.215, 0.21, 0.245, 0.04, 0.028, 2, 5), { pos: [-0.035, 0.015, 0], rot: [0, 0, 0.24] }), materialIndex: 0 },
    {
      mesh: paintWoodlandCamoMesh(
        bakeMeshCavityAO(
          sculptOrientedLimbMesh([
            { pos: [-0.02, -0.04, 0], rx: 0.082, rz: 0.086, bulge: 0.2 },
            { pos: [0.03, -0.19, 0.075], rx: 0.076, rz: 0.08, bulge: 0.18 },
            { pos: [0.125, -0.31, 0.195], rx: 0.064, rz: 0.068, bulge: 0.14 }
          ], 22),
          0.22
        ),
        10.5,
        3.8
      ),
      materialIndex: 1
    },
    { mesh: transformMesh(sculptContouredArmorPlate(0.092, 0.082, 0.098, 0.024, 0.012, 2, 5), { pos: [0.145, -0.325, 0.215] }), materialIndex: 2 },
    { mesh: paintWarmSkinMesh(transformMesh(sculptContouredArmorPlate(0.068, 0.056, 0.058, 0.018, 0.01, 2, 5), { pos: [0.16, -0.33, 0.25] })), materialIndex: 3 },
    // Heavy dark-gunmetal rotary/SAW suppression receiver + chainsaw top carry-bar + brass feed block
    {
      mesh: transformMesh(bzSmoothMesh(latheMesh([[0, -0.145], [0.098, -0.145], [0.098, 0.145], [0, 0.145]], 24), 2), {
        pos: [0.18, -0.35, 0.29],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 4
    },
    { mesh: transformMesh(sculptContouredArmorPlate(0.115, 0.105, 0.145, 0.016, 0.006, 1, 3), { pos: [0.088, -0.335, 0.28] }), materialIndex: 5 },
    {
      mesh: bzSmoothMesh(
        tubeSweepMesh([
          [0.095, -0.255, 0.335, 0.014], [0.095, -0.178, 0.36, 0.015],
          [0.265, -0.178, 0.36, 0.015], [0.265, -0.255, 0.335, 0.014]
        ], 12, true),
        2
      ),
      materialIndex: 4
    }
  ], { castShadow, receiveShadow: true });

  // 6-barrel Gatling cluster spinning cleanly around local `Z` (`ids.spec`)!
  const minigunBarrels = multiMatFromMemo("en-gunner-barrels", `${name} barrels-mesh`, [
    BZ_PROC_MATERIALS.darkSteelBrushed,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.muzzleCore
  ], () => {
    const slots: MultiMatSlot[] = [];
    const singleBarrel = transformMesh(latheMesh([[0.013, 0], [0.013, 0.54], [0.016, 0.55], [0.009, 0.56]], 14), {
      rot: [Math.PI * 0.5, 0, 0]
    });
    for (let b = 0; b < 6; b += 1) {
      const a = (b / 6) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(singleBarrel, { pos: [Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0] }),
        materialIndex: 0
      });
    }
    for (const cz of [0.16, 0.38, 0.51]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0, -0.016], [0.078, -0.016], [0.078, 0.016], [0, 0.016]], 20), {
          pos: [0, 0, cz],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      });
    }
    slots.push({
      mesh: transformMesh(latheMesh([[0.025, -0.01], [0.068, -0.01], [0.068, 0.012], [0.025, 0.012]], 18), {
        pos: [0, 0, 0.555],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 2
    });
    return slots;
  }, { castShadow, receiveShadow: true });

  return group(name, [
    group(`${name} rig`, [
      pelvisMesh,
      group(`${name} legL`, [makeHeavyLeg("L")]).position(0.175, 0, 0).runtime(bind(ids.legL, "legL")),
      group(`${name} legR`, [makeHeavyLeg("R")]).position(-0.175, 0, 0).runtime(bind(ids.legR, "legR")),
      group(`${name} torso`, [
        torsoMesh,
        group(`${name} head`, [headMesh]).position(0, 0.6, 0).runtime(bind(ids.head, "head")),
        group(`${name} armL`, [armLeft]).position(0.33, 0.48, 0).runtime(bind(ids.armL, "armL")),
        group(`${name} armR`, [
          armRightAndMinigunBody,
          group(`${name} barrels`, [minigunBarrels]).position(0.18, -0.35, 0.43).runtime(bind(ids.spec, "spec"))
        ]).position(-0.33, 0.48, 0).runtime(bind(ids.armR, "armR"))
      ]).position(0, 0.06, 0).runtime(bind(ids.torso, "torso"))
    ]).position(0, 0.96, 0).runtime(bind(ids.rig, "rig"))
  ]).runtime(bind(ids.body, "body"));
}

function buildWardenBossRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Imposing `3.03 m` scarred human Bunker Commander in tailored charcoal-and-crimson trench-coat & officer beret/cap:
  // `rig` sits at `y = 1.40`, officer jackboot sole bottom sits at `-1.400` -> `1.40 - 1.40 = 0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 0 tailored charcoal officer riding breeches (`roughness: 0.85`)
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 1 crimson general's trouser piping stripe
    BZ_PROC_MATERIALS.wardenExoArmor,      // 2 contoured dark-slate knee armor caps
    BZ_PROC_MATERIALS.leatherBootBlack,    // 3 tall grained black leather officer jackboots
    BZ_PROC_MATERIALS.polymerGrip,         // 4 grounded lugged officer boot sole (`minY = 0`)
    BZ_PROC_MATERIALS.brassStudio          // 5 brass jackboot ankle & calf buckles
  ];
  const makeWardenLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-warden-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const s = side === "L" ? 1 : -1;
      // Tailored flared officer riding breeches (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
      const ridingBreeches = bakeMeshCavityAO(
        bzSmoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: -0.56, rx: 0.145, rz: 0.152, zBias: 0.008, foldAmp: 0.014 },
              { y: -0.34, rx: 0.186, rz: 0.19, xBias: 0.014 * s, zBias: 0.01, foldAmp: 0.024 },
              { y: -0.16, rx: 0.192, rz: 0.194, xBias: 0.012 * s, zBias: 0.008, foldAmp: 0.022 },
              { y: 0.06, rx: 0.175, rz: 0.185, zBias: -0.006, foldAmp: 0.014 }
            ],
            { segments: 26, foldCount: 6, seed: side === "L" ? 61 : 67 }
          ),
          4
        ),
        0.24
      );
      const jackbootShaftStations: AnatomicalStation[] = [
        { pos: [0, -0.58, 0.008], rx: 0.142, rz: 0.152, zOffset: 0.006 },
        { pos: [0, -0.84, -0.008], rx: 0.146, rz: 0.158, zOffset: -0.008 },
        { pos: [0, -1.08, 0], rx: 0.118, rz: 0.128, zOffset: 0.004 }
      ];
      return [
        { mesh: ridingBreeches, materialIndex: 0 },
        // Crimson general's outer seam piping
        {
          mesh: bzSmoothMesh(
            tubeSweepMesh([
              [s * 0.172, 0.02, 0, 0.014],
              [s * 0.196, -0.26, 0.01, 0.015],
              [s * 0.144, -0.55, 0.012, 0.013]
            ], 10, true),
            3
          ),
          materialIndex: 1
        },
        // Compound-curved dark-slate knee cap + tall polished black leather jackboot shaft
        { mesh: transformMesh(sculptContouredArmorPlate(0.205, 0.22, 0.095, 0.028, 0.032, 2, 5), { pos: [0, -0.58, 0.135], rot: [-0.1, 0, 0] }), materialIndex: 2 },
        {
          mesh: bakeMeshCavityAO(
            bzSmoothMesh(sculptAnatomicalLimbMesh(jackbootShaftStations, { ringPoints: 24, muscleBiasZ: -0.15 }), 4),
            0.22
          ),
          materialIndex: 3
        },
        { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.138, -0.02], [0.154, 0], [0.138, 0.02]], 22), 3), { pos: [0, -0.62, 0.006] }), materialIndex: 5 },
        ...sculptCombatBootSlots(-1.4, 1.56, 3, 4, 5)
      ];
    }, { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-warden-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 0 flared pleated charcoal trench-coat skirt & tails
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 1 crimson inner coat lining & ceremonial sash
    BZ_PROC_MATERIALS.leatherBootBlack,    // 2 heavy Sam Browne leather officer belt & sidearm holster
    BZ_PROC_MATERIALS.brassStudio          // 3 ornate brass officer belt clasp & dagger hilt
  ], () => {
    // Draped split-front flared officer trench-coat lower skirt (`sculptDrapedGarmentMesh` with `openFrontArc` + `taubinSmoothMesh`)
    const greatcoatSkirt = bakeMeshCavityAO(
      bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.46, rx: 0.425, rz: 0.315, zBias: -0.012, foldAmp: 0.034 },
            { y: -0.22, rx: 0.368, rz: 0.278, zBias: -0.008, foldAmp: 0.028 },
            { y: 0.02, rx: 0.312, rz: 0.23, foldAmp: 0.018 },
            { y: 0.11, rx: 0.298, rz: 0.218, foldAmp: 0.012 }
          ],
          {
            segments: 32,
            foldCount: 8,
            wallThickness: 0.026,
            openFrontArc: 0.34 * Math.PI,
            frontCenterAngle: Math.PI * 0.5,
            seed: 71
          }
        ),
        5
      ),
      0.26
    );

    return [
      { mesh: greatcoatSkirt, materialIndex: 0 },
      // Contoured crimson inner coat lapel facings along front split + draped crimson officer waist sash
      { mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.48, 0.055, 0.018, 0.012, 2, 5), { pos: [-0.175, -0.19, 0.235], rot: [0.08, 0.2, 0.08] }), materialIndex: 1 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.068, 0.48, 0.055, 0.018, 0.012, 2, 5), { pos: [0.175, -0.19, 0.235], rot: [0.08, -0.2, -0.08] }), materialIndex: 1 },
      {
        mesh: bzSmoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.01, rx: 0.314, rz: 0.234, foldAmp: 0.014 },
              { y: 0.065, rx: 0.32, rz: 0.24, foldAmp: 0.016 },
              { y: 0.115, rx: 0.31, rz: 0.23, foldAmp: 0.012 }
            ],
            { segments: 28, foldCount: 7, seed: 73 }
          ),
          4
        ),
        materialIndex: 1
      },
      // Heavy black leather officer belt + ornate brass buckle + molded command sidearm holster + ceremonial dagger
      { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.305, -0.035], [0.326, 0], [0.305, 0.035]], 26), 3), { pos: [0, 0.065, 0], scale: [1.0, 1.0, 0.74] }), materialIndex: 2 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.115, 0.088, 0.044, 0.012, 0.01, 1, 4), { pos: [0, 0.065, 0.246] }), materialIndex: 3 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.095, 0.24, 0.155, 0.026, 0.014, 2, 5), { pos: [-0.335, -0.08, 0.03], rot: [0.14, 0, 0.1] }), materialIndex: 2 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.022, 0.02], [0.018, 0.16], [0, 0.18]], 14), { pos: [0.315, -0.04, 0.09], rot: [0.35, 0, -0.22] }), materialIndex: 3 }
    ];
  }, { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-warden-torso-v2", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 0 tailored charcoal wool/kevlar command trench-coat torso & high collar
    BZ_PROC_MATERIALS.wardenExoArmor,      // 1 contoured dark-slate ballistic command cuirass
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 2 crimson coat lapels, collar lining & shoulder epaulettes
    BZ_PROC_MATERIALS.leatherBootBlack,    // 3 diagonal Sam Browne leather cross-strap
    BZ_PROC_MATERIALS.brassStudio          // 4 brass rank insignia, medals, double-breasted buttons & aiguillette cord
  ], () => {
    // High upturned crimson-lined officer trench-coat storm collar (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
    const stormCollar = bakeMeshCavityAO(
      bzSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.84, rx: 0.218, rz: 0.195, foldAmp: 0.01 },
            { y: 0.94, rx: 0.242, rz: 0.218, foldAmp: 0.012 },
            { y: 1.03, rx: 0.265, rz: 0.238, foldAmp: 0.01 }
          ],
          {
            segments: 28,
            foldCount: 5,
            wallThickness: 0.024,
            openFrontArc: 0.4 * Math.PI,
            frontCenterAngle: Math.PI * 0.5,
            seed: 79
          }
        ),
        4
      ),
      0.24
    );

    const slots: MultiMatSlot[] = [
      // Broad-shouldered V-tapered commander greatcoat torso (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
      {
        mesh: bakeMeshCavityAO(
          bzSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: 0, rx: 0.306, rz: 0.224, foldAmp: 0.018 },
                { y: 0.34, rx: 0.398, rz: 0.27, zBias: 0.008, foldAmp: 0.022 },
                { y: 0.72, rx: 0.448, rz: 0.288, zBias: 0.008, foldAmp: 0.018 },
                { y: 0.92, rx: 0.312, rz: 0.206, foldAmp: 0.012 }
              ],
              { segments: 30, foldCount: 6, seed: 83 }
            ),
            5
          ),
          0.24
        ),
        materialIndex: 0
      },
      // Compound-curved dark-slate armored command chest cuirass + contoured back plate
      // Conformal front/back cuirass shells lofted just outside the greatcoat surface (no box-plate silhouette).
      ...([Math.PI * 1.5, Math.PI * 0.5] as const).map((gapCenter) => ({
        mesh: bakeMeshCavityAO(
          sculptDrapedGarmentMesh(
            [
              { y: 0.27, rx: 0.392, rz: 0.282, zBias: 0.008, foldAmp: 0 },
              { y: 0.42, rx: 0.418, rz: 0.298, zBias: 0.008, foldAmp: 0 },
              { y: 0.6, rx: 0.446, rz: 0.306, zBias: 0.008, foldAmp: 0 },
              { y: 0.74, rx: 0.432, rz: 0.29, zBias: 0.006, foldAmp: 0 },
              { y: 0.8, rx: 0.39, rz: 0.262, zBias: 0.004, foldAmp: 0 }
            ],
            { segments: 30, foldCount: 0, wallThickness: 0.03, openFrontArc: Math.PI * 1.08, frontCenterAngle: gapCenter, seed: 87, smoothPasses: 4 }
          ),
          0.2
        ),
        materialIndex: 1
      })),
      // Upturned trench-coat storm collar + contoured folded crimson storm lapels (`+Z`)
      { mesh: stormCollar, materialIndex: 0 },
      {
        // Curved crimson storm lapel lying on the cuirass (tapered sculpted strip, no flat plate).
        mesh: sculptCurvedHairLockMesh({
          root: [-0.200, 0.83, 0.25],
          mid: [-0.170, 0.66, 0.318],
          tip: [-0.070, 0.47, 0.33],
          width: 0.11,
          thickness: 0.024,
          segments: 12,
          radialSegments: 10
        }),
        materialIndex: 2
      },
      {
        // Curved crimson storm lapel lying on the cuirass (tapered sculpted strip, no flat plate).
        mesh: sculptCurvedHairLockMesh({
          root: [0.200, 0.83, 0.25],
          mid: [0.170, 0.66, 0.318],
          tip: [0.070, 0.47, 0.33],
          width: 0.11,
          thickness: 0.024,
          segments: 12,
          radialSegments: 10
        }),
        materialIndex: 2
      },
      // Diagonal Sam Browne black leather officer cross-belt
      {
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [0.32, 0.88, 0.08, 0.026], [0.12, 0.56, 0.326, 0.028],
            [-0.18, 0.18, 0.255, 0.026], [-0.28, 0.04, 0.06, 0.024],
            [-0.14, 0.38, -0.265, 0.026], [0.24, 0.84, -0.14, 0.026]
          ], 12, true),
          3
        ),
        materialIndex: 3
      },
      // Golden brass command star/eagle chest insignia + braided aiguillette cord loop
      { mesh: transformMesh(sculptContouredArmorPlate(0.145, 0.052, 0.028, 0.007, 0.008, 1, 3), { pos: [0.195, 0.68, 0.3], rot: [0.08, -0.16, 0] }), materialIndex: 4 },
      {
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [-0.38, 0.84, 0.06, 0.013], [-0.31, 0.56, 0.255, 0.014],
            [-0.16, 0.48, 0.295, 0.013], [-0.04, 0.64, 0.326, 0.012]
          ], 12, true),
          3
        ),
        materialIndex: 4
      }
    ];
    // Contoured crimson shoulder epaulettes + brass bullion fringes + 6 double-breasted brass coat buttons
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.24, 0.042, 0.14, 0.014, 0.012, 2, 4), { pos: [sx * 0.34, 0.885, 0.01], rot: [0, 0, sx * -0.18] }),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(sculptContouredArmorPlate(0.065, 0.054, 0.155, 0.014, 0.008, 1, 4), { pos: [sx * 0.455, 0.855, 0.01], rot: [0, 0, sx * -0.24] }),
        materialIndex: 4
      });
      for (const by of [0.24, 0.39, 0.54]) {
        slots.push({
          mesh: transformMesh(latheMesh([[0, 0], [0.022, 0], [0.022, 0.016], [0, 0.018]], 14), {
            pos: [sx * 0.115, by, 0.314],
            rot: [Math.PI * 0.5, 0, 0]
          }),
          materialIndex: 4
        });
      }
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  // Dorsal tactical command radio / flare pack (`ids.spec` — articulates during volleys & vulnerable phase!)
  const shoulderPodsMesh = multiMatFromMemo("en-warden-pods", `${name} pods-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,      // 0 rugged dark-slate dorsal command comms pack
    BZ_PROC_MATERIALS.coyoteMolle,         // 1 strapped command map case & utility pouches
    BZ_PROC_MATERIALS.darkSteelBrushed,    // 2 twin dorsal whip antennas & cooling louvers
    BZ_PROC_MATERIALS.brassStudio,         // 3 brass antenna bases & command clasps
    BZ_PROC_MATERIALS.reactorCrimson       // 4 practical crimson tactical power-core indicator (`vulnerableT`)
  ], () => [
    { mesh: transformMesh(sculptContouredArmorPlate(0.46, 0.48, 0.2, 0.032, -0.028, 2, 5), { pos: [0, -0.28, -0.27] }), materialIndex: 0 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.38, 0.16, 0.095, 0.022, -0.018, 2, 5), { pos: [0, -0.44, -0.37] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.032, 0], [0.026, 0.055], [0, 0.055]], 14), { pos: [-0.16, -0.04, -0.26] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.032, 0], [0.026, 0.055], [0, 0.055]], 14), { pos: [0.16, -0.04, -0.26] }), materialIndex: 3 },
    { mesh: tubeSweepMesh([[-0.16, 0.01, -0.26, 0.012], [-0.18, 0.32, -0.29, 0.008], [-0.195, 0.61, -0.32, 0.004]], 8, true), materialIndex: 2 },
    { mesh: tubeSweepMesh([[0.16, 0.01, -0.26, 0.012], [0.18, 0.26, -0.28, 0.008], [0.19, 0.48, -0.3, 0.004]], 8, true), materialIndex: 2 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.18, 0.068, 0.04, 0.008, -0.006, 1, 3), { pos: [0, -0.2, -0.365] }), materialIndex: 4 }
  ], { castShadow, receiveShadow: true });

  // Scarred human Bunker Commander head + tactical eyepatch/headset + crimson-and-charcoal elite officer cap/beret (`maxY = 3.03 m`)
  const headMesh = multiMatFromMemo("en-warden-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.humanSkinScarred,    // 0 sculpted weathered scarred human face, jaw, nose & neck (`subdivisions: 2`)
    BZ_PROC_MATERIALS.humanSclera,         // 1 fierce left eye sclera
    BZ_PROC_MATERIALS.humanEyeDark,        // 2 dark intense commander iris
    BZ_PROC_MATERIALS.darkBrowHair,        // 3 thick dark brow, cropped temple hair & stubble
    BZ_PROC_MATERIALS.leatherBootBlack,    // 4 tactical leather eyepatch, cap visor peak & chin cord
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 5 crimson elite officer peaked cap / beret crown & facial scar
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 6 charcoal officer cap band
    BZ_PROC_MATERIALS.darkSteelBrushed,    // 7 tactical single-ear comms headset & boom microphone
    BZ_PROC_MATERIALS.brassStudio,         // 8 ornate brass eagle/star officer cap badge
    BZ_PROC_MATERIALS.visorCrimson         // 9 tiny crimson optical targeter lens pip on eyepatch (`practical: true`)
  ], () => {
    // Sculpted flared crimson elite officer peaked-cap / beret crown (`2.48 + 0.55 = 3.03 m`, inside `[2.90, 3.25]`)
    const capBandProf: V2[] = [[0.165, 0.3], [0.182, 0.325], [0.184, 0.385], [0.172, 0.395]];
    const capCrownRings: V3[][] = [
      ellipticalRings([[0.385, 0.18, 0.194, 0.015]], 28, 2, 0.014)[0]!,
      ellipticalRings([[0.455, 0.23, 0.244, 0.032]], 28, 3, 0.022)[0]!,
      ellipticalRings([[0.515, 0.186, 0.206, 0.042]], 28, 2, 0.018)[0]!,
      ellipticalRings([[0.548, 0.045, 0.055, 0.045]], 28, 1, 0.008)[0]!
    ];
    // Curved glossy black leather officer visor peak (`+Z`)
    const visorPeakRings: V3[][] = [0.305, 0.322].map((vy) => {
      const ring: V3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = -0.38 * Math.PI + (i / 16) * 0.76 * Math.PI;
        ring.push([Math.sin(a) * 0.178, vy - 0.028 * Math.cos(a), Math.cos(a) * 0.248 + 0.035]);
      }
      for (let i = 16; i >= 0; i -= 1) {
        const a = -0.38 * Math.PI + (i / 16) * 0.76 * Math.PI;
        ring.push([Math.sin(a) * 0.162, vy + 0.01, Math.cos(a) * 0.168 + 0.015]);
      }
      return ring;
    });

    const slots: MultiMatSlot[] = [
      ...buildHumanSoldierHeadSlots({
        scale: 1.48,
        centerY: 0.215,
        centerZ: 0.02,
        seed: 37,
        skinIdx: 0,
        scleraIdx: 1,
        irisIdx: 2,
        browIdx: 3,
        strapIdx: 4,
        eyepatch: true,
        scarIdx: 5
      }),
      // Cropped dark hair around back/sides of cranium beneath cap band + swept temple hair locks
      {
        mesh: bzSmoothMesh(
          subdivideSmoothMesh(
            transformMesh(latheMesh([[0.138, 0.17], [0.162, 0.23], [0.164, 0.305]], 24), { pos: [0, 0, -0.008], scale: [0.98, 1.0, 1.04] }),
            1,
            0.46
          ),
          4
        ),
        materialIndex: 3
      },
      // Tiny crimson optical rangefinder pip on right-eye tactical eyepatch
      { mesh: transformMesh(bzSmoothSphereMesh(0.009, 2), { pos: [-0.056, 0.242, 0.178] }), materialIndex: 9 },
      // Left-ear contoured tactical comms headset cup + smooth boom microphone curving to mouth
      { mesh: transformMesh(sculptContouredArmorPlate(0.056, 0.115, 0.092, 0.02, 0.01, 2, 5), { pos: [0.165, 0.218, 0.005] }), materialIndex: 7 },
      {
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [0.162, 0.185, 0.035, 0.009],
            [0.145, 0.145, 0.135, 0.008],
            [0.058, 0.132, 0.182, 0.011]
          ], 10, true),
          3
        ),
        materialIndex: 7
      },
      // Charcoal officer cap band + slanted crimson peaked cap / beret crown + curved black visor peak + brass eagle crest!
      {
        mesh: bzSmoothMesh(
          subdivideSmoothMesh(transformMesh(latheMesh(capBandProf, 26), { pos: [0, 0, 0.012], scale: [1.0, 1.0, 1.08] }), 1, 0.44),
          4
        ),
        materialIndex: 6
      },
      {
        mesh: bakeMeshCavityAO(
          transformMesh(
            bzSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(capCrownRings, true, true), 1, 0.5), 5),
            { rot: [0.06, 0, -0.08] }
          ),
          0.22
        ),
        materialIndex: 5
      },
      { mesh: bzSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(visorPeakRings, false, true), 1, 0.42), 4), materialIndex: 4 },
      // Gold chin cord across front of cap band + contoured brass command badge
      {
        mesh: bzSmoothMesh(
          tubeSweepMesh([
            [-0.165, 0.325, 0.06, 0.009], [-0.095, 0.312, 0.185, 0.01],
            [0, 0.308, 0.215, 0.01], [0.095, 0.312, 0.185, 0.01], [0.165, 0.325, 0.06, 0.009]
          ], 10, true),
          3
        ),
        materialIndex: 8
      },
      { mesh: transformMesh(sculptContouredArmorPlate(0.092, 0.076, 0.028, 0.008, 0.008, 1, 4), { pos: [0, 0.415, 0.228], rot: [-0.14, 0, 0] }), materialIndex: 8 }
    ];
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: bzSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [sx * 0.148, 0.295, 0.055],
            mid: [sx * 0.156, 0.255, 0.078],
            tip: [sx * 0.146, 0.215, 0.088],
            width: 0.032,
            thickness: 0.018,
            segments: 7
          }),
          3
        ),
        materialIndex: 3
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const armLeft = multiMatFromMemo("en-warden-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 0 tailored charcoal officer trench-coat sleeve
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 1 upturned crimson cuff & shoulder piping
    BZ_PROC_MATERIALS.wardenExoArmor,      // 2 contoured dark-slate shoulder/elbow guard
    BZ_PROC_MATERIALS.leatherBootBlack,    // 3 black leather officer gauntlet glove
    BZ_PROC_MATERIALS.brassStudio          // 4 brass cuff buttons
  ], () => [
    { mesh: transformMesh(sculptContouredArmorPlate(0.24, 0.22, 0.26, 0.04, 0.032, 2, 5), { pos: [0.03, 0.02, 0], rot: [0, 0, -0.2] }), materialIndex: 2 },
    {
      mesh: bakeMeshCavityAO(
        sculptOrientedLimbMesh([
          { pos: [0.02, -0.03, 0], rx: 0.118, rz: 0.124, bulge: 0.18 },
          { pos: [0.045, -0.26, 0.085], rx: 0.11, rz: 0.116, bulge: 0.18 },
          { pos: [0.02, -0.44, 0.24], rx: 0.098, rz: 0.104, bulge: 0.15 },
          { pos: [-0.035, -0.51, 0.41], rx: 0.092, rz: 0.096, bulge: 0.12 }
        ], 22),
        0.22
      ),
      materialIndex: 0
    },
    // Upturned crimson officer sleeve cuff + brass cuff buttons + sculpted black leather gauntlet glove
    {
      mesh: sculptOrientedLimbMesh([
        { pos: [0.0, -0.465, 0.3], rx: 0.104, rz: 0.108, bulge: 0.08 },
        { pos: [-0.032, -0.505, 0.395], rx: 0.1, rz: 0.104, bulge: 0.08 }
      ], 22),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.024, 0.024, 0.065, 0.005), { pos: [0.088, -0.485, 0.35] }), materialIndex: 4 },
    { mesh: transformMesh(sculptContouredArmorPlate(0.135, 0.125, 0.165, 0.032, 0.018, 2, 5), { pos: [-0.055, -0.525, 0.465] }), materialIndex: 3 }
  ], { castShadow, receiveShadow: true });

  // Right tailored trench-coat arm + drum-fed twin-barrel heavy assault cannon aimed along `+Z`!
  const armRightAndTwinCannon = multiMatFromMemo("en-warden-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.officerCharcoalCoat, // 0 tailored charcoal officer trench-coat sleeve
    BZ_PROC_MATERIALS.officerCrimsonCloth, // 1 crimson officer cuff
    BZ_PROC_MATERIALS.leatherBootBlack,    // 2 black leather officer shooting glove & cheek stock
    BZ_PROC_MATERIALS.darkSteelBrushed,    // 3 heavy assault weapon receiver, twin fluted barrels & muzzle brakes
    BZ_PROC_MATERIALS.brassStudio,         // 4 brass drum magazine trim, cooling shroud & receiver engravings
    BZ_PROC_MATERIALS.muzzleCore           // 5 twin practical muzzle ports
  ], () => {
    const barrelProf: V2[] = [[0.028, 0], [0.028, 0.56], [0.038, 0.58], [0.038, 0.66], [0.022, 0.68]];
    const barrelMesh = transformMesh(latheMesh(barrelProf, 18), { rot: [Math.PI * 0.5, 0, 0] });
    return [
      {
        mesh: bakeMeshCavityAO(
          sculptOrientedLimbMesh([
            { pos: [-0.02, -0.03, 0], rx: 0.118, rz: 0.124, bulge: 0.18 },
            { pos: [-0.035, -0.25, 0.08], rx: 0.11, rz: 0.116, bulge: 0.18 },
            { pos: [0.015, -0.42, 0.28], rx: 0.096, rz: 0.102, bulge: 0.14 }
          ], 22),
          0.22
        ),
        materialIndex: 0
      },
      {
        mesh: sculptOrientedLimbMesh([
          { pos: [-0.005, -0.37, 0.21], rx: 0.104, rz: 0.108, bulge: 0.08 },
          { pos: [0.018, -0.425, 0.295], rx: 0.1, rz: 0.104, bulge: 0.08 }
        ], 22),
        materialIndex: 1
      },
      { mesh: transformMesh(sculptContouredArmorPlate(0.135, 0.12, 0.155, 0.032, 0.018, 2, 5), { pos: [0.03, -0.44, 0.34] }), materialIndex: 2 },
      // Heavy machined dark-gunmetal twin-barrel assault rifle/cannon + drum magazine + brass barrel shroud
      { mesh: transformMesh(sculptContouredArmorPlate(0.22, 0.2, 0.48, 0.026, 0.01, 1, 3), { pos: [0.04, -0.43, 0.45] }), materialIndex: 3 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.11, 0.18, 0.24, 0.024, 0.008, 1, 4), { pos: [0.04, -0.46, 0.16] }), materialIndex: 2 },
      { mesh: transformMesh(bzSmoothMesh(latheMesh([[0, -0.085], [0.145, -0.085], [0.145, 0.085], [0, 0.085]], 24), 2), { pos: [0.04, -0.58, 0.48], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 3 },
      { mesh: transformMesh(bzSmoothMesh(latheMesh([[0.138, -0.02], [0.152, 0], [0.138, 0.02]], 24), 2), { pos: [0.04, -0.58, 0.48], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 },
      { mesh: transformMesh(sculptContouredArmorPlate(0.21, 0.135, 0.26, 0.02, 0.008, 1, 3), { pos: [0.04, -0.43, 0.69] }), materialIndex: 4 },
      { mesh: transformMesh(barrelMesh, { pos: [-0.03, -0.43, 0.54] }), materialIndex: 3 },
      { mesh: transformMesh(barrelMesh, { pos: [0.11, -0.43, 0.54] }), materialIndex: 3 },
      { mesh: transformMesh(bzSmoothSphereMesh(0.02, 2), { pos: [-0.03, -0.43, 1.215] }), materialIndex: 5 },
      { mesh: transformMesh(bzSmoothSphereMesh(0.02, 2), { pos: [0.11, -0.43, 1.215] }), materialIndex: 5 }
    ];
  }, { castShadow, receiveShadow: true });

  return group(name, [
    group(`${name} rig`, [
      pelvisMesh,
      group(`${name} legL`, [makeWardenLeg("L")]).position(0.28, 0, 0).runtime(bind(ids.legL, "legL")),
      group(`${name} legR`, [makeWardenLeg("R")]).position(-0.28, 0, 0).runtime(bind(ids.legR, "legR")),
      group(`${name} torso`, [
        torsoMesh,
        group(`${name} pods`, [shoulderPodsMesh]).position(0, 0.86, -0.04).runtime(bind(ids.spec, "spec")),
        group(`${name} head`, [headMesh]).position(0, 0.98, 0.04).runtime(bind(ids.head, "head")),
        group(`${name} armL`, [armLeft]).position(0.52, 0.72, 0).runtime(bind(ids.armL, "armL")),
        group(`${name} armR`, [armRightAndTwinCannon]).position(-0.52, 0.72, 0).runtime(bind(ids.armR, "armR"))
      ]).position(0, 0.1, 0).runtime(bind(ids.torso, "torso"))
    ]).position(0, 1.4, 0).runtime(bind(ids.rig, "rig"))
  ]).runtime(bind(ids.body, "body"));
}

/** Builds any of the 4 sculpted, multi-material, hierarchically articulated enemy rigs (`guard`, `dog`, `gunner`, `boss`). */
export function buildArticulatedEnemyNode(
  kind: BunkerEnemyKind,
  name: string,
  bindRuntime?: EnemyRuntimeBinder,
  bodyId = name,
  castShadow = true
): AuraNodeBuilder<AuraSceneNode> {
  const ids = makeEnemyRigIds(bodyId);
  const bind: EnemyRuntimeBinder = bindRuntime ?? ((partId, part) => game.runtimeNode(partId, { tags: ["enemy", kind, part] }));
  switch (kind) {
    case "dog":
      return buildRoboHoundRigNodes(ids, name, bind, castShadow);
    case "gunner":
      return buildHeavyGunnerRigNodes(ids, name, bind, castShadow);
    case "boss":
      return buildWardenBossRigNodes(ids, name, bind, castShadow);
    default:
      return buildGuardRigNodes(ids, name, bind, castShadow);
  }
}

export const buildGuardEnemyNode = (name = "guard", bind?: EnemyRuntimeBinder, bodyId = name, castShadow = true) =>
  buildArticulatedEnemyNode("guard", name, bind, bodyId, castShadow);
export const buildRoboHoundEnemyNode = (name = "robo-hound", bind?: EnemyRuntimeBinder, bodyId = name, castShadow = true) =>
  buildArticulatedEnemyNode("dog", name, bind, bodyId, castShadow);
export const buildHeavyGunnerEnemyNode = (name = "heavy-gunner", bind?: EnemyRuntimeBinder, bodyId = name, castShadow = true) =>
  buildArticulatedEnemyNode("gunner", name, bind, bodyId, castShadow);
export const buildWardenBossNode = (name = "iron-warden", bind?: EnemyRuntimeBinder, bodyId = name, castShadow = true) =>
  buildArticulatedEnemyNode("boss", name, bind, bodyId, castShadow);

export interface EnemyPoseInput {
  readonly kind: BunkerEnemyKind;
  readonly state: "idle" | "patrol" | "alert" | "chase" | "attack" | "pain" | "dead";
  readonly time: number;
  readonly stateT: number;
  readonly painT: number;
  readonly deathT: number;
  readonly vulnerableT?: number;
  readonly phaseSeed?: number;
  readonly aimPitch?: number;
}

export interface EnemyRigPose {
  readonly rigPos: V3;
  readonly rigRot: V3;
  readonly torsoRot: V3;
  readonly headRot: V3;
  readonly armLRot: V3;
  readonly armRRot: V3;
  readonly legLRot: V3;
  readonly legRRot: V3;
  readonly specRot: V3;
  readonly specScale: V3;
}

/**
 * Pure, deterministic `"ZYX"` Euler pose solver for all 4 articulated enemy rigs.
 * Zero state mutation and zero cumulative angle integration — identical inputs always yield identical poses.
 */
export function computeEnemyRigPose(inp: EnemyPoseInput): EnemyRigPose {
  const seed = inp.phaseSeed ?? 0;
  const sideSign = (Math.floor(Math.abs(seed) * 7 + 1) % 2 === 0) ? 1 : -1;
  const restY = inp.kind === "boss" ? 1.4 : inp.kind === "gunner" ? 0.96 : inp.kind === "dog" ? 0.52 : 0.94;
  const aim = Math.max(-0.38, Math.min(0.38, inp.aimPitch ?? 0));

  // Death collapse: eases cleanly onto the concrete floor (`y >= 0`) with zero floor-clipping sink.
  if (inp.state === "dead") {
    const raw = Math.max(0, Math.min(1, inp.deathT / 0.44));
    const k = 1 - Math.pow(1 - raw, 3);
    if (inp.kind === "dog") {
      return {
        rigPos: [0, restY * (1 - k) + 0.15 * k, 0.08 * k],
        rigRot: [0.16 * k, 0, 1.28 * k * sideSign],
        torsoRot: [0.08 * k, 0.1 * k * sideSign, 0],
        headRot: [0.22 * k, 0.18 * k * sideSign, 0],
        legLRot: [-0.42 * k, 0, 0.35 * k],
        legRRot: [0.36 * k, 0, -0.35 * k],
        armLRot: [0.44 * k, 0, 0.32 * k],
        armRRot: [-0.32 * k, 0, -0.32 * k],
        specRot: [0.28 * k, 0, 0],
        specScale: [1, 1, 1]
      };
    }
    const downY = inp.kind === "boss" ? 0.28 : inp.kind === "gunner" ? 0.2 : 0.16;
    return {
      rigPos: [0, restY * (1 - k) + downY * k, 0.14 * k],
      rigRot: [1.45 * k, 0, 0.15 * k * sideSign],
      torsoRot: [0.08 * k, 0.12 * k * sideSign, 0],
      headRot: [0.2 * k, 0.22 * k * sideSign, 0],
      armLRot: [-1.05 * k, 0.18 * k, 0.24 * k],
      armRRot: [-1.14 * k, -0.14 * k, -0.2 * k],
      legLRot: [0.14 * k, 0, 0.14 * k],
      legRRot: [-0.08 * k, 0, -0.14 * k],
      specRot: [0, 0, 0],
      specScale: [1, 1, 1]
    };
  }

  const flinch = inp.state === "pain" || inp.painT > 0 ? Math.max(0, Math.min(1, inp.painT / 0.26)) : 0;

  // Quadruped Cyber-Hound (`dog`): diagonal trot, bounding chase gallop, snapping-jaw attack lunge
  if (inp.kind === "dog") {
    const moving = inp.state === "patrol" || inp.state === "chase" || inp.state === "alert";
    const freq = inp.state === "chase" ? 13.5 : inp.state === "alert" ? 10.5 : 8.2;
    const amp = inp.state === "chase" ? 0.56 : inp.state === "alert" ? 0.42 : moving ? 0.34 : 0;
    const ph = inp.time * freq + seed;
    const s1 = Math.sin(ph);
    const c1 = Math.cos(ph);
    const gallop = inp.state === "chase";
    let fl = gallop ? s1 * amp : s1 * amp;
    let fr = gallop ? Math.sin(ph + 0.45) * amp : -s1 * amp;
    let bl = gallop ? -Math.sin(ph + 0.25) * amp : -s1 * amp;
    let br = gallop ? -Math.sin(ph + 0.7) * amp : s1 * amp;
    let rigY = restY + (moving ? Math.abs(c1) * (gallop ? 0.048 : 0.024) : Math.sin(inp.time * 2.8 + seed) * 0.008);
    let rigZ = 0;
    let torsoPitch = gallop ? s1 * 0.09 : moving ? c1 * 0.03 : 0;
    let headPitch = aim * 0.65 + (moving ? -torsoPitch * 0.5 : Math.sin(inp.time * 1.9 + seed) * 0.04);
    let headYaw = inp.state === "idle" || inp.state === "patrol" ? Math.sin(inp.time * 1.3 + seed) * 0.16 : 0;
    let jawPitch = gallop ? 0.18 + Math.abs(s1) * 0.14 : 0.04;

    if (inp.state === "attack") {
      const atkPhase = Math.min(1, (inp.stateT % 0.5) / 0.5);
      const lunge = Math.sin(atkPhase * Math.PI);
      rigZ = lunge * 0.24;
      rigY = restY + lunge * 0.06;
      torsoPitch = -lunge * 0.18 + (atkPhase > 0.5 ? 0.14 : 0);
      fl = -0.48 * lunge;
      fr = -0.44 * lunge;
      bl = 0.42 * lunge;
      br = 0.42 * lunge;
      headPitch = aim * 0.7 - lunge * 0.12;
      jawPitch = atkPhase < 0.52 ? 0.58 * Math.sin((atkPhase / 0.52) * Math.PI * 0.5) : 0.58 * Math.max(0, 1 - (atkPhase - 0.52) * 3.2);
    }

    return {
      rigPos: [0, rigY, rigZ - flinch * 0.06],
      rigRot: [-flinch * 0.22, 0, flinch * 0.12 * sideSign],
      torsoRot: [torsoPitch, moving ? s1 * 0.04 : 0, moving ? s1 * 0.035 : 0],
      headRot: [headPitch - flinch * 0.18, headYaw, 0],
      legLRot: [fl, 0, 0],
      legRRot: [fr, 0, 0],
      armLRot: [bl, 0, 0],
      armRRot: [br, 0, 0],
      specRot: [jawPitch + flinch * 0.25, 0, 0],
      specScale: [1, 1, 1]
    };
  }

  // Bipeds (`guard`, `gunner`, `boss`): grounded stride cycle, torso aim/lean, recoil/minigun-spin/warden-pods
  const isBoss = inp.kind === "boss";
  const isGunner = inp.kind === "gunner";
  const moving = inp.state === "patrol" || inp.state === "chase" || inp.state === "alert";
  const freq = inp.state === "chase"
    ? (isBoss ? 6.8 : isGunner ? 7.6 : 9.6)
    : inp.state === "alert"
      ? 7.8
      : (isBoss ? 4.8 : isGunner ? 5.6 : 6.6);
  const legAmp = inp.state === "chase"
    ? (isBoss ? 0.34 : isGunner ? 0.38 : 0.48)
    : inp.state === "alert"
      ? 0.32
      : moving ? (isBoss ? 0.24 : isGunner ? 0.28 : 0.34) : 0;
  const ph = inp.time * freq + seed;
  const stride = moving ? Math.sin(ph) : 0;
  const breathe = Math.sin(inp.time * 2.2 + seed);
  const hipDip = moving ? (1 - Math.cos(legAmp * Math.abs(stride))) * 0.26 : 0;
  const stepLift = moving ? Math.abs(Math.cos(ph)) * (isBoss ? 0.032 : 0.024) : 0;

  let torsoPitch = inp.state === "chase" ? 0.1 : moving ? 0.05 : breathe * 0.015;
  let torsoYaw = moving ? -stride * 0.075 : 0;
  let torsoRoll = moving ? stride * (isBoss ? 0.04 : 0.028) : 0;
  let headYaw = (inp.state === "idle" || inp.state === "patrol") ? Math.sin(inp.time * 1.15 + seed) * 0.15 : -torsoYaw * 0.6;
  let headPitch = aim * 0.55 - torsoPitch * 0.4;
  let armLPitch = aim * 0.65 - stride * (moving ? 0.1 : 0) + breathe * 0.012;
  let armRPitch = aim * 0.65 - stride * (moving ? 0.08 : 0) + breathe * 0.012;
  let armLRoll = 0;
  let armRRoll = 0;
  let specRot: V3 = [0, 0, 0];
  let specScale: V3 = [1, 1, 1];

  if (inp.state === "attack") {
    torsoPitch = isBoss ? 0.08 : 0.11;
    if (isGunner) {
      const shudder = Math.sin(inp.time * 52) * 0.028;
      armRPitch = aim * 0.7 - 0.05 + shudder;
      armLPitch = aim * 0.7 - 0.05 - shudder * 0.6;
      torsoYaw = Math.sin(inp.time * 6.5) * 0.05;
      // High-speed 6-barrel Gatling spin around `+Z`!
      specRot = [0, 0, inp.time * 28 + inp.stateT * 16];
      specScale = [1.06, 1.06, 1.08];
    } else if (isBoss) {
      const pulse = Math.exp(-((inp.stateT * 3.2) % 1) * 6.5);
      armRPitch = aim * 0.75 - pulse * 0.16;
      armLPitch = -0.14 + pulse * 0.08;
      torsoPitch = 0.09 - pulse * 0.05;
      // Elevate twin shoulder missile pods during volleys
      specRot = [-0.2 - pulse * 0.08, 0, 0];
    } else {
      // Guard crisp carbine recoil kick + muzzle starburst flare
      const shotCycle = (inp.stateT % 0.65) / 0.65;
      const kick = Math.exp(-shotCycle * 9.5);
      armRPitch = aim * 0.75 - kick * 0.2;
      armLPitch = aim * 0.75 - kick * 0.18;
      torsoPitch = 0.11 - kick * 0.06;
      specRot = [0, 0, inp.time * 8];
      specScale = [1 + kick * 1.15, 1 + kick * 1.15, 1 + kick * 1.55];
    }
  } else if (isGunner && (inp.state === "chase" || inp.state === "alert")) {
    // Slow menacing pre-spin on rotary barrels when tracking player
    specRot = [0, 0, inp.time * 6];
  }

  // Iron Warden reactor venting (`vulnerableT > 0`): hunch & flare arms/pods open
  if (isBoss && (inp.vulnerableT ?? 0) > 0) {
    const ventPulse = Math.sin(inp.time * 14) * 0.04;
    torsoPitch = 0.2 + ventPulse;
    armLRoll = 0.26;
    armRRoll = -0.22;
    armLPitch = 0.18;
    armRPitch = 0.22;
    specRot = [-0.34 + ventPulse, 0, 0];
  }

  return {
    rigPos: [0, restY - hipDip + stepLift, -flinch * 0.05],
    rigRot: [0, 0, 0],
    torsoRot: [torsoPitch - flinch * 0.3, torsoYaw + flinch * 0.22 * sideSign, torsoRoll],
    headRot: [headPitch - flinch * 0.22, headYaw, 0],
    armLRot: [armLPitch - flinch * 0.24, 0, armLRoll],
    armRRot: [armRPitch - flinch * 0.26, 0, armRRoll],
    legLRot: [stride * legAmp, 0, 0],
    legRRot: [-stride * legAmp, 0, 0],
    specRot,
    specScale
  };
}

export interface ProceduralBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function applyEulerZYX(v: V3, rot: V3): V3 {
  const [rx, ry, rz] = rot;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // 1. Rx
  const y1 = v[1] * cx - v[2] * sx;
  const z1 = v[1] * sx + v[2] * cx;
  const x1 = v[0];
  // 2. Ry
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;
  // 3. Rz
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
}

/** Exact world-space AABB over nested `group` + `geometry` procedural trees (`"ZYX"` Euler transforms). */
export function measureProceduralBounds(builderOrJson: { toJSON(): unknown } | Record<string, unknown>): ProceduralBounds {
  const root = "toJSON" in builderOrJson && typeof builderOrJson.toJSON === "function"
    ? (builderOrJson.toJSON() as Record<string, unknown>)
    : (builderOrJson as Record<string, unknown>);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

  const visit = (node: Record<string, unknown>, xform: (p: V3) => V3) => {
    const pos = (node.position as V3 | undefined) ?? [0, 0, 0];
    const rot = (node.rotation as V3 | undefined) ?? [0, 0, 0];
    const rawScale = node.scale as V3 | number | undefined;
    const sc: V3 = typeof rawScale === "number" ? [rawScale, rawScale, rawScale] : (rawScale ?? [1, 1, 1]);
    const localToWorld = (p: V3): V3 => {
      const scaled: V3 = [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]];
      const rotated = applyEulerZYX(scaled, rot);
      return xform([rotated[0] + pos[0], rotated[1] + pos[1], rotated[2] + pos[2]]);
    };
    const geom = (node.geometry ?? (node.parameters as { geometry?: unknown } | undefined)?.geometry) as { positions?: ArrayLike<number> } | undefined;
    if (geom?.positions) {
      const arr = geom.positions;
      for (let i = 0; i + 2 < arr.length; i += 3) {
        const w = localToWorld([Number(arr[i]), Number(arr[i + 1]), Number(arr[i + 2])]);
        if (w[0] < minX) minX = w[0];
        if (w[0] > maxX) maxX = w[0];
        if (w[1] < minY) minY = w[1];
        if (w[1] > maxY) maxY = w[1];
        if (w[2] < minZ) minZ = w[2];
        if (w[2] > maxZ) maxZ = w[2];
      }
    }
    const children = node.children as Record<string, unknown>[] | undefined;
    if (Array.isArray(children)) {
      for (const ch of children) visit(ch, localToWorld);
    }
  };

  visit(root, (p) => p);
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

// ---------------------------------------------------------------------------
// 4. High-Count Corridor `instances.custom` & `mergeRawMeshes` Pools (`clearcoat: 0` 60+ FPS rule)
// ---------------------------------------------------------------------------

function workLightHousingParts(): readonly RawMesh[] {
  const parts: RawMesh[] = [
    transformMesh(bevelBoxMesh(1.52, 0.045, 0.26, 0.008), { pos: [0, 0.04, 0] }),
    transformMesh(bevelBoxMesh(1.48, 0.032, 0.036, 0.005), { pos: [0, 0.018, -0.115] }),
    transformMesh(bevelBoxMesh(1.48, 0.032, 0.036, 0.005), { pos: [0, 0.018, 0.115] })
  ];
  for (let i = -2; i <= 2; i += 1) {
    const x = i * 0.32;
    parts.push(tubeSweepMesh([
      [x, 0.035, -0.115, 0.007], [x, -0.058, -0.085, 0.007],
      [x, -0.058, 0.085, 0.007], [x, 0.035, 0.115, 0.007]
    ], 6, true));
  }
  return parts;
}

function floorDrainParts(): readonly RawMesh[] {
  const parts: RawMesh[] = [
    bevelBoxMesh(0.6, 0.012, 0.6, 0.004),
    transformMesh(bevelBoxMesh(0.6, 0.026, 0.048, 0.006), { pos: [0, 0.008, -0.276] }),
    transformMesh(bevelBoxMesh(0.6, 0.026, 0.048, 0.006), { pos: [0, 0.008, 0.276] }),
    transformMesh(bevelBoxMesh(0.048, 0.026, 0.504, 0.006), { pos: [-0.276, 0.008, 0] }),
    transformMesh(bevelBoxMesh(0.048, 0.026, 0.504, 0.006), { pos: [0.276, 0.008, 0] })
  ];
  for (let b = 0; b < 5; b += 1) {
    parts.push(transformMesh(bevelBoxMesh(0.49, 0.022, 0.038, 0.005), { pos: [0, 0.007, -0.18 + b * 0.09] }));
  }
  return parts;
}

function bulkheadRibParts(): readonly RawMesh[] {
  return [
    bevelBoxMesh(1.0, 0.68, 0.28, 0.03),
    transformMesh(bevelBoxMesh(1.0, 0.18, 1.0, 0.03), { pos: [0, 0.41, 0] }),
    transformMesh(bevelBoxMesh(1.0, 0.18, 1.0, 0.03), { pos: [0, -0.41, 0] }),
    transformMesh(bevelBoxMesh(0.06, 0.72, 0.92, 0.015), { pos: [-0.32, 0, 0] }),
    transformMesh(bevelBoxMesh(0.06, 0.72, 0.92, 0.015), { pos: [0.32, 0, 0] })
  ];
}

/** Recessed ceiling lamp filament tube (`1.24 x 0.052 m`, `emissiveIntensity <= 0.42`, `clearcoat: 0`, `practical: true`). */
export function buildWorkLightInstances(
  name: string,
  transforms: readonly AuraTransformSpec[],
  lampColor: string,
  emissiveIntensity: number
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-work-light", () => [
    transformMesh(latheMesh([[0, -0.62], [0.026, -0.6], [0.026, 0.6], [0, 0.62]], 10), { pos: [0, -0.012, 0], rot: [0, 0, Math.PI * 0.5] })
  ]);
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: false,
    receiveShadow: false,
    material: material.emissive({
      color: lampColor,
      emissive: lampColor,
      emissiveIntensity: Math.min(0.42, emissiveIntensity),
      roughness: 0.34,
      clearcoat: 0,
      practical: true
    })
  });
}

/** Recessed steel floor drain curb + 5 slotted grate bars (`0.60 x 0.028 x 0.60 m`, `clearcoat: 0`). */
export function buildFloorDrainInstances(
  name: string,
  transforms: readonly AuraTransformSpec[]
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-floor-drain", floorDrainParts);
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: false,
    receiveShadow: true,
    material: material.metal({ color: "#20262e", roughness: 0.36, metallic: 0.88, clearcoat: 0 })
  });
}

/** Flanged riveted steel H/I-beam girder (`[-0.5, +0.5]^3` unit span so ceiling & jamb scales fit 1:1, `clearcoat: 0`). */
export function buildBulkheadRibInstances(
  name: string,
  transforms: readonly AuraTransformSpec[]
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-bulkhead-rib", bulkheadRibParts);
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: false,
    receiveShadow: true,
    material: material.metal({ color: "#2d333b", roughness: 0.32, metallic: 0.9, clearcoat: 0 })
  });
}

/** Single-draw static `mergeRawMeshes` batch of all corridor H-beam ribs, door/exit jambs, floor drains & work-light troughs/cages per floor (`clearcoat: 0`). */
export function buildMergedCorridorSteelNode(
  name: string,
  ribTransforms: readonly AuraTransformSpec[],
  drainTransforms: readonly AuraTransformSpec[],
  lightTransforms: readonly AuraTransformSpec[]
): AuraNodeBuilder<AuraPrimitiveNode> {
  const ribUnit = bulkheadRibParts();
  const drainUnit = floorDrainParts();
  const lightUnit = workLightHousingParts();
  const meshes: RawMesh[] = [];
  const pushPlaced = (unit: readonly RawMesh[], list: readonly AuraTransformSpec[]) => {
    for (const tr of list) {
      const pos = tr.position as [number, number, number] | undefined;
      const rot = tr.rotation as [number, number, number] | undefined;
      const scale = tr.scale as [number, number, number] | number | undefined;
      for (const m of unit) meshes.push(transformMesh(m, { pos, rot, scale }));
    }
  };
  pushPlaced(ribUnit, ribTransforms);
  pushPlaced(drainUnit, drainTransforms);
  pushPlaced(lightUnit, lightTransforms);
  if (meshes.length === 0) meshes.push(transformMesh(bevelBoxMesh(0.02, 0.02, 0.02, 0.002), { pos: [0, -50, 0] }));
  return geometry.custom(mergeRawMeshes(meshes), {
    name,
    castShadow: false,
    receiveShadow: true,
    material: material.metal({ color: "#282e36", roughness: 0.34, metallic: 0.88, clearcoat: 0 })
  });
}

/** Batched bevelled corridor & column baseboard kick-strip pool (`instances.custom`, `clearcoat: 0`). */
export function buildCorridorTrimInstances(
  name: string,
  transforms: readonly AuraTransformSpec[],
  color: string
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-corridor-trim", () => [bevelBoxMesh(1.0, 1.0, 1.0, 0.08)]);
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: false,
    receiveShadow: false,
    material: material.pbr({ color, roughness: 0.58, metalness: 0.1, clearcoat: 0 })
  });
}

/** Revolved collared conduit pipe (`Y in [-0.5, +0.5]`, unit diameter `1` + union flanges, `clearcoat: 0`). */
export function buildConduitPipeInstances(
  name: string,
  transforms: readonly AuraTransformSpec[],
  color: string
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-conduit-pipe", () => {
    const prof: V2[] = [
      [0.48, -0.5], [0.48, -0.34], [0.64, -0.33], [0.64, -0.27], [0.48, -0.26],
      [0.48, 0.26], [0.64, 0.27], [0.64, 0.33], [0.48, 0.34], [0.48, 0.5]
    ];
    return [latheMesh(prof, 12)];
  });
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: false,
    receiveShadow: true,
    material: material.metal({ color, roughness: 0.34, metallic: 0.86, clearcoat: 0 })
  });
}

/** Chamfered octagonal concrete pilaster column (`[-0.5, +0.5]^3` with plinth base & capital corbel, `clearcoat: 0`). */
export function buildPilasterColumnInstances(
  name: string,
  transforms: readonly AuraTransformSpec[],
  wallMatSpec: AuraMaterialSpec
): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoMergedSpec("inst-pilaster-column", () => {
    const oct: V2[] = [
      [-0.44, -0.24], [-0.24, -0.44], [0.24, -0.44], [0.44, -0.24],
      [0.44, 0.24], [0.24, 0.44], [-0.24, 0.44], [-0.44, 0.24]
    ];
    const shaft = transformMesh(extrudePolygonMesh(oct, 0.8, 0.02, true), { rot: [Math.PI * 0.5, 0, 0] });
    return [
      shaft,
      transformMesh(bevelBoxMesh(1.0, 0.12, 1.0, 0.025), { pos: [0, -0.44, 0] }),
      transformMesh(bevelBoxMesh(1.0, 0.12, 1.0, 0.025), { pos: [0, 0.44, 0] })
    ];
  });
  return instances.custom(spec, {
    name,
    transforms,
    castShadow: true,
    receiveShadow: true,
    material: { ...wallMatSpec, clearcoat: 0 }
  });
}
