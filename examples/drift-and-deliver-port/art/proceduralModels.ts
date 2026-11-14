/**
 * Harbor Drift (`drift-and-deliver-port`) — 100% Procedural Multi-Material `@aura3d/engine` 3D Art Kit.
 *
 * Builds all 14 harbor vehicles, 7-class city traffic fleet (`sedan`, `hatch`, `van`, `truck`, `taxi`, `bus`, `cruiser`),
 * street furniture (`lamp`, `signal`, `tree`, `palm`, `shelter`, `hydrant`), rooftop water towers (`watertank`),
 * harbor landmarks (`clocktower`, `lighthouse`), downtown cornice/awning shopfront accents, and a glowing drop-off
 * parcel locker kiosk exclusively from `apps/showcase-port-shared/proceduralKernel.ts` and `@aura3d/engine` physical
 * surface presets (`0` `.glb` files).
 *
 * Coordinate & simulation parity contract:
 * - Vehicle local frame: `+Z` forward, `-Z` rear (facing chase camera), `+X` right, `+Y` up, `minY = 0`.
 * - Hero Drift Courier matches `FOOTPRINT = { halfW: 0.9954, halfD: 2.142 }` (`w ~ 1.94 m, l ~ 4.26 m`).
 * - High-count street-prop instanced batches (`>16`) use `material.pbr` or `material.metal` with `clearcoat: 0, sheen: 0`.
 * - Glazing uses `material.physical` (`clearcoat: 1, ior: 1.5`) with `castShadow: false`. Zero `three` imports.
 */
import {
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

type GroupNodeBuilder = ReturnType<typeof group>;
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptStreamlinedHullMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import type { PropKey } from "../models";

/** Strips preset `.name` so `scene.toJSON()` never emits duplicate material name warnings. */
export const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/** WebGPU-safe physical glazing material (`castShadow: false` on every glazing node). */
export function courierGlazingMaterial(): AuraMaterialSpec {
  return unnamed(
    material.physical({
      color: "#223447",
      roughness: 0.04,
      opacity: 0.42,
      clearcoat: 1,
      ior: 1.5,
      envMapIntensity: 0.85
    })
  );
}

/** Multi-material physical preset palette for the Hero Drift Courier Kei-Van / Hot-Hatch. */
export function heroCourierMaterials(): readonly AuraMaterialSpec[] {
  return [
    // 0: Signature courier-teal widebody metallic clearcoat (tempered clearcoat roughness & studio env intensity prevents horizon streaks)
    unnamed(material.clearcoatPaint({ color: "#1fb8be", roughness: 0.2, metallic: 0.14, clearcoat: 0.66, clearcoatRoughness: 0.14, envMapIntensity: 0.88 })),
    // 1: Harbor-cream two-tone roof cap, hood stripe & Kammback wing
    unnamed(material.carPaint({ color: "#ede6da", roughness: 0.26, metallic: 0.05, clearcoat: 0.58, clearcoatRoughness: 0.15, envMapIntensity: 0.85 })),
    // 2: Anisotropic brushed alloy roof rack, splitter rods & grille surround
    unnamed(material.brushedMetal({ color: "#cfd9e4", roughness: 0.26, anisotropy: 0.82, envMapIntensity: 1.02 })),
    // 3: Mirror chrome twin JDM exhaust tips & emblem trim
    unnamed(material.chrome({ color: "#eef4fa", roughness: 0.09, envMapIntensity: 1.15 })),
    // 4: Matte aero carbon / vulcanized rubber splitter, diffuser, rear window gasket, overfender trim & mudflaps
    unnamed(material.blackRubber({ color: "#171a20", roughness: 0.88 })),
    // 5: Insulated thermal courier cargo box shell (warm dispatch amber-orange lacquer)
    unnamed(material.lacquer({ color: "#ff9b3d", roughness: 0.26, clearcoat: 0.65, clearcoatRoughness: 0.12, envMapIntensity: 0.9 })),
    // 6: Heavy woven canvas thermal bag gussets & tie-down webbing straps (`clearcoat: 0` organic cloth)
    unnamed(material.fabric({ color: "#22303c", roughness: 0.88, clearcoat: 0, sheen: 0.36 })),
    // 7: Glazed ceramic JDM rear & front license plate blank
    unnamed(material.ceramic({ color: "#f4f6fa", roughness: 0.26 })),
    // 8: Twin projector headlamps (+Z forward)
    unnamed(material.emissive({ color: "#f4f9ff", emissive: "#dcebff", emissiveIntensity: 1.95, practical: true })),
    // 9: Recessed amber fog lamps & corner indicators (+Z forward / -Z rear)
    unnamed(material.emissive({ color: "#ffd06b", emissive: "#ffa726", emissiveIntensity: 1.7, practical: true })),
    // 10: Full-width JDM glowing LED rear tail-light bar (-Z toward chase camera)
    unnamed(material.emissive({ color: "#d9161d", emissive: "#ff1a22", emissiveIntensity: 1.9, practical: true })),
    // 11: Roof dispatch beacon dome (courier teal pulse)
    unnamed(material.emissive({ color: "#5ef4f8", emissive: "#22c3c9", emissiveIntensity: 2.1, practical: true }))
  ];
}

/** Multi-material physical preset palette for each 4-part independent Hero Courier wheel. */
export function heroWheelMaterials(): readonly AuraMaterialSpec[] {
  return [
    // 0: Treaded vulcanized tire rubber
    unnamed(material.blackRubber({ color: "#14171c", roughness: 0.92 })),
    // 1: Deep-dish forged anisotropic alloy rim & 6-spoke star
    unnamed(material.brushedMetal({ color: "#dce4ee", roughness: 0.22, anisotropy: 0.88, envMapIntensity: 1.15 })),
    // 2: Slotted steel brake rotor & courier-teal performance caliper
    unnamed(material.studioMetal({ color: "#6f7a86", roughness: 0.32, metallic: 0.92, envMapIntensity: 0.98 })),
    // 3: Center locknut & chrome courier hubcap medallion
    unnamed(material.chrome({ color: "#22c3c9", roughness: 0.1, envMapIntensity: 1.2 }))
  ];
}

/* ------------------------------------------------------------------ Shared Sculpting Helpers */

/** Merges multiple `RawMesh` buffers into a single `RawMesh` while preserving authored normals. */
export function joinRawMeshes(parts: readonly RawMesh[]): RawMesh {
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

/**
 * Generates a 16-point curved automotive cross-section ring at station `z`
 * with tucked rocker sill (`yBot`), muscular wheel-arch shoulder (`halfW`, `yBelt`), and curved tumblehome greenhouse (`cabinHalfW`, `yTop`).
 */
function vehicleSectionRing(
  z: number,
  halfW: number,
  yBot: number,
  yBelt: number,
  cabinHalfW: number,
  yTop: number
): V3[] {
  const sillW = halfW * 0.85;
  const lowerW = halfW * 0.98;
  const flareW = halfW * 1.035;
  const yLower = yBot + (yBelt - yBot) * 0.24;
  const yFlare = yBot + (yBelt - yBot) * 0.56;
  const yShldr = yBelt + (yTop - yBelt) * 0.2;
  const yMidGlass = yBelt + (yTop - yBelt) * 0.62;
  const midGlassW = cabinHalfW + (halfW * 0.93 - cabinHalfW) * 0.44;
  const crownW = cabinHalfW * 0.52;
  const crownY = yTop + 0.038;
  return [
    [0, yBot, z],
    [sillW, yBot + 0.018, z],
    [lowerW, yLower, z],
    [flareW, yFlare, z],
    [halfW, yBelt, z],
    [halfW * 0.93, yShldr, z],
    [midGlassW, yMidGlass, z],
    [cabinHalfW, yTop, z],
    [crownW, crownY - 0.008, z],
    [0, crownY, z],
    [-crownW, crownY - 0.008, z],
    [-cabinHalfW, yTop, z],
    [-midGlassW, yMidGlass, z],
    [-halfW * 0.93, yShldr, z],
    [-halfW, yBelt, z],
    [-flareW, yFlare, z],
    [-lowerW, yLower, z],
    [-sillW, yBot + 0.018, z]
  ];
}

/**
 * High-density 28-point compound-curved cross-section ring exclusively for the Hero Drift Courier fuselage,
 * giving smooth rocker curvature, rounded shoulder tumblehome, and crowned roof without inflating city fleet tris.
 */
function heroCourierSectionRing(
  z: number,
  halfW: number,
  yBot: number,
  yBelt: number,
  cabinHalfW: number,
  yTop: number
): V3[] {
  const lowerSpan = yBelt - yBot;
  const upperSpan = yTop - yBelt;
  const shldrW = halfW * 0.935;
  const crownY = yTop + 0.038;
  const half: Array<[number, number]> = [
    [halfW * 0.44, yBot + 0.004],
    [halfW * 0.85, yBot + 0.018],
    [halfW * 0.96, yBot + lowerSpan * 0.14],
    [halfW * 1.005, yBot + lowerSpan * 0.32],
    [halfW * 1.036, yBot + lowerSpan * 0.54],
    [halfW * 1.022, yBot + lowerSpan * 0.78],
    [halfW, yBelt],
    [shldrW, yBelt + upperSpan * 0.2],
    [cabinHalfW + (shldrW - cabinHalfW) * 0.68, yBelt + upperSpan * 0.44],
    [cabinHalfW + (shldrW - cabinHalfW) * 0.34, yBelt + upperSpan * 0.72],
    [cabinHalfW + (shldrW - cabinHalfW) * 0.08, yBelt + upperSpan * 0.92],
    [cabinHalfW, yTop],
    [cabinHalfW * 0.64, crownY - 0.01],
    [cabinHalfW * 0.3, crownY - 0.002]
  ];
  // Wait: 1 center bottom + 13 right + 1 center top + 13 left = 28 points!
  const trimmedHalf = half.slice(0, 13);
  const out: V3[] = [[0, yBot, z]];
  for (const [x, y] of trimmedHalf) out.push([x, y, z]);
  out.push([0, crownY, z]);
  for (let i = trimmedHalf.length - 1; i >= 0; i -= 1) {
    const [x, y] = trimmedHalf[i]!;
    out.push([-x, y, z]);
  }
  return out;
}

/**
 * Sculpted smooth-normal widebody overfender flare arch (`loftSectionsMesh` along a 14-station wheel-arch curve
 * with a 6-point rounded lip profile) protruding cleanly from `side * baseHalfW` by `side * flareOut`.
 */
function buildWidebodyFenderFlare(
  side: -1 | 1,
  wheelZ: number,
  baseHalfW: number,
  flareOut: number,
  archRadius: number,
  yCenter: number
): RawMesh {
  const sections: V3[][] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = Math.PI * (0.06 + t * 0.88);
    const cz = wheelZ + Math.cos(ang) * archRadius;
    const cy = yCenter + Math.sin(ang) * archRadius * 0.92;
    const pinch = Math.sin(t * Math.PI);
    const outX = side * (baseHalfW + flareOut * (0.35 + 0.65 * pinch));
    const midX = side * (baseHalfW + flareOut * (0.18 + 0.38 * pinch));
    const inX = side * (baseHalfW - 0.05);
    const lipR = 0.055 + 0.035 * pinch;
    const nY = Math.sin(ang);
    const nZ = Math.cos(ang);
    sections.push([
      [inX, cy - nY * 0.04, cz - nZ * 0.04],
      [outX, cy - nY * 0.018, cz - nZ * 0.018],
      [outX + side * 0.016, cy + nY * (lipR * 0.48), cz + nZ * (lipR * 0.48)],
      [outX + side * 0.01, cy + nY * lipR, cz + nZ * lipR],
      [midX, cy + nY * (lipR + 0.028), cz + nZ * (lipR + 0.028)],
      [inX, cy + nY * (lipR + 0.052), cz + nZ * (lipR + 0.052)]
    ]);
  }
  return loftSectionsMesh(sections, true, false);
}
/* ------------------------------------------------------------------ 1. Hero Drift Courier Kei-Van / Hot-Hatch */

export const HERO_COURIER_WHEEL_RADIUS = 0.34;
export const HERO_COURIER_WHEEL_WIDTH = 0.24;

export const HERO_COURIER_WHEEL_POSES: readonly {
  readonly id: "courier-wheel-fl" | "courier-wheel-fr" | "courier-wheel-rl" | "courier-wheel-rr";
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly side: -1 | 1;
  readonly front: boolean;
}[] = [
  { id: "courier-wheel-fl", ox: -0.86, oy: HERO_COURIER_WHEEL_RADIUS, oz: 1.34, side: -1, front: true },
  { id: "courier-wheel-fr", ox: 0.86, oy: HERO_COURIER_WHEEL_RADIUS, oz: 1.34, side: 1, front: true },
  { id: "courier-wheel-rl", ox: -0.86, oy: HERO_COURIER_WHEEL_RADIUS, oz: -1.32, side: -1, front: false },
  { id: "courier-wheel-rr", ox: 0.86, oy: HERO_COURIER_WHEEL_RADIUS, oz: -1.32, side: 1, front: false }
];

let cachedHeroBodySlots: readonly MultiMatSlot[] | null = null;
let cachedHeroGlazingSpec: AuraCustomGeometrySpec | null = null;
const cachedHeroWheelSlots = new Map<-1 | 1, readonly MultiMatSlot[]>();

/** Builds the 12-slot multi-material opaque sub-assemblies for the Hero Drift Courier. */
export function buildHeroCourierBodySlots(): readonly MultiMatSlot[] {
  if (cachedHeroBodySlots) return cachedHeroBodySlots;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    slots.push({ materialIndex, mesh });
  };

  // Slot 0: Taubin-faired 15-station x 28-pt compound-curved widebody rally/kei fastback coupe fuselage (+Z nose, raked Kammback -Z tail)
  const hullStations: readonly [number, number, number, number, number, number][] = [
    [-2.11, 0.8, 0.26, 0.92, 0.72, 1.01],
    [-1.99, 0.852, 0.238, 0.948, 0.732, 1.29],
    [-1.88, 0.89, 0.22, 0.97, 0.74, 1.55],
    [-1.62, 0.915, 0.202, 0.982, 0.765, 1.575],
    [-1.34, 0.93, 0.19, 0.99, 0.78, 1.59],
    [-0.8, 0.938, 0.184, 0.992, 0.788, 1.598],
    [-0.25, 0.94, 0.18, 0.99, 0.79, 1.6],
    [0.24, 0.936, 0.18, 0.982, 0.782, 1.588],
    [0.68, 0.93, 0.18, 0.97, 0.77, 1.57],
    [1.0, 0.921, 0.185, 0.946, 0.776, 1.31],
    [1.3, 0.91, 0.19, 0.92, 0.78, 1.02],
    [1.6, 0.892, 0.195, 0.885, 0.772, 0.972],
    [1.85, 0.87, 0.2, 0.84, 0.76, 0.92],
    [2.02, 0.825, 0.214, 0.795, 0.715, 0.862],
    [2.13, 0.77, 0.23, 0.74, 0.66, 0.8]
  ];
  push(
    0,
    taubinSmoothMesh(
      loftSectionsMesh(
        hullStations.map(([z, hw, yBot, yBelt, cabW, yTop]) => heroCourierSectionRing(z, hw, yBot, yBelt, cabW, yTop)),
        true,
        false
      ),
      4
    )
  );

  // Sculpted Taubin-faired widebody fender flares over all 4 wheel arches
  for (const side of [-1, 1] as const) {
    push(0, taubinSmoothMesh(buildWidebodyFenderFlare(side, 1.34, 0.86, 0.118, 0.43, 0.36), 4));
    push(0, taubinSmoothMesh(buildWidebodyFenderFlare(side, -1.32, 0.88, 0.122, 0.44, 0.36), 4));
    // Sculpted side rocker skirts & smooth aerodynamic teardrop door mirrors (+Z swept stalks)
    push(4, transformMesh(taubinSmoothMesh(bevelBoxMesh(0.09, 0.1, 1.78, 0.024), 3), { pos: [side * 0.93, 0.19, 0.02] }));
    push(
      2,
      tubeSweepMesh(
        [
          [side * 0.82, 0.98, 0.92, 0.022],
          [side * 0.90, 1.02, 0.90, 0.02],
          [side * 0.96, 1.05, 0.88, 0.018]
        ],
        14
      )
    );
    push(
      0,
      transformMesh(
        sculptStreamlinedHullMesh(0.19, 0.13, 0.1, {
          noseSharpness: 0.56,
          tailTaper: 0.44,
          canopyBulge: 0.2,
          undersideFlat: 0.24,
          stations: 12,
          ringPoints: 20
        }),
        { pos: [side * 0.99, 1.06, 0.86] }
      )
    );
    // Rally mudflaps behind each wheel arch grounding down to y = 0.02
    push(4, transformMesh(bevelBoxMesh(0.22, 0.22, 0.025, 0.005), { pos: [side * 0.85, 0.13, 0.88] }));
    push(4, transformMesh(bevelBoxMesh(0.23, 0.22, 0.025, 0.005), { pos: [side * 0.86, 0.13, -1.78] }));
  }

  // Slot 1: Taubin-faired Harbor-cream two-tone roof cap, hood rally stripe, extractor vents & Kammback wing
  const roofCapSections: V3[][] = [-1.88, -1.5, -1.12, -0.74, -0.36, 0.02, 0.38, 0.74].map((z) => [
    [-0.75, 1.58, z],
    [-0.5, 1.583, z],
    [0, 1.586, z],
    [0.5, 1.583, z],
    [0.75, 1.58, z],
    [0.71, 1.622, z],
    [0.54, 1.648, z],
    [0.28, 1.661, z],
    [0, 1.666, z],
    [-0.28, 1.661, z],
    [-0.54, 1.648, z],
    [-0.71, 1.622, z]
  ]);
  push(1, taubinSmoothMesh(loftSectionsMesh(roofCapSections, true, false), 4));
  push(1, transformMesh(bevelBoxMesh(0.46, 0.025, 0.86, 0.008), { pos: [0, 0.91, 1.56], rot: [0.16, 0, 0] }));
  // Rally hood heat-extractor louver slats
  for (const side of [-1, 1] as const) {
    push(4, transformMesh(bevelBoxMesh(0.2, 0.028, 0.34, 0.006), { pos: [side * 0.42, 0.92, 1.5], rot: [0.16, 0, -side * 0.08] }));
  }
  const wingFoil = bezierCurve2([0, 0], [0.12, 0.05], [0.24, 0.04], [0.32, -0.02], 10);
  const wingRing: V2[] = [
    ...wingFoil,
    [0.3, -0.05],
    [0.14, -0.02],
    [0, -0.03]
  ];
  push(
    1,
    transformMesh(extrudePolygonMesh(wingRing, 1.52, 0.012, false), {
      pos: [0, 1.63, -1.96],
      rot: [0, Math.PI * 0.5, 0]
    })
  );
  for (const side of [-1, 1] as const) {
    push(2, transformMesh(bevelBoxMesh(0.035, 0.14, 0.22, 0.008), { pos: [side * 0.56, 1.56, -1.92] }));
  }

  // Front (+Z) aero splitter, alloy tie-rods, intake grille, projector headlamps, fog lamps & front JDM plate
  const splitterPoly: V2[] = [
    [-0.92, -0.18],
    [0.92, -0.18],
    [0.96, 0.06],
    [0.76, 0.2],
    [-0.76, 0.2],
    [-0.96, 0.06]
  ];
  push(
    4,
    transformMesh(extrudePolygonMesh(splitterPoly, 0.045, 0.01, false), {
      pos: [0, 0.16, 2.02],
      rot: [Math.PI * 0.5, 0, 0]
    })
  );
  push(4, transformMesh(bevelBoxMesh(1.18, 0.24, 0.08, 0.02), { pos: [0, 0.44, 2.07] }));
  push(2, transformMesh(bevelBoxMesh(1.24, 0.045, 0.09, 0.012), { pos: [0, 0.58, 2.08] }));
  push(7, transformMesh(bevelBoxMesh(0.34, 0.16, 0.03, 0.006), { pos: [-0.38, 0.3, 2.12] }));
  for (const side of [-1, 1] as const) {
    // Brushed alloy front splitter support struts
    push(2, tubeSweepMesh([[side * 0.46, 0.18, 2.16, 0.012], [side * 0.44, 0.34, 2.07, 0.012]], 12));
    // Lathed twin projector headlamps (+Z, 28 radial segments)
    push(2, transformMesh(latheMesh([[0, 0], [0.145, 0.01], [0.15, 0.06], [0.12, 0.09], [0, 0.095]], 28), { pos: [side * 0.62, 0.68, 2.03], rot: [Math.PI * 0.5, 0, 0] }));
    push(8, transformMesh(latheMesh([[0, 0], [0.115, 0.02], [0.095, 0.055], [0, 0.065]], 28), { pos: [side * 0.62, 0.68, 2.06], rot: [Math.PI * 0.5, 0, 0] }));
    // Recessed amber fog lamps (+Z lower bumper) & twin rally auxiliary spotlights
    push(4, transformMesh(latheMesh([[0, 0], [0.085, 0.01], [0.085, 0.05], [0, 0.055]], 18), { pos: [side * 0.68, 0.33, 2.06], rot: [Math.PI * 0.5, 0, 0] }));
    push(9, transformMesh(latheMesh([[0, 0], [0.068, 0.015], [0.052, 0.045], [0, 0.05]], 18), { pos: [side * 0.68, 0.33, 2.085], rot: [Math.PI * 0.5, 0, 0] }));
    push(2, transformMesh(latheMesh([[0, 0], [0.095, 0.01], [0.098, 0.075], [0.07, 0.095], [0, 0.1]], 18), { pos: [side * 0.27, 0.58, 2.09], rot: [Math.PI * 0.5, 0, 0] }));
    push(8, transformMesh(latheMesh([[0, 0], [0.078, 0.015], [0.06, 0.04], [0, 0.045]], 18), { pos: [side * 0.27, 0.58, 2.115], rot: [Math.PI * 0.5, 0, 0] }));
  }

  // Rear (-Z, facing chase camera): matte hatch-window bezel, rear wiper, high-mount brake strip, JDM full-width tail-light bar, diffuser fins, twin chrome exhausts & license plate
  push(
    4,
    loftSectionsMesh(
      [
        [[-0.75, 1.04, -2.1], [0.75, 1.04, -2.1], [0.75, 1.07, -2.07], [-0.75, 1.07, -2.07]],
        [[-0.69, 1.51, -1.92], [0.69, 1.51, -1.92], [0.69, 1.54, -1.89], [-0.69, 1.54, -1.89]]
      ],
      true,
      false
    )
  );
  push(10, transformMesh(bevelBoxMesh(0.76, 0.032, 0.04, 0.008), { pos: [0, 1.535, -1.93] }));
  push(4, tubeSweepMesh([[0.04, 1.09, -2.115, 0.014], [-0.42, 1.29, -2.035, 0.01]], 10));
  push(4, transformMesh(bevelBoxMesh(1.66, 0.18, 0.07, 0.018), { pos: [0, 0.94, -2.12] }));
  push(10, transformMesh(bevelBoxMesh(1.58, 0.105, 0.065, 0.015), { pos: [0, 0.95, -2.145] }));
  for (const side of [-1, 1] as const) {
    push(9, transformMesh(bevelBoxMesh(0.22, 0.055, 0.068, 0.01), { pos: [side * 0.66, 0.87, -2.14] }));
  }
  // Sculpted rear bumper & 5-strake aero diffuser
  push(4, transformMesh(taubinSmoothMesh(bevelBoxMesh(1.72, 0.22, 0.14, 0.032), 3), { pos: [0, 0.28, -2.08] }));
  for (const fx of [-0.52, -0.26, 0, 0.26, 0.52]) {
    push(4, transformMesh(bevelBoxMesh(0.03, 0.16, 0.22, 0.006), { pos: [fx, 0.22, -2.09] }));
  }
  // Twin angled mirror-chrome JDM exhaust tips (-Z right/left, 28 radial segments)
  for (const ex of [0.46, 0.63]) {
    push(
      3,
      transformMesh(
        latheMesh([[0.038, 0], [0.062, 0.02], [0.064, 0.22], [0.056, 0.24], [0.042, 0.22], [0, 0.04]], 28),
        { pos: [ex, 0.22, -2.02], rot: [-Math.PI * 0.5 + 0.08, 0.08, 0] }
      )
    );
  }
  // Rear JDM license plate & brushed alloy plate lamp hood (-Z center)
  push(4, transformMesh(bevelBoxMesh(0.44, 0.24, 0.04, 0.008), { pos: [0, 0.62, -2.11] }));
  push(7, transformMesh(bevelBoxMesh(0.36, 0.18, 0.03, 0.006), { pos: [0, 0.61, -2.13] }));
  push(2, transformMesh(bevelBoxMesh(0.28, 0.035, 0.05, 0.008), { pos: [0, 0.72, -2.13] }));

  // Roof tubular alloy cargo rack + strapped insulated courier thermal box + dispatch beacon
  const rackLoop = catmullRomSpline3(
    [
      [-0.64, 1.71, -1.52],
      [0.64, 1.71, -1.52],
      [0.64, 1.71, 0.42],
      [-0.64, 1.71, 0.42]
    ],
    6,
    true
  );
  const rackSpine: V4[] = [...rackLoop, rackLoop[0]!].map(([x, y, z]) => [x, y, z, 0.022]);
  push(2, tubeSweepMesh(rackSpine, 14));
  for (const rz of [-1.36, -0.92, -0.48, -0.04, 0.28]) {
    push(2, tubeSweepMesh([[-0.63, 1.69, rz, 0.016], [0.63, 1.69, rz, 0.016]], 12));
  }
  for (const side of [-1, 1] as const) {
    for (const fz of [-1.34, -0.48, 0.26]) {
      push(4, transformMesh(bevelBoxMesh(0.05, 0.09, 0.08, 0.01), { pos: [side * 0.62, 1.65, fz] }));
    }
  }
  // Smooth Taubin-faired insulated courier thermal trunk + strapped express parcel canister on roof cargo rack
  push(5, transformMesh(taubinSmoothMesh(bevelBoxMesh(0.74, 0.42, 0.96, 0.065), 3), { pos: [-0.08, 1.905, -0.72] }));
  push(1, transformMesh(taubinSmoothMesh(bevelBoxMesh(0.78, 0.09, 1.0, 0.032), 3), { pos: [-0.08, 2.135, -0.72] }));
  push(0, transformMesh(bevelBoxMesh(0.76, 0.1, 0.98, 0.02), { pos: [-0.08, 1.925, -0.72] }));
  // Cylindrical express blueprint/courier tube strapped along right rack rail
  push(
    5,
    transformMesh(latheMesh([[0, 0], [0.11, 0.01], [0.115, 0.88], [0.11, 0.9], [0, 0.91]], 28), {
      pos: [0.44, 1.81, -1.18],
      rot: [Math.PI * 0.5, 0, 0]
    })
  );
  for (const sz of [-1.0, -0.44]) {
    push(6, transformMesh(bevelBoxMesh(0.8, 0.49, 0.065, 0.012), { pos: [-0.08, 1.935, sz] }));
    push(6, transformMesh(latheMesh([[0.112, 0], [0.122, 0.01], [0.122, 0.05], [0.112, 0.06]], 24), { pos: [0.44, 1.81, sz - 0.03], rot: [Math.PI * 0.5, 0, 0] }));
    for (const side of [-1, 1] as const) {
      push(2, transformMesh(bevelBoxMesh(0.035, 0.07, 0.08, 0.008), { pos: [side * 0.48, 1.81, sz] }));
    }
  }
  // Front-of-rack glowing courier dispatch beacon dome anchored flush into the roof cap & rack crossbar
  push(4, transformMesh(latheMesh([[0, 0], [0.135, 0], [0.13, 0.065], [0.115, 0.09], [0, 0.095]], 28), { pos: [0, 1.635, 0.26] }));
  push(11, transformMesh(latheMesh([[0, 0], [0.105, 0.01], [0.102, 0.065], [0.092, 0.115], [0.052, 0.15], [0, 0.16]], 28), { pos: [0, 1.715, 0.26] }));

  cachedHeroBodySlots = slots;
  return slots;
}

/** Builds smooth compound-curved wraparound tinted windshield (+Z), side windows (+/-X), and rear hatch window (-Z). */
export function buildHeroCourierGlazingSpec(): AuraCustomGeometrySpec {
  if (cachedHeroGlazingSpec) return cachedHeroGlazingSpec;
  const parts: RawMesh[] = [];
  const curvedGlassSection = (halfW: number, yBase: number, zBase: number, thickY: number, thickZ: number, bowZ: number, crownY: number): V3[] => {
    const cols = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
    const outer: V3[] = [];
    const inner: V3[] = [];
    for (const u of cols) {
      const arch = 1 - u * u;
      const x = u * halfW;
      const y = yBase + crownY * arch;
      const z = zBase + bowZ * arch;
      outer.push([x, y, z]);
      inner.push([x, y + thickY, z + thickZ]);
    }
    return [...outer, ...inner.reverse()];
  };
  // Raked wraparound front windshield (+Z, multi-station curved arch)
  parts.push(
    loftSectionsMesh(
      [
        curvedGlassSection(0.75, 0.98, 1.24, 0.035, -0.028, 0.055, 0.018),
        curvedGlassSection(0.715, 1.265, 0.965, 0.032, -0.028, 0.048, 0.022),
        curvedGlassSection(0.68, 1.54, 0.68, 0.03, -0.028, 0.038, 0.02)
      ],
      true,
      false
    )
  );
  // Tilted rear Kammback hatch window (-Z, seated cleanly proud of the raked hatch bezel)
  parts.push(
    loftSectionsMesh(
      [
        curvedGlassSection(0.66, 1.49, -1.94, 0.028, 0.025, -0.024, 0.016),
        curvedGlassSection(0.692, 1.28, -2.032, 0.028, 0.025, -0.026, 0.016),
        curvedGlassSection(0.72, 1.07, -2.12, 0.028, 0.025, -0.022, 0.012)
      ],
      true,
      false
    )
  );
  // Front cab & rear courier quarter side windows (+/-X, Taubin-faired tumblehome panels)
  for (const side of [-1, 1] as const) {
    parts.push(transformMesh(taubinSmoothMesh(bevelBoxMesh(0.03, 0.46, 0.96, 0.008), 3), { pos: [side * 0.82, 1.28, 0.22], rot: [0, 0, -side * 0.16] }));
    parts.push(transformMesh(taubinSmoothMesh(bevelBoxMesh(0.03, 0.44, 1.18, 0.008), 3), { pos: [side * 0.83, 1.29, -1.06], rot: [0, 0, -side * 0.15] }));
  }
  cachedHeroGlazingSpec = mergeRawMeshes(parts);
  return cachedHeroGlazingSpec;
}

export function withGroupRotationOrder(base: GroupNodeBuilder, rotationOrder: "YXZ" | "ZYX"): GroupNodeBuilder {
  const Ctor = base.constructor as new (
    node: ReturnType<GroupNodeBuilder["toJSON"]> & { readonly rotationOrder?: "YXZ" | "ZYX" }
  ) => GroupNodeBuilder;
  return new Ctor({ ...base.toJSON(), rotationOrder });
}

/** Assembles the complete Hero Drift Courier node (`car-rig`) with `castShadow: false` physical glazing and explicit Euler rotation order (`"YXZ"` shift / `"ZYX"` default). */
export function buildHeroCourierRigNode(
  id: string,
  castShadow: boolean,
  bodyOrder: "YXZ" | "ZYX" = "ZYX"
): GroupNodeBuilder {
  const opaqueBody = assembleMultiMaterialNode(
    `${id}-body`,
    buildHeroCourierBodySlots(),
    heroCourierMaterials(),
    { castShadow, receiveShadow: true }
  );
  const glazing = geometry.custom(buildHeroCourierGlazingSpec(), {
    name: `${id}-glazing`,
    material: courierGlazingMaterial(),
    castShadow: false,
    receiveShadow: false
  });
  const base = group(id, [opaqueBody, glazing]);
  const ordered = withGroupRotationOrder(base, bodyOrder);
  return ordered.runtime({ id });
}

/** Builds a high-density 28-radial-segment 4-part wheel (`tire`, `deep-dish rim`, `rotor + caliper`, `hubcap`) centered on local `X` axle. */
export function buildHeroCourierWheelSlots(side: -1 | 1): readonly MultiMatSlot[] {
  const hit = cachedHeroWheelSlots.get(side);
  if (hit) return hit;
  const r = HERO_COURIER_WHEEL_RADIUS;
  const hw = HERO_COURIER_WHEEL_WIDTH * 0.5;
  const rimR = r * 0.65;
  const segs = 28;
  const rotToAxleX: V3 = [0, 0, -Math.PI * 0.5];

  // 0: Smooth-crowned 32-segment radial tire carcass
  const tireProfile: V2[] = [
    [rimR, -hw * 0.82],
    [r * 0.82, -hw * 0.98],
    [r * 0.94, -hw * 0.94],
    [r * 0.99, -hw * 0.72],
    [r, -hw * 0.36],
    [r, hw * 0.36],
    [r * 0.99, hw * 0.72],
    [r * 0.94, hw * 0.94],
    [r * 0.82, hw * 0.98],
    [rimR, hw * 0.82],
    [rimR * 0.97, 0]
  ];
  const tireMesh = transformMesh(latheMesh(tireProfile, segs, false), { rot: rotToAxleX });

  // 1: Deep-dish 32-segment forged alloy barrel + 6 sculpted smooth-tubular spokes
  const rimProfile: V2[] = [
    [0.01, -hw * 0.24],
    [r * 0.2, -hw * 0.2],
    [rimR * 0.94, -hw * 0.84],
    [rimR * 1.01, -hw * 0.86],
    [rimR * 1.01, hw * 0.86],
    [rimR * 0.94, hw * 0.84],
    [r * 0.22, hw * 0.34],
    [0.01, hw * 0.36]
  ];
  const rimParts: RawMesh[] = [transformMesh(latheMesh(rimProfile, segs, false), { rot: rotToAxleX })];
  for (let s = 0; s < 6; s += 1) {
    const a = (s / 6) * Math.PI * 2;
    const cy = Math.cos(a);
    const cz = Math.sin(a);
    rimParts.push(
      tubeSweepMesh(
        [
          [side * hw * 0.3, cy * r * 0.16, cz * r * 0.16, r * 0.072],
          [side * hw * 0.56, cy * rimR * 0.56, cz * rimR * 0.56, r * 0.056],
          [side * hw * 0.76, cy * rimR * 0.93, cz * rimR * 0.93, r * 0.046]
        ],
        8,
        true
      )
    );
  }

  // 2: 32-segment slotted steel brake rotor + courier brake caliper
  const rotorMesh = joinRawMeshes([
    transformMesh(
      latheMesh(
        [
          [r * 0.16, -hw * 0.16],
          [r * 0.48, -hw * 0.16],
          [r * 0.48, -hw * 0.04],
          [r * 0.16, -hw * 0.04]
        ],
        segs,
        false
      ),
      { rot: rotToAxleX }
    ),
    transformMesh(taubinSmoothMesh(bevelBoxMesh(hw * 0.42, r * 0.32, r * 0.2, r * 0.032), 3), {
      pos: [-side * hw * 0.06, r * 0.22, r * 0.3]
    })
  ]);

  // 3: 28-segment center locknut & chrome courier hubcap medallion
  const hubcapMesh = transformMesh(
    latheMesh([[0, 0], [0.068, 0.005], [0.064, 0.018], [0.054, 0.031], [0.026, 0.043], [0, 0.046]], 28),
    {
      pos: [side * (HERO_COURIER_WHEEL_WIDTH * 0.46), 0, 0],
      rot: [0, 0, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5]
    }
  );

  const slots: readonly MultiMatSlot[] = [
    { materialIndex: 0, mesh: tireMesh },
    { materialIndex: 1, mesh: joinRawMeshes(rimParts) },
    { materialIndex: 2, mesh: rotorMesh },
    { materialIndex: 3, mesh: hubcapMesh }
  ];
  cachedHeroWheelSlots.set(side, slots);
  return slots;
}

export function buildHeroCourierWheelNode(
  id: string,
  side: -1 | 1,
  castShadow: boolean
): GroupNodeBuilder {
  const wheelSpec = memoizeGeometry(`drift:hero-wheel:${side}`, () =>
    buildGroupedGeometrySpec(buildHeroCourierWheelSlots(side))
  );
  const base = geometry.multiMaterial(wheelSpec, heroWheelMaterials(), {
    name: id,
    position: [0, -60, 0],
    castShadow,
    receiveShadow: true
  });
  return withGroupRotationOrder(base, "YXZ").runtime({ id });
}
/* ------------------------------------------------------------------ 2. Procedural 7-Class Harbor Traffic Fleet */

export type TrafficFleetKind = "sedan" | "hatch" | "van" | "truck" | "taxi" | "bus" | "cruiser";

export const TRAFFIC_FLEET_KINDS: readonly TrafficFleetKind[] = [
  "sedan",
  "hatch",
  "van",
  "truck",
  "taxi",
  "bus",
  "cruiser"
];

export interface ProceduralTrafficGroup {
  readonly id: string;
  readonly kind: TrafficFleetKind;
  readonly layerIds: readonly string[];
  readonly cars: readonly number[];
  readonly scale: number;
}

export interface TrafficClassSpecs {
  readonly body: AuraCustomGeometrySpec;
  readonly glass: AuraCustomGeometrySpec;
  readonly rubber: AuraCustomGeometrySpec;
  readonly trim: AuraCustomGeometrySpec;
  readonly headGlow: AuraCustomGeometrySpec;
  readonly tailGlow: AuraCustomGeometrySpec;
}

const TRAFFIC_CLASS_PALETTES: Record<TrafficFleetKind, readonly string[]> = {
  sedan: ["#d9765f", "#5e97b8", "#efe3cf", "#4f5b6b", "#9fd8c4", "#c95b48"],
  hatch: ["#8fd4be", "#f2a668", "#f3d579", "#78b3d6", "#e57a64", "#ebe2d0"],
  van: ["#f2eadc", "#e08b67", "#8ec4b4", "#e4b968", "#cad6de"],
  truck: ["#f4ede0", "#76a8c4", "#e2956b", "#95c4b0"],
  taxi: ["#f2b632", "#eab028", "#f5c242"],
  bus: ["#e8dcc6", "#95c8ba", "#d98468", "#88b4d0"],
  cruiser: ["#f2f4f7", "#e8eef5"]
};

const cachedTrafficSpecs = new Map<TrafficFleetKind, TrafficClassSpecs>();

function buildFleetWheelSet(
  halfW: number,
  wheelR: number,
  zRear: number,
  zFront: number
): { readonly tires: RawMesh; readonly alloys: RawMesh } {
  const wheelSlots = wheelAssemblySlots({
    radius: wheelR,
    width: 0.22,
    spokeCount: 5,
    tireMat: 0,
    rimMat: 1,
    rotorMat: 2
  });
  const tireUnit = joinRawMeshes(wheelSlots.filter((s) => s.materialIndex === 0).map((s) => s.mesh));
  const alloyUnit = joinRawMeshes(wheelSlots.filter((s) => s.materialIndex !== 0).map((s) => s.mesh));
  const tires: RawMesh[] = [];
  const alloys: RawMesh[] = [];
  for (const wz of [zRear, zFront]) {
    for (const side of [-1, 1] as const) {
      const pose = { pos: [side * (halfW - 0.1), wheelR, wz] as V3 };
      tires.push(transformMesh(tireUnit, pose));
      alloys.push(transformMesh(alloyUnit, pose));
    }
  }
  return { tires: joinRawMeshes(tires), alloys: joinRawMeshes(alloys) };
}

/** Lofted trapezoidal greenhouse glazing shell matching raked windshield, crown, and rear backlight (zero overhanging box corners). */
function buildSculptedGreenhouseGlass(
  zRearBase: number,
  zRearTop: number,
  zFrontTop: number,
  zFrontBase: number,
  wBase: number,
  wTop: number,
  yBase: number,
  yTop: number
): RawMesh {
  const ring = (z: number, hw: number, yb: number, yt: number): V3[] => [
    [0, yb, z],
    [hw, yb, z],
    [hw * 0.96, (yb + yt) * 0.5, z],
    [hw * 0.88, yt, z],
    [0, yt + 0.018, z],
    [-hw * 0.88, yt, z],
    [-hw * 0.96, (yb + yt) * 0.5, z],
    [-hw, yb, z]
  ];
  return loftSectionsMesh(
    [
      ring(zRearBase, wBase * 0.94, yBase, yBase + 0.05),
      ring(zRearTop, wTop, yBase + 0.02, yTop),
      ring(zFrontTop, wTop, yBase + 0.02, yTop),
      ring(zFrontBase, wBase * 0.96, yBase, yBase + 0.05)
    ],
    true,
    false
  );
}

/** Builds smooth-normal coachwork, dark cabin glass, rubber tires/valances, alloy rims/grille, and lamp specs for a harbor fleet class. */
export function buildTrafficClassSpecs(kind: TrafficFleetKind): TrafficClassSpecs {
  const cached = cachedTrafficSpecs.get(kind);
  if (cached) return cached;

  const bodyParts: RawMesh[] = [];
  const glassParts: RawMesh[] = [];
  const rubberParts: RawMesh[] = [];
  const trimParts: RawMesh[] = [];
  const headParts: RawMesh[] = [];
  const tailParts: RawMesh[] = [];

  const cfg: {
    readonly w: number;
    readonly l: number;
    readonly wheelR: number;
    readonly zRearAxle: number;
    readonly zFrontAxle: number;
    readonly stations: readonly [number, number, number, number, number, number][];
    readonly glass: readonly [number, number, number, number, number, number, number, number];
  } = (() => {
    switch (kind) {
      case "sedan":
        return {
          w: 1.88, l: 4.5, wheelR: 0.34, zRearAxle: -1.38, zFrontAxle: 1.4,
          stations: [
            [-2.24, 0.8, 0.26, 0.88, 0.72, 0.94],
            [-1.72, 0.9, 0.21, 0.92, 0.78, 0.98],
            [-1.18, 0.92, 0.19, 0.94, 0.75, 1.46],
            [0.38, 0.92, 0.19, 0.93, 0.74, 1.46],
            [1.06, 0.9, 0.19, 0.88, 0.76, 0.95],
            [1.88, 0.86, 0.21, 0.8, 0.72, 0.86],
            [2.24, 0.76, 0.24, 0.72, 0.64, 0.76]
          ],
          glass: [-1.52, -1.14, 0.36, 1.0, 0.8, 0.74, 0.95, 1.42]
        };
      case "hatch":
        return {
          w: 1.8, l: 3.86, wheelR: 0.33, zRearAxle: -1.2, zFrontAxle: 1.22,
          stations: [
            [-1.92, 0.78, 0.24, 0.92, 0.68, 1.4],
            [-1.56, 0.88, 0.19, 0.95, 0.73, 1.48],
            [0.44, 0.89, 0.19, 0.94, 0.72, 1.47],
            [1.08, 0.87, 0.19, 0.88, 0.73, 0.94],
            [1.92, 0.75, 0.23, 0.74, 0.64, 0.78]
          ],
          glass: [-1.84, -1.52, 0.42, 1.02, 0.78, 0.72, 0.95, 1.43]
        };
      case "van":
        return {
          w: 1.98, l: 4.86, wheelR: 0.36, zRearAxle: -1.5, zFrontAxle: 1.52,
          stations: [
            [-2.42, 0.92, 0.26, 1.12, 0.88, 2.02],
            [-2.15, 0.97, 0.22, 1.14, 0.91, 2.08],
            [1.16, 0.97, 0.22, 1.12, 0.9, 2.06],
            [1.82, 0.94, 0.22, 1.0, 0.82, 1.18],
            [2.42, 0.84, 0.26, 0.84, 0.74, 0.94]
          ],
          glass: [0.18, 0.28, 1.14, 1.76, 0.9, 0.86, 1.14, 1.98]
        };
      case "truck":
        return {
          w: 2.12, l: 5.6, wheelR: 0.4, zRearAxle: -1.68, zFrontAxle: 1.84,
          stations: [
            [0.62, 0.98, 0.28, 1.12, 0.9, 2.08],
            [1.56, 0.98, 0.26, 1.1, 0.88, 2.06],
            [2.16, 0.94, 0.26, 1.02, 0.84, 1.24],
            [2.76, 0.86, 0.28, 0.88, 0.76, 0.98]
          ],
          glass: [0.72, 0.82, 1.54, 2.12, 0.92, 0.88, 1.16, 1.98]
        };
      case "taxi":
        return {
          w: 1.88, l: 4.5, wheelR: 0.34, zRearAxle: -1.38, zFrontAxle: 1.4,
          stations: [
            [-2.24, 0.81, 0.26, 0.9, 0.73, 0.96],
            [-1.7, 0.91, 0.21, 0.94, 0.78, 1.0],
            [-1.16, 0.93, 0.19, 0.95, 0.76, 1.48],
            [0.4, 0.93, 0.19, 0.94, 0.75, 1.48],
            [1.08, 0.9, 0.19, 0.88, 0.76, 0.96],
            [2.24, 0.77, 0.24, 0.73, 0.65, 0.78]
          ],
          glass: [-1.5, -1.12, 0.38, 1.02, 0.81, 0.75, 0.96, 1.44]
        };
      case "bus":
        return {
          w: 2.18, l: 5.56, wheelR: 0.4, zRearAxle: -1.72, zFrontAxle: 1.76,
          stations: [
            [-2.76, 1.02, 0.28, 1.28, 0.99, 2.48],
            [-2.42, 1.08, 0.26, 1.3, 1.03, 2.56],
            [2.28, 1.08, 0.26, 1.28, 1.02, 2.55],
            [2.76, 0.98, 0.28, 1.16, 0.94, 2.36]
          ],
          glass: [-2.58, -2.38, 2.26, 2.68, 1.04, 1.01, 1.24, 2.28]
        };
      case "cruiser":
        return {
          w: 1.92, l: 4.6, wheelR: 0.35, zRearAxle: -1.42, zFrontAxle: 1.44,
          stations: [
            [-2.28, 0.83, 0.26, 0.91, 0.75, 0.97],
            [-1.72, 0.93, 0.21, 0.95, 0.8, 1.01],
            [-1.16, 0.95, 0.2, 0.96, 0.77, 1.48],
            [0.42, 0.95, 0.2, 0.95, 0.76, 1.48],
            [1.14, 0.92, 0.2, 0.9, 0.78, 0.97],
            [2.28, 0.79, 0.24, 0.76, 0.68, 0.8]
          ],
          glass: [-1.52, -1.12, 0.4, 1.08, 0.82, 0.76, 0.97, 1.44]
        };
    }
  })();

  const hw = cfg.w * 0.5;
  const hl = cfg.l * 0.5;

  // Smooth-subdivided lofted vehicle body shell + widebody wheel-arch fender flares
  bodyParts.push(
    bakeMeshCavityAO(
      subdivideSmoothMesh(
        loftSectionsMesh(
          cfg.stations.map(([z, shw, yb, yBelt, cabW, yTop]) => vehicleSectionRing(z, shw, yb, yBelt, cabW, yTop)),
          true,
          false
        ),
        1,
        0.4
      ),
      0.12
    )
  );
  for (const side of [-1, 1] as const) {
    bodyParts.push(buildWidebodyFenderFlare(side, cfg.zFrontAxle, hw - 0.06, 0.075, cfg.wheelR + 0.08, cfg.wheelR + 0.02));
    if (kind !== "truck") {
      bodyParts.push(buildWidebodyFenderFlare(side, cfg.zRearAxle, hw - 0.06, 0.08, cfg.wheelR + 0.08, cfg.wheelR + 0.02));
    }
  }

  // Sculpted lofted dark-tinted cabin greenhouse glazing
  const [gz0, gz1, gz2, gz3, gwBase, gwTop, gyBase, gyTop] = cfg.glass;
  glassParts.push(buildSculptedGreenhouseGlass(gz0, gz1, gz2, gz3, gwBase, gwTop, gyBase, gyTop));

  // Class-specific sculpted details
  if (kind === "sedan") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.42, 0.055, 0.14, 0.015), { pos: [0, 0.97, -2.14] }));
  } else if (kind === "hatch") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.34, 0.055, 0.22, 0.015), { pos: [0, 1.44, -1.84] }));
  } else if (kind === "van") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.14, 0.16, 0.92, 0.04), { pos: [0, 2.15, 0.44] }));
    rubberParts.push(transformMesh(bevelBoxMesh(0.045, 1.44, 0.04, 0.008), { pos: [0, 1.22, -hl - 0.005] }));
    glassParts.push(transformMesh(bevelBoxMesh(1.42, 0.48, 0.035, 0.008), { pos: [0, 1.54, -2.41], rot: [-0.08, 0, 0] }));
  } else if (kind === "truck") {
    // Sculpted harbor freight cargo box + smooth aerodynamic cab-over wind fairing + rub-rails + rear shutter + side underride guards
    rubberParts.push(transformMesh(bevelBoxMesh(1.74, 0.24, 3.6, 0.03), { pos: [0, 0.44, -1.0] }));
    bodyParts.push(transformMesh(subdivideSmoothMesh(bevelBoxMesh(2.08, 1.98, 3.34, 0.075), 1, 0.32), { pos: [0, 1.52, -1.12] }));
    bodyParts.push(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            [[-0.92, 2.06, 0.56], [0.92, 2.06, 0.56], [0.88, 2.48, 0.56], [-0.88, 2.48, 0.56]],
            [[-0.86, 2.06, 1.06], [0.86, 2.06, 1.06], [0.8, 2.34, 1.06], [-0.8, 2.34, 1.06]],
            [[-0.78, 2.05, 1.5], [0.78, 2.05, 1.5], [0.74, 2.1, 1.5], [-0.74, 2.1, 1.5]]
          ],
          true,
          false
        ),
        1,
        0.38
      )
    );
    // Brushed aluminum cargo rub-rails & rear roll-up shutter frame
    for (const side of [-1, 1] as const) {
      for (const ry of [0.86, 1.52, 2.18]) {
        trimParts.push(transformMesh(bevelBoxMesh(0.035, 0.07, 3.24, 0.008), { pos: [side * 1.045, ry, -1.12] }));
      }
      // Tubular lateral underride safety rail & rear wheel fender arch
      trimParts.push(tubeSweepMesh([[side * 0.96, 0.42, -0.42, 0.026], [side * 0.96, 0.42, 0.42, 0.026]], 6));
      rubberParts.push(buildWidebodyFenderFlare(side, cfg.zRearAxle, hw - 0.08, 0.085, cfg.wheelR + 0.08, cfg.wheelR + 0.02));
    }
    trimParts.push(transformMesh(bevelBoxMesh(1.76, 1.68, 0.045, 0.012), { pos: [0, 1.5, -2.77] }));
    rubberParts.push(transformMesh(bevelBoxMesh(1.96, 0.22, 0.16, 0.025), { pos: [0, 0.36, -2.76] }));
  } else if (kind === "taxi") {
    rubberParts.push(transformMesh(bevelBoxMesh(cfg.w + 0.025, 0.075, 2.46, 0.01), { pos: [0, 0.78, -0.15] }));
    trimParts.push(transformMesh(bevelBoxMesh(0.64, 0.055, 0.28, 0.012), { pos: [0, 1.49, -0.12] }));
    headParts.push(transformMesh(bevelBoxMesh(0.52, 0.15, 0.2, 0.025), { pos: [0, 1.58, -0.12] }));
  } else if (kind === "bus") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.36, 0.18, 1.24, 0.05), { pos: [0, 2.64, -0.68] }));
    bodyParts.push(transformMesh(bevelBoxMesh(1.24, 0.16, 0.96, 0.04), { pos: [0, 2.63, 1.02] }));
    headParts.push(transformMesh(bevelBoxMesh(1.42, 0.2, 0.05, 0.01), { pos: [0, 2.38, hl - 0.02] }));
    for (const side of [-1, 1] as const) {
      for (const pz of [-1.45, -0.35, 0.75, 1.85]) {
        bodyParts.push(transformMesh(bevelBoxMesh(0.05, 1.06, 0.1, 0.012), { pos: [side * 1.04, 1.76, pz] }));
      }
    }
  } else if (kind === "cruiser") {
    rubberParts.push(transformMesh(bevelBoxMesh(cfg.w + 0.025, 0.54, 1.52, 0.015), { pos: [0, 0.64, -0.16] }));
    trimParts.push(tubeSweepMesh([[-0.44, 0.26, hl + 0.05, 0.028], [-0.44, 0.68, hl + 0.04, 0.028], [0.44, 0.68, hl + 0.04, 0.028], [0.44, 0.26, hl + 0.05, 0.028]], 6));
    trimParts.push(transformMesh(bevelBoxMesh(1.16, 0.05, 0.22, 0.01), { pos: [0, 1.49, -0.18] }));
    headParts.push(transformMesh(bevelBoxMesh(0.48, 0.11, 0.18, 0.02), { pos: [-0.28, 1.56, -0.18] }));
    tailParts.push(transformMesh(bevelBoxMesh(0.48, 0.11, 0.18, 0.02), { pos: [0.28, 1.56, -0.18] }));
  }

  // Sculpted 4-wheel assemblies: separate vulcanized rubber tires & forged 5-spoke alloy rims
  const wheels = buildFleetWheelSet(hw, cfg.wheelR, cfg.zRearAxle, cfg.zFrontAxle);
  rubberParts.push(wheels.tires);
  trimParts.push(wheels.alloys);

  // Front aero splitter, slatted metallic radiator grille,rear valance & twin chrome exhausts
  rubberParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.88, 0.15, 0.14, 0.022), { pos: [0, 0.26, hl - 0.04] }));
  if (kind !== "truck") {
    rubberParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.88, 0.16, 0.14, 0.022), { pos: [0, 0.28, -hl + 0.04] }));
  }
  rubberParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.52, 0.2, 0.06, 0.012), { pos: [0, 0.49, hl - 0.02] }));
  for (const gy of [0.44, 0.5, 0.56]) {
    trimParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.5, 0.024, 0.07, 0.006), { pos: [0, gy, hl - 0.01] }));
  }
  trimParts.push(
    transformMesh(
      latheMesh([[0.032, 0], [0.052, 0.02], [0.054, 0.18], [0.044, 0.2], [0, 0.04]], 12),
      { pos: [hw * 0.52, 0.22, -hl + 0.08], rot: [-Math.PI * 0.5 + 0.06, 0, 0] }
    )
  );

  // Lathed projector headlamps (+Z), sculpted stalk side mirrors, and crimson LED tail-lamps (-Z)
  const mirrorZ = kind === "truck" ? 1.98 : kind === "bus" ? 2.46 : cfg.glass[3] - 0.22;
  const mirrorY = gyBase + 0.08;
  for (const side of [-1, 1] as const) {
    trimParts.push(
      tubeSweepMesh(
        [
          [side * (hw - 0.1), mirrorY - 0.02, mirrorZ, 0.018],
          [side * (hw + 0.05), mirrorY + 0.04, mirrorZ - 0.03, 0.015]
        ],
        5
      )
    );
    trimParts.push(transformMesh(icosphereFacetMesh(0.068, 1, 0, 3), { pos: [side * (hw + 0.07), mirrorY + 0.05, mirrorZ - 0.04], scale: [0.9, 0.68, 1.25] }));
    trimParts.push(
      transformMesh(latheMesh([[0, 0], [0.125, 0.01], [0.13, 0.055], [0.1, 0.08], [0, 0.085]], 12), {
        pos: [side * hw * 0.62, 0.54, hl - 0.05],
        rot: [Math.PI * 0.5, 0, 0]
      })
    );
    headParts.push(
      transformMesh(latheMesh([[0, 0], [0.098, 0.015], [0.082, 0.05], [0, 0.058]], 12), {
        pos: [side * hw * 0.62, 0.54, hl - 0.02],
        rot: [Math.PI * 0.5, 0, 0]
      })
    );
    rubberParts.push(transformMesh(bevelBoxMesh(0.34, 0.15, 0.06, 0.015), { pos: [side * hw * 0.64, 0.62, -hl + 0.02] }));
    tailParts.push(transformMesh(bevelBoxMesh(0.3, 0.11, 0.055, 0.012), { pos: [side * hw * 0.64, 0.62, -hl] }));
  }

  const built: TrafficClassSpecs = {
    body: mergeRawMeshes(bodyParts),
    glass: mergeRawMeshes(glassParts),
    rubber: mergeRawMeshes(rubberParts),
    trim: mergeRawMeshes(trimParts),
    headGlow: mergeRawMeshes(headParts),
    tailGlow: mergeRawMeshes(tailParts)
  };
  cachedTrafficSpecs.set(kind, built);
  return built;
}

/** Shared physical material palette for the 6-layer harbor traffic fleet (`body`, `glass`, `rubber`, `trim`, `head`, `tail`). */
export function trafficFleetMaterials(): {
  readonly body: AuraMaterialSpec;
  readonly glass: AuraMaterialSpec;
  readonly rubber: AuraMaterialSpec;
  readonly trim: AuraMaterialSpec;
  readonly head: AuraMaterialSpec;
  readonly tail: AuraMaterialSpec;
} {
  return {
    body: unnamed(material.carPaint({ color: "#ffffff", roughness: 0.2, metallic: 0.16, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 1.42 })),
    glass: unnamed(material.physical({ color: "#162432", roughness: 0.04, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.55 })),
    rubber: unnamed(material.blackRubber({ color: "#15181e", roughness: 0.9 })),
    trim: unnamed(material.metal({ color: "#cfd8e4", roughness: 0.26, metallic: 0.86, envMapIntensity: 1.45 })),
    head: unnamed(material.emissive({ color: "#fff4d4", emissive: "#ffe29e", emissiveIntensity: 1.95, practical: true })),
    tail: unnamed(material.emissive({ color: "#ff2d22", emissive: "#ff1c12", emissiveIntensity: 2.1, practical: true }))
  };
}

/** Instantiates all 84 city traffic vehicles across 7 multi-material harbor fleet classes. */
export function buildProceduralTrafficFleet(
  traffic: readonly { readonly x: number; readonly z: number; readonly yaw: number }[],
  shift: boolean
): {
  readonly nodes: AuraNodeBuilder<AuraPrimitiveNode>[];
  readonly groups: ProceduralTrafficGroup[];
} {
  const nodes: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
  const groups: ProceduralTrafficGroup[] = [];
  const mats = trafficFleetMaterials();

  for (const kind of TRAFFIC_FLEET_KINDS) {
    const cars = traffic
      .map((_, idx) => idx)
      .filter((idx) => TRAFFIC_FLEET_KINDS[idx % TRAFFIC_FLEET_KINDS.length] === kind);
    if (cars.length === 0) continue;

    const specs = buildTrafficClassSpecs(kind);
    const palette = TRAFFIC_CLASS_PALETTES[kind];
    const transforms: AuraTransformSpec[] = cars.map((i) => ({
      position: [traffic[i]!.x, 0, traffic[i]!.z] as [number, number, number],
      rotation: [0, traffic[i]!.yaw, 0] as [number, number, number],
      scale: 1
    }));
    const colors = cars.map((carIdx, slotIdx) => palette[(carIdx * 3 + slotIdx) % palette.length]!);

    const baseId = `traffic-${kind}`;
    const bodyId = `${baseId}-body`;
    const glassId = `${baseId}-glass`;
    const rubberId = `${baseId}-rubber`;
    const trimId = `${baseId}-trim`;
    const headId = `${baseId}-head`;
    const tailId = `${baseId}-tail`;

    nodes.push(
      instances.custom(specs.body, { name: bodyId, transforms, colors, material: mats.body, castShadow: shift, receiveShadow: true }).runtime({ id: bodyId }),
      instances.custom(specs.glass, { name: glassId, transforms, material: mats.glass, castShadow: false, receiveShadow: false }).runtime({ id: glassId }),
      instances.custom(specs.rubber, { name: rubberId, transforms, material: mats.rubber, castShadow: false, receiveShadow: true }).runtime({ id: rubberId }),
      instances.custom(specs.trim, { name: trimId, transforms, material: mats.trim, castShadow: false, receiveShadow: true }).runtime({ id: trimId }),
      instances.custom(specs.headGlow, { name: headId, transforms, material: mats.head, castShadow: false, receiveShadow: false }).runtime({ id: headId }),
      instances.custom(specs.tailGlow, { name: tailId, transforms, material: mats.tail, castShadow: false, receiveShadow: false }).runtime({ id: tailId })
    );

    groups.push({
      id: bodyId,
      kind,
      layerIds: [bodyId, glassId, rubberId, trimId, headId, tailId],
      cars,
      scale: 1
    });
  }

  return { nodes, groups };
}
/* ------------------------------------------------------------------ 3. Harbor Landmarks & Drop-Off Parcel Kiosk */

const PROP_GLB_REF = 1.9;

/** Converts `propTransform` scale (`size / 1.9`) to world-metre scale relative to `refMetres`. */
function toMetreTransforms(
  transforms: readonly { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number }[],
  refMetres: number
): AuraTransformSpec[] {
  return transforms.map((t) => ({
    position: [t.position[0], t.position[1], t.position[2]] as [number, number, number],
    rotation: [t.rotation[0], t.rotation[1], t.rotation[2]] as [number, number, number],
    scale: (t.scale * PROP_GLB_REF) / refMetres
  }));
}

let cachedClocktowerAssembly: { readonly slots: readonly MultiMatSlot[]; readonly materials: readonly AuraMaterialSpec[] } | null = null;

/** Builds multi-material slot meshes & materials for the 38 m Harbor Plaza Clocktower (`minY = 0`). */
export function buildClocktowerAssembly(): { readonly slots: readonly MultiMatSlot[]; readonly materials: readonly AuraMaterialSpec[] } {
  if (cachedClocktowerAssembly) return cachedClocktowerAssembly;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    slots.push({ materialIndex, mesh });
  };

  // 0: Limestone plinth/cornices/quoins, 1: Terracotta brick shaft, 2: Patinated verdigris copper dome,
  // 3: Wrought iron / bronze bell, headstock & hands, 4: Illuminated ivory clock dials
  push(0, transformMesh(bevelBoxMesh(6.6, 5.8, 6.6, 0.22), { pos: [0, 2.9, 0] }));
  push(0, transformMesh(bevelBoxMesh(7.1, 0.65, 7.1, 0.14), { pos: [0, 6.05, 0] }));
  push(1, transformMesh(bevelBoxMesh(5.4, 18.8, 5.4, 0.18), { pos: [0, 15.6, 0] }));
  // Rusticated corner limestone pilaster quoins framing the brick shaft
  for (const qx of [-2.62, 2.62]) {
    for (const qz of [-2.62, 2.62]) {
      push(0, transformMesh(bevelBoxMesh(0.46, 18.2, 0.46, 0.05), { pos: [qx, 15.5, qz] }));
    }
  }

  // Ground-floor arched entrance portal (`+Z`) with bronze double doors (`minY = 0`)
  push(3, transformMesh(bevelBoxMesh(1.92, 3.05, 0.18, 0.03), { pos: [0, 1.525, 3.24] }));
  for (const px of [-1.18, 1.18]) {
    push(0, transformMesh(bevelBoxMesh(0.42, 2.9, 0.44, 0.05), { pos: [px, 1.45, 3.26] }));
  }
  for (const s of archwayVoussoirSlots({
    radius: 0.98,
    thickness: 0.4,
    depth: 0.44,
    voussoirs: 7,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 0
  })) {
    push(s.materialIndex, transformMesh(s.mesh, { pos: [0, 2.9, 3.26] }));
  }

  for (const cy of [11.2, 16.8, 25.1, 31.2]) {
    push(0, transformMesh(bevelBoxMesh(6.0, 0.52, 6.0, 0.12), { pos: [0, cy, 0] }));
  }

  // 4 illuminated harbor clock faces + bronze bezels, arbor boss & hands at y = 21.4 m
  for (let sideIdx = 0; sideIdx < 4; sideIdx += 1) {
    const yaw = (sideIdx * Math.PI) / 2;
    const dialRim = latheMesh([[1.36, 0], [1.56, 0.04], [1.56, 0.18], [1.34, 0.2]], 20);
    const dialFace = latheMesh([[0, 0.12], [1.35, 0.12], [1.35, 0.15], [0, 0.15]], 20);
    const dialArbor = latheMesh([[0, 0.14], [0.16, 0.15], [0.14, 0.24], [0, 0.26]], 12);
    const handHour = transformMesh(bevelBoxMesh(0.11, 0.72, 0.06, 0.015), { pos: [0.16, 0.28, 0.18], rot: [0, 0, -0.55] });
    const handMin = transformMesh(bevelBoxMesh(0.09, 1.02, 0.06, 0.015), { pos: [-0.12, 0.42, 0.2], rot: [0, 0, 0.28] });
    const faceOffset = (m: RawMesh): RawMesh =>
      transformMesh(transformMesh(m, { pos: [0, 21.4, 2.7] }), { rot: [0, yaw, 0] });
    push(3, faceOffset(transformMesh(dialRim, { rot: [Math.PI * 0.5, 0, 0] })));
    push(4, faceOffset(transformMesh(dialFace, { rot: [Math.PI * 0.5, 0, 0] })));
    push(3, faceOffset(transformMesh(dialArbor, { rot: [Math.PI * 0.5, 0, 0] })));
    push(3, faceOffset(handHour));
    push(3, faceOffset(handMin));

    // Belfry stone impost columns + radial masonry archways (`archwayVoussoirSlots`) on all 4 faces
    for (const ix of [-1.46, 1.46]) {
      push(
        0,
        transformMesh(transformMesh(bevelBoxMesh(0.42, 2.72, 0.56, 0.05), { pos: [ix, 26.58, 2.38] }), { rot: [0, yaw, 0] })
      );
    }
    const archSlots = archwayVoussoirSlots({
      radius: 1.25,
      thickness: 0.42,
      depth: 0.58,
      voussoirs: 9,
      stoneMatA: 0,
      stoneMatB: 1,
      keystoneMat: 0
    });
    for (const s of archSlots) {
      push(
        s.materialIndex,
        transformMesh(transformMesh(s.mesh, { pos: [0, 27.9, 2.38] }), { rot: [0, yaw, 0] })
      );
    }
  }

  // Belfry corner piers + structural wrought-iron headstock beam & yoke suspending the bronze harbor bell
  for (const sx of [-2.15, 2.15]) {
    for (const sz of [-2.15, 2.15]) {
      push(0, transformMesh(bevelBoxMesh(0.95, 5.8, 0.95, 0.08), { pos: [sx, 28.2, sz] }));
    }
  }
  push(3, tubeSweepMesh([[-2.15, 29.42, 0, 0.14], [0, 29.42, 0, 0.16], [2.15, 29.42, 0, 0.14]], 8));
  push(3, tubeSweepMesh([[0, 28.62, 0, 0.15], [0, 29.45, 0, 0.13]], 8));
  push(
    3,
    transformMesh(
      latheMesh([[0.95, 0], [0.76, 0.35], [0.62, 1.05], [0.34, 1.45], [0, 1.52]], 18),
      { pos: [0, 27.2, 0] }
    )
  );
  push(3, transformMesh(latheMesh([[0, 0], [0.16, 0.06], [0.11, 0.28], [0.05, 0.95], [0, 1.0]], 10), { pos: [0, 27.02, 0] }));

  // Smooth-subdivided verdigris patinated copper ogee cupola dome + lantern drum + spire weathervane up to 38.0 m
  push(
    2,
    transformMesh(
      subdivideSmoothMesh(
        latheMesh([[2.92, 0], [2.84, 0.85], [2.42, 2.1], [1.56, 3.35], [0.82, 4.18], [0.46, 4.52]], 22),
        1,
        0.4
      ),
      { pos: [0, 31.42, 0] }
    )
  );
  push(0, transformMesh(latheMesh([[0.68, 35.6], [0.64, 36.28], [0, 36.32]], 14), { pos: [0, 0, 0] }));
  push(3, tubeSweepMesh([[0, 36.08, 0, 0.09], [0, 38.0, 0, 0.03]], 8));
  push(3, transformMesh(bevelBoxMesh(1.15, 0.16, 0.04, 0.01), { pos: [0.18, 37.55, 0] }));

  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#e8dcc6", roughness: 0.78, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    unnamed(material.pbr({ color: "#c9664c", roughness: 0.82, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    unnamed(material.metal({ color: "#67a896", roughness: 0.42, metallic: 0.58, clearcoat: 0, sheen: 0 })),
    unnamed(material.brushedMetal({ color: "#6b5538", roughness: 0.32, anisotropy: 0.65 })),
    unnamed(material.emissive({ color: "#fff5da", emissive: "#ffd992", emissiveIntensity: 1.65, practical: true }))
  ];

  cachedClocktowerAssembly = { slots, materials };
  return cachedClocktowerAssembly;
}

/** Builds the 38 m Harbor Plaza Clocktower (`archwayVoussoirSlots` belfry, 4 lit dials, copper cupola). */
export function buildClocktowerLandmarkNode(
  pose: { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number },
  castShadow: boolean
): GroupNodeBuilder {
  const { slots, materials } = buildClocktowerAssembly();
  const worldScale = (pose.scale * PROP_GLB_REF) / 38;
  return assembleMultiMaterialNode("landmark-clocktower", [...slots], [...materials], {
    position: pose.position,
    rotation: pose.rotation,
    scale: worldScale,
    castShadow,
    receiveShadow: true
  });
}

let cachedLighthouseAssembly: ReturnType<typeof computeLighthouseAssembly> | null = null;

function computeLighthouseAssembly(): {
  readonly opaqueSlots: readonly MultiMatSlot[];
  readonly opaqueMaterials: readonly AuraMaterialSpec[];
  readonly glassMesh: RawMesh;
  readonly slots: readonly MultiMatSlot[];
  readonly materials: readonly AuraMaterialSpec[];
} {
  const opaqueSlots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    opaqueSlots.push({ materialIndex, mesh });
  };

  // 0: Granite base & gallery stone, 1: Coastal cream band, 2: Harbor vermilion band,
  // 3: Wrought iron pedestal, mullions, railing & dome copper, 4: Glowing Fresnel beacon optic
  push(0, latheMesh([[3.35, 0], [3.1, 0.6], [2.85, 3.8], [2.95, 4.1], [2.58, 4.2]], 20));

  // Grounded keeper's stone entrance portal & iron door on `+Z` (`minY = 0`)
  push(0, transformMesh(bevelBoxMesh(1.36, 2.32, 0.48, 0.08), { pos: [0, 1.16, 3.02] }));
  push(3, transformMesh(bevelBoxMesh(0.96, 2.04, 0.14, 0.025), { pos: [0, 1.02, 3.24] }));

  const bandHeights: readonly [number, number, number, number, number][] = [
    [4.2, 7.2, 2.58, 2.34, 2],
    [7.2, 10.2, 2.34, 2.13, 1],
    [10.2, 13.2, 2.13, 1.92, 2],
    [13.2, 16.1, 1.92, 1.73, 1],
    [16.1, 18.8, 1.73, 1.56, 2]
  ];
  for (const [y0, y1, r0, r1, matIdx] of bandHeights) {
    push(matIdx, latheMesh([[r0, y0], [r1, y1]], 20));
  }
  // Stairwell casement slits on the coastal cream bands
  push(3, transformMesh(bevelBoxMesh(0.38, 0.86, 0.18, 0.02), { pos: [0, 8.7, 2.22] }));
  push(3, transformMesh(bevelBoxMesh(0.34, 0.82, 0.18, 0.02), { pos: [0, 14.65, 1.81] }));

  // Corbelled stone observation gallery & tubular iron guardrail
  push(0, latheMesh([[1.56, 18.8], [2.28, 19.25], [2.32, 19.6], [1.45, 19.65], [0, 19.65]], 20));
  const railRing: V4[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    railRing.push([Math.cos(a) * 2.18, 20.55, Math.sin(a) * 2.18, 0.045]);
    if (i < 16 && i % 2 === 0) {
      push(3, tubeSweepMesh([[Math.cos(a) * 2.18, 19.6, Math.sin(a) * 2.18, 0.038], [Math.cos(a) * 2.18, 20.55, Math.sin(a) * 2.18, 0.038]], 6));
      // Lantern room vertical iron astragal mullions framing the glazing drum
      push(3, tubeSweepMesh([[Math.cos(a) * 1.4, 19.62, Math.sin(a) * 1.4, 0.028], [Math.cos(a) * 1.4, 22.04, Math.sin(a) * 1.4, 0.028]], 6));
    }
  }
  push(3, tubeSweepMesh(railRing, 6));

  // Cast-iron lantern service pedestal (`y = 19.62..20.22`) anchoring the Fresnel optic drum solidly to the gallery
  push(3, latheMesh([[1.42, 19.62], [1.42, 19.86], [0.92, 19.92], [0.82, 20.22], [0, 20.22]], 18));

  // Fresnel optic drum + upper spindle cap + copper lantern dome & lightning spire up to 24.0 m
  push(4, latheMesh([[0, 20.18], [0.78, 20.32], [0.84, 21.0], [0.76, 21.68], [0, 21.82]], 18));
  push(3, latheMesh([[0, 21.78], [0.72, 21.82], [0.86, 22.04], [0, 22.04]], 16));
  push(3, latheMesh([[1.52, 22.0], [1.42, 22.45], [0.95, 23.15], [0.24, 23.55], [0, 23.62]], 18));
  push(3, tubeSweepMesh([[0, 23.55, 0, 0.05], [0, 24.0, 0, 0.02]], 6));

  const opaqueMaterials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#8c867c", roughness: 0.86, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    unnamed(material.ceramic({ color: "#f3ead8", roughness: 0.34 })),
    unnamed(material.lacquer({ color: "#cf4938", roughness: 0.32, clearcoat: 0.72, clearcoatRoughness: 0.08 })),
    unnamed(material.metal({ color: "#2d383a", roughness: 0.42, metallic: 0.78, clearcoat: 0, sheen: 0 })),
    unnamed(material.emissive({ color: "#fff3c4", emissive: "#ffd269", emissiveIntensity: 2.6, practical: true }))
  ];
  const glassMesh = latheMesh([[1.36, 19.65], [1.41, 19.65], [1.41, 22.04], [1.36, 22.04]], 18);

  return {
    opaqueSlots,
    opaqueMaterials,
    glassMesh,
    slots: [...opaqueSlots, { materialIndex: 5, mesh: glassMesh }],
    materials: [...opaqueMaterials, courierGlazingMaterial()]
  };
}

/** Builds multi-material slot meshes & materials for the 24 m Harbor Quay Lighthouse (`minY = 0`). */
export function buildLighthouseAssembly() {
  if (!cachedLighthouseAssembly) cachedLighthouseAssembly = computeLighthouseAssembly();
  return cachedLighthouseAssembly;
}

/** Builds the 24 m Harbor Quay Lighthouse (`latheMesh` striped tower, gallery railing, physical Fresnel lantern). */
export function buildLighthouseLandmarkNode(
  pose: { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number },
  castShadow: boolean
): GroupNodeBuilder {
  const { opaqueSlots, opaqueMaterials, glassMesh } = buildLighthouseAssembly();
  const opaqueNode = assembleMultiMaterialNode("landmark-lighthouse-body", [...opaqueSlots], [...opaqueMaterials], {
    castShadow,
    receiveShadow: true
  });

  const lanternGlass = geometry.custom(mergeRawMeshes([glassMesh]), {
    name: "landmark-lighthouse-glass",
    material: courierGlazingMaterial(),
    castShadow: false,
    receiveShadow: false
  });

  const worldScale = (pose.scale * PROP_GLB_REF) / 24;
  return group("landmark-lighthouse", [opaqueNode, lanternGlass], {
    position: pose.position,
    rotation: pose.rotation,
    scale: worldScale
  });
}

/** Computes sidewalk kerb placement for the Drop-Off Parcel Kiosk beside an active delivery job. */
export function dropoffKioskPose(job: { readonly x: number; readonly z: number } | null): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
} {
  if (!job) return { x: 0, y: -60, z: 0, yaw: 0 };
  const remX = Math.abs((((job.x - 30) % 60) + 60) % 60);
  const onNorthSouthAvenue = remX < 0.5 || remX > 59.5;
  if (onNorthSouthAvenue) {
    return { x: job.x + 8.6, y: 0, z: job.z, yaw: -Math.PI * 0.5 };
  }
  return { x: job.x, y: 0, z: job.z + 8.6, yaw: Math.PI };
}

/** Sculpted glowing courier-teal Drop-Off Parcel Locker Kiosk (`id = "dropoff-kiosk"`). */
export function buildDropoffParcelKioskNode(id = "dropoff-kiosk"): GroupNodeBuilder {
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    slots.push({ materialIndex, mesh });
  };

  // Plinth + modular courier-teal locker body + cream locker doors + brushed handles + drop-chute + smooth curved canopy
  push(3, transformMesh(bevelBoxMesh(1.82, 0.14, 0.82, 0.03), { pos: [0, 0.07, 0] }));
  push(0, transformMesh(subdivideSmoothMesh(bevelBoxMesh(1.66, 2.04, 0.68, 0.055), 1, 0.34), { pos: [0, 1.15, -0.02] }));
  for (const lx of [-0.52, 0.52]) {
    for (const ly of [0.52, 1.08, 1.64]) {
      push(1, transformMesh(bevelBoxMesh(0.44, 0.46, 0.05, 0.012), { pos: [lx, ly, 0.31] }));
      push(2, transformMesh(bevelBoxMesh(0.04, 0.14, 0.04, 0.006), { pos: [lx - 0.16, ly, 0.34] }));
      push(4, transformMesh(bevelBoxMesh(0.11, 0.025, 0.02, 0.004), { pos: [lx + 0.13, ly + 0.17, 0.34] }));
    }
  }
  // Center illuminated dispatch touchscreen, parcel return drop-chute & LED header strip
  push(4, transformMesh(bevelBoxMesh(0.42, 0.58, 0.05, 0.012), { pos: [0, 1.28, 0.32] }));
  push(2, transformMesh(bevelBoxMesh(0.38, 0.18, 0.12, 0.018), { pos: [0, 0.72, 0.34], rot: [0.22, 0, 0] }));
  push(4, transformMesh(bevelBoxMesh(1.54, 0.12, 0.06, 0.015), { pos: [0, 2.04, 0.32] }));
  // Side parcel staging shelf + express thermal parcel box
  push(2, transformMesh(bevelBoxMesh(0.36, 0.045, 0.52, 0.01), { pos: [0.98, 0.78, 0] }));
  push(5, transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.28, 0.24, 0.34, 0.03), 1, 0.36), { pos: [0.97, 0.92, 0], rot: [0, 0.12, 0] }));

  // Smooth-subdivided cantilevered rain hood + rooftop beacon finial
  push(
    1,
    subdivideSmoothMesh(
      loftSectionsMesh(
        [
          [[-0.9, 2.14, -0.38], [0.9, 2.14, -0.38], [0.86, 2.22, -0.38], [-0.86, 2.22, -0.38]],
          [[-0.92, 2.21, 0.12], [0.92, 2.21, 0.12], [0.88, 2.29, 0.12], [-0.88, 2.29, 0.12]],
          [[-0.9, 2.1, 0.54], [0.9, 2.1, 0.54], [0.86, 2.18, 0.54], [-0.86, 2.18, 0.54]]
        ],
        true,
        false
      ),
      1,
      0.4
    )
  );
  push(2, transformMesh(latheMesh([[0, 0], [0.16, 0], [0.14, 0.08], [0, 0.09]], 14), { pos: [0, 2.25, 0] }));
  push(4, transformMesh(latheMesh([[0, 0], [0.12, 0.02], [0.11, 0.18], [0, 0.24]], 16), { pos: [0, 2.32, 0] }));

  const body = assembleMultiMaterialNode(
    `${id}-body`,
    slots,
    [
      unnamed(material.clearcoatPaint({ color: "#199fa6", roughness: 0.16, clearcoat: 0.95, clearcoatRoughness: 0.04 })),
      unnamed(material.carPaint({ color: "#efe3cf", roughness: 0.24, clearcoat: 0.85, clearcoatRoughness: 0.05 })),
      unnamed(material.brushedMetal({ color: "#d5dfe8", roughness: 0.24, anisotropy: 0.8 })),
      unnamed(material.blackRubber({ color: "#1c2026", roughness: 0.88 })),
      unnamed(material.emissive({ color: "#5ef4f8", emissive: "#22c3c9", emissiveIntensity: 2.2, practical: true })),
      unnamed(material.lacquer({ color: "#ff9b3d", roughness: 0.26, clearcoat: 0.84, clearcoatRoughness: 0.05 }))
    ],
    { castShadow: false, receiveShadow: true }
  );
  const visorSpec = memoizeGeometry("drift:dropoff-kiosk-visor", () =>
    mergeRawMeshes([transformMesh(bevelBoxMesh(0.48, 0.66, 0.025, 0.006), { pos: [0, 1.28, 0.35] })])
  );
  const visor = geometry.custom(visorSpec, {
    name: `${id}-visor`,
    material: courierGlazingMaterial(),
    castShadow: false,
    receiveShadow: false
  });
  return group(id, [body, visor], { position: [0, -60, 0] }).runtime({ id });
}

/* ------------------------------------------------------------------ 4. Street Furniture, Rooftops & Shopfront Accents */

export interface PropPlacementInput {
  readonly placements: ReadonlyMap<
    PropKey,
    readonly { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number }[]
  >;
}

/** Shared street-prop surface palette (`clearcoat: 0, sheen: 0` on instanced city batches). */
function propSurfaceMaterials() {
  return {
    castIron: unnamed(material.metal({ color: "#272d34", roughness: 0.5, metallic: 0.68, clearcoat: 0, sheen: 0 })),
    brushedSteel: unnamed(material.metal({ color: "#b9c4cf", roughness: 0.34, metallic: 0.82, clearcoat: 0, sheen: 0 })),
    brass: unnamed(material.metal({ color: "#d5a449", roughness: 0.28, metallic: 0.88, clearcoat: 0, sheen: 0 })),
    vermilion: unnamed(material.pbr({ color: "#cf3f2e", roughness: 0.34, metallic: 0.08, clearcoat: 0, sheen: 0 })),
    creamStone: unnamed(material.pbr({ color: "#ece0cb", roughness: 0.74, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    cedarWood: unnamed(material.pbr({ color: "#8c5a38", roughness: 0.78, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    bark: unnamed(material.pbr({ color: "#684b36", roughness: 0.88, metallic: 0, clearcoat: 0, sheen: 0 })),
    foliage: unnamed(material.pbr({ color: "#5fa343", roughness: 0.68, metallic: 0, clearcoat: 0, sheen: 0 })),
    foliageTintable: unnamed(material.pbr({ color: "#ffffff", roughness: 0.68, metallic: 0, clearcoat: 0, sheen: 0 })),
    sodiumBulb: unnamed(material.pbr({ color: "#ffe4ab", emissive: "#ffb347", emissiveIntensity: 2.1, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true })),
    signalRed: unnamed(material.pbr({ color: "#ff4034", emissive: "#ff2a1c", emissiveIntensity: 2.0, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true })),
    signalAmber: unnamed(material.pbr({ color: "#ffd15c", emissive: "#ffa822", emissiveIntensity: 1.85, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true })),
    signalGreen: unnamed(material.pbr({ color: "#4fe39b", emissive: "#22c97e", emissiveIntensity: 1.95, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }))
  };
}

let cachedStreetLamp: { readonly iron: RawMesh; readonly brass: RawMesh; readonly bulb: RawMesh } | null = null;
/** 5.0 m Harbor Gooseneck Street Lamp (`castIron` mast & reflector hood, `brass` collar, `sodiumBulb` globe, `minY = 0`). */
function buildStreetLampMeshes(): { readonly iron: RawMesh; readonly brass: RawMesh; readonly bulb: RawMesh } {
  if (cachedStreetLamp) return cachedStreetLamp;
  const iron = joinRawMeshes([
    latheMesh([[0.24, 0], [0.22, 0.18], [0.16, 0.55], [0.18, 0.65], [0.11, 0.95]], 12),
    tubeSweepMesh(
      [[0, 0.9, 0, 0.085], [0, 3.85, 0, 0.058], [0.22, 4.55, 0, 0.048], [0.82, 4.94, 0, 0.042], [1.38, 4.82, 0, 0.038]],
      8
    ),
    tubeSweepMesh([[0.03, 3.82, 0, 0.026], [0.28, 4.28, 0, 0.024], [0.64, 4.84, 0, 0.022]], 6),
    transformMesh(latheMesh([[0, 0.16], [0.12, 0.14], [0.28, 0.05], [0.3, 0]], 12), { pos: [1.38, 4.72, 0] })
  ]);
  const brass = latheMesh([[0.165, 0.58], [0.19, 0.61], [0.19, 0.66], [0.165, 0.69]], 12);
  const bulb = transformMesh(latheMesh([[0, 0], [0.16, 0.02], [0.2, 0.09], [0, 0.14]], 12), { pos: [1.38, 4.62, 0] });
  cachedStreetLamp = { iron, brass, bulb };
  return cachedStreetLamp;
}

let cachedTrafficSignal: {
  readonly frame: RawMesh;
  readonly brass: RawMesh;
  readonly redLens: RawMesh;
  readonly amberLens: RawMesh;
  readonly greenLens: RawMesh;
} | null = null;
/** 4.2 m Cantilever Traffic Signal (`castIron` mast & housing, `brass` finial, 3 glowing signal optics, `minY = 0`). */
function buildTrafficSignalMeshes() {
  if (cachedTrafficSignal) return cachedTrafficSignal;
  const frame = joinRawMeshes([
    latheMesh([[0.22, 0], [0.19, 0.14], [0.16, 0.38], [0.1, 0.62]], 12),
    tubeSweepMesh([[0, 0.56, 0, 0.078], [0, 4.12, 0, 0.062]], 8),
    tubeSweepMesh([[0, 3.88, 0, 0.056], [0.48, 3.96, 0, 0.05], [1.02, 3.96, 0, 0.044]], 7),
    transformMesh(bevelBoxMesh(0.12, 0.2, 0.12, 0.02), { pos: [0.88, 3.92, 0] }),
    transformMesh(bevelBoxMesh(0.34, 0.96, 0.28, 0.032), { pos: [0.88, 3.46, 0] })
  ]);
  const brass = latheMesh([[0.065, 4.1], [0.085, 4.13], [0.05, 4.18], [0, 4.2]], 10);
  const lensDisc = latheMesh([[0, 0], [0.095, 0.01], [0.095, 0.045], [0, 0.05]], 12);
  cachedTrafficSignal = {
    frame,
    brass,
    redLens: transformMesh(lensDisc, { pos: [0.88, 3.75, 0.14], rot: [Math.PI * 0.5, 0, 0] }),
    amberLens: transformMesh(lensDisc, { pos: [0.88, 3.46, 0.14], rot: [Math.PI * 0.5, 0, 0] }),
    greenLens: transformMesh(lensDisc, { pos: [0.88, 3.17, 0.14], rot: [Math.PI * 0.5, 0, 0] })
  };
  return cachedTrafficSignal;
}

let cachedStreetTree: { readonly trunk: RawMesh; readonly canopy: RawMesh } | null = null;
/** 4.6 m Broadleaf Street Tree (vertical root-flare trunk `minY = 0` + `layeredCanopyMesh` crown). */
function buildStreetTreeMeshes(): { readonly trunk: RawMesh; readonly canopy: RawMesh } {
  if (cachedStreetTree) return cachedStreetTree;
  const trunk = joinRawMeshes([
    latheMesh([[0.42, 0], [0.4, 0.08], [0.27, 0.22]], 10),
    tubeSweepMesh([[0, 0, 0, 0.25], [0, 0.24, 0, 0.23], [0.04, 1.08, 0.02, 0.16], [-0.03, 2.1, -0.02, 0.12]], 7, false),
    tubeSweepMesh([[0, 1.55, 0, 0.09], [0.48, 2.35, 0.22, 0.05]], 6, false),
    tubeSweepMesh([[0, 1.65, 0, 0.09], [-0.44, 2.42, -0.2, 0.05]], 6, false)
  ]);
  const canopy = transformMesh(layeredCanopyMesh({ radius: 1.58, height: 2.78, puffs: 11, seed: 31 }), { pos: [0, 1.84, 0] });
  cachedStreetTree = { trunk, canopy };
  return cachedStreetTree;
}

let cachedDatePalm: { readonly trunk: RawMesh; readonly fronds: RawMesh } | null = null;
/** 7.5 m Coastal Date Palm (grounded basal bulb `minY = 0`, curved trunk, crownshaft & 9 lofted pinnate fronds). */
function buildDatePalmMeshes(): { readonly trunk: RawMesh; readonly fronds: RawMesh } {
  if (cachedDatePalm) return cachedDatePalm;
  const trunk = joinRawMeshes([
    latheMesh([[0.36, 0], [0.34, 0.14], [0.29, 0.34]], 10),
    tubeSweepMesh([[0, 0, 0, 0.29], [0, 0.34, 0, 0.27], [0.18, 2.1, 0.06, 0.22], [0.34, 4.3, -0.04, 0.17], [0.22, 6.25, 0.02, 0.14]], 8, false),
    transformMesh(latheMesh([[0, 0], [0.15, 0.06], [0.16, 0.18], [0, 0.28]], 8), { pos: [0.3, 5.98, 0.08] }),
    transformMesh(latheMesh([[0, 0], [0.14, 0.06], [0.15, 0.17], [0, 0.26]], 8), { pos: [0.12, 5.96, -0.1] })
  ]);
  const frondParts: RawMesh[] = [];
  for (let f = 0; f < 9; f += 1) {
    const ang = (f / 9) * Math.PI * 2;
    const blade = loftSectionsMesh(
      [
        [[-0.08, 0, 0], [0.08, 0, 0], [0, 0.05, 0]],
        [[-0.28, 0.42, 0.95], [0.28, 0.42, 0.95], [0, 0.5, 0.95]],
        [[-0.22, 0.18, 1.85], [0.22, 0.18, 1.85], [0, 0.24, 1.85]],
        [[-0.04, -0.45, 2.55], [0.04, -0.45, 2.55], [0, -0.42, 2.55]]
      ],
      true,
      false
    );
    frondParts.push(transformMesh(blade, { pos: [0.22, 6.22, 0.02], rot: [0, ang, 0] }));
  }
  cachedDatePalm = { trunk, fronds: joinRawMeshes(frondParts) };
  return cachedDatePalm;
}

let cachedTransitShelter: {
  readonly steelFrame: RawMesh;
  readonly cedarBench: RawMesh;
  readonly mapGlow: RawMesh;
  readonly glass: RawMesh;
} | null = null;
/** 4.2 m Harbor Transit Shelter (grounded front & rear steel columns, cedar bench on steel legs, lightbox & safety glass). */
function buildTransitShelterMeshes() {
  if (cachedTransitShelter) return cachedTransitShelter;
  const basePlate = latheMesh([[0.1, 0], [0.1, 0.03], [0.055, 0.045]], 8);
  const steelFrame = joinRawMeshes([
    // Rear structural posts + baseplates (`z = 0.56`, `minY = 0`)
    transformMesh(basePlate, { pos: [-1.95, 0, 0.56] }),
    transformMesh(basePlate, { pos: [0, 0, 0.56] }),
    transformMesh(basePlate, { pos: [1.95, 0, 0.56] }),
    tubeSweepMesh([[-1.95, 0, 0.56, 0.055], [-1.95, 2.4, 0.56, 0.05]], 7),
    tubeSweepMesh([[0, 0, 0.56, 0.05], [0, 2.4, 0.56, 0.048]], 7),
    tubeSweepMesh([[1.95, 0, 0.56, 0.055], [1.95, 2.4, 0.56, 0.05]], 7),
    // Front corner columns + lightbox mullion (`z = -0.52`, `minY = 0`)
    transformMesh(basePlate, { pos: [-1.95, 0, -0.52] }),
    transformMesh(basePlate, { pos: [1.95, 0, -0.52] }),
    tubeSweepMesh([[-1.95, 0, -0.52, 0.052], [-1.95, 2.38, -0.52, 0.048]], 7),
    tubeSweepMesh([[1.95, 0, -0.52, 0.052], [1.95, 2.38, -0.52, 0.048]], 7),
    tubeSweepMesh([[1.95, 0, 0.02, 0.045], [1.95, 2.42, 0.02, 0.045]], 7),
    // Grounded bench legs (`y = 0..0.46`)
    tubeSweepMesh([[-1.42, 0, 0.3, 0.036], [-1.42, 0.46, 0.3, 0.036]], 6),
    tubeSweepMesh([[-0.45, 0, 0.3, 0.036], [-0.45, 0.46, 0.3, 0.036]], 6),
    tubeSweepMesh([[0.52, 0, 0.3, 0.036], [0.52, 0.46, 0.3, 0.036]], 6),
    // Barrel-vault canopy roof + framed route-map lightbox anchored between `+X` posts (`z = -0.52..0.56`)
    subdivideSmoothMesh(
      loftSectionsMesh(
        [-2.08, 0, 2.08].map((x) => [
          [x, 2.36, 0.64], [x, 2.44, 0.64], [x, 2.56, 0.02], [x, 2.42, -0.64], [x, 2.34, -0.64], [x, 2.48, 0.02]
        ]),
        true,
        false
      ),
      1,
      0.35
    ),
    transformMesh(bevelBoxMesh(0.14, 1.42, 1.04, 0.02), { pos: [1.95, 1.26, 0.02] })
  ]);
  const cedarBench = joinRawMeshes([
    transformMesh(bevelBoxMesh(2.36, 0.06, 0.17, 0.015), { pos: [-0.45, 0.48, 0.2] }),
    transformMesh(bevelBoxMesh(2.36, 0.06, 0.17, 0.015), { pos: [-0.45, 0.48, 0.39] })
  ]);
  const mapGlow = transformMesh(bevelBoxMesh(0.16, 1.22, 0.86, 0.015), { pos: [1.95, 1.26, 0.02] });
  const glass = joinRawMeshes([
    transformMesh(bevelBoxMesh(3.78, 2.02, 0.035, 0.006), { pos: [0, 1.24, 0.56] }),
    transformMesh(bevelBoxMesh(0.035, 2.02, 1.02, 0.006), { pos: [-1.95, 1.24, 0.02] })
  ]);
  cachedTransitShelter = { steelFrame, cedarBench, mapGlow, glass };
  return cachedTransitShelter;
}

let cachedFireHydrant: { readonly body: RawMesh; readonly ironBase: RawMesh; readonly brassCaps: RawMesh } | null = null;
/** 0.80 m Harbor Fire Hydrant (cast-iron bolted flange `minY = 0`, vermilion body, 3 machined brass nozzles & nut). */
function buildFireHydrantMeshes(): { readonly body: RawMesh; readonly ironBase: RawMesh; readonly brassCaps: RawMesh } {
  if (cachedFireHydrant) return cachedFireHydrant;
  const ironBase = latheMesh([[0.21, 0], [0.21, 0.065], [0.14, 0.09], [0, 0.09]], 12);
  const body = latheMesh(
    [[0.14, 0.07], [0.145, 0.52], [0.185, 0.56], [0.155, 0.7], [0.065, 0.76], [0, 0.79]],
    14
  );
  const brassCaps = joinRawMeshes([
    tubeSweepMesh([[-0.22, 0.44, 0, 0.052], [0.22, 0.44, 0, 0.052]], 8),
    tubeSweepMesh([[0, 0.41, 0, 0.064], [0, 0.41, 0.22, 0.064]], 8),
    latheMesh([[0, 0.76], [0.05, 0.77], [0.045, 0.82], [0, 0.825]], 6)
  ]);
  cachedFireHydrant = { body, ironBase, brassCaps };
  return cachedFireHydrant;
}

let cachedWatertank: { readonly ironTrestleAndHoops: RawMesh; readonly cedarBarrel: RawMesh } | null = null;
/** 3.45 m Rooftop Cedar Water Tower (grounded footpads + `latticeTrussMesh` `minY = 0`, cedar staves, 3 separate iron hoops). */
function buildWatertankMeshes(): { readonly ironTrestleAndHoops: RawMesh; readonly cedarBarrel: RawMesh } {
  if (cachedWatertank) return cachedWatertank;
  const footPads: RawMesh[] = [];
  for (const sx of [-0.825, 0.825]) {
    for (const sz of [-0.825, 0.825]) {
      footPads.push(transformMesh(bevelBoxMesh(0.24, 0.06, 0.24, 0.015), { pos: [sx, 0.03, sz] }));
    }
  }
  const hoopRing = (y0: number): RawMesh =>
    latheMesh([[0.99, y0], [1.035, y0 + 0.012], [1.035, y0 + 0.052], [0.99, y0 + 0.064]], 16);
  const ironTrestleAndHoops = joinRawMeshes([
    ...footPads,
    transformMesh(latticeTrussMesh({ span: [1.65, 1.24, 1.65], bays: 2, chordRadius: 0.052, braceRadius: 0.03 }), {
      pos: [0, 0.672, 0]
    }),
    tubeSweepMesh([[0.38, 0, 0.38, 0.048], [0.38, 1.38, 0.38, 0.048]], 7),
    hoopRing(1.52),
    hoopRing(2.02),
    hoopRing(2.52),
    latheMesh([[0, 2.74], [1.12, 2.74], [1.12, 2.79], [0.38, 3.26], [0, 3.4]], 16),
    tubeSweepMesh([[0, 3.36, 0, 0.032], [0, 3.48, 0, 0.012]], 6)
  ]);
  const cedarBarrel = joinRawMeshes([
    transformMesh(bevelBoxMesh(1.94, 0.08, 1.94, 0.02), { pos: [0, 1.33, 0] }),
    latheMesh([[0, 1.36], [1.0, 1.36], [1.0, 2.76], [0, 2.76]], 16)
  ]);
  cachedWatertank = { ironTrestleAndHoops, cedarBarrel };
  return cachedWatertank;
}

/** 1.85 m Harbor Express Delivery Scooter (smooth-subdivided step-through legshield & wasp-tail cowl, rear courier parcel box, grounded `minY = 0`). */
function buildDeliveryScooterSpecs(): { readonly bodySpec: AuraCustomGeometrySpec; readonly trimSpec: AuraCustomGeometrySpec } {
  const bodySpec = memoizeGeometry("drift:delivery-scooter-body", () => {
    const legshield = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          [[-0.22, 0.28, 0.36], [0.22, 0.28, 0.36], [0.24, 0.56, 0.44], [-0.24, 0.56, 0.44]],
          [[-0.25, 0.34, 0.52], [0.25, 0.34, 0.52], [0.22, 0.88, 0.5], [-0.22, 0.88, 0.5]],
          [[-0.14, 0.46, 0.64], [0.14, 0.46, 0.64], [0.12, 0.84, 0.58], [-0.12, 0.84, 0.58]]
        ],
        true,
        false
      ),
      1,
      0.44
    );
    const frontFender = transformMesh(
      sculptStreamlinedHullMesh(0.42, 0.2, 0.16, {
        noseSharpness: 0.55,
        tailTaper: 0.44,
        canopyBulge: 0.2,
        undersideFlat: 0.26,
        stations: 14,
        ringPoints: 22
      }),
      { pos: [0, 0.34, 0.64], rot: [0.16, 0, 0] }
    );
    const waspTail = transformMesh(
      sculptStreamlinedHullMesh(0.84, 0.44, 0.38, {
        noseSharpness: 0.52,
        tailTaper: 0.42,
        canopyBulge: 0.24,
        undersideFlat: 0.22,
        stations: 16,
        ringPoints: 24
      }),
      { pos: [0, 0.54, -0.34] }
    );
    const floorboard = transformMesh(bevelBoxMesh(0.4, 0.07, 0.56, 0.02), { pos: [0, 0.24, 0.08] });
    const topBox = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.42, 0.34, 0.4, 0.045), 1, 0.36), { pos: [0, 0.94, -0.68] });
    return mergeRawMeshes([legshield, frontFender, waspTail, floorboard, topBox]);
  });

  const trimSpec = memoizeGeometry("drift:delivery-scooter-trim", () => {
    const wheelSlots = wheelAssemblySlots({ radius: 0.22, width: 0.11, spokeCount: 5, tireMat: 0, rimMat: 1, rotorMat: 2 });
    const wheelRaw = joinRawMeshes(wheelSlots.map((s) => s.mesh));
    const saddle = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.28, 0.12, 0.56, 0.04), 1, 0.4), { pos: [0, 0.74, -0.22] });
    const bars = tubeSweepMesh([[-0.32, 0.98, 0.42, 0.018], [-0.14, 1.0, 0.46, 0.02], [0, 0.92, 0.47, 0.024], [0.14, 1.0, 0.46, 0.02], [0.32, 0.98, 0.42, 0.018]], 6);
    const stem = tubeSweepMesh([[0, 0.22, 0.62, 0.025], [0, 0.94, 0.47, 0.026]], 6);
    const stand = tubeSweepMesh([[-0.18, 0, -0.05, 0.016], [-0.12, 0.22, -0.02, 0.016], [0.12, 0.22, -0.02, 0.016], [0.18, 0, -0.05, 0.016]], 5);
    const rack = tubeSweepMesh([[-0.16, 0.74, -0.5, 0.015], [-0.16, 0.77, -0.82, 0.015], [0.16, 0.77, -0.82, 0.015], [0.16, 0.74, -0.5, 0.015]], 5);
    return mergeRawMeshes([
      transformMesh(wheelRaw, { pos: [0, 0.22, 0.62] }),
      transformMesh(wheelRaw, { pos: [0, 0.22, -0.54] }),
      saddle,
      bars,
      stem,
      stand,
      rack
    ]);
  });

  return { bodySpec, trimSpec };
}

/** Shifts a `lamp` placement `(lx, ly, lz)` in its local frame (`-X` = inland sidewalk, `+Z` = along kerb). */
function offsetFromLamp(
  t: { readonly position: [number, number, number]; readonly rotation: [number, number, number] },
  lx: number,
  ly: number,
  lz: number,
  yawOffset = 0
): AuraTransformSpec {
  const ry = t.rotation[1];
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return {
    position: [t.position[0] + lx * c + lz * s, t.position[1] + ly, t.position[2] - lx * s + lz * c],
    rotation: [0, ry + yawOffset, 0],
    scale: 1
  };
}

/** Bakes a local `RawMesh` into world-space parts for static single-draw `mergeRawMeshes` city/bollard batching. */
function bakeWorldBatch(base: RawMesh, transforms: readonly AuraTransformSpec[]): RawMesh[] {
  return transforms.map((t) => {
    const pos = t.position ?? [0, 0, 0];
    const rot = t.rotation ?? [0, 0, 0];
    const s = typeof t.scale === "number" ? t.scale : 1;
    const scale: V3 = Array.isArray(t.scale) ? [t.scale[0], t.scale[1], t.scale[2]] : [s, s, s];
    return transformMesh(base, { pos: [pos[0], pos[1], pos[2]], rot: [rot[0], rot[1], rot[2]], scale });
  });
}

/** Builds all batched procedural multi-material street furniture, kerb bollards, delivery scooters, trees, landmarks & shopfronts. */
export function buildProceduralPropNodes(
  plan: PropPlacementInput,
  cast = false
): readonly (AuraNodeBuilder<AuraPrimitiveNode> | GroupNodeBuilder)[] {
  const out: (AuraNodeBuilder<AuraPrimitiveNode> | GroupNodeBuilder)[] = [];
  const mats = propSurfaceMaterials();

  const castIronParts: RawMesh[] = [];
  const brassParts: RawMesh[] = [];
  const vermilionParts: RawMesh[] = [];
  const steelParts: RawMesh[] = [];
  const cedarParts: RawMesh[] = [];
  const sodiumParts: RawMesh[] = [];

  // 1. Street Lamps (5.0 m tall, instanced mast + merged brass/bulb accents — zero shadow-caster bloat)
  const lamps = plan.placements.get("lamp") ?? [];
  if (lamps.length > 0) {
    const tr = toMetreTransforms(lamps, 5.0);
    const { iron, brass, bulb } = buildStreetLampMeshes();
    const lampIronSpec = memoizeGeometry("drift:prop-lamp-iron", () => mergeRawMeshes([iron]));
    out.push(
      instances.custom(lampIronSpec, {
        name: "model-lamp-masts",
        transforms: tr,
        material: mats.castIron,
        castShadow: false,
        receiveShadow: true
      })
    );
    brassParts.push(...bakeWorldBatch(brass, tr));
    sodiumParts.push(...bakeWorldBatch(bulb, tr));
  }

  // 2. Traffic Signals + Sculpted Mediterranean Street-Corner Kerb Bollards
  const signals = plan.placements.get("signal") ?? [];
  if (signals.length > 0) {
    const tr = toMetreTransforms(signals, 4.2);
    const sig = buildTrafficSignalMeshes();
    const sigFrameSpec = memoizeGeometry("drift:prop-signal-frame", () => mergeRawMeshes([sig.frame]));
    out.push(
      instances.custom(sigFrameSpec, {
        name: "model-signal-masts",
        transforms: tr,
        material: mats.castIron,
        castShadow: false,
        receiveShadow: true
      })
    );
    brassParts.push(...bakeWorldBatch(sig.brass, tr));

    const rLens = bakeWorldBatch(sig.redLens, tr);
    const yLens = bakeWorldBatch(sig.amberLens, tr);
    const gLens = bakeWorldBatch(sig.greenLens, tr);
    out.push(
      assembleMultiMaterialNode(
        "city-signal-optics",
        [
          { materialIndex: 0, mesh: joinRawMeshes(rLens) },
          { materialIndex: 1, mesh: joinRawMeshes(yLens) },
          { materialIndex: 2, mesh: joinRawMeshes(gLens) }
        ],
        [mats.signalRed, mats.signalAmber, mats.signalGreen],
        { castShadow: false, receiveShadow: false }
      )
    );

    // Sculpted cast-iron street-corner bollards flanking sidewalk kerbs outside every crossing
    const bollardIron = latheMesh([[0.15, 0], [0.14, 0.09], [0.105, 0.14], [0.11, 0.68], [0.135, 0.72], [0.105, 0.82], [0, 0.87]], 10);
    const bollardBrass = latheMesh([[0.112, 0.58], [0.126, 0.6], [0.126, 0.65], [0.112, 0.67]], 10);
    const bollardTr: AuraTransformSpec[] = [];
    for (const s of signals) {
      const yaw = s.rotation[1];
      const sx = -Math.sin(yaw) >= 0 ? 1 : -1;
      const sz = -Math.cos(yaw) >= 0 ? 1 : -1;
      bollardTr.push(
        { position: [s.position[0] + sx * 1.65, s.position[1], s.position[2]], rotation: [0, 0, 0], scale: 1 },
        { position: [s.position[0], s.position[1], s.position[2] + sz * 1.65], rotation: [0, 0, 0], scale: 1 }
      );
    }
    castIronParts.push(...bakeWorldBatch(bollardIron, bollardTr));
    brassParts.push(...bakeWorldBatch(bollardBrass, bollardTr));
  }

  // 3. Broadleaf Street & Park Trees (4.6 m ref, instanced trunk + smooth `layeredCanopyMesh` crown)
  const trees = plan.placements.get("tree") ?? [];
  if (trees.length > 0) {
    const tr = toMetreTransforms(trees, 4.6);
    const { trunk, canopy } = buildStreetTreeMeshes();
    const treeTrunkSpec = memoizeGeometry("drift:prop-tree-trunk", () => mergeRawMeshes([trunk]));
    const treeCanopySpec = memoizeGeometry("drift:prop-tree-canopy", () => mergeRawMeshes([canopy]));
    const leafPalette = ["#5fa343", "#6fb44c", "#52913a", "#7bc056", "#5c9e4c"];
    const colors = trees.map((_, i) => leafPalette[i % leafPalette.length]!);
    out.push(
      instances.custom(treeTrunkSpec, {
        name: "model-tree-trunks",
        transforms: tr,
        material: mats.bark,
        castShadow: false,
        receiveShadow: true
      }),
      instances.custom(treeCanopySpec, {
        name: "model-tree",
        transforms: tr,
        colors,
        material: mats.foliageTintable,
        castShadow: false,
        receiveShadow: true
      })
    );
  }

  // 4. Coastal Date Palms (7.5 m ref, instanced curved trunk + smooth arched pinnate fronds)
  const palms = plan.placements.get("palm") ?? [];
  if (palms.length > 0) {
    const tr = toMetreTransforms(palms, 7.5);
    const { trunk, fronds } = buildDatePalmMeshes();
    const palmTrunkSpec = memoizeGeometry("drift:prop-palm-trunk", () => mergeRawMeshes([trunk]));
    const palmFrondsSpec = memoizeGeometry("drift:prop-palm-fronds", () => mergeRawMeshes([fronds]));
    const palmColors = palms.map((_, i) => (i % 2 === 0 ? "#66a844" : "#76b850"));
    out.push(
      instances.custom(palmTrunkSpec, {
        name: "model-palm-trunks",
        transforms: tr,
        material: mats.bark,
        castShadow: false,
        receiveShadow: true
      }),
      instances.custom(palmFrondsSpec, {
        name: "model-palm",
        transforms: tr,
        colors: palmColors,
        material: mats.foliageTintable,
        castShadow: false,
        receiveShadow: true
      })
    );
  }

  // 5. Transit Bus Shelters (4.2 m x 1.3 m, grounded steel frame, cedar bench, route-map lightbox & safety glass)
  const shelters = plan.placements.get("shelter") ?? [];
  if (shelters.length > 0) {
    const tr = toMetreTransforms(shelters, 4.2);
    const { steelFrame, cedarBench, mapGlow, glass } = buildTransitShelterMeshes();
    steelParts.push(...bakeWorldBatch(steelFrame, tr));
    cedarParts.push(...bakeWorldBatch(cedarBench, tr));
    sodiumParts.push(...bakeWorldBatch(mapGlow, tr));
    out.push(
      geometry.custom(mergeRawMeshes(bakeWorldBatch(glass, tr)), {
        name: "city-shelter-glass-batch",
        material: courierGlazingMaterial(),
        castShadow: false,
        receiveShadow: false
      })
    );
  }

  // 6. Fire Hydrants (0.8 m tall, merged into static cast-iron, vermilion & brass batches)
  const hydrants = plan.placements.get("hydrant") ?? [];
  if (hydrants.length > 0) {
    const tr = toMetreTransforms(hydrants, 0.8);
    const { body, ironBase, brassCaps } = buildFireHydrantMeshes();
    castIronParts.push(...bakeWorldBatch(ironBase, tr));
    vermilionParts.push(...bakeWorldBatch(body, tr));
    brassParts.push(...bakeWorldBatch(brassCaps, tr));
  }

  // 7. Rooftop Cedar Water Towers (`latticeTrussMesh` + 3 distinct iron hoops + cedar barrel) & Twin-Fan Rooftop HVAC Units
  const tanks = plan.placements.get("watertank") ?? [];
  if (tanks.length > 0) {
    const tr = toMetreTransforms(tanks, 3.4);
    const { ironTrestleAndHoops, cedarBarrel } = buildWatertankMeshes();
    const hvacTransforms: AuraTransformSpec[] = tanks.map((t) => {
      const c = Math.cos(t.rotation[1]), s = Math.sin(t.rotation[1]);
      return {
        position: [t.position[0] - 1.85 * c + 1.25 * s, t.position[1], t.position[2] + 1.85 * s + 1.25 * c],
        rotation: [0, t.rotation[1], 0],
        scale: 1
      };
    });
    const hvacRaw = joinRawMeshes([
      transformMesh(bevelBoxMesh(1.65, 0.92, 0.96, 0.04), { pos: [0, 0.46, 0] }),
      transformMesh(latheMesh([[0.28, 0.92], [0.31, 1.08], [0.25, 1.1], [0, 0.96]], 12), { pos: [-0.42, 0, 0] }),
      transformMesh(latheMesh([[0.28, 0.92], [0.31, 1.08], [0.25, 1.1], [0, 0.96]], 12), { pos: [0.42, 0, 0] }),
      tubeSweepMesh([[0.82, 0.35, 0, 0.045], [1.18, 0.35, 0, 0.045], [1.18, 0.04, 0, 0.045]], 6)
    ]);
    castIronParts.push(...bakeWorldBatch(ironTrestleAndHoops, tr));
    cedarParts.push(...bakeWorldBatch(cedarBarrel, tr));
    steelParts.push(...bakeWorldBatch(hvacRaw, hvacTransforms));
  }

  // 8. Harbor Landmarks (`clocktower` & `lighthouse` — key skyline shadow casters)
  const clock = plan.placements.get("clocktower")?.[0];
  if (clock) out.push(buildClocktowerLandmarkNode(clock, cast));
  const lighthouse = plan.placements.get("lighthouse")?.[0];
  if (lighthouse) out.push(buildLighthouseLandmarkNode(lighthouse, cast));

  // 9. Deterministic Sidewalk Postboxes, Newspaper Stands, Cafe Umbrellas, Curbside Delivery Scooters & Shopfront Awnings
  if (lamps.length > 0) {
    const postboxTr: AuraTransformSpec[] = [];
    const newsstandTr: AuraTransformSpec[] = [];
    const cafeTr: AuraTransformSpec[] = [];
    const awningTr: AuraTransformSpec[] = [];
    const scooterTr: AuraTransformSpec[] = [];
    lamps.forEach((t, idx) => {
      if (idx % 7 === 2) postboxTr.push(offsetFromLamp(t, -0.78, 0, 2.55, Math.PI * 0.5));
      if (idx % 9 === 4) newsstandTr.push(offsetFromLamp(t, -0.92, 0, -2.75, 0));
      if (idx % 11 === 5) cafeTr.push(offsetFromLamp(t, -1.42, 0, 3.65, 0));
      if (idx % 5 === 1) awningTr.push(offsetFromLamp(t, -2.05, 3.28, 0, 0));
      if (idx % 13 === 3) scooterTr.push(offsetFromLamp(t, -0.82, 0, -1.9, 0.32));
    });
    if (postboxTr.length > 0) {
      const boxRaw = latheMesh([[0.22, 0], [0.2, 0.14], [0.19, 0.98], [0.22, 1.02], [0.17, 1.18], [0, 1.24]], 12);
      vermilionParts.push(...bakeWorldBatch(boxRaw, postboxTr));
    }
    if (newsstandTr.length > 0) {
      const standSpec = memoizeGeometry("drift:prop-newsstand", () =>
        mergeRawMeshes([
          transformMesh(bevelBoxMesh(0.56, 0.88, 0.48, 0.03), { pos: [0, 0.44, 0] }),
          transformMesh(latheMesh([[0, 0.88], [0.3, 0.92], [0.26, 1.06], [0, 1.1]], 10, false), { scale: [0.95, 1, 0.85] })
        ])
      );
      out.push(
        instances.custom(standSpec, {
          name: "street-newsstands",
          transforms: newsstandTr,
          colors: newsstandTr.map((_, i) => (i % 2 === 0 ? "#2c7da0" : "#e09f3e")),
          material: mats.foliageTintable,
          castShadow: false,
          receiveShadow: true
        })
      );
    }
    if (cafeTr.length > 0) {
      const umbCanopy = memoizeGeometry("drift:prop-cafe-umbrella", () =>
        mergeRawMeshes([latheMesh([[0.04, 2.38], [0.58, 2.24], [1.22, 1.94], [1.26, 1.84], [1.14, 1.86]], 12, false)])
      );
      const umbTable = joinRawMeshes([
        tubeSweepMesh([[0, 0, 0, 0.04], [0, 2.36, 0, 0.03]], 6),
        latheMesh([[0.32, 0], [0.08, 0.06], [0.06, 0.72], [0.56, 0.74], [0.56, 0.78], [0, 0.78]], 10)
      ]);
      castIronParts.push(...bakeWorldBatch(umbTable, cafeTr));
      out.push(
        instances.custom(umbCanopy, {
          name: "street-cafe-umbrellas",
          transforms: cafeTr,
          colors: cafeTr.map((_, i) => (i % 2 === 0 ? "#e76f51" : "#f4e6cc")),
          material: mats.foliageTintable,
          castShadow: false,
          receiveShadow: true
        })
      );
    }
    if (scooterTr.length > 0) {
      const { bodySpec, trimSpec } = buildDeliveryScooterSpecs();
      const scooterColors = scooterTr.map((_, i) => ["#ff9b3d", "#22c3c9", "#f2eadc", "#e76f51"][i % 4]!);
      out.push(
        instances.custom(bodySpec, {
          name: "street-delivery-scooters-body",
          transforms: scooterTr,
          colors: scooterColors,
          material: mats.foliageTintable,
          castShadow: false,
          receiveShadow: true
        }),
        instances.custom(trimSpec, {
          name: "street-delivery-scooters-trim",
          transforms: scooterTr,
          material: mats.castIron,
          castShadow: false,
          receiveShadow: true
        })
      );
    }
    if (awningTr.length > 0) {
      const corniceSpec = memoizeGeometry("drift:prop-shopfront-awning", () =>
        mergeRawMeshes([
          transformMesh(bevelBoxMesh(0.38, 0.28, 3.6, 0.04), { pos: [-0.18, 0.42, 0] }),
          loftSectionsMesh(
            [-1.72, 0, 1.72].map((z) => [
              [-0.12, 0.28, z], [0.02, 0.32, z], [0.96, -0.14, z], [0.96, -0.26, z], [-0.12, 0.16, z]
            ]),
            true,
            false
          )
        ])
      );
      out.push(
        instances.custom(corniceSpec, {
          name: "shopfront-cornice-awnings",
          transforms: awningTr,
          colors: awningTr.map((_, i) => ["#d96b52", "#78b7a6", "#e8c47c"][i % 3]!),
          material: mats.creamStone,
          castShadow: false,
          receiveShadow: true
        })
      );
    }
  }

  // 10. Flush static world-space merged material batches (small street props stay castShadow: false)
  if (castIronParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(castIronParts), { name: "city-cast-iron-batch", material: mats.castIron, castShadow: false, receiveShadow: true }));
  }
  if (brassParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(brassParts), { name: "city-brass-accents-batch", material: mats.brass, castShadow: false, receiveShadow: true }));
  }
  if (vermilionParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(vermilionParts), { name: "city-vermilion-batch", material: mats.vermilion, castShadow: false, receiveShadow: true }));
  }
  if (steelParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(steelParts), { name: "city-steel-batch", material: mats.brushedSteel, castShadow: false, receiveShadow: true }));
  }
  if (cedarParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(cedarParts), { name: "city-watertank-cedar-batch", material: mats.cedarWood, castShadow: false, receiveShadow: true }));
  }
  if (sodiumParts.length > 0) {
    out.push(geometry.custom(mergeRawMeshes(sodiumParts), { name: "city-warm-practical-batch", material: mats.sodiumBulb, castShadow: false, receiveShadow: false }));
  }

  return out;
}

/* ------------------------------------------------------------------ 5. Standalone Procedural Model Registry Helpers */

export type ProceduralAssetKey =
  | "courier"
  | "sedan"
  | "hatch"
  | "van"
  | "truck"
  | "lamp"
  | "signal"
  | "tree"
  | "palm"
  | "shelter"
  | "hydrant"
  | "clocktower"
  | "lighthouse"
  | "watertank";

export const PROCEDURAL_MODEL_TARGET_METRES: Readonly<Record<ProceduralAssetKey, number>> = {
  courier: 4.4,
  sedan: 4.5,
  hatch: 3.7,
  van: 4.7,
  truck: 6.0,
  lamp: 5.0,
  signal: 4.2,
  tree: 4.6,
  palm: 7.5,
  shelter: 4.2,
  hydrant: 0.8,
  clocktower: 38.0,
  lighthouse: 24.0,
  watertank: 3.4
};

export interface ProceduralModelAssembly {
  readonly key: ProceduralAssetKey;
  readonly targetMetres: number;
  readonly slots: readonly MultiMatSlot[];
  readonly materials: readonly AuraMaterialSpec[];
}

function specToRawMesh(spec: AuraCustomGeometrySpec): RawMesh {
  return {
    positions: Array.from(spec.positions as ArrayLike<number>),
    normals: Array.from((spec.normals ?? []) as ArrayLike<number>),
    uvs: Array.from((spec.uvs ?? []) as ArrayLike<number>),
    indices: Array.from((spec.indices ?? []) as ArrayLike<number>)
  };
}

/**
 * Builds the complete grounded (`minY = 0`), multi-material `@aura3d/engine` procedural assembly
 * for any Harbor Drift vehicle, street prop, or harbor landmark.
 */
export function buildProceduralModelAssembly(key: ProceduralAssetKey): ProceduralModelAssembly {
  const targetMetres = PROCEDURAL_MODEL_TARGET_METRES[key];

  if (key === "courier") {
    const bodySlots = buildHeroCourierBodySlots();
    const wheelSlots: MultiMatSlot[] = [];
    for (const w of HERO_COURIER_WHEEL_POSES) {
      for (const s of buildHeroCourierWheelSlots(w.side)) {
        wheelSlots.push({
          materialIndex: s.materialIndex,
          mesh: transformMesh(s.mesh, { pos: [w.ox, w.oy, w.oz] })
        });
      }
    }
    const baseMaterials = heroCourierMaterials();
    return {
      key,
      targetMetres,
      slots: [
        ...bodySlots,
        ...wheelSlots,
        { materialIndex: baseMaterials.length, mesh: specToRawMesh(buildHeroCourierGlazingSpec()) }
      ],
      materials: [...baseMaterials, courierGlazingMaterial()]
    };
  }

  if (key === "sedan" || key === "hatch" || key === "van" || key === "truck") {
    const specs = buildTrafficClassSpecs(key);
    const fleetMats = trafficFleetMaterials();
    const bodyTint: Record<typeof key, string> = {
      sedan: "#f08c4b",
      hatch: "#78c8b6",
      van: "#f2e6cf",
      truck: "#3878a8"
    };
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: specToRawMesh(specs.body) },
        { materialIndex: 1, mesh: specToRawMesh(specs.glass) },
        { materialIndex: 2, mesh: specToRawMesh(specs.rubber) },
        { materialIndex: 3, mesh: specToRawMesh(specs.trim) },
        { materialIndex: 4, mesh: specToRawMesh(specs.headGlow) },
        { materialIndex: 5, mesh: specToRawMesh(specs.tailGlow) }
      ],
      materials: [
        unnamed(material.carPaint({ color: bodyTint[key], roughness: 0.2, metallic: 0.16, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 1.42 })),
        fleetMats.glass,
        fleetMats.rubber,
        fleetMats.trim,
        fleetMats.head,
        fleetMats.tail
      ]
    };
  }

  if (key === "clocktower") {
    const { slots, materials } = buildClocktowerAssembly();
    return { key, targetMetres, slots, materials };
  }

  if (key === "lighthouse") {
    const { slots, materials } = buildLighthouseAssembly();
    return { key, targetMetres, slots, materials };
  }

  const mats = propSurfaceMaterials();
  if (key === "lamp") {
    const { iron, brass, bulb } = buildStreetLampMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: iron },
        { materialIndex: 1, mesh: brass },
        { materialIndex: 2, mesh: bulb }
      ],
      materials: [mats.castIron, mats.brass, mats.sodiumBulb]
    };
  }

  if (key === "signal") {
    const sig = buildTrafficSignalMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: sig.frame },
        { materialIndex: 1, mesh: sig.brass },
        { materialIndex: 2, mesh: sig.redLens },
        { materialIndex: 3, mesh: sig.amberLens },
        { materialIndex: 4, mesh: sig.greenLens }
      ],
      materials: [mats.castIron, mats.brass, mats.signalRed, mats.signalAmber, mats.signalGreen]
    };
  }

  if (key === "tree") {
    const { trunk, canopy } = buildStreetTreeMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: trunk },
        { materialIndex: 1, mesh: canopy }
      ],
      materials: [mats.bark, mats.foliage]
    };
  }

  if (key === "palm") {
    const { trunk, fronds } = buildDatePalmMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: trunk },
        { materialIndex: 1, mesh: fronds }
      ],
      materials: [mats.bark, mats.foliage]
    };
  }

  if (key === "shelter") {
    const { steelFrame, cedarBench, mapGlow, glass } = buildTransitShelterMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: steelFrame },
        { materialIndex: 1, mesh: cedarBench },
        { materialIndex: 2, mesh: mapGlow },
        { materialIndex: 3, mesh: glass }
      ],
      materials: [mats.brushedSteel, mats.cedarWood, mats.sodiumBulb, courierGlazingMaterial()]
    };
  }

  if (key === "hydrant") {
    const { body, ironBase, brassCaps } = buildFireHydrantMeshes();
    return {
      key,
      targetMetres,
      slots: [
        { materialIndex: 0, mesh: ironBase },
        { materialIndex: 1, mesh: body },
        { materialIndex: 2, mesh: brassCaps }
      ],
      materials: [mats.castIron, mats.vermilion, mats.brass]
    };
  }

  const { ironTrestleAndHoops, cedarBarrel } = buildWatertankMeshes();
  return {
    key: "watertank",
    targetMetres,
    slots: [
      { materialIndex: 0, mesh: ironTrestleAndHoops },
      { materialIndex: 1, mesh: cedarBarrel }
    ],
    materials: [mats.castIron, mats.cedarWood]
  };
}
