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
  extrudePolygonMesh,
  latheMesh,
  latticeTrussMesh,
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
  polymerGrip: material.blackRubber({ color: "#20252c", roughness: 0.68 }),
  corduraOlive: material.fabric({
    color: "#57623d",
    roughness: 0.8,
    sheen: 0.36,
    sheenColor: "#a2b07c",
    rim: { color: "#c8d4a6", power: 2.8, intensity: 0.34 }
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
  gunmetalSteel: material.metal({ color: "#434d5b", roughness: 0.28, metallic: 0.9 }),
  tacticalSlateArmor: material.pbr({
    color: "#6b7a8e",
    roughness: 0.36,
    metalness: 0.28,
    rim: { color: "#bfd8f6", power: 2.5, intensity: 0.54 }
  }),
  tacticalOliveArmor: material.pbr({
    color: "#6e7b54",
    roughness: 0.38,
    metalness: 0.2,
    rim: { color: "#dcd4ae", power: 2.5, intensity: 0.5 }
  }),
  wardenExoArmor: material.pbr({
    color: "#5a6778",
    roughness: 0.32,
    metalness: 0.46,
    rim: { color: "#ffb894", power: 2.3, intensity: 0.6 }
  }),
  darkFatigues: material.fabric({
    color: "#434c3f",
    roughness: 0.78,
    sheen: 0.34,
    sheenColor: "#8a987f",
    rim: { color: "#a8b8a4", power: 2.9, intensity: 0.3 }
  }),
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
  const spec = memoizeGeometry(`bz:${key}`, () => {
    const shaded = build().map((slot) =>
      isEmissiveOrGlass(materials[slot.materialIndex])
        ? slot
        : { mesh: bakeMeshCavityAO(slot.mesh, 0.24), materialIndex: slot.materialIndex }
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

/** Sculpted olive Cordura forearm sleeve (`sculptHumanoidLimbMesh` + armored bracer plate, `vm-sleeve-r/l`). */
export function buildTacticalSleeveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const s = hand === "right" ? 1 : -1;
  const mats = [BZ_PROC_MATERIALS.corduraOlive, BZ_PROC_MATERIALS.polymerGrip, BZ_PROC_MATERIALS.tacticalSlateArmor];
  return multiMatFromMemo(`vm-sleeve-${hand}`, name, mats, () => [
    {
      mesh: sculptHumanoidLimbMesh([
        [0, -0.125, 0, 0.042],
        [0.003 * s, -0.05, 0.002, 0.044],
        [0, 0.02, 0, 0.039],
        [0, 0.085, -0.002, 0.037],
        [0, 0.125, 0, 0.034]
      ], 12, 0.14),
      materialIndex: 0
    },
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.06, 0.095, 0.016, 0.004), 1, 0.36), { pos: [0.012 * s, -0.015, 0.038] }),
      materialIndex: 2
    },
    { mesh: transformMesh(bevelBoxMesh(0.078, 0.022, 0.076, 0.004), { pos: [0, 0.052, 0] }), materialIndex: 1 }
  ], { castShadow: false, receiveShadow: false });
}

/** Gunmetal tactical wrist cuff + glowing HUD field chronometer bezel (`latheMesh`, `vm-cuff-r`). */
export function buildTacticalWristCuffNode(name = "vm wrist cuff right"): AuraNodeBuilder<AuraGroupNode> {
  const mats = [BZ_PROC_MATERIALS.gunmetalBrushed, BZ_PROC_MATERIALS.tritiumGreen, BZ_PROC_MATERIALS.reticleCyan];
  return multiMatFromMemo("vm-wrist-cuff", name, mats, () => [
    { mesh: latheMesh([[0.034, -0.019], [0.041, -0.014], [0.041, 0.014], [0.034, 0.019]], 16), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.028, 0.018, 0.013, 0.003), { pos: [-0.018, 0.0, 0.038] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.018, 0.009, 0.004, 0.001), { pos: [-0.018, 0.002, 0.045] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.005, 0.004, 0.004, 0.001), { pos: [-0.005, -0.004, 0.045] }), materialIndex: 1 }
  ], { castShadow: false, receiveShadow: false });
}

/** Armored-knuckle combat glove (`subdivideSmoothMesh` palm + `sculptHumanoidLimbMesh` fingers + `ceramic` dorsal knuckle guard, `vm-glove-r/l`). */
export function buildTacticalGloveNode(hand: "right" | "left", name: string): AuraNodeBuilder<AuraGroupNode> {
  const s = hand === "right" ? 1 : -1;
  const mats = [BZ_PROC_MATERIALS.polymerGrip, BZ_PROC_MATERIALS.ceramicPlate];
  return multiMatFromMemo(`vm-glove-${hand}`, name, mats, () => {
    const slots: MultiMatSlot[] = [
      { mesh: subdivideSmoothMesh(bevelBoxMesh(0.068, 0.042, 0.076, 0.01), 1, 0.4), materialIndex: 0 },
      { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.064, 0.016, 0.034, 0.005), 1, 0.35), { pos: [0, 0.024, -0.014] }), materialIndex: 1 }
    ];
    for (let f = 0; f < 4; f += 1) {
      const fx = (-0.022 + f * 0.0145) * s;
      slots.push({
        mesh: sculptHumanoidLimbMesh([
          [fx, 0.004, -0.032, 0.0078],
          [fx, -0.008, -0.058, 0.007],
          [fx * 0.92, -0.024, -0.056, 0.0058]
        ], 8, 0.08),
        materialIndex: 0
      });
    }
    slots.push({
      mesh: sculptHumanoidLimbMesh([
        [-0.032 * s, 0.002, -0.012, 0.0088],
        [-0.042 * s, 0.012, -0.042, 0.0074],
        [-0.028 * s, 0.014, -0.058, 0.0062]
      ], 8, 0.08),
      materialIndex: 0
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
    BZ_PROC_MATERIALS.darkFatigues,       // 0 sculpted combat trousers & bloused gaiter
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 smooth contoured ballistic knee guard & toe plate
    BZ_PROC_MATERIALS.polymerGrip         // 2 laced combat boot upper & grounded lugged sole
  ];
  const makeLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-guard-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const thigh = sculptHumanoidLimbMesh(
        [[0, 0.03, 0, 0.095], [0, -0.19, 0.005, 0.09], [0, -0.41, 0.006, 0.074]],
        10,
        0.14
      );
      const shin = sculptHumanoidLimbMesh(
        [[0, -0.43, 0.004, 0.072], [0, -0.62, 0, 0.068], [0, -0.79, -0.004, 0.058]],
        10,
        0.12
      );
      const kneePoly: V2[] = [[-0.058, -0.07], [0.058, -0.07], [0.068, 0], [0.05, 0.07], [-0.05, 0.07], [-0.068, 0]];
      return [
        { mesh: thigh, materialIndex: 0 },
        { mesh: shin, materialIndex: 0 },
        {
          mesh: transformMesh(subdivideSmoothMesh(extrudePolygonMesh(kneePoly, 0.04, 0.009, true), 1, 0.5), { pos: [0, -0.42, 0.074] }),
          materialIndex: 1
        },
        // Laced ankle collar + boot body + armored toe cap + exact grounded lugged sole (`bottom = -0.92 - 0.02 = -0.940`)
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
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(ellipticalRings([[-0.06, 0.162, 0.118], [0.02, 0.178, 0.128], [0.08, 0.17, 0.122]], 10), true),
        1,
        0.48
      ),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(0.36, 0.062, 0.26, 0.012), { pos: [0, 0.045, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.056, 0.028, 0.005), { pos: [0, 0.045, 0.132] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.064, 0.13, 0.095, 0.012), { pos: [-0.195, -0.03, 0.01] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.072, 0.11, 0.1, 0.012), { pos: [0.192, -0.02, -0.02] }), materialIndex: 1 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-guard-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.corduraOlive,       // 0 sculpted Cordura tactical vest & ribcage
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 1 smooth-bevelled SAPI ballistic plates & dorsal pack
    BZ_PROC_MATERIALS.polymerGrip,        // 2 triple mag pouches, MOLLE straps & shoulder yokes
    BZ_PROC_MATERIALS.brassStudio,        // 3 pouch snap studs, chest core bezel & radio connector
    BZ_PROC_MATERIALS.reticleCyan,        // 4 emissive chest IFF telemetry HUD strip (`practical: true`)
    BZ_PROC_MATERIALS.visorAmber          // 5 glowing amber sternum IFF beacon core (`practical: true`)
  ], () => {
    const sapi: V2[] = [[-0.168, -0.18], [0.168, -0.18], [0.174, 0.085], [0.112, 0.205], [-0.112, 0.205], [-0.174, 0.085]];
    const slots: MultiMatSlot[] = [
      {
        mesh: subdivideSmoothMesh(
          loftSectionsMesh(ellipticalRings([[0.0, 0.172, 0.122], [0.22, 0.21, 0.145], [0.42, 0.22, 0.148], [0.5, 0.155, 0.112]], 10), true),
          1,
          0.5
        ),
        materialIndex: 0
      },
      { mesh: transformMesh(subdivideSmoothMesh(extrudePolygonMesh(sapi, 0.048, 0.011, true), 1, 0.42), { pos: [0, 0.26, 0.138] }), materialIndex: 1 },
      { mesh: transformMesh(subdivideSmoothMesh(extrudePolygonMesh(sapi, 0.044, 0.01, true), 1, 0.42), { pos: [0, 0.26, -0.135] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.25, 0.28, 0.11, 0.018), { pos: [0, 0.26, -0.19] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.126, 0.024, 0.02, 0.004), { pos: [0, 0.39, 0.168] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.084, 0.084, 0.022, 0.006), { pos: [0, 0.305, 0.168] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.058, 0.058, 0.026, 0.005), { pos: [0, 0.305, 0.174] }), materialIndex: 5 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 0.032, 0.022, 0.005), { pos: [0, 0.35, -0.245] }), materialIndex: 5 },
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
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 smooth-sculpted FAST ballistic helmet shell & NVG shroud
    BZ_PROC_MATERIALS.polymerGrip,        // 1 neck gorget, respirator face mask & cheek filters
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 side ARC rails & comm ear-defenders
    BZ_PROC_MATERIALS.visorAmber,         // 3 glowing amber tactical HUD visor slit (`+Z`)
    BZ_PROC_MATERIALS.reticleCyan         // 4 temple HUD rangefinder pip
  ], () => {
    const helmProf: V2[] = [
      [0.12, 0.095], [0.14, 0.135], [0.142, 0.22], [0.122, 0.305], [0.076, 0.358], [0, 0.376]
    ];
    return [
      { mesh: latheMesh([[0.072, -0.01], [0.082, 0.04], [0.078, 0.11]], 10), materialIndex: 1 },
      { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.168, 0.148, 0.188, 0.03), 1, 0.48), { pos: [0, 0.125, 0.012] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.112, 0.086, 0.092, 0.018), { pos: [0, 0.085, 0.09], rot: [0.22, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh([[0, -0.018], [0.032, -0.018], [0.032, 0.018], [0, 0.018]], 10), { pos: [-0.068, 0.076, 0.098], rot: [0.32, -0.45, Math.PI * 0.5] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh([[0, -0.018], [0.032, -0.018], [0.032, 0.018], [0, 0.018]], 10), { pos: [0.068, 0.076, 0.098], rot: [0.32, 0.45, Math.PI * 0.5] }), materialIndex: 1 },
      { mesh: subdivideSmoothMesh(transformMesh(latheMesh(helmProf, 14), { scale: [1.02, 1.02, 1.13] }), 1, 0.52), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.24, 0.048, 0.14, 0.012), { pos: [0, 0.205, 0.094], rot: [0.14, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.064, 0.052, 0.036, 0.007), { pos: [0, 0.252, 0.145], rot: [-0.18, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.046, 0.095, 0.105, 0.012), { pos: [-0.134, 0.155, -0.005] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.046, 0.095, 0.105, 0.012), { pos: [0.134, 0.155, -0.005] }), materialIndex: 2 },
      // Glowing tactical HUD visor slit + rangefinder pip facing `+Z`
      { mesh: transformMesh(bevelBoxMesh(0.196, 0.042, 0.048, 0.008), { pos: [0, 0.168, 0.114] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.018, 0.018, 0.022, 0.004), { pos: [0.118, 0.182, 0.098] }), materialIndex: 4 }
    ];
  }, { castShadow, receiveShadow: true });

  const armRightAndCarbine = multiMatFromMemo("en-guard-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 sculpted shoulder pauldron
    BZ_PROC_MATERIALS.darkFatigues,       // 1 humanoid-sculpted sleeve bicep & forearm
    BZ_PROC_MATERIALS.polymerGrip,        // 2 armored glove, carbine stock, grip & curved mag
    BZ_PROC_MATERIALS.gunmetalSteel,      // 3 carbine receiver & top rail
    BZ_PROC_MATERIALS.reticleCyan,        // 4 carbine reflex HUD optic dot
    BZ_PROC_MATERIALS.chromeStudio,       // 5 high-contrast machined barrel & flash suppressor
    BZ_PROC_MATERIALS.hazardDrumBand      // 6 shoulder pauldron tactical chevron band
  ], () => [
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.136, 0.156, 0.162, 0.028), 1, 0.5), { pos: [-0.02, -0.02, 0], rot: [0, 0, 0.18] }),
      materialIndex: 0
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.144, 0.03, 0.15, 0.006), { pos: [-0.024, 0.01, 0], rot: [0, 0, 0.18] }),
      materialIndex: 6
    },
    {
      mesh: sculptHumanoidLimbMesh(
        [[0, -0.02, 0, 0.056], [-0.01, -0.18, 0.09, 0.05], [0.05, -0.22, 0.24, 0.045], [0.11, -0.18, 0.34, 0.04]],
        10,
        0.13
      ),
      materialIndex: 1
    },
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.076, 0.07, 0.092, 0.016), 1, 0.46), { pos: [0.125, -0.175, 0.36] }),
      materialIndex: 2
    },
    // Tactical carbine aimed forward along `+Z` with distinct machined chrome barrel
    { mesh: transformMesh(bevelBoxMesh(0.058, 0.082, 0.36, 0.009), { pos: [0.135, -0.115, 0.44] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.044, 0.096, 0.16, 0.008), { pos: [0.135, -0.13, 0.21] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.04, 0.13, 0.056, 0.007), { pos: [0.135, -0.225, 0.49], rot: [0.24, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.046, 0.036, 0.09, 0.006), { pos: [0.135, -0.058, 0.43] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.022, 0.016, 0.016, 0.003), { pos: [0.135, -0.056, 0.39] }), materialIndex: 4 },
    {
      mesh: transformMesh(latheMesh([[0.016, 0], [0.018, 0.19], [0.025, 0.2], [0.025, 0.26], [0.013, 0.27]], 12), {
        pos: [0.135, -0.105, 0.6],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 5
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
    BZ_PROC_MATERIALS.polymerGrip,
    BZ_PROC_MATERIALS.hazardDrumBand
  ], () => [
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.136, 0.156, 0.162, 0.028), 1, 0.5), { pos: [0.02, -0.02, 0], rot: [0, 0, -0.18] }),
      materialIndex: 0
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.144, 0.03, 0.15, 0.006), { pos: [0.024, 0.01, 0], rot: [0, 0, -0.18] }),
      materialIndex: 3
    },
    {
      mesh: sculptHumanoidLimbMesh(
        [[0, -0.02, 0, 0.056], [0.01, -0.17, 0.12, 0.048], [-0.14, -0.18, 0.34, 0.044], [-0.32, -0.145, 0.52, 0.038]],
        10,
        0.13
      ),
      materialIndex: 1
    },
    {
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.076, 0.068, 0.092, 0.016), 1, 0.46), { pos: [-0.345, -0.14, 0.545] }),
      materialIndex: 2
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
  // Grounded at `minY = 0`: `rig` sits at `y = 0.52`, 4 paw pads sit at `y = -0.502 - 0.018 = -0.520` -> `0.52 - 0.52 = 0.000`.
  const chassisMesh = multiMatFromMemo("en-hound-chassis", `${name} chassis`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 streamlined smooth-sculpted cyber-hull
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 reactive side flank pods
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 dorsal spine vertebrae & servo housings
    BZ_PROC_MATERIALS.hazardDrumBand,     // 3 hazard chevron flank accents
    BZ_PROC_MATERIALS.chromeStudio,       // 4 twin dorsal telemetry whip antennas
    BZ_PROC_MATERIALS.reticleCyan,        // 5 flank HUD status telemetry strips
    BZ_PROC_MATERIALS.reactorCrimson      // 6 glowing forward chest/throat power core (`+Z`)
  ], () => {
    const slots: MultiMatSlot[] = [
      {
        mesh: transformMesh(
          subdivideSmoothMesh(
            sculptStreamlinedHullMesh(0.88, 0.36, 0.27, {
              noseSharpness: 1.32,
              tailTaper: 0.46,
              canopyBulge: 0.22,
              undersideFlat: 0.3,
              stations: 12,
              ringPoints: 12
            }),
            1,
            0.46
          ),
          { pos: [0, 0.025, 0.02], rot: [0, -Math.PI * 0.5, 0] }
        ),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(0.095, 0.068, 0.048, 0.008), { pos: [0, 0.015, 0.39], rot: [0.22, 0, 0] }), materialIndex: 6 }
    ];
    for (const sx of [-1, 1]) {
      slots.push({
        mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.052, 0.17, 0.46, 0.014), 1, 0.44), {
          pos: [sx * 0.175, 0.025, 0.03],
          rot: [0.08, 0, sx * -0.14]
        }),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.048, 0.04, 0.32, 0.006), { pos: [sx * 0.184, 0.045, 0.05], rot: [0.08, 0, 0] }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.02, 0.016, 0.2, 0.004), { pos: [sx * 0.194, 0.082, 0.06], rot: [0.08, 0, 0] }),
        materialIndex: 5
      });
    }
    // 6 dorsal spine armor ridges + twin swept telemetry antennas (`z >= -0.49` so snout `maxZ = +0.63 > |minZ|`)
    for (let i = 0; i < 6; i += 1) {
      const z = -0.28 + i * 0.12;
      const y = 0.145 + Math.sin((i / 5) * Math.PI) * 0.035;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.088, 0.052, 0.086, 0.01), { pos: [0, y, z], rot: [-0.28, 0, 0] }),
        materialIndex: 2
      });
    }
    for (const ax of [-0.065, 0.065]) {
      slots.push({
        mesh: tubeSweepMesh([
          [ax, 0.12, -0.34, 0.009], [ax * 1.2, 0.27, -0.42, 0.006], [ax * 1.35, 0.42, -0.48, 0.003]
        ], 6),
        materialIndex: 4
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const headCowlMesh = multiMatFromMemo("en-hound-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 smooth-sculpted predator sensor cranium
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 snout chassis & twin swept ear-blade fins
    BZ_PROC_MATERIALS.visorCrimson,       // 2 crimson optical scanner visor (`+Z`)
    BZ_PROC_MATERIALS.brassStudio,        // 3 side rangefinder lens bezels
    BZ_PROC_MATERIALS.reticleCyan         // 4 nose lidar HUD emitter pip
  ], () => {
    const cowlPoly: V2[] = [[-0.115, -0.02], [0.115, -0.02], [0.088, 0.25], [-0.088, 0.25]];
    return [
      {
        mesh: transformMesh(subdivideSmoothMesh(extrudePolygonMesh(cowlPoly, 0.118, 0.018, true), 1, 0.48), {
          pos: [0, 0.035, 0.085],
          rot: [Math.PI * 0.5 + 0.14, 0, 0]
        }),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(0.152, 0.076, 0.248, 0.014), { pos: [0, 0.01, 0.125], rot: [0.08, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.03, 0.115, 0.145, 0.008), { pos: [-0.105, 0.098, -0.02], rot: [-0.42, 0, 0.22] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.03, 0.115, 0.145, 0.008), { pos: [0.105, 0.098, -0.02], rot: [-0.42, 0, -0.22] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.166, 0.036, 0.048, 0.006), { pos: [0, 0.038, 0.232] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.034, 0.016, 0.022, 0.004), { pos: [0, 0.068, 0.215] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.026, 0.026, 0.03, 0.005), { pos: [-0.086, 0.035, 0.185] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.026, 0.026, 0.03, 0.005), { pos: [0.086, 0.035, 0.185] }), materialIndex: 3 }
    ];
  }, { castShadow, receiveShadow: true });

  const lowerJawMesh = multiMatFromMemo("en-hound-jaw", `${name} jaw-mesh`, [
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.chromeStudio
  ], () => {
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(0.124, 0.038, 0.196, 0.009), { pos: [0, -0.012, 0.095] }), materialIndex: 0 }
    ];
    for (const fx of [-0.042, -0.015, 0.015, 0.042]) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.008, 0], [0.005, 0.022], [0, 0.034]], 6), { pos: [fx, 0.006, 0.168] }),
        materialIndex: 1
      });
    }
    return slots;
  }, { castShadow, receiveShadow: true });

  const legMats = [
    BZ_PROC_MATERIALS.tacticalSlateArmor, // 0 sculpted upper femur armor shell
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 rotary servo drum & digitigrade lower tibia
    BZ_PROC_MATERIALS.chromeStudio,       // 2 hydraulic piston strut & front talons
    BZ_PROC_MATERIALS.polymerGrip         // 3 grounded shock-absorbing paw pad (`minY = 0`)
  ];
  const makeMechLeg = (tag: string, isFront: boolean) =>
    multiMatFromMemo(`en-hound-leg-${tag}`, `${name} leg-${tag}`, legMats, () => {
      const kneeZ = isFront ? -0.055 : -0.085;
      const ankleZ = isFront ? 0.035 : 0.02;
      return [
        {
          mesh: transformMesh(latheMesh([[0, -0.038], [0.062, -0.038], [0.062, 0.038], [0, 0.038]], 12), { rot: [0, 0, Math.PI * 0.5] }),
          materialIndex: 1
        },
        {
          mesh: sculptHumanoidLimbMesh([[0, 0, 0, 0.05], [0, -0.13, kneeZ * 0.6, 0.046], [0, -0.24, kneeZ, 0.036]], 9, 0.12),
          materialIndex: 0
        },
        {
          mesh: tubeSweepMesh([[0, -0.06, 0.042, 0.013], [0, -0.22, 0.028, 0.011], [0, -0.37, ankleZ + 0.018, 0.009]], 6),
          materialIndex: 2
        },
        {
          mesh: sculptHumanoidLimbMesh([[0, -0.24, kneeZ, 0.033], [0, -0.38, ankleZ, 0.027], [0, -0.49, 0.02, 0.024]], 9, 0.08),
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
    BZ_PROC_MATERIALS.darkFatigues,       // 0 sculpted quilted ballistic under-suit
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 1 smooth heavy wrap-around blast greaves
    BZ_PROC_MATERIALS.gunmetalSteel,      // 2 flanged knee-prows & steel boot caps
    BZ_PROC_MATERIALS.polymerGrip         // 3 lugged siege boot soles (`minY = 0`)
  ];
  const makeHeavyLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-gunner-leg-${side}`, `${name} leg ${side}`, legMats, () => [
      {
        mesh: sculptHumanoidLimbMesh([[0, 0.04, 0, 0.128], [0, -0.2, 0.005, 0.122], [0, -0.42, 0.006, 0.102]], 10, 0.14),
        materialIndex: 0
      },
      {
        mesh: subdivideSmoothMesh(
          loftSectionsMesh(ellipticalRings([[-0.4, 0.118, 0.125, 0.01], [-0.64, 0.115, 0.12, 0.012], [-0.82, 0.1, 0.108, 0.008]], 10), true),
          1,
          0.48
        ),
        materialIndex: 1
      },
      { mesh: transformMesh(bevelBoxMesh(0.164, 0.174, 0.094, 0.018), { pos: [0, -0.41, 0.098], rot: [-0.1, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 0.09, 0.28, 0.018), { pos: [0, -0.89, 0.038] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.165, 0.048, 0.305, 0.009), { pos: [0, -0.936, 0.042] }), materialIndex: 3 }
    ], { castShadow, receiveShadow: true });

  const pelvisMesh = multiMatFromMemo("en-gunner-pelvis", `${name} pelvis`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.hazardDrumBand
  ], () => [
    { mesh: transformMesh(bevelBoxMesh(0.46, 0.15, 0.31, 0.024), { pos: [0, 0.02, 0] }), materialIndex: 1 },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.248, 0.245, 0.082, 0.018), 1, 0.46), { pos: [0, -0.09, 0.155], rot: [-0.08, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.042, 0.082, 0.006), { pos: [0, -0.16, 0.16] }), materialIndex: 2 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-gunner-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 sculpted EOD blast carapace & ammo pack shell
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 high ballistic collar shield & backpack frame
    BZ_PROC_MATERIALS.brassStudio,        // 2 flexible brass ammunition feed chute
    BZ_PROC_MATERIALS.hazardDrumBand,     // 3 chest & backpack caution bars
    BZ_PROC_MATERIALS.reticleCyan,        // 4 chest digital ammo-link HUD telemetry bar
    BZ_PROC_MATERIALS.visorAmber          // 5 glowing amber EOD sternum power core (`practical: true`)
  ], () => {
    const collarRing: [number, number, number, number][] = [
      [-0.21, 0.56, -0.08, 0.042], [-0.23, 0.55, 0.12, 0.042], [0, 0.53, 0.19, 0.04],
      [0.23, 0.55, 0.12, 0.042], [0.21, 0.56, -0.08, 0.042]
    ];
    return [
      {
        mesh: subdivideSmoothMesh(
          loftSectionsMesh(ellipticalRings([[0, 0.228, 0.162], [0.24, 0.29, 0.198], [0.48, 0.31, 0.205], [0.58, 0.225, 0.154]], 10), true),
          1,
          0.5
        ),
        materialIndex: 0
      },
      { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.47, 0.33, 0.096, 0.024), 1, 0.46), { pos: [0, 0.31, 0.175], rot: [0.08, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.34, 0.055, 0.1, 0.008), { pos: [0, 0.22, 0.195] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 0.024, 0.022, 0.004), { pos: [0, 0.39, 0.215], rot: [0.08, 0, 0] }), materialIndex: 4 },
      { mesh: transformMesh(bevelBoxMesh(0.095, 0.088, 0.03, 0.006), { pos: [0, 0.305, 0.224], rot: [0.08, 0, 0] }), materialIndex: 5 },
      { mesh: tubeSweepMesh(collarRing, 8), materialIndex: 1 },
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
    BZ_PROC_MATERIALS.visorAmber,
    BZ_PROC_MATERIALS.reticleCyan
  ], () => [
    // Smooth-sculpted juggernaut ballistic dome + crown comms ridge (`1.62 + 0.42 = 2.04 m`, inside `[1.95, 2.22]`)
    {
      mesh: subdivideSmoothMesh(
        transformMesh(latheMesh([[0.138, 0.04], [0.168, 0.13], [0.168, 0.255], [0.132, 0.35], [0, 0.41]], 14), { scale: [1.05, 1.02, 1.12] }),
        1,
        0.5
      ),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.088, 0.064, 0.24, 0.012), { pos: [0, 0.388, 0.01] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.285, 0.115, 0.165, 0.018), { pos: [0, 0.13, 0.088] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.285, 0.068, 0.154, 0.014), { pos: [0, 0.248, 0.098], rot: [0.16, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.224, 0.038, 0.052, 0.006), { pos: [0, 0.194, 0.152] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.022, 0.02, 0.024, 0.004), { pos: [-0.132, 0.205, 0.135] }), materialIndex: 3 }
  ], { castShadow, receiveShadow: true });

  const armLeft = multiMatFromMemo("en-gunner-arm-l", `${name} armL-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.hazardDrumBand,
    BZ_PROC_MATERIALS.polymerGrip
  ], () => [
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.21, 0.198, 0.248, 0.032), 1, 0.5), { pos: [0.04, 0.02, 0], rot: [0, 0, -0.24] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.12, 0.22, 0.022), { pos: [0.06, -0.09, 0], rot: [0, 0, -0.18] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.16, 0.036, 0.23, 0.006), { pos: [0.075, -0.04, 0], rot: [0, 0, -0.2] }), materialIndex: 2 },
    {
      mesh: sculptHumanoidLimbMesh([[0.02, -0.08, 0, 0.07], [-0.06, -0.24, 0.14, 0.062], [-0.22, -0.28, 0.34, 0.054]], 10, 0.13),
      materialIndex: 1
    },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.1, 0.092, 0.11, 0.018), 1, 0.46), { pos: [-0.25, -0.28, 0.37] }), materialIndex: 3 }
  ], { castShadow, receiveShadow: true });

  const armRightAndMinigunBody = multiMatFromMemo("en-gunner-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.tacticalOliveArmor, // 0 smooth layered blast pauldron
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 rotary minigun motor drum, receiver & top crossbar
    BZ_PROC_MATERIALS.brassStudio,        // 2 ammo feed block & motor cooling rings
    BZ_PROC_MATERIALS.polymerGrip,        // 3 sculpted heavy arm & rear spade grip
    BZ_PROC_MATERIALS.reticleCyan         // 4 minigun barrel-heat HUD bar
  ], () => [
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.21, 0.198, 0.248, 0.032), 1, 0.5), { pos: [-0.04, 0.02, 0], rot: [0, 0, 0.24] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.19, 0.12, 0.22, 0.022), { pos: [-0.06, -0.09, 0], rot: [0, 0, 0.18] }), materialIndex: 1 },
    {
      mesh: sculptHumanoidLimbMesh([[-0.02, -0.08, 0, 0.07], [0.04, -0.25, 0.1, 0.064], [0.13, -0.32, 0.2, 0.056]], 10, 0.13),
      materialIndex: 3
    },
    {
      mesh: transformMesh(latheMesh([[0, -0.14], [0.098, -0.14], [0.098, 0.14], [0, 0.14]], 16), {
        pos: [0.18, -0.35, 0.29],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.11, 0.1, 0.14, 0.014), { pos: [0.09, -0.33, 0.28] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.02, 0.085, 0.004), { pos: [0.18, -0.245, 0.28] }), materialIndex: 4 },
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
    BZ_PROC_MATERIALS.wardenExoArmor, // 0 sculpted exo-thigh & smooth flared shin armor
    BZ_PROC_MATERIALS.gunmetalSteel,  // 1 knee fortress prow & stabilizer sabatons
    BZ_PROC_MATERIALS.chromeStudio,   // 2 twin external hydraulic pistons
    BZ_PROC_MATERIALS.hazardDrumBand, // 3 hazard chevron shin plates
    BZ_PROC_MATERIALS.polymerGrip     // 4 grounded shock-pad sole (`minY = 0`)
  ];
  const makeWardenLeg = (side: "L" | "R") =>
    multiMatFromMemo(`en-warden-leg-${side}`, `${name} leg ${side}`, legMats, () => {
      const s = side === "L" ? 1 : -1;
      return [
        {
          mesh: sculptHumanoidLimbMesh([[0, 0.05, 0, 0.19], [0, -0.3, 0.008, 0.178], [0, -0.62, 0.01, 0.148]], 11, 0.15),
          materialIndex: 0
        },
        {
          mesh: subdivideSmoothMesh(
            loftSectionsMesh(ellipticalRings([[-0.6, 0.17, 0.185, 0.015], [-0.96, 0.18, 0.195, 0.02], [-1.24, 0.155, 0.17, 0.01]], 10), true),
            1,
            0.48
          ),
          materialIndex: 0
        },
        { mesh: transformMesh(bevelBoxMesh(0.24, 0.28, 0.14, 0.026), { pos: [0, -0.61, 0.145], rot: [-0.12, 0, 0] }), materialIndex: 1 },
        { mesh: transformMesh(bevelBoxMesh(0.22, 0.065, 0.15, 0.01), { pos: [0, -0.92, 0.155] }), materialIndex: 3 },
        {
          mesh: tubeSweepMesh([[s * 0.155, -0.14, 0.02, 0.024], [s * 0.175, -0.58, 0.04, 0.022], [s * 0.155, -1.08, 0.02, 0.02]], 8),
          materialIndex: 2
        },
        // Stabilized exo-suit sabaton & exact grounded rubber sole (`bottom = -1.368 - 0.032 = -1.400`)
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
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.29, 0.39, 0.095, 0.02), 1, 0.45), { pos: [0, -0.16, 0.225], rot: [-0.08, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.055, 0.1, 0.008), { pos: [0, -0.28, 0.23] }), materialIndex: 3 },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.19, 0.29, 0.35, 0.028), 1, 0.46), { pos: [-0.39, -0.08, 0], rot: [0, 0, 0.18] }), materialIndex: 0 },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.19, 0.29, 0.35, 0.028), 1, 0.46), { pos: [0.39, -0.08, 0], rot: [0, 0, -0.18] }), materialIndex: 0 }
  ], { castShadow, receiveShadow: true });

  const torsoMesh = multiMatFromMemo("en-warden-torso", `${name} torso-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,     // 0 smooth-sculpted massive sloped reactor carapace
    BZ_PROC_MATERIALS.gunmetalSteel,      // 1 sternum reactor cage & dorsal heat-sink powerplant
    BZ_PROC_MATERIALS.crimsonDrumLacquer, // 2 command livery chevrons
    BZ_PROC_MATERIALS.brassStudio,        // 3 command trim & reactor bezel
    BZ_PROC_MATERIALS.reactorCrimson,     // 4 glowing crimson sternum reactor & dorsal vents
    BZ_PROC_MATERIALS.reticleCyan         // 5 twin reactor HUD telemetry strips
  ], () => [
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(ellipticalRings([[0, 0.345, 0.245], [0.38, 0.45, 0.295], [0.76, 0.49, 0.315], [0.94, 0.345, 0.225]], 12), true),
        1,
        0.5
      ),
      materialIndex: 0
    },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.75, 0.53, 0.17, 0.036), 1, 0.46), { pos: [0, 0.52, 0.25], rot: [0.12, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.42, 0.08, 0.016), { pos: [-0.24, 0.54, 0.31], rot: [0.12, 0.16, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.42, 0.08, 0.016), { pos: [0.24, 0.54, 0.31], rot: [0.12, -0.16, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.12, 0.026, 0.026, 0.004), { pos: [-0.22, 0.72, 0.325], rot: [0.12, 0.16, 0] }), materialIndex: 5 },
    { mesh: transformMesh(bevelBoxMesh(0.12, 0.026, 0.026, 0.004), { pos: [0.22, 0.72, 0.325], rot: [0.12, -0.16, 0] }), materialIndex: 5 },
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
    { mesh: transformMesh(bevelBoxMesh(0.62, 0.68, 0.28, 0.032), { pos: [0, 0.5, -0.32] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.11, 0.06, 0.01), { pos: [0, 0.64, -0.455] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.11, 0.06, 0.01), { pos: [0, 0.44, -0.455] }), materialIndex: 4 }
  ], { castShadow, receiveShadow: true });

  // Twin shoulder missile / tactical beacon pods (`ids.spec`)
  const shoulderPodsMesh = multiMatFromMemo("en-warden-pods", `${name} pods-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.hazardDrumBand,
    BZ_PROC_MATERIALS.crimsonDrumLacquer,
    BZ_PROC_MATERIALS.reactorCrimson,
    BZ_PROC_MATERIALS.reticleCyan
  ], () => {
    const slots: MultiMatSlot[] = [];
    for (const sx of [-0.52, 0.52]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.3, 0.28, 0.38, 0.024), { pos: [sx, 0.12, 0] }), materialIndex: 0 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.045, 0.39, 0.008), { pos: [sx, 0.25, 0] }), materialIndex: 1 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.065, 0.11, 0.012), { pos: [sx, 0.295, 0.04] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.022, 0.022, 0.004), { pos: [sx, 0.22, 0.195] }), materialIndex: 4 });
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

  // Horned / crested smooth-sculpted tactical mech command cowling + bright crimson visor (`maxY = 3.08 m`)
  const headMesh = multiMatFromMemo("en-warden-head", `${name} head-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor,
    BZ_PROC_MATERIALS.gunmetalSteel,
    BZ_PROC_MATERIALS.brassStudio,
    BZ_PROC_MATERIALS.visorCrimson,
    BZ_PROC_MATERIALS.reticleCyan
  ], () => {
    const slots: MultiMatSlot[] = [
      {
        mesh: subdivideSmoothMesh(
          transformMesh(latheMesh([[0.175, 0.02], [0.22, 0.14], [0.22, 0.3], [0.17, 0.42], [0, 0.46]], 14), { scale: [1.07, 1.02, 1.14] }),
          1,
          0.5
        ),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(0.36, 0.14, 0.24, 0.022), { pos: [0, 0.14, 0.1] }), materialIndex: 1 },
      // Central tactical command crest (`reaches y = 0.60` -> `1.40 + 0.10 + 0.98 + 0.60 = 3.08 m`)
      { mesh: transformMesh(bevelBoxMesh(0.065, 0.24, 0.34, 0.014), { pos: [0, 0.48, -0.02], rot: [-0.18, 0, 0] }), materialIndex: 2 },
      // Bright crimson visor slit + cyan optical sensor pips facing `+Z`
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.056, 0.06, 0.008), { pos: [0, 0.23, 0.208] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.05, 0.02, 0.026, 0.004), { pos: [0, 0.31, 0.2] }), materialIndex: 4 }
    ];
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
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.33, 0.29, 0.37, 0.04), 1, 0.48), { pos: [0.06, 0.04, 0], rot: [0, 0, -0.22] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.06, 0.37, 0.01), { pos: [0.08, 0.06, 0], rot: [0, 0, -0.22] }), materialIndex: 3 },
    {
      mesh: sculptHumanoidLimbMesh([[0.04, -0.08, 0, 0.104], [0.06, -0.38, 0.14, 0.095], [-0.02, -0.52, 0.38, 0.088]], 10, 0.14),
      materialIndex: 1
    },
    { mesh: tubeSweepMesh([[0.14, -0.06, 0.05, 0.022], [0.15, -0.36, 0.18, 0.02]], 6), materialIndex: 2 },
    { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.15, 0.25, 0.37, 0.026), 1, 0.45), { pos: [0.09, -0.46, 0.3] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.16, 0.15, 0.19, 0.022), { pos: [-0.03, -0.53, 0.45] }), materialIndex: 1 }
  ], { castShadow, receiveShadow: true });

  // Right hydraulic exo-arm + twin-linked heavy plasma / autocannon aimed along `+Z`!
  const armRightAndTwinCannon = multiMatFromMemo("en-warden-arm-r", `${name} armR-mesh`, [
    BZ_PROC_MATERIALS.wardenExoArmor, // 0 sloped exo-pauldron & cannon housing
    BZ_PROC_MATERIALS.gunmetalSteel,  // 1 sculpted hydraulic arm & twin receiver breeches
    BZ_PROC_MATERIALS.chromeStudio,   // 2 twin heavy autocannon barrels & piston struts
    BZ_PROC_MATERIALS.brassStudio,    // 3 slotted cooling jackets
    BZ_PROC_MATERIALS.reactorCrimson, // 4 twin glowing plasma muzzle cores
    BZ_PROC_MATERIALS.reticleCyan     // 5 autocannon HUD thermal telemetry bar
  ], () => {
    const barrelProf: V2[] = [[0.032, 0], [0.032, 0.56], [0.042, 0.58], [0.042, 0.66], [0.024, 0.68]];
    const barrelMesh = transformMesh(latheMesh(barrelProf, 12), { rot: [Math.PI * 0.5, 0, 0] });
    return [
      { mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.33, 0.29, 0.37, 0.04), 1, 0.48), { pos: [-0.06, 0.04, 0], rot: [0, 0, 0.22] }), materialIndex: 0 },
      {
        mesh: sculptHumanoidLimbMesh([[-0.04, -0.08, 0, 0.104], [-0.04, -0.36, 0.12, 0.096], [0.02, -0.44, 0.32, 0.09]], 10, 0.14),
        materialIndex: 1
      },
      { mesh: tubeSweepMesh([[-0.14, -0.06, 0.05, 0.022], [-0.14, -0.34, 0.16, 0.02]], 6), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.28, 0.22, 0.48, 0.028), { pos: [0.04, -0.44, 0.44] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.14, 0.022, 0.16, 0.004), { pos: [0.04, -0.324, 0.44] }), materialIndex: 5 },
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
