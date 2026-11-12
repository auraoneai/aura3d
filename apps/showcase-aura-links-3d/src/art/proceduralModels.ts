/**
 * Aura Links 3D (`WP-10`) — Multi-Material Procedural Architecture, Botanicals & Golf Gear.
 *
 * Replaces all static course prop and character rigs with 100% native sculpted multi-material
 * `@aura3d/engine` procedural geometry built on `apps/showcase-port-shared/proceduralKernel.ts`,
 * including the 14-joint articulated procedural golfer/caddy/gallery rigs, with zero `.glb` files,
 * zero `three` imports, and 100% WebGPU compatibility.
 */
import {
  game,
  geometry,
  group,
  instances,
  lights,
  material,
  text3D,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
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
import type { CourseSpec, GolferFit, HoleSpec, HoleTerrain, Vec2, Vec3 } from "../game/types";
import { GOLFER_TARGET_HEIGHT, MESHY_GLB_HEIGHT, meshyProfile } from "../game/golferRetarget";

const specCache = new Map<string, AuraCustomGeometrySpec>();

function cachedSpec(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const hit = specCache.get(key);
  if (hit) return hit;
  const created = build();
  specCache.set(key, created);
  return created;
}

function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number): string =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** WebGPU-safe architectural & windshield glass (`castShadow: false` on every glass node). */
export function makeLinksWindowGlassMat(tint = "#d8eef8", opacity = 0.44): AuraMaterialSpec {
  return material.physical({
    color: tint,
    roughness: 0.05,
    opacity,
    clearcoat: 1,
    ior: 1.5
  });
}

function regularPolygon2D(sides: number, radius: number, phase = 0, jitterSeed = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 + phase;
    const jit = jitterSeed > 0 ? 0.88 + hash01(jitterSeed * 37 + i * 19) * 0.24 : 1;
    out.push([Math.cos(a) * radius * jit, Math.sin(a) * radius * jit]);
  }
  return out;
}

function gablePrismMesh(width: number, depth: number, rise: number, overhang = 0.18): RawMesh {
  const hw = width * 0.5 + overhang;
  const hd = depth * 0.5 + overhang;
  const profile: V2[] = [
    [-hd, 0],
    [hd, 0],
    [0, rise]
  ];
  return transformMesh(extrudePolygonMesh(profile, hw * 2, 0.03, true), {
    rot: [0, Math.PI * 0.5, 0]
  });
}

// ---------------------------------------------------------------------------
// 1. Golfer Club Sub-Assemblies, Tour Bag, Golf Cart, Flagstick & Ball
// ---------------------------------------------------------------------------

/**
 * Corded tour-velvet grip (`y in [-0.15, +0.15]`, matching `CLUB_PARTS` `golfer-club-grip`).
 * Single-mesh `geometry.custom` so `applyGolferFit` can call `setMaterial(...)` directly.
 */
export function buildClubGripNode(capColor?: string): any {
  const spec = cachedSpec("links:club-grip", () => {
    const profile: V2[] = [[0, -0.15]];
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const y = -0.15 + u * 0.3;
      const buttFlare = u < 0.12 ? (1 - u / 0.12) * 0.0026 : 0;
      const rib = Math.sin(u * Math.PI * 12) * 0.00045;
      const r = 0.0148 - u * 0.0042 + buttFlare + rib;
      profile.push([r, y]);
    }
    profile.push([0, 0.15]);
    return mergeRawMeshes([latheMesh(profile, 16)]);
  });
  const gripMat = material.blackRubber({
    color: capColor || "#191c22",
    roughness: 0.84
  });
  return geometry
    .custom(spec, { name: "golfer-club-grip", material: gripMat, castShadow: true, receiveShadow: true })
    .runtime(game.runtimeNode("golfer-club-grip"));
}

/**
 * Tour-stepped tapered chrome/graphite shaft (`y in [-0.42, +0.42]`, matching `CLUB_PARTS` `golfer-club-shaft`).
 */
export function buildClubShaftNode(): any {
  const spec = cachedSpec("links:club-shaft", () => {
    const profile: V2[] = [
      [0, -0.42],
      [0.0074, -0.42],
      [0.0071, -0.22],
      [0.0066, -0.04],
      [0.0061, 0.14],
      [0.0054, 0.3],
      [0.0048, 0.42],
      [0, 0.42]
    ];
    return mergeRawMeshes([latheMesh(profile, 14)]);
  });
  const shaftMat = material.chrome({ color: "#e8eef5", roughness: 0.06, envMapIntensity: 1.8 });
  return geometry
    .custom(spec, { name: "golfer-club-shaft", material: shaftMat, castShadow: true, receiveShadow: true })
    .runtime(game.runtimeNode("golfer-club-shaft"));
}

/**
 * Forged 460cc aerodynamic carbon-crown + milled titanium driver head (`golfer-club-head`).
 * Preserves exact `CLUB_PARTS` local sweet-spot frame: hosel at `[0, -0.018, 0]`,
 * clubhead body centered around `[0.036, 0.002, -0.012]`, milled face normal toward `+Z`.
 */
export function buildClubHeadNode(): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Glossy carbon-weave aerodynamic crown (`clearcoatPaint`)
  // Mat 1: Brushed/milled 6-4 titanium face & sole (`brushedMetal`)
  // Mat 2: Stepped hosel chrome + collared ferrule (`studioMetal`)
  // Mat 3: Tungsten-brass sole weight & crown alignment chevron (`studioMetal`)
  // Mat 4: Milled dark scoreline grooves & black ferrule collar (`blackRubber`)

  const crownRing = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): V3[] => {
    const pts: V3[] = [];
    const n = 14;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const domeY = sa > 0 ? sa * ry * 1.12 : sa * ry * 0.78;
      pts.push([cx + ca * rx, cy - domeY, cz + Math.sin(a * 0.5) * rz * 0.08]);
    }
    return pts;
  };
  const crownSections: V3[][] = [
    crownRing(0.036, 0.003, 0.022, 0.052, 0.024, 0.01),
    crownRing(0.038, 0.002, 0.004, 0.058, 0.027, 0.012),
    crownRing(0.039, 0.004, -0.022, 0.054, 0.024, 0.012),
    crownRing(0.035, 0.008, -0.048, 0.041, 0.017, 0.01),
    crownRing(0.031, 0.012, -0.064, 0.02, 0.009, 0.006)
  ];
  slots.push({ mesh: loftSectionsMesh(crownSections, true, false), materialIndex: 0 });

  // Milled titanium face insert (10.5 deg loft) + 5 horizontal scoreline grooves
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.1, 0.044, 0.009, 0.002), {
      pos: [0.036, 0.002, 0.024],
      rot: [-0.18, 0, 0]
    }),
    materialIndex: 1
  });
  for (let g = -2; g <= 2; g += 1) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.068, 0.0018, 0.0022, 0.0004), {
        pos: [0.036, 0.002 + g * 0.0062, 0.0285 - g * 0.0011],
        rot: [-0.18, 0, 0]
      }),
      materialIndex: 4
    });
  }

  // Hosel bore + collared ferrule + gold trim ring + sole tungsten weight port + crown alignment mark
  slots.push({
    mesh: transformMesh(
      latheMesh([
        [0, -0.044],
        [0.0066, -0.044],
        [0.0076, -0.022],
        [0.0088, 0.002],
        [0, 0.002]
      ], 14),
      { pos: [0, 0, 0] }
    ),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(
      latheMesh([
        [0.0068, -0.042],
        [0.0084, -0.034],
        [0.0086, -0.024],
        [0.0072, -0.022]
      ], 14),
      { pos: [0, 0, 0] }
    ),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.062, 0.007, 0.048, 0.0018), { pos: [0.036, 0.024, -0.016] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, -0.004], [0.011, -0.004], [0.011, 0.004], [0, 0.004]], 12), {
      pos: [0.036, 0.026, -0.034]
    }),
    materialIndex: 3
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.014, 0.002, 0.009, 0.0005), { pos: [0.036, -0.023, 0.008] }),
    materialIndex: 3
  });

  const mats: AuraMaterialSpec[] = [
    material.clearcoatPaint({ color: "#141922", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }),
    material.brushedMetal({ color: "#d5dce6", roughness: 0.2 }),
    material.studioMetal({ color: "#e5ecf4", roughness: 0.12, metalness: 0.96 }),
    material.studioMetal({ color: "#d8b25a", roughness: 0.22, metalness: 0.92 }),
    material.blackRubber({ color: "#15181e", roughness: 0.78 })
  ];
  return assembleMultiMaterialNode("golfer-club-head", slots, mats, { id: "golfer-club-head" });
}

/**
 * Multi-club Tour stand bag (`golfer-bag`, `y in [-0.46, +0.62]`, matching `bagGroundY + 0.46` in `poseGolfer`):
 * lofted + lathed multi-panel bag barrel, 6-way velour divider cuff with inner ribs, deployed spring-hinged
 * stand legs, sculpted dual strap, towel, and forged cavity-back irons + woods sticking out.
 */
export function buildTourBagNode(fit: GolferFit, refined = true): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Quilted British racing-green tour shell (`physical`)
  // Mat 1: Saddle-tan leather cuff trim, pockets & padded dual strap (`physical`)
  // Mat 2: Anti-slip molded base, velour 6-way divider & iron ferrules (`blackRubber`)
  // Mat 3: Forged chrome irons, shafts & carbon-alloy stand legs (`brushedMetal`)
  // Mat 4: Brass zipper pulls, towel ring & tour crest badge (`studioMetal`)
  // Mat 5: Cream knit wood headcover & draped waffle towel (`fabric`)
  // Mat 6: Glossy carbon-titanium driver/fairway wood crowns (`clearcoatPaint`)

  // Lathed inner cylinder + lofted sculpted oval tour bolsters (`y = -0.42..+0.38`)
  slots.push({
    mesh: latheMesh(
      [[0, -0.44], [0.136, -0.44], [0.144, -0.24], [0.136, 0.06], [0.146, 0.34], [0.134, 0.39]],
      22
    ),
    materialIndex: 0
  });
  const bagBolsterRing = (y: number, rx: number, rz: number, zOff: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const rib = 1 + Math.cos(a * 4) * 0.045;
      pts.push([Math.cos(a) * rx * rib, y, Math.sin(a) * rz * rib + zOff]);
    }
    return pts;
  };
  slots.push({
    mesh: loftSectionsMesh(
      [
        bagBolsterRing(-0.4, 0.146, 0.152, 0.004),
        bagBolsterRing(-0.18, 0.154, 0.16, 0.008),
        bagBolsterRing(0.1, 0.148, 0.154, 0.006),
        bagBolsterRing(0.35, 0.156, 0.162, 0.004)
      ],
      true,
      false
    ),
    materialIndex: 0
  });

  // Molded polymer base boot + plush 6-way velour top divider cuff & crisscrossed divider ribs
  slots.push({
    mesh: latheMesh([[0, -0.46], [0.156, -0.46], [0.158, -0.385], [0.146, -0.375]], 22),
    materialIndex: 2
  });
  slots.push({
    mesh: latheMesh([[0.132, 0.35], [0.162, 0.372], [0.166, 0.455], [0.148, 0.468], [0.132, 0.445]], 22),
    materialIndex: 1
  });
  slots.push({
    mesh: latheMesh([[0, 0.415], [0.136, 0.415], [0.138, 0.452], [0, 0.432]], 20),
    materialIndex: 2
  });
  // 6-way divider cross-ribs + top alloy grab handle
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.26, 0.026, 0.014, 0.004), { pos: [0, 0.454, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.014, 0.026, 0.25, 0.004), { pos: [-0.044, 0.454, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.014, 0.026, 0.25, 0.004), { pos: [0.044, 0.454, 0] }), materialIndex: 2 });
  slots.push({
    mesh: tubeSweepMesh([[-0.055, 0.43, 0.152, 0.01], [0, 0.478, 0.184, 0.011], [0.055, 0.43, 0.152, 0.01]], 8),
    materialIndex: 3
  });

  // Sculpted front ball/rangefinder pockets, full-length apparel pockets, brass crest & draped waffle towel
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.165, 0.26, 0.115, 0.026), { pos: [0, -0.14, 0.158] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.135, 0.14, 0.085, 0.02), { pos: [0, 0.11, 0.154] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.095, 0.38, 0.19, 0.024), { pos: [0.144, -0.03, -0.01] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.095, 0.38, 0.19, 0.024), { pos: [-0.144, -0.03, -0.01] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.076, 0.054, 0.012, 0.004), { pos: [0, 0.24, 0.156] }), materialIndex: 4 });
  slots.push({
    mesh: loftSectionsMesh(
      [
        [[-0.168, 0.33, 0.04], [-0.168, 0.33, 0.09], [-0.18, 0.33, 0.09], [-0.18, 0.33, 0.04]],
        [[-0.185, 0.14, 0.025], [-0.185, 0.14, 0.115], [-0.198, 0.14, 0.115], [-0.198, 0.14, 0.025]],
        [[-0.172, -0.03, 0.04], [-0.172, -0.03, 0.1], [-0.184, -0.03, 0.1], [-0.184, -0.03, 0.04]]
      ],
      true,
      false
    ),
    materialIndex: 5
  });

  // Sculpted ergonomic dual carry strap + hinged stand bracket + twin deployed stand legs with rubber feet
  for (const sSide of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sSide * 0.048, 0.35, -0.148, 0.015],
          [sSide * 0.072, 0.15, -0.252, 0.025],
          [sSide * 0.058, -0.09, -0.242, 0.023],
          [sSide * 0.036, -0.29, -0.152, 0.015]
        ],
        8
      ),
      materialIndex: 1
    });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.13, 0.065, 0.055, 0.012), { pos: [0, 0.31, -0.155] }), materialIndex: 2 });
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh(
        [
          [side * 0.052, 0.3, -0.152, 0.01],
          [side * 0.145, -0.08, -0.248, 0.0095],
          [side * 0.225, -0.448, -0.345, 0.009]
        ],
        8
      ),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.014], [0.02, -0.014], [0.016, 0.018], [0, 0.018]], 10), {
        pos: [side * 0.228, -0.452, -0.348]
      }),
      materialIndex: 2
    });
  }

  // 5 Forged cavity-back irons sticking out of front/mid divider slots (hosel + ferrule + angled forged blade head)
  const ironBladePoly: V2[] = [[-0.006, -0.012], [0.054, -0.014], [0.062, 0.016], [0.004, 0.012]];
  const ironBladeMesh = extrudePolygonMesh(ironBladePoly, 0.011, 0.0022, true);
  const irons: readonly [number, number, number, number, number][] = [
    [-0.068, 0.535, 0.058, 0.34, 0.22],
    [0.0, 0.548, 0.068, -0.18, 0.26],
    [0.068, 0.525, 0.052, -0.48, 0.3],
    [-0.066, 0.562, -0.005, 0.42, 0.18],
    [0.066, 0.556, -0.008, -0.36, 0.2]
  ];
  for (const [cx, cy, cz, yaw, loft] of irons) {
    slots.push({
      mesh: tubeSweepMesh([[cx * 0.76, 0.42, cz * 0.76, 0.0058], [cx, cy, cz, 0.0052]], 8),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0.0054, -0.018], [0.0076, -0.006], [0.0072, 0.012], [0, 0.012]], 10), {
        pos: [cx, cy, cz]
      }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(ironBladeMesh, { pos: [cx, cy + 0.016, cz], rot: [loft, yaw, 0.18] }),
      materialIndex: 3
    });
  }

  // Sculpted Driver (with knit headcover & pom), 3-Wood & Tour Mallet Putter in rear/top divider slots
  slots.push({ mesh: tubeSweepMesh([[-0.044, 0.42, -0.058, 0.0065], [-0.056, 0.6, -0.074, 0.006]], 8), materialIndex: 6 });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0.018, 0], [0.044, 0.03], [0.052, 0.095], [0.042, 0.145], [0, 0.155]], 16),
      { pos: [-0.058, 0.515, -0.076], rot: [-0.16, 0.25, 0.1] }
    ),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(icosphereSmoothMesh(0.028, 1, 0.06, 19), { pos: [-0.062, 0.682, -0.098] }),
    materialIndex: 5
  });
  // Uncovered titanium 3-Wood aerodynamic crown + face
  slots.push({ mesh: tubeSweepMesh([[0.042, 0.42, -0.056, 0.0062], [0.054, 0.59, -0.07, 0.0056]], 8), materialIndex: 6 });
  slots.push({
    mesh: transformMesh(icosphereSmoothMesh(0.044, 1, 0.02, 31), {
      pos: [0.072, 0.605, -0.076],
      rot: [0.12, -0.35, 0.14],
      scale: [1.18, 0.58, 0.96]
    }),
    materialIndex: 6
  });
  // Tour mallet putter in front-center well
  slots.push({ mesh: tubeSweepMesh([[0.018, 0.42, 0.018, 0.0056], [0.022, 0.515, 0.024, 0.0054]], 8), materialIndex: 3 });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.068, 0.018, 0.042, 0.005), { pos: [0.026, 0.528, 0.026], rot: [0.08, 0.12, 0] }),
    materialIndex: 4
  });

  const accentTone = fit.polo || "#184b39";
  const mats: AuraMaterialSpec[] = [
    refined
      ? material.physical({ color: "#184b39", roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.2, sheen: 0.32, sheenColor: accentTone })
      : material.pbr({ color: "#1f5f46", roughness: 0.76 }),
    material.physical({ color: "#a87444", roughness: 0.56, sheen: 0.42, sheenColor: "#dfbe93" }),
    material.blackRubber({ color: "#171a20", roughness: 0.84 }),
    material.brushedMetal({ color: "#d4dbe4", roughness: 0.2 }),
    material.studioMetal({ color: "#d9b45b", roughness: 0.24, metalness: 0.9 }),
    material.fabric({ color: "#f2ece0", roughness: 0.78, sheen: 0.36, sheenColor: "#ffffff" }),
    material.clearcoatPaint({ color: "#151b24", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 })
  ];
  return assembleMultiMaterialNode("golfer-bag", slots, mats, { id: "golfer-bag" });
}

/**
 * Championship 4-wheel British racing-green golf cart (`golfer-cart`, grounded `minY = 0`, `1.65 m` tall).
 * Splits opaque bodywork (`castShadow: true`) from WebGPU-safe `physical` raked windshield (`castShadow: false`).
 */
export function buildGolfCartNode(refined = true): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Championship British racing-green bodywork (`carPaint`)
  // Mat 1: Warm ivory sun canopy (`lacquer`)
  // Mat 2: Diamond-stitched saddle-tan leather upholstery (`fabric`)
  // Mat 3: Turf-tread rubber tires, floor mat & bumpers (`blackRubber`)
  // Mat 4: Forged 5-spoke alloy rims & canopy struts (`studioMetal`)
  // Mat 5: Warm-white LED headlamps (`emissive`)

  // Chassis floorpan, bumpers & rear bag well
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.14, 2.08, 0.03), { pos: [0, 0.25, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.14, 0.11, 0.14, 0.03), { pos: [0, 0.26, 1.1] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.12, 0.11, 0.14, 0.03), { pos: [0, 0.26, -1.08] }), materialIndex: 3 });

  // Lofted aerodynamic front cowl hood (`z` from `+1.06` nose back to `+0.30` dash)
  const cowlRing = (z: number, w: number, yBot: number, yTop: number, crown: number): V3[] => [
    [-w, yBot, z], [w, yBot, z], [w * 0.94, yTop, z], [0, yTop + crown, z], [-w * 0.94, yTop, z]
  ];
  slots.push({
    mesh: loftSectionsMesh([
      cowlRing(1.06, 0.44, 0.31, 0.56, 0.04),
      cowlRing(0.84, 0.53, 0.31, 0.68, 0.06),
      cowlRing(0.54, 0.55, 0.32, 0.77, 0.05),
      cowlRing(0.28, 0.55, 0.32, 0.82, 0.03)
    ], true, false),
    materialIndex: 0
  });
  // Rear body tub, wheel-arch fenders & bag well
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.1, 0.42, 0.92, 0.04), { pos: [0, 0.52, -0.5] }), materialIndex: 0 });
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.1, 0.54, 0.025), { pos: [side * 0.54, 0.48, 0.76] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.1, 0.56, 0.025), { pos: [side * 0.54, 0.48, -0.74] }), materialIndex: 0 });
  }

  // Saddle-tan bench seat cushion, bolstered backrest & hip restraint bars
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.02, 0.13, 0.48, 0.035), { pos: [0, 0.68, -0.14] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.98, 0.38, 0.11, 0.03), { pos: [0, 0.94, -0.4], rot: [-0.14, 0, 0] }), materialIndex: 2 });
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh([
        [side * 0.51, 0.66, 0.04, 0.016],
        [side * 0.51, 0.82, 0.02, 0.016],
        [side * 0.51, 0.82, -0.34, 0.016],
        [side * 0.51, 0.66, -0.36, 0.016]
      ], 7),
      materialIndex: 4
    });
  }

  // 4 forged 5-spoke wheels (`radius = 0.22`, grounded `minY = 0`)
  for (const [wx, wz] of [[-0.55, 0.76], [0.55, 0.76], [-0.55, -0.74], [0.55, -0.74]] as const) {
    const wheelSlots = wheelAssemblySlots({ radius: 0.22, width: 0.15, spokeCount: 5, tireMat: 3, rimMat: 4 });
    for (const ws of wheelSlots) {
      slots.push({ mesh: transformMesh(ws.mesh, { pos: [wx, 0.22, wz] }), materialIndex: ws.materialIndex });
    }
  }

  // Steering column, wheel, 4 aluminium canopy struts & cambered ivory sun canopy (`maxY = 1.65`)
  slots.push({ mesh: tubeSweepMesh([[0.26, 0.58, 0.44, 0.022], [0.26, 0.96, 0.18, 0.02]], 8), materialIndex: 4 });
  slots.push({
    mesh: transformMesh(latheMesh([[0.125, -0.014], [0.155, -0.014], [0.155, 0.014], [0.125, 0.014]], 18), {
      pos: [0.26, 0.98, 0.17],
      rot: [0.95, 0, 0]
    }),
    materialIndex: 3
  });
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: tubeSweepMesh([[side * 0.5, 0.8, 0.34, 0.018], [side * 0.47, 1.57, 0.2, 0.017]], 8), materialIndex: 4 });
    slots.push({ mesh: tubeSweepMesh([[side * 0.5, 0.74, -0.78, 0.018], [side * 0.48, 1.57, -0.84, 0.017]], 8), materialIndex: 4 });
  }
  const roofRing = (z: number, w: number, yEdge: number, arch: number): V3[] => [
    [-w, yEdge, z], [w, yEdge, z], [w * 0.96, yEdge + 0.045, z], [0, yEdge + 0.045 + arch, z], [-w * 0.96, yEdge + 0.045, z]
  ];
  slots.push({
    mesh: loftSectionsMesh([
      roofRing(0.38, 0.56, 1.56, 0.03),
      roofRing(-0.22, 0.58, 1.58, 0.045),
      roofRing(-0.94, 0.56, 1.56, 0.03)
    ], true, false),
    materialIndex: 1
  });
  // Recessed front LED headlamps
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.075, 0.04, 0.012), { pos: [side * 0.34, 0.5, 1.05] }), materialIndex: 5 });
  }

  const mats: AuraMaterialSpec[] = [
    refined
      ? material.carPaint({ color: "#184b39", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 })
      : material.pbr({ color: "#1c5842", roughness: 0.42 }),
    material.lacquer({ color: "#f3eee3", roughness: 0.22, clearcoat: 0.88 }),
    material.fabric({ color: "#b68352", roughness: 0.66, sheen: 0.48, sheenColor: "#e6c79c" }),
    material.blackRubber({ color: "#191c22", roughness: 0.8 }),
    material.studioMetal({ color: "#dce3ec", roughness: 0.18, metalness: 0.92 }),
    material.emissive({ color: "#fff6dc", emissive: "#ffe4a8", emissiveIntensity: 0.85 })
  ];
  const bodyNode = assembleMultiMaterialNode("golfer-cart-body", slots, mats);

  const windshieldSpec = cachedSpec("links:cart-windshield", () =>
    mergeRawMeshes([
      transformMesh(bevelBoxMesh(0.96, 0.62, 0.016, 0.004), { pos: [0, 1.18, 0.27], rot: [-0.21, 0, 0] })
    ])
  );
  const glassNode = geometry.custom(windshieldSpec, {
    name: "golfer-cart-windshield",
    material: makeLinksWindowGlassMat("#d8eef8", 0.44),
    castShadow: false,
    receiveShadow: false
  });
  return group("golfer-cart", [bodyNode, glassNode]).runtime(game.runtimeNode("golfer-cart"));
}

/**
 * Grounded tournament pin flagstick (`flagstick`, `minY = 0`, `3.1 m` tall).
 * Woven pennant banner extends along `+X` so calm/lunar holes show a crisp broadside silhouette.
 */
export function buildPinFlagstickNode(accentHex = "#ffd257", position?: Vec3): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Tapered ivory fiberglass pole (`lacquer`)
  // Mat 1: Turned brass cup ferrule & top acorn finial (`studioMetal`)
  // Mat 2: Rippled woven tournament pennant (`fabric`)
  // Mat 3: Piped championship trim border (`fabric`)

  slots.push({
    mesh: latheMesh([[0, 0], [0.022, 0], [0.024, 0.16], [0.014, 0.18], [0, 0.18]], 14),
    materialIndex: 1
  });
  slots.push({
    mesh: latheMesh([[0.013, 0.16], [0.012, 1.6], [0.01, 3.03], [0, 3.03]], 12),
    materialIndex: 0
  });
  slots.push({
    mesh: latheMesh([[0, 3.02], [0.018, 3.04], [0.026, 3.07], [0.014, 3.095], [0, 3.11]], 14),
    materialIndex: 1
  });

  // Rippled woven pennant (`x in [0.014, 0.66]`, `y in [2.56, 3.01]`)
  const flagCols = 6;
  const sections: V3[][] = [];
  for (let c = 0; c <= flagCols; c += 1) {
    const u = c / flagCols;
    const x = 0.014 + u * 0.64;
    const wave = Math.sin(u * Math.PI * 1.65) * 0.034 * u;
    const taper = 1 - u * 0.12;
    const yMid = 2.79 - u * 0.025;
    const hHalf = 0.21 * taper;
    sections.push([
      [x, yMid - hHalf, wave - 0.005],
      [x, yMid - hHalf, wave + 0.005],
      [x, yMid + hHalf, wave + 0.005],
      [x, yMid + hHalf, wave - 0.005]
    ]);
  }
  slots.push({ mesh: loftSectionsMesh(sections, true, false), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.026, 0.44, 0.018, 0.004), { pos: [0.02, 2.79, 0] }), materialIndex: 3 });

  const mats: AuraMaterialSpec[] = [
    material.lacquer({ color: "#faf6ea", roughness: 0.24, clearcoat: 0.82 }),
    material.studioMetal({ color: "#dfba62", roughness: 0.2, metalness: 0.94 }),
    material.fabric({ color: accentHex, roughness: 0.68, sheen: 0.42, sheenColor: "#fff4d2" }),
    material.fabric({ color: "#1c2833", roughness: 0.72, sheen: 0.25, sheenColor: "#485a6c" })
  ];
  return assembleMultiMaterialNode("flagstick", slots, mats, {
    id: "flagstick",
    ...(position ? { position } : {})
  });
}

/**
 * Dimple-faceted tour urethane golf ball (`golf-ball`, grounded `minY = 0`, `maxY = 2 * ballRadius`).
 */
export function buildGolfBallNode(ballRadius: number, turfOn: boolean): any {
  const spec = cachedSpec(`links:golf-ball:${ballRadius.toFixed(4)}`, () =>
    mergeRawMeshes([transformMesh(icosphereFacetMesh(ballRadius, 2, 0.012, 7), { pos: [0, ballRadius, 0] })])
  );
  const ballMat = turfOn
    ? material.clearcoatPaint({ color: "#fcfdfa", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 })
    : material.pbr({ color: "#fcfdfa", roughness: 0.24 });
  return geometry
    .custom(spec, { name: "golf-ball", material: ballMat, castShadow: true, receiveShadow: true })
    .runtime(game.runtimeNode("golf-ball"));
}

// ---------------------------------------------------------------------------
// 2. Tee Markers, Ball Washer, Yardage Monuments & Tournament Bleachers
// ---------------------------------------------------------------------------

export function buildTeeFurnitureNodes(
  course: CourseSpec,
  hole: HoleSpec,
  terrain: HoleTerrain,
  turfOn: boolean
): any[] {
  const nodes: any[] = [];
  const markerSpec = cachedSpec("links:tee-marker", () => {
    const prof: V2[] = [
      [0, 0], [0.022, 0], [0.022, 0.04], [0.11, 0.045], [0.128, 0.09], [0.105, 0.135], [0.04, 0.155], [0, 0.16]
    ];
    return mergeRawMeshes([latheMesh(prof, 16)]);
  });
  const markMat = material.clearcoatPaint({ color: "#c83b2b", roughness: 0.2, clearcoat: 0.92, clearcoatRoughness: 0.08 });
  if (turfOn) {
    nodes.push(
      instances.custom(markerSpec, {
        name: "tee-markers",
        material: material.pbr({ color: "#c83b2b", roughness: 0.28, metalness: 0.12, clearcoat: 0, sheen: 0 } as any),
        castShadow: true,
        transforms: [-3.2, 3.2].map((dx) => ({
          position: [terrain.tee[0] + dx, terrain.tee[1] + 0.025, terrain.tee[2]] as Vec3
        }))
      })
    );
  } else {
    for (const [id, dx] of [["l", -3.2], ["r", 3.2]] as const) {
      nodes.push(
        geometry
          .custom(markerSpec, { name: `tee-marker-${id}`, material: markMat, castShadow: true })
          .position(terrain.tee[0] + dx, terrain.tee[1] + 0.025, terrain.tee[2])
      );
    }
  }

  if (!turfOn) return nodes;

  // Post-mounted tournament ball washer + hanging microfiber towel beside right tee marker
  const bwX = terrain.tee[0] + 4.35;
  const bwZ = terrain.tee[2] - 1.15;
  const bwY = terrain.height(bwX, bwZ);
  const washerSlots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [0.13, 0], [0.11, 0.06], [0.032, 0.07], [0.03, 0.78], [0, 0.78]], 12), materialIndex: 2 },
    { mesh: latheMesh([[0, 0.76], [0.11, 0.78], [0.135, 0.92], [0.125, 1.08], [0.09, 1.12], [0, 1.12]], 16), materialIndex: 0 },
    { mesh: tubeSweepMesh([[0, 1.1, 0, 0.012], [0, 1.27, 0, 0.012]], 8), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.11, 0.028, 0.032, 0.008), { pos: [0, 1.28, 0] }), materialIndex: 2 },
    {
      mesh: loftSectionsMesh([
        [[-0.08, 0.88, 0.13], [0.08, 0.88, 0.13], [0.08, 0.88, 0.145], [-0.08, 0.88, 0.145]],
        [[-0.095, 0.68, 0.155], [0.095, 0.68, 0.155], [0.095, 0.68, 0.17], [-0.095, 0.68, 0.17]],
        [[-0.075, 0.5, 0.14], [0.075, 0.5, 0.14], [0.075, 0.5, 0.155], [-0.075, 0.5, 0.155]]
      ], true, false),
      materialIndex: 3
    }
  ];
  nodes.push(
    assembleMultiMaterialNode(
      "tee-ball-washer",
      washerSlots,
      [
        material.clearcoatPaint({ color: "#1c4d3a", roughness: 0.22, clearcoat: 0.9 }),
        material.chrome({ color: "#e6edf5", roughness: 0.08 }),
        material.blackRubber({ color: "#1b1e24", roughness: 0.8 }),
        material.fabric({ color: "#f3efe4", roughness: 0.78, sheen: 0.35, sheenColor: "#ffffff" })
      ],
      { position: [bwX, bwY, bwZ] }
    )
  );

  // Carved granite & oak hole yardage monument + SDF text (`tee-sign` & `tee-sign-text`)
  const yaw = terrain.lineYaw + Math.PI;
  const sx = terrain.tee[0] + Math.cos(terrain.lineYaw) * 5.2 + Math.sin(terrain.lineYaw);
  const sz = terrain.tee[2] - Math.sin(terrain.lineYaw) * 5.2 + Math.cos(terrain.lineYaw);
  const sy = terrain.height(sx, sz);
  const signSlots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.55, 0.24, 0.48, 0.03), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 1.16, 0.18, 0.02), { pos: [-0.95, 0.66, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 1.16, 0.18, 0.02), { pos: [0.95, 0.66, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(2.42, 0.62, 0.12, 0.025), { pos: [0, 1.06, 0] }), materialIndex: 2 },
    { mesh: transformMesh(gablePrismMesh(2.58, 0.34, 0.18, 0.04), { pos: [0, 1.37, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(2.18, 0.04, 0.15, 0.008), { pos: [0, 0.78, 0] }), materialIndex: 3 }
  ];
  nodes.push(
    assembleMultiMaterialNode(
      "tee-sign",
      signSlots,
      [
        material.ceramic({ color: "#8e887c", roughness: 0.82 }),
        material.physical({ color: "#4a3525", roughness: 0.72 }),
        material.lacquer({ color: "#1d382c", roughness: 0.3, clearcoat: 0.72 }),
        material.studioMetal({ color: "#d6b058", roughness: 0.24, metalness: 0.9 })
      ],
      { position: [sx, sy, sz], rotation: [0, yaw, 0] }
    ),
    text3D(`${hole.number}  PAR ${hole.par}  ${hole.lengthM} M`, {
      name: "tee-sign-text",
      size: 0.18,
      backend: "sdf",
      castShadow: false,
      material: material.pbr({ color: "#f6ebd0", roughness: 0.36, metalness: 0.18 })
    })
      .position(sx - Math.cos(yaw) * 1.02 + Math.sin(yaw) * 0.08, sy + 1.01, sz + Math.sin(yaw) * 1.02 + Math.cos(yaw) * 0.08)
      .rotate(0, yaw, 0)
  );

  // Fairway 200 m / 150 m / 100 m tournament yardage bollards batched into lean `instances.custom` draws
  const stakePostSpec = cachedSpec("links:yardage-stake-post", () =>
    mergeRawMeshes([latheMesh([[0, 0], [0.09, 0], [0.08, 0.14], [0.055, 0.16], [0.052, 0.88], [0, 0.9]], 12)])
  );
  const stakeBandSpec = cachedSpec("links:yardage-stake-band", () =>
    mergeRawMeshes([latheMesh([[0.055, 0.56], [0.058, 0.56], [0.058, 0.76], [0.055, 0.76]], 12)])
  );
  const stakeTransforms: { position: Vec3 }[] = [];
  const stakeColors: string[] = [];
  for (const [remM, stripeHex] of [[200, "#3a7bd5"], [150, "#f5f2e8"], [100, "#d64535"]] as const) {
    if (hole.lengthM < remM + 55) continue;
    const u = Math.max(0.16, Math.min(0.86, 1 - remM / hole.lengthM));
    const idx = Math.min(hole.layout.path.length - 1, Math.floor(u * (hole.layout.path.length - 1)));
    const pt = hole.layout.path[idx] ?? [0, hole.lengthM * u];
    for (const side of [-1, 1] as const) {
      const bx = pt[0] + side * (hole.layout.fairwayWidth * 0.5 + 1.1);
      const bz = pt[1];
      stakeTransforms.push({ position: [bx, terrain.height(bx, bz), bz] });
      stakeColors.push(stripeHex);
    }
  }
  if (stakeTransforms.length > 0) {
    nodes.push(
      instances.custom(stakePostSpec, {
        name: "yardage-stakes",
        material: material.pbr({ color: "#204736", roughness: 0.34, clearcoat: 0, sheen: 0 } as any),
        transforms: stakeTransforms,
        castShadow: true
      }),
      instances.custom(stakeBandSpec, {
        name: "yardage-stake-bands",
        material: material.pbr({ color: "#ffffff", roughness: 0.28, clearcoat: 0, sheen: 0 } as any),
        transforms: stakeTransforms,
        colors: stakeColors,
        castShadow: false
      })
    );
  }
  return nodes;
}

/**
 * Tailored golf figure (`y = 0..height`) built on `articulatedFolkSlots` (zero floating shoulder orbs!):
 * sculpted polo collar & placket / sweater vest, curved-brim golf cap or tour visor, pleated trousers,
 * two-tone saddle golf shoes with welt sole, and optional caddie bib apron or marshal quiet paddle.
 */
export function golfApparelFolkSlots(opts: {
  readonly height?: number;
  readonly poloMat: number;
  readonly vestTrimMat: number;
  readonly skinMat: number;
  readonly capMat: number;
  readonly trouserMat: number;
  readonly shoeMat: number;
  readonly shoeSaddleMat: number;
  readonly visorStyle?: boolean;
  readonly caddieBibMat?: number;
  readonly marshalPaddleMat?: number;
  readonly seed?: number;
}): MultiMatSlot[] {
  const h = opts.height ?? 1.78;
  const s = h / 1.72;
  const seed = opts.seed ?? 17;
  // Base organic articulated human (`wearingHat: false` so we mount bespoke golf cap / tour visor)
  const slots: MultiMatSlot[] = articulatedFolkSlots({
    height: h,
    coatMat: opts.poloMat,
    trimMat: opts.vestTrimMat,
    skinMat: opts.skinMat,
    hairHatMat: opts.capMat,
    trouserMat: opts.trouserMat,
    shoeMat: opts.shoeMat,
    wearingHat: false,
    seed
  });

  // Two-tone saddle leather golf shoe straps & cleated welt soles
  const stride = (hash01(seed * 13 + 3) - 0.5) * 0.07 * s;
  for (const side of [-1, 1] as const) {
    const lx = side * 0.095 * s;
    const sz = side * stride;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.102 * s, 0.022 * s, 0.222 * s, 0.006 * s), {
        pos: [lx, 0.011 * s, sz + 0.036 * s]
      }),
      materialIndex: opts.vestTrimMat
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.099 * s, 0.056 * s, 0.088 * s, 0.014 * s), {
        pos: [lx, 0.044 * s, sz + 0.028 * s]
      }),
      materialIndex: opts.shoeSaddleMat
    });
  }

  // Tailored polo button placket + folded collar wings + belt buckle
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.046 * s, 0.16 * s, 0.024 * s, 0.006 * s), {
      pos: [0, 1.24 * s, 0.132 * s],
      rot: [-0.08, 0, 0]
    }),
    materialIndex: opts.vestTrimMat
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.052 * s, 0.038 * s, 0.022 * s, 0.005 * s), {
      pos: [0, 0.895 * s, 0.178 * s]
    }),
    materialIndex: opts.shoeSaddleMat
  });

  // Sculpted curved-brim tour golf cap or open-crown sun visor (`+Z` forward face)
  const billArch: V3[][] = [
    [[-0.086 * s, 1.605 * s, 0.08 * s], [0, 1.622 * s, 0.086 * s], [0.086 * s, 1.605 * s, 0.08 * s], [0, 1.614 * s, 0.078 * s]],
    [[-0.078 * s, 1.588 * s, 0.188 * s], [0, 1.606 * s, 0.205 * s], [0.078 * s, 1.588 * s, 0.188 * s], [0, 1.598 * s, 0.196 * s]]
  ];
  slots.push({ mesh: loftSectionsMesh(billArch, true, false), materialIndex: opts.capMat });
  if (opts.visorStyle) {
    slots.push({
      mesh: transformMesh(latheMesh([[0.106 * s, 0], [0.114 * s, 0.012 * s], [0.114 * s, 0.046 * s], [0.106 * s, 0.052 * s]], 16), {
        pos: [0, 1.585 * s, 0.008 * s],
        rot: [-0.08, 0, 0]
      }),
      materialIndex: opts.capMat
    });
  } else {
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.116 * s, 2, 0.018, seed + 43), {
        pos: [0, 1.605 * s, 0.004 * s],
        scale: [0.96, 0.78, 1.04]
      }),
      materialIndex: opts.capMat
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.016 * s, 1, 0.01, seed + 5), { pos: [0, 1.694 * s, 0.004 * s] }),
      materialIndex: opts.vestTrimMat
    });
  }

  // Optional tournament caddie bib apron (front & back panels + shoulder straps + yardage book)
  if (opts.caddieBibMat !== undefined) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.31 * s, 0.38 * s, 0.024 * s, 0.008 * s), { pos: [0, 1.11 * s, 0.136 * s] }),
      materialIndex: opts.caddieBibMat
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.31 * s, 0.38 * s, 0.024 * s, 0.008 * s), { pos: [0, 1.11 * s, -0.128 * s] }),
      materialIndex: opts.caddieBibMat
    });
    for (const bSide of [-1, 1] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [[bSide * 0.11 * s, 1.29 * s, 0.12 * s, 0.016 * s], [bSide * 0.12 * s, 1.37 * s, 0, 0.016 * s], [bSide * 0.11 * s, 1.29 * s, -0.11 * s, 0.016 * s]],
          6
        ),
        materialIndex: opts.caddieBibMat
      });
    }
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.095 * s, 0.13 * s, 0.022 * s, 0.005 * s), { pos: [0.09 * s, 0.88 * s, -0.132 * s], rot: [0.1, 0, -0.08] }),
      materialIndex: opts.capMat
    });
  }

  // Optional course marshal raised "QUIET" paddle
  if (opts.marshalPaddleMat !== undefined) {
    slots.push({
      mesh: tubeSweepMesh([[0.22 * s, 0.82 * s, 0.1 * s, 0.012 * s], [0.27 * s, 1.72 * s, 0.13 * s, 0.012 * s]], 6),
      materialIndex: opts.shoeSaddleMat
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.28 * s, 0.36 * s, 0.022 * s, 0.008 * s), { pos: [0.275 * s, 1.88 * s, 0.132 * s], rot: [0, -0.18, -0.04] }),
      materialIndex: opts.marshalPaddleMat
    });
  }

  return slots;
}

/**
 * Sculpted `articulatedFolkSlots` Tour Caddie (`caddy-body`, `1.78 m` tall, grounded `minY = 0`)
 * wearing collared golf polo, white tournament caddie bib, curved-brim cap, chinos, and saddle golf shoes.
 */
export function buildGolfCaddieNode(fit: GolferFit, refined = true): any {
  const slots = golfApparelFolkSlots({
    height: 1.78,
    poloMat: 0,
    vestTrimMat: 1,
    skinMat: 2,
    capMat: 3,
    trouserMat: 4,
    shoeMat: 5,
    shoeSaddleMat: 6,
    caddieBibMat: 1,
    seed: 23
  });
  const poloHex = shadeHex(fit.polo || "#1f5f46", 0.88);
  const skinHex = fit.skin || "#c88d62";
  const capHex = fit.cap || "#16382b";
  const mats: AuraMaterialSpec[] = [
    refined ? material.fabric({ color: poloHex, roughness: 0.74, sheen: 0.3, sheenColor: "#ffffff" }) : material.pbr({ color: poloHex, roughness: 0.78 }),
    material.fabric({ color: "#f4f1e8", roughness: 0.76, sheen: 0.28, sheenColor: "#ffffff" }),
    material.physical({ color: skinHex, roughness: 0.62 }),
    material.fabric({ color: capHex, roughness: 0.72, sheen: 0.25, sheenColor: "#dfece6" }),
    material.fabric({ color: "#cfc6b4", roughness: 0.8, sheen: 0.2, sheenColor: "#efe9dc" }),
    material.physical({ color: "#f6f3ec", roughness: 0.42, clearcoat: 0.3 }),
    material.physical({ color: "#6b4428", roughness: 0.48 })
  ];
  return assembleMultiMaterialNode("caddy-body", slots, mats, { id: "caddy-body" }).animate({
    clip: "Idle_Loop",
    loop: true,
    speed: 0.9
  });
}

/**
 * Sculpted `articulatedFolkSlots` golfer figure (`1.82 m` tall, zero floating shoulder orbs) for procedural trim/display.
 */
export function buildSculptedGolferFigureNode(fit: GolferFit, refined = true, name = "golfer-folk-figure"): any {
  const slots = golfApparelFolkSlots({
    height: 1.82,
    poloMat: 0,
    vestTrimMat: 1,
    skinMat: 2,
    capMat: 3,
    trouserMat: 4,
    shoeMat: 5,
    shoeSaddleMat: 6,
    seed: 11
  });
  const poloHex = fit.polo || "#2f6ea3";
  const mats: AuraMaterialSpec[] = [
    refined ? material.fabric({ color: poloHex, roughness: 0.72, sheen: 0.34, sheenColor: "#ffffff" }) : material.pbr({ color: poloHex, roughness: 0.76 }),
    material.fabric({ color: "#f6f3eb", roughness: 0.75 }),
    material.physical({ color: fit.skin || "#c68a5a", roughness: 0.6 }),
    material.fabric({ color: fit.cap || "#14200f", roughness: 0.7 }),
    material.fabric({ color: "#dcd5c7", roughness: 0.78 }),
    material.physical({ color: "#f7f5ef", roughness: 0.4, clearcoat: 0.35 }),
    material.physical({ color: "#222933", roughness: 0.46 })
  ];
  return assembleMultiMaterialNode(name, slots, mats);
}

/**
 * Articulated 14-joint procedural Pro Golfer (`golfer-body`, scaled to `1.84 m`, grounded `minY = 0`)
 * built on `meshyProfile()`'s exact joint positions so `solveSwing` drives both palms onto the golf club
 * grip and keeps both tour golf shoes planted on the turf with zero `.glb` files.
 */
export function buildArticulatedGolferNode(
  fit: GolferFit,
  refined = true,
  clip = "idle",
  clipSpeed = 1
): any {
  const prof = meshyProfile();
  const { rig, leg } = prof;
  const rt = (id: string) => game.runtimeNode(id);

  const poloHex = fit.polo || "#24639a";
  const skinHex = fit.skin || "#c98d60";
  const capHex = fit.cap || "#162b22";
  const poloMat = refined
    ? material.fabric({ color: poloHex, roughness: 0.7, sheen: 0.36, sheenColor: "#ffffff" })
    : material.pbr({ color: poloHex, roughness: 0.74 });
  const ivoryMat = material.fabric({ color: "#f6f3ea", roughness: 0.74, sheen: 0.28, sheenColor: "#ffffff" });
  const skinMat = material.physical({ color: skinHex, roughness: 0.58 });
  const capMat = material.fabric({ color: capHex, roughness: 0.68, sheen: 0.26, sheenColor: "#dce8e2" });
  const chinoMat = material.fabric({ color: "#dcd4c4", roughness: 0.78, sheen: 0.2, sheenColor: "#f3ede0" });
  const beltLeatherMat = material.physical({ color: "#4e331e", roughness: 0.46 });
  const brassMat = material.studioMetal({ color: "#dfba62", roughness: 0.22, metalness: 0.92 });
  const shoeWhiteMat = material.physical({ color: "#f8f6f0", roughness: 0.36, clearcoat: 0.42 });
  const shoeSaddleMat = material.physical({ color: "#222b36", roughness: 0.44 });
  const gloveMat = material.physical({ color: "#fbfaf6", roughness: 0.5, sheen: 0.25, sheenColor: "#ffffff" });
  const hairMat = material.fabric({ color: "#2b211a", roughness: 0.84 });

  const golferMats: AuraMaterialSpec[] = [
    poloMat,        // 0
    ivoryMat,       // 1
    skinMat,        // 2
    capMat,         // 3
    chinoMat,       // 4
    beltLeatherMat, // 5
    brassMat,       // 6
    shoeWhiteMat,   // 7
    shoeSaddleMat,  // 8
    gloveMat,       // 9
    hairMat         // 10
  ];

  // 1. Head + neck + curved-brim championship golf cap (`golfer-head` at `rig.tHead` relative to `golfer-chest`)
  const headSlots: MultiMatSlot[] = [
    { mesh: tubeSweepMesh([[0, -0.055, -0.008, 0.054], [0, 0.025, 0, 0.048]], 10), materialIndex: 2 },
    { mesh: transformMesh(icosphereSmoothMesh(0.104, 2, 0.012, 17), { pos: [0, 0.115, 0.008], scale: [0.92, 1.06, 0.98] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0.01, 21), { pos: [-0.094, 0.112, 0.004], scale: [0.55, 0.95, 0.75] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0.01, 22), { pos: [0.094, 0.112, 0.004], scale: [0.55, 0.95, 0.75] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereSmoothMesh(0.098, 1, 0.02, 29), { pos: [0, 0.125, -0.018], scale: [0.96, 0.88, 0.96] }), materialIndex: 10 },
    { mesh: transformMesh(icosphereSmoothMesh(0.11, 2, 0.014, 33), { pos: [0, 0.168, 0.006], scale: [0.96, 0.76, 1.04] }), materialIndex: 3 },
    {
      mesh: loftSectionsMesh(
        [
          [[-0.084, 0.162, 0.078], [0, 0.178, 0.086], [0.084, 0.162, 0.078], [0, 0.17, 0.076]],
          [[-0.076, 0.146, 0.186], [0, 0.162, 0.204], [0.076, 0.146, 0.186], [0, 0.155, 0.194]]
        ],
        true,
        false
      ),
      materialIndex: 3
    },
    { mesh: transformMesh(bevelBoxMesh(0.036, 0.02, 0.008, 0.002), { pos: [0, 0.182, 0.106], rot: [-0.15, 0, 0] }), materialIndex: 1 }
  ];
  const headNode = group("golfer-head", [assembleMultiMaterialNode("golfer-head-mesh", headSlots, golferMats)])
    .position(rig.tHead[0], rig.tHead[1], rig.tHead[2])
    .runtime(rt("golfer-head"));

  // 2. Arms (`golfer-arm-l/r` -> `golfer-forearm-l/r`)
  const buildArmBranch = (side: "l" | "r") => {
    const isLeft = side === "l";
    const tShoulder = isLeft ? rig.tShoulderL : rig.tShoulderR;
    const tFore = isLeft ? rig.tForearmL : rig.tForearmR;
    const palm = isLeft ? rig.palmL : rig.palmR;
    const sleeveEnd: V3 = [tFore[0] * 0.48, tFore[1] * 0.48, tFore[2] * 0.48];
    const wristPt: V3 = [palm[0] * 0.74, palm[1] * 0.74, palm[2] * 0.74];

    const upperSlots: MultiMatSlot[] = [
      { mesh: transformMesh(icosphereSmoothMesh(0.068, 1, 0.01, isLeft ? 41 : 42), { pos: [0, 0.006, 0] }), materialIndex: 0 },
      { mesh: tubeSweepMesh([[0, 0, 0, 0.064], [sleeveEnd[0], sleeveEnd[1], sleeveEnd[2], 0.056]], 10), materialIndex: 0 },
      {
        mesh: tubeSweepMesh(
          [
            [sleeveEnd[0] * 0.92, sleeveEnd[1] * 0.92, sleeveEnd[2] * 0.92, 0.058],
            [sleeveEnd[0], sleeveEnd[1], sleeveEnd[2], 0.058]
          ],
          10
        ),
        materialIndex: 1
      },
      { mesh: tubeSweepMesh([[sleeveEnd[0] * 0.88, sleeveEnd[1] * 0.88, sleeveEnd[2] * 0.88, 0.048], [tFore[0], tFore[1], tFore[2], 0.043]], 10), materialIndex: 2 },
      { mesh: transformMesh(icosphereSmoothMesh(0.044, 1, 0.008, isLeft ? 43 : 44), { pos: [tFore[0], tFore[1], tFore[2]] }), materialIndex: 2 }
    ];

    const handMat = isLeft ? 9 : 2; // Tour white cabretta golf glove on lead (left) hand
    const foreSlots: MultiMatSlot[] = [
      { mesh: tubeSweepMesh([[0, 0, 0, 0.043], [wristPt[0], wristPt[1], wristPt[2], 0.034]], 10), materialIndex: 2 },
      ...(isLeft
        ? [
            {
              mesh: tubeSweepMesh(
                [
                  [wristPt[0] * 0.9, wristPt[1] * 0.9, wristPt[2] * 0.9, 0.037],
                  [wristPt[0] * 1.04, wristPt[1] * 1.04, wristPt[2] * 1.04, 0.038]
                ],
                10
              ),
              materialIndex: 9
            }
          ]
        : []),
      {
        mesh: tubeSweepMesh(
          [
            [wristPt[0], wristPt[1], wristPt[2], 0.036],
            [palm[0], palm[1], palm[2], 0.042]
          ],
          10
        ),
        materialIndex: handMat
      },
      {
        mesh: transformMesh(icosphereSmoothMesh(0.044, 1, 0.01, isLeft ? 45 : 46), {
          pos: [palm[0], palm[1], palm[2]],
          scale: [0.92, 0.86, 1.08]
        }),
        materialIndex: handMat
      }
    ];

    const forearmNode = group(`golfer-forearm-${side}`, [
      assembleMultiMaterialNode(`golfer-forearm-mesh-${side}`, foreSlots, golferMats)
    ])
      .position(tFore[0], tFore[1], tFore[2])
      .runtime(rt(`golfer-forearm-${side}`));

    return group(`golfer-arm-${side}`, [
      assembleMultiMaterialNode(`golfer-arm-mesh-${side}`, upperSlots, golferMats),
      forearmNode
    ])
      .position(tShoulder[0], tShoulder[1], tShoulder[2])
      .runtime(rt(`golfer-arm-${side}`));
  };

  // 3. Chest (`golfer-chest` at `rig.tChest` relative to `golfer-spine`) & Spine (`golfer-spine` at `rig.tSpine` relative to `golfer-hips`)
  const chestRing = (y: number, rx: number, rz: number, zOff: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      pts.push([Math.cos(a) * rx, y, Math.sin(a) * rz + zOff]);
    }
    return pts;
  };
  const chestSlots: MultiMatSlot[] = [
    {
      mesh: loftSectionsMesh(
        [
          chestRing(-0.14, 0.162, 0.114, 0.008),
          chestRing(-0.02, 0.184, 0.126, 0.012),
          chestRing(0.075, 0.198, 0.128, 0.008),
          chestRing(0.135, 0.152, 0.102, 0.002)
        ],
        true,
        true
      ),
      materialIndex: 0
    },
    // Crisp folded tour polo collar + 3-button placket
    {
      mesh: transformMesh(latheMesh([[0.058, 0.118], [0.078, 0.128], [0.082, 0.162], [0.062, 0.166]], 14), {
        pos: [0, 0, 0.004]
      }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.044, 0.15, 0.022, 0.005), { pos: [0, 0.048, 0.126], rot: [-0.08, 0, 0] }),
      materialIndex: 1
    }
  ];
  const chestNode = group("golfer-chest", [
    assembleMultiMaterialNode("golfer-chest-mesh", chestSlots, golferMats),
    headNode,
    buildArmBranch("l"),
    buildArmBranch("r")
  ])
    .position(rig.tChest[0], rig.tChest[1], rig.tChest[2])
    .runtime(rt("golfer-chest"));

  const spineSlots: MultiMatSlot[] = [
    {
      mesh: loftSectionsMesh(
        [
          chestRing(-0.08, 0.154, 0.11, 0.006),
          chestRing(0.04, 0.158, 0.112, 0.008),
          chestRing(0.15, 0.164, 0.116, 0.008)
        ],
        true,
        true
      ),
      materialIndex: 0
    }
  ];
  const spineNode = group("golfer-spine", [
    assembleMultiMaterialNode("golfer-spine-mesh", spineSlots, golferMats),
    chestNode
  ])
    .position(rig.tSpine[0], rig.tSpine[1], rig.tSpine[2])
    .runtime(rt("golfer-spine"));

  // 4. Legs (`golfer-thigh-l/r` -> `golfer-shin-l/r` -> `golfer-foot-l/r`)
  const buildLegBranch = (side: "l" | "r") => {
    const isLeft = side === "l";
    const hipJ = isLeft ? leg.hipJointL : leg.hipJointR;
    const thighLen = isLeft ? leg.thighL : leg.thighR;
    const shinLen = isLeft ? leg.shinL : leg.shinR;
    const thighDir = isLeft ? leg.thighBindL : leg.thighBindR;
    const shinDir = isLeft ? leg.shinBindL : leg.shinBindR;
    const ankleY = isLeft ? leg.ankleL[1] : leg.ankleR[1];
    const kneeOff: V3 = [thighDir[0] * thighLen, thighDir[1] * thighLen, thighDir[2] * thighLen];
    const ankleOff: V3 = [shinDir[0] * shinLen, shinDir[1] * shinLen, shinDir[2] * shinLen];

    const thighSlots: MultiMatSlot[] = [
      { mesh: transformMesh(icosphereSmoothMesh(0.086, 1, 0.008, isLeft ? 51 : 52), { pos: [0, 0, 0] }), materialIndex: 4 },
      {
        mesh: tubeSweepMesh(
          [
            [0, 0, 0, 0.086],
            [kneeOff[0] * 0.5, kneeOff[1] * 0.5, kneeOff[2] * 0.5, 0.076],
            [kneeOff[0], kneeOff[1], kneeOff[2], 0.064]
          ],
          12
        ),
        materialIndex: 4
      },
      { mesh: transformMesh(icosphereSmoothMesh(0.064, 1, 0.008, isLeft ? 53 : 54), { pos: kneeOff }), materialIndex: 4 }
    ];

    const shinSlots: MultiMatSlot[] = [
      {
        mesh: tubeSweepMesh(
          [
            [0, 0, 0, 0.063],
            [ankleOff[0] * 0.45, ankleOff[1] * 0.45, ankleOff[2] * 0.45, 0.058],
            [ankleOff[0] * 0.92, ankleOff[1] * 0.92, ankleOff[2] * 0.92, 0.048]
          ],
          12
        ),
        materialIndex: 4
      },
      // Trouser hem cuff
      {
        mesh: tubeSweepMesh(
          [
            [ankleOff[0] * 0.86, ankleOff[1] * 0.86, ankleOff[2] * 0.86, 0.052],
            [ankleOff[0] * 0.96, ankleOff[1] * 0.96, ankleOff[2] * 0.96, 0.053]
          ],
          12
        ),
        materialIndex: 4
      }
    ];

    // Two-tone tour saddle golf shoe grounded cleanly at `y = -ankleY` (`minY = 0` in model space)
    const soleY = -ankleY;
    const footSlots: MultiMatSlot[] = [
      { mesh: tubeSweepMesh([[0, 0.02, 0, 0.044], [0, soleY + 0.058, 0.012, 0.046]], 10), materialIndex: 1 },
      {
        mesh: transformMesh(bevelBoxMesh(0.104, 0.024, 0.246, 0.007), { pos: [0, soleY + 0.012, 0.052] }),
        materialIndex: 8
      },
      {
        mesh: loftSectionsMesh(
          [
            [[-0.048, soleY + 0.024, -0.062], [0.048, soleY + 0.024, -0.062], [0.044, soleY + 0.088, -0.054], [-0.044, soleY + 0.088, -0.054]],
            [[-0.052, soleY + 0.024, 0.045], [0.052, soleY + 0.024, 0.045], [0.048, soleY + 0.082, 0.038], [-0.048, soleY + 0.082, 0.038]],
            [[-0.042, soleY + 0.024, 0.165], [0.042, soleY + 0.024, 0.165], [0.034, soleY + 0.058, 0.158], [-0.034, soleY + 0.058, 0.158]]
          ],
          true,
          true
        ),
        materialIndex: 7
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.106, 0.056, 0.092, 0.012), { pos: [0, soleY + 0.052, 0.038] }),
        materialIndex: 8
      }
    ];

    const footNode = group(`golfer-foot-${side}`, [
      assembleMultiMaterialNode(`golfer-foot-mesh-${side}`, footSlots, golferMats)
    ])
      .position(ankleOff[0], ankleOff[1], ankleOff[2])
      .runtime(rt(`golfer-foot-${side}`));

    const shinNode = group(`golfer-shin-${side}`, [
      assembleMultiMaterialNode(`golfer-shin-mesh-${side}`, shinSlots, golferMats),
      footNode
    ])
      .position(kneeOff[0], kneeOff[1], kneeOff[2])
      .runtime(rt(`golfer-shin-${side}`));

    return group(`golfer-thigh-${side}`, [
      assembleMultiMaterialNode(`golfer-thigh-mesh-${side}`, thighSlots, golferMats),
      shinNode
    ])
      .position(hipJ[0], hipJ[1], hipJ[2])
      .runtime(rt(`golfer-thigh-${side}`));
  };

  // 5. Pelvis + belt + buckle (`golfer-hips` at `rig.hipsBind`)
  const hipsSlots: MultiMatSlot[] = [
    {
      mesh: loftSectionsMesh(
        [
          chestRing(-0.135, 0.154, 0.112, 0.002),
          chestRing(-0.04, 0.164, 0.118, 0.004),
          chestRing(0.045, 0.156, 0.112, 0.006)
        ],
        true,
        true
      ),
      materialIndex: 4
    },
    {
      mesh: loftSectionsMesh(
        [
          chestRing(0.02, 0.162, 0.118, 0.006),
          chestRing(0.055, 0.162, 0.118, 0.006)
        ],
        true,
        false
      ),
      materialIndex: 5
    },
    { mesh: transformMesh(bevelBoxMesh(0.052, 0.038, 0.02, 0.004), { pos: [0, 0.038, 0.122] }), materialIndex: 6 }
  ];

  const hipsNode = group("golfer-hips", [
    assembleMultiMaterialNode("golfer-hips-mesh", hipsSlots, golferMats),
    spineNode,
    buildLegBranch("l"),
    buildLegBranch("r")
  ])
    .position(rig.hipsBind[0], rig.hipsBind[1], rig.hipsBind[2])
    .runtime(rt("golfer-hips"));

  const fitScale = GOLFER_TARGET_HEIGHT / MESHY_GLB_HEIGHT;
  return group("golfer-body", [hipsNode])
    .scale(fitScale)
    .animate({ clip, loop: true, speed: clipSpeed })
    .runtime(rt("golfer-body"));
}

/**
 * Open steel `latticeTrussMesh` tournament grandstand with stepped timber benches,
 * `tubeSweepMesh` safety rails, and scalloped championship hospitality awning.
 */
export function buildTournamentBleacherNodes(
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  terrain: HoleTerrain,
  pal: CourseSpec["palette"],
  id: string
): any[] {
  const yaw = Math.atan2(cx - sx, cz - sz);
  const y = terrain.height(sx, sz);
  const slots: MultiMatSlot[] = [];
  // Mat 0: Powder-coated structural steel lattice truss (`brushedMetal`)
  // Mat 1: Warm varnished cedar seating planks (`physical`)
  // Mat 2: Brushed aluminium safety handrails (`studioMetal`)
  // Mat 3: Championship green woven hospitality awning (`fabric`)
  // Mat 4: Cream valance trim (`fabric`)

  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [6.4, 0.62, 3.6], bays: 4, chordRadius: 0.045, braceRadius: 0.026 }), {
      pos: [0, 0.32, -0.35]
    }),
    materialIndex: 0
  });
  for (const px of [-2.95, 0, 2.95]) {
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.28, 2.85, 0.28], bays: 4, chordRadius: 0.032, braceRadius: 0.018 }), {
        pos: [px, 1.48, -2.05]
      }),
      materialIndex: 0
    });
  }
  for (let tier = 0; tier < 3; tier += 1) {
    const ty = 0.62 + tier * 0.42;
    const tz = 0.96 - tier * 0.96;
    slots.push({ mesh: transformMesh(bevelBoxMesh(6.1, 0.14, 0.88, 0.025), { pos: [0, ty, tz] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(6.1, 0.24, 0.08, 0.018), { pos: [0, ty + 0.22, tz - 0.38] }), materialIndex: 1 });
  }
  // Front & side safety handrails
  slots.push({
    mesh: tubeSweepMesh([[-3.05, 0.55, 1.52, 0.024], [-3.05, 1.08, 1.52, 0.024], [3.05, 1.08, 1.52, 0.024], [3.05, 0.55, 1.52, 0.024]], 8),
    materialIndex: 2
  });
  // Cantilevered hospitality sun canopy + front valance
  const awningSections: V3[][] = [
    [[-3.25, 2.92, -2.25], [3.25, 2.92, -2.25], [3.25, 2.98, -2.25], [-3.25, 2.98, -2.25]],
    [[-3.25, 3.12, -0.55], [3.25, 3.12, -0.55], [3.25, 3.18, -0.55], [-3.25, 3.18, -0.55]],
    [[-3.25, 2.84, 1.25], [3.25, 2.84, 1.25], [3.25, 2.9, 1.25], [-3.25, 2.9, 1.25]]
  ];
  slots.push({ mesh: loftSectionsMesh(awningSections, true, false), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(6.52, 0.18, 0.06, 0.015), { pos: [0, 2.77, 1.25] }), materialIndex: 4 });

  const mats: AuraMaterialSpec[] = [
    material.brushedMetal({ color: shadeHex(pal.rough, 0.62), roughness: 0.44 }),
    material.physical({ color: "#cfa36e", roughness: 0.64 }),
    material.studioMetal({ color: "#e8edf2", roughness: 0.22, metalness: 0.9 }),
    material.fabric({ color: "#194a38", roughness: 0.72, sheen: 0.36, sheenColor: "#468a70" }),
    material.fabric({ color: "#f5efe0", roughness: 0.74, sheen: 0.3, sheenColor: "#ffffff" })
  ];
  return [
    assembleMultiMaterialNode(`gallery-stand-${id}`, slots, mats, {
      position: [sx, y, sz],
      rotation: [0, yaw, 0]
    })
  ];
}

// ---------------------------------------------------------------------------
// 3. Tudor/Scottish Links Clubhouse & Biome Architectural Landmarks
// ---------------------------------------------------------------------------

export function buildTudorClubhouseNodes(
  course: CourseSpec,
  hole: HoleSpec,
  terrain: HoleTerrain,
  x: number,
  z: number,
  turfOn: boolean,
  ribbonAlongPath: (t: HoleTerrain, path: Vec2[], halfWidth: number, yOffset: number) => any
): any[] {
  const y = terrain.height(x, z);
  const yaw = Math.atan2(terrain.cup[0] - x, terrain.cup[2] - z);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [
    x + lx * c + lz * s,
    y + ly,
    z - lx * s + lz * c
  ];
  const parkland = course.dressing.theme === "parkland";
  const night = course.look === "night-city" || course.look === "space";

  const slots: MultiMatSlot[] = [];
  // Mat 0: Dressed Scottish ashlar stone plinth, chimney & garden wall (`ceramic`)
  // Mat 1: Warm lime-plaster Tudor walls (`physical`)
  // Mat 2: Dark oak half-timber framing, veranda columns & door (`physical`)
  // Mat 3: Weathered slate / cedar-shake gable & dormer roofs (`ceramic`)
  // Mat 4: Painted cream fascia, mullions & dormer trim (`lacquer`)
  // Mat 5: Terracotta chimney pots & entry keystone (`ceramic`)
  // Mat 6: Veranda cedar deck planks (`physical`)

  // Ashlar stone foundation plinth + porch steps + veranda deck
  slots.push({ mesh: transformMesh(bevelBoxMesh(11.4, 0.72, 8.3, 0.05), { pos: [0, 0.34, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(11.4, 0.28, 2.7, 0.04), { pos: [0, 0.44, 4.95] }), materialIndex: 6 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(4.6, 0.22, 0.96, 0.03), { pos: [0, 0.16, 6.72] }), materialIndex: 0 });

  // Main Tudor plaster volume + half-timber dark oak studs & diagonal braces
  slots.push({ mesh: transformMesh(bevelBoxMesh(10.2, 3.15, 7.2, 0.05), { pos: [0, 1.9, 0] }), materialIndex: 1 });
  for (const bx of [-4.95, -2.15, 0, 2.15, 4.95]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.18, 3.16, 7.28, 0.015), { pos: [bx, 1.9, 0] }), materialIndex: 2 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(10.32, 0.2, 7.34, 0.02), { pos: [0, 3.38, 0] }), materialIndex: 4 });

  // Steep pitched slate gable roof + ridge beam + 2 gabled roof dormers + veranda roof
  slots.push({ mesh: transformMesh(gablePrismMesh(11.2, 7.8, 1.85, 0.35), { pos: [0, 3.44, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(11.9, 0.16, 0.22, 0.03), { pos: [0, 5.31, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(11.6, 0.22, 2.95, 0.03), { pos: [0, 3.12, 4.95], rot: [0.1, 0, 0] }), materialIndex: 3 });
  for (const dx of [-3.1, 3.1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.75, 1.05, 1.65, 0.03), { pos: [dx, 4.05, 2.15] }), materialIndex: 1 });
    slots.push({
      mesh: transformMesh(extrudePolygonMesh([[-0.98, 0], [0.98, 0], [0, 0.72]], 1.95, 0.025, true), { pos: [dx, 4.56, 2.15] }),
      materialIndex: 3
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.32, 0.78, 0.1, 0.015), { pos: [dx, 4.04, 2.98] }), materialIndex: 4 });
  }

  // Mullioned front bay windows, oak entrance door, signboard & veranda columns
  for (const wx of [-3.35, 3.35] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.28, 1.82, 0.56, 0.03), { pos: [wx, 1.82, 3.82] }), materialIndex: 4 });
    for (const mx of [-0.45, 0.45]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.08, 1.56, 0.62, 0.01), { pos: [wx + mx, 1.82, 3.84] }), materialIndex: 2 });
    }
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.62, 2.32, 0.16, 0.02), { pos: [0, 1.52, 3.64] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(5.1, 0.84, 0.14, 0.02), { pos: [0, 2.8, 3.72] }), materialIndex: 2 });
  for (const lx of [-5.4, -1.85, 1.85, 5.4]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.46, 0.38, 0.025), { pos: [lx, 0.78, 6.08] }), materialIndex: 0 });
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.13, 0], [0.115, 2.05], [0.14, 2.12], [0, 2.12]], 14), { pos: [lx, 1.0, 6.08] }),
      materialIndex: 4
    });
  }

  // Tall corbelled stone chimney stack + twin terracotta chimney pots
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.05, 2.85, 1.05, 0.04), { pos: [-3.65, 4.55, -1.35] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.24, 0.22, 1.24, 0.03), { pos: [-3.65, 5.95, -1.35] }), materialIndex: 0 });
  for (const pz of [-1.55, -1.15]) {
    slots.push({
      mesh: transformMesh(latheMesh([[0.09, 0], [0.13, 0.05], [0.11, 0.48], [0.14, 0.54], [0.08, 0.56]], 12), { pos: [-3.65, 6.05, pz] }),
      materialIndex: 5
    });
  }

  // Flanking dry-stone garden walls + radial voussoir lychgate archway at walk entrance
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.9, 0.92, 0.46, 0.04), { pos: [side * 3.25, 0.46, 7.65] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.56, 1.95, 0.56, 0.035), { pos: [side * 1.55, 0.97, 7.65] }), materialIndex: 0 });
  }
  for (const vs of archwayVoussoirSlots({ radius: 1.28, thickness: 0.36, depth: 0.52, voussoirs: 9, stoneMatA: 0, stoneMatB: 4, keystoneMat: 5 })) {
    slots.push({ mesh: transformMesh(vs.mesh, { pos: [0, 1.85, 7.65] }), materialIndex: vs.materialIndex });
  }

  const mats: AuraMaterialSpec[] = [
    material.ceramic({ color: "#9b9384", roughness: 0.86 }),
    material.physical({ color: "#f2e9d6", roughness: 0.8 }),
    material.physical({ color: parkland ? "#432c20" : "#3a2d24", roughness: 0.72 }),
    material.ceramic({ color: parkland ? "#5e3830" : "#2c453e", roughness: 0.68 }),
    material.lacquer({ color: "#faf6ea", roughness: 0.34, clearcoat: 0.55 }),
    material.ceramic({ color: "#b65c3e", roughness: 0.64 }),
    material.physical({ color: "#9e7d56", roughness: 0.78 })
  ];

  // Separate `castShadow: false` bay/dormer/side glass panes (physical glass by day, warm glow at night)
  const windowSpec = cachedSpec("links:clubhouse-glass", () => {
    const panes: RawMesh[] = [];
    for (const wx of [-3.35, 3.35] as const) {
      panes.push(transformMesh(bevelBoxMesh(2.04, 1.48, 0.05, 0.008), { pos: [wx, 1.82, 4.11] }));
    }
    for (const dx of [-3.1, 3.1] as const) {
      panes.push(transformMesh(bevelBoxMesh(1.08, 0.62, 0.05, 0.008), { pos: [dx, 4.04, 3.04] }));
    }
    for (const side of [-1, 1] as const) {
      panes.push(transformMesh(bevelBoxMesh(0.05, 1.24, 4.1, 0.008), { pos: [side * 5.12, 1.92, 0] }));
    }
    return mergeRawMeshes(panes);
  });
  const glassMat = night
    ? material.emissive({ color: "#ffd9a0", emissive: "#ffc36b", emissiveIntensity: 0.65, roughness: 0.3 })
    : makeLinksWindowGlassMat("#d8eef8", 0.44);

  const nodes: any[] = [
    assembleMultiMaterialNode("clubhouse-lodge", slots, mats, { position: [x, y, z], rotation: [0, yaw, 0] }),
    geometry
      .custom(windowSpec, { name: "clubhouse-windows", material: glassMat, castShadow: false, receiveShadow: false })
      .position(x, y, z)
      .rotate(0, yaw, 0),
    text3D("AURA LINKS", {
      size: 0.36,
      depth: 0.05,
      letterSpacing: 0.055,
      backend: "sdf",
      castShadow: false,
      material: material.pbr({ color: "#f5e8c8", roughness: 0.34, metalness: 0.22 })
    })
      .position(...at(-1.56, 2.61, 3.82))
      .rotate(0, yaw, 0)
  ];

  // Porch ornamental shrubs / flowering coastal gorse
  const shrubSpots = [[-4.4, 7.0, 1.0], [4.4, 7.0, 1.0], [-6.2, 6.2, 0.85], [6.2, 6.2, 0.85]] as const;
  const shrubSpec = cachedSpec("links:clubhouse-shrub", () =>
    mergeRawMeshes([layeredCanopyMesh({ radius: 0.78, height: 0.92, puffs: 8, seed: 31 })])
  );
  nodes.push(
    instances.custom(shrubSpec, {
      name: turfOn && course.dressing.theme === "dunes" ? "clubhouse-gorse" : "clubhouse-shrubs",
      material: material.pbr({
        color: course.dressing.theme === "dunes" ? "#6d8432" : shadeHex(course.palette.rough, 1.12),
        roughness: 0.86,
        clearcoat: 0,
        sheen: 0
      } as any),
      castShadow: true,
      transforms: shrubSpots.map(([sx, sz, ss], i) => ({
        position: at(sx, 0, sz),
        rotation: [0, yaw + i * 1.5, 0] as Vec3,
        scale: [ss, ss, ss] as Vec3
      }))
    })
  );

  // Sand & stone-edged walkway connecting green apron to lychgate archway
  const walkStart: Vec2 = [terrain.cup[0], terrain.cup[2] + hole.layout.greenRadius + 2.1];
  const walkEndWorld = at(0, 0, 7.8);
  const walkEnd: Vec2 = [walkEndWorld[0], walkEndWorld[2]];
  nodes.push(
    geometry.custom(ribbonAlongPath(terrain, [walkStart, walkEnd], 1.55, 0.026), {
      name: "clubhouse-walk-edge",
      material: material.pbr({ color: "#b4a179", roughness: 0.96 })
    }),
    geometry.custom(ribbonAlongPath(terrain, [walkStart, walkEnd], 1.18, 0.04), {
      name: "clubhouse-walk",
      material: material.pbr({ color: shadeHex(course.palette.sand, 0.92), roughness: 0.94 })
    })
  );
  return nodes;
}

/**
 * Coastal headland lighthouse (`landmark-lighthouse`, grounded `minY = 0`, `16 m` tall):
 * `stratifiedCliffMesh` granite apron, `latheMesh` whitewashed & crimson-banded masonry tower,
 * corbelled watch gallery + `tubeSweepMesh` iron rail, `studioMetal` copper cupola dome + glass lantern.
 */
export function buildCoastalLighthouseNode(pos: Vec3, yaw = 0.55): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Stratified sea-granite headland apron (`ceramic`)
  // Mat 1: Whitewashed masonry tower (`physical`)
  // Mat 2: Crimson daymark band & keeper door (`lacquer`)
  // Mat 3: Wrought-iron watch gallery & mullions (`brushedMetal`)
  // Mat 4: Verdigris/burnished copper cupola dome & finial (`studioMetal`)
  // Mat 5: Warm Fresnel beacon lens (`emissive`)

  slots.push({
    mesh: stratifiedCliffMesh({ radiusX: 5.8, radiusZ: 5.4, height: 2.35, terraces: 4, seed: 41 }),
    materialIndex: 0
  });
  slots.push({
    mesh: latheMesh([[0, 2.0], [2.45, 2.0], [2.15, 6.2], [1.92, 6.2]], 22),
    materialIndex: 1
  });
  slots.push({
    mesh: latheMesh([[2.14, 6.18], [1.88, 10.2], [1.86, 10.2]], 22),
    materialIndex: 2
  });
  slots.push({
    mesh: latheMesh([[1.88, 10.18], [1.68, 12.65], [2.25, 13.05], [2.28, 13.32], [1.55, 13.35]], 22),
    materialIndex: 1
  });
  // Circular watch-gallery iron handrail + vertical stanchions
  const railPts: V4[] = [];
  for (let i = 0; i <= 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    railPts.push([Math.cos(a) * 2.18, 14.12, Math.sin(a) * 2.18, 0.045]);
    if (i < 20 && i % 2 === 0) {
      slots.push({
        mesh: tubeSweepMesh([[Math.cos(a) * 2.18, 13.3, Math.sin(a) * 2.18, 0.035], [Math.cos(a) * 2.18, 14.12, Math.sin(a) * 2.18, 0.035]], 6),
        materialIndex: 3
      });
    }
  }
  slots.push({ mesh: tubeSweepMesh(railPts, 7), materialIndex: 3 });
  // Fresnel optic drum + copper cupola dome + lightning spire (`maxY = 16.1`)
  slots.push({
    mesh: latheMesh([[0, 13.55], [0.82, 13.6], [0.88, 14.25], [0.76, 14.7], [0, 14.75]], 18),
    materialIndex: 5
  });
  const domeCurve = bezierCurve2([1.52, 14.85], [1.48, 15.45], [0.68, 15.82], [0.06, 15.92], 8);
  slots.push({
    mesh: latheMesh([[0, 14.82], ...domeCurve, [0.04, 16.15], [0, 16.18]], 20),
    materialIndex: 4
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.95, 1.85, 0.35, 0.04), { pos: [0, 3.05, 2.28] }), materialIndex: 2 });

  const mats: AuraMaterialSpec[] = [
    material.ceramic({ color: "#6f6b64", roughness: 0.9 }),
    material.physical({ color: "#f4efe4", roughness: 0.72 }),
    material.lacquer({ color: "#b63228", roughness: 0.34, clearcoat: 0.65 }),
    material.brushedMetal({ color: "#2b3138", roughness: 0.42 }),
    material.studioMetal({ color: "#558b78", roughness: 0.28, metalness: 0.88 }),
    material.emissive({ color: "#fff3c4", emissive: "#ffd97d", emissiveIntensity: 1.15 })
  ];
  const lanternSpec = cachedSpec("links:lighthouse-glass", () =>
    mergeRawMeshes([latheMesh([[1.42, 13.34], [1.42, 14.84]], 18)])
  );
  return group("landmark-lighthouse", [
    assembleMultiMaterialNode("landmark-lighthouse-body", slots, mats),
    geometry.custom(lanternSpec, {
      name: "landmark-lighthouse-lantern",
      material: makeLinksWindowGlassMat("#dff2fc", 0.42),
      castShadow: false,
      receiveShadow: false
    })
  ])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, yaw, 0);
}

/**
 * Scottish humpback ashlar stone burn footbridge (`landmark-bridge`, `~2.2 m` high, `~6.8 m` span).
 */
export function buildBurnFootbridgeNode(pos: Vec3, yaw = 0.2): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Weathered Scottish greywhacke ashlar (`ceramic`)
  // Mat 1: Warm buff sandstone alternating voussoirs & coping (`physical`)
  // Mat 2: Proud dressed granite keystone & end piers (`ceramic`)

  for (const vs of archwayVoussoirSlots({ radius: 1.75, thickness: 0.42, depth: 2.15, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 2 })) {
    slots.push({ mesh: transformMesh(vs.mesh, { pos: [0, 0.12, 0] }), materialIndex: vs.materialIndex });
  }
  // Cambered cobble deck + curved stone parapets + flared abutment piers + dry-stone wall wings
  const cols = 8;
  const deckSections: V3[][] = [];
  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols;
    const x = -3.35 + u * 6.7;
    const archY = 0.55 + Math.sin(u * Math.PI) * 1.62;
    deckSections.push([
      [x, archY, -1.04], [x, archY, 1.04], [x, archY + 0.18, 1.04], [x, archY + 0.18, -1.04]
    ]);
    if (c < cols) {
      const xm = x + 6.7 / (cols * 2);
      const ym = 0.55 + Math.sin(((c + 0.5) / cols) * Math.PI) * 1.62;
      for (const side of [-1, 1] as const) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.86, 0.64, 0.24, 0.03), {
            pos: [xm, ym + 0.46, side * 0.98],
            rot: [0, 0, Math.cos(((c + 0.5) / cols) * Math.PI) * 0.36]
          }),
          materialIndex: c % 2 === 0 ? 0 : 1
        });
      }
    }
  }
  slots.push({ mesh: loftSectionsMesh(deckSections, true, true), materialIndex: 1 });
  for (const sx of [-3.35, 3.35] as const) {
    for (const sz of [-1.06, 1.06] as const) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.62, 1.38, 0.48, 0.035), { pos: [sx, 0.69, sz] }), materialIndex: 2 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.9, 0.78, 0.38, 0.035), { pos: [sx * 1.32, 0.39, 1.06] }), materialIndex: 0 });
  }

  return assembleMultiMaterialNode(
    "landmark-bridge",
    slots,
    [
      material.ceramic({ color: "#7f7a70", roughness: 0.88 }),
      material.physical({ color: "#a89c86", roughness: 0.82 }),
      material.ceramic({ color: "#63605a", roughness: 0.84 })
    ],
    { position: pos, rotation: [0, yaw, 0] }
  );
}

/**
 * Cinder Rim volcanic landmarks: `18` stepped hexagonal columnar basalt pillars (`landmark-basalt-columns`, `10 m`)
 * and faceted obsidian + glowing magma vent spire (`landmark-shard`, `14 m`).
 */
export function buildBasaltColumnsAndShardNodes(
  terrain: HoleTerrain,
  midT: Vec2,
  fairHalf: number
): any[] {
  const bcX = Math.max(terrain.bounds.minX + 10, midT[0] - fairHalf - 24);
  const bcZ = midT[1] + 10;
  const bcY = terrain.height(bcX, bcZ) - 0.2;

  const basaltSlots: MultiMatSlot[] = [];
  const hexPoly = regularPolygon2D(6, 1.08, Math.PI / 6);
  for (let i = 0; i < 18; i += 1) {
    const ring = i < 6 ? 1.85 : i < 13 ? 3.55 : 5.1;
    const ang = (i * 2.39996) + 0.3;
    const h = 9.8 - (ring / 5.5) * 5.6 + hash01(i * 43 + 9) * 1.8;
    const sc = 0.78 + hash01(i * 29 + 3) * 0.38;
    basaltSlots.push({
      mesh: transformMesh(extrudePolygonMesh(hexPoly, h, 0.08, true), {
        pos: [Math.cos(ang) * ring, h * 0.5, Math.sin(ang) * ring],
        rot: [Math.PI * 0.5, ang * 0.25, 0],
        scale: [sc, 1, sc]
      }),
      materialIndex: i % 3 === 0 ? 1 : 0
    });
  }
  basaltSlots.push({
    mesh: stratifiedCliffMesh({ radiusX: 6.4, radiusZ: 5.8, height: 1.8, terraces: 3, seed: 73 }),
    materialIndex: 0
  });

  const shX = terrain.bounds.maxX - 18;
  const shZ = midT[1];
  const shY = terrain.height(shX, shZ);
  const shardSlots: MultiMatSlot[] = [
    { mesh: stratifiedCliffMesh({ radiusX: 4.8, radiusZ: 4.5, height: 3.2, terraces: 4, seed: 91 }), materialIndex: 0 },
    {
      mesh: transformMesh(extrudePolygonMesh(regularPolygon2D(5, 2.1, 0.2, 5), 13.8, 0.18, true), {
        pos: [0, 6.9, 0],
        rot: [Math.PI * 0.5 + 0.08, 0.4, 0.05]
      }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(extrudePolygonMesh(regularPolygon2D(5, 1.15, 0.9, 11), 8.6, 0.12, true), {
        pos: [1.55, 4.3, -0.9],
        rot: [Math.PI * 0.5 - 0.14, 1.1, -0.1]
      }),
      materialIndex: 2
    }
  ];

  const volcanicMats: AuraMaterialSpec[] = [
    material.ceramic({ color: "#2b2a2d", roughness: 0.88 }),
    material.physical({ color: "#1d1e24", roughness: 0.32, clearcoat: 0.65, clearcoatRoughness: 0.18 }),
    material.emissive({ color: "#ff7426", emissive: "#ff5a14", emissiveIntensity: 0.95, roughness: 0.4 })
  ];
  return [
    assembleMultiMaterialNode("landmark-basalt-columns", basaltSlots, volcanicMats.slice(0, 2), {
      position: [bcX, bcY, bcZ],
      rotation: [0, 0.9, 0]
    }),
    assembleMultiMaterialNode("landmark-shard", shardSlots, volcanicMats, {
      position: [shX, shY, shZ],
      rotation: [0, 0.4, 0]
    })
  ];
}

/**
 * Cloud Terrace alpine cable-car station (`landmark-cable-car-station`, `11 m` tall):
 * stone-and-larch chalet terminal, cantilevered `latticeTrussMesh` haul-rope gantry,
 * grooved `latheMesh` bullwheel sheaves, panoramic glass bay, and suspended red gondola cabin.
 */
export function buildAlpineCableCarStationNode(pos: Vec3, yaw = -1.95): any {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Alpine granite plinth (`ceramic`)
  // Mat 1: Warm alpine larch timber cladding (`physical`)
  // Mat 2: Dark steel gantry truss, haul cables & sheaves (`brushedMetal`)
  // Mat 3: Signal-red gondola cabin & roof fascia (`carPaint`)
  // Mat 4: Fresh snow roof mantle (`physical`)

  slots.push({ mesh: transformMesh(bevelBoxMesh(9.6, 2.6, 8.2, 0.06), { pos: [0, 1.3, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(9.0, 4.2, 7.6, 0.05), { pos: [0, 4.65, -0.2] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(gablePrismMesh(9.8, 8.4, 2.35, 0.4), { pos: [0, 6.75, -0.2] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(gablePrismMesh(9.6, 8.2, 2.15, 0.35), { pos: [0, 7.02, -0.2] }), materialIndex: 4 });

  // Cantilevered steel haul-rope gantry + twin grooved bullwheels + haul cables
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [3.2, 1.35, 11.4], bays: 6, chordRadius: 0.08, braceRadius: 0.048 }), {
      pos: [0, 9.65, 2.8]
    }),
    materialIndex: 2
  });
  for (const bz of [-1.4, 7.2]) {
    slots.push({
      mesh: transformMesh(latheMesh([[0.25, -0.1], [1.38, -0.1], [1.45, -0.04], [1.32, 0], [1.45, 0.04], [1.38, 0.1], [0.25, 0.1]], 20), {
        pos: [0, 8.85, bz]
      }),
      materialIndex: 2
    });
  }
  // Suspended red gondola hanger arm + rounded cabin
  slots.push({
    mesh: tubeSweepMesh([[1.35, 8.85, 6.2, 0.055], [1.35, 7.35, 6.2, 0.055], [0.95, 6.55, 6.2, 0.055]], 8),
    materialIndex: 2
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.85, 2.05, 2.35, 0.16), { pos: [0.95, 5.45, 6.2] }), materialIndex: 3 });

  const mats: AuraMaterialSpec[] = [
    material.ceramic({ color: "#7d8088", roughness: 0.86 }),
    material.physical({ color: "#9c6b43", roughness: 0.68 }),
    material.brushedMetal({ color: "#363e48", roughness: 0.36 }),
    material.carPaint({ color: "#c92a2a", roughness: 0.2, clearcoat: 1 }),
    material.physical({ color: "#f4f8fc", roughness: 0.84, sheen: 0.3, sheenColor: "#ffffff" })
  ];
  const glassSpec = cachedSpec("links:cablecar-glass", () =>
    mergeRawMeshes([
      transformMesh(bevelBoxMesh(6.8, 2.4, 0.08, 0.01), { pos: [0, 4.75, 3.64] }),
      transformMesh(bevelBoxMesh(1.9, 0.88, 2.4, 0.04), { pos: [0.95, 5.65, 6.2] })
    ])
  );
  return group("landmark-cable-car-station", [
    assembleMultiMaterialNode("landmark-cable-car-body", slots, mats),
    geometry.custom(glassSpec, {
      name: "landmark-cable-car-glass",
      material: makeLinksWindowGlassMat("#d8eef8", 0.44),
      castShadow: false,
      receiveShadow: false
    })
  ])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, yaw, 0);
}

// ---------------------------------------------------------------------------
// 4. Harbour Skyline, Lunar Expedition & Botanical/Cliff/Dune Instancing
// ---------------------------------------------------------------------------

export function buildHarbourSkylineNodes(
  terrain: HoleTerrain,
  midT: Vec2,
  cx: number,
  cz: number,
  lookMode: string
): any[] {
  const nodes: any[] = [];
  const crownColors = ["#5eead4", "#60a5fa", "#fbbf24"] as const;
  for (let i = 0; i < 3; i += 1) {
    const bx = terrain.bounds.minX + 30 + i * 46;
    const h = 34 + i * 12;
    const w = 13.5 - i * 0.8;
    const tSlots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(w, h * 0.62, w * 0.82, 0.18), { pos: [0, h * 0.31, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(w * 0.82, h * 0.3, w * 0.68, 0.15), { pos: [0, h * 0.75, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(w * 0.56, h * 0.1, w * 0.52, 0.1), { pos: [0, h * 0.94, 0] }), materialIndex: 1 },
      { mesh: tubeSweepMesh([[0, h * 0.99, 0, 0.18], [0, h + 4.2, 0, 0.05]], 8), materialIndex: 1 }
    ];
    for (let f = 1; f <= 7; f += 1) {
      const fy = (f / 8) * h * 0.86;
      const fw = (f <= 5 ? w : w * 0.82) + 0.16;
      const fd = (f <= 5 ? w * 0.82 : w * 0.68) + 0.16;
      tSlots.push({ mesh: transformMesh(bevelBoxMesh(fw, 0.38, fd, 0.04), { pos: [0, fy, 0] }), materialIndex: f % 2 === 0 ? 2 : 1 });
    }
    tSlots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.6, 0.85, w * 0.56, 0.08), { pos: [0, h * 0.985, 0] }), materialIndex: 2 });
    nodes.push(
      assembleMultiMaterialNode(
        `landmark-tower-${i}`,
        tSlots,
        [
          material.physical({ color: "#0f1c2e", roughness: 0.14, clearcoat: 0.92, clearcoatRoughness: 0.06 }),
          material.brushedMetal({ color: "#8fa2b8", roughness: 0.3 }),
          material.emissive({ color: crownColors[i]!, emissive: crownColors[i]!, emissiveIntensity: 0.85 })
        ],
        { position: [bx, 0, terrain.bounds.maxZ - 6], rotation: [0, Math.PI, 0] }
      )
    );
  }

  // Quayside open-lattice container crane (`landmark-harbour-crane`, `22 m` tall)
  const crX = terrain.bounds.minX + 24;
  const crZ = midT[1];
  const crY = terrain.height(crX, crZ);
  const craneSlots: MultiMatSlot[] = [];
  for (const lz of [-4.2, 4.2] as const) {
    for (const lx of [-2.8, 2.8] as const) {
      craneSlots.push({
        mesh: transformMesh(latticeTrussMesh({ span: [0.85, 16.8, 0.85], bays: 7, chordRadius: 0.08, braceRadius: 0.045 }), {
          pos: [lx * 0.82, 8.4, lz],
          rot: [0, 0, -lx * 0.055]
        }),
        materialIndex: 0
      });
    }
  }
  craneSlots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [32.0, 1.65, 2.6], bays: 12, chordRadius: 0.09, braceRadius: 0.05 }), {
      pos: [3.5, 17.4, 0]
    }),
    materialIndex: 0
  });
  craneSlots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [1.4, 4.6, 2.4], bays: 3, chordRadius: 0.08, braceRadius: 0.045 }), {
      pos: [-1.5, 19.8, 0]
    }),
    materialIndex: 0
  });
  for (const side of [-1, 1] as const) {
    craneSlots.push({ mesh: tubeSweepMesh([[-1.5, 22.0, side * 1.0, 0.06], [15.5, 18.1, side * 1.0, 0.05]], 6), materialIndex: 1 });
    craneSlots.push({ mesh: tubeSweepMesh([[-1.5, 22.0, side * 1.0, 0.06], [-11.2, 18.1, side * 1.0, 0.05]], 6), materialIndex: 1 });
  }
  craneSlots.push({ mesh: transformMesh(bevelBoxMesh(2.6, 1.9, 2.2, 0.08), { pos: [2.2, 15.6, 0] }), materialIndex: 1 });
  craneSlots.push({ mesh: transformMesh(bevelBoxMesh(3.4, 0.65, 2.1, 0.06), { pos: [9.5, 11.4, 0] }), materialIndex: 1 });
  craneSlots.push({ mesh: tubeSweepMesh([[9.5, 16.6, 0, 0.05], [9.5, 11.7, 0, 0.05]], 6), materialIndex: 1 });
  craneSlots.push({ mesh: transformMesh(bevelBoxMesh(0.45, 0.45, 0.45, 0.06), { pos: [19.2, 18.4, 0] }), materialIndex: 2 });
  nodes.push(
    assembleMultiMaterialNode(
      "landmark-harbour-crane",
      craneSlots,
      [
        material.carPaint({ color: "#d95b26", roughness: 0.28, clearcoat: 0.72 }),
        material.brushedMetal({ color: "#2d3540", roughness: 0.42 }),
        material.emissive({ color: "#ff4d3d", emissive: "#ff4d3d", emissiveIntensity: 1.1 })
      ],
      { position: [crX, crY, crZ], rotation: [0, Math.PI + 0.3, 0] }
    )
  );

  // 4 stadium floodlight lattice masts around green (`7.5 m` tall)
  for (const [lx, lz] of [[-18, -8], [18, -8], [-18, 18], [18, 18]] as const) {
    const x = cx + lx;
    const z = cz + lz;
    const y = terrain.height(x, z);
    const aimYaw = Math.atan2(cx - x, cz - z);
    const mastSlots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(0.95, 0.45, 0.95, 0.04), { pos: [0, 0.22, 0] }), materialIndex: 0 },
      {
        mesh: transformMesh(latticeTrussMesh({ span: [0.46, 6.8, 0.46], bays: 6, chordRadius: 0.035, braceRadius: 0.02 }), {
          pos: [0, 3.6, 0]
        }),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(1.95, 0.78, 0.34, 0.04), { pos: [0, 7.22, 0.12], rot: [0.38, 0, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(1.76, 0.58, 0.08, 0.02), { pos: [0, 7.18, 0.28], rot: [0.38, 0, 0] }), materialIndex: 1 }
    ];
    nodes.push(
      assembleMultiMaterialNode(
        `lamp-${lx}-${lz}`,
        mastSlots,
        [
          material.brushedMetal({ color: "#4a5564", roughness: 0.38 }),
          material.emissive({ color: "#dff4ff", emissive: "#bfe8ff", emissiveIntensity: 1.25 })
        ],
        { position: [x, y, z], rotation: [0, aimYaw, 0] }
      )
    );
    if (lookMode === "original") {
      nodes.push(
        lights.spot({
          name: `lamp-spot-${lx}-${lz}`,
          position: [x, y + 7.2, z],
          target: [cx, terrain.cup[1], cz],
          angle: 0.7,
          penumbra: 0.6,
          intensity: 1.6,
          color: "#bfe8ff",
          distance: 70
        })
      );
    }
  }
  return nodes;
}

/**
 * Mare Tranquillitatis lunar expedition: Kapton gold-foil descent/ascent `landmark-lander` (`10 m`),
 * 6-wheel `landmark-rover` (`id: "landmark-rover"`, `1.65 m`), and parabolic dish `landmark-relay` (`9 m`).
 */
export function buildLunarExpeditionNodes(
  terrain: HoleTerrain,
  midT: Vec2,
  tx: number,
  tz: number,
  cz: number
): any[] {
  // 1. Lunar module lander (`10 m` tall)
  const lx = terrain.bounds.maxX - 20;
  const lz = midT[1];
  const ly = terrain.height(lx, lz);
  const landerSlots: MultiMatSlot[] = [
    {
      mesh: transformMesh(extrudePolygonMesh(regularPolygon2D(8, 2.85, Math.PI / 8), 2.7, 0.12, true), {
        pos: [0, 3.35, 0],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 0
    },
    { mesh: latheMesh([[1.15, 0.85], [1.65, 1.95], [0.95, 2.1], [0, 2.1]], 18), materialIndex: 2 },
    {
      mesh: transformMesh(icosphereFacetMesh(2.05, 1, 0.04, 19), { pos: [0, 6.45, 0], scale: [1.05, 0.92, 1.02] }),
      materialIndex: 1
    },
    { mesh: tubeSweepMesh([[0, 8.2, 0, 0.08], [0, 9.95, 0, 0.04]], 8), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 9.1], [0.85, 9.45], [0.92, 9.52], [0.05, 9.16]], 16), { pos: [0.55, 0, 0.35], rot: [0.35, 0, -0.3] }), materialIndex: 0 }
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    landerSlots.push({ mesh: tubeSweepMesh([[ca * 2.4, 3.6, sa * 2.4, 0.09], [ca * 4.35, 0.18, sa * 4.35, 0.075]], 8), materialIndex: 1 });
    landerSlots.push({ mesh: tubeSweepMesh([[ca * 2.5, 2.2, sa * 2.5, 0.065], [ca * 4.35, 0.18, sa * 4.35, 0.06]], 7), materialIndex: 1 });
    landerSlots.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.68, 0], [0.74, 0.14], [0.52, 0.2], [0, 0.2]], 14), { pos: [ca * 4.35, 0, sa * 4.35] }),
      materialIndex: 0
    });
  }

  // 2. 6-wheel lunar rover (`id: "landmark-rover"`, `1.65 m` tall)
  const rx = tx + 12;
  const rz = tz + 8;
  const ry = terrain.height(rx, rz);
  const roverSlots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.38, 0.18, 2.55, 0.03), { pos: [0, 0.42, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.88, 0.34, 0.62, 0.03), { pos: [0, 0.66, -0.72] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.06, 0.12, 0.56, 0.02), { pos: [0, 0.56, 0.12] }), materialIndex: 2 },
    { mesh: tubeSweepMesh([[0.38, 0.52, 0.78, 0.03], [0.38, 1.48, 0.86, 0.025]], 8), materialIndex: 1 },
    {
      mesh: transformMesh(latheMesh([[0, 0], [0.46, 0.18], [0.48, 0.21], [0.04, 0.03]], 16), { pos: [0.38, 1.46, 0.86], rot: [0.65, 0.3, 0] }),
      materialIndex: 0
    },
    { mesh: tubeSweepMesh([[-0.36, 0.52, 0.82, 0.026], [-0.36, 1.32, 0.82, 0.022]], 8), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.16, 0.22, 0.02), { pos: [-0.36, 1.38, 0.84] }), materialIndex: 3 }
  ];
  for (const wz of [-0.95, 0, 0.95] as const) {
    for (const side of [-1, 1] as const) {
      for (const ws of wheelAssemblySlots({ radius: 0.28, width: 0.18, spokeCount: 6, tireMat: 2, rimMat: 0 })) {
        roverSlots.push({ mesh: transformMesh(ws.mesh, { pos: [side * 0.82, 0.28, wz] }), materialIndex: ws.materialIndex });
      }
    }
  }

  // 3. Parabolic comms relay tower (`landmark-relay`, `9 m` tall)
  const kx = terrain.bounds.minX + 16;
  const kz = cz + 30;
  const ky = terrain.height(kx, kz);
  const relaySlots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(2.2, 0.48, 2.2, 0.05), { pos: [0, 0.24, 0] }), materialIndex: 2 },
    {
      mesh: transformMesh(latticeTrussMesh({ span: [0.95, 6.8, 0.95], bays: 6, chordRadius: 0.055, braceRadius: 0.03 }), { pos: [0, 3.8, 0] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(latheMesh([[0, 0], [1.95, 0.72], [2.02, 0.78], [0.08, 0.08]], 22), { pos: [0, 7.55, 0.2], rot: [0.72, 0.25, 0] }),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.28, 0.28, 0.04), { pos: [0, 8.95, 0] }), materialIndex: 3 }
  ];

  const spaceMats: AuraMaterialSpec[] = [
    material.studioMetal({ color: "#d8a63a", roughness: 0.24, metalness: 0.95 }),
    material.studioMetal({ color: "#dce3ec", roughness: 0.2, metalness: 0.92 }),
    material.blackRubber({ color: "#252830", roughness: 0.78 }),
    material.emissive({ color: "#67e8f9", emissive: "#38bdf8", emissiveIntensity: 0.95 })
  ];
  return [
    assembleMultiMaterialNode("landmark-lander", landerSlots, spaceMats, { position: [lx, ly, lz], rotation: [0, -0.9, 0] }),
    assembleMultiMaterialNode("landmark-rover", roverSlots, spaceMats, {
      id: "landmark-rover",
      position: [rx, ry, rz],
      rotation: [0, 0.5, 0]
    }),
    assembleMultiMaterialNode("landmark-relay", relaySlots, spaceMats, { position: [kx, ky, kz] })
  ];
}

/**
 * Botanical corridor trees (`instances.custom`, `clearcoat: 0, sheen: 0`):
 * swept flared `tubeSweepMesh` trunks + `coniferBoughTierMesh` (Scots pine / alpine spruce)
 * or wind-sheared `layeredCanopyMesh` (Maple Hollow parkland / coastal Monterey cypress).
 */
export function buildCourseTreeBatches(
  terrain: HoleTerrain,
  trees: readonly { x: number; z: number; h: number; yaw: number }[],
  theme: string,
  turfOn: boolean,
  reducedMotion: boolean
): any[] {
  if (trees.length === 0) return [];
  const trunkSpec = cachedSpec("links:tree-trunk-v2", () => {
    const mainCurve = catmullRomSpline3([[0, -0.08, 0], [0.06, 1.05, 0.03], [-0.04, 2.25, 0.05], [0.02, 3.55, 0]], 5);
    const mainSpine: V4[] = mainCurve.map((p, idx) => [
      p[0],
      p[1],
      p[2],
      (idx === 0 ? 0.28 : 0.23) * (1 - (idx / mainCurve.length) * 0.64)
    ]);
    const rootA: V4[] = [[0.14, 0.28, 0.08, 0.11], [0.34, -0.06, 0.2, 0.045]];
    const rootB: V4[] = [[-0.15, 0.26, -0.09, 0.1], [-0.32, -0.06, -0.22, 0.045]];
    const limbA: V4[] = [[0.01, 1.95, 0.02, 0.1], [0.44, 2.68, 0.25, 0.065], [0.82, 3.18, 0.44, 0.034]];
    const limbB: V4[] = [[-0.02, 2.35, 0.03, 0.09], [-0.48, 2.96, -0.28, 0.058], [-0.78, 3.4, -0.44, 0.03]];
    return mergeRawMeshes([
      tubeSweepMesh(mainSpine, 9),
      tubeSweepMesh(rootA, 6),
      tubeSweepMesh(rootB, 6),
      tubeSweepMesh(limbA, 6),
      tubeSweepMesh(limbB, 6)
    ]);
  });
  const oakCanopySpec = cachedSpec("links:tree-canopy:oak-v2", () =>
    mergeRawMeshes([transformMesh(layeredCanopyMesh({ radius: 2.15, height: 3.5, puffs: 11, seed: 23 }), { pos: [0, 2.22, 0] })])
  );
  const pineCanopySpec = cachedSpec("links:tree-canopy:pine-v2", () =>
    mergeRawMeshes([transformMesh(coniferBoughTierMesh({ baseRadius: 1.98, height: 4.95, tiers: 5, seed: 37 }), { pos: [0, 1.52, 0] })])
  );

  const oakTones =
    theme === "parkland"
      ? ["#b8452c", "#d0702a", "#c9962e", "#67843d", "#8f3a22"]
      : theme === "dunes"
        ? ["#3d634d", "#4c7358", "#355846", "#587c5e"]
        : ["#2e6b54", "#3b7860", "#265947"];
  const pineTones =
    theme === "alpine"
      ? ["#3f6b5e", "#4e7a6d", "#638d82", "#355c50"]
      : theme === "dunes"
        ? ["#2d4e3e", "#385d4a", "#264436", "#416753"]
        : theme === "parkland"
          ? ["#2f563e", "#3a654a", "#264834"]
          : ["#1e5a50", "#286b5c", "#194d45"];

  const trunkTransforms: any[] = [];
  const oakTransforms: any[] = [];
  const oakColors: string[] = [];
  const pineTransforms: any[] = [];
  const pineColors: string[] = [];

  trees.forEach((tr, i) => {
    const s = tr.h / 6.3;
    const y = terrain.height(tr.x, tr.z) - 0.1;
    const lean = theme === "dunes" ? 0.09 : 0.03;
    const rot: Vec3 = [Math.sin(tr.yaw) * lean, tr.yaw, Math.cos(tr.yaw) * lean];
    trunkTransforms.push({ position: [tr.x, y, tr.z] as Vec3, rotation: rot, scale: [s, s, s] as Vec3 });
    // Mix fairway oaks/maples (`layeredCanopyMesh`) and coastal/alpine pines (`coniferBoughTierMesh`) cleanly by biome
    const useOak =
      theme === "parkland"
        ? i % 4 !== 3
        : theme === "dunes"
          ? i % 2 === 0
          : theme === "alpine"
            ? false
            : i % 3 === 0;
    if (useOak) {
      oakTransforms.push({
        position: [tr.x, y, tr.z] as Vec3,
        rotation: rot,
        scale: (theme === "dunes" ? [s * 1.15, s * 0.88, s * 1.08] : [s, s, s]) as Vec3
      });
      oakColors.push(oakTones[i % oakTones.length]!);
    } else {
      pineTransforms.push({
        position: [tr.x, y, tr.z] as Vec3,
        rotation: rot,
        scale: (theme === "dunes" ? [s * 1.06, s * 0.94, s * 1.04] : [s, s, s]) as Vec3
      });
      pineColors.push(pineTones[i % pineTones.length]!);
    }
  });

  const windOpt = turfOn && !reducedMotion ? { wind: { strength: 0.08, speed: 0.9 } as any } : {};
  const batches: any[] = [
    instances.custom(trunkSpec, {
      name: "conifer-trunks",
      material: material.pbr({ color: "#544030", roughness: 0.92, clearcoat: 0, sheen: 0 } as any),
      transforms: trunkTransforms,
      castShadow: true
    })
  ];
  if (oakTransforms.length > 0) {
    batches.push(
      instances.custom(oakCanopySpec, {
        name: "fairway-oak-canopy",
        material: material.pbr({ color: "#ffffff", roughness: 0.84, clearcoat: 0, sheen: 0 } as any),
        transforms: oakTransforms,
        colors: oakColors,
        castShadow: true,
        ...windOpt
      })
    );
  }
  if (pineTransforms.length > 0) {
    batches.push(
      instances.custom(pineCanopySpec, {
        name: theme === "alpine" ? "corridor-pines" : "conifer-canopy",
        material: material.pbr({ color: "#ffffff", roughness: 0.84, clearcoat: 0, sheen: 0 } as any),
        transforms: pineTransforms,
        colors: pineColors,
        castShadow: true,
        ...windOpt
      })
    );
  }
  return batches;
}

export function buildAlpineHorizonTreelineNode(cx: number, cz: number): any {
  const snowPineSpec = cachedSpec("links:alpine-horizon-pine", () =>
    mergeRawMeshes([coniferBoughTierMesh({ baseRadius: 0.65, height: 2.0, tiers: 4, seed: 53 })])
  );
  const transforms = Array.from({ length: 15 }, (_, i) => {
    const h = 20 + ((i * 7) % 5) * 3.5;
    return {
      position: [cx + 18 + i * 6, 0, cz + 140 + ((i % 3) - 1) * 0.5] as Vec3,
      rotation: [0, i * 1.7, 0] as Vec3,
      scale: [h / 2, h / 2, h / 2] as Vec3
    };
  });
  return instances.custom(snowPineSpec, {
    name: "landmark-alps",
    material: material.pbr({ color: "#5c7d76", roughness: 0.88, clearcoat: 0, sheen: 0 } as any),
    transforms,
    castShadow: false
  });
}

export function buildCourseOutcropBatch(
  terrain: HoleTerrain,
  rockSpots: readonly Vec2[],
  theme: string,
  rng: () => number
): any | null {
  const transforms = rockSpots
    .slice(0, 14)
    .filter(([rx, rz]) => {
      const zKind = terrain.zone(rx, rz);
      return zKind !== "fairway" && zKind !== "green" && zKind !== "sand" && zKind !== "water";
    })
    .map(([rx, rz], i) => {
      const s = 0.85 + (i % 3) * 0.35;
      return {
        position: [rx, terrain.height(rx, rz) - 0.1, rz] as Vec3,
        rotation: [0, rng() * Math.PI * 2, 0] as Vec3,
        scale: [s, s, s] as Vec3
      };
    });
  if (transforms.length === 0) return null;
  const rockSpec = cachedSpec("links:outcrop-boulder", () =>
    mergeRawMeshes([stratifiedCliffMesh({ radiusX: 1.05, radiusZ: 0.92, height: 1.35, terraces: 4, seed: 61 })])
  );
  const rockColor = theme === "volcanic" ? "#343136" : theme === "lunar" ? "#6d7078" : "#867f73";
  return instances.custom(rockSpec, {
    name: "rough-rocks",
    material: material.pbr({ color: rockColor, roughness: 0.9, clearcoat: 0, sheen: 0 } as any),
    transforms,
    castShadow: true
  });
}

export function buildDuneMarramBatch(
  name: string,
  transforms: readonly { position: Vec3; rotation: Vec3; scale: Vec3 }[]
): any {
  const marramSpec = cachedSpec("links:dune-marram", () => {
    const blades: RawMesh[] = [];
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.25;
      const spread = 0.18 + (i % 3) * 0.08;
      const h = 0.86 + (i % 4) * 0.08;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      blades.push(
        tubeSweepMesh(
          [
            [dx * 0.04, 0, dz * 0.04, 0.022],
            [dx * spread * 0.55, h * 0.58, dz * spread * 0.55, 0.015],
            [dx * spread * 1.35, h, dz * spread * 1.35, 0.004]
          ],
          5,
          true
        )
      );
    }
    return mergeRawMeshes(blades);
  });
  return instances.custom(marramSpec, {
    name,
    material: material.pbr({ color: "#3b6240", roughness: 0.88, clearcoat: 0, sheen: 0 } as any),
    transforms: transforms.map((t) => ({ position: [...t.position], rotation: [...t.rotation], scale: [...t.scale] })),
    castShadow: false
  });
}

export function buildDuneGorseBatch(
  name: string,
  transforms: readonly { position: Vec3; rotation: Vec3; scale: Vec3 }[]
): any {
  const gorseSpec = cachedSpec("links:dune-gorse", () =>
    mergeRawMeshes([layeredCanopyMesh({ radius: 0.62, height: 0.95, puffs: 7, seed: 83 })])
  );
  return instances.custom(gorseSpec, {
    name,
    material: material.pbr({ color: "#4c6d3a", roughness: 0.86, clearcoat: 0, sheen: 0 } as any),
    transforms: transforms.map((t) => ({ position: [...t.position], rotation: [...t.rotation], scale: [...t.scale] })),
    castShadow: false
  });
}

/**
 * Merges multiple `discOnTerrain` custom geometry specs (e.g. all hole bunker bowls or bunker grass lips)
 * into a single flat `AuraCustomGeometrySpec` draw call via `mergeRawMeshes`.
 */
export function mergeTerrainDiscSpecs(
  specs: readonly {
    readonly positions: readonly (readonly [number, number, number])[];
    readonly normals: readonly (readonly [number, number, number])[];
    readonly uvs: readonly (readonly [number, number])[];
    readonly indices: readonly number[];
  }[]
): AuraCustomGeometrySpec {
  const rawMeshes: RawMesh[] = specs.map((s) => {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < s.positions.length; i += 1) {
      const p = s.positions[i]!;
      const n = s.normals[i] ?? [0, 1, 0];
      const uv = s.uvs[i] ?? [0, 0];
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[0], uv[1]);
    }
    return { positions, normals, uvs, indices: [...s.indices] };
  });
  return mergeRawMeshes(rawMeshes);
}

/**
 * Lean batched green-side tournament gallery ropes (`instances.custom` stanchion posts + merged catenary
 * `tubeSweepMesh` braided ropes) + sculpted `articulatedFolkSlots` gallery spectators & marshal (`gallery-spectators`)
 * along the ropes and in both tournament grandstands.
 */
export function buildGalleryRopeAndSpectatorBatches(
  cx: number,
  cz: number,
  greenRadius: number,
  terrain: HoleTerrain,
  rng: () => number
): any[] {
  const out: any[] = [];
  const stanchionSpec = cachedSpec("links:gallery-stanchion", () =>
    mergeRawMeshes([
      latheMesh([[0, 0], [0.065, 0], [0.055, 0.035], [0.024, 0.045], [0.022, 0.72], [0.036, 0.755], [0, 0.78]], 12)
    ])
  );

  const postPositions: { position: Vec3 }[] = [];
  const ropeMeshes: RawMesh[] = [];
  const spanZ = greenRadius * 0.85;
  for (const side of [-1, 1] as const) {
    const rx = cx + side * (greenRadius + 3.2);
    const zStops = [cz - spanZ, cz, cz + spanZ];
    for (const pz of zStops) {
      postPositions.push({ position: [rx, terrain.height(rx, pz), pz] });
    }
    for (let s = 0; s < zStops.length - 1; s += 1) {
      const z0 = zStops[s]!;
      const z1 = zStops[s + 1]!;
      const zm = (z0 + z1) * 0.5;
      const y0 = terrain.height(rx, z0) + 0.68;
      const ym = terrain.height(rx, zm) + 0.56;
      const y1 = terrain.height(rx, z1) + 0.68;
      const curve = catmullRomSpline3([[rx, y0, z0], [rx, ym, zm], [rx, y1, z1]], 6);
      ropeMeshes.push(tubeSweepMesh(curve.map((p) => [p[0], p[1], p[2], 0.018] as V4), 6, true));
    }
  }
  out.push(
    instances.custom(stanchionSpec, {
      name: "gallery-stanchions",
      material: material.pbr({ color: "#1d4434", roughness: 0.36, metalness: 0.25, clearcoat: 0, sheen: 0 } as any),
      transforms: postPositions,
      castShadow: true
    }),
    geometry.custom(mergeRawMeshes(ropeMeshes), {
      name: "gallery-ropes",
      material: material.fabric({ color: "#f2eee2", roughness: 0.72, sheen: 0.3, sheenColor: "#ffffff" }),
      castShadow: false
    })
  );

  // Shared 10-material golf apparel palette for the entire batched gallery + grandstand crowd (1 multi-material node!)
  const crowdMats: AuraMaterialSpec[] = [
    material.fabric({ color: "#235784", roughness: 0.74, sheen: 0.3, sheenColor: "#ffffff" }), // 0: Navy tour polo
    material.fabric({ color: "#1f5f46", roughness: 0.74, sheen: 0.3, sheenColor: "#ffffff" }), // 1: Emerald links sweater-vest
    material.fabric({ color: "#b63e36", roughness: 0.74, sheen: 0.3, sheenColor: "#ffffff" }), // 2: Claret championship polo
    material.fabric({ color: "#f3efe4", roughness: 0.76, sheen: 0.28, sheenColor: "#ffffff" }), // 3: Ivory collar / cap / trim
    material.physical({ color: "#d59c72", roughness: 0.6 }), // 4: Warm medium skin
    material.physical({ color: "#8d6043", roughness: 0.62 }), // 5: Deep bronze skin
    material.fabric({ color: "#d4cbb8", roughness: 0.8 }), // 6: Stone golf chinos
    material.fabric({ color: "#252f3f", roughness: 0.8 }), // 7: Charcoal pleated trousers & caps
    material.physical({ color: "#684226", roughness: 0.48 }), // 8: Saddle leather shoe trim & belt
    material.lacquer({ color: "#1a4d3a", roughness: 0.28, clearcoat: 0.75 }) // 9: Marshal "QUIET" paddle
  ];

  const crowdSlots: MultiMatSlot[] = [];
  const poloCycle = [0, 1, 2, 3];
  const skinCycle = [4, 5];
  const trouserCycle = [6, 7];
  const capCycle = [3, 7, 0, 1];

  // 8 standing gallery fans & 1 green-side marshal holding a "QUIET" paddle behind the gallery ropes
  for (let i = 0; i < 9; i += 1) {
    const a = ((i + 0.5) / 9) * Math.PI * 1.24 - Math.PI * 0.12 + (rng() - 0.5) * 0.08;
    const r = greenRadius + 3.85 + (i % 3) * 0.55;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.abs(Math.sin(a)) * r * 0.86;
    const y = terrain.height(x, z);
    const yaw = Math.atan2(cx - x, cz - z);
    const figSlots = golfApparelFolkSlots({
      height: 1.7 + (i % 3) * 0.05,
      poloMat: poloCycle[i % poloCycle.length]!,
      vestTrimMat: 3,
      skinMat: skinCycle[i % skinCycle.length]!,
      capMat: capCycle[i % capCycle.length]!,
      trouserMat: trouserCycle[i % trouserCycle.length]!,
      shoeMat: 3,
      shoeSaddleMat: 8,
      visorStyle: i % 3 === 1,
      ...(i === 0 ? { marshalPaddleMat: 9 } : {}),
      seed: 101 + i * 17
    });
    for (const sl of figSlots) {
      crowdSlots.push({
        mesh: transformMesh(sl.mesh, { pos: [x, y, z], rot: [0, yaw, 0] }),
        materialIndex: sl.materialIndex
      });
    }
  }

  // 6 grandstand spectators standing/cheering across the left & right tournament bleachers
  for (const [bIdx, side] of [[0, -1], [1, 1]] as const) {
    const sx = cx + side * (greenRadius + 10.5);
    const sz = cz + 3.5;
    const sy = terrain.height(sx, sz);
    const bYaw = Math.atan2(cx - sx, cz - sz);
    const cosY = Math.cos(bYaw);
    const sinY = Math.sin(bYaw);
    for (let k = 0; k < 3; k += 1) {
      const localX = (k - 1) * 1.85;
      const tier = k % 2;
      const localZ = 0.92 - tier * 0.96;
      const localY = 0.69 + tier * 0.42;
      const wx = sx + localX * cosY + localZ * sinY;
      const wz = sz - localX * sinY + localZ * cosY;
      const idx = 9 + bIdx * 3 + k;
      const figSlots = golfApparelFolkSlots({
        height: 1.68 + (k % 2) * 0.06,
        poloMat: poloCycle[idx % poloCycle.length]!,
        vestTrimMat: 3,
        skinMat: skinCycle[idx % skinCycle.length]!,
        capMat: capCycle[idx % capCycle.length]!,
        trouserMat: trouserCycle[idx % trouserCycle.length]!,
        shoeMat: 3,
        shoeSaddleMat: 8,
        visorStyle: k === 1,
        seed: 307 + idx * 19
      });
      for (const sl of figSlots) {
        crowdSlots.push({
          mesh: transformMesh(sl.mesh, { pos: [wx, sy + localY, wz], rot: [0, bYaw, 0] }),
          materialIndex: sl.materialIndex
        });
      }
    }
  }

  out.push(assembleMultiMaterialNode("gallery-spectators", crowdSlots, crowdMats));
  return out;
}
