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
  bakeMeshCavityAO,
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
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
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
} from "../../../showcase-port-shared/proceduralKernel";
import type { CourseSpec, GolferFit, HoleSpec, HoleTerrain, Vec2, Vec3 } from "../game/types";
import { GOLFER_TARGET_HEIGHT, MESHY_GLB_HEIGHT, meshyProfile } from "../game/golferRetarget";

function cachedSpec(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  return memoizeGeometry(key, build);
}

function cachedSlots(key: string, build: () => MultiMatSlot[]): MultiMatSlot[] {
  return memoizeGeometry(key, build);
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
  const spec = cachedSpec("links:club-grip-v2", () => {
    const profile: V2[] = [[0, -0.15]];
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const y = -0.15 + u * 0.3;
      const buttFlare = u < 0.14 ? (1 - u / 0.14) * 0.0028 : 0;
      const rib = Math.sin(u * Math.PI * 14) * 0.00045;
      const r = 0.0148 - u * 0.0042 + buttFlare + rib;
      profile.push([r, y]);
    }
    profile.push([0, 0.15]);
    return mergeRawMeshes([bakeMeshCavityAO(latheMesh(profile, 18), 0.14)]);
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
  const spec = cachedSpec("links:club-shaft-v2", () => {
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
    return mergeRawMeshes([bakeMeshCavityAO(latheMesh(profile, 16), 0.1)]);
  });
  const shaftMat = material.studioMetal({ color: "#e8eef5", roughness: 0.08, metalness: 0.96 });
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
  const slots = cachedSlots("links:club-head-slots-v2", () => {
    const out: MultiMatSlot[] = [];
    // Mat 0: Glossy carbon-weave aerodynamic crown (`carPaint`)
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
        const domeY = sa > 0 ? sa * ry * 1.14 : sa * ry * 0.8;
        pts.push([cx + ca * rx, cy - domeY, cz + Math.sin(a * 0.5) * rz * 0.08]);
      }
      return pts;
    };
    const crownSections: V3[][] = [
      crownRing(0.036, 0.003, 0.022, 0.052, 0.024, 0.01),
      crownRing(0.038, 0.002, 0.004, 0.059, 0.028, 0.012),
      crownRing(0.039, 0.004, -0.022, 0.055, 0.025, 0.012),
      crownRing(0.035, 0.008, -0.048, 0.041, 0.017, 0.01),
      crownRing(0.031, 0.012, -0.064, 0.02, 0.009, 0.006)
    ];
    out.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(crownSections, true, false), 1, 0.54), materialIndex: 0 });

    // Milled titanium cup-face insert (10.5 deg loft) + 5 horizontal scoreline grooves
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.1, 0.044, 0.01, 0.0026), {
          pos: [0.036, 0.002, 0.024],
          rot: [-0.18, 0, 0]
        }),
        1,
        0.38
      ),
      materialIndex: 1
    });
    for (let g = -2; g <= 2; g += 1) {
      out.push({
        mesh: transformMesh(bevelBoxMesh(0.068, 0.0018, 0.0022, 0.0004), {
          pos: [0.036, 0.002 + g * 0.0062, 0.0285 - g * 0.0011],
          rot: [-0.18, 0, 0]
        }),
        materialIndex: 4
      });
    }

    // Hosel bore + collared ferrule + sole aero keel + tungsten weight port + crown alignment mark
    out.push({
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
    out.push({
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
    out.push({
      mesh: transformMesh(bevelBoxMesh(0.062, 0.007, 0.048, 0.002), { pos: [0.036, 0.024, -0.016] }),
      materialIndex: 1
    });
    out.push({
      mesh: transformMesh(latheMesh([[0, -0.004], [0.011, -0.004], [0.011, 0.004], [0, 0.004]], 12), {
        pos: [0.036, 0.026, -0.034]
      }),
      materialIndex: 3
    });
    out.push({
      mesh: transformMesh(bevelBoxMesh(0.014, 0.002, 0.009, 0.0005), { pos: [0.036, -0.024, 0.008] }),
      materialIndex: 3
    });
    return out;
  });

  const mats: AuraMaterialSpec[] = [
    material.carPaint({ color: "#141922", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }),
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
  const slots = cachedSlots("links:tour-bag-slots-v2", () => {
    const out: MultiMatSlot[] = [];
    // Lathed inner cylinder + smooth subdivided quilted tour bolsters (`y = -0.42..+0.38`)
    out.push({
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
        const rib = 1 + Math.cos(a * 4) * 0.048;
        pts.push([Math.cos(a) * rx * rib, y, Math.sin(a) * rz * rib + zOff]);
      }
      return pts;
    };
    out.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            bagBolsterRing(-0.4, 0.146, 0.152, 0.004),
            bagBolsterRing(-0.18, 0.154, 0.16, 0.008),
            bagBolsterRing(0.1, 0.148, 0.154, 0.006),
            bagBolsterRing(0.35, 0.156, 0.162, 0.004)
          ],
          true,
          false
        ),
        1,
        0.5
      ),
      materialIndex: 0
    });

    // Molded polymer base boot + plush 6-way velour top divider cuff & crisscrossed divider ribs
    out.push({
      mesh: latheMesh([[0, -0.46], [0.156, -0.46], [0.158, -0.385], [0.146, -0.375]], 22),
      materialIndex: 2
    });
    out.push({
      mesh: latheMesh([[0.132, 0.35], [0.162, 0.372], [0.166, 0.455], [0.148, 0.468], [0.132, 0.445]], 22),
      materialIndex: 1
    });
    out.push({
      mesh: latheMesh([[0, 0.415], [0.136, 0.415], [0.138, 0.452], [0, 0.432]], 20),
      materialIndex: 2
    });
    // 6-way divider cross-ribs + top alloy grab handle
    out.push({ mesh: transformMesh(bevelBoxMesh(0.26, 0.026, 0.014, 0.004), { pos: [0, 0.454, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.014, 0.026, 0.25, 0.004), { pos: [-0.044, 0.454, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.014, 0.026, 0.25, 0.004), { pos: [0.044, 0.454, 0] }), materialIndex: 2 });
    out.push({
      mesh: tubeSweepMesh([[-0.055, 0.43, 0.152, 0.01], [0, 0.478, 0.184, 0.011], [0.055, 0.43, 0.152, 0.01]], 8),
      materialIndex: 3
    });

    // Sculpted front ball/rangefinder pockets, full-length apparel pockets, brass crest & draped waffle towel
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.165, 0.26, 0.115, 0.03), { pos: [0, -0.14, 0.158] }), 1, 0.48),
      materialIndex: 1
    });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.135, 0.14, 0.085, 0.022), { pos: [0, 0.11, 0.154] }), 1, 0.48),
      materialIndex: 0
    });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.095, 0.38, 0.19, 0.028), { pos: [0.144, -0.03, -0.01] }), 1, 0.48),
      materialIndex: 1
    });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.095, 0.38, 0.19, 0.028), { pos: [-0.144, -0.03, -0.01] }), 1, 0.48),
      materialIndex: 1
    });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.076, 0.054, 0.012, 0.004), { pos: [0, 0.24, 0.156] }), materialIndex: 4 });
    out.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            [[-0.168, 0.33, 0.04], [-0.168, 0.33, 0.09], [-0.18, 0.33, 0.09], [-0.18, 0.33, 0.04]],
            [[-0.185, 0.14, 0.025], [-0.185, 0.14, 0.115], [-0.198, 0.14, 0.115], [-0.198, 0.14, 0.025]],
            [[-0.172, -0.03, 0.04], [-0.172, -0.03, 0.1], [-0.184, -0.03, 0.1], [-0.184, -0.03, 0.04]]
          ],
          true,
          false
        ),
        1,
        0.52
      ),
      materialIndex: 5
    });

    // Sculpted ergonomic dual carry strap + hinged stand bracket + twin deployed stand legs with rubber feet
    for (const sSide of [-1, 1] as const) {
      out.push({
        mesh: sculptHumanoidLimbMesh(
          [
            [sSide * 0.048, 0.35, -0.148, 0.015],
            [sSide * 0.072, 0.15, -0.252, 0.024],
            [sSide * 0.058, -0.09, -0.242, 0.022],
            [sSide * 0.036, -0.29, -0.152, 0.015]
          ],
          8,
          0.08
        ),
        materialIndex: 1
      });
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(0.13, 0.065, 0.055, 0.012), { pos: [0, 0.31, -0.155] }), materialIndex: 2 });
    for (const side of [-1, 1] as const) {
      out.push({
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
      out.push({
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
      out.push({
        mesh: tubeSweepMesh([[cx * 0.76, 0.42, cz * 0.76, 0.0058], [cx, cy, cz, 0.0052]], 8),
        materialIndex: 3
      });
      out.push({
        mesh: transformMesh(latheMesh([[0.0054, -0.018], [0.0076, -0.006], [0.0072, 0.012], [0, 0.012]], 10), {
          pos: [cx, cy, cz]
        }),
        materialIndex: 2
      });
      out.push({
        mesh: transformMesh(ironBladeMesh, { pos: [cx, cy + 0.016, cz], rot: [loft, yaw, 0.18] }),
        materialIndex: 3
      });
    }

    // Sculpted Driver (with knit headcover & pom), 3-Wood & Tour Mallet Putter in rear/top divider slots
    out.push({ mesh: tubeSweepMesh([[-0.044, 0.42, -0.058, 0.0065], [-0.056, 0.6, -0.074, 0.006]], 8), materialIndex: 6 });
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(
          latheMesh([[0.018, 0], [0.044, 0.03], [0.052, 0.095], [0.042, 0.145], [0, 0.155]], 16),
          { pos: [-0.058, 0.515, -0.076], rot: [-0.16, 0.25, 0.1] }
        ),
        1,
        0.48
      ),
      materialIndex: 5
    });
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(icosphereSmoothMesh(0.028, 1, 0.05, 19), { pos: [-0.062, 0.682, -0.098] }),
        1,
        0.56
      ),
      materialIndex: 5
    });
    // Uncovered titanium 3-Wood aerodynamic crown + face
    out.push({ mesh: tubeSweepMesh([[0.042, 0.42, -0.056, 0.0062], [0.054, 0.59, -0.07, 0.0056]], 8), materialIndex: 6 });
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(icosphereSmoothMesh(0.044, 1, 0.015, 31), {
          pos: [0.072, 0.605, -0.076],
          rot: [0.12, -0.35, 0.14],
          scale: [1.18, 0.58, 0.96]
        }),
        1,
        0.54
      ),
      materialIndex: 6
    });
    // Tour mallet putter in front-center well
    out.push({ mesh: tubeSweepMesh([[0.018, 0.42, 0.018, 0.0056], [0.022, 0.515, 0.024, 0.0054]], 8), materialIndex: 3 });
    out.push({
      mesh: transformMesh(bevelBoxMesh(0.068, 0.018, 0.042, 0.005), { pos: [0.026, 0.528, 0.026], rot: [0.08, 0.12, 0] }),
      materialIndex: 4
    });
    return out;
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
    material.carPaint({ color: "#151b24", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 })
  ];
  return assembleMultiMaterialNode("golfer-bag", slots, mats, { id: "golfer-bag" });
}

/**
 * Championship 4-wheel British racing-green golf cart (`golfer-cart`, grounded `minY = 0`, `1.65 m` tall).
 * Splits opaque bodywork (`castShadow: true`) from WebGPU-safe `physical` raked windshield (`castShadow: false`).
 */
export function buildGolfCartNode(refined = true): any {
  const slots = cachedSlots("links:golf-cart-slots-v2", () => {
    const out: MultiMatSlot[] = [];
    // Mat 0: Championship British racing-green bodywork (`carPaint`)
    // Mat 1: Warm ivory sun canopy & racing hood stripe (`lacquer`)
    // Mat 2: Diamond-stitched saddle-tan leather upholstery (`fabric`)
    // Mat 3: Turf-tread rubber tires, floor mat & bumpers (`blackRubber`)
    // Mat 4: Forged 5-spoke alloy rims & canopy struts (`studioMetal`)
    // Mat 5: Warm-white LED headlamps (`emissive`)

    // Chassis floorpan, contoured front/rear bumpers & rear bag well
    out.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.14, 2.08, 0.03), { pos: [0, 0.25, 0] }), materialIndex: 3 });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(1.14, 0.11, 0.16, 0.035), { pos: [0, 0.26, 1.09] }), 1, 0.46),
      materialIndex: 3
    });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(1.12, 0.11, 0.16, 0.035), { pos: [0, 0.26, -1.08] }), 1, 0.46),
      materialIndex: 3
    });

    // Streamlined superellipse aerodynamic front cowl hood (`z` from `+0.26` dash to `+1.08` nose) + ivory centre stripe
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(
          sculptStreamlinedHullMesh(0.84, 1.12, 0.46, {
            noseSharpness: 0.62,
            tailTaper: 0.24,
            canopyBulge: 0.26,
            undersideFlat: 0.68,
            stations: 11,
            ringPoints: 16
          }),
          { pos: [0, 0.56, 0.66], rot: [0.08, 0, 0] }
        ),
        1,
        0.48
      ),
      materialIndex: 0
    });
    out.push({
      mesh: subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.14, 0.025, 0.68, 0.008), { pos: [0, 0.77, 0.66], rot: [0.16, 0, 0] }),
        1,
        0.45
      ),
      materialIndex: 1
    });

    // Smooth sculpted rear body tub & flared wheel-arch fenders
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(1.1, 0.42, 0.92, 0.055), { pos: [0, 0.52, -0.5] }), 1, 0.48),
      materialIndex: 0
    });
    for (const side of [-1, 1] as const) {
      out.push({
        mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.19, 0.11, 0.56, 0.032), { pos: [side * 0.54, 0.49, 0.76] }), 1, 0.5),
        materialIndex: 0
      });
      out.push({
        mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.19, 0.11, 0.58, 0.032), { pos: [side * 0.54, 0.49, -0.74] }), 1, 0.5),
        materialIndex: 0
      });
    }

    // Smooth bolstered saddle-tan bench seat cushion, contoured backrest & hip restraint bars
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(1.02, 0.14, 0.49, 0.045), { pos: [0, 0.68, -0.14] }), 1, 0.54),
      materialIndex: 2
    });
    out.push({
      mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.98, 0.39, 0.12, 0.04), { pos: [0, 0.94, -0.4], rot: [-0.14, 0, 0] }), 1, 0.54),
      materialIndex: 2
    });
    for (const side of [-1, 1] as const) {
      out.push({
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
        out.push({ mesh: transformMesh(ws.mesh, { pos: [wx, 0.22, wz] }), materialIndex: ws.materialIndex });
      }
    }

    // Steering column, wheel, 4 aluminium canopy struts & smooth cambered ivory sun canopy (`maxY = 1.65`)
    out.push({ mesh: tubeSweepMesh([[0.26, 0.58, 0.44, 0.022], [0.26, 0.96, 0.18, 0.02]], 8), materialIndex: 4 });
    out.push({
      mesh: transformMesh(latheMesh([[0.125, -0.014], [0.155, -0.014], [0.155, 0.014], [0.125, 0.014]], 18), {
        pos: [0.26, 0.98, 0.17],
        rot: [0.95, 0, 0]
      }),
      materialIndex: 3
    });
    for (const side of [-1, 1] as const) {
      out.push({ mesh: tubeSweepMesh([[side * 0.5, 0.8, 0.34, 0.018], [side * 0.47, 1.57, 0.2, 0.017]], 8), materialIndex: 4 });
      out.push({ mesh: tubeSweepMesh([[side * 0.5, 0.74, -0.78, 0.018], [side * 0.48, 1.57, -0.84, 0.017]], 8), materialIndex: 4 });
    }
    const roofRing = (z: number, w: number, yEdge: number, arch: number): V3[] => [
      [-w, yEdge, z], [w, yEdge, z], [w * 0.96, yEdge + 0.045, z], [0, yEdge + 0.045 + arch, z], [-w * 0.96, yEdge + 0.045, z]
    ];
    out.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh([
          roofRing(0.38, 0.56, 1.56, 0.034),
          roofRing(-0.22, 0.58, 1.58, 0.05),
          roofRing(-0.94, 0.56, 1.56, 0.034)
        ], true, false),
        1,
        0.5
      ),
      materialIndex: 1
    });
    // Recessed front LED headlamps + brass nose badge
    out.push({ mesh: transformMesh(bevelBoxMesh(0.09, 0.05, 0.025, 0.008), { pos: [0, 0.52, 1.07] }), materialIndex: 4 });
    for (const side of [-1, 1] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.075, 0.04, 0.014), { pos: [side * 0.34, 0.5, 1.05] }), materialIndex: 5 });
    }
    return out;
  });

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
  const slots = cachedSlots("links:flagstick-slots-v2", () => {
    const out: MultiMatSlot[] = [];
    // Mat 0: Tapered ivory fiberglass pole (`lacquer`)
    // Mat 1: Turned brass cup ferrule, pennant crest & top acorn finial (`studioMetal`)
    // Mat 2: Rippled woven tournament pennant (`fabric`)
    // Mat 3: Piped championship trim border (`fabric`)

    out.push({
      mesh: latheMesh([[0, 0], [0.024, 0], [0.026, 0.16], [0.015, 0.18], [0, 0.18]], 16),
      materialIndex: 1
    });
    out.push({
      mesh: latheMesh([[0.013, 0.16], [0.012, 1.6], [0.01, 3.03], [0, 3.03]], 14),
      materialIndex: 0
    });
    out.push({
      mesh: latheMesh([[0, 3.02], [0.018, 3.04], [0.028, 3.07], [0.015, 3.095], [0, 3.11]], 16),
      materialIndex: 1
    });

    // Smooth subdivided rippled woven pennant (`x in [0.014, 0.66]`, `y in [2.56, 3.01]`)
    const flagCols = 7;
    const sections: V3[][] = [];
    for (let c = 0; c <= flagCols; c += 1) {
      const u = c / flagCols;
      const x = 0.014 + u * 0.64;
      const wave = Math.sin(u * Math.PI * 1.65) * 0.036 * u;
      const taper = 1 - u * 0.12;
      const yMid = 2.79 - u * 0.025;
      const hHalf = 0.21 * taper;
      sections.push([
        [x, yMid - hHalf, wave - 0.0055],
        [x, yMid - hHalf, wave + 0.0055],
        [x, yMid + hHalf, wave + 0.0055],
        [x, yMid + hHalf, wave - 0.0055]
      ]);
    }
    out.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(sections, true, false), 1, 0.48), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.028, 0.44, 0.018, 0.005), { pos: [0.02, 2.79, 0] }), materialIndex: 3 });
    out.push({
      mesh: transformMesh(latheMesh([[0, -0.008], [0.052, -0.008], [0.052, 0.008], [0, 0.008]], 14), {
        pos: [0.31, 2.78, 0.014],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 1
    });
    return out;
  });

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
  const spec = cachedSpec(`links:golf-ball-v2:${ballRadius.toFixed(4)}`, () =>
    mergeRawMeshes([
      bakeMeshCavityAO(transformMesh(icosphereFacetMesh(ballRadius, 2, 0.01, 7), { pos: [0, ballRadius, 0] }), 0.08)
    ])
  );
  const ballMat = turfOn
    ? material.lacquer({ color: "#fcfdfa", roughness: 0.15, clearcoat: 1 })
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
  const markerSpec = cachedSpec("links:tee-marker-v2", () => {
    const prof: V2[] = [
      [0, 0],
      [0.032, 0],
      [0.032, 0.032],
      [0.022, 0.042],
      [0.108, 0.048],
      [0.132, 0.094],
      [0.112, 0.138],
      [0.052, 0.158],
      [0, 0.164]
    ];
    return mergeRawMeshes([bakeMeshCavityAO(latheMesh(prof, 20), 0.3)]);
  });
  const markMat = material.carPaint({ color: "#c83b2b", roughness: 0.18, clearcoat: 0.94, clearcoatRoughness: 0.06 });
  if (turfOn) {
    nodes.push(
      instances.custom(markerSpec, {
        name: "tee-markers",
        material: material.pbr({ color: "#c83b2b", roughness: 0.26, metalness: 0.14, clearcoat: 0, sheen: 0 } as any),
        castShadow: false,
        transforms: [-3.2, 3.2].map((dx) => ({
          position: [terrain.tee[0] + dx, terrain.tee[1] + 0.025, terrain.tee[2]] as Vec3
        }))
      })
    );
  } else {
    for (const [id, dx] of [["l", -3.2], ["r", 3.2]] as const) {
      nodes.push(
        geometry
          .custom(markerSpec, { name: `tee-marker-${id}`, material: markMat, castShadow: false })
          .position(terrain.tee[0] + dx, terrain.tee[1] + 0.025, terrain.tee[2])
      );
    }
  }

  if (!turfOn) return nodes;

  // Post-mounted tournament ball washer + hanging microfiber towel beside right tee marker
  const bwX = terrain.tee[0] + 4.35;
  const bwZ = terrain.tee[2] - 1.15;
  const bwY = terrain.height(bwX, bwZ);
  const washerSlots = cachedSlots("links:ball-washer-v2", () => [
    { mesh: latheMesh([[0, 0], [0.13, 0], [0.11, 0.06], [0.032, 0.07], [0.03, 0.78], [0, 0.78]], 14), materialIndex: 2 },
    { mesh: latheMesh([[0, 0.76], [0.11, 0.78], [0.138, 0.92], [0.128, 1.08], [0.09, 1.12], [0, 1.12]], 18), materialIndex: 0 },
    { mesh: tubeSweepMesh([[0, 1.1, 0, 0.012], [0, 1.27, 0, 0.012]], 8), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.11, 0.028, 0.032, 0.008), { pos: [0, 1.28, 0] }), materialIndex: 2 },
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            [[-0.08, 0.88, 0.13], [0.08, 0.88, 0.13], [0.08, 0.88, 0.146], [-0.08, 0.88, 0.146]],
            [[-0.096, 0.68, 0.156], [0.096, 0.68, 0.156], [0.096, 0.68, 0.172], [-0.096, 0.68, 0.172]],
            [[-0.076, 0.5, 0.14], [0.076, 0.5, 0.14], [0.076, 0.5, 0.156], [-0.076, 0.5, 0.156]]
          ],
          true,
          true
        ),
        1,
        0.44
      ),
      materialIndex: 3
    }
  ]);
  nodes.push(
    assembleMultiMaterialNode(
      "tee-ball-washer",
      washerSlots,
      [
        material.carPaint({ color: "#1c4d3a", roughness: 0.2, clearcoat: 0.9 }),
        material.studioMetal({ color: "#e6edf5", roughness: 0.12, metalness: 0.94 }),
        material.blackRubber({ color: "#1b1e24", roughness: 0.8 }),
        material.fabric({ color: "#f3efe4", roughness: 0.78, sheen: 0.35, sheenColor: "#ffffff" })
      ],
      { position: [bwX, bwY, bwZ], castShadow: false }
    )
  );

  // Carved granite & oak hole yardage monument + SDF text (`tee-sign` & `tee-sign-text`)
  const yaw = terrain.lineYaw + Math.PI;
  const sx = terrain.tee[0] + Math.cos(terrain.lineYaw) * 5.2 + Math.sin(terrain.lineYaw);
  const sz = terrain.tee[2] - Math.sin(terrain.lineYaw) * 5.2 + Math.cos(terrain.lineYaw);
  const sy = terrain.height(sx, sz);
  const signSlots = cachedSlots("links:tee-sign-v2", () => [
    { mesh: transformMesh(bevelBoxMesh(1.58, 0.24, 0.5, 0.032), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 1.16, 0.18, 0.022), { pos: [-0.95, 0.66, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 1.16, 0.18, 0.022), { pos: [0.95, 0.66, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(2.42, 0.62, 0.12, 0.025), { pos: [0, 1.06, 0] }), materialIndex: 2 },
    { mesh: transformMesh(gablePrismMesh(2.58, 0.34, 0.18, 0.04), { pos: [0, 1.37, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(2.18, 0.04, 0.15, 0.008), { pos: [0, 0.78, 0] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.08, 0], [0.065, 0.07], [0.085, 0.12], [0, 0.14]], 12), { pos: [-0.95, 1.24, 0] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.08, 0], [0.065, 0.07], [0.085, 0.12], [0, 0.14]], 12), { pos: [0.95, 1.24, 0] }), materialIndex: 3 }
  ]);
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
      { position: [sx, sy, sz], rotation: [0, yaw, 0], castShadow: false }
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
  const stakePostSpec = cachedSpec("links:yardage-stake-post-v2", () =>
    mergeRawMeshes([bakeMeshCavityAO(latheMesh([[0, 0], [0.09, 0], [0.08, 0.14], [0.055, 0.16], [0.052, 0.88], [0, 0.9]], 12), 0.28)])
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
        castShadow: false
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
/** Subtle neutral-white vertex shading gradient so `bakeMeshCavityAO(..., 0.24)` accentuates tailored piqué & chino drape. */
function shadeGolferForm(mesh: RawMesh, yLow: number, yHigh: number, topBoost = 0.04, bottomShade = 0.07): RawMesh {
  const span = Math.max(0.001, yHigh - yLow);
  return paintMeshColors(mesh, ([_x, y, _z], [_nx, ny, nz]) => {
    const t = Math.max(0, Math.min(1, (y - yLow) / span));
    const directional = 1 - bottomShade * (1 - t) + topBoost * t + Math.max(0, ny) * 0.025 + Math.max(0, nz) * 0.02;
    const v = Math.max(0.84, Math.min(1.06, directional));
    return [v, v, v, 1];
  });
}

/** Preserves exact C^1 analytic SDF / radial normals instead of overwriting with mesh-averaging Taubin passes. */
function lkSmoothFair(src: RawMesh, iterations = 3): RawMesh {
  if (src.analyticNormals) return src;
  return taubinSmoothMesh(src, iterations);
}

function lkMergeRaw(meshes: readonly RawMesh[]): RawMesh {
  const out = mergeRawMeshesToRaw(meshes);
  return meshes.some((m) => m.analyticNormals === true) ? { ...out, analyticNormals: true } : out;
}

/** Smooth subdivided icosphere (`detail = 1..3`) with exact radial `analyticNormals: true` and typed arrays. */
function smoothSphereDetail3(radius: number, detail = 3): RawMesh {
  const t = (1 + Math.sqrt(5)) * 0.5;
  const invL = 1 / Math.hypot(1, t);
  const a = invL;
  const b = t * invL;
  let verts: [number, number, number][] = [
    [-a, b, 0], [a, b, 0], [-a, -b, 0], [a, -b, 0],
    [0, -a, b], [0, a, b], [0, -a, -b], [0, a, -b],
    [b, 0, -a], [b, 0, a], [-b, 0, -a], [-b, 0, a]
  ];
  let tris: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  for (let d = 0; d < detail; d += 1) {
    const midCache = new Map<string, number>();
    const mid = (i0: number, i1: number): number => {
      const k = i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`;
      const hit = midCache.get(k);
      if (hit !== undefined) return hit;
      const p0 = verts[i0]!;
      const p1 = verts[i1]!;
      const mx = p0[0] + p1[0];
      const my = p0[1] + p1[1];
      const mz = p0[2] + p1[2];
      const len = Math.hypot(mx, my, mz) || 1;
      const idx = verts.length;
      verts.push([mx / len, my / len, mz / len]);
      midCache.set(k, idx);
      return idx;
    };
    const next: [number, number, number][] = [];
    for (const [i0, i1, i2] of tris) {
      const m01 = mid(i0, i1);
      const m12 = mid(i1, i2);
      const m20 = mid(i2, i0);
      next.push([i0, m01, m20], [i1, m12, m01], [i2, m20, m12], [m01, m12, m20]);
    }
    tris = next;
  }
  const vCount = verts.length;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  for (let i = 0; i < vCount; i += 1) {
    const [nx, ny, nz] = verts[i]!;
    positions[i * 3] = nx * radius;
    positions[i * 3 + 1] = ny * radius;
    positions[i * 3 + 2] = nz * radius;
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
    uvs[i * 2] = 0.5 + Math.atan2(nx, nz) / (Math.PI * 2);
    uvs[i * 2 + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
  }
  const indices = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) {
    const [i0, i1, i2] = tris[i]!;
    indices[i * 3] = i0;
    indices[i * 3 + 1] = i1;
    indices[i * 3 + 2] = i2;
  }
  return { positions, normals, uvs, indices, analyticNormals: true };
}

function lkSmin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / Math.max(k, 1e-5);
  return Math.min(a, b) - h * h * h * k * (1 / 6);
}

function lkSmax(a: number, b: number, k: number): number {
  return -lkSmin(-a, -b, k);
}

function lkSdEllipsoid(
  x: number, y: number, z: number,
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number
): number {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}

function lkSdTaperedCapsule(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  ra: number, rb: number
): number {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const t = l2 > 1e-8 ? Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / l2)) : 0;
  const r = ra + (rb - ra) * t;
  return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - r;
}

/**
 * Builds an asymmetric anatomical/garment limb along an arbitrary 3D bind-pose segment `p0 -> p1`
 * using `sculptAnatomicalLimbMesh` oriented via a determinant-+1 orthonormal frame (`+Z` stays anterior).
 */
function sculptDirectedAnatomicalLimb(
  p0: V3,
  p1: V3,
  profile: readonly { readonly t: number; readonly rx: number; readonly rz: number; readonly zOffset?: number }[],
  opts: {
    readonly ringPoints?: number;
    readonly capEnds?: boolean;
    readonly muscleBiasZ?: number;
    readonly peakT?: number;
  } = {}
): RawMesh {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;

  const localMesh = lkSmoothFair(
    sculptAnatomicalLimbMesh(
      profile.map((st) => ({
        pos: [0, st.t * len, 0] as V3,
        rx: st.rx,
        rz: st.rz,
        zOffset: st.zOffset
      })),
      opts
    ),
    4
  );

  // Orthonormal frame `[right, up, forward]` with `det = +1` and `forward` aligned with character `+Z`
  let fx = -ux * uz;
  let fy = -uy * uz;
  let fz = 1 - uz * uz;
  let fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-4) {
    fx = 1;
    fy = 0;
    fz = 0;
    fLen = 1;
  }
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;
  // right = cross(up, forward) -> det([right, up, forward]) === +1
  const rx = uy * fz - uz * fy;
  const ry = uz * fx - ux * fz;
  const rz = ux * fy - uy * fx;

  const positions = new Float32Array(localMesh.positions.length);
  const normals = new Float32Array(localMesh.normals.length);
  for (let i = 0; i < localMesh.positions.length; i += 3) {
    const lx = localMesh.positions[i]!;
    const ly = localMesh.positions[i + 1]!;
    const lz = localMesh.positions[i + 2]!;
    positions[i] = p0[0] + rx * lx + ux * ly + fx * lz;
    positions[i + 1] = p0[1] + ry * lx + uy * ly + fy * lz;
    positions[i + 2] = p0[2] + rz * lx + uz * ly + fz * lz;

    const nx = localMesh.normals[i] ?? 0;
    const ny = localMesh.normals[i + 1] ?? 1;
    const nz = localMesh.normals[i + 2] ?? 0;
    normals[i] = rx * nx + ux * ny + fx * nz;
    normals[i + 1] = ry * nx + uy * ny + fy * nz;
    normals[i + 2] = rz * nx + uz * ny + fz * nz;
  }
  return { ...localMesh, positions, normals };
}

function contouredGolferRing(
  y: number,
  rx: number,
  rz: number,
  zOff: number,
  n = 16,
  frontProminence = 0,
  pleatAmp = 0
): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const front = sa > 0 ? frontProminence * sa * sa : 0;
    const pleat = sa > 0.35 ? pleatAmp * Math.cos(ca * 6) * sa : 0;
    pts.push([ca * rx, y, sa * rz + zOff + front + pleat]);
  }
  return pts;
}

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
  const key = `links:golf-folk-v6:${h.toFixed(3)}:${opts.poloMat}:${opts.vestTrimMat}:${opts.skinMat}:${opts.capMat}:${opts.trouserMat}:${opts.shoeMat}:${opts.shoeSaddleMat}:${opts.visorStyle ? 1 : 0}:${opts.caddieBibMat ?? -1}:${opts.marshalPaddleMat ?? -1}:${seed}`;
  const unitFolkHead = memoizeGeometry("links:golf-folk-v5:unit-head-sdf", () =>
    bakeMeshCavityAO(
      sculptOrganicSdfMesh({
        boundsMin: [-0.118, -0.105, -0.122],
        boundsMax: [0.118, 0.125, 0.132],
        resolution: [20, 24, 22],
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const ax = Math.abs(x);
          const cranium = lkSdEllipsoid(x, y, z, 0, 0.018, -0.004, 0.088, 0.098, 0.098);
          const jaw = lkSdEllipsoid(x, y, z, 0, -0.032, 0.016, 0.068, 0.062, 0.074);
          const chin = lkSdEllipsoid(x, y, z, 0, -0.068, 0.058, 0.030, 0.024, 0.030);
          const cheek = lkSdEllipsoid(ax, y, z, 0.046, -0.006, 0.048, 0.034, 0.030, 0.035);
          const brow = lkSdTaperedCapsule(ax, y, z, 0, 0.028, 0.082, 0.050, 0.024, 0.062, 0.015, 0.013);
          const nose = lkSdTaperedCapsule(x, y, z, 0, 0.020, 0.082, 0, -0.014, 0.104, 0.010, 0.013);
          const ear = lkSdEllipsoid(ax, y, z, 0.086, 0.002, -0.006, 0.013, 0.023, 0.017);
          let d = lkSmin(cranium, jaw, 0.032);
          d = lkSmin(d, chin, 0.022);
          d = lkSmin(d, cheek, 0.024);
          d = lkSmin(d, brow, 0.016);
          d = lkSmin(d, nose, 0.012);
          d = lkSmin(d, ear, 0.010);
          return d;
        }
      }),
      0.22
    )
  );
  return cachedSlots(key, () => {
    // Base organic articulated human (`wearingHat: false` so we mount C^1 SDF head + bespoke golf cap / tour visor)
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
    }).map((sl) => ({ mesh: bakeMeshCavityAO(lkSmoothFair(sl.mesh, 2), 0.24), materialIndex: sl.materialIndex }));

    // Smooth C^1 analytic-normal cranium/jawline/brow/nose/ears upgrade (`+Z` forward) + expressive eyes
    slots.push({
      mesh: transformMesh(unitFolkHead, { pos: [0, 1.545 * s, 0.01 * s], scale: s }),
      materialIndex: opts.skinMat
    });
    slots.push({
      mesh: lkMergeRaw([
        transformMesh(smoothSphereDetail3(0.0065 * s, 2), { pos: [-0.031 * s, 1.556 * s, 0.095 * s], scale: [1, 0.9, 0.65] }),
        transformMesh(smoothSphereDetail3(0.0065 * s, 2), { pos: [0.031 * s, 1.556 * s, 0.095 * s], scale: [1, 0.9, 0.65] })
      ]),
      materialIndex: opts.shoeSaddleMat
    });

    // Coiffed tour nape hair locks (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`) peeking cleanly beneath cap / visor
    const folkHairLocks: RawMesh[] = [];
    for (let i = -2; i <= 2; i += 1) {
      const ang = Math.PI + i * 0.36;
      const lx = Math.sin(ang) * 0.090 * s;
      const lz = Math.cos(ang) * 0.094 * s;
      folkHairLocks.push(
        taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [lx * 0.90, 1.590 * s, lz * 0.90],
            mid: [lx * 1.02, 1.548 * s, lz * 1.02],
            tip: [lx * 0.96, 1.512 * s, lz * 1.06],
            width: 0.022 * s,
            thickness: 0.012 * s,
            segments: 8,
            radialSegments: 8
          }),
          2
        )
      );
    }
    if (opts.visorStyle) {
      for (let i = 0; i < 5; i += 1) {
        const tx = ((i / 4) - 0.5) * 0.092 * s;
        folkHairLocks.push(
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [tx * 0.85, 1.638 * s, -0.025 * s],
              mid: [tx, 1.666 * s, 0.022 * s],
              tip: [tx * 0.92, 1.644 * s, 0.068 * s],
              width: 0.026 * s,
              thickness: 0.014 * s,
              segments: 8,
              radialSegments: 8
            }),
            2
          )
        );
      }
    }
    slots.push({
      mesh: bakeMeshCavityAO(mergeRawMeshesToRaw(folkHairLocks), 0.24),
      materialIndex: opts.shoeSaddleMat
    });

    // Two-tone saddle leather golf shoe straps & cleated welt soles
    const stride = (hash01(seed * 13 + 3) - 0.5) * 0.07 * s;
    for (const side of [-1, 1] as const) {
      const lx = side * 0.095 * s;
      const sz = side * stride;
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(bevelBoxMesh(0.102 * s, 0.022 * s, 0.222 * s, 0.006 * s), {
            pos: [lx, 0.011 * s, sz + 0.036 * s]
          }),
          0.24
        ),
        materialIndex: opts.vestTrimMat
      });
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(taubinSmoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.099 * s, 0.056 * s, 0.088 * s, 0.014 * s), 1, 0.44), 2), {
            pos: [lx, 0.044 * s, sz + 0.028 * s]
          }),
          0.24
        ),
        materialIndex: opts.shoeSaddleMat
      });
    }

    // Tailored polo button placket + folded collar wings + belt buckle
    slots.push({
      mesh: bakeMeshCavityAO(
        transformMesh(taubinSmoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.046 * s, 0.16 * s, 0.024 * s, 0.006 * s), 1, 0.4), 2), {
          pos: [0, 1.24 * s, 0.132 * s],
          rot: [-0.08, 0, 0]
        }),
        0.24
      ),
      materialIndex: opts.vestTrimMat
    });
    slots.push({
      mesh: bakeMeshCavityAO(
        transformMesh(bevelBoxMesh(0.052 * s, 0.038 * s, 0.022 * s, 0.005 * s), {
          pos: [0, 0.895 * s, 0.178 * s]
        }),
        0.24
      ),
      materialIndex: opts.shoeSaddleMat
    });

    // Sculpted curved-brim tour golf cap or open-crown sun visor (`+Z` forward face, smooth normals `flatShaded = false`)
    const billArch: V3[][] = [
      [[-0.086 * s, 1.605 * s, 0.08 * s], [0, 1.622 * s, 0.086 * s], [0.086 * s, 1.605 * s, 0.08 * s], [0, 1.614 * s, 0.078 * s]],
      [[-0.078 * s, 1.588 * s, 0.188 * s], [0, 1.606 * s, 0.205 * s], [0.078 * s, 1.588 * s, 0.188 * s], [0, 1.598 * s, 0.196 * s]]
    ];
    slots.push({
      mesh: bakeMeshCavityAO(lkSmoothFair(subdivideSmoothMesh(loftSectionsMesh(billArch, true, false), 1, 0.45), 3), 0.24),
      materialIndex: opts.capMat
    });
    if (opts.visorStyle) {
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(lkSmoothFair(latheMesh([[0.106 * s, 0], [0.114 * s, 0.012 * s], [0.114 * s, 0.046 * s], [0.106 * s, 0.052 * s]], 18), 2), {
            pos: [0, 1.585 * s, 0.008 * s],
            rot: [-0.08, 0, 0]
          }),
          0.24
        ),
        materialIndex: opts.capMat
      });
    } else {
      slots.push({
        mesh: bakeMeshCavityAO(
          lkSmoothFair(
            subdivideSmoothMesh(
              loftSectionsMesh(
                [
                  contouredGolferRing(1.575 * s, 0.104 * s, 0.112 * s, 0.004 * s, 18),
                  contouredGolferRing(1.628 * s, 0.098 * s, 0.106 * s, 0.002 * s, 18),
                  contouredGolferRing(1.676 * s, 0.052 * s, 0.058 * s, 0, 18)
                ],
                true,
                false
              ),
              1,
              0.5
            ),
            3
          ),
          0.24
        ),
        materialIndex: opts.capMat
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.020 * s, 0.012 * s, 0.020 * s, 0.004 * s), { pos: [0, 1.686 * s, 0.002 * s] }),
        materialIndex: opts.vestTrimMat
      });
    }

    // Optional tournament caddie bib apron (front & back panels + shoulder straps + yardage book)
    if (opts.caddieBibMat !== undefined) {
      // Fitted tournament bib tabard draped over the polo torso (`sculptDrapedGarmentMesh`, no flat slab panels)
      slots.push({
        mesh: bakeMeshCavityAO(
          shadeGolferForm(
            sculptDrapedGarmentMesh(
              [
                { y: 0.93 * s, rx: 0.204 * s, rz: 0.146 * s, z: 0.002 * s },
                { y: 1.02 * s, rx: 0.210 * s, rz: 0.150 * s, z: 0.004 * s },
                { y: 1.12 * s, rx: 0.226 * s, rz: 0.156 * s, z: 0.008 * s },
                { y: 1.23 * s, rx: 0.238 * s, rz: 0.154 * s, z: 0.007 * s },
                { y: 1.295 * s, rx: 0.236 * s, rz: 0.146 * s, z: 0.005 * s }
              ],
              { ringPoints: 28, capEnds: false, smoothPasses: 2 }
            ),
            0.9 * s,
            1.3 * s
          ),
          0.24
        ),
        materialIndex: opts.caddieBibMat
      });
      for (const bSide of [-1, 1] as const) {
        slots.push({
          mesh: bakeMeshCavityAO(
            sculptHumanoidLimbMesh(
              [[bSide * 0.11 * s, 1.29 * s, 0.12 * s, 0.016 * s], [bSide * 0.12 * s, 1.37 * s, 0, 0.017 * s], [bSide * 0.11 * s, 1.29 * s, -0.11 * s, 0.016 * s]],
              8,
              0.05
            ),
            0.24
          ),
          materialIndex: opts.caddieBibMat
        });
      }
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(bevelBoxMesh(0.095 * s, 0.13 * s, 0.022 * s, 0.005 * s), { pos: [0.09 * s, 0.88 * s, -0.132 * s], rot: [0.1, 0, -0.08] }),
          0.24
        ),
        materialIndex: opts.capMat
      });
    }

    // Optional course marshal raised "QUIET" paddle
    if (opts.marshalPaddleMat !== undefined) {
      slots.push({
        mesh: tubeSweepMesh([[0.22 * s, 0.82 * s, 0.1 * s, 0.012 * s], [0.27 * s, 1.72 * s, 0.13 * s, 0.012 * s]], 6),
        materialIndex: opts.marshalPaddleMat === opts.vestTrimMat ? opts.shoeSaddleMat : opts.shoeSaddleMat
      });
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(bevelBoxMesh(0.28 * s, 0.36 * s, 0.022 * s, 0.008 * s), { pos: [0.275 * s, 1.88 * s, 0.132 * s], rot: [0, -0.18, -0.04] }),
          0.24
        ),
        materialIndex: opts.marshalPaddleMat
      });
    }

    return slots;
  });
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
    refined
      ? material.fabric({ color: poloHex, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.3, sheenColor: "#ffffff" } as any)
      : material.pbr({ color: poloHex, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10 } as any),
    material.fabric({ color: "#f4f1e8", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.28, sheenColor: "#ffffff" } as any),
    material.physical({ color: skinHex, roughness: 0.56, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 }),
    material.fabric({ color: capHex, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.09, sheen: 0.25, sheenColor: "#dfece6" } as any),
    material.fabric({ color: "#cfc6b4", roughness: 0.66, clearcoat: 0, envMapIntensity: 0.08, sheen: 0.2, sheenColor: "#efe9dc" } as any),
    material.physical({ color: "#f6f3ec", roughness: 0.42, clearcoat: 0.18, envMapIntensity: 0.26 }),
    material.physical({ color: "#6b4428", roughness: 0.48, clearcoat: 0, envMapIntensity: 0.16 })
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
    refined
      ? material.fabric({ color: poloHex, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.34, sheenColor: "#ffffff" } as any)
      : material.pbr({ color: poloHex, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10 } as any),
    material.fabric({ color: "#f6f3eb", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10 } as any),
    material.physical({ color: fit.skin || "#c68a5a", roughness: 0.56, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 }),
    material.fabric({ color: fit.cap || "#14200f", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.09 } as any),
    material.fabric({ color: "#dcd5c7", roughness: 0.78, clearcoat: 0, envMapIntensity: 0.08 } as any),
    material.physical({ color: "#f7f5ef", roughness: 0.40, clearcoat: 0.20, envMapIntensity: 0.26 }),
    material.physical({ color: "#222933", roughness: 0.46, clearcoat: 0, envMapIntensity: 0.16 })
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
  // Organic skin & cloth suppress clearcoat (`clearcoat: 0`) and outdoor HDRI tree-branch reflections (`envMapIntensity: 0.08..0.10`).
  // Note: `chinoMat` strictly preserves `roughness: 0.78` required by `rig-nodes.test.ts`.
  const poloMat = refined
    ? material.fabric({ color: poloHex, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.36, sheenColor: "#ffffff" } as any)
    : material.pbr({ color: poloHex, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10 } as any);
  const ivoryMat = material.fabric({ color: "#f6f3ea", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.28, sheenColor: "#ffffff" } as any);
  const skinMat = material.physical({ color: skinHex, roughness: 0.56, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 });
  const capMat = material.fabric({ color: capHex, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.09, sheen: 0.26, sheenColor: "#dce8e2" } as any);
  const chinoMat = material.fabric({ color: "#dcd4c4", roughness: 0.78, clearcoat: 0, envMapIntensity: 0.08, sheen: 0.16, sheenColor: "#f3ede0" } as any);
  const beltLeatherMat = material.physical({ color: "#4a2f1b", roughness: 0.44, clearcoat: 0.14, envMapIntensity: 0.26 });
  const brassMat = material.studioMetal({ color: "#dfba62", roughness: 0.28, metalness: 0.88, envMapIntensity: 0.36 });
  const shoeWhiteMat = material.physical({ color: "#f8f6f0", roughness: 0.38, clearcoat: 0.24, envMapIntensity: 0.28 });
  const shoeSaddleMat = material.physical({ color: "#222b36", roughness: 0.42, clearcoat: 0.16, envMapIntensity: 0.26 });
  const gloveMat = material.physical({ color: "#fbfaf6", roughness: 0.54, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 });
  const hairMat = material.matteClay({ color: "#2b211a", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.08 } as any);
  const sunglassMat = material.lacquer({ color: "#121720", roughness: 0.16, clearcoat: 0.78, envMapIntensity: 0.32 });

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
    hairMat,        // 10
    sunglassMat     // 11
  ];

  // 1. Head: unified C^1 analytic-normal `sculptOrganicSdfMesh` head + neck + ears + facial planes, detail-3 eyes, coiffed hair locks, sunglasses & curved-brim cap (`golfer-head`)
  const headSlots = cachedSlots("links:golfer-v5:head", () => {
    const unifiedHeadAndNeck = sculptOrganicSdfMesh({
      boundsMin: [-0.125, -0.078, -0.135],
      boundsMax: [0.125, 0.238, 0.145],
      resolution: [24, 28, 26],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const ax = Math.abs(x);
        const cranium = lkSdEllipsoid(x, y, z, 0, 0.126, 0.000, 0.094, 0.104, 0.104);
        const jaw = lkSdEllipsoid(x, y, z, 0, 0.074, 0.022, 0.072, 0.066, 0.078);
        const chin = lkSdEllipsoid(x, y, z, 0, 0.036, 0.068, 0.032, 0.025, 0.032);
        const cheek = lkSdEllipsoid(ax, y, z, 0.050, 0.102, 0.056, 0.036, 0.032, 0.038);
        const brow = lkSdTaperedCapsule(ax, y, z, 0, 0.138, 0.090, 0.054, 0.134, 0.070, 0.016, 0.013);
        const nose = lkSdTaperedCapsule(x, y, z, 0, 0.130, 0.090, 0, 0.094, 0.112, 0.011, 0.014);
        const muzzle = lkSdEllipsoid(x, y, z, 0, 0.070, 0.084, 0.028, 0.015, 0.022);
        const ear = lkSdEllipsoid(ax, y, z, 0.093, 0.112, -0.002, 0.014, 0.025, 0.018);
        const neck = lkSdTaperedCapsule(x, y, z, 0, -0.062, -0.010, 0, 0.052, 0.002, 0.058, 0.052);
        const eyeSocket = lkSdEllipsoid(ax, y, z, 0.034, 0.124, 0.092, 0.022, 0.013, 0.015);
        let d = lkSmin(cranium, jaw, 0.034);
        d = lkSmin(d, chin, 0.024);
        d = lkSmin(d, cheek, 0.026);
        d = lkSmin(d, brow, 0.018);
        d = lkSmin(d, nose, 0.013);
        d = lkSmin(d, muzzle, 0.015);
        d = lkSmin(d, ear, 0.011);
        d = lkSmin(d, neck, 0.028);
        d = lkSmax(d, -eyeSocket, 0.008);
        return d;
      }
    });

    // Crisp expressive detail-3 analytic-normal sclera & iris spheres seated cleanly behind wraparound lenses
    const eyeScleras = lkMergeRaw([
      transformMesh(smoothSphereDetail3(0.012, 3), { pos: [-0.034, 0.124, 0.086], rot: [0, -0.12, 0], scale: [1.04, 0.68, 0.60] }),
      transformMesh(smoothSphereDetail3(0.012, 3), { pos: [0.034, 0.124, 0.086], rot: [0, 0.12, 0], scale: [1.04, 0.68, 0.60] })
    ]);
    const eyeIrises = lkMergeRaw([
      transformMesh(smoothSphereDetail3(0.0068, 3), { pos: [-0.033, 0.124, 0.091], scale: [0.95, 0.92, 0.56] }),
      transformMesh(smoothSphereDetail3(0.0068, 3), { pos: [0.033, 0.124, 0.091], scale: [0.95, 0.92, 0.56] })
    ]);

    // Coiffed tour hair locks (`flatShaded = false` on crown + smooth `sculptCurvedHairLockMesh`) peeking cleanly beneath cap temples & nape
    const tourHairLocks: RawMesh[] = [
      lkSmoothFair(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              contouredGolferRing(0.078, 0.088, 0.086, -0.024, 18),
              contouredGolferRing(0.118, 0.100, 0.102, -0.016, 18),
              contouredGolferRing(0.156, 0.102, 0.106, -0.008, 18)
            ],
            true,
            false
          ),
          1,
          0.5
        ),
        4
      ),
      lkSmoothFair(
        sculptCurvedHairLockMesh({
          root: [-0.016, 0.143, 0.100],
          mid: [-0.035, 0.147, 0.098],
          tip: [-0.052, 0.142, 0.090],
          width: 0.008,
          thickness: 0.005,
          segments: 8,
          radialSegments: 8
        }),
        3
      ),
      lkSmoothFair(
        sculptCurvedHairLockMesh({
          root: [0.016, 0.143, 0.100],
          mid: [0.035, 0.147, 0.098],
          tip: [0.052, 0.142, 0.090],
          width: 0.008,
          thickness: 0.005,
          segments: 8,
          radialSegments: 8
        }),
        3
      )
    ];
    for (let i = -2; i <= 2; i += 1) {
      const ang = Math.PI + i * 0.35;
      const lx = Math.sin(ang) * 0.092;
      const lz = Math.cos(ang) * 0.094 - 0.010;
      tourHairLocks.push(
        lkSmoothFair(
          sculptCurvedHairLockMesh({
            root: [lx * 0.92, 0.140, lz * 0.92],
            mid: [lx * 1.02, 0.106, lz * 1.02],
            tip: [lx * 0.96, 0.076, lz * 1.06 - 0.006],
            width: 0.024,
            thickness: 0.013,
            segments: 9,
            radialSegments: 8
          }),
          3
        )
      );
    }
    for (const sx of [-1, 1] as const) {
      tourHairLocks.push(
        lkSmoothFair(
          sculptCurvedHairLockMesh({
            root: [sx * 0.096, 0.142, 0.014],
            mid: [sx * 0.098, 0.118, 0.020],
            tip: [sx * 0.092, 0.096, 0.024],
            width: 0.015,
            thickness: 0.0085,
            segments: 8,
            radialSegments: 8
          }),
          3
        )
      );
    }
    const coiffedHair = lkMergeRaw(tourHairLocks);

    // Polarized wraparound tour sunglasses (`flatShaded = false`) + temple arms + brushed brass nose bridge
    const lensWrap = lkSmoothFair(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            [[-0.082, 0.118, 0.056], [-0.082, 0.142, 0.056], [-0.088, 0.142, 0.048], [-0.088, 0.118, 0.048]],
            [[-0.044, 0.114, 0.099], [-0.044, 0.142, 0.101], [-0.044, 0.142, 0.092], [-0.044, 0.114, 0.091]],
            [[0, 0.122, 0.106], [0, 0.142, 0.107], [0, 0.142, 0.098], [0, 0.122, 0.097]],
            [[0.044, 0.114, 0.099], [0.044, 0.142, 0.101], [0.044, 0.142, 0.092], [0.044, 0.114, 0.091]],
            [[0.082, 0.118, 0.056], [0.082, 0.142, 0.056], [0.088, 0.142, 0.048], [0.088, 0.118, 0.048]]
          ],
          true,
          false
        ),
        1,
        0.44
      ),
      4
    );
    const templeArms = lkMergeRaw([
      transformMesh(bevelBoxMesh(0.008, 0.009, 0.068, 0.002), { pos: [-0.088, 0.134, 0.022] }),
      transformMesh(bevelBoxMesh(0.008, 0.009, 0.068, 0.002), { pos: [0.088, 0.134, 0.022] })
    ]);
    const browBridge = transformMesh(bevelBoxMesh(0.036, 0.006, 0.010, 0.002), { pos: [0, 0.141, 0.105] });

    // Structured 6-panel tour golf cap crown + curved sandwich bill (`flatShaded = false`) + raised front tour crest
    const capCrown = lkSmoothFair(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            contouredGolferRing(0.148, 0.104, 0.112, 0.004, 20, 0.004),
            contouredGolferRing(0.188, 0.103, 0.111, 0.005, 20, 0.006),
            contouredGolferRing(0.228, 0.084, 0.092, 0.002, 20, 0.003),
            contouredGolferRing(0.250, 0.036, 0.040, 0, 20)
          ],
          true,
          false
        ),
        1,
        0.5
      ),
      4
    );
    const capBill = lkSmoothFair(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            [[-0.088, 0.154, 0.078], [0, 0.174, 0.090], [0.088, 0.154, 0.078], [0, 0.165, 0.076]],
            [[-0.084, 0.146, 0.138], [0, 0.166, 0.152], [0.084, 0.146, 0.138], [0, 0.157, 0.142]],
            [[-0.074, 0.136, 0.194], [0, 0.154, 0.212], [0.074, 0.136, 0.194], [0, 0.146, 0.200]]
          ],
          true,
          false
        ),
        1,
        0.48
      ),
      4
    );
    const capTrim = lkMergeRaw([
      transformMesh(bevelBoxMesh(0.018, 0.010, 0.018, 0.004), { pos: [0, 0.256, 0.002] }),
      transformMesh(bevelBoxMesh(0.040, 0.024, 0.010, 0.003), { pos: [0, 0.188, 0.112], rot: [-0.14, 0, 0] }),
      lkSmoothFair(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              [[-0.075, 0.134, 0.190], [0, 0.152, 0.208], [0.075, 0.134, 0.190], [0, 0.144, 0.198]],
              [[-0.073, 0.133, 0.197], [0, 0.151, 0.215], [0.073, 0.133, 0.197], [0, 0.143, 0.205]]
            ],
            true,
            false
          ),
          1,
          0.44
        ),
        4
      ),
      eyeScleras
    ]);

    return [
      { mesh: bakeMeshCavityAO(shadeGolferForm(unifiedHeadAndNeck, -0.06, 0.22, 0.04, 0.06), 0.22), materialIndex: 2 },
      { mesh: bakeMeshCavityAO(shadeGolferForm(coiffedHair, 0.07, 0.17, 0.04, 0.08), 0.24), materialIndex: 10 },
      { mesh: bakeMeshCavityAO(lkMergeRaw([lensWrap, templeArms, eyeIrises]), 0.20), materialIndex: 11 },
      { mesh: browBridge, materialIndex: 6 },
      { mesh: bakeMeshCavityAO(shadeGolferForm(lkMergeRaw([capCrown, capBill]), 0.13, 0.26, 0.05, 0.08), 0.24), materialIndex: 3 },
      { mesh: bakeMeshCavityAO(capTrim, 0.24), materialIndex: 1 }
    ];
  });
  const headNode = group("golfer-head", [assembleMultiMaterialNode("golfer-head-mesh", headSlots, golferMats)])
    .position(rig.tHead[0], rig.tHead[1], rig.tHead[2])
    .runtime(rt("golfer-head"));

  // 2. Arms (`golfer-arm-l/r` -> `golfer-forearm-l/r`): ZERO sphere balls! Tailored polo sleeve + ribbed cuff + `sculptAnatomicalLimbMesh` forearms + cabretta glove
  const buildArmBranch = (side: "l" | "r") => {
    const isLeft = side === "l";
    const sideSign = isLeft ? -1 : 1;
    const tShoulder = isLeft ? rig.tShoulderL : rig.tShoulderR;
    const tFore = isLeft ? rig.tForearmL : rig.tForearmR;
    const palm = isLeft ? rig.palmL : rig.palmR;
    const sleeveStart: V3 = [-tFore[0] * 0.10, -tFore[1] * 0.10, -tFore[2] * 0.10];
    const sleeveEnd: V3 = [tFore[0] * 0.50, tFore[1] * 0.50, tFore[2] * 0.50];
    const cuffStart: V3 = [tFore[0] * 0.43, tFore[1] * 0.43, tFore[2] * 0.43];
    const cuffEnd: V3 = [tFore[0] * 0.52, tFore[1] * 0.52, tFore[2] * 0.52];
    const bicepStart: V3 = [tFore[0] * 0.40, tFore[1] * 0.40, tFore[2] * 0.40];
    const bicepEnd: V3 = [tFore[0] * 1.04, tFore[1] * 1.04, tFore[2] * 1.04];

    const upperSlots = cachedSlots(`links:golfer-v5:upper-arm:${side}`, () => {
      // Smooth capped deltoid & tailored piqué sleeve (`ringPoints: 20` + seamless glenohumeral cap)
      const sleeve = lkMergeRaw([
        sculptDirectedAnatomicalLimb(
          sleeveStart,
          sleeveEnd,
          [
            { t: 0, rx: 0.062, rz: 0.064 },
            { t: 0.28, rx: 0.068, rz: 0.070, zOffset: 0.003 },
            { t: 0.68, rx: 0.062, rz: 0.064, zOffset: 0.003 },
            { t: 1.0, rx: 0.057, rz: 0.059 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: 0.003, peakT: 0.35 }
        ),
        transformMesh(smoothSphereDetail3(0.062, 2), { pos: [0, 0, 0], scale: [1, 1.04, 1.04] })
      ]);
      const ribbedCuff = sculptDirectedAnatomicalLimb(
        cuffStart,
        cuffEnd,
        [
          { t: 0, rx: 0.058, rz: 0.060 },
          { t: 0.5, rx: 0.060, rz: 0.062 },
          { t: 1.0, rx: 0.058, rz: 0.060 }
        ],
        { ringPoints: 20, capEnds: false }
      );
      const bicep = lkMergeRaw([
        sculptDirectedAnatomicalLimb(
          bicepStart,
          bicepEnd,
          [
            { t: 0, rx: 0.050, rz: 0.052 },
            { t: 0.45, rx: 0.049, rz: 0.052, zOffset: 0.004 },
            { t: 0.85, rx: 0.044, rz: 0.046, zOffset: 0.002 },
            { t: 1.0, rx: 0.041, rz: 0.043 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: 0.004, peakT: 0.42 }
        ),
        transformMesh(smoothSphereDetail3(0.041, 2), { pos: tFore, scale: [1, 0.98, 1.04] })
      ]);
      return [
        { mesh: bakeMeshCavityAO(shadeGolferForm(sleeve, -0.18, 0.04, 0.04, 0.07), 0.24), materialIndex: 0 },
        { mesh: bakeMeshCavityAO(ribbedCuff, 0.24), materialIndex: 1 },
        { mesh: bakeMeshCavityAO(shadeGolferForm(bicep, -0.30, -0.08, 0.03, 0.06), 0.24), materialIndex: 2 }
      ];
    });

    const foreStart: V3 = [-palm[0] * 0.05, -palm[1] * 0.05, -palm[2] * 0.05];
    const wristPt: V3 = [palm[0] * 0.76, palm[1] * 0.76, palm[2] * 0.76];
    const handMat = isLeft ? 9 : 2; // Crisp white cabretta-leather golf glove on lead (left) hand

    const foreSlots = cachedSlots(`links:golfer-v5:forearm:${side}`, () => {
      const forearm = lkMergeRaw([
        sculptDirectedAnatomicalLimb(
          foreStart,
          wristPt,
          [
            { t: 0, rx: 0.041, rz: 0.043 },
            { t: 0.34, rx: 0.045, rz: 0.047, zOffset: 0.003 },
            { t: 0.72, rx: 0.037, rz: 0.039, zOffset: 0.001 },
            { t: 1.0, rx: 0.032, rz: 0.034 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: 0.003, peakT: 0.34 }
        ),
        transformMesh(smoothSphereDetail3(0.041, 2), { pos: [0, 0, 0], scale: [1, 1.02, 1.04] }),
        transformMesh(smoothSphereDetail3(0.032, 2), { pos: wristPt })
      ]);
      // Sculpted anatomical gripping hand + 4 curled fingers + opposable thumb around `palm`
      const palmMid: V3 = [palm[0] * 0.96, palm[1] * 0.96, palm[2] * 0.96];
      const palmBlock = sculptDirectedAnatomicalLimb(
        wristPt,
        palmMid,
        [
          { t: 0, rx: 0.034, rz: 0.030 },
          { t: 0.55, rx: 0.043, rz: 0.032, zOffset: 0.004 },
          { t: 1.0, rx: 0.040, rz: 0.028, zOffset: 0.006 }
        ],
        { ringPoints: 16, capEnds: true }
      );
      const fingerMeshes: RawMesh[] = [palmBlock];
      for (let f = 0; f < 4; f += 1) {
        const lat = (f - 1.5) * 0.012;
        const reach = f === 1 || f === 2 ? 1.18 : 1.13;
        fingerMeshes.push(
          sculptDirectedAnatomicalLimb(
            [palmMid[0] + lat * 0.75, palmMid[1], palmMid[2] + 0.004],
            [palm[0] * reach + lat * 0.85, palm[1] * reach, palm[2] * reach + 0.014],
            [
              { t: 0, rx: 0.0072, rz: 0.0076 },
              { t: 0.55, rx: 0.0064, rz: 0.0068, zOffset: 0.003 },
              { t: 1.0, rx: 0.0052, rz: 0.0056, zOffset: 0.005 }
            ],
            { ringPoints: 10, capEnds: true }
          )
        );
      }
      const thumbGrip = sculptDirectedAnatomicalLimb(
        [wristPt[0] + sideSign * 0.016, wristPt[1], wristPt[2] + 0.010],
        [palm[0] + sideSign * 0.024, palm[1], palm[2] + 0.028],
        [
          { t: 0, rx: 0.012, rz: 0.012 },
          { t: 0.55, rx: 0.010, rz: 0.010 },
          { t: 1.0, rx: 0.008, rz: 0.008 }
        ],
        { ringPoints: 10, capEnds: true }
      );
      fingerMeshes.push(thumbGrip);
      const handCombined = lkMergeRaw(fingerMeshes);

      const extras: MultiMatSlot[] = [];
      if (isLeft) {
        // Cabretta glove ribbed cuff + diagonal navy velcro tab + brass ball-marker snap
        const gloveCuff = sculptDirectedAnatomicalLimb(
          [palm[0] * 0.68, palm[1] * 0.68, palm[2] * 0.68],
          [palm[0] * 0.80, palm[1] * 0.80, palm[2] * 0.80],
          [
            { t: 0, rx: 0.037, rz: 0.038 },
            { t: 1.0, rx: 0.038, rz: 0.039 }
          ],
          { ringPoints: 16, capEnds: true }
        );
        const velcroTab = lkSmoothFair(
          subdivideSmoothMesh(
            transformMesh(bevelBoxMesh(0.034, 0.020, 0.014, 0.004), {
              pos: [wristPt[0], wristPt[1] + 0.004, wristPt[2] + 0.028],
              rot: [0, 0, -0.18]
            }),
            1,
            0.4
          ),
          3
        );
        const markerStud = transformMesh(smoothSphereDetail3(0.0055, 2), {
          pos: [wristPt[0] + 0.006, wristPt[1] + 0.004, wristPt[2] + 0.034],
          scale: [1, 1, 0.65]
        });
        extras.push(
          { mesh: bakeMeshCavityAO(gloveCuff, 0.24), materialIndex: 9 },
          { mesh: bakeMeshCavityAO(velcroTab, 0.24), materialIndex: 8 },
          { mesh: markerStud, materialIndex: 6 }
        );
      } else {
        // Luxury tour wristwatch strap + brushed-brass bezel on right wrist
        const watchStrap = sculptDirectedAnatomicalLimb(
          [palm[0] * 0.66, palm[1] * 0.66, palm[2] * 0.66],
          [palm[0] * 0.73, palm[1] * 0.73, palm[2] * 0.73],
          [
            { t: 0, rx: 0.035, rz: 0.036 },
            { t: 1.0, rx: 0.035, rz: 0.036 }
          ],
          { ringPoints: 16, capEnds: false }
        );
        const watchCase = transformMesh(smoothSphereDetail3(0.012, 2), {
          pos: [palm[0] * 0.70, palm[1] * 0.70, palm[2] * 0.70 + 0.032],
          scale: [1.0, 0.92, 0.42]
        });
        extras.push(
          { mesh: bakeMeshCavityAO(watchStrap, 0.24), materialIndex: 5 },
          { mesh: watchCase, materialIndex: 6 }
        );
      }

      return [
        { mesh: bakeMeshCavityAO(shadeGolferForm(forearm, -0.24, 0.02, 0.04, 0.06), 0.24), materialIndex: 2 },
        ...extras,
        { mesh: bakeMeshCavityAO(shadeGolferForm(handCombined, -0.34, -0.18, 0.04, 0.07), 0.24), materialIndex: handMat }
      ];
    });

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

  // 3. Chest (`golfer-chest` at `rig.tChest`) & Spine (`golfer-spine` at `rig.tSpine`): C^1 analytic-normal piqué polo + folded collar + 3-button placket
  const chestSlots = cachedSlots("links:golfer-v5:chest", () => {
    const poloTorso = sculptOrganicSdfMesh({
      boundsMin: [-0.26, -0.175, -0.155],
      boundsMax: [0.26, 0.178, 0.165],
      resolution: [22, 26, 22],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const ax = Math.abs(x);
        const lower = lkSdEllipsoid(x, y, z, 0, -0.095, 0.006, 0.164, 0.082, 0.114);
        const chest = lkSdEllipsoid(x, y, z, 0, 0.028, 0.010, 0.194, 0.118, 0.128);
        const pecs = lkSdEllipsoid(ax, y, z, 0.070, 0.052, 0.046, 0.088, 0.066, 0.082);
        const lats = lkSdEllipsoid(ax, y, z, 0.122, 0.008, -0.012, 0.086, 0.104, 0.088);
        const yoke = lkSdTaperedCapsule(ax, y, z, 0, 0.105, 0.002, 0.206, 0.082, 0, 0.076, 0.058);
        const traps = lkSdTaperedCapsule(ax, y, z, 0, 0.144, 0, 0.132, 0.105, 0.002, 0.072, 0.054);
        let d = lkSmin(lower, chest, 0.038);
        d = lkSmin(d, pecs, 0.030);
        d = lkSmin(d, lats, 0.034);
        d = lkSmin(d, yoke, 0.030);
        d = lkSmin(d, traps, 0.026);
        return d;
      }
    });

    // Folded spread polo collar stand + pointed collar wings + 3-button front placket
    const collarStand = lkSmoothFair(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            contouredGolferRing(0.124, 0.088, 0.086, 0.004, 20, 0.004),
            contouredGolferRing(0.154, 0.094, 0.092, 0.004, 20, 0.004),
            contouredGolferRing(0.170, 0.080, 0.080, 0.002, 20)
          ],
          false,
          false
        ),
        1,
        0.42
      ),
      3
    );
    const collarWingL = lkSmoothFair(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.046, 0.036, 0.016, 0.005), {
          pos: [-0.044, 0.136, 0.086],
          rot: [-0.24, -0.32, 0.28]
        }),
        1,
        0.42
      ),
      3
    );
    const collarWingR = lkSmoothFair(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.046, 0.036, 0.016, 0.005), {
          pos: [0.044, 0.136, 0.086],
          rot: [-0.24, 0.32, -0.28]
        }),
        1,
        0.42
      ),
      3
    );
    const placket = lkSmoothFair(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.040, 0.152, 0.020, 0.005), {
          pos: [0, 0.048, 0.132],
          rot: [-0.08, 0, 0]
        }),
        1,
        0.42
      ),
      3
    );

    // 3 distinct smooth spherical polo buttons + embroidered left-chest tour shield crest
    const buttonsAndCrest = lkMergeRaw([
      transformMesh(smoothSphereDetail3(0.0055, 2), { pos: [0, 0.098, 0.141], scale: [1, 1, 0.55] }),
      transformMesh(smoothSphereDetail3(0.0055, 2), { pos: [0, 0.056, 0.144], scale: [1, 1, 0.55] }),
      transformMesh(smoothSphereDetail3(0.0055, 2), { pos: [0, 0.014, 0.146], scale: [1, 1, 0.55] }),
      transformMesh(
        extrudePolygonMesh(
          [[-0.016, 0.019], [0.016, 0.019], [0.018, -0.003], [0, -0.020], [-0.018, -0.003]],
          0.010,
          0.0025,
          true
        ),
        { pos: [-0.078, 0.056, 0.134], rot: [-0.08, -0.18, 0] }
      )
    ]);

    return [
      { mesh: bakeMeshCavityAO(shadeGolferForm(poloTorso, -0.15, 0.16, 0.05, 0.08), 0.24), materialIndex: 0 },
      { mesh: bakeMeshCavityAO(lkMergeRaw([collarStand, collarWingL, collarWingR, placket]), 0.24), materialIndex: 1 },
      { mesh: bakeMeshCavityAO(buttonsAndCrest, 0.24), materialIndex: 6 }
    ];
  });
  const chestNode = group("golfer-chest", [
    assembleMultiMaterialNode("golfer-chest-mesh", chestSlots, golferMats),
    headNode,
    buildArmBranch("l"),
    buildArmBranch("r")
  ])
    .position(rig.tChest[0], rig.tChest[1], rig.tChest[2])
    .runtime(rt("golfer-chest"));

  const spineSlots = cachedSlots("links:golfer-v5:spine", () => [
    {
      mesh: bakeMeshCavityAO(
        shadeGolferForm(
          lkSmoothFair(
            subdivideSmoothMesh(
              sculptDrapedGarmentMesh(
                [
                  { y: -0.085, rx: 0.156, rz: 0.112, z: 0.005, folds: 5, foldAmp: 0.015, superellipseN: 2.16 },
                  { y: 0.035, rx: 0.160, rz: 0.115, z: 0.007, folds: 5, foldAmp: 0.012, superellipseN: 2.18 },
                  { y: 0.155, rx: 0.168, rz: 0.120, z: 0.008, superellipseN: 2.20 }
                ],
                { ringPoints: 20, capEnds: true, smoothPasses: 4 }
              ),
              1,
              0.46
            ),
            4
          ),
          -0.09,
          0.16,
          0.04,
          0.07
        ),
        0.24
      ),
      materialIndex: 0
    }
  ]);
  const spineNode = group("golfer-spine", [
    assembleMultiMaterialNode("golfer-spine-mesh", spineSlots, golferMats),
    chestNode
  ])
    .position(rig.tSpine[0], rig.tSpine[1], rig.tSpine[2])
    .runtime(rt("golfer-spine"));

  // 4. Legs (`golfer-thigh-l/r` -> `golfer-shin-l/r` -> `golfer-foot-l/r`): pleated matte chinos (`roughness: 0.78`) & smooth two-tone saddle shoes
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

    const thighSlots = cachedSlots(`links:golfer-v5:thigh:${side}`, () => {
      const thighStart: V3 = [-kneeOff[0] * 0.08, -kneeOff[1] * 0.08, -kneeOff[2] * 0.08];
      const thighEnd: V3 = [kneeOff[0] * 1.04, kneeOff[1] * 1.04, kneeOff[2] * 1.04];
      const trouserThigh = lkMergeRaw([
        sculptDirectedAnatomicalLimb(
          thighStart,
          thighEnd,
          [
            { t: 0, rx: 0.092, rz: 0.098, zOffset: 0.004 },
            { t: 0.35, rx: 0.086, rz: 0.094, zOffset: 0.006 },
            { t: 0.72, rx: 0.075, rz: 0.082, zOffset: 0.005 },
            { t: 1.0, rx: 0.064, rz: 0.069, zOffset: 0.003 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: 0.004, peakT: 0.38 }
        ),
        transformMesh(smoothSphereDetail3(0.088, 2), { pos: [0, 0, 0.004], scale: [1, 1.02, 1.06] }),
        transformMesh(smoothSphereDetail3(0.064, 2), { pos: kneeOff, scale: [1, 0.98, 1.06] })
      ]);
      return [
        { mesh: bakeMeshCavityAO(shadeGolferForm(trouserThigh, -0.45, 0.05, 0.04, 0.07), 0.24), materialIndex: 4 }
      ];
    });

    const shinSlots = cachedSlots(`links:golfer-v5:shin:${side}`, () => {
      const shinStart: V3 = [-ankleOff[0] * 0.05, -ankleOff[1] * 0.05, -ankleOff[2] * 0.05];
      const shinEnd: V3 = [ankleOff[0] * 0.94, ankleOff[1] * 0.94, ankleOff[2] * 0.94];
      const trouserShin = lkMergeRaw([
        sculptDirectedAnatomicalLimb(
          shinStart,
          shinEnd,
          [
            { t: 0, rx: 0.063, rz: 0.068, zOffset: 0.002 },
            { t: 0.36, rx: 0.064, rz: 0.070, zOffset: -0.004 },
            { t: 0.74, rx: 0.055, rz: 0.060, zOffset: 0.001 },
            { t: 1.0, rx: 0.051, rz: 0.056, zOffset: 0.002 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: -0.003, peakT: 0.38 }
        ),
        transformMesh(smoothSphereDetail3(0.062, 2), { pos: [0, 0, 0.002], scale: [1, 1.02, 1.06] })
      ]);
      const trouserTurnUp = sculptDirectedAnatomicalLimb(
        [ankleOff[0] * 0.87, ankleOff[1] * 0.87, ankleOff[2] * 0.87],
        [ankleOff[0] * 0.96, ankleOff[1] * 0.96, ankleOff[2] * 0.96],
        [
          { t: 0, rx: 0.053, rz: 0.058 },
          { t: 0.5, rx: 0.055, rz: 0.060 },
          { t: 1.0, rx: 0.054, rz: 0.059 }
        ],
        { ringPoints: 20, capEnds: false }
      );
      return [
        { mesh: bakeMeshCavityAO(shadeGolferForm(lkMergeRaw([trouserShin, trouserTurnUp]), -0.44, 0.03, 0.04, 0.08), 0.24), materialIndex: 4 }
      ];
    });

    // Two-tone tour golf saddle shoe grounded cleanly at `y = soleY = -ankleY` (`minY = 0` in model space)
    const soleY = -ankleY;
    const footSlots = cachedSlots(`links:golfer-v5:foot:${side}`, () => {
      const ankleSock = lkMergeRaw([
        lkSmoothFair(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.032, 0], rx: 0.043, rz: 0.046 },
              { pos: [0, soleY + 0.062, 0.008], rx: 0.046, rz: 0.050 }
            ],
            { ringPoints: 18, capEnds: true }
          ),
          3
        ),
        transformMesh(smoothSphereDetail3(0.042, 2), { pos: [0, 0.004, 0], scale: [1, 0.96, 1.05] })
      ]);
      // Welted tour outsole resting cleanly on `y = soleY` (`soleY + 0.011 - 0.011 = soleY`)
      const weltSole = transformMesh(bevelBoxMesh(0.106, 0.022, 0.252, 0.005), {
        pos: [0, soleY + 0.011, 0.052]
      });
      // Sculpted full-grain white leather golf shoe last (`flatShaded = false`)
      const leatherUpper = lkSmoothFair(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              [[-0.046, soleY + 0.022, -0.066], [0.046, soleY + 0.022, -0.066], [0.043, soleY + 0.092, -0.054], [-0.043, soleY + 0.092, -0.054]],
              [[-0.052, soleY + 0.022, 0.004], [0.052, soleY + 0.022, 0.004], [0.048, soleY + 0.088, 0.002], [-0.048, soleY + 0.088, 0.002]],
              [[-0.053, soleY + 0.022, 0.068], [0.053, soleY + 0.022, 0.068], [0.047, soleY + 0.076, 0.062], [-0.047, soleY + 0.076, 0.062]],
              [[-0.046, soleY + 0.022, 0.128], [0.046, soleY + 0.022, 0.128], [0.039, soleY + 0.062, 0.122], [-0.039, soleY + 0.062, 0.122]],
              [[-0.031, soleY + 0.022, 0.172], [0.031, soleY + 0.022, 0.172], [0.025, soleY + 0.050, 0.166], [-0.025, soleY + 0.050, 0.166]]
            ],
            true,
            false
          ),
          1,
          0.48
        ),
        4
      );
      // Contrast perforated tour saddle wrap (`flatShaded = false`) + heel counter + kiltie tongue
      const saddleAndHeel = lkMergeRaw([
        lkSmoothFair(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                [[-0.055, soleY + 0.022, 0.002], [0.055, soleY + 0.022, 0.002], [0.050, soleY + 0.082, 0.008], [-0.050, soleY + 0.082, 0.008]],
                [[-0.056, soleY + 0.022, 0.074], [0.056, soleY + 0.022, 0.074], [0.049, soleY + 0.076, 0.068], [-0.049, soleY + 0.076, 0.068]]
              ],
              true,
              false
            ),
            1,
            0.44
          ),
          4
        ),
        lkSmoothFair(subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.086, 0.046, 0.034, 0.008), { pos: [0, soleY + 0.048, -0.056] }), 1, 0.42), 3),
        lkSmoothFair(subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.050, 0.014, 0.072, 0.005), { pos: [0, soleY + 0.082, 0.048], rot: [0.24, 0, 0] }), 1, 0.42), 3)
      ]);
      return [
        { mesh: bakeMeshCavityAO(ankleSock, 0.24), materialIndex: 1 },
        { mesh: bakeMeshCavityAO(weltSole, 0.24), materialIndex: 8 },
        { mesh: bakeMeshCavityAO(shadeGolferForm(leatherUpper, soleY + 0.02, soleY + 0.10, 0.05, 0.08), 0.24), materialIndex: 7 },
        { mesh: bakeMeshCavityAO(saddleAndHeel, 0.24), materialIndex: 8 }
      ];
    });

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

  // 5. Pelvis + draped pleated matte chinos + belt loops + stitched leather belt (`flatShaded = false`) + brushed-brass buckle (`golfer-hips` at `rig.hipsBind`)
  const hipsSlots = cachedSlots("links:golfer-v5:hips", () => {
    const chinoPelvis = lkSmoothFair(
      subdivideSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.145, rx: 0.164, rz: 0.118, z: 0.002, folds: 6, foldAmp: 0.015, superellipseN: 2.16 },
            { y: -0.065, rx: 0.170, rz: 0.124, z: 0.004, folds: 6, foldAmp: 0.012, superellipseN: 2.18 },
            { y: 0.005, rx: 0.164, rz: 0.119, z: 0.005, superellipseN: 2.18 },
            { y: 0.055, rx: 0.158, rz: 0.114, z: 0.006, superellipseN: 2.16 }
          ],
          { ringPoints: 20, capEnds: true, smoothPasses: 4 }
        ),
        1,
        0.46
      ),
      4
    );
    // Twin front knife-pleats + 5 chino belt loops
    const pleatsAndLoops = lkMergeRaw([
      lkSmoothFair(subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.012, 0.135, 0.014, 0.004), { pos: [-0.062, -0.052, 0.118], rot: [0.04, -0.18, 0] }), 1, 0.4), 3),
      lkSmoothFair(subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.012, 0.135, 0.014, 0.004), { pos: [0.062, -0.052, 0.118], rot: [0.04, 0.18, 0] }), 1, 0.4), 3),
      ...[-0.85, -0.42, 0.42, 0.85, Math.PI].map((ang) =>
        transformMesh(bevelBoxMesh(0.012, 0.044, 0.012, 0.003), {
          pos: [Math.sin(ang) * 0.165, 0.038, Math.cos(ang) * 0.121 + 0.006],
          rot: [0, ang, 0]
        })
      )
    ]);
    const beltStrap = lkSmoothFair(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            contouredGolferRing(0.020, 0.164, 0.120, 0.006, 20, 0.004),
            contouredGolferRing(0.054, 0.163, 0.119, 0.006, 20, 0.004)
          ],
          true,
          false
        ),
        1,
        0.42
      ),
      3
    );
    const brassBuckle = lkMergeRaw([
      transformMesh(bevelBoxMesh(0.054, 0.040, 0.018, 0.005), { pos: [0, 0.038, 0.126] }),
      transformMesh(bevelBoxMesh(0.026, 0.008, 0.022, 0.002), { pos: [0.006, 0.038, 0.128] })
    ]);
    return [
      { mesh: bakeMeshCavityAO(shadeGolferForm(lkMergeRaw([chinoPelvis, pleatsAndLoops]), -0.15, 0.06, 0.04, 0.08), 0.24), materialIndex: 4 },
      { mesh: bakeMeshCavityAO(beltStrap, 0.24), materialIndex: 5 },
      { mesh: bakeMeshCavityAO(brassBuckle, 0.20), materialIndex: 6 }
    ];
  });

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
  const slots = cachedSlots("links:bleacher-v2", () => {
    const out: MultiMatSlot[] = [];
    out.push({
      mesh: transformMesh(latticeTrussMesh({ span: [6.4, 0.62, 3.6], bays: 4, chordRadius: 0.045, braceRadius: 0.026 }), {
        pos: [0, 0.32, -0.35]
      }),
      materialIndex: 0
    });
    for (const px of [-2.95, 0, 2.95]) {
      out.push({
        mesh: transformMesh(latticeTrussMesh({ span: [0.28, 2.85, 0.28], bays: 4, chordRadius: 0.032, braceRadius: 0.018 }), {
          pos: [px, 1.48, -2.05]
        }),
        materialIndex: 0
      });
    }
    for (let tier = 0; tier < 3; tier += 1) {
      const ty = 0.62 + tier * 0.42;
      const tz = 0.96 - tier * 0.96;
      out.push({ mesh: transformMesh(bevelBoxMesh(6.1, 0.14, 0.88, 0.025), { pos: [0, ty, tz] }), materialIndex: 1 });
      out.push({ mesh: transformMesh(bevelBoxMesh(6.1, 0.24, 0.08, 0.018), { pos: [0, ty + 0.22, tz - 0.38] }), materialIndex: 1 });
    }
    out.push({
      mesh: tubeSweepMesh([[-3.05, 0.55, 1.52, 0.024], [-3.05, 1.08, 1.52, 0.024], [3.05, 1.08, 1.52, 0.024], [3.05, 0.55, 1.52, 0.024]], 8),
      materialIndex: 2
    });
    const awningSections: V3[][] = [
      [[-3.25, 2.92, -2.25], [3.25, 2.92, -2.25], [3.25, 2.98, -2.25], [-3.25, 2.98, -2.25]],
      [[-3.25, 3.12, -0.55], [3.25, 3.12, -0.55], [3.25, 3.18, -0.55], [-3.25, 3.18, -0.55]],
      [[-3.25, 2.84, 1.25], [3.25, 2.84, 1.25], [3.25, 2.9, 1.25], [-3.25, 2.9, 1.25]]
    ];
    out.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(awningSections, true, true), 1, 0.44), materialIndex: 3 });
    out.push({ mesh: transformMesh(bevelBoxMesh(6.52, 0.18, 0.06, 0.015), { pos: [0, 2.77, 1.25] }), materialIndex: 4 });
    return out;
  });

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
      rotation: [0, yaw, 0],
      castShadow: false
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

  const slots = cachedSlots("links:clubhouse-v2", () => {
    const out: MultiMatSlot[] = [];
    // Ashlar stone foundation plinth + porch steps + veranda deck
    out.push({ mesh: transformMesh(bevelBoxMesh(11.4, 0.72, 8.3, 0.05), { pos: [0, 0.34, 0] }), materialIndex: 0 });
    out.push({ mesh: transformMesh(bevelBoxMesh(11.4, 0.28, 2.7, 0.04), { pos: [0, 0.44, 4.95] }), materialIndex: 6 });
    out.push({ mesh: transformMesh(bevelBoxMesh(4.6, 0.22, 0.96, 0.03), { pos: [0, 0.16, 6.72] }), materialIndex: 0 });

    // Main Tudor plaster volume + half-timber dark oak studs & horizontal stringcourses
    out.push({ mesh: transformMesh(bevelBoxMesh(10.2, 3.15, 7.2, 0.05), { pos: [0, 1.9, 0] }), materialIndex: 1 });
    for (const bx of [-4.95, -2.15, 0, 2.15, 4.95]) {
      out.push({ mesh: transformMesh(bevelBoxMesh(0.18, 3.16, 7.28, 0.015), { pos: [bx, 1.9, 0] }), materialIndex: 2 });
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(10.3, 0.16, 7.28, 0.015), { pos: [0, 2.15, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(10.32, 0.2, 7.34, 0.02), { pos: [0, 3.38, 0] }), materialIndex: 4 });

    // Steep pitched slate gable roof + ridge beam + finials + 2 gabled roof dormers + veranda roof
    out.push({ mesh: transformMesh(gablePrismMesh(11.2, 7.8, 1.85, 0.35), { pos: [0, 3.44, 0] }), materialIndex: 3 });
    out.push({ mesh: transformMesh(bevelBoxMesh(11.9, 0.16, 0.22, 0.03), { pos: [0, 5.31, 0] }), materialIndex: 2 });
    for (const fx of [-5.85, 5.85] as const) {
      out.push({
        mesh: transformMesh(latheMesh([[0, 0], [0.09, 0], [0.05, 0.22], [0.08, 0.3], [0, 0.42]], 10), { pos: [fx, 5.38, 0] }),
        materialIndex: 5
      });
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(11.6, 0.22, 2.95, 0.03), { pos: [0, 3.12, 4.95], rot: [0.1, 0, 0] }), materialIndex: 3 });
    for (const dx of [-3.1, 3.1] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(1.75, 1.05, 1.65, 0.03), { pos: [dx, 4.05, 2.15] }), materialIndex: 1 });
      out.push({
        mesh: transformMesh(extrudePolygonMesh([[-0.98, 0], [0.98, 0], [0, 0.72]], 1.95, 0.025, true), { pos: [dx, 4.56, 2.15] }),
        materialIndex: 3
      });
      out.push({ mesh: transformMesh(bevelBoxMesh(1.32, 0.78, 0.1, 0.015), { pos: [dx, 4.04, 2.98] }), materialIndex: 4 });
    }

    // Mullioned front bay windows, oak entrance door, signboard & turned veranda columns
    for (const wx of [-3.35, 3.35] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(2.28, 1.82, 0.56, 0.03), { pos: [wx, 1.82, 3.82] }), materialIndex: 4 });
      for (const mx of [-0.45, 0.45]) {
        out.push({ mesh: transformMesh(bevelBoxMesh(0.08, 1.56, 0.62, 0.01), { pos: [wx + mx, 1.82, 3.84] }), materialIndex: 2 });
      }
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(1.62, 2.32, 0.16, 0.02), { pos: [0, 1.52, 3.64] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(5.1, 0.84, 0.14, 0.02), { pos: [0, 2.8, 3.72] }), materialIndex: 2 });
    for (const lx of [-5.4, -1.85, 1.85, 5.4]) {
      out.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.46, 0.38, 0.025), { pos: [lx, 0.78, 6.08] }), materialIndex: 0 });
      out.push({
        mesh: transformMesh(latheMesh([[0, 0], [0.13, 0], [0.115, 2.05], [0.14, 2.12], [0, 2.12]], 14), { pos: [lx, 1.0, 6.08] }),
        materialIndex: 4
      });
    }

    // Tall corbelled stone chimney stack + twin terracotta chimney pots
    out.push({ mesh: transformMesh(bevelBoxMesh(1.05, 2.85, 1.05, 0.04), { pos: [-3.65, 4.55, -1.35] }), materialIndex: 0 });
    out.push({ mesh: transformMesh(bevelBoxMesh(1.24, 0.22, 1.24, 0.03), { pos: [-3.65, 5.95, -1.35] }), materialIndex: 0 });
    for (const pz of [-1.55, -1.15]) {
      out.push({
        mesh: transformMesh(latheMesh([[0.09, 0], [0.13, 0.05], [0.11, 0.48], [0.14, 0.54], [0.08, 0.56]], 12), { pos: [-3.65, 6.05, pz] }),
        materialIndex: 5
      });
    }

    // Flanking dry-stone garden walls + radial voussoir lychgate archway at walk entrance
    for (const side of [-1, 1] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(2.9, 0.92, 0.46, 0.04), { pos: [side * 3.25, 0.46, 7.65] }), materialIndex: 0 });
      out.push({ mesh: transformMesh(bevelBoxMesh(0.56, 1.95, 0.56, 0.035), { pos: [side * 1.55, 0.97, 7.65] }), materialIndex: 0 });
    }
    for (const vs of archwayVoussoirSlots({ radius: 1.28, thickness: 0.36, depth: 0.52, voussoirs: 9, stoneMatA: 0, stoneMatB: 4, keystoneMat: 5 })) {
      out.push({ mesh: transformMesh(vs.mesh, { pos: [0, 1.85, 7.65] }), materialIndex: vs.materialIndex });
    }
    return out;
  });

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
    assembleMultiMaterialNode("clubhouse-lodge", slots, mats, {
      position: [x, y, z],
      rotation: [0, yaw, 0],
      castShadow: false
    }),
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
  const shrubSpec = cachedSpec("links:clubhouse-shrub-v2", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        subdivideSmoothMesh(layeredCanopyMesh({ radius: 0.78, height: 0.92, puffs: 8, seed: 31 }), 1, 0.45),
        0.34
      )
    ])
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
      castShadow: false,
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
      castShadow: false,
      material: material.pbr({ color: "#b4a179", roughness: 0.96 })
    }),
    geometry.custom(ribbonAlongPath(terrain, [walkStart, walkEnd], 1.18, 0.04), {
      name: "clubhouse-walk",
      castShadow: false,
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
  const slots = cachedSlots("links:lighthouse-v2", () => {
    const out: MultiMatSlot[] = [];
    out.push({
      mesh: stratifiedCliffMesh({ radiusX: 5.8, radiusZ: 5.4, height: 2.35, terraces: 4, seed: 41 }),
      materialIndex: 0
    });
    out.push({
      mesh: latheMesh([[0, 2.0], [2.45, 2.0], [2.15, 6.2], [1.92, 6.2]], 24),
      materialIndex: 1
    });
    out.push({
      mesh: latheMesh([[2.14, 6.18], [1.88, 10.2], [1.86, 10.2]], 24),
      materialIndex: 2
    });
    out.push({
      mesh: latheMesh([[1.88, 10.18], [1.68, 12.65], [2.25, 13.05], [2.28, 13.32], [1.55, 13.35]], 24),
      materialIndex: 1
    });
    const railPts: V4[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      railPts.push([Math.cos(a) * 2.18, 14.12, Math.sin(a) * 2.18, 0.045]);
      if (i < 20 && i % 2 === 0) {
        out.push({
          mesh: tubeSweepMesh([[Math.cos(a) * 2.18, 13.3, Math.sin(a) * 2.18, 0.035], [Math.cos(a) * 2.18, 14.12, Math.sin(a) * 2.18, 0.035]], 6),
          materialIndex: 3
        });
      }
    }
    out.push({ mesh: tubeSweepMesh(railPts, 7), materialIndex: 3 });
    out.push({
      mesh: latheMesh([[0, 13.55], [0.82, 13.6], [0.88, 14.25], [0.76, 14.7], [0, 14.75]], 18),
      materialIndex: 5
    });
    const domeCurve = bezierCurve2([1.52, 14.85], [1.48, 15.45], [0.68, 15.82], [0.06, 15.92], 10);
    out.push({
      mesh: latheMesh([[0, 14.82], ...domeCurve, [0.04, 16.15], [0, 16.18]], 22),
      materialIndex: 4
    });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.95, 1.85, 0.35, 0.04), { pos: [0, 3.05, 2.28] }), materialIndex: 2 });
    return out;
  });

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
    assembleMultiMaterialNode("landmark-lighthouse-body", slots, mats, { castShadow: false }),
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
  const slots = cachedSlots("links:footbridge-v2", () => {
    const out: MultiMatSlot[] = [];
    for (const vs of archwayVoussoirSlots({ radius: 1.75, thickness: 0.42, depth: 2.15, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 2 })) {
      out.push({ mesh: transformMesh(vs.mesh, { pos: [0, 0.12, 0] }), materialIndex: vs.materialIndex });
    }
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
          out.push({
            mesh: transformMesh(bevelBoxMesh(0.86, 0.64, 0.24, 0.03), {
              pos: [xm, ym + 0.46, side * 0.98],
              rot: [0, 0, Math.cos(((c + 0.5) / cols) * Math.PI) * 0.36]
            }),
            materialIndex: c % 2 === 0 ? 0 : 1
          });
        }
      }
    }
    out.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(deckSections, true, true), 1, 0.42), materialIndex: 1 });
    for (const sx of [-3.35, 3.35] as const) {
      for (const sz of [-1.06, 1.06] as const) {
        out.push({ mesh: transformMesh(bevelBoxMesh(0.62, 1.38, 0.48, 0.035), { pos: [sx, 0.69, sz] }), materialIndex: 2 });
      }
      out.push({ mesh: transformMesh(bevelBoxMesh(1.9, 0.78, 0.38, 0.035), { pos: [sx * 1.32, 0.39, 1.06] }), materialIndex: 0 });
    }
    return out;
  });

  return assembleMultiMaterialNode(
    "landmark-bridge",
    slots,
    [
      material.ceramic({ color: "#7f7a70", roughness: 0.88 }),
      material.physical({ color: "#a89c86", roughness: 0.82 }),
      material.ceramic({ color: "#63605a", roughness: 0.84 })
    ],
    { position: pos, rotation: [0, yaw, 0], castShadow: false }
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

  const basaltSlots = cachedSlots("links:basalt-v2", () => {
    const out: MultiMatSlot[] = [];
    const hexPoly = regularPolygon2D(6, 1.08, Math.PI / 6);
    for (let i = 0; i < 18; i += 1) {
      const ring = i < 6 ? 1.85 : i < 13 ? 3.55 : 5.1;
      const ang = (i * 2.39996) + 0.3;
      const h = 9.8 - (ring / 5.5) * 5.6 + hash01(i * 43 + 9) * 1.8;
      const sc = 0.78 + hash01(i * 29 + 3) * 0.38;
      out.push({
        mesh: transformMesh(extrudePolygonMesh(hexPoly, h, 0.08, true), {
          pos: [Math.cos(ang) * ring, h * 0.5, Math.sin(ang) * ring],
          rot: [Math.PI * 0.5, ang * 0.25, 0],
          scale: [sc, 1, sc]
        }),
        materialIndex: i % 3 === 0 ? 1 : 0
      });
    }
    out.push({
      mesh: stratifiedCliffMesh({ radiusX: 6.4, radiusZ: 5.8, height: 1.8, terraces: 3, seed: 73 }),
      materialIndex: 0
    });
    return out;
  });

  const shX = terrain.bounds.maxX - 18;
  const shZ = midT[1];
  const shY = terrain.height(shX, shZ);
  const shardSlots = cachedSlots("links:shard-v2", () => [
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
  ]);

  const volcanicMats: AuraMaterialSpec[] = [
    material.ceramic({ color: "#2b2a2d", roughness: 0.88 }),
    material.physical({ color: "#1d1e24", roughness: 0.32, clearcoat: 0.65, clearcoatRoughness: 0.18 }),
    material.emissive({ color: "#ff7426", emissive: "#ff5a14", emissiveIntensity: 0.95, roughness: 0.4 })
  ];
  return [
    assembleMultiMaterialNode("landmark-basalt-columns", basaltSlots, volcanicMats.slice(0, 2), {
      position: [bcX, bcY, bcZ],
      rotation: [0, 0.9, 0],
      castShadow: false
    }),
    assembleMultiMaterialNode("landmark-shard", shardSlots, volcanicMats, {
      position: [shX, shY, shZ],
      rotation: [0, 0.4, 0],
      castShadow: false
    })
  ];
}

/**
 * Cloud Terrace alpine cable-car station (`landmark-cable-car-station`, `11 m` tall):
 * stone-and-larch chalet terminal, cantilevered `latticeTrussMesh` haul-rope gantry,
 * grooved `latheMesh` bullwheel sheaves, panoramic glass bay, and suspended red gondola cabin.
 */
export function buildAlpineCableCarStationNode(pos: Vec3, yaw = -1.95): any {
  const slots = cachedSlots("links:cable-car-v2", () => {
    const out: MultiMatSlot[] = [];
    out.push({ mesh: transformMesh(bevelBoxMesh(9.6, 2.6, 8.2, 0.06), { pos: [0, 1.3, 0] }), materialIndex: 0 });
    out.push({ mesh: transformMesh(bevelBoxMesh(9.0, 4.2, 7.6, 0.05), { pos: [0, 4.65, -0.2] }), materialIndex: 1 });
    out.push({ mesh: transformMesh(gablePrismMesh(9.8, 8.4, 2.35, 0.4), { pos: [0, 6.75, -0.2] }), materialIndex: 2 });
    out.push({
      mesh: transformMesh(subdivideSmoothMesh(gablePrismMesh(9.6, 8.2, 2.15, 0.35), 1, 0.42), { pos: [0, 7.02, -0.2] }),
      materialIndex: 4
    });

    // Cantilevered steel haul-rope gantry + twin grooved bullwheels + haul cables
    out.push({
      mesh: transformMesh(latticeTrussMesh({ span: [3.2, 1.35, 11.4], bays: 6, chordRadius: 0.08, braceRadius: 0.048 }), {
        pos: [0, 9.65, 2.8]
      }),
      materialIndex: 2
    });
    for (const bz of [-1.4, 7.2]) {
      out.push({
        mesh: transformMesh(latheMesh([[0.25, -0.1], [1.38, -0.1], [1.45, -0.04], [1.32, 0], [1.45, 0.04], [1.38, 0.1], [0.25, 0.1]], 20), {
          pos: [0, 8.85, bz]
        }),
        materialIndex: 2
      });
    }
    // Suspended red gondola hanger arm + smooth rounded cabin
    out.push({
      mesh: tubeSweepMesh([[1.35, 8.85, 6.2, 0.055], [1.35, 7.35, 6.2, 0.055], [0.95, 6.55, 6.2, 0.055]], 8),
      materialIndex: 2
    });
    out.push({
      mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(1.85, 2.05, 2.35, 0.22), 1, 0.46), { pos: [0.95, 5.45, 6.2] }),
      materialIndex: 3
    });
    return out;
  });

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
    assembleMultiMaterialNode("landmark-cable-car-body", slots, mats, { castShadow: false }),
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
    const tSlots = cachedSlots(`links:harbour-tower-v2:${i}`, () => {
      const out: MultiMatSlot[] = [
        { mesh: transformMesh(bevelBoxMesh(w, h * 0.62, w * 0.82, 0.18), { pos: [0, h * 0.31, 0] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(w * 0.82, h * 0.3, w * 0.68, 0.15), { pos: [0, h * 0.75, 0] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(w * 0.56, h * 0.1, w * 0.52, 0.1), { pos: [0, h * 0.94, 0] }), materialIndex: 1 },
        { mesh: tubeSweepMesh([[0, h * 0.99, 0, 0.18], [0, h + 4.2, 0, 0.05]], 8), materialIndex: 1 }
      ];
      for (let f = 1; f <= 7; f += 1) {
        const fy = (f / 8) * h * 0.86;
        const fw = (f <= 5 ? w : w * 0.82) + 0.16;
        const fd = (f <= 5 ? w * 0.82 : w * 0.68) + 0.16;
        out.push({ mesh: transformMesh(bevelBoxMesh(fw, 0.38, fd, 0.04), { pos: [0, fy, 0] }), materialIndex: f % 2 === 0 ? 2 : 1 });
      }
      out.push({ mesh: transformMesh(bevelBoxMesh(w * 0.6, 0.85, w * 0.56, 0.08), { pos: [0, h * 0.985, 0] }), materialIndex: 2 });
      return out;
    });
    nodes.push(
      assembleMultiMaterialNode(
        `landmark-tower-${i}`,
        tSlots,
        [
          material.physical({ color: "#0f1c2e", roughness: 0.14, clearcoat: 0.92, clearcoatRoughness: 0.06 }),
          material.brushedMetal({ color: "#8fa2b8", roughness: 0.3 }),
          material.emissive({ color: crownColors[i]!, emissive: crownColors[i]!, emissiveIntensity: 0.85 })
        ],
        { position: [bx, 0, terrain.bounds.maxZ - 6], rotation: [0, Math.PI, 0], castShadow: false }
      )
    );
  }

  // Quayside open-lattice container crane (`landmark-harbour-crane`, `22 m` tall)
  const crX = terrain.bounds.minX + 24;
  const crZ = midT[1];
  const crY = terrain.height(crX, crZ);
  const craneSlots = cachedSlots("links:harbour-crane-v2", () => {
    const out: MultiMatSlot[] = [];
    for (const lz of [-4.2, 4.2] as const) {
      for (const lx of [-2.8, 2.8] as const) {
        out.push({
          mesh: transformMesh(latticeTrussMesh({ span: [0.85, 16.8, 0.85], bays: 7, chordRadius: 0.08, braceRadius: 0.045 }), {
            pos: [lx * 0.82, 8.4, lz],
            rot: [0, 0, -lx * 0.055]
          }),
          materialIndex: 0
        });
      }
    }
    out.push({
      mesh: transformMesh(latticeTrussMesh({ span: [32.0, 1.65, 2.6], bays: 12, chordRadius: 0.09, braceRadius: 0.05 }), {
        pos: [3.5, 17.4, 0]
      }),
      materialIndex: 0
    });
    out.push({
      mesh: transformMesh(latticeTrussMesh({ span: [1.4, 4.6, 2.4], bays: 3, chordRadius: 0.08, braceRadius: 0.045 }), {
        pos: [-1.5, 19.8, 0]
      }),
      materialIndex: 0
    });
    for (const side of [-1, 1] as const) {
      out.push({ mesh: tubeSweepMesh([[-1.5, 22.0, side * 1.0, 0.06], [15.5, 18.1, side * 1.0, 0.05]], 6), materialIndex: 1 });
      out.push({ mesh: tubeSweepMesh([[-1.5, 22.0, side * 1.0, 0.06], [-11.2, 18.1, side * 1.0, 0.05]], 6), materialIndex: 1 });
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(2.6, 1.9, 2.2, 0.08), { pos: [2.2, 15.6, 0] }), materialIndex: 1 });
    out.push({ mesh: transformMesh(bevelBoxMesh(3.4, 0.65, 2.1, 0.06), { pos: [9.5, 11.4, 0] }), materialIndex: 1 });
    out.push({ mesh: tubeSweepMesh([[9.5, 16.6, 0, 0.05], [9.5, 11.7, 0, 0.05]], 6), materialIndex: 1 });
    out.push({ mesh: transformMesh(bevelBoxMesh(0.45, 0.45, 0.45, 0.06), { pos: [19.2, 18.4, 0] }), materialIndex: 2 });
    return out;
  });
  nodes.push(
    assembleMultiMaterialNode(
      "landmark-harbour-crane",
      craneSlots,
      [
        material.carPaint({ color: "#d95b26", roughness: 0.28, clearcoat: 0.72 }),
        material.brushedMetal({ color: "#2d3540", roughness: 0.42 }),
        material.emissive({ color: "#ff4d3d", emissive: "#ff4d3d", emissiveIntensity: 1.1 })
      ],
      { position: [crX, crY, crZ], rotation: [0, Math.PI + 0.3, 0], castShadow: false }
    )
  );

  // 4 stadium floodlight lattice masts around green (`7.5 m` tall)
  const mastSlots = cachedSlots("links:harbour-mast-v2", () => [
    { mesh: transformMesh(bevelBoxMesh(0.95, 0.45, 0.95, 0.04), { pos: [0, 0.22, 0] }), materialIndex: 0 },
    {
      mesh: transformMesh(latticeTrussMesh({ span: [0.46, 6.8, 0.46], bays: 6, chordRadius: 0.035, braceRadius: 0.02 }), {
        pos: [0, 3.6, 0]
      }),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(1.95, 0.78, 0.34, 0.04), { pos: [0, 7.22, 0.12], rot: [0.38, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.76, 0.58, 0.08, 0.02), { pos: [0, 7.18, 0.28], rot: [0.38, 0, 0] }), materialIndex: 1 }
  ]);
  for (const [lx, lz] of [[-18, -8], [18, -8], [-18, 18], [18, 18]] as const) {
    const x = cx + lx;
    const z = cz + lz;
    const y = terrain.height(x, z);
    const aimYaw = Math.atan2(cx - x, cz - z);
    nodes.push(
      assembleMultiMaterialNode(
        `lamp-${lx}-${lz}`,
        mastSlots,
        [
          material.brushedMetal({ color: "#4a5564", roughness: 0.38 }),
          material.emissive({ color: "#dff4ff", emissive: "#bfe8ff", emissiveIntensity: 1.25 })
        ],
        { position: [x, y, z], rotation: [0, aimYaw, 0], castShadow: false }
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
  const landerSlots = cachedSlots("links:lunar-lander-v2", () => {
    const out: MultiMatSlot[] = [
      {
        mesh: transformMesh(extrudePolygonMesh(regularPolygon2D(8, 2.85, Math.PI / 8), 2.7, 0.12, true), {
          pos: [0, 3.35, 0],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 0
      },
      { mesh: latheMesh([[1.15, 0.85], [1.65, 1.95], [0.95, 2.1], [0, 2.1]], 18), materialIndex: 2 },
      {
        mesh: transformMesh(subdivideSmoothMesh(icosphereFacetMesh(2.05, 1, 0.04, 19), 1, 0.48), {
          pos: [0, 6.45, 0],
          scale: [1.05, 0.92, 1.02]
        }),
        materialIndex: 1
      },
      { mesh: tubeSweepMesh([[0, 8.2, 0, 0.08], [0, 9.95, 0, 0.04]], 8), materialIndex: 1 },
      { mesh: transformMesh(latheMesh([[0, 9.1], [0.85, 9.45], [0.92, 9.52], [0.05, 9.16]], 16), { pos: [0.55, 0, 0.35], rot: [0.35, 0, -0.3] }), materialIndex: 0 }
    ];
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      out.push({ mesh: tubeSweepMesh([[ca * 2.4, 3.6, sa * 2.4, 0.09], [ca * 4.35, 0.18, sa * 4.35, 0.075]], 8), materialIndex: 1 });
      out.push({ mesh: tubeSweepMesh([[ca * 2.5, 2.2, sa * 2.5, 0.065], [ca * 4.35, 0.18, sa * 4.35, 0.06]], 7), materialIndex: 1 });
      out.push({
        mesh: transformMesh(latheMesh([[0, 0], [0.68, 0], [0.74, 0.14], [0.52, 0.2], [0, 0.2]], 14), { pos: [ca * 4.35, 0, sa * 4.35] }),
        materialIndex: 0
      });
    }
    return out;
  });

  // 2. 6-wheel lunar rover (`id: "landmark-rover"`, `1.65 m` tall)
  const rx = tx + 12;
  const rz = tz + 8;
  const ry = terrain.height(rx, rz);
  const roverSlots = cachedSlots("links:lunar-rover-v2", () => {
    const out: MultiMatSlot[] = [
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
          out.push({ mesh: transformMesh(ws.mesh, { pos: [side * 0.82, 0.28, wz] }), materialIndex: ws.materialIndex });
        }
      }
    }
    return out;
  });

  // 3. Parabolic comms relay tower (`landmark-relay`, `9 m` tall)
  const kx = terrain.bounds.minX + 16;
  const kz = cz + 30;
  const ky = terrain.height(kx, kz);
  const relaySlots = cachedSlots("links:lunar-relay-v2", () => [
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
  ]);

  const spaceMats: AuraMaterialSpec[] = [
    material.studioMetal({ color: "#d8a63a", roughness: 0.24, metalness: 0.95 }),
    material.studioMetal({ color: "#dce3ec", roughness: 0.2, metalness: 0.92 }),
    material.blackRubber({ color: "#252830", roughness: 0.78 }),
    material.emissive({ color: "#67e8f9", emissive: "#38bdf8", emissiveIntensity: 0.95 })
  ];
  return [
    assembleMultiMaterialNode("landmark-lander", landerSlots, spaceMats, {
      position: [lx, ly, lz],
      rotation: [0, -0.9, 0],
      castShadow: false
    }),
    assembleMultiMaterialNode("landmark-rover", roverSlots, spaceMats, {
      id: "landmark-rover",
      position: [rx, ry, rz],
      rotation: [0, 0.5, 0],
      castShadow: false
    }),
    assembleMultiMaterialNode("landmark-relay", relaySlots, spaceMats, {
      position: [kx, ky, kz],
      castShadow: false
    })
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
  const trunkSpec = cachedSpec("links:tree-trunk-v3", () => {
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
      bakeMeshCavityAO(tubeSweepMesh(mainSpine, 9), 0.34),
      bakeMeshCavityAO(tubeSweepMesh(rootA, 6), 0.34),
      bakeMeshCavityAO(tubeSweepMesh(rootB, 6), 0.34),
      bakeMeshCavityAO(tubeSweepMesh(limbA, 6), 0.3),
      bakeMeshCavityAO(tubeSweepMesh(limbB, 6), 0.3)
    ]);
  });
  const oakCanopySpec = cachedSpec("links:tree-canopy:oak-v3", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        transformMesh(subdivideSmoothMesh(layeredCanopyMesh({ radius: 2.15, height: 3.5, puffs: 11, seed: 23 }), 1, 0.46), {
          pos: [0, 2.22, 0]
        }),
        0.38
      )
    ])
  );
  const pineCanopySpec = cachedSpec("links:tree-canopy:pine-v3", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        transformMesh(coniferBoughTierMesh({ baseRadius: 1.98, height: 4.95, tiers: 5, seed: 37 }), { pos: [0, 1.52, 0] }),
        0.38
      )
    ])
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
      castShadow: false
    })
  ];
  if (oakTransforms.length > 0) {
    batches.push(
      instances.custom(oakCanopySpec, {
        name: "fairway-oak-canopy",
        material: material.pbr({ color: "#ffffff", roughness: 0.84, clearcoat: 0, sheen: 0 } as any),
        transforms: oakTransforms,
        colors: oakColors,
        castShadow: false,
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
        castShadow: false,
        ...windOpt
      })
    );
  }
  return batches;
}

export function buildAlpineHorizonTreelineNode(cx: number, cz: number): any {
  const snowPineSpec = cachedSpec("links:alpine-horizon-pine-v2", () =>
    mergeRawMeshes([bakeMeshCavityAO(coniferBoughTierMesh({ baseRadius: 0.65, height: 2.0, tiers: 4, seed: 53 }), 0.34)])
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
  const rockSpec = cachedSpec("links:outcrop-boulder-v2", () =>
    mergeRawMeshes([bakeMeshCavityAO(stratifiedCliffMesh({ radiusX: 1.05, radiusZ: 0.92, height: 1.35, terraces: 4, seed: 61 }), 0.38)])
  );
  const rockColor = theme === "volcanic" ? "#343136" : theme === "lunar" ? "#6d7078" : "#867f73";
  return instances.custom(rockSpec, {
    name: "rough-rocks",
    material: material.pbr({ color: rockColor, roughness: 0.9, clearcoat: 0, sheen: 0 } as any),
    transforms,
    castShadow: false
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
  const gorseSpec = cachedSpec("links:dune-gorse-v2", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        subdivideSmoothMesh(layeredCanopyMesh({ radius: 0.62, height: 0.95, puffs: 7, seed: 83 }), 1, 0.45),
        0.36
      )
    ])
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
  const stanchionSpec = cachedSpec("links:gallery-stanchion-v2", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        latheMesh([[0, 0], [0.065, 0], [0.055, 0.035], [0.024, 0.045], [0.022, 0.72], [0.036, 0.755], [0, 0.78]], 12),
        0.28
      )
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
      castShadow: false
    }),
    geometry.custom(mergeRawMeshes(ropeMeshes), {
      name: "gallery-ropes",
      material: material.fabric({ color: "#f2eee2", roughness: 0.72, sheen: 0.3, sheenColor: "#ffffff" }),
      castShadow: false
    })
  );

  // Shared 10-material golf apparel palette for the entire batched gallery + grandstand crowd (1 multi-material node!)
  // Suppresses clearcoat & outdoor HDRI tree-branch reflections on all skin & apparel (`clearcoat: 0, envMapIntensity: 0.08..0.10`).
  const crowdMats: AuraMaterialSpec[] = [
    material.fabric({ color: "#235784", roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.3, sheenColor: "#ffffff" } as any), // 0: Navy tour polo
    material.fabric({ color: "#1f5f46", roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.3, sheenColor: "#ffffff" } as any), // 1: Emerald links sweater-vest
    material.fabric({ color: "#b63e36", roughness: 0.62, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.3, sheenColor: "#ffffff" } as any), // 2: Claret championship polo
    material.fabric({ color: "#f3efe4", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.28, sheenColor: "#ffffff" } as any), // 3: Ivory collar / cap / trim
    material.physical({ color: "#d59c72", roughness: 0.56, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 }), // 4: Warm medium skin
    material.physical({ color: "#8d6043", roughness: 0.58, metalness: 0, clearcoat: 0, envMapIntensity: 0.10 }), // 5: Deep bronze skin
    material.fabric({ color: "#d4cbb8", roughness: 0.66, clearcoat: 0, envMapIntensity: 0.08 } as any), // 6: Stone golf chinos
    material.fabric({ color: "#252f3f", roughness: 0.66, clearcoat: 0, envMapIntensity: 0.08 } as any), // 7: Charcoal pleated trousers & caps
    material.physical({ color: "#684226", roughness: 0.48, clearcoat: 0, envMapIntensity: 0.16 }), // 8: Saddle leather shoe trim & belt
    material.lacquer({ color: "#1a4d3a", roughness: 0.32, clearcoat: 0.45, envMapIntensity: 0.28 }) // 9: Marshal "QUIET" paddle
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

  out.push(assembleMultiMaterialNode("gallery-spectators", crowdSlots, crowdMats, { id: "gallery-spectators", castShadow: false }));
  return out;
}
