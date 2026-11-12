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
  }),
  gunmetalSteel: material.metal({ color: "#2a3039", roughness: 0.3, metallic: 0.9 }),
  tacticalSlateArmor: material.pbr({ color: "#3b434d", roughness: 0.46, metalness: 0.24 }),
  tacticalOliveArmor: material.pbr({ color: "#434b35", roughness: 0.48, metalness: 0.2 }),
  wardenExoArmor: material.pbr({ color: "#2d333c", roughness: 0.38, metalness: 0.42 }),
  darkFatigues: material.fabric({ color: "#252a23", roughness: 0.88, sheen: 0.26, sheenColor: "#545d4e" }),
  enamelMedkit: material.ceramic({ color: "#dfd9cc", roughness: 0.34 }),
  visorCrimson: material.emissive({
    color: "#ff7a66", emissive: "#e62e1b", emissiveIntensity: 0.44, roughness: 0.18, practical: true
  }),
  visorAmber: material.emissive({
    color: "#ffd484", emissive: "#f08818", emissiveIntensity: 0.43, roughness: 0.2, practical: true
  }),
  reactorCrimson: material.emissive({
    color: "#ff9468", emissive: "#f24418", emissiveIntensity: 0.45, roughness: 0.18, practical: true
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

export const ENEMY_RIG_PARTS = ["rig", "torso", "head", "armL", "armR", "legL", "legR", "spec"] as const;
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
  part: EnemyRigPart | "body"
) => ReturnType<typeof game.runtimeNode>;

function ellipticalRings(profile: readonly [number, number, number, number?][], segs = 10): V3[][] {
  return profile.map(([y, rx, rz, zOff = 0], rIdx) => {
    const ring: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const crease = 1 + Math.sin(a * 3 + rIdx * 1.1) * 0.035;
      ring.push([Math.cos(a) * rx * crease, y, Math.sin(a) * rz * crease + zOff]);
    }
    return ring;
  });
}

function buildGuardRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Grounded at `minY = 0`: `rig` sits at `y = 0.94`, leg boot soles reach `y = -0.94` -> `0.94 - 0.94 = 0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 lofted combat trousers & bloused gaiter
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 contoured ballistic knee guard & toe plate
    BZ_PROC_MATERIALS.polymerGrip         // 2 laced combat boot upper & lugged sole
  ];
  const makeLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-guard-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const thigh = loftSectionsMesh(ellipticalRings([
        [0.03, 0.095, 0.10, 0], [-0.18, 0.09, 0.096, 0.004], [-0.41, 0.074, 0.078, 0.006]
      ], 10), true);
      const shin = loftSectionsMesh(ellipticalRings([
        [-0.43, 0.072, 0.076, 0.004], [-0.62, 0.068, 0.072, 0], [-0.79, 0.06, 0.064, -0.004]
      ], 10), true);
      const kneePoly: V2[] = [[-0.056, -0.068], [0.056, -0.068], [0.066, 0], [0.048, 0.068], [-0.048, 0.068], [-0.066, 0]];
      return [
        { mesh: thigh, materialIndex: 0 },
        { mesh: shin, materialIndex: 0 },
        { mesh: transformMesh(extrudePolygonMesh(kneePoly, 0.036, 0.008, true), { pos: [0, -0.42, 0.072] }), materialIndex: 1 },
        // Laced ankle collar + boot body + armored toe cap + lugged sole (`bottom = -0.92 - 0.02 = -0.940`)
        { mesh: transformMesh(bevelBoxMesh(0.118, 0.13, 0.16, 0.018), { pos: [0, -0.845, 0.006] }), materialIndex: 2 },
        { mesh: transformMesh(bevelBoxMesh(0.124, 0.075, 0.24, 0.016), { pos: [0, -0.888, 0.034] }), materialIndex: 2 },
        { mesh: transformMesh(bevelBoxMesh(0.118, 0.048, 0.095, 0.012), { pos: [0, -0.882, 0.112] }), materialIndex: 1 },
        { mesh: transformMesh(bevelBoxMesh(0.13, 0.04, 0.27, 0.008), { pos: [0, -0.92, 0.036] }), materialIndex: 2 }
      ];
    }, { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-guard-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.darkFatigues,
    BZ_PROC_MATERIALS.polymerGrip,
    BZ_PROC_MATERIALS.brassStudio
  ], () => [
    { mesh: loftSectionsMesh(ellipticalRings([[-0.06, 0.16, 0.115], [0.02, 0.175, 0.125], [0.08, 0.168, 0.12]], 10), true), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.36, 0.062, 0.26, 0.012), { pos: [0, 0.045, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.056, 0.028, 0.005), { pos: [0, 0.045, 0.132] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.064, 0.13, 0.095, 0.012), { pos: [-0.195, -0.03, 0.01] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.072, 0.11, 0.1, 0.012), { pos: [0.192, -0.02, -0.02] }), materialIndex: 1 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-guard-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.corduraOlive,       // 0 Cordura tactical vest & ribcage
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 front/back SAPI ballistic plates & dorsal pack
    BZ_PROC_MATERIALS.polymerGrip,        // 2 triple mag pouches, MOLLE straps & shoulder yokes
    BZ_PROC_MATERIALS.brassStudio         // 3 pouch snap studs & radio connector
  ], () => {
    const sapi: V2[] = [[-0.165, -0.18], [0.165, -0.18], [0.17, 0.08], [0.11, 0.2], [-0.11, 0.2], [-0.17, 0.08]];
    const slots: MultiMatSlot[] = [
      { mesh: loftSectionsMesh(ellipticalRings([[0.0, 0.17, 0.12], [0.22, 0.205, 0.142], [0.42, 0.215, 0.145], [0.5, 0.15, 0.11]], 10), true), materialIndex: 0 },
      { mesh: transformMesh(extrudePolygonMesh(sapi, 0.045, 0.01, true), { pos: [0, 0.26, 0.138] }), materialIndex: 1 },
      { mesh: transformMesh(extrudePolygonMesh(sapi, 0.042, 0.01, true), { pos: [0, 0.26, -0.135] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.25, 0.28, 0.11, 0.018), { pos: [0, 0.26, -0.19] }), materialIndex: 1 },
      { mesh: tubeSweepMesh([[0.11, 0.4, -0.21, 0.008], [0.12, 0.56, -0.22, 0.006], [0.13, 0.72, -0.23, 0.003]], 6), materialIndex: 2 }
    ];
    for (const sx of [-0.13, 0.13]) {
      slots.push({
        mesh: tubeSweepMesh([[sx, 0.43, 0.11, 0.026], [sx * 1.04, 0.51, 0, 0.028], [sx, 0.43, -0.11, 0.026]], 7),
        materialIndex: 2
      });
    }
    // 3 chest-rig rifle magazine pouches + brass snap fasteners
    for (let m = -1; m <= 1; m += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.076, 0.145, 0.056, 0.01), { pos: [m * 0.092, 0.17, 0.176], rot: [0, 0, m * -0.05] }),
        materialIndex: 2
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.024, 0.024, 0.016, 0.004), { pos: [m * 0.092, 0.215, 0.205] }),
        materialIndex: 3
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const headMesh = multiMatFromMemo("en-guard-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 sculpted ballistic helmet shell & brow cowl
    BZ_PROC_MATERIALS.polymerGrip,        // 1 neck gorget, respirator face mask & chin straps
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 side Picatinny rails & comm ear-defenders
    BZ_PROC_MATERIALS.visorAmber          // 3 glowing amber/crimson tactical visor slit (`+Z`)
  ], () => {
    const helmProf: V2[] = [
      [0.118, 0.1], [0.136, 0.135], [0.138, 0.215], [0.118, 0.295], [0.072, 0.345], [0, 0.36]
    ];
    return [
      { mesh: latheMesh([[0.072, -0.01], [0.082, 0.04], [0.078, 0.11]], 10), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.165, 0.145, 0.185, 0.028), { pos: [0, 0.125, 0.012] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.11, 0.085, 0.09, 0.018), { pos: [0, 0.085, 0.088], rot: [0.22, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh(helmProf, 14), { scale: [1, 1, 1.12] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.24, 0.048, 0.14, 0.012), { pos: [0, 0.205, 0.092], rot: [0.14, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.046, 0.095, 0.105, 0.012), { pos: [-0.132, 0.155, -0.005] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.046, 0.095, 0.105, 0.012), { pos: [0.132, 0.155, -0.005] }), materialIndex: 2 },
      // Glowing tactical visor slit facing `+Z`
      { mesh: transformMesh(bevelBoxMesh(0.195, 0.042, 0.048, 0.008), { pos: [0, 0.168, 0.112] }), materialIndex: 3 }
    ];
  }, { castShadow, receiveShadow: true });

  const armRightAndCarbine = multiMatFromMemo("en-guard-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 shoulder pauldron
    BZ_PROC_MATERIALS.darkFatigues,       // 1 lofted sleeve bicep & forearm
    BZ_PROC_MATERIALS.polymerGrip,        // 2 glove, carbine stock, grip & curved mag
    BZ_PROC_MATERIALS.gunmetalSteel       // 3 carbine receiver, top rail & barrel shroud
  ], () => [
    // Shoulder pauldron + angled upper/forearm sleeve reaching forward to trigger grip
    { mesh: transformMesh(bevelBoxMesh(0.13, 0.15, 0.155, 0.026), { pos: [-0.02, -0.02, 0], rot: [0, 0, 0.18] }), materialIndex: 0 },
    {
      mesh: tubeSweepMesh([
        [0, -0.02, 0, 0.056], [-0.01, -0.18, 0.09, 0.05], [0.05, -0.22, 0.24, 0.045], [0.11, -0.18, 0.34, 0.04]
      ], 8),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.072, 0.068, 0.088, 0.014), { pos: [0.125, -0.175, 0.36] }), materialIndex: 2 },
    // Tactical carbine aimed forward along `+Z` (centered slightly inboard at `x = +0.135`, i.e. world `x ~ -0.11`)
    { mesh: transformMesh(bevelBoxMesh(0.058, 0.082, 0.36, 0.009), { pos: [0.135, -0.115, 0.44] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.044, 0.096, 0.16, 0.008), { pos: [0.135, -0.13, 0.21] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.04, 0.13, 0.056, 0.007), { pos: [0.135, -0.225, 0.49], rot: [0.24, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.046, 0.036, 0.09, 0.006), { pos: [0.135, -0.058, 0.43] }), materialIndex: 3 },
    {
      mesh: transformMesh(latheMesh([[0.014, 0], [0.016, 0.19], [0.022, 0.2], [0.022, 0.26], [0.011, 0.27]], 12), {
        pos: [0.135, -0.105, 0.6],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 3
    }
  ], { castShadow, receiveShadow: true });

  const carbineMuzzleTip = multiMatFromMemo("en-guard-muzzle", `${name} muzzle-tip`, [
    BZ_PROC_MATERIALS.brassStudio,
    BZ_PROC_MATERIALS.muzzleCore
  ], () => [
    {
      mesh: transformMesh(latheMesh([[0.015, -0.02], [0.021, -0.015], [0.021, 0.025], [0.012, 0.032]], 10), {
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(0.018, 0.018, 0.02, 0.004), { pos: [0, 0, 0.028] }), materialIndex: 1 }
  ], { castShadow: false, receiveShadow: false });

  const armLeft = multiMatFromMemo("en-guard-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor,
    BZ_PROC_MATERIALS.darkFatigues,
    BZ_PROC_MATERIALS.polymerGrip
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.13, 0.15, 0.155, 0.026), { pos: [0.02, -0.02, 0], rot: [0, 0, -0.18] }), materialIndex: 0 },
    {
      mesh: tubeSweepMesh([
        [0, -0.02, 0, 0.056], [0.01, -0.17, 0.12, 0.048], [-0.14, -0.18, 0.34, 0.044], [-0.32, -0.145, 0.52, 0.038]
      ], 8),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.072, 0.064, 0.088, 0.014), { pos: [-0.345, -0.14, 0.545] }), materialIndex: 2 }
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
  // Grounded at `minY = 0`: `rig` sits at `y = 0.52`, 4 paw pads sit at `y = -0.502 - 0.018 = -0.520` -> `0.52 - 0.52 = 0.000`.
  const chassisMesh = multiMatFromMemo("en-hound-chassis", `${name} chassis`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 sloped armored hull
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 reactive side flank plates
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 dorsal spine vertebrae & servo housings
    BZ_PROC_MATERIALS.hazardDrumBand,     // 3 hazard chevron flank accents
    BZ_PROC_MATERIALS.chromeStudio        // 4 twin dorsal telemetry whip antennas
  ], () => {
    const hullRings: V3[][] = [
      [[-0.08, -0.02, -0.42], [0.08, -0.02, -0.42], [0.1, 0.09, -0.4], [-0.1, 0.09, -0.4]],
      [[-0.145, -0.08, -0.22], [0.145, -0.08, -0.22], [0.16, 0.13, -0.2], [-0.16, 0.13, -0.2]],
      [[-0.175, -0.11, 0.12], [0.175, -0.11, 0.12], [0.185, 0.155, 0.12], [-0.185, 0.155, 0.12]],
      [[-0.135, -0.07, 0.36], [0.135, -0.07, 0.36], [0.145, 0.135, 0.35], [-0.145, 0.135, 0.35]],
      [[-0.08, -0.01, 0.44], [0.08, -0.01, 0.44], [0.09, 0.1, 0.43], [-0.09, 0.1, 0.43]]
    ];
    const slots: MultiMatSlot[] = [
      { mesh: loftSectionsMesh(hullRings, true), materialIndex: 0 }
    ];
    for (const sx of [-1, 1]) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.042, 0.17, 0.46, 0.01), { pos: [sx * 0.175, 0.025, 0.02], rot: [0.08, 0, sx * -0.14] }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.048, 0.042, 0.32, 0.006), { pos: [sx * 0.182, 0.045, 0.05], rot: [0.08, 0, 0] }),
        materialIndex: 3
      });
    }
    // 6 dorsal spine armor ridges + twin swept telemetry antennas at `-Z`
    for (let i = 0; i < 6; i += 1) {
      const z = -0.3 + i * 0.12;
      const y = 0.13 + Math.sin((i / 5) * Math.PI) * 0.035;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.085, 0.052, 0.085, 0.01), { pos: [0, y, z], rot: [-0.28, 0, 0] }),
        materialIndex: 2
      });
    }
    for (const ax of [-0.065, 0.065]) {
      slots.push({
        mesh: tubeSweepMesh([
          [ax, 0.11, -0.36, 0.009], [ax * 1.2, 0.26, -0.46, 0.006], [ax * 1.35, 0.41, -0.56, 0.003]
        ], 6),
        materialIndex: 4
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const headCowlMesh = multiMatFromMemo("en-hound-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 sloped sensor-array upper cranium
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 snout chassis & twin swept ear fins
    BZ_PROC_MATERIALS.visorCrimson,       // 2 crimson optical scanner visor & laser eyes (`+Z`)
    BZ_PROC_MATERIALS.brassStudio         // 3 side rangefinder lens bezels
  ], () => {
    const cowlPoly: V2[] = [[-0.11, -0.02], [0.11, -0.02], [0.085, 0.24], [-0.085, 0.24]];
    return [
      { mesh: transformMesh(extrudePolygonMesh(cowlPoly, 0.11, 0.016, true), { pos: [0, 0.03, 0.08], rot: [Math.PI * 0.5 + 0.14, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.15, 0.075, 0.24, 0.014), { pos: [0, 0.01, 0.12], rot: [0.08, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.03, 0.11, 0.14, 0.008), { pos: [-0.105, 0.095, -0.02], rot: [-0.42, 0, 0.22] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.03, 0.11, 0.14, 0.008), { pos: [0.105, 0.095, -0.02], rot: [-0.42, 0, -0.22] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.165, 0.034, 0.045, 0.006), { pos: [0, 0.036, 0.225] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.026, 0.026, 0.03, 0.005), { pos: [-0.086, 0.035, 0.18] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.026, 0.026, 0.03, 0.005), { pos: [0.086, 0.035, 0.18] }), materialIndex: 3 }
    ];
  }, { castShadow, receiveShadow: true });

  const lowerJawMesh = multiMatFromMemo("en-hound-jaw", `${name} jaw-mesh`, [
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.chromeStudio
  ], () => {
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(0.122, 0.038, 0.19, 0.009), { pos: [0, -0.012, 0.09] }), materialIndex: 0 }
    ];
    for (const fx of [-0.042, -0.015, 0.015, 0.042]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.008, 0], [0.005, 0.022], [0, 0.034]], 6), { pos: [fx, 0.006, 0.162] }),
        materialIndex: 1
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const legMats = [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 upper femur armor shell
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 rotary servo drum & digitigrade lower tibia
    BZ_PROC_MATERIALS.chromeStudio,       // 2 hydraulic piston strut & front talons
    BZ_PROC_MATERIALS.polymerGrip         // 3 grounded shock-absorbing paw pad (`minY = 0`)
  ];
  const makeMechLeg = (tag: string, isFront: boolean) =>
    multiMatFromMemo(`en-hound-leg-${tag}`, `${name} leg-${tag}`, legMats, () => {
      const kneeZ = isFront ? -0.055 : -0.085;
      const ankleZ = isFront ? 0.035 : 0.02;
      return [
        // Rotary shoulder/hip servo drum + upper armored femur
        {
          mesh: transformMesh(latheMesh([[0, -0.038], [0.062, -0.038], [0.062, 0.038], [0, 0.038]], 12), { rot: [0, 0, Math.PI * 0.5] }),
          materialIndex: 1
        },
        {
          mesh: tubeSweepMesh([[0, 0, 0, 0.048], [0, -0.13, kneeZ * 0.6, 0.044], [0, -0.24, kneeZ, 0.036]], 8),
          materialIndex: 0
        },
        // Chrome hydraulic actuator piston strut bridging femur & tibia
        {
          mesh: tubeSweepMesh([[0, -0.06, 0.042, 0.013], [0, -0.22, 0.028, 0.011], [0, -0.37, ankleZ + 0.018, 0.009]], 6),
          materialIndex: 2
        },
        // Reverse-jointed digitigrade lower tibia + ankle servo
        {
          mesh: tubeSweepMesh([[0, -0.24, kneeZ, 0.032], [0, -0.38, ankleZ, 0.026], [0, -0.49, 0.02, 0.024]], 8),
          materialIndex: 1
        },
        // Grounded mechanical paw pad (`bottom = -0.502 - 0.018 = -0.520` -> `0.520 - 0.520 = 0.000`) + 2 forward claws
        { mesh: transformMesh(bevelBoxMesh(0.096, 0.036, 0.145, 0.007), { pos: [0, -0.502, 0.032] }), materialIndex: 3 },
        { mesh: transformMesh(bevelBoxMesh(0.022, 0.024, 0.048, 0.004), { pos: [-0.026, -0.498, 0.105] }), materialIndex: 2 },
        { mesh: transformMesh(bevelBoxMesh(0.022, 0.024, 0.048, 0.004), { pos: [0.026, -0.498, 0.105] }), materialIndex: 2 }
      ];
    }, { castShadow, receiveShadow: true });

  return group(name, [
    group(`${name} rig`, [
      group(`${name} torso`, [
        chassisMesh,
        group(`${name} head`, [
          headCowlMesh,
          group(`${name} jaw`, [lowerJawMesh]).position(0, -0.048, 0.035).runtime(bind(ids.spec, "spec"))
        ]).position(0, 0.14, 0.38).runtime(bind(ids.head, "head"))
      ]).position(0, 0, 0).runtime(bind(ids.torso, "torso")),
      group(`${name} legFL`, [makeMechLeg("FL", true)]).position(0.17, 0, 0.25).runtime(bind(ids.legL, "legL")),
      group(`${name} legFR`, [makeMechLeg("FR", true)]).position(-0.17, 0, 0.25).runtime(bind(ids.legR, "legR")),
      group(`${name} legBL`, [makeMechLeg("BL", false)]).position(0.17, 0, -0.26).runtime(bind(ids.armL, "armL")),
      group(`${name} legBR`, [makeMechLeg("BR", false)]).position(-0.17, 0, -0.26).runtime(bind(ids.armR, "armR"))
    ]).position(0, 0.52, 0).runtime(bind(ids.rig, "rig"))
  ]).runtime(bind(ids.body, "body"));
}

function buildHeavyGunnerRigNodes(
  ids: EnemyRigIds,
  name: string,
  bind: EnemyRuntimeBinder,
  castShadow: boolean
): AuraNodeBuilder<AuraSceneNode> {
  // Grounded at `minY = 0`: `rig` sits at `y = 0.96`, heavy greave boot soles sit at `-0.936 - 0.024 = -0.960` -> `0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.darkFatigues,       // 0 quilted ballistic under-suit
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 heavy wrap-around blast greaves
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 flanged knee-prows & steel boot caps
    BZ_PROC_MATERIALS.polymerGrip         // 3 lugged siege boot soles (`minY = 0`)
  ];
  const makeHeavyLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-gunner-leg-${side}`, `${name} leg ${side}`, legMats, () => [
      { mesh: loftSectionsMesh(ellipticalRings([[0.04, 0.125, 0.13], [-0.2, 0.12, 0.125], [-0.42, 0.1, 0.105]], 10), true), materialIndex: 0 },
      { mesh: loftSectionsMesh(ellipticalRings([[-0.4, 0.115, 0.122, 0.01], [-0.64, 0.112, 0.118, 0.012], [-0.82, 0.098, 0.105, 0.008]], 10), true), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 0.17, 0.09, 0.018), { pos: [0, -0.41, 0.095], rot: [-0.1, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 0.09, 0.28, 0.018), { pos: [0, -0.89, 0.038] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.165, 0.048, 0.305, 0.009), { pos: [0, -0.936, 0.042] }), materialIndex: 3 }
    ], { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-gunner-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.hazardDrumBand
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.46, 0.15, 0.31, 0.024), { pos: [0, 0.02, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.24, 0.075, 0.016), { pos: [0, -0.09, 0.155], rot: [-0.08, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.042, 0.082, 0.006), { pos: [0, -0.16, 0.16] }), materialIndex: 2 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-gunner-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 broad layered blast chestplate & ammo pack shell
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 high ballistic collar shield & backpack frame
    BZ_PROC_MATERIALS.brassStudio,        // 2 flexible brass ammunition feed chute
    BZ_PROC_MATERIALS.hazardDrumBand      // 3 chest & backpack caution bars
  ], () => {
    const collarRing: [number, number, number, number][] = [
      [-0.21, 0.56, -0.08, 0.042], [-0.23, 0.55, 0.12, 0.042], [0, 0.53, 0.19, 0.04],
      [0.23, 0.55, 0.12, 0.042], [0.21, 0.56, -0.08, 0.042]
    ];
    return [
      { mesh: loftSectionsMesh(ellipticalRings([[0, 0.225, 0.16], [0.24, 0.285, 0.195], [0.48, 0.305, 0.2], [0.58, 0.22, 0.15]], 10), true), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.46, 0.32, 0.09, 0.022), { pos: [0, 0.31, 0.175], rot: [0.08, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.34, 0.055, 0.1, 0.008), { pos: [0, 0.22, 0.195] }), materialIndex: 3 },
      // High wrap-around ballistic collar shield
      { mesh: tubeSweepMesh(collarRing, 8), materialIndex: 1 },
      // Heavy dorsal ordnance ammo backpack + curved brass cartridge feed chute sweeping around right hip
      { mesh: transformMesh(bevelBoxMesh(0.42, 0.48, 0.24, 0.028), { pos: [0, 0.31, -0.26] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh([[0, -0.19], [0.115, -0.19], [0.115, 0.19], [0, 0.19]], 14), { pos: [0, 0.15, -0.29], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.052, 0.04, 0.006), { pos: [0, 0.42, -0.382] }), materialIndex: 3 },
      {
        mesh: tubeSweepMesh([
          [-0.16, 0.14, -0.24, 0.036], [-0.28, 0.06, -0.1, 0.036],
          [-0.3, 0.02, 0.1, 0.035], [-0.21, 0.05, 0.26, 0.034]
        ], 8),
        materialIndex: 2
      }
    ];
  }, { castShadow, receiveShadow: true });

  const headMesh = multiMatFromMemo("en-gunner-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.tacticalOliveArmor,
    BZ_PROC_MATERIALS.visorAmber
  ], () => [
    { mesh: transformMesh(latheMesh([[0.135, 0.04], [0.162, 0.12], [0.162, 0.24], [0.128, 0.33], [0, 0.365]], 14), { scale: [1.04, 1, 1.1] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.11, 0.16, 0.018), { pos: [0, 0.13, 0.085] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.065, 0.15, 0.014), { pos: [0, 0.245, 0.095], rot: [0.16, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.036, 0.05, 0.006), { pos: [0, 0.192, 0.148] }), materialIndex: 2 }
  ], { castShadow, receiveShadow: true });

  const armLeft = multiMatFromMemo("en-gunner-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.hazardDrumBand,
    BZ_PROC_MATERIALS.polymerGrip
  ], () => [
    // Layered 3-plate blast pauldron + heavy gauntlet gripping top chainsaw bar of minigun
    { mesh: transformMesh(bevelBoxMesh(0.2, 0.19, 0.24, 0.03), { pos: [0.04, 0.02, 0], rot: [0, 0, -0.24] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.12, 0.22, 0.022), { pos: [0.06, -0.09, 0], rot: [0, 0, -0.18] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.16, 0.036, 0.23, 0.006), { pos: [0.075, -0.04, 0], rot: [0, 0, -0.2] }), materialIndex: 2 },
    {
      mesh: tubeSweepMesh([
        [0.02, -0.08, 0, 0.068], [-0.06, -0.24, 0.14, 0.06], [-0.22, -0.28, 0.34, 0.054]
      ], 8),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.095, 0.088, 0.105, 0.016), { pos: [-0.25, -0.28, 0.37] }), materialIndex: 3 }
  ], { castShadow, receiveShadow: true });

  const armRightAndMinigunBody = multiMatFromMemo("en-gunner-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 layered blast pauldron
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 rotary minigun motor drum, receiver & top crossbar
    BZ_PROC_MATERIALS.brassStudio,        // 2 ammo feed block & motor cooling rings
    BZ_PROC_MATERIALS.polymerGrip         // 3 heavy gauntlet & rear spade grip
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.2, 0.19, 0.24, 0.03), { pos: [-0.04, 0.02, 0], rot: [0, 0, 0.24] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.12, 0.22, 0.022), { pos: [-0.06, -0.09, 0], rot: [0, 0, 0.18] }), materialIndex: 1 },
    {
      mesh: tubeSweepMesh([
        [-0.02, -0.08, 0, 0.068], [0.04, -0.25, 0.1, 0.062], [0.13, -0.32, 0.2, 0.056]
      ], 8),
      materialIndex: 3
    },
    // Underslung rotary minigun receiver drum (`pos: [0.18, -0.35, 0.29]` -> near body centerline, aimed `+Z`)
    {
      mesh: transformMesh(latheMesh([[0, -0.14], [0.098, -0.14], [0.098, 0.14], [0, 0.14]], 16), {
        pos: [0.18, -0.35, 0.29],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.11, 0.1, 0.14, 0.014), { pos: [0.09, -0.33, 0.28] }), materialIndex: 2 },
    {
      mesh: tubeSweepMesh([
        [0.1, -0.25, 0.34, 0.014], [0.1, -0.18, 0.36, 0.014], [0.26, -0.18, 0.36, 0.014], [0.26, -0.25, 0.34, 0.014]
      ], 7),
      materialIndex: 1
    }
  ], { castShadow, receiveShadow: true });

  // 6-barrel Gatling cluster spinning cleanly around local `Z` (`ids.spec`)!
  const minigunBarrels = multiMatFromMemo("en-gunner-barrels", `${name} barrels-mesh`, [
    BZ_PROC_MATERIALS.chromeStudio,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.muzzleCore
  ], () => {
    const slots: MultiMatSlot[] = [];
    const singleBarrel = transformMesh(latheMesh([[0.013, 0], [0.013, 0.54], [0.016, 0.55], [0.009, 0.56]], 8), {
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
        mesh: transformMesh(latheMesh([[0, -0.016], [0.078, -0.016], [0.078, 0.016], [0, 0.016]], 14), {
          pos: [0, 0, cz],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 1
      });
    }
    slots.push({
      mesh: transformMesh(latheMesh([[0.025, -0.01], [0.068, -0.01], [0.068, 0.012], [0.025, 0.012]], 12), {
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
  // Towering `3.08 m` Iron Warden exo-suit commander grounded at `minY = 0`:
  // `rig` sits at `y = 1.40`, sabaton sole bottom sits at `-1.368 - 0.032 = -1.400` -> `1.40 - 1.40 = 0.000`.
  const legMats = [
    BZ_PROC_MATERIALS.wardenExoArmor, // 0 heavy exo-thigh & flared shin armor
    BZ_PROC_MATERIALS.gunmetalSteel,  // 1 knee fortress prow & stabilizer sabatons
    BZ_PROC_MATERIALS.chromeStudio,   // 2 twin external hydraulic pistons
    BZ_PROC_MATERIALS.hazardDrumBand, // 3 hazard chevron shin plates
    BZ_PROC_MATERIALS.polymerGrip     // 4 grounded shock-pad sole (`minY = 0`)
  ];
  const makeWardenLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-warden-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const s = side === "L" ? 1 : -1;
      return [
        { mesh: loftSectionsMesh(ellipticalRings([[0.05, 0.185, 0.195], [-0.3, 0.175, 0.185], [-0.62, 0.145, 0.155]], 10), true), materialIndex: 0 },
        { mesh: loftSectionsMesh(ellipticalRings([[-0.6, 0.165, 0.18, 0.015], [-0.96, 0.175, 0.19, 0.02], [-1.24, 0.15, 0.165, 0.01]], 10), true), materialIndex: 0 },
        // Knee fortress prow + hazard chevron bar
        { mesh: transformMesh(bevelBoxMesh(0.24, 0.28, 0.14, 0.026), { pos: [0, -0.61, 0.145], rot: [-0.12, 0, 0] }), materialIndex: 1 },
        { mesh: transformMesh(bevelBoxMesh(0.22, 0.065, 0.15, 0.01), { pos: [0, -0.92, 0.155] }), materialIndex: 3 },
        // External chrome hydraulic actuator struts
        {
          mesh: tubeSweepMesh([[s * 0.155, -0.14, 0.02, 0.024], [s * 0.175, -0.58, 0.04, 0.022], [s * 0.155, -1.08, 0.02, 0.02]], 8),
          materialIndex: 2
        },
        // Stabilized exo-suit sabaton & grounded rubber sole (`bottom = -1.368 - 0.032 = -1.400`)
        { mesh: transformMesh(bevelBoxMesh(0.25, 0.14, 0.41, 0.024), { pos: [0, -1.29, 0.048] }), materialIndex: 1 },
        { mesh: transformMesh(bevelBoxMesh(0.26, 0.064, 0.44, 0.012), { pos: [0, -1.368, 0.05] }), materialIndex: 4 }
      ];
    }, { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-warden-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.crimsonDrumLacquer,
    BZ_PROC_MATERIALS.brassStudio
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.72, 0.24, 0.46, 0.036), { pos: [0, 0.04, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.38, 0.09, 0.018), { pos: [0, -0.16, 0.225], rot: [-0.08, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.055, 0.1, 0.008), { pos: [0, -0.28, 0.23] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.28, 0.34, 0.024), { pos: [-0.39, -0.08, 0], rot: [0, 0, 0.18] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.28, 0.34, 0.024), { pos: [0.39, -0.08, 0], rot: [0, 0, -0.18] }), materialIndex: 0 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-warden-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,     // 0 massive sloped reactor chestplate
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 sternum reactor cage & dorsal heat-sink powerplant
    BZ_PROC_MATERIALS.crimsonDrumLacquer, // 2 command livery chevrons
    BZ_PROC_MATERIALS.brassStudio,        // 3 command trim & reactor bezel
    BZ_PROC_MATERIALS.reactorCrimson      // 4 glowing crimson sternum reactor & dorsal vents
  ], () => [
    { mesh: loftSectionsMesh(ellipticalRings([[0, 0.34, 0.24], [0.38, 0.44, 0.29], [0.76, 0.48, 0.31], [0.94, 0.34, 0.22]], 12), true), materialIndex: 0 },
    // Sloped prow chest armor + command crimson livery plates
    { mesh: transformMesh(bevelBoxMesh(0.74, 0.52, 0.16, 0.032), { pos: [0, 0.52, 0.25], rot: [0.12, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.42, 0.08, 0.016), { pos: [-0.24, 0.54, 0.31], rot: [0.12, 0.16, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.42, 0.08, 0.016), { pos: [0.24, 0.54, 0.31], rot: [0.12, -0.16, 0] }), materialIndex: 2 },
    // Central recessed glowing crimson reactor core + brass bezel + protective ribs
    {
      mesh: transformMesh(latheMesh([[0.095, -0.02], [0.145, -0.015], [0.145, 0.03], [0.105, 0.038]], 16), {
        pos: [0, 0.54, 0.33],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 3
    },
    {
      mesh: transformMesh(latheMesh([[0, 0], [0.105, 0], [0.095, 0.028], [0, 0.032]], 14), {
        pos: [0, 0.54, 0.335],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 4
    },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.026, 0.04, 0.005), { pos: [0, 0.54, 0.365] }), materialIndex: 1 },
    // Dorsal exo-reactor pack & glowing crimson heat-sink louvres (`-Z`)
    { mesh: transformMesh(bevelBoxMesh(0.62, 0.68, 0.28, 0.032), { pos: [0, 0.5, -0.32] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.11, 0.06, 0.01), { pos: [0, 0.64, -0.455] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.11, 0.06, 0.01), { pos: [0, 0.44, -0.455] }), materialIndex: 4 }
  ], { castShadow, receiveShadow: true });

  // Twin shoulder missile / tactical beacon pods (`ids.spec`)
  const shoulderPodsMesh = multiMatFromMemo("en-warden-pods", `${name} pods-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.hazardDrumBand,
    BZ_PROC_MATERIALS.crimsonDrumLacquer,
    BZ_PROC_MATERIALS.reactorCrimson
  ], () => {
    const slots: MultiMatSlot[] = [];
    for (const sx of [-0.52, 0.52]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.3, 0.28, 0.38, 0.024), { pos: [sx, 0.12, 0] }), materialIndex: 0 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.045, 0.39, 0.008), { pos: [sx, 0.25, 0] }), materialIndex: 1 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.065, 0.11, 0.012), { pos: [sx, 0.295, 0.04] }), materialIndex: 3 });
      for (const mx of [-0.07, 0.07]) {
        for (const my of [0.06, 0.17]) {
          slots.push({
            mesh: transformMesh(latheMesh([[0.036, 0], [0.032, 0.045], [0, 0.085]], 8), {
              pos: [sx + mx, my, 0.18],
              rot: [Math.PI * 0.5, 0, 0]
            }),
            materialIndex: 2
          });
        }
      }
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  // Horned / crested tactical command cowling + bright crimson visor (`maxY = 3.08 m`)
  const headMesh = multiMatFromMemo("en-warden-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.brassStudio,
    BZ_PROC_MATERIALS.visorCrimson
  ], () => {
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(latheMesh([[0.17, 0.02], [0.215, 0.14], [0.215, 0.29], [0.165, 0.41], [0, 0.45]], 14), { scale: [1.06, 1, 1.12] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.36, 0.14, 0.24, 0.022), { pos: [0, 0.14, 0.1] }), materialIndex: 1 },
      // Central tactical command crest (`reaches y = 0.60` -> `1.40 + 0.10 + 0.98 + 0.60 = 3.08 m`)
      { mesh: transformMesh(bevelBoxMesh(0.065, 0.24, 0.34, 0.014), { pos: [0, 0.48, -0.02], rot: [-0.18, 0, 0] }), materialIndex: 2 },
      // Bright crimson visor slit facing `+Z`
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.056, 0.06, 0.008), { pos: [0, 0.23, 0.205] }), materialIndex: 3 }
    ];
    // Swept twin tactical command horns
    for (const sx of [-1, 1]) {
      slots.push({
        mesh: tubeSweepMesh([
          [sx * 0.18, 0.26, 0.04, 0.042], [sx * 0.29, 0.38, 0.08, 0.032],
          [sx * 0.34, 0.52, 0.15, 0.02], [sx * 0.31, 0.6, 0.22, 0.008]
        ], 8),
        materialIndex: 2
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const armLeft = multiMatFromMemo("en-warden-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.chromeStudio,
    BZ_PROC_MATERIALS.crimsonDrumLacquer
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.32, 0.28, 0.36, 0.038), { pos: [0.06, 0.04, 0], rot: [0, 0, -0.22] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.06, 0.37, 0.01), { pos: [0.08, 0.06, 0], rot: [0, 0, -0.22] }), materialIndex: 3 },
    {
      mesh: tubeSweepMesh([[0.04, -0.08, 0, 0.1], [0.06, -0.38, 0.14, 0.092], [-0.02, -0.52, 0.38, 0.088]], 8),
      materialIndex: 1
    },
    { mesh: tubeSweepMesh([[0.14, -0.06, 0.05, 0.022], [0.15, -0.36, 0.18, 0.02]], 6), materialIndex: 2 },
    // Armored siege gauntlet & forearm blast buckler
    { mesh: transformMesh(bevelBoxMesh(0.14, 0.24, 0.36, 0.024), { pos: [0.09, -0.46, 0.3] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.16, 0.15, 0.19, 0.022), { pos: [-0.03, -0.53, 0.45] }), materialIndex: 1 }
  ], { castShadow, receiveShadow: true });

  // Right hydraulic exo-arm + twin-linked heavy plasma / autocannon aimed along `+Z`!
  const armRightAndTwinCannon = multiMatFromMemo("en-warden-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor, // 0 sloped exo-pauldron & cannon housing
    BZ_PROC_MATERIALS.gunmetalSteel,  // 1 hydraulic arm & twin receiver breeches
    BZ_PROC_MATERIALS.chromeStudio,   // 2 twin heavy autocannon barrels & piston struts
    BZ_PROC_MATERIALS.brassStudio,    // 3 slotted cooling jackets
    BZ_PROC_MATERIALS.reactorCrimson  // 4 twin glowing plasma muzzle cores
  ], () => {
    const barrelProf: V2[] = [[0.032, 0], [0.032, 0.56], [0.042, 0.58], [0.042, 0.66], [0.024, 0.68]];
    const barrelMesh = transformMesh(latheMesh(barrelProf, 12), { rot: [Math.PI * 0.5, 0, 0] });
    return [
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.28, 0.36, 0.038), { pos: [-0.06, 0.04, 0], rot: [0, 0, 0.22] }), materialIndex: 0 },
      {
        mesh: tubeSweepMesh([[-0.04, -0.08, 0, 0.1], [-0.04, -0.36, 0.12, 0.095], [0.02, -0.44, 0.32, 0.09]], 8),
        materialIndex: 1
      },
      { mesh: tubeSweepMesh([[-0.14, -0.06, 0.05, 0.022], [-0.14, -0.34, 0.16, 0.02]], 6), materialIndex: 2 },
      // Twin-linked heavy plasma/autocannon receiver (`pos: [0.04, -0.44, 0.44]`, barrels to `z = +1.22`)
      { mesh: transformMesh(bevelBoxMesh(0.28, 0.22, 0.48, 0.028), { pos: [0.04, -0.44, 0.44] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.25, 0.14, 0.26, 0.018), { pos: [0.04, -0.44, 0.68] }), materialIndex: 3 },
      { mesh: transformMesh(barrelMesh, { pos: [-0.035, -0.44, 0.54] }), materialIndex: 2 },
      { mesh: transformMesh(barrelMesh, { pos: [0.115, -0.44, 0.54] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.048, 0.048, 0.04, 0.008), { pos: [-0.035, -0.44, 1.215] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.048, 0.048, 0.04, 0.008), { pos: [0.115, -0.44, 1.215] }), materialIndex: 4 }
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
        specRot: [0.28 * k, 0, 0]
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
      specRot: [0, 0, 0]
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
      specRot: [jawPitch + flinch * 0.25, 0, 0]
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

  if (inp.state === "attack") {
    torsoPitch = isBoss ? 0.08 : 0.11;
    if (isGunner) {
      const shudder = Math.sin(inp.time * 52) * 0.028;
      armRPitch = aim * 0.7 - 0.05 + shudder;
      armLPitch = aim * 0.7 - 0.05 - shudder * 0.6;
      torsoYaw = Math.sin(inp.time * 6.5) * 0.05;
      // High-speed 6-barrel Gatling spin around `+Z`!
      specRot = [0, 0, inp.time * 28 + inp.stateT * 16];
    } else if (isBoss) {
      const pulse = Math.exp(-((inp.stateT * 3.2) % 1) * 6.5);
      armRPitch = aim * 0.75 - pulse * 0.16;
      armLPitch = -0.14 + pulse * 0.08;
      torsoPitch = 0.09 - pulse * 0.05;
      // Elevate twin shoulder missile pods during volleys
      specRot = [-0.2 - pulse * 0.08, 0, 0];
    } else {
      // Guard crisp carbine recoil kick
      const shotCycle = (inp.stateT % 0.65) / 0.65;
      const kick = Math.exp(-shotCycle * 9.5);
      armRPitch = aim * 0.75 - kick * 0.2;
      armLPitch = aim * 0.75 - kick * 0.18;
      torsoPitch = 0.11 - kick * 0.06;
      specRot = [0, 0, inp.time * 8];
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
    specRot
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
