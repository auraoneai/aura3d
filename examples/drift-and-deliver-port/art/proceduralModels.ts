/**
 * WP-22 — Gridlock Courier (`drift-and-deliver-port`) Procedural Multi-Material 3D Art Kit.
 *
 * Replaces all 14 static single-mesh Meshy clay GLBs with sculpted multi-material vehicles,
 * 6-class city traffic fleet, harbor landmarks, downtown cornice/awning shopfront accents,
 * street furniture, and a glowing drop-off parcel locker kiosk built exclusively from
 * `apps/showcase-port-shared/proceduralKernel.ts` and `@aura3d/engine` physical surface presets.
 *
 * Coordinate & simulation parity contract:
 * - Vehicle local frame: `+Z` forward, `-Z` rear (facing chase camera), `+X` right, `+Y` up, `minY = 0`.
 * - Hero Drift Courier matches `FOOTPRINT = { halfW: 0.9954, halfD: 2.142 }` (`w ~ 1.94 m, l ~ 4.26 m`).
 * - Instanced batches (`>16`) strictly use `material.pbr` or `material.metal` with `clearcoat: 0, sheen: 0`.
 * - Glazing uses `material.physical({ color: "#cde6f5", roughness: 0.04, opacity: 0.42, clearcoat: 1, ior: 1.5 })`
 *   with `castShadow: false`. Zero `three` imports.
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
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  toFlatShaded,
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
      color: "#cde6f5",
      roughness: 0.04,
      opacity: 0.42,
      clearcoat: 1,
      ior: 1.5,
      envMapIntensity: 1.55
    })
  );
}

/** Multi-material physical preset palette for the Hero Drift Courier Kei-Van / Hot-Hatch. */
export function heroCourierMaterials(): readonly AuraMaterialSpec[] {
  return [
    // 0: Signature courier-teal widebody metallic clearcoat
    unnamed(material.clearcoatPaint({ color: "#22c3c9", roughness: 0.08, metallic: 0.18, clearcoat: 1, clearcoatRoughness: 0.028, envMapIntensity: 1.58 })),
    // 1: Harbor-cream two-tone roof cap, hood stripe & Kammback wing
    unnamed(material.carPaint({ color: "#efe3cf", roughness: 0.2, metallic: 0.08, clearcoat: 0.92, clearcoatRoughness: 0.04, envMapIntensity: 1.36 })),
    // 2: Anisotropic brushed alloy roof rack, splitter rods & grille surround
    unnamed(material.brushedMetal({ color: "#cfd9e4", roughness: 0.24, anisotropy: 0.86, envMapIntensity: 1.55 })),
    // 3: Mirror chrome twin JDM exhaust tips & emblem trim
    unnamed(material.chrome({ color: "#f5f9fd", roughness: 0.035, envMapIntensity: 1.92 })),
    // 4: Matte aero carbon / vulcanized rubber splitter, diffuser, overfender trim & mudflaps
    unnamed(material.blackRubber({ color: "#171a20", roughness: 0.88 })),
    // 5: Insulated thermal courier cargo box shell (warm dispatch amber-orange lacquer)
    unnamed(material.lacquer({ color: "#ff9b3d", roughness: 0.25, clearcoat: 0.88, clearcoatRoughness: 0.045, envMapIntensity: 1.28 })),
    // 6: Heavy woven canvas thermal bag gussets & tie-down webbing straps
    unnamed(material.fabric({ color: "#22303c", roughness: 0.88, sheen: 0.36 })),
    // 7: Glazed ceramic JDM rear & front license plate blank
    unnamed(material.ceramic({ color: "#f6efe0", roughness: 0.22 })),
    // 8: Twin projector headlamps (+Z forward)
    unnamed(material.emissive({ color: "#f4f9ff", emissive: "#dcebff", emissiveIntensity: 2.15, practical: true })),
    // 9: Recessed amber fog lamps & corner indicators (+Z forward)
    unnamed(material.emissive({ color: "#ffd06b", emissive: "#ffa726", emissiveIntensity: 1.85, practical: true })),
    // 10: Full-width JDM glowing LED rear tail-light bar (-Z toward chase camera)
    unnamed(material.emissive({ color: "#ff3b30", emissive: "#ff2216", emissiveIntensity: 2.35, practical: true })),
    // 11: Roof dispatch beacon dome (courier teal-amber pulse)
    unnamed(material.emissive({ color: "#5ef4f8", emissive: "#22c3c9", emissiveIntensity: 2.45, practical: true }))
  ];
}

/** Multi-material physical preset palette for each 4-part independent Hero Courier wheel. */
export function heroWheelMaterials(): readonly AuraMaterialSpec[] {
  return [
    // 0: Treaded vulcanized tire rubber
    unnamed(material.blackRubber({ color: "#14171c", roughness: 0.92 })),
    // 1: Deep-dish forged anisotropic alloy rim & 6-spoke star
    unnamed(material.brushedMetal({ color: "#dce4ee", roughness: 0.2, anisotropy: 0.88, envMapIntensity: 1.65 })),
    // 2: Slotted steel brake rotor & courier-teal performance caliper
    unnamed(material.studioMetal({ color: "#6f7a86", roughness: 0.32, metallic: 0.92 })),
    // 3: Center locknut & chrome courier hubcap medallion
    unnamed(material.chrome({ color: "#22c3c9", roughness: 0.08, envMapIntensity: 1.75 }))
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
 * Generates a 12-point rounded automotive cross-section ring at station `z`
 * with underbody sill (`yBot`), flared shoulder (`halfW`, `yBelt`), and tumblehome cabin (`cabinHalfW`, `yTop`).
 */
function vehicleSectionRing(
  z: number,
  halfW: number,
  yBot: number,
  yBelt: number,
  cabinHalfW: number,
  yTop: number
): V3[] {
  const sillW = halfW * 0.88;
  const flareW = halfW * 1.03;
  const yFlare = yBot + (yBelt - yBot) * 0.44;
  const yShldr = yBelt + (yTop - yBelt) * 0.18;
  const crownY = yTop + 0.035;
  return [
    [0, yBot, z],
    [sillW, yBot + 0.02, z],
    [flareW, yFlare, z],
    [halfW, yBelt, z],
    [halfW * 0.94, yShldr, z],
    [cabinHalfW, yTop, z],
    [0, crownY, z],
    [-cabinHalfW, yTop, z],
    [-halfW * 0.94, yShldr, z],
    [-halfW, yBelt, z],
    [-flareW, yFlare, z],
    [-sillW, yBot + 0.02, z]
  ];
}

/**
 * Sculpted smooth-normal widebody overfender flare arch (`loftSectionsMesh` along an 8-station wheel-arch curve)
 * protruding cleanly from `side * baseHalfW` by `side * flareOut`.
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
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = Math.PI * (0.06 + t * 0.88);
    const cz = wheelZ + Math.cos(ang) * archRadius;
    const cy = yCenter + Math.sin(ang) * archRadius * 0.92;
    const pinch = Math.sin(t * Math.PI);
    const outX = side * (baseHalfW + flareOut * (0.35 + 0.65 * pinch));
    const inX = side * (baseHalfW - 0.05);
    const lipR = 0.055 + 0.035 * pinch;
    const nY = Math.sin(ang);
    const nZ = Math.cos(ang);
    sections.push([
      [inX, cy - nY * 0.04, cz - nZ * 0.04],
      [outX, cy - nY * 0.02, cz - nZ * 0.02],
      [outX + side * 0.015, cy + nY * lipR, cz + nZ * lipR],
      [inX, cy + nY * (lipR + 0.05), cz + nZ * (lipR + 0.05)]
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

  // Slot 0: Smooth-normal lofted widebody kei-van / hot-hatch fuselage (+Z nose, Kammback -Z tail)
  const hullStations: readonly [number, number, number, number, number, number][] = [
    [-2.12, 0.78, 0.28, 0.92, 0.68, 1.38],
    [-1.98, 0.88, 0.22, 0.96, 0.74, 1.54],
    [-1.32, 0.92, 0.19, 0.98, 0.78, 1.58],
    [-0.25, 0.93, 0.18, 0.98, 0.79, 1.59],
    [0.68, 0.92, 0.18, 0.96, 0.77, 1.56],
    [1.28, 0.9, 0.19, 0.92, 0.78, 1.02],
    [1.82, 0.86, 0.2, 0.84, 0.76, 0.92],
    [2.08, 0.76, 0.23, 0.74, 0.66, 0.8]
  ];
  push(
    0,
    loftSectionsMesh(
      hullStations.map(([z, hw, yBot, yBelt, cabW, yTop]) => vehicleSectionRing(z, hw, yBot, yBelt, cabW, yTop)),
      true,
      false
    )
  );

  // Sculpted bolt-on widebody fender flares over all 4 wheel arches (smooth lofted curves)
  for (const side of [-1, 1] as const) {
    push(0, buildWidebodyFenderFlare(side, 1.34, 0.86, 0.115, 0.43, 0.36));
    push(0, buildWidebodyFenderFlare(side, -1.32, 0.88, 0.12, 0.44, 0.36));
    // Sculpted side rocker skirts & aerodynamic door mirrors (+Z swept stalks)
    push(4, transformMesh(bevelBoxMesh(0.09, 0.1, 1.78, 0.02), { pos: [side * 0.93, 0.19, 0.02] }));
    push(
      2,
      tubeSweepMesh(
        [
          [side * 0.82, 0.98, 0.92, 0.022],
          [side * 0.96, 1.05, 0.88, 0.018]
        ],
        6
      )
    );
    push(0, transformMesh(icosphereFacetMesh(0.075, 1, 0, 3), { pos: [side * 0.99, 1.06, 0.86], scale: [0.95, 0.68, 1.32] }));
    // Rally mudflaps behind each wheel arch grounding down to y = 0.02
    push(4, transformMesh(bevelBoxMesh(0.22, 0.22, 0.025, 0.005), { pos: [side * 0.85, 0.13, 0.88] }));
    push(4, transformMesh(bevelBoxMesh(0.23, 0.22, 0.025, 0.005), { pos: [side * 0.86, 0.13, -1.78] }));
  }

  // Slot 1: Harbor-cream two-tone roof cap, hood rally stripe & Kammback rear roof spoiler wing
  const roofCapSections: V3[][] = [-1.86, -1.0, 0.0, 0.72].map((z) => [
    [-0.74, 1.58, z],
    [0.74, 1.58, z],
    [0.64, 1.64, z],
    [0, 1.66, z],
    [-0.64, 1.64, z]
  ]);
  push(1, loftSectionsMesh(roofCapSections, true, false));
  push(1, transformMesh(bevelBoxMesh(0.46, 0.025, 0.86, 0.008), { pos: [0, 0.91, 1.56], rot: [0.16, 0, 0] }));
  const wingFoil = bezierCurve2([0, 0], [0.12, 0.05], [0.24, 0.04], [0.32, -0.02], 6);
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
    push(2, tubeSweepMesh([[side * 0.46, 0.18, 2.16, 0.012], [side * 0.44, 0.34, 2.07, 0.012]], 6));
    // Lathed twin projector headlamps (+Z)
    push(2, transformMesh(latheMesh([[0, 0], [0.145, 0.01], [0.15, 0.06], [0.12, 0.09], [0, 0.095]], 16), { pos: [side * 0.62, 0.68, 2.03], rot: [Math.PI * 0.5, 0, 0] }));
    push(8, transformMesh(latheMesh([[0, 0], [0.115, 0.02], [0.095, 0.055], [0, 0.065]], 14), { pos: [side * 0.62, 0.68, 2.06], rot: [Math.PI * 0.5, 0, 0] }));
    // Recessed amber fog lamps (+Z lower bumper)
    push(4, transformMesh(latheMesh([[0, 0], [0.085, 0.01], [0.085, 0.05], [0, 0.055]], 12), { pos: [side * 0.68, 0.33, 2.06], rot: [Math.PI * 0.5, 0, 0] }));
    push(9, transformMesh(latheMesh([[0, 0], [0.068, 0.015], [0.052, 0.045], [0, 0.05]], 12), { pos: [side * 0.68, 0.33, 2.085], rot: [Math.PI * 0.5, 0, 0] }));
  }

  // Rear (-Z, facing chase camera): JDM full-width tail-light bar, diffuser fins, twin chrome exhausts & license plate
  push(4, transformMesh(bevelBoxMesh(1.66, 0.18, 0.07, 0.018), { pos: [0, 0.94, -2.1] }));
  push(10, transformMesh(bevelBoxMesh(1.58, 0.105, 0.065, 0.015), { pos: [0, 0.95, -2.13] }));
  for (const side of [-1, 1] as const) {
    push(9, transformMesh(bevelBoxMesh(0.22, 0.055, 0.068, 0.01), { pos: [side * 0.66, 0.87, -2.125] }));
  }
  // Sculpted rear bumper & 5-strake aero diffuser
  push(4, transformMesh(bevelBoxMesh(1.72, 0.22, 0.14, 0.03), { pos: [0, 0.28, -2.08] }));
  for (const fx of [-0.52, -0.26, 0, 0.26, 0.52]) {
    push(4, transformMesh(bevelBoxMesh(0.03, 0.16, 0.22, 0.006), { pos: [fx, 0.22, -2.09] }));
  }
  // Twin angled mirror-chrome JDM exhaust tips (-Z right/left)
  for (const ex of [0.46, 0.63]) {
    push(
      3,
      transformMesh(
        latheMesh([[0.038, 0], [0.062, 0.02], [0.064, 0.22], [0.056, 0.24], [0.042, 0.22], [0, 0.04]], 16),
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
    4,
    true
  );
  const rackSpine: V4[] = [...rackLoop, rackLoop[0]!].map(([x, y, z]) => [x, y, z, 0.022]);
  push(2, tubeSweepMesh(rackSpine, 7));
  for (const rz of [-1.36, -0.92, -0.48, -0.04, 0.28]) {
    push(2, tubeSweepMesh([[-0.63, 1.69, rz, 0.016], [0.63, 1.69, rz, 0.016]], 6));
  }
  for (const side of [-1, 1] as const) {
    for (const fz of [-1.34, -0.48, 0.26]) {
      push(4, transformMesh(bevelBoxMesh(0.05, 0.09, 0.08, 0.01), { pos: [side * 0.62, 1.65, fz] }));
    }
  }
  // Strapped insulated courier thermal delivery box on roof rack
  push(5, transformMesh(bevelBoxMesh(0.88, 0.42, 0.96, 0.055), { pos: [0, 1.92, -0.72] }));
  push(1, transformMesh(bevelBoxMesh(0.92, 0.09, 1.0, 0.03), { pos: [0, 2.15, -0.72] }));
  push(0, transformMesh(bevelBoxMesh(0.9, 0.1, 0.98, 0.02), { pos: [0, 1.94, -0.72] }));
  for (const sz of [-1.0, -0.44]) {
    push(6, transformMesh(bevelBoxMesh(0.94, 0.49, 0.065, 0.012), { pos: [0, 1.95, sz] }));
    for (const side of [-1, 1] as const) {
      push(2, transformMesh(bevelBoxMesh(0.035, 0.07, 0.08, 0.008), { pos: [side * 0.48, 1.82, sz] }));
    }
  }
  // Front-of-rack glowing courier dispatch beacon dome
  push(4, transformMesh(latheMesh([[0, 0], [0.13, 0], [0.12, 0.045], [0, 0.05]], 14), { pos: [0, 1.71, 0.24] }));
  push(11, transformMesh(latheMesh([[0, 0], [0.105, 0.01], [0.095, 0.11], [0.05, 0.15], [0, 0.16]], 16), { pos: [0, 1.75, 0.24] }));

  cachedHeroBodySlots = slots;
  return slots;
}

/** Builds wraparound tinted windshield (+Z), side windows (+/-X), and rear hatch window (-Z). */
export function buildHeroCourierGlazingSpec(): AuraCustomGeometrySpec {
  if (cachedHeroGlazingSpec) return cachedHeroGlazingSpec;
  const parts: RawMesh[] = [];
  // Raked wraparound front windshield (+Z)
  parts.push(
    loftSectionsMesh(
      [
        [[-0.75, 0.98, 1.24], [0.75, 0.98, 1.24], [0.75, 1.02, 1.21], [-0.75, 1.02, 1.21]],
        [[-0.68, 1.54, 0.68], [0.68, 1.54, 0.68], [0.68, 1.57, 0.65], [-0.68, 1.57, 0.65]]
      ],
      true,
      false
    )
  );
  // Tilted rear Kammback hatch window (-Z)
  parts.push(
    loftSectionsMesh(
      [
        [[-0.68, 1.52, -1.94], [0.68, 1.52, -1.94], [0.68, 1.55, -1.91], [-0.68, 1.55, -1.91]],
        [[-0.74, 1.05, -2.08], [0.74, 1.05, -2.08], [0.74, 1.08, -2.05], [-0.74, 1.08, -2.05]]
      ],
      true,
      false
    )
  );
  // Front cab & rear courier quarter side windows (+/-X)
  for (const side of [-1, 1] as const) {
    parts.push(transformMesh(bevelBoxMesh(0.03, 0.46, 0.96, 0.006), { pos: [side * 0.82, 1.28, 0.22], rot: [0, 0, -side * 0.16] }));
    parts.push(transformMesh(bevelBoxMesh(0.03, 0.44, 1.18, 0.006), { pos: [side * 0.83, 1.29, -1.06], rot: [0, 0, -side * 0.15] }));
  }
  cachedHeroGlazingSpec = mergeRawMeshes(parts);
  return cachedHeroGlazingSpec;
}

function withGroupRotationOrder(base: GroupNodeBuilder, rotationOrder: "YXZ"): GroupNodeBuilder {
  const Ctor = base.constructor as new (
    node: ReturnType<GroupNodeBuilder["toJSON"]> & { readonly rotationOrder?: "YXZ" }
  ) => GroupNodeBuilder;
  return new Ctor({ ...base.toJSON(), rotationOrder });
}

/** Assembles the complete Hero Drift Courier node (`car-rig`) with `castShadow: false` physical glazing. */
export function buildHeroCourierRigNode(
  id: string,
  castShadow: boolean,
  bodyOrder?: "YXZ"
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
  const ordered = bodyOrder ? withGroupRotationOrder(base, bodyOrder) : base;
  return ordered.runtime({ id });
}

/** Builds a 4-part wheel (`tire`, `deep-dish rim`, `rotor + caliper`, `hubcap`) centered on local `X` axle. */
export function buildHeroCourierWheelSlots(side: -1 | 1): readonly MultiMatSlot[] {
  const hit = cachedHeroWheelSlots.get(side);
  if (hit) return hit;
  const slots = [
    ...wheelAssemblySlots({
      radius: HERO_COURIER_WHEEL_RADIUS,
      width: HERO_COURIER_WHEEL_WIDTH,
      spokeCount: 6,
      tireMat: 0,
      rimMat: 1,
      rotorMat: 2
    }),
    {
      materialIndex: 3,
      mesh: transformMesh(
        latheMesh([[0, 0], [0.068, 0.005], [0.058, 0.028], [0.026, 0.042], [0, 0.046]], 14),
        {
          pos: [side * (HERO_COURIER_WHEEL_WIDTH * 0.46), 0, 0],
          rot: [0, 0, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5]
        }
      )
    }
  ];
  cachedHeroWheelSlots.set(side, slots);
  return slots;
}

export function buildHeroCourierWheelNode(
  id: string,
  side: -1 | 1,
  castShadow: boolean
): GroupNodeBuilder {
  const base = assembleMultiMaterialNode(id, buildHeroCourierWheelSlots(side), heroWheelMaterials(), {
    position: [0, -60, 0],
    castShadow,
    receiveShadow: true
  });
  return withGroupRotationOrder(base, "YXZ").runtime({ id });
}
/* ------------------------------------------------------------------ 2. Procedural 6-Class City Traffic Fleet */

export type TrafficFleetKind = "sedan" | "hatch" | "van" | "taxi" | "bus" | "cruiser";

export const TRAFFIC_FLEET_KINDS: readonly TrafficFleetKind[] = [
  "sedan",
  "hatch",
  "van",
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

interface TrafficClassSpecs {
  readonly body: AuraCustomGeometrySpec;
  readonly glass: AuraCustomGeometrySpec;
  readonly trim: AuraCustomGeometrySpec;
  readonly headGlow: AuraCustomGeometrySpec;
  readonly tailGlow: AuraCustomGeometrySpec;
}

const TRAFFIC_CLASS_PALETTES: Record<TrafficFleetKind, readonly string[]> = {
  sedan: ["#d9765f", "#5e97b8", "#efe3cf", "#4f5b6b", "#9fd8c4", "#c95b48"],
  hatch: ["#8fd4be", "#f2a668", "#f3d579", "#78b3d6", "#e57a64", "#ebe2d0"],
  van: ["#f2eadc", "#e08b67", "#8ec4b4", "#e4b968", "#cad6de"],
  taxi: ["#f2b632", "#eab028", "#f5c242"],
  bus: ["#e8dcc6", "#95c8ba", "#d98468", "#88b4d0"],
  cruiser: ["#f2f4f7", "#e8eef5"]
};

const cachedTrafficSpecs = new Map<TrafficFleetKind, TrafficClassSpecs>();

function buildFleetWheelSet(halfW: number, wheelR: number, zRear: number, zFront: number): RawMesh {
  const wheelRawParts = wheelAssemblySlots({
    radius: wheelR,
    width: 0.21,
    spokeCount: 5,
    tireMat: 0,
    rimMat: 1
  }).map((s) => s.mesh);
  const singleWheel = joinRawMeshes(wheelRawParts);
  const out: RawMesh[] = [];
  for (const wz of [zRear, zFront]) {
    for (const side of [-1, 1] as const) {
      out.push(transformMesh(singleWheel, { pos: [side * (halfW - 0.1), wheelR, wz] }));
    }
  }
  return joinRawMeshes(out);
}

/** Builds smooth-normal coachwork, glass, wheel/bumper trim, and lamp specs for a city traffic class. */
export function buildTrafficClassSpecs(kind: TrafficFleetKind): TrafficClassSpecs {
  const cached = cachedTrafficSpecs.get(kind);
  if (cached) return cached;

  const bodyParts: RawMesh[] = [];
  const glassParts: RawMesh[] = [];
  const trimParts: RawMesh[] = [];
  const headParts: RawMesh[] = [];
  const tailParts: RawMesh[] = [];

  const cfg: {
    readonly w: number;
    readonly l: number;
    readonly wheelR: number;
    readonly stations: readonly [number, number, number, number, number, number][];
    readonly winY: readonly [number, number];
    readonly winZ: readonly [number, number];
  } = (() => {
    switch (kind) {
      case "sedan":
        return {
          w: 1.88, l: 4.46, wheelR: 0.34,
          stations: [
            [-2.22, 0.8, 0.28, 0.88, 0.72, 0.94],
            [-1.72, 0.9, 0.22, 0.92, 0.78, 0.98],
            [-1.18, 0.92, 0.2, 0.94, 0.75, 1.46],
            [0.36, 0.92, 0.2, 0.93, 0.74, 1.46],
            [1.04, 0.9, 0.2, 0.88, 0.76, 0.95],
            [1.88, 0.86, 0.22, 0.8, 0.72, 0.86],
            [2.22, 0.76, 0.26, 0.72, 0.64, 0.76]
          ],
          winY: [0.96, 1.41], winZ: [-1.14, 0.96]
        };
      case "hatch":
        return {
          w: 1.8, l: 3.86, wheelR: 0.33,
          stations: [
            [-1.92, 0.78, 0.26, 0.92, 0.68, 1.42],
            [-1.56, 0.88, 0.2, 0.95, 0.73, 1.48],
            [0.44, 0.89, 0.2, 0.94, 0.72, 1.47],
            [1.08, 0.87, 0.2, 0.88, 0.73, 0.94],
            [1.92, 0.75, 0.24, 0.74, 0.64, 0.78]
          ],
          winY: [0.96, 1.43], winZ: [-1.52, 0.98]
        };
      case "van":
        return {
          w: 1.98, l: 4.86, wheelR: 0.36,
          stations: [
            [-2.42, 0.92, 0.28, 1.12, 0.88, 2.02],
            [-2.15, 0.97, 0.24, 1.14, 0.91, 2.08],
            [1.16, 0.97, 0.24, 1.12, 0.9, 2.06],
            [1.76, 0.94, 0.24, 1.0, 0.82, 1.24],
            [2.42, 0.84, 0.28, 0.84, 0.74, 0.94]
          ],
          winY: [1.14, 1.92], winZ: [0.22, 1.68]
        };
      case "taxi":
        return {
          w: 1.88, l: 4.5, wheelR: 0.34,
          stations: [
            [-2.24, 0.81, 0.28, 0.9, 0.73, 0.96],
            [-1.7, 0.91, 0.22, 0.94, 0.78, 1.0],
            [-1.16, 0.93, 0.2, 0.95, 0.76, 1.48],
            [0.4, 0.93, 0.2, 0.94, 0.75, 1.48],
            [1.08, 0.9, 0.2, 0.88, 0.76, 0.96],
            [2.24, 0.77, 0.26, 0.73, 0.65, 0.78]
          ],
          winY: [0.97, 1.43], winZ: [-1.12, 1.0]
        };
      case "bus":
        return {
          w: 2.16, l: 5.44, wheelR: 0.4,
          stations: [
            [-2.7, 1.02, 0.32, 1.28, 0.99, 2.48],
            [-2.42, 1.07, 0.28, 1.3, 1.03, 2.56],
            [2.22, 1.07, 0.28, 1.28, 1.02, 2.55],
            [2.7, 0.98, 0.32, 1.16, 0.94, 2.38]
          ],
          winY: [1.26, 2.26], winZ: [-2.28, 2.38]
        };
      case "cruiser":
        return {
          w: 1.92, l: 4.6, wheelR: 0.35,
          stations: [
            [-2.28, 0.83, 0.28, 0.91, 0.75, 0.97],
            [-1.72, 0.93, 0.22, 0.95, 0.8, 1.01],
            [-1.16, 0.95, 0.21, 0.96, 0.77, 1.48],
            [0.42, 0.95, 0.21, 0.95, 0.76, 1.48],
            [1.14, 0.92, 0.21, 0.9, 0.78, 0.97],
            [2.28, 0.79, 0.26, 0.76, 0.68, 0.8]
          ],
          winY: [0.98, 1.43], winZ: [-1.12, 1.04]
        };
    }
  })();

  const hw = cfg.w * 0.5;
  const hl = cfg.l * 0.5;

  // Smooth-normal lofted vehicle body shell
  bodyParts.push(
    loftSectionsMesh(
      cfg.stations.map(([z, shw, yb, yBelt, cabW, yTop]) => vehicleSectionRing(z, shw, yb, yBelt, cabW, yTop)),
      true,
      false
    )
  );

  // Class-specific sculpted details
  if (kind === "van") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.12, 0.18, 0.86, 0.04), { pos: [0, 2.18, 0.48] }));
    trimParts.push(transformMesh(bevelBoxMesh(0.05, 1.42, 0.04, 0.008), { pos: [0, 1.24, -hl - 0.01] }));
  } else if (kind === "taxi") {
    trimParts.push(transformMesh(bevelBoxMesh(cfg.w + 0.03, 0.08, 2.5, 0.01), { pos: [0, 0.78, -0.15] }));
    trimParts.push(transformMesh(bevelBoxMesh(0.62, 0.06, 0.26, 0.012), { pos: [0, 1.53, -0.12] }));
    headParts.push(transformMesh(bevelBoxMesh(0.52, 0.16, 0.2, 0.025), { pos: [0, 1.62, -0.12] }));
  } else if (kind === "bus") {
    bodyParts.push(transformMesh(bevelBoxMesh(1.36, 0.2, 1.24, 0.05), { pos: [0, 2.66, -0.68] }));
    bodyParts.push(transformMesh(bevelBoxMesh(1.24, 0.18, 0.96, 0.04), { pos: [0, 2.65, 1.02] }));
    headParts.push(transformMesh(bevelBoxMesh(1.42, 0.22, 0.05, 0.01), { pos: [0, 2.34, hl - 0.02] }));
  } else if (kind === "cruiser") {
    // Contrast navy patrol side doors + tubular front push-bar + dual rooftop lightbar
    trimParts.push(transformMesh(bevelBoxMesh(cfg.w + 0.03, 0.56, 1.54, 0.015), { pos: [0, 0.64, -0.16] }));
    trimParts.push(tubeSweepMesh([[-0.44, 0.26, hl + 0.06, 0.028], [-0.44, 0.68, hl + 0.05, 0.028], [0.44, 0.68, hl + 0.05, 0.028], [0.44, 0.26, hl + 0.06, 0.028]], 6));
    trimParts.push(transformMesh(bevelBoxMesh(1.16, 0.05, 0.22, 0.01), { pos: [0, 1.53, -0.18] }));
    headParts.push(transformMesh(bevelBoxMesh(0.48, 0.11, 0.18, 0.02), { pos: [-0.28, 1.6, -0.18] }));
    tailParts.push(transformMesh(bevelBoxMesh(0.48, 0.11, 0.18, 0.02), { pos: [0.28, 1.6, -0.18] }));
  }

  // Wraparound greenhouse glass (front windshield, rear backlight & side window band)
  const winH = cfg.winY[1] - cfg.winY[0];
  const winMidY = (cfg.winY[0] + cfg.winY[1]) * 0.5;
  const winLen = cfg.winZ[1] - cfg.winZ[0];
  const winMidZ = (cfg.winZ[0] + cfg.winZ[1]) * 0.5;
  glassParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.82, winH, winLen, 0.03), { pos: [0, winMidY, winMidZ] }));
  if (kind === "bus") {
    glassParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.88, 0.86, 0.08, 0.015), { pos: [0, 1.72, hl - 0.03] }));
  }

  // Sculpted 4-wheel assemblies + front/rear bumpers & side mirrors
  trimParts.push(buildFleetWheelSet(hw, cfg.wheelR, -cfg.l * 0.31, cfg.l * 0.31));
  trimParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.94, 0.2, 0.14, 0.025), { pos: [0, 0.3, hl - 0.03] }));
  trimParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.94, 0.21, 0.14, 0.025), { pos: [0, 0.31, -hl + 0.03] }));
  trimParts.push(transformMesh(bevelBoxMesh(cfg.w * 0.58, 0.18, 0.06, 0.012), { pos: [0, 0.5, hl + 0.01] }));
  for (const side of [-1, 1] as const) {
    trimParts.push(transformMesh(bevelBoxMesh(0.12, 0.09, 0.15, 0.018), { pos: [side * (hw + 0.04), cfg.winY[0] + 0.08, cfg.winZ[1] - 0.22] }));
    headParts.push(transformMesh(bevelBoxMesh(0.3, 0.13, 0.06, 0.015), { pos: [side * hw * 0.66, 0.56, hl + 0.01] }));
    tailParts.push(transformMesh(bevelBoxMesh(0.34, 0.13, 0.06, 0.015), { pos: [side * hw * 0.66, 0.62, -hl - 0.01] }));
  }

  const built: TrafficClassSpecs = {
    body: mergeRawMeshes(bodyParts),
    glass: mergeRawMeshes(glassParts),
    trim: mergeRawMeshes(trimParts),
    headGlow: mergeRawMeshes(headParts),
    tailGlow: mergeRawMeshes(tailParts)
  };
  cachedTrafficSpecs.set(kind, built);
  return built;
}

/** Instantiates all 84 city traffic vehicles across 6 multi-material fleet classes (`clearcoat: 0, sheen: 0`). */
export function buildProceduralTrafficFleet(
  traffic: readonly { readonly x: number; readonly z: number; readonly yaw: number }[],
  shift: boolean
): {
  readonly nodes: AuraNodeBuilder<AuraPrimitiveNode>[];
  readonly groups: ProceduralTrafficGroup[];
} {
  const nodes: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
  const groups: ProceduralTrafficGroup[] = [];

  const bodyMat = unnamed(material.pbr({ color: "#ffffff", roughness: 0.24, metallic: 0.14, clearcoat: 0, sheen: 0, envMapIntensity: 1.38 }));
  const glassMat = unnamed(material.pbr({ color: "#9dc6df", roughness: 0.05, metallic: 0.24, opacity: 0.56, clearcoat: 0, sheen: 0, envMapIntensity: 1.55 }));
  const trimMat = unnamed(material.metal({ color: "#262b33", roughness: 0.48, metallic: 0.62, clearcoat: 0, sheen: 0, envMapIntensity: 0.95 }));
  const headMat = unnamed(material.pbr({ color: "#fff5dc", emissive: "#ffe9b8", emissiveIntensity: 1.75, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));
  const tailMat = unnamed(material.pbr({ color: "#ff3b2f", emissive: "#ff2418", emissiveIntensity: 1.9, roughness: 0.22, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));

  for (const kind of TRAFFIC_FLEET_KINDS) {
    const cars = traffic
      .map((_, idx) => idx)
      .filter((idx) => TRAFFIC_FLEET_KINDS[idx % TRAFFIC_FLEET_KINDS.length] === kind);
    if (cars.length === 0) continue;

    const specs = buildTrafficClassSpecs(kind);
    const palette = TRAFFIC_FLEET_KINDS.includes(kind) ? TRAFFIC_CLASS_PALETTES[kind] : TRAFFIC_CLASS_PALETTES.sedan;
    const transforms: AuraTransformSpec[] = cars.map((i) => ({
      position: [traffic[i]!.x, 0, traffic[i]!.z] as [number, number, number],
      rotation: [0, traffic[i]!.yaw, 0] as [number, number, number],
      scale: 1
    }));
    const colors = cars.map((carIdx, slotIdx) => palette[(carIdx * 3 + slotIdx) % palette.length]!);

    const baseId = `traffic-${kind}`;
    const bodyId = `${baseId}-body`;
    const glassId = `${baseId}-glass`;
    const trimId = `${baseId}-trim`;
    const headId = `${baseId}-head`;
    const tailId = `${baseId}-tail`;

    nodes.push(
      instances.custom(specs.body, { name: bodyId, transforms, colors, material: bodyMat, castShadow: shift, receiveShadow: true }).runtime({ id: bodyId }),
      instances.custom(specs.glass, { name: glassId, transforms, material: glassMat, castShadow: false, receiveShadow: false }).runtime({ id: glassId }),
      instances.custom(specs.trim, { name: trimId, transforms, material: trimMat, castShadow: false, receiveShadow: true }).runtime({ id: trimId }),
      instances.custom(specs.headGlow, { name: headId, transforms, material: headMat, castShadow: false, receiveShadow: false }).runtime({ id: headId }),
      instances.custom(specs.tailGlow, { name: tailId, transforms, material: tailMat, castShadow: false, receiveShadow: false }).runtime({ id: tailId })
    );

    groups.push({
      id: bodyId,
      kind,
      layerIds: [bodyId, glassId, trimId, headId, tailId],
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

/** Builds the 38 m Harbor Plaza Clocktower (`archwayVoussoirSlots` belfry, 4 lit dials, copper cupola). */
export function buildClocktowerLandmarkNode(
  pose: { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number },
  castShadow: boolean
): GroupNodeBuilder {
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    slots.push({ materialIndex, mesh });
  };

  // 0: Limestone plinth/cornices/quoins, 1: Terracotta brick shaft, 2: Patinated verdigris copper dome,
  // 3: Wrought iron / bronze bell & hands, 4: Illuminated ivory clock dials
  push(0, transformMesh(bevelBoxMesh(6.6, 5.8, 6.6, 0.22), { pos: [0, 2.9, 0] }));
  push(0, transformMesh(bevelBoxMesh(7.1, 0.65, 7.1, 0.14), { pos: [0, 6.05, 0] }));
  push(1, transformMesh(bevelBoxMesh(5.4, 18.8, 5.4, 0.18), { pos: [0, 15.6, 0] }));

  for (const cy of [11.2, 16.8, 25.1, 31.2]) {
    push(0, transformMesh(bevelBoxMesh(6.0, 0.52, 6.0, 0.12), { pos: [0, cy, 0] }));
  }

  // 4 illuminated harbor clock faces + bronze bezels & hands at y = 21.4 m
  for (let sideIdx = 0; sideIdx < 4; sideIdx += 1) {
    const yaw = (sideIdx * Math.PI) / 2;
    const dialRim = latheMesh([[1.36, 0], [1.56, 0.04], [1.56, 0.18], [1.34, 0.2]], 20);
    const dialFace = latheMesh([[0, 0.12], [1.35, 0.12], [1.35, 0.15], [0, 0.15]], 20);
    const handHour = transformMesh(bevelBoxMesh(0.11, 0.72, 0.06, 0.015), { pos: [0.16, 0.28, 0.18], rot: [0, 0, -0.55] });
    const handMin = transformMesh(bevelBoxMesh(0.09, 1.02, 0.06, 0.015), { pos: [-0.12, 0.42, 0.2], rot: [0, 0, 0.28] });
    const faceOffset = (m: RawMesh): RawMesh =>
      transformMesh(transformMesh(m, { pos: [0, 21.4, 2.7] }), { rot: [0, yaw, 0] });
    push(3, faceOffset(transformMesh(dialRim, { rot: [Math.PI * 0.5, 0, 0] })));
    push(4, faceOffset(transformMesh(dialFace, { rot: [Math.PI * 0.5, 0, 0] })));
    push(3, faceOffset(handHour));
    push(3, faceOffset(handMin));

    // Belfry radial masonry archways (`archwayVoussoirSlots`) on all 4 faces at y = 27.6 m
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

  // Belfry corner piers + suspended bronze harbor bell
  for (const sx of [-2.15, 2.15]) {
    for (const sz of [-2.15, 2.15]) {
      push(0, transformMesh(bevelBoxMesh(0.95, 5.8, 0.95, 0.08), { pos: [sx, 28.2, sz] }));
    }
  }
  push(
    3,
    transformMesh(
      latheMesh([[0.95, 0], [0.76, 0.35], [0.62, 1.05], [0.34, 1.45], [0, 1.52]], 18),
      { pos: [0, 27.2, 0] }
    )
  );

  // Verdigris patinated copper cupola dome + spire weathervane up to 38.0 m
  push(
    2,
    transformMesh(
      latheMesh([[2.85, 0], [2.72, 1.1], [2.18, 2.6], [1.22, 3.85], [0.32, 4.55], [0, 4.7]], 20),
      { pos: [0, 31.45, 0] }
    )
  );
  push(3, tubeSweepMesh([[0, 36.1, 0, 0.09], [0, 38.0, 0, 0.03]], 8));
  push(3, transformMesh(bevelBoxMesh(1.15, 0.16, 0.04, 0.01), { pos: [0.18, 37.55, 0] }));

  const mats: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#e8dcc6", roughness: 0.78, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    unnamed(material.pbr({ color: "#c9664c", roughness: 0.82, metallic: 0.02, clearcoat: 0, sheen: 0 })),
    unnamed(material.metal({ color: "#67a896", roughness: 0.42, metallic: 0.58, clearcoat: 0, sheen: 0 })),
    unnamed(material.brushedMetal({ color: "#6b5538", roughness: 0.32, anisotropy: 0.65 })),
    unnamed(material.emissive({ color: "#fff5da", emissive: "#ffd992", emissiveIntensity: 1.65, practical: true }))
  ];

  const worldScale = (pose.scale * PROP_GLB_REF) / 38;
  return assembleMultiMaterialNode("landmark-clocktower", slots, mats, {
    position: pose.position,
    rotation: pose.rotation,
    scale: worldScale,
    castShadow,
    receiveShadow: true
  });
}

/** Builds the 24 m Harbor Quay Lighthouse (`latheMesh` striped tower, gallery railing, physical Fresnel lantern). */
export function buildLighthouseLandmarkNode(
  pose: { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number },
  castShadow: boolean
): GroupNodeBuilder {
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => {
    slots.push({ materialIndex, mesh });
  };

  // 0: Granite base & gallery stone, 1: Coastal cream band, 2: Harbor vermilion band,
  // 3: Wrought iron railing & dome copper, 4: Glowing Fresnel beacon optic
  push(0, latheMesh([[3.35, 0], [3.1, 0.6], [2.85, 3.8], [2.95, 4.1], [2.58, 4.2]], 18));

  const bandHeights: readonly [number, number, number, number, number][] = [
    [4.2, 7.2, 2.55, 2.34, 2],
    [7.2, 10.2, 2.34, 2.13, 1],
    [10.2, 13.2, 2.13, 1.92, 2],
    [13.2, 16.1, 1.92, 1.73, 1],
    [16.1, 18.8, 1.73, 1.56, 2]
  ];
  for (const [y0, y1, r0, r1, matIdx] of bandHeights) {
    push(matIdx, latheMesh([[r0, y0], [r1, y1]], 20));
  }

  // Corbelled stone observation gallery & tubular iron guardrail
  push(0, latheMesh([[1.56, 18.8], [2.28, 19.25], [2.32, 19.6], [1.45, 19.65]], 20));
  const railRing: V4[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    railRing.push([Math.cos(a) * 2.18, 20.55, Math.sin(a) * 2.18, 0.045]);
    if (i < 16 && i % 2 === 0) {
      push(3, tubeSweepMesh([[Math.cos(a) * 2.18, 19.6, Math.sin(a) * 2.18, 0.038], [Math.cos(a) * 2.18, 20.55, Math.sin(a) * 2.18, 0.038]], 6));
    }
  }
  push(3, tubeSweepMesh(railRing, 6));

  // Fresnel optic drum + copper lantern dome & lightning spire up to 24.0 m
  push(4, latheMesh([[0, 20.1], [0.78, 20.3], [0.84, 21.0], [0.76, 21.65], [0, 21.8]], 16));
  push(3, latheMesh([[1.52, 22.0], [1.42, 22.45], [0.95, 23.15], [0.24, 23.55], [0, 23.62]], 18));
  push(3, tubeSweepMesh([[0, 23.55, 0, 0.05], [0, 24.0, 0, 0.02]], 6));

  const opaqueNode = assembleMultiMaterialNode(
    "landmark-lighthouse-body",
    slots,
    [
      unnamed(material.pbr({ color: "#8c867c", roughness: 0.86, metallic: 0.02, clearcoat: 0, sheen: 0 })),
      unnamed(material.ceramic({ color: "#f3ead8", roughness: 0.34 })),
      unnamed(material.lacquer({ color: "#cf4938", roughness: 0.32, clearcoat: 0.72, clearcoatRoughness: 0.08 })),
      unnamed(material.metal({ color: "#2d383a", roughness: 0.42, metallic: 0.78, clearcoat: 0, sheen: 0 })),
      unnamed(material.emissive({ color: "#fff3c4", emissive: "#ffd269", emissiveIntensity: 2.6, practical: true }))
    ],
    { castShadow, receiveShadow: true }
  );

  const lanternGlass = geometry.custom(
    mergeRawMeshes([latheMesh([[1.36, 19.65], [1.42, 19.65], [1.42, 22.05], [1.36, 22.05]], 18)]),
    {
      name: "landmark-lighthouse-glass",
      material: courierGlazingMaterial(),
      castShadow: false,
      receiveShadow: false
    }
  );

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

  // Plinth + modular courier-teal locker body + cream locker doors + brushed handles + curved canopy + glowing terminal
  push(3, transformMesh(bevelBoxMesh(1.76, 0.14, 0.78, 0.03), { pos: [0, 0.07, 0] }));
  push(0, transformMesh(bevelBoxMesh(1.64, 2.02, 0.66, 0.05), { pos: [0, 1.14, -0.02] }));
  for (const lx of [-0.52, 0.52]) {
    for (const ly of [0.52, 1.08, 1.64]) {
      push(1, transformMesh(bevelBoxMesh(0.44, 0.46, 0.05, 0.012), { pos: [lx, ly, 0.31] }));
      push(2, transformMesh(bevelBoxMesh(0.04, 0.14, 0.04, 0.006), { pos: [lx - 0.16, ly, 0.34] }));
    }
  }
  // Center illuminated dispatch touchscreen & LED header strip
  push(4, transformMesh(bevelBoxMesh(0.42, 0.58, 0.05, 0.012), { pos: [0, 1.24, 0.32] }));
  push(4, transformMesh(bevelBoxMesh(1.54, 0.12, 0.06, 0.015), { pos: [0, 2.04, 0.32] }));

  // Curved cantilevered rain hood (`loftSectionsMesh`) + rooftop beacon finial
  push(
    1,
    loftSectionsMesh(
      [
        [[-0.88, 2.14, -0.36], [0.88, 2.14, -0.36], [0.84, 2.22, -0.36], [-0.84, 2.22, -0.36]],
        [[-0.9, 2.2, 0.12], [0.9, 2.2, 0.12], [0.86, 2.28, 0.12], [-0.86, 2.28, 0.12]],
        [[-0.88, 2.1, 0.52], [0.88, 2.1, 0.52], [0.84, 2.17, 0.52], [-0.84, 2.17, 0.52]]
      ],
      true,
      false
    )
  );
  push(2, transformMesh(latheMesh([[0, 0], [0.16, 0], [0.14, 0.06], [0, 0.07]], 14), { pos: [0, 2.26, 0] }));
  push(4, transformMesh(latheMesh([[0, 0], [0.12, 0.02], [0.11, 0.18], [0, 0.24]], 16), { pos: [0, 2.32, 0] }));

  const body = assembleMultiMaterialNode(
    `${id}-body`,
    slots,
    [
      unnamed(material.clearcoatPaint({ color: "#199fa6", roughness: 0.16, clearcoat: 0.95, clearcoatRoughness: 0.04 })),
      unnamed(material.carPaint({ color: "#efe3cf", roughness: 0.24, clearcoat: 0.85, clearcoatRoughness: 0.05 })),
      unnamed(material.brushedMetal({ color: "#d5dfe8", roughness: 0.24, anisotropy: 0.8 })),
      unnamed(material.blackRubber({ color: "#1c2026", roughness: 0.88 })),
      unnamed(material.emissive({ color: "#5ef4f8", emissive: "#22c3c9", emissiveIntensity: 2.2, practical: true }))
    ],
    { castShadow: true, receiveShadow: true }
  );
  const visor = geometry.custom(
    mergeRawMeshes([transformMesh(bevelBoxMesh(0.48, 0.66, 0.025, 0.006), { pos: [0, 1.24, 0.36] })]),
    {
      name: `${id}-visor`,
      material: courierGlazingMaterial(),
      castShadow: false,
      receiveShadow: false
    }
  );
  return group(id, [body, visor], { position: [0, -60, 0] }).runtime({ id });
}
/* ------------------------------------------------------------------ 4. Street Furniture, Rooftops & Shopfront Accents */

export interface PropPlacementInput {
  readonly placements: ReadonlyMap<
    PropKey,
    readonly { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number }[]
  >;
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

/** Builds all procedural multi-material street furniture, landmarks, rooftop HVACs & shopfront accents. */
export function buildProceduralPropNodes(
  plan: PropPlacementInput,
  cast = false
): readonly (AuraNodeBuilder<AuraPrimitiveNode> | GroupNodeBuilder)[] {
  const out: (AuraNodeBuilder<AuraPrimitiveNode> | GroupNodeBuilder)[] = [];

  const castIronMat = unnamed(material.metal({ color: "#272d34", roughness: 0.52, metallic: 0.68, clearcoat: 0, sheen: 0 }));
  const brushedSteelMat = unnamed(material.metal({ color: "#b9c4cf", roughness: 0.34, metallic: 0.82, clearcoat: 0, sheen: 0 }));
  const brassMat = unnamed(material.metal({ color: "#d5a449", roughness: 0.28, metallic: 0.88, clearcoat: 0, sheen: 0 }));
  const vermilionMat = unnamed(material.pbr({ color: "#cf3f2e", roughness: 0.36, metallic: 0.08, clearcoat: 0, sheen: 0 }));
  const creamStoneMat = unnamed(material.pbr({ color: "#ece0cb", roughness: 0.74, metallic: 0.02, clearcoat: 0, sheen: 0 }));
  const cedarWoodMat = unnamed(material.pbr({ color: "#8c5a38", roughness: 0.78, metallic: 0.02, clearcoat: 0, sheen: 0 }));
  const barkMat = unnamed(material.pbr({ color: "#684b36", roughness: 0.88, metallic: 0, clearcoat: 0, sheen: 0 }));
  const foliageMat = unnamed(material.pbr({ color: "#ffffff", roughness: 0.76, metallic: 0, clearcoat: 0, sheen: 0 }));
  const sodiumBulbMat = unnamed(material.pbr({ color: "#ffe4ab", emissive: "#ffb347", emissiveIntensity: 2.1, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));
  const signalRedMat = unnamed(material.pbr({ color: "#ff4034", emissive: "#ff2a1c", emissiveIntensity: 2.0, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));
  const signalAmberMat = unnamed(material.pbr({ color: "#ffd15c", emissive: "#ffa822", emissiveIntensity: 1.85, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));
  const signalGreenMat = unnamed(material.pbr({ color: "#4fe39b", emissive: "#22c97e", emissiveIntensity: 1.95, roughness: 0.2, metallic: 0, clearcoat: 0, sheen: 0, practical: true }));

  // 1. Street Lamps (5.0 m tall, gooseneck arm along +X over street)
  const lamps = plan.placements.get("lamp") ?? [];
  if (lamps.length > 0) {
    const tr = toMetreTransforms(lamps, 5.0);
    const lampIron = mergeRawMeshes([
      latheMesh([[0.24, 0], [0.22, 0.18], [0.16, 0.55], [0.18, 0.65], [0.11, 0.95]], 12),
      tubeSweepMesh([[0, 0.9, 0, 0.085], [0, 3.85, 0, 0.058], [0.22, 4.55, 0, 0.048], [0.82, 4.94, 0, 0.042], [1.36, 4.86, 0, 0.038]], 8),
      transformMesh(latheMesh([[0, 0.16], [0.12, 0.14], [0.28, 0.05], [0.3, 0]], 14), { pos: [1.38, 4.74, 0] })
    ]);
    const lampBulb = mergeRawMeshes([
      transformMesh(latheMesh([[0, 0], [0.16, 0.02], [0.2, 0.08], [0, 0.12]], 12), { pos: [1.38, 4.66, 0] })
    ]);
    out.push(
      instances.custom(lampIron, { name: "model-lamp", transforms: tr, material: castIronMat, castShadow: cast, receiveShadow: true }),
      instances.custom(lampBulb, { name: "model-lamp-bulb", transforms: tr, material: sodiumBulbMat, castShadow: false, receiveShadow: false })
    );
  }

  // 2. Traffic Signals (4.2 m tall, 3-aspect hooded head + red/amber/green optics)
  const signals = plan.placements.get("signal") ?? [];
  if (signals.length > 0) {
    const tr = toMetreTransforms(signals, 4.2);
    const sigFrame = mergeRawMeshes([
      latheMesh([[0.2, 0], [0.17, 0.35], [0.1, 0.6]], 10),
      tubeSweepMesh([[0, 0.55, 0, 0.075], [0, 3.95, 0, 0.06], [0.95, 4.02, 0, 0.048]], 7),
      transformMesh(bevelBoxMesh(0.34, 0.96, 0.28, 0.03), { pos: [0.88, 3.55, 0] })
    ]);
    const lensDisc = latheMesh([[0, 0], [0.095, 0.01], [0.095, 0.04], [0, 0.045]], 12);
    out.push(
      instances.custom(sigFrame, { name: "model-signal", transforms: tr, material: castIronMat, castShadow: cast, receiveShadow: true }),
      instances.custom(mergeRawMeshes([transformMesh(lensDisc, { pos: [0.88, 3.84, 0.14], rot: [Math.PI * 0.5, 0, 0] })]), { name: "model-signal-r", transforms: tr, material: signalRedMat, castShadow: false, receiveShadow: false }),
      instances.custom(mergeRawMeshes([transformMesh(lensDisc, { pos: [0.88, 3.55, 0.14], rot: [Math.PI * 0.5, 0, 0] })]), { name: "model-signal-y", transforms: tr, material: signalAmberMat, castShadow: false, receiveShadow: false }),
      instances.custom(mergeRawMeshes([transformMesh(lensDisc, { pos: [0.88, 3.26, 0.14], rot: [Math.PI * 0.5, 0, 0] })]), { name: "model-signal-g", transforms: tr, material: signalGreenMat, castShadow: false, receiveShadow: false })
    );
  }

  // 3. Broadleaf Street & Park Trees (4.6 m ref, `layeredCanopyMesh` + organic trunk)
  const trees = plan.placements.get("tree") ?? [];
  if (trees.length > 0) {
    const tr = toMetreTransforms(trees, 4.6);
    const trunkSpec = mergeRawMeshes([
      latheMesh([[0.42, 0], [0.42, 0.06], [0.28, 0.08]], 10),
      tubeSweepMesh([[0, 0, 0, 0.24], [0.04, 1.05, 0.02, 0.16], [-0.03, 2.05, -0.02, 0.12]], 7, true),
      tubeSweepMesh([[0, 1.55, 0, 0.09], [0.48, 2.35, 0.22, 0.05]], 5, true),
      tubeSweepMesh([[0, 1.65, 0, 0.09], [-0.44, 2.42, -0.2, 0.05]], 5, true)
    ]);
    const canopySpec = mergeRawMeshes([
      transformMesh(layeredCanopyMesh({ radius: 1.55, height: 2.75, puffs: 9, seed: 31 }), { pos: [0, 1.85, 0] })
    ]);
    const leafPalette = ["#6d9b48", "#7aa852", "#5f8c42", "#85b05c", "#679c56"];
    const colors = trees.map((_, i) => leafPalette[i % leafPalette.length]!);
    out.push(
      instances.custom(trunkSpec, { name: "model-tree-trunk", transforms: tr, material: barkMat, castShadow: false, receiveShadow: true }),
      instances.custom(canopySpec, { name: "model-tree", transforms: tr, colors, material: foliageMat, castShadow: false, receiveShadow: true })
    );
  }

  // 4. Coastal Date Palms (7.5 m ref, curved ringed trunk + arched pinnate fronds + coconuts)
  const palms = plan.placements.get("palm") ?? [];
  if (palms.length > 0) {
    const tr = toMetreTransforms(palms, 7.5);
    const palmTrunk = mergeRawMeshes([
      tubeSweepMesh([[0, 0, 0, 0.3], [0.18, 2.1, 0.06, 0.22], [0.34, 4.3, -0.04, 0.17], [0.22, 6.25, 0.02, 0.14]], 8, true),
      transformMesh(icosphereFacetMesh(0.16, 0, 0.05, 7), { pos: [0.32, 6.1, 0.1] }),
      transformMesh(icosphereFacetMesh(0.15, 0, 0.05, 13), { pos: [0.12, 6.08, -0.12] })
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
        true
      );
      frondParts.push(transformMesh(blade, { pos: [0.22, 6.22, 0.02], rot: [0, ang, 0] }));
    }
    const palmColors = palms.map((_, i) => (i % 2 === 0 ? "#6ea24d" : "#7cb056"));
    out.push(
      instances.custom(palmTrunk, { name: "model-palm-trunk", transforms: tr, material: barkMat, castShadow: false, receiveShadow: true }),
      instances.custom(mergeRawMeshes(frondParts), { name: "model-palm", transforms: tr, colors: palmColors, material: foliageMat, castShadow: false, receiveShadow: true })
    );
  }

  // 5. Transit Bus Shelters (4.2 m x 1.3 m, arched roof + bench + route lightbox + `material.physical` glazing)
  const shelters = plan.placements.get("shelter") ?? [];
  if (shelters.length > 0) {
    const tr = toMetreTransforms(shelters, 4.2);
    const frameSpec = mergeRawMeshes([
      tubeSweepMesh([[-1.95, 0, 0.56, 0.055], [-1.95, 2.38, 0.56, 0.05]], 7),
      tubeSweepMesh([[1.95, 0, 0.56, 0.055], [1.95, 2.38, 0.56, 0.05]], 7),
      tubeSweepMesh([[0, 0, 0.56, 0.05], [0, 2.38, 0.56, 0.048]], 7),
      loftSectionsMesh(
        [-2.08, 0, 2.08].map((x) => [
          [x, 2.36, 0.64], [x, 2.44, 0.64], [x, 2.56, 0.02], [x, 2.42, -0.64], [x, 2.34, -0.64], [x, 2.48, 0.02]
        ]),
        true,
        false
      ),
      transformMesh(bevelBoxMesh(2.5, 0.08, 0.42, 0.02), { pos: [-0.45, 0.48, 0.32] }),
      transformMesh(bevelBoxMesh(0.86, 1.35, 0.12, 0.02), { pos: [1.45, 1.25, 0.05] })
    ]);
    const mapGlowSpec = mergeRawMeshes([transformMesh(bevelBoxMesh(0.72, 1.16, 0.14, 0.015), { pos: [1.45, 1.25, 0.05] })]);
    const glassSpec = mergeRawMeshes([
      transformMesh(bevelBoxMesh(3.76, 1.98, 0.035, 0.006), { pos: [0, 1.24, 0.56] }),
      transformMesh(bevelBoxMesh(0.035, 1.98, 1.02, 0.006), { pos: [-1.95, 1.24, 0.04] })
    ]);
    out.push(
      instances.custom(frameSpec, { name: "model-shelter", transforms: tr, material: brushedSteelMat, castShadow: cast, receiveShadow: true }),
      instances.custom(mapGlowSpec, { name: "model-shelter-map", transforms: tr, material: sodiumBulbMat, castShadow: false, receiveShadow: false }),
      instances.custom(glassSpec, { name: "model-shelter-glass", transforms: tr, material: courierGlazingMaterial(), castShadow: false, receiveShadow: false })
    );
  }

  // 6. Fire Hydrants (0.8 m tall, lathed flanged barrel + brass hose nozzles)
  const hydrants = plan.placements.get("hydrant") ?? [];
  if (hydrants.length > 0) {
    const tr = toMetreTransforms(hydrants, 0.8);
    const hydrantBody = mergeRawMeshes([
      latheMesh([[0.19, 0], [0.19, 0.07], [0.13, 0.1], [0.14, 0.52], [0.18, 0.56], [0.15, 0.7], [0.06, 0.76], [0, 0.8]], 14)
    ]);
    const hydrantCaps = mergeRawMeshes([
      tubeSweepMesh([[-0.21, 0.44, 0, 0.052], [0.21, 0.44, 0, 0.052]], 8),
      tubeSweepMesh([[0, 0.42, 0, 0.062], [0, 0.42, 0.21, 0.062]], 8)
    ]);
    out.push(
      instances.custom(hydrantBody, { name: "model-hydrant", transforms: tr, material: vermilionMat, castShadow: cast, receiveShadow: true }),
      instances.custom(hydrantCaps, { name: "model-hydrant-caps", transforms: tr, material: brassMat, castShadow: false, receiveShadow: true })
    );
  }

  // 7. Rooftop Cedar Water Towers (`latticeTrussMesh` + `latheMesh`) & Twin-Fan Rooftop HVAC Units
  const tanks = plan.placements.get("watertank") ?? [];
  if (tanks.length > 0) {
    const tr = toMetreTransforms(tanks, 3.4);
    const tankTrestle = mergeRawMeshes([
      transformMesh(latticeTrussMesh({ span: [1.65, 1.35, 1.65], bays: 2, chordRadius: 0.055, braceRadius: 0.032 }), { pos: [0, 0.68, 0] }),
      latheMesh([[1.02, 1.55], [1.04, 1.62], [1.02, 2.55], [1.04, 2.62]], 16),
      latheMesh([[1.12, 2.75], [0.42, 3.25], [0, 3.4]], 16)
    ]);
    const tankBarrel = mergeRawMeshes([latheMesh([[0, 1.35], [1.0, 1.35], [1.0, 2.76], [0, 2.76]], 16)]);
    const hvacTransforms: AuraTransformSpec[] = tanks.map((t) => {
      const c = Math.cos(t.rotation[1]), s = Math.sin(t.rotation[1]);
      return {
        position: [t.position[0] - 1.85 * c + 1.25 * s, t.position[1], t.position[2] + 1.85 * s + 1.25 * c],
        rotation: [0, t.rotation[1], 0],
        scale: 1
      };
    });
    const hvacSpec = mergeRawMeshes([
      transformMesh(bevelBoxMesh(1.65, 0.92, 0.96, 0.04), { pos: [0, 0.46, 0] }),
      transformMesh(latheMesh([[0.28, 0.92], [0.31, 1.08], [0.25, 1.1], [0, 0.96]], 14), { pos: [-0.42, 0, 0] }),
      transformMesh(latheMesh([[0.28, 0.92], [0.31, 1.08], [0.25, 1.1], [0, 0.96]], 14), { pos: [0.42, 0, 0] }),
      tubeSweepMesh([[0.82, 0.35, 0, 0.045], [1.18, 0.35, 0, 0.045], [1.18, 0.04, 0, 0.045]], 6)
    ]);
    out.push(
      instances.custom(tankTrestle, { name: "model-watertank-frame", transforms: tr, material: castIronMat, castShadow: cast, receiveShadow: true }),
      instances.custom(tankBarrel, { name: "model-watertank", transforms: tr, material: cedarWoodMat, castShadow: cast, receiveShadow: true }),
      instances.custom(hvacSpec, { name: "rooftop-hvac", transforms: hvacTransforms, material: brushedSteelMat, castShadow: false, receiveShadow: true })
    );
  }

  // 8. Harbor Landmarks (`clocktower` & `lighthouse`)
  const clock = plan.placements.get("clocktower")?.[0];
  if (clock) out.push(buildClocktowerLandmarkNode(clock, cast));
  const lighthouse = plan.placements.get("lighthouse")?.[0];
  if (lighthouse) out.push(buildLighthouseLandmarkNode(lighthouse, cast));

  // 9. Deterministic Sidewalk Postboxes, Newspaper Stands, Cafe Umbrellas & Shopfront Cornice/Awnings
  if (lamps.length > 0) {
    const postboxTr: AuraTransformSpec[] = [];
    const newsstandTr: AuraTransformSpec[] = [];
    const cafeTr: AuraTransformSpec[] = [];
    const awningTr: AuraTransformSpec[] = [];
    lamps.forEach((t, idx) => {
      if (idx % 7 === 2) postboxTr.push(offsetFromLamp(t, -0.78, 0, 2.55, Math.PI * 0.5));
      if (idx % 9 === 4) newsstandTr.push(offsetFromLamp(t, -0.92, 0, -2.75, 0));
      if (idx % 11 === 5) cafeTr.push(offsetFromLamp(t, -1.42, 0, 3.65, 0));
      if (idx % 5 === 1) awningTr.push(offsetFromLamp(t, -2.05, 3.28, 0, 0));
    });
    if (postboxTr.length > 0) {
      const boxSpec = mergeRawMeshes([latheMesh([[0.22, 0], [0.2, 0.14], [0.19, 0.98], [0.22, 1.02], [0.17, 1.18], [0, 1.24]], 14)]);
      out.push(instances.custom(boxSpec, { name: "street-postboxes", transforms: postboxTr, material: vermilionMat, castShadow: false, receiveShadow: true }));
    }
    if (newsstandTr.length > 0) {
      const standSpec = mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.56, 0.88, 0.48, 0.03), { pos: [0, 0.44, 0] }),
        transformMesh(latheMesh([[0, 0.88], [0.3, 0.92], [0.26, 1.06], [0, 1.1]], 10, true), { scale: [0.95, 1, 0.85] })
      ]);
      out.push(instances.custom(standSpec, { name: "street-newsstands", transforms: newsstandTr, colors: newsstandTr.map((_, i) => (i % 2 === 0 ? "#2c7da0" : "#e09f3e")), material: foliageMat, castShadow: false, receiveShadow: true }));
    }
    if (cafeTr.length > 0) {
      const umbCanopy = mergeRawMeshes([latheMesh([[0.04, 2.38], [0.58, 2.24], [1.22, 1.94], [1.26, 1.84], [1.14, 1.86]], 12, true)]);
      const umbTable = mergeRawMeshes([
        tubeSweepMesh([[0, 0, 0, 0.04], [0, 2.36, 0, 0.03]], 6),
        latheMesh([[0.32, 0], [0.08, 0.06], [0.06, 0.72], [0.56, 0.74], [0.56, 0.78], [0, 0.78]], 12)
      ]);
      out.push(
        instances.custom(umbCanopy, { name: "street-cafe-umbrellas", transforms: cafeTr, colors: cafeTr.map((_, i) => (i % 2 === 0 ? "#e76f51" : "#f4e6cc")), material: foliageMat, castShadow: false, receiveShadow: true }),
        instances.custom(umbTable, { name: "street-cafe-tables", transforms: cafeTr, material: castIronMat, castShadow: false, receiveShadow: true })
      );
    }
    if (awningTr.length > 0) {
      const corniceSpec = mergeRawMeshes([
        transformMesh(bevelBoxMesh(0.38, 0.28, 3.6, 0.04), { pos: [-0.18, 0.42, 0] }),
        loftSectionsMesh(
          [-1.72, 0, 1.72].map((z) => [
            [-0.12, 0.28, z], [0.02, 0.32, z], [0.96, -0.14, z], [0.96, -0.26, z], [-0.12, 0.16, z]
          ]),
          true,
          false
        )
      ]);
      out.push(instances.custom(corniceSpec, { name: "shopfront-cornice-awnings", transforms: awningTr, colors: awningTr.map((_, i) => ["#d96b52", "#78b7a6", "#e8c47c"][i % 3]!), material: creamStoneMat, castShadow: false, receiveShadow: true }));
    }
  }

  return out;
}
