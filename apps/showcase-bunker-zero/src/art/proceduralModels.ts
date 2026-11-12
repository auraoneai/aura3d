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
  geometry,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  extrudePolygonMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3
} from "../../../showcase-port-shared/proceduralKernel";

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
  polymerGrip: material.blackRubber({ color: "#181b20", roughness: 0.74 }),
  corduraOlive: material.fabric({ color: "#3e462b", roughness: 0.86, sheen: 0.3, sheenColor: "#7c875d" }),
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
  opticGlass: material.studioGlass({ tint: "#8fe6ff", roughness: 0.03, thickness: 0.16, ior: 1.52 }),
  visorGlass: material.studioGlass({ tint: "#9ad8eb", roughness: 0.05, thickness: 0.32, ior: 1.5 }),
  concreteCoffer: material.pbr({ color: "#5e5b54", roughness: 0.86, metalness: 0.04 }),
  concreteSlab: material.pbr({ color: "#5e5b54", roughness: 0.86, metalness: 0.04, clearcoat: 0 }),
  timberOrdnance: material.pbr({ color: "#6c5338", roughness: 0.8, metalness: 0.03 }),
  tritiumGreen: material.emissive({
    color: "#9effb8", emissive: "#49f282", emissiveIntensity: 0.42, roughness: 0.2, practical: true
  }),
  reticleCyan: material.emissive({
    color: "#8ce2ef", emissive: "#38c6e0", emissiveIntensity: 0.42, roughness: 0.22, practical: true
  }),
  laserAmber: material.emissive({
    color: "#ffd892", emissive: "#f08f24", emissiveIntensity: 0.4, roughness: 0.22, practical: true
  }),
  thrusterFlame: material.emissive({
    color: "#ffdc9c", emissive: "#f26e18", emissiveIntensity: 0.45, roughness: 0.2, practical: true
  }),
  muzzleCore: material.emissive({
    color: "#ffe8b4", emissive: "#f59e2d", emissiveIntensity: 0.44, roughness: 0.22, practical: true
  })
} as const;

const SPEC_CACHE = new Map<string, AuraCustomGeometrySpec>();
function memoGroupedSpec(key: string, build: () => readonly MultiMatSlot[]): AuraCustomGeometrySpec {
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;
  const spec = buildGroupedGeometrySpec(build());
  SPEC_CACHE.set(key, spec);
  return spec;
}
function memoMergedSpec(key: string, build: () => readonly RawMesh[]): AuraCustomGeometrySpec {
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;
  const spec = mergeRawMeshes(build());
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
  return geometry.multiMaterial(memoGroupedSpec(cacheKey, buildSlots), materials, {
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

/** Two-tone ported tactical service pistol (`0.38 m` span, muzzle at `-X`, grip at `+X`). */
export function buildServicePistolNode(name = "vm pistol"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 slide
    BZ_PROC_MATERIALS.polymerGrip,     // 1 frame + stippled grip + trigger
    BZ_PROC_MATERIALS.chromeStudio,    // 2 ported barrel + extractor
    BZ_PROC_MATERIALS.lacquerMag,      // 3 magazine baseplate
    BZ_PROC_MATERIALS.tritiumGreen     // 4 3-dot tritium night sights
  ];
  return multiMatFromMemo("vm-service-pistol", name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Bevelled machined top slide + serration ribs
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.28, 0.044, 0.038, 0.006), { pos: [-0.03, 0.036, 0] }), materialIndex: 0 });
    for (let i = 0; i < 5; i += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.006, 0.034, 0.041, 0.0015), { pos: [0.045 + i * 0.012, 0.036, 0] }),
        materialIndex: 0
      });
    }
    // Lower polymer dust-cover rail + ergonomic raked grip
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.024, 0.036, 0.004), { pos: [-0.015, 0.006, 0] }), materialIndex: 1 });
    const gripPoly: V2[] = [[0.035, 0.005], [0.098, 0.008], [0.126, -0.118], [0.058, -0.122]];
    slots.push({ mesh: extrudePolygonMesh(gripPoly, 0.035, 0.005), materialIndex: 1 });
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
    // Revolved rifled barrel crown (`latheMesh` rotated so +Y maps to -X) + ejection port block
    const barrelProf: V2[] = [[0.006, 0], [0.011, 0.002], [0.011, 0.062], [0.013, 0.068], [0.008, 0.072], [0.005, 0.06]];
    slots.push({
      mesh: transformMesh(latheMesh(barrelProf, 14), { pos: [-0.145, 0.036, 0], rot: [0, 0, Math.PI * 0.5] }),
      materialIndex: 2
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.052, 0.018, 0.039, 0.002), { pos: [-0.005, 0.044, 0.002] }), materialIndex: 2 });
    // Magazine floorplate
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.074, 0.018, 0.038, 0.004), { pos: [0.092, -0.125, 0] }), materialIndex: 3 });
    // 3-dot tritium combat sights
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.008, 0.002), { pos: [-0.152, 0.062, 0] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.007, 0.002), { pos: [0.092, 0.062, -0.01] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.011, 0.007, 0.002), { pos: [0.092, 0.062, 0.01] }), materialIndex: 4 });
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

/** Bullpup / carbine tactical pulse rifle (`0.68 m` span, muzzle at `-X`, buttstock at `+X`). */
export function buildPulseCarbineNode(name = "vm mg", castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 upper/lower receiver & top rail
    BZ_PROC_MATERIALS.chromeStudio,    // 1 flash suppressor, gas block & lattice shroud
    BZ_PROC_MATERIALS.polymerGrip,     // 2 skeletonized buttstock, pistol grip & foregrip
    BZ_PROC_MATERIALS.lacquerMag,      // 3 curved box magazine
    BZ_PROC_MATERIALS.reticleCyan      // 4 tritium side rail telemetry pip
  ];
  return multiMatFromMemo(`pulse-carbine-${castShadow ? 1 : 0}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Upper + lower machined receiver + Picatinny rail teeth
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.068, 0.052, 0.007), { pos: [-0.01, 0.032, 0] }), materialIndex: 0 });
    for (let i = 0; i < 8; i += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.014, 0.012, 0.034, 0.002), { pos: [-0.12 + i * 0.032, 0.071, 0] }),
        materialIndex: 0
      });
    }
    // Slotted lattice barrel shroud (`latticeTrussMesh`) + revolved heavy barrel & multi-baffle suppressor
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.22, 0.048, 0.048], bays: 4, chordRadius: 0.0055 }), { pos: [-0.24, 0.032, 0] }),
      materialIndex: 1
    });
    const barrelProf: V2[] = [
      [0.009, 0], [0.012, 0.16], [0.017, 0.165], [0.017, 0.22],
      [0.013, 0.225], [0.017, 0.245], [0.017, 0.285], [0.008, 0.292]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(barrelProf, 14), { pos: [-0.14, 0.032, 0], rot: [0, 0, Math.PI * 0.5] }),
      materialIndex: 1
    });
    // Skeletonized buttstock (`extrudePolygonMesh`), raked grip & angled foregrip
    const stockPoly: V2[] = [[0.14, 0.056], [0.29, 0.048], [0.30, -0.052], [0.255, -0.058], [0.14, -0.008]];
    slots.push({ mesh: extrudePolygonMesh(stockPoly, 0.04, 0.005), materialIndex: 2 });
    const gripPoly: V2[] = [[0.06, 0.0], [0.115, 0.0], [0.145, -0.115], [0.088, -0.118]];
    slots.push({ mesh: extrudePolygonMesh(gripPoly, 0.036, 0.005), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.034, 0.078, 0.032, 0.005), { pos: [-0.21, -0.025, 0], rot: [0, 0, 0.22] }), materialIndex: 2 });
    // Curved banana/box magazine (`tubeSweepMesh` spine with rectangular feel via lofted rings)
    const magRings: V3[][] = [
      [[-0.085, 0.0, -0.016], [-0.035, 0.0, -0.016], [-0.035, 0.0, 0.016], [-0.085, 0.0, 0.016]],
      [[-0.096, -0.085, -0.016], [-0.046, -0.082, -0.016], [-0.046, -0.082, 0.016], [-0.096, -0.085, 0.016]],
      [[-0.122, -0.168, -0.015], [-0.072, -0.158, -0.015], [-0.072, -0.158, 0.015], [-0.122, -0.168, 0.015]]
    ];
    slots.push({ mesh: loftSectionsMesh(magRings, true, true), materialIndex: 3 });
    // Practical cyan telemetry rail bar
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.095, 0.009, 0.008, 0.002), { pos: [-0.04, 0.046, -0.028] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.095, 0.009, 0.008, 0.002), { pos: [-0.04, 0.046, 0.028] }), materialIndex: 4 });
    return slots;
  }, { castShadow, receiveShadow: castShadow });
}

/** Twin-collar recoilless rocket launcher (`0.88 m` span, muzzle at `+X`, Venturi exhaust at `-X`, side optic at `-Z`). */
export function buildRocketLauncherNode(name = "vm rocket", castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  const mats = [
    BZ_PROC_MATERIALS.oliveClearcoat,  // 0 main launch tube
    BZ_PROC_MATERIALS.chromeStudio,    // 1 flared Venturi exhaust bell & clamp collars
    BZ_PROC_MATERIALS.polymerGrip,     // 2 twin grips & padded shoulder rest
    BZ_PROC_MATERIALS.gunmetalBrushed, // 3 side optical sight housing & carry rail
    BZ_PROC_MATERIALS.opticGlass,      // 4 objective lens
    BZ_PROC_MATERIALS.laserAmber       // 5 target rangefinder pip
  ];
  return multiMatFromMemo(`rocket-launcher-${castShadow ? 1 : 0}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Stepped main launch tube along X (`latheMesh` rotated by -PI/2 around Z so +Y -> +X)
    const tubeProf: V2[] = [
      [0.052, -0.34], [0.056, -0.32], [0.056, 0.36], [0.064, 0.37], [0.064, 0.42], [0.044, 0.42]
    ];
    slots.push({ mesh: transformMesh(latheMesh(tubeProf, 18), { rot: [0, 0, -Math.PI * 0.5] }), materialIndex: 0 });
    // Flared Venturi exhaust cone at `-X` + twin heavy steel reinforcement collars
    const bellProf: V2[] = [[0.042, 0], [0.052, 0.03], [0.078, 0.11], [0.084, 0.13], [0.068, 0.13]];
    slots.push({ mesh: transformMesh(latheMesh(bellProf, 18), { pos: [-0.34, 0, 0], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 1 });
    for (const cx of [-0.14, 0.18]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.055, -0.02], [0.065, -0.016], [0.065, 0.016], [0.055, 0.02]], 18), { pos: [cx, 0, 0], rot: [0, 0, -Math.PI * 0.5] }),
        materialIndex: 1
      });
    }
    // Twin pistol grips + contoured shoulder pad
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.038, 0.11, 0.036, 0.006), { pos: [0.06, -0.095, 0], rot: [0, 0, -0.2] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.036, 0.1, 0.034, 0.006), { pos: [0.24, -0.09, 0], rot: [0, 0, -0.14] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.032, 0.076, 0.008), { pos: [-0.18, -0.068, 0] }), materialIndex: 2 });
    // Carry handle truss + side-mounted optical sight on `-Z` (screen-left when aimed downrange)
    slots.push({
      mesh: tubeSweepMesh([[-0.08, 0.058, 0, 0.007], [-0.06, 0.092, 0, 0.007], [0.14, 0.092, 0, 0.007], [0.16, 0.058, 0, 0.007]], 8),
      materialIndex: 3
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.038, 0.042, 0.005), { pos: [0.08, 0.028, -0.076] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.012, 0.03, 0.03, 0.002), { pos: [0.152, 0.028, -0.076] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.016, 0.012, 0.012, 0.002), { pos: [0.145, 0.052, -0.076] }), materialIndex: 5 });
    return slots;
  }, { castShadow, receiveShadow: castShadow });
}

/** Hooded holographic reflex sight (`vm-optic`: `brushedMetal` shroud + `studioGlass` window + `practical: true` cyan dot). */
export function buildReflexOpticNode(name = "vm reflex optic"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [BZ_PROC_MATERIALS.gunmetalBrushed, BZ_PROC_MATERIALS.opticGlass, BZ_PROC_MATERIALS.reticleCyan];
  return multiMatFromMemo("vm-reflex-optic", name, mats, () => {
    const hoodPoly: V2[] = [
      [-0.022, -0.016], [0.022, -0.016], [0.024, 0.016], [0.016, 0.022], [-0.016, 0.022], [-0.024, 0.016],
      [-0.017, 0.014], [0.017, 0.014], [0.017, -0.009], [-0.017, -0.009]
    ];
    return [
      { mesh: transformMesh(bevelBoxMesh(0.046, 0.01, 0.052, 0.002), { pos: [0, -0.015, 0] }), materialIndex: 0 },
      { mesh: extrudePolygonMesh(hoodPoly, 0.038, 0.002, true), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.033, 0.024, 0.004, 0.001), { pos: [0, 0.003, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.004, 0.004, 0.006, 0.001), { pos: [0, 0.004, -0.003] }), materialIndex: 2 }
    ];
  }, { castShadow: false, receiveShadow: false });
}

/** Pleated olive Cordura forearm sleeve (`loftSectionsMesh` wrinkled fabric folds, `vm-sleeve-r/l`). */
export function buildTacticalSleeveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats = [BZ_PROC_MATERIALS.corduraOlive, BZ_PROC_MATERIALS.polymerGrip];
  return multiMatFromMemo(`vm-sleeve-${hand}`, name, mats, () => {
    const radii: readonly [number, number, number][] = [
      [-0.12, 0.042, 0.038], [-0.05, 0.045, 0.04], [0.01, 0.039, 0.036], [0.07, 0.041, 0.037], [0.12, 0.035, 0.033]
    ];
    const segs = 10;
    const rings: V3[][] = radii.map(([y, rx, rz], rIdx) => {
      const ring: V3[] = [];
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        const pleat = 1 + Math.sin(a * 3 + rIdx * 1.4) * 0.055;
        ring.push([Math.cos(a) * rx * pleat, y, Math.sin(a) * rz * pleat]);
      }
      return ring;
    });
    return [
      { mesh: loftSectionsMesh(rings, true), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.058, 0.078, 0.012, 0.003), { pos: [hand === "right" ? 0.012 : -0.012, -0.02, 0.038] }), materialIndex: 1 }
    ];
  }, { castShadow: false, receiveShadow: false });
}

/** Gunmetal tactical wrist cuff + field chronometer bezel (`latheMesh`, `vm-cuff-r`). */
export function buildTacticalWristCuffNode(name = "vm wrist cuff right"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [BZ_PROC_MATERIALS.gunmetalBrushed, BZ_PROC_MATERIALS.tritiumGreen];
  return multiMatFromMemo("vm-wrist-cuff", name, mats, () => [
    { mesh: latheMesh([[0.034, -0.018], [0.04, -0.014], [0.04, 0.014], [0.034, 0.018]], 16), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.026, 0.016, 0.012, 0.003), { pos: [-0.018, 0.0, 0.038] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.016, 0.008, 0.004, 0.001), { pos: [-0.018, 0.0, 0.045] }), materialIndex: 1 }
  ], { castShadow: false, receiveShadow: false });
}

/** Armored-knuckle combat glove (`blackRubber` palm & articulated fingers + `ceramic` dorsal knuckle guard, `vm-glove-r/l`). */
export function buildTacticalGloveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const s = hand === "right" ? 1 : -1;
  const mats = [BZ_PROC_MATERIALS.polymerGrip, BZ_PROC_MATERIALS.ceramicPlate];
  return multiMatFromMemo(`vm-glove-${hand}`, name, mats, () => {
    const slots: MultiMatSlot[] = [
      { mesh: bevelBoxMesh(0.068, 0.042, 0.076, 0.008), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.062, 0.014, 0.032, 0.004), { pos: [0, 0.024, -0.014] }), materialIndex: 1 }
    ];
    for (let f = 0; f < 4; f += 1) {
      const fx = (-0.022 + f * 0.0145) * s;
      slots.push({
        mesh: tubeSweepMesh([[fx, 0.004, -0.034, 0.0075], [fx, -0.008, -0.062, 0.0068], [fx * 0.9, -0.024, -0.056, 0.0058]], 6),
        materialIndex: 0
      });
    }
    slots.push({
      mesh: tubeSweepMesh([[-0.032 * s, 0.002, -0.012, 0.0085], [-0.042 * s, 0.012, -0.042, 0.0072], [-0.028 * s, 0.014, -0.058, 0.0062]], 6),
      materialIndex: 0
    });
    return slots;
  }, { castShadow: false, receiveShadow: false });
}

// ---------------------------------------------------------------------------
// 2. Blast Door Bulkhead, Secret Push-Wall, Pickups & Destructible/Cover Props
// ---------------------------------------------------------------------------

/** Armored sliding blast-door bulkhead (`span ~ 2.94 m <= CELL`, `y in [0, wallH * 0.94]`). */
export function buildBlastDoorBulkheadNode(
  wallH: number,
  castShadow: boolean,
  name: string
): AuraNodeBuilder<AuraGroupNode> {
  const h = wallH * 0.94;
  const mats = [
    BZ_PROC_MATERIALS.gunmetalBrushed, // 0 ribbed outer bulkhead frame & cross-stiffeners
    BZ_PROC_MATERIALS.hazardClearcoat, // 1 bevelled interlocking blast leaves & chevron bars
    BZ_PROC_MATERIALS.visorGlass,      // 2 armored containment viewport
    BZ_PROC_MATERIALS.chromeStudio,    // 3 rotary locking handwheel & 4 locking dogs
    BZ_PROC_MATERIALS.laserAmber       // 4 containment status bar
  ];
  return multiMatFromMemo(`blast-door-${h.toFixed(2)}`, name, mats, () => {
    const slots: MultiMatSlot[] = [];
    // Perimeter steel frame + central vertical interlock stile + horizontal ribs
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.94, 0.16, 0.24, 0.025), { pos: [0, 0.08, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.94, 0.18, 0.24, 0.025), { pos: [0, h - 0.09, 0] }), materialIndex: 0 });
    for (const sx of [-1.39, 1.39]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, h, 0.24, 0.022), { pos: [sx, h * 0.5, 0] }), materialIndex: 0 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.12, h - 0.28, 0.22, 0.018), { pos: [0, h * 0.5, 0] }), materialIndex: 0 });
    for (const fy of [0.28, 0.76]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(2.68, 0.09, 0.23, 0.014), { pos: [0, h * fy, 0] }), materialIndex: 0 });
    }
    // Twin bevelled hazard-yellow clearcoat blast leaves + diagonal caution bars
    for (const lx of [-0.68, 0.68]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(1.24, h - 0.3, 0.17, 0.024), { pos: [lx, h * 0.5, 0] }), materialIndex: 1 });
      for (const sideZ of [-0.092, 0.092]) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.86, 0.11, 0.02, 0.005), { pos: [lx, h * 0.2, sideZ], rot: [0, 0, lx < 0 ? 0.22 : -0.22] }),
          materialIndex: 1
        });
      }
    }
    // Armored inspection port bezel + recessed studioGlass window at eye height
    const visorY = Math.min(h - 0.42, Math.max(1.35, h * 0.62));
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.42, 0.24, 0.02), { pos: [0, visorY, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.82, 0.28, 0.26, 0.012), { pos: [0, visorY, 0] }), materialIndex: 2 });
    // Spoked rotary vault handwheel (`latheMesh` hub + rim + 4 spokes) on both faces + 4 locking dogs
    const wheelY = Math.max(0.88, h * 0.41);
    const wheelRim: V2[] = [[0.2, -0.02], [0.25, -0.02], [0.25, 0.02], [0.2, 0.02], [0.2, -0.02]];
    const hubProf: V2[] = [[0, -0.035], [0.068, -0.035], [0.056, 0.04], [0, 0.04]];
    for (const wz of [-0.125, 0.125]) {
      const rx = wz > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      slots.push({ mesh: transformMesh(latheMesh(hubProf, 14), { pos: [-0.52, wheelY, wz], rot: [rx, 0, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(latheMesh(wheelRim, 18), { pos: [-0.52, wheelY, wz + Math.sign(wz) * 0.02], rot: [rx, 0, 0] }), materialIndex: 3 });
      for (let k = 0; k < 2; k += 1) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.44, 0.028, 0.024, 0.004), { pos: [-0.52, wheelY, wz + Math.sign(wz) * 0.02], rot: [0, 0, (k * Math.PI) / 2 + 0.4] }),
          materialIndex: 3
        });
      }
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.48, 0.036, 0.02, 0.004), { pos: [0, visorY + 0.24, wz] }), materialIndex: 4 });
    }
    for (const dy of [h * 0.24, h * 0.72]) {
      for (const sx of [-1.3, 1.3]) {
        slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.075, 0.27, 0.012), { pos: [sx, dy, 0] }), materialIndex: 3 });
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
