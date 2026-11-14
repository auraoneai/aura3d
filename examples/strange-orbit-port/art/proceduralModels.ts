/**
 * Craterline GP (`examples/strange-orbit-port`) — 100% Native `@aura3d/engine` 5.5.1
 * Multi-Material Procedural 3D Lunar GP Racing Motorcycles, Tucked Riders, Track & Colony Props (`WP-19`).
 *
 * Authors sleek futuristic Lunar GP racing motorcycles with Cobalt/Crimson/Carbon liveries,
 * exposed gunmetal twin-spar frames & swingarms, telescopic front forks, wide dark racing slicks,
 * compact twin titanium exhaust nozzles, MotoGP-tucked riders with dark gold/iridescent visors,
 * open `latticeTrussMesh` start/finish gantries, geodesic lunar habitat domes, parabolic
 * `latheMesh` deep-space comms dishes, solar-panel arrays, Apollo descent landers, domed
 * observatories, rover service trailers, pressurized cryo-fuel tanks, and stratified regolith boulders.
 * Zero `three` imports.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraTransformSpec
} from "@aura3d/engine";

type GroupBuilder = ReturnType<typeof group>;
type PrimitiveBuilder = ReturnType<typeof geometry.custom>;
import {
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bezierCurve2,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  deformMesh,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
import type { Vehicle } from "../course";
import type { OrbitLook } from "./look";

// ---------------------------------------------------------------------------
// Color & Physical Material Preset Palette (>= 8 distinct `material.*` presets)
// ---------------------------------------------------------------------------

/** Strips preset `.name` where clean per-node material inspection is desired. */
function unnamed(spec: AuraMaterialSpec): AuraMaterialSpec {
  const { name: _name, ...rest } = spec;
  return rest;
}

export function mixColorHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const ch = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) * (1 - k) + ch(b, i) * k).toString(16).padStart(2, "0")
  );
  return `#${out.join("")}`;
}

export function liveryClearcoatMaterial(
  color: string,
  rimColor: string,
  rimIntensity: number
): AuraMaterialSpec {
  return unnamed(
    material.clearcoatPaint({
      color,
      roughness: 0.14,
      metallic: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
      envMapIntensity: 1.05,
      rim: { color: rimColor, power: 3, intensity: rimIntensity }
    })
  );
}

export function accentCarPaintMaterial(color: string): AuraMaterialSpec {
  return unnamed(
    material.carPaint({
      color,
      roughness: 0.22,
      metallic: 0.62,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.02
    })
  );
}

export function anisotropicAlloyMaterial(color = "#9aa5b4", roughness = 0.28): AuraMaterialSpec {
  return unnamed(
    material.brushedMetal({
      color,
      roughness,
      anisotropy: 0.88,
      envMapIntensity: 1.12
    })
  );
}

export function polishedTitaniumMaterial(color = "#dce5ef", roughness = 0.14): AuraMaterialSpec {
  return unnamed(
    material.studioMetal({
      color,
      roughness,
      envMapIntensity: 1.15
    })
  );
}

export function goldFoilMetalMaterial(): AuraMaterialSpec {
  return unnamed(
    material.studioMetal({
      color: "#e6b44a",
      roughness: 0.24,
      envMapIntensity: 1.2
    })
  );
}

export function evaThermalSuitMaterial(color: string, sheenColor = "#f5efe6"): AuraMaterialSpec {
  return unnamed(
    material.fabric({
      color,
      sheenColor,
      roughness: 0.76,
      clearcoat: 0,
      sheen: 0.62,
      sheenRoughness: 0.56,
      envMapIntensity: 0.5
    })
  );
}

/**
 * WebGPU-safe reflective gold-iridium / amber-tinted glazing (`castShadow: false` on node).
 * Uses `material.physical` (`opacity: 0.45`, `clearcoat: 1`, `ior: 1.52`) — never `studioGlass` with `opacity < 1`.
 */
export function goldReflectiveGlassMaterial(color = "#ffd8a8", opacity = 0.45): AuraMaterialSpec {
  return unnamed(
    material.physical({
      color,
      roughness: 0.05,
      metallic: 0.06,
      opacity,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      ior: 1.52,
      envMapIntensity: 1.18
    })
  );
}

export function lunarCeramicMaterial(color = "#f1eee8"): AuraMaterialSpec {
  return unnamed(
    material.ceramic({
      color,
      roughness: 0.24,
      clearcoat: 0.78,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.05
    })
  );
}

export function practicalIonGlowMaterial(color: string, intensity = 2.8): AuraMaterialSpec {
  return unnamed(
    material.emissive({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.16,
      practical: true
    })
  );
}

export function lunarRubberGripMaterial(color = "#151922"): AuraMaterialSpec {
  return unnamed(
    material.blackRubber({
      color,
      roughness: 0.92,
      envMapIntensity: 0.26
    })
  );
}

/** Wide dark rubber MotoGP racing slick compound (`roughness: 0.78`, `#171a20`). */
export function racingSlickTireMaterial(color = "#171a20"): AuraMaterialSpec {
  return unnamed(
    material.blackRubber({
      color,
      roughness: 0.78,
      envMapIntensity: 0.34
    })
  );
}

/** Deep gloss carbon-lacquer lower aero belly pan & mudguard finish (`material.lacquer`). */
export function carbonLacquerMaterial(color = "#151923"): AuraMaterialSpec {
  return unnamed(
    material.lacquer({
      color,
      roughness: 0.18,
      clearcoat: 0.94,
      clearcoatRoughness: 0.045,
      envMapIntensity: 1.04
    })
  );
}

/** Dark-tinted smoked bubble windscreen (`material.physical`, WebGPU-safe `castShadow: false`). */
export function darkSmokeWindscreenMaterial(color = "#101826", opacity = 0.62): AuraMaterialSpec {
  return unnamed(
    material.physical({
      color,
      roughness: 0.05,
      metallic: 0.08,
      opacity,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      ior: 1.52,
      envMapIntensity: 1.12
    })
  );
}

export function regolithBasaltMaterial(color = "#6d5b56", roughness = 0.92): AuraMaterialSpec {
  return unnamed(
    material.matteClay({
      color,
      roughness,
      envMapIntensity: 0.32
    })
  );
}

// ---------------------------------------------------------------------------
// Smooth Cross-Section & Bounds Normalization Helpers
// ---------------------------------------------------------------------------

/** Builds a smooth super-elliptical cross-section ring in XY at station `z` (for `-Z` nose -> `+Z` tail lofts). */
function superEllipseRingZ(
  rx: number,
  ryTop: number,
  ryBot: number,
  cy: number,
  z: number,
  ringSegs = 16,
  pinch = 1
): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < ringSegs; i += 1) {
    const a = (i / ringSegs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), pinch) * rx;
    const sy = sa >= 0
      ? Math.pow(sa, pinch) * ryTop
      : -Math.pow(-sa, pinch) * ryBot;
    ring.push([sx, cy + sy, z]);
  }
  return ring;
}

/** Grounds a `RawMesh` at `minY = 0`, centered in `X/Z`, and scales its height to `1` (`maxX/maxZ` normalized to `<= 1`). */
function normalizeMeshGroundedUnit(mesh: RawMesh): RawMesh {
  const bounds = computePositionsBounds(Float32Array.from(mesh.positions));
  if (!bounds) return mesh;
  const sx = Math.max(1e-4, bounds.max[0] - bounds.min[0]);
  const sy = Math.max(1e-4, bounds.max[1] - bounds.min[1]);
  const sz = Math.max(1e-4, bounds.max[2] - bounds.min[2]);
  const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
  const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
  const centered = transformMesh(mesh, { pos: [-cx, -bounds.min[1], -cz] });
  return transformMesh(centered, { scale: [1 / sx, 1 / sy, 1 / sz] });
}

// ---------------------------------------------------------------------------
// 1. Lunar GP Racing Motorcycle + Gravity-Skate + Tucked Rider Lower Body (`rider-i-model`)
// ---------------------------------------------------------------------------
// Mesh axes for `bike`: `-Z` = nose (+X rig forward), `+Z` = tail (-X rig aft), `+Y` = up, `+X` = right (+Z rig side).
// Front wheel hub sits at `[0, 0.315, -0.64]` (R = 0.315 -> z in [-0.955, -0.325], y <= 0.63, |x| <= 0.112).
// Rear wheel hub sits at `[0, 0.315, +0.60]` (R = 0.315 -> z in [+0.285, +0.915], y <= 0.63, |x| <= 0.112).

interface BikeRawCache {
  readonly liveryMesh: RawMesh;
  readonly carbonTrimMesh: RawMesh;
  readonly saddleMesh: RawMesh;
  readonly saddleAccentMesh: RawMesh;
  readonly suitLegsMesh: RawMesh;
  readonly bootPadsMesh: RawMesh;
  readonly gunmetalFrameMesh: RawMesh;
  readonly goldForkMesh: RawMesh;
  readonly accentStripeMesh: RawMesh;
  readonly glowMesh: RawMesh;
}

/** Smooth studio-sculpted SDF Cosmic Racing Boot (`[24, 22, 26]`, exact `analyticNormals: true` preserved). */
const getCosmicRacingBootSdfMesh = (() => {
  let cached: RawMesh | null = null;
  return (): RawMesh => {
    if (cached) return cached;
    cached = sculptOrganicSdfMesh({
      boundsMin: [-0.07, -0.06, -0.14],
      boundsMax: [0.07, 0.09, 0.12],
      resolution: [24, 22, 26],
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const heel = sdfEllipsoid(p, [0, 0, 0.048], [0.042, 0.036, 0.052]);
        const arch = sdfTaperedCapsule(p, [0, -0.004, 0.042], [0, -0.008, -0.068], 0.038, 0.032);
        const toe = sdfEllipsoid(p, [0, -0.006, -0.072], [0.036, 0.028, 0.042]);
        const cuff = sdfTaperedCapsule(p, [0, 0.008, 0.046], [0, 0.042, 0.058], 0.038, 0.034);
        return sminPoly(sminPoly(sminPoly(heel, arch, 0.022), toe, 0.024), cuff, 0.02);
      }
    });
    return cached;
  };
})();

const cachedBikeRawParts = (() => {
  let cache: BikeRawCache | null = null;
  return (): BikeRawCache => {
    if (cache) return cache;

    // 1A. Unified sleek, compact, rounded Lunar MotoGP hover-superbike monocoque fairing (`subdivideSmoothMesh`)
    // Encloses cockpit/clip-ons cleanly (`rx = 0.235` at cockpit) -> sculpted tank -> upswept rounded rear wheel hugger!
    const monocoqueSections: V3[][] = [
      superEllipseRingZ(0.042, 0.032, 0.026, 0.635, -0.94, 28, 0.92),
      superEllipseRingZ(0.105, 0.058, 0.044, 0.652, -0.87, 28, 0.90),
      superEllipseRingZ(0.145, 0.078, 0.058, 0.665, -0.80, 28, 0.88),
      superEllipseRingZ(0.218, 0.115, 0.135, 0.675, -0.60, 28, 0.86),
      superEllipseRingZ(0.236, 0.125, 0.215, 0.665, -0.40, 28, 0.86),
      superEllipseRingZ(0.198, 0.132, 0.205, 0.670, -0.20, 28, 0.88),
      superEllipseRingZ(0.148, 0.092, 0.165, 0.650, 0.02, 28, 0.90),
      superEllipseRingZ(0.156, 0.072, 0.115, 0.655, 0.22, 28, 0.90),
      superEllipseRingZ(0.195, 0.095, 0.068, 0.715, 0.44, 28, 0.88),
      superEllipseRingZ(0.182, 0.088, 0.058, 0.725, 0.64, 28, 0.88),
      superEllipseRingZ(0.154, 0.076, 0.052, 0.712, 0.73, 28, 0.89),
      superEllipseRingZ(0.125, 0.062, 0.046, 0.695, 0.80, 28, 0.90),
      superEllipseRingZ(0.052, 0.032, 0.026, 0.665, 0.88, 28, 0.94)
    ];
    const mainCowl = subdivideSmoothMesh(loftSectionsMesh(monocoqueSections, true, false), 1, 0.48);

    // Sculpted close-fitting front aero mudguard hugging front slick crown
    const frontFenderSections: V3[][] = [
      superEllipseRingZ(0.085, 0.022, 0.018, 0.585, -0.84, 26, 0.88),
      superEllipseRingZ(0.112, 0.028, 0.023, 0.625, -0.75, 26, 0.87),
      superEllipseRingZ(0.126, 0.032, 0.026, 0.648, -0.66, 26, 0.86),
      superEllipseRingZ(0.124, 0.030, 0.025, 0.630, -0.57, 26, 0.87),
      superEllipseRingZ(0.118, 0.028, 0.024, 0.605, -0.48, 26, 0.88)
    ];
    const frontFender = subdivideSmoothMesh(loftSectionsMesh(frontFenderSections, true, false), 1, 0.44);

    // Integrated twin rear thruster fairing nacelles flanking the rear tail hugger (`x = +-0.195, y = 0.57, z = +0.30..+0.63`)
    const nacelleMeshes: RawMesh[] = [];
    const accentStripeMeshes: RawMesh[] = [];
    const carbonMeshes: RawMesh[] = [];
    const gunmetalMeshes: RawMesh[] = [];
    const goldForkMeshes: RawMesh[] = [];
    const suitLegMeshes: RawMesh[] = [];
    const bootPadMeshes: RawMesh[] = [];
    const glowMeshes: RawMesh[] = [];
    const bootSdf = getCosmicRacingBootSdfMesh();

    for (const side of [-1, 1] as const) {
      const podHull = transformMesh(
        subdivideSmoothMesh(
          sculptStreamlinedHullMesh(0.36, 0.135, 0.135, {
            noseSharpness: 0.62,
            tailTaper: 0.34,
            canopyBulge: 0.16,
            undersideFlat: 0.18,
            stations: 18,
            ringPoints: 28
          }),
          1,
          0.42
        ),
        { pos: [side * 0.195, 0.57, 0.46], rot: [0, Math.PI, 0] }
      );
      nacelleMeshes.push(podHull);

      // Sculpted lower side aero skirt / chin spoiler sweeping smoothly into belly pan
      const sideSkirt = transformMesh(
        subdivideSmoothMesh(
          sculptStreamlinedHullMesh(0.66, 0.085, 0.18, {
            noseSharpness: 0.58,
            tailTaper: 0.42,
            canopyBulge: 0.12,
            undersideFlat: 0.28,
            stations: 18,
            ringPoints: 28
          }),
          1,
          0.4
        ),
        { pos: [side * 0.165, 0.44, -0.16], rot: [0.08, side * 0.05, -side * 0.18] }
      );
      nacelleMeshes.push(sideSkirt);

      // Sleek warm-terracotta/accent racing chevron along upper fairing shoulder & rear hugger
      accentStripeMeshes.push(
        transformMesh(
          tubeSweepMesh(
            [
              [side * 0.165, 0.675, -0.74, 0.016],
              [side * 0.232, 0.695, -0.44, 0.021],
              [side * 0.195, 0.715, -0.18, 0.018],
              [side * 0.182, 0.728, 0.44, 0.017],
              [side * 0.132, 0.708, 0.74, 0.013]
            ],
            16,
            false
          ),
          { scale: [0.65, 1, 1] }
        )
      );

      // Recessed clip-on handlebar & grip INSIDE the upper fairing cowling (`|x| <= 0.195`, zero protruding sticks!)
      gunmetalMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.095, 0.705, -0.44, 0.015],
            [side * 0.188, 0.690, -0.38, 0.015]
          ],
          16,
          false
        )
      );
      bootPadMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.135, 0.698, -0.41, 0.021],
            [side * 0.195, 0.688, -0.375, 0.021]
          ],
          16,
          false
        )
      );

      // Beefy MotoGP twin-spar lower frame & banana swingarm (`|x| = 0.145 > 0.112` rear slick half-width)
      gunmetalMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.105, 0.66, -0.46, 0.028],
            [side * 0.145, 0.48, -0.18, 0.034],
            [side * 0.142, 0.37, 0.16, 0.034]
          ],
          20,
          false
        ),
        tubeSweepMesh(
          [
            [side * 0.142, 0.37, 0.16, 0.038],
            [side * 0.150, 0.365, 0.38, 0.036],
            [side * 0.138, 0.315, 0.60, 0.028]
          ],
          20,
          false
        ),
        transformMesh(bevelBoxMesh(0.032, 0.062, 0.088, 0.01), {
          pos: [side * 0.138, 0.315, 0.60]
        }),
        transformMesh(bevelBoxMesh(0.048, 0.018, 0.028, 0.005), {
          pos: [side * 0.168, 0.355, 0.18]
        })
      );

      // Inverted telescopic front fork sliders reaching cleanly to `[+-0.128, 0.315, -0.64]`
      goldForkMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.118, 0.68, -0.46, 0.025],
            [side * 0.124, 0.50, -0.55, 0.024]
          ],
          20,
          false
        ),
        transformMesh(bevelBoxMesh(0.03, 0.068, 0.064, 0.008), {
          pos: [side * 0.124, 0.345, -0.60],
          rot: [0.44, 0, 0]
        })
      );
      gunmetalMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.124, 0.505, -0.548, 0.019],
            [side * 0.128, 0.315, -0.64, 0.019]
          ],
          20,
          false
        )
      );

      // Sculpted organic tucked Cosmic Moto-Racer leg (`sculptHumanoidLimbMesh`) hugging tank recess cleanly
      suitLegMeshes.push(
        sculptHumanoidLimbMesh(
          [
            [side * 0.088, 0.708, 0.15, 0.078],
            [side * 0.134, 0.608, -0.02, 0.070],
            [side * 0.146, 0.532, -0.145, 0.060],
            [side * 0.152, 0.448, 0.03, 0.054],
            [side * 0.155, 0.388, 0.175, 0.045]
          ],
          28,
          0.14
        )
      );

      // Compound-curve outer thigh armor shell (`liveryMesh`) + outward-canted MotoGP knee-slider puck + glowing Tron slider pip
      nacelleMeshes.push(
        transformMesh(
          subdivideSmoothMesh(bevelBoxMesh(0.034, 0.078, 0.20, 0.015), 1, 0.48),
          { pos: [side * 0.155, 0.618, 0.01], rot: [-0.52, side * 0.14, -side * 0.18] }
        )
      );
      accentStripeMeshes.push(
        transformMesh(
          subdivideSmoothMesh(bevelBoxMesh(0.036, 0.068, 0.095, 0.018), 1, 0.5),
          { pos: [side * 0.172, 0.528, -0.145], rot: [0.22, side * 0.16, -side * 0.24] }
        )
      );
      glowMeshes.push(
        transformMesh(bevelBoxMesh(0.012, 0.022, 0.062, 0.004), {
          pos: [side * 0.186, 0.528, -0.145],
          rot: [0.22, side * 0.16, -side * 0.24]
        })
      );

      // Articulated multi-piece Cosmic Racing Boot planted squarely on knurled rearset footpeg + heel-guard plate
      // 1) Knurled titanium rearset footpeg & triangular heel-guard bracket
      gunmetalMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.138, 0.352, 0.185, 0.014],
            [side * 0.195, 0.352, 0.185, 0.012]
          ],
          16,
          true
        ),
        transformMesh(bevelBoxMesh(0.012, 0.075, 0.082, 0.004), {
          pos: [side * 0.142, 0.395, 0.235],
          rot: [0.28, 0, 0]
        })
      );
      // 2) Contoured armored shin-plate + ankle hinge cuff + SDF studio-sculpted boot shell + titanium heel/toe sliders
      accentStripeMeshes.push(
        transformMesh(
          subdivideSmoothMesh(bevelBoxMesh(0.056, 0.105, 0.068, 0.02), 1, 0.48),
          { pos: [side * 0.162, 0.442, 0.085], rot: [0.68, 0, -side * 0.06] }
        )
      );
      bootPadMeshes.push(
        transformMesh(bootSdf, { pos: [side * 0.158, 0.372, 0.195], rot: [0.34, 0, 0] }),
        transformMesh(
          latheMesh([[0.042, -0.024], [0.052, 0], [0.044, 0.028]], 28, false),
          { pos: [side * 0.156, 0.402, 0.155], rot: [0.55, 0, 0] }
        )
      );
      gunmetalMeshes.push(
        transformMesh(
          subdivideSmoothMesh(bevelBoxMesh(0.074, 0.048, 0.058, 0.016), 1, 0.45),
          { pos: [side * 0.158, 0.398, 0.268], rot: [0.34, 0, 0] }
        ),
        transformMesh(bevelBoxMesh(0.032, 0.024, 0.054, 0.008), {
          pos: [side * 0.188, 0.346, 0.125],
          rot: [0.34, side * 0.14, 0]
        })
      );
      glowMeshes.push(
        transformMesh(bevelBoxMesh(0.042, 0.014, 0.016, 0.004), {
          pos: [side * 0.158, 0.404, 0.295],
          rot: [0.34, 0, 0]
        })
      );

      // Recessed twin angled LED endurance headlamps + Tron/Wipeout fairing chine & rear-hugger energy light-ribbons
      glowMeshes.push(
        transformMesh(bevelBoxMesh(0.062, 0.022, 0.046, 0.006), {
          pos: [side * 0.072, 0.638, -0.89],
          rot: [0.18, side * 0.24, -side * 0.16]
        }),
        transformMesh(bevelBoxMesh(0.018, 0.014, 0.38, 0.004), {
          pos: [side * 0.138, 0.255, -0.04]
        }),
        tubeSweepMesh(
          [
            [side * 0.172, 0.665, -0.76, 0.008],
            [side * 0.238, 0.682, -0.44, 0.009],
            [side * 0.198, 0.698, -0.18, 0.008],
            [side * 0.186, 0.718, 0.46, 0.008],
            [side * 0.128, 0.695, 0.78, 0.007]
          ],
          12,
          false
        )
      );
    }

    // Dark sculpted carbon-weave lower belly pan & cockpit dash shroud + glowing angled holographic HUD dash
    const bellyPanSections: V3[][] = [
      superEllipseRingZ(0.085, 0.055, 0.042, 0.295, -0.31, 26, 0.86),
      superEllipseRingZ(0.152, 0.105, 0.068, 0.315, -0.16, 26, 0.82),
      superEllipseRingZ(0.154, 0.102, 0.068, 0.310, 0.06, 26, 0.82),
      superEllipseRingZ(0.118, 0.075, 0.048, 0.320, 0.22, 26, 0.86),
      superEllipseRingZ(0.068, 0.045, 0.032, 0.340, 0.27, 26, 0.90)
    ];
    carbonMeshes.push(
      subdivideSmoothMesh(loftSectionsMesh(bellyPanSections, true, false), 1, 0.44),
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.24, 0.045, 0.18, 0.015), {
          pos: [0, 0.70, -0.43],
          rot: [0.34, 0, 0]
        }),
        1,
        0.42
      )
    );
    glowMeshes.push(
      transformMesh(bevelBoxMesh(0.145, 0.038, 0.016, 0.005), {
        pos: [0, 0.732, -0.415],
        rot: [-0.52, 0, 0]
      })
    );

    // Contoured race saddle + warm accent rear bolster + seamless dark carbon-kevlar rider pelvis bridge into `torso`
    const saddleMesh = subdivideSmoothMesh(
      transformMesh(bevelBoxMesh(0.215, 0.055, 0.29, 0.022), {
        pos: [0, 0.675, 0.15],
        rot: [0.06, 0, 0]
      }),
      1,
      0.45
    );
    const saddleAccentMesh = subdivideSmoothMesh(
      transformMesh(bevelBoxMesh(0.225, 0.042, 0.12, 0.016), {
        pos: [0, 0.705, 0.30],
        rot: [0.22, 0, 0]
      }),
      1,
      0.45
    );
    suitLegMeshes.push(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.198, 0.128, 0.195, 0.054), {
          pos: [0, 0.732, 0.135],
          rot: [0.28, 0, 0]
        }),
        1,
        0.5
      )
    );

    // Rear tail Wipeout V-blade LED taillight
    glowMeshes.push(
      transformMesh(bevelBoxMesh(0.095, 0.028, 0.038, 0.008), {
        pos: [0, 0.678, 0.865],
        rot: [0.12, 0, 0]
      })
    );

    cache = {
      liveryMesh: bakeMeshCavityAO(mergeRawMeshesToRaw([mainCowl, frontFender, ...nacelleMeshes]), 0.24),
      carbonTrimMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(carbonMeshes), 0.24),
      saddleMesh: bakeMeshCavityAO(saddleMesh, 0.24),
      saddleAccentMesh: bakeMeshCavityAO(saddleAccentMesh, 0.24),
      suitLegsMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(suitLegMeshes), 0.24),
      bootPadsMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(bootPadMeshes), 0.24),
      gunmetalFrameMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(gunmetalMeshes), 0.24),
      goldForkMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(goldForkMeshes), 0.24),
      accentStripeMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(accentStripeMeshes), 0.24),
      glowMesh: mergeRawMeshesToRaw(glowMeshes)
    };
    return cache;
  };
})();

function buildBikeHullSlotsForRider(options: RiderVehicleNodeOptions): readonly MultiMatSlot[] {
  const raw = cachedBikeRawParts();
  const darkSuitTint = mixColorHex("#19202d", options.suitColor, 0.16);
  // Consolidate into 4 crisp material slots (`coalesceColors: false` preserves `children[0].material` `.color`, `.rim`, `.clearcoat`):
  // Slot 0: Primary livery clearcoat monocoque fairing & outer thigh armor (`liveryClearcoatMaterial`)
  // Slot 1: Vertex-colored carbon-kevlar racing undersuit legs + dark carbon belly pan + saddle + accent bolster + boots
  // Slot 2: Vertex-colored metallic twin-spar frame/swingarm/rearsets + gold forks + accent shin-plates & knee-sliders
  // Slot 3: Practical ion glow headlamps, HUD dash, Tron fairing ribbons, knee/boot pips & tail blade
  const matteMerged = mergeRawMeshesToRaw([
    paintMeshColors(raw.carbonTrimMesh, "#141923"),
    paintMeshColors(raw.saddleMesh, "#171c27"),
    paintMeshColors(raw.saddleAccentMesh, options.accentColor),
    paintMeshColors(raw.suitLegsMesh, darkSuitTint),
    paintMeshColors(raw.bootPadsMesh, "#1c2331")
  ]);
  const metalMerged = mergeRawMeshesToRaw([
    paintMeshColors(raw.gunmetalFrameMesh, "#434f62"),
    paintMeshColors(raw.goldForkMesh, "#dfb96a"),
    paintMeshColors(raw.accentStripeMesh, options.accentColor)
  ]);
  return [
    { mesh: raw.liveryMesh, materialIndex: 0 },
    { mesh: matteMerged, materialIndex: 1 },
    { mesh: metalMerged, materialIndex: 2 },
    { mesh: raw.glowMesh, materialIndex: 3 }
  ];
}

const cachedSkateRawParts = (() => {
  let cache: {
    readonly deckMesh: RawMesh;
    readonly gripAndBootsMesh: RawMesh;
    readonly suitLegsMesh: RawMesh;
    readonly alloyTrucksMesh: RawMesh;
    readonly accentRailsMesh: RawMesh;
    readonly glowMesh: RawMesh;
  } | null = null;
  return () => {
    if (cache) return cache;
    const deckSections: V3[][] = [
      superEllipseRingZ(0.065, 0.020, 0.018, 0.145, -0.56, 28, 0.86),
      superEllipseRingZ(0.132, 0.024, 0.022, 0.138, -0.47, 28, 0.82),
      superEllipseRingZ(0.170, 0.026, 0.024, 0.132, -0.38, 28, 0.80),
      superEllipseRingZ(0.190, 0.028, 0.030, 0.122, 0, 28, 0.76),
      superEllipseRingZ(0.170, 0.026, 0.024, 0.132, 0.38, 28, 0.80),
      superEllipseRingZ(0.136, 0.024, 0.022, 0.140, 0.47, 28, 0.82),
      superEllipseRingZ(0.078, 0.022, 0.020, 0.148, 0.56, 28, 0.86)
    ];
    const deckMesh = subdivideSmoothMesh(loftSectionsMesh(deckSections, true, false), 1, 0.44);
    const gripMeshes: RawMesh[] = [
      subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.24, 0.014, 0.74, 0.005), { pos: [0, 0.15, 0] }), 1, 0.38)
    ];
    const accentMeshes: RawMesh[] = [];
    const alloyMeshes: RawMesh[] = [];
    const glowMeshes: RawMesh[] = [
      transformMesh(bevelBoxMesh(0.13, 0.022, 0.04, 0.008), { pos: [0, 0.148, -0.54] })
    ];
    const bootSdf = getCosmicRacingBootSdfMesh();
    for (const side of [-1, 1] as const) {
      accentMeshes.push(
        tubeSweepMesh(
          [
            [side * 0.18, 0.13, -0.4, 0.016],
            [side * 0.195, 0.122, 0, 0.018],
            [side * 0.18, 0.13, 0.4, 0.016]
          ],
          16,
          false
        )
      );
      const microBell: V2[] = [
        [0.042, 0],
        [0.058, 0.08],
        [0.068, 0.14],
        [0.052, 0.14]
      ];
      alloyMeshes.push(
        transformMesh(latheMesh(microBell, 28, false), {
          pos: [side * 0.11, 0.16, 0.36],
          rot: [Math.PI * 0.5, 0, 0]
        })
      );
      glowMeshes.push(
        transformMesh(bevelBoxMesh(0.065, 0.065, 0.04, 0.018), {
          pos: [side * 0.11, 0.16, 0.48]
        }),
        tubeSweepMesh(
          [
            [side * 0.188, 0.132, -0.38, 0.008],
            [side * 0.204, 0.125, 0, 0.009],
            [side * 0.188, 0.132, 0.38, 0.008]
          ],
          12,
          false
        )
      );
    }
    for (const zTruck of [-0.33, 0.33] as const) {
      alloyMeshes.push(transformMesh(bevelBoxMesh(0.26, 0.04, 0.09, 0.01), { pos: [0, 0.095, zTruck] }));
    }
    const suitMeshes: RawMesh[] = [
      subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.22, 0.15, 0.22, 0.055), { pos: [0, 0.84, 0] }), 1, 0.48)
    ];
    const stance = [
      { foot: [-0.04, 0.2, -0.22] as V3, knee: [-0.08, 0.52, -0.18] as V3, hip: [-0.02, 0.82, -0.05] as V3, yaw: 0.34, side: -1 as const },
      { foot: [0.05, 0.2, 0.22] as V3, knee: [0.08, 0.5, 0.16] as V3, hip: [0.02, 0.82, 0.06] as V3, yaw: -0.22, side: 1 as const }
    ];
    for (const leg of stance) {
      suitMeshes.push(
        sculptHumanoidLimbMesh(
          [
            [leg.hip[0], leg.hip[1], leg.hip[2], 0.082],
            [leg.knee[0], leg.knee[1], leg.knee[2], 0.068],
            [leg.foot[0], leg.foot[1], leg.foot[2], 0.052]
          ],
          28,
          0.14
        )
      );
      // Armored knee-slider puck + shin plate + SDF studio-sculpted skate-boot
      accentMeshes.push(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.042, 0.072, 0.085, 0.018), 1, 0.48), {
          pos: [leg.knee[0] + leg.side * 0.058, leg.knee[1], leg.knee[2]],
          rot: [0, leg.yaw, 0]
        }),
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.064, 0.115, 0.068, 0.02), 1, 0.48), {
          pos: [(leg.knee[0] + leg.foot[0]) * 0.5, 0.34, (leg.knee[2] + leg.foot[2]) * 0.5 - 0.03],
          rot: [-0.18, leg.yaw, 0]
        })
      );
      gripMeshes.push(
        transformMesh(bootSdf, {
          pos: [leg.foot[0], 0.185, leg.foot[2]],
          rot: [0, leg.yaw, 0],
          scale: [1.18, 1.05, 1.1]
        })
      );
    }
    cache = {
      deckMesh: bakeMeshCavityAO(deckMesh, 0.24),
      gripAndBootsMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(gripMeshes), 0.24),
      suitLegsMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(suitMeshes), 0.24),
      alloyTrucksMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(alloyMeshes), 0.24),
      accentRailsMesh: bakeMeshCavityAO(mergeRawMeshesToRaw(accentMeshes), 0.24),
      glowMesh: mergeRawMeshesToRaw(glowMeshes)
    };
    return cache;
  };
})();

export interface RiderVehicleNodeOptions {
  readonly id: string;
  readonly vehicle: Vehicle;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly suitColor: string;
  readonly isHero: boolean;
  readonly castShadow: boolean;
  readonly look: OrbitLook;
}

/** Builds the sleek Lunar GP racing motorcycle chassis (`rider-i-model`) with rounded monocoque cowling, carbon belly pan & tucked rider legs. */
export function buildHoverBikeChassisNode(
  options: RiderVehicleNodeOptions
): GroupBuilder {
  const slots = buildBikeHullSlotsForRider(options);
  const rimColor = options.isHero ? "#ffe6cc" : "#c8d4f2";
  const rimIntensity = options.isHero ? 0.26 : 0.32;
  const glowColor = options.isHero ? "#62e2ff" : "#ffae5c";
  const materials: readonly AuraMaterialSpec[] = [
    liveryClearcoatMaterial(options.primaryColor, rimColor, rimIntensity),
    evaThermalSuitMaterial("#ffffff", "#eef2f7"),
    anisotropicAlloyMaterial("#ffffff", 0.25),
    practicalIonGlowMaterial(glowColor, options.isHero ? 2.4 : 1.9)
  ];
  return assembleMultiMaterialNode(options.id, slots, materials, {
    id: options.id,
    castShadow: options.castShadow,
    receiveShadow: options.look === "original",
    coalesceColors: false
  });
}

/** Builds `rider-i-model` (`parts[0]`) with per-rider clearcoat livery (`material 0`) & `rim` highlight. */
export function createLunarRiderVehicleNode(
  options: RiderVehicleNodeOptions
): GroupBuilder {
  if (options.vehicle === "bike") {
    return buildHoverBikeChassisNode(options);
  }
  const raw = cachedSkateRawParts();
  const darkSuitTint = mixColorHex("#19202d", options.suitColor, 0.16);
  const slots: readonly MultiMatSlot[] = [
    { mesh: raw.deckMesh, materialIndex: 0 },
    {
      mesh: mergeRawMeshesToRaw([
        paintMeshColors(raw.gripAndBootsMesh, "#161b25"),
        paintMeshColors(raw.suitLegsMesh, darkSuitTint)
      ]),
      materialIndex: 1
    },
    {
      mesh: mergeRawMeshesToRaw([
        paintMeshColors(raw.alloyTrucksMesh, "#8e9aa8"),
        paintMeshColors(raw.accentRailsMesh, options.accentColor)
      ]),
      materialIndex: 2
    },
    { mesh: raw.glowMesh, materialIndex: 3 }
  ];
  const rimColor = options.isHero ? "#ffe6cc" : "#c8d4f2";
  const rimIntensity = options.isHero ? 0.26 : 0.33;
  const glowColor = options.isHero ? "#7ae6ff" : "#ffae5c";
  const materials: readonly AuraMaterialSpec[] = [
    liveryClearcoatMaterial(options.primaryColor, rimColor, rimIntensity),
    evaThermalSuitMaterial("#ffffff", "#eef2f7"),
    anisotropicAlloyMaterial("#ffffff", 0.26),
    practicalIonGlowMaterial(glowColor, options.isHero ? 2.5 : 2.0)
  ];
  return assembleMultiMaterialNode(options.id, slots, materials, {
    id: options.id,
    castShadow: options.castShadow,
    receiveShadow: options.look === "original",
    coalesceColors: false
  });
}

/** Builds the translucent cyan hologram `ghost-rider` for Time Trial best-lap playback. */
export function createGhostRiderNode(vehicle: Vehicle): PrimitiveBuilder {
  const merged = vehicle === "skate"
    ? (() => {
        const s = cachedSkateRawParts();
        return mergeRawMeshes([s.deckMesh, s.gripAndBootsMesh, s.suitLegsMesh, s.alloyTrucksMesh]);
      })()
    : (() => {
        const b = cachedBikeRawParts();
        return mergeRawMeshes([b.liveryMesh, b.carbonTrimMesh, b.suitLegsMesh, b.gunmetalFrameMesh]);
      })();
  return geometry
    .custom(merged, {
      name: "ghost-rider",
      castShadow: false,
      receiveShadow: false,
      material: unnamed(
        material.physical({
          color: "#9fe8ff",
          emissive: "#5fd8ff",
          emissiveIntensity: 0.85,
          practical: true,
          roughness: 0.08,
          opacity: 0.36,
          clearcoat: 1,
          ior: 1.46
        })
      )
    })
    .runtime({ id: "ghost-rider" });
}

// ---------------------------------------------------------------------------
// 2. Articulated Rider Sub-Parts (`fairing`, `wheelF/R`, `nozzleL/R`, `coneL/R`, `torso`, `visor`)
// ---------------------------------------------------------------------------

/** Smooth studio-sculpted SDF Cosmic Racing Gauntlet (`[24, 24, 24]`, exact `analyticNormals: true` preserved). */
const getCosmicGauntletSdfMesh = (() => {
  let cached: RawMesh | null = null;
  return (): RawMesh => {
    if (cached) return cached;
    cached = sculptOrganicSdfMesh({
      boundsMin: [-0.085, -0.045, -0.048],
      boundsMax: [0.075, 0.045, 0.048],
      resolution: [24, 24, 24],
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const palm = sdfEllipsoid(p, [0.008, 0, 0], [0.038, 0.026, 0.028]);
        const cuff = sdfTaperedCapsule(p, [-0.042, -0.004, 0], [0.006, 0, 0], 0.032, 0.03);
        const knuckles = sdfEllipsoid(p, [0.034, -0.004, 0], [0.024, 0.022, 0.026]);
        return sminPoly(sminPoly(palm, cuff, 0.018), knuckles, 0.018);
      }
    });
    return cached;
  };
})();

/** Builds a wide treaded MotoGP lunar racing slick wheel centered on local `+Y` axle (`wheel` maps `+Y -> +Z` lateral axle). */
function buildMotoGpWheelSlots(radius: number, halfWidth: number, spokes: number): MultiMatSlot[] {
  const rimR = radius * 0.60;

  // Slot 0: Wide rounded MotoGP dark rubber racing tire with subtle lunar shoulder tread grooves (`latheMesh` around +Y)
  const slickProfile: V2[] = [
    [rimR, -halfWidth * 0.84],
    [radius * 0.78, -halfWidth * 0.99],
    [radius * 0.90, -halfWidth],
    [radius * 0.955, -halfWidth * 0.76],
    [radius * 0.942, -halfWidth * 0.64],
    [radius * 0.988, -halfWidth * 0.44],
    [radius, -halfWidth * 0.18],
    [radius, halfWidth * 0.18],
    [radius * 0.988, halfWidth * 0.44],
    [radius * 0.942, halfWidth * 0.64],
    [radius * 0.955, halfWidth * 0.76],
    [radius * 0.90, halfWidth],
    [radius * 0.78, halfWidth * 0.99],
    [rimR, halfWidth * 0.84],
    [rimR * 0.93, halfWidth * 0.72],
    [rimR * 0.93, -halfWidth * 0.72],
    [rimR, -halfWidth * 0.84]
  ];
  const tireMesh = bakeMeshCavityAO(latheMesh(slickProfile, 36, false), 0.28);

  // Slot 1: Coalesced vertex-colored machined alloy rim barrel + 5-spoke split star + twin brake rotors
  const metalMeshes: RawMesh[] = [
    paintMeshColors(
      latheMesh(
        [
          [rimR * 0.86, -halfWidth * 0.74],
          [rimR * 0.98, -halfWidth * 0.78],
          [rimR * 0.98, halfWidth * 0.78],
          [rimR * 0.86, halfWidth * 0.74],
          [rimR * 0.86, -halfWidth * 0.74]
        ],
        32,
        false
      ),
      "#cfd8e4"
    ),
    paintMeshColors(
      latheMesh(
        [
          [0, -halfWidth * 0.88],
          [radius * 0.20, -halfWidth * 0.88],
          [radius * 0.23, -halfWidth * 0.45],
          [radius * 0.23, halfWidth * 0.45],
          [radius * 0.20, halfWidth * 0.88],
          [0, halfWidth * 0.88]
        ],
        28,
        false
      ),
      "#aeb8c6"
    )
  ];

  for (let s = 0; s < spokes; s += 1) {
    const baseAngle = (s / spokes) * Math.PI * 2;
    for (const branch of [-0.14, 0.14] as const) {
      const a0 = baseAngle + branch * 0.35;
      const a1 = baseAngle + branch;
      metalMeshes.push(
        paintMeshColors(
          tubeSweepMesh(
            [
              [Math.cos(a0) * radius * 0.19, 0, Math.sin(a0) * radius * 0.19, radius * 0.036],
              [Math.cos(a1) * rimR * 0.90, 0, Math.sin(a1) * rimR * 0.90, radius * 0.026]
            ],
            14,
            false
          ),
          "#d5deea"
        )
      );
    }
  }

  for (const side of [-1, 1] as const) {
    const yDisc = side * halfWidth * 0.56;
    metalMeshes.push(
      paintMeshColors(
        latheMesh(
          [
            [radius * 0.26, yDisc - 0.008],
            [radius * 0.49, yDisc - 0.008],
            [radius * 0.49, yDisc + 0.008],
            [radius * 0.26, yDisc + 0.008],
            [radius * 0.26, yDisc - 0.008]
          ],
          32,
          false
        ),
        "#586374"
      )
    );
  }

  return [
    { mesh: tireMesh, materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(metalMeshes), materialIndex: 1 }
  ];
}

const cachedSubPartMeshes = (() => {
  let cache: {
    readonly bikeFairing: AuraCustomGeometrySpec;
    readonly skateFairing: AuraCustomGeometrySpec;
    readonly bikeWheel: readonly MultiMatSlot[];
    readonly skateWheel: readonly MultiMatSlot[];
    readonly nozzle: readonly MultiMatSlot[];
    readonly machCone: AuraCustomGeometrySpec;
    readonly bikeTorso: readonly MultiMatSlot[];
    readonly skateTorso: readonly MultiMatSlot[];
    readonly visorHelmet: readonly MultiMatSlot[];
  } | null = null;

  return () => {
    if (cache) return cache;

    // Flush curved MotoGP double-bubble smoked windscreen sweeping smoothly from nose cowl (+X) up & aft (-X)
    const windscreenSections: V3[][] = [
      superEllipseRingZ(0.062, 0.014, 0.010, -0.042, -0.22, 28, 0.90),
      superEllipseRingZ(0.104, 0.032, 0.012, -0.022, -0.145, 28, 0.88),
      superEllipseRingZ(0.132, 0.046, 0.014, -0.004, -0.07, 28, 0.86),
      superEllipseRingZ(0.152, 0.062, 0.014, 0.036, 0.08, 28, 0.84),
      superEllipseRingZ(0.136, 0.050, 0.012, 0.062, 0.19, 28, 0.88)
    ];
    const fairingBike = mergeRawMeshes([
      transformMesh(subdivideSmoothMesh(loftSectionsMesh(windscreenSections, true, false), 1, 0.44), {
        rot: [0, -Math.PI * 0.5, 0]
      })
    ]);
    const fairingSkate = mergeRawMeshes([
      subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.76, 0.04, 0.22, 0.014), { pos: [0, 0, 0] }), 1, 0.42)
    ]);

    // Twin sleek contoured titanium thruster bell (`alongForward` maps +Y -> -X aft; exit plane sits at y = +0.11)
    const nozzleBell = mergeRawMeshesToRaw([
      paintMeshColors(
        latheMesh(
          [
            [0.042, -0.10],
            [0.048, -0.02],
            [0.056, 0.06],
            [0.060, 0.11],
            [0.050, 0.11],
            [0.042, 0.02],
            [0.042, -0.10]
          ],
          32,
          false
        ),
        "#465162"
      ),
      paintMeshColors(
        latheMesh(
          [
            [0.054, 0.055],
            [0.062, 0.068],
            [0.062, 0.098],
            [0.056, 0.106],
            [0.054, 0.055]
          ],
          32,
          false
        ),
        "#e0b456"
      )
    ]);
    const nozzleCore = latheMesh(
      [
        [0, 0.01],
        [0.040, 0.03],
        [0.047, 0.102],
        [0, 0.108]
      ],
      32,
      false
    );
    const nozzle: MultiMatSlot[] = [
      { mesh: nozzleBell, materialIndex: 0 },
      { mesh: nozzleCore, materialIndex: 1 }
    ];

    // Anchored at `y = 0` (`y = 0..+0.34`) so `lenScale` scales cleanly from the exact nozzle exit with ZERO `dx` drift!
    const coneProfile = bezierCurve2([0.048, 0.0], [0.054, 0.08], [0.028, 0.21], [0.004, 0.34], 14);
    const machCone = mergeRawMeshes([latheMesh([[0, 0.0], ...coneProfile], 32, false)]);

    cache = {
      bikeFairing: fairingBike,
      skateFairing: fairingSkate,
      bikeWheel: buildMotoGpWheelSlots(0.315, 0.112, 5),
      skateWheel: buildMotoGpWheelSlots(0.095, 0.042, 5),
      nozzle,
      machCone,
      bikeTorso: buildMotoGpTorsoSlots(true),
      skateTorso: buildMotoGpTorsoSlots(false),
      visorHelmet: buildMotoGpHelmetSlots()
    };
    return cache;
  };
})();

function buildMotoGpTorsoSlots(tuckedBike: boolean): MultiMatSlot[] {
  // V-tapered articulated Cosmic Moto-Racer torso (`+X` chest toward tank, `-X` arched dorsal spine, `+Y` waist->neck, `+-Z` shoulders)
  const makeTorsoRing = (rxFront: number, rxBack: number, rz: number, cx: number, y: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const ca = Math.cos(a);
      const rx = ca >= 0 ? rxFront : rxBack;
      const pinch = ca >= 0 ? 0.92 : 0.86;
      pts.push([
        cx + Math.sign(ca) * Math.pow(Math.abs(ca), pinch) * rx,
        y,
        Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.9) * rz
      ]);
    }
    return pts;
  };

  const torsoBody = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        makeTorsoRing(0.084, 0.088, 0.098, -0.012, -0.195),
        makeTorsoRing(0.102, 0.098, 0.132, -0.002, -0.06),
        makeTorsoRing(0.116, 0.108, 0.176, 0.012, 0.10),
        makeTorsoRing(0.084, 0.082, 0.108, 0.018, 0.215)
      ],
      true,
      false
    ),
    1,
    0.5
  );

  // Streamlined teardrop MotoGP aero speed-hump fairing integrated smoothly along the upper spine (ZERO boxy dorsal block!)
  const aeroSpeedHump = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        makeTorsoRing(0.010, 0.022, 0.036, -0.084, -0.13),
        makeTorsoRing(0.018, 0.056, 0.072, -0.092, -0.01),
        makeTorsoRing(0.022, 0.072, 0.088, -0.094, 0.10),
        makeTorsoRing(0.018, 0.048, 0.066, -0.082, 0.195)
      ],
      true,
      false
    ),
    1,
    0.54
  );

  // Clearcoat livery armor plates: MotoGP speed-hump + contoured pectoral chestplate + sculpted neck collar
  const armorMeshes: RawMesh[] = [
    aeroSpeedHump,
    subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.042, 0.145, 0.178, 0.018), { pos: [0.112, 0.055, 0], rot: [0, 0, -0.08] }), 1, 0.48),
    transformMesh(
      latheMesh([[0.062, 0.18], [0.088, 0.192], [0.084, 0.228], [0.058, 0.234]], 28, false),
      { pos: [0.018, 0, 0] }
    )
  ];

  const suitMeshes: RawMesh[] = [torsoBody];
  const titaniumTrimMeshes: RawMesh[] = [];
  const glowMeshes: RawMesh[] = [];
  const gauntletSdf = getCosmicGauntletSdfMesh();

  // 5 articulated titanium spine-vertebrae segments + glowing Tron/Wipeout dorsal spine capacitor core!
  const spineStations: readonly [number, number, number][] = [
    [-0.102, -0.15, 0.054],
    [-0.138, -0.08, 0.062],
    [-0.156, -0.005, 0.068],
    [-0.164, 0.075, 0.070],
    [-0.152, 0.150, 0.060]
  ];
  for (const [sx, sy, sw] of spineStations) {
    titaniumTrimMeshes.push(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.024, 0.044, sw, 0.009), { pos: [sx, sy, 0], rot: [0, 0, -0.12] }),
        1,
        0.45
      )
    );
  }
  const spineGlowPts = catmullRomSpline3(
    [
      [-0.108, -0.155, 0],
      [-0.152, -0.05, 0],
      [-0.171, 0.065, 0],
      [-0.154, 0.165, 0]
    ],
    6
  );
  glowMeshes.push(
    tubeSweepMesh(spineGlowPts.map((p): V4 => [p[0], p[1], p[2], 0.011]), 16, false)
  );

  for (const side of [-1, 1] as const) {
    // Layered angular Wipeout deltoid/shoulder pauldron + titanium edge slider + glowing rear shoulder seam
    armorMeshes.push(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.108, 0.072, 0.072, 0.024), {
          pos: [0.022, 0.148, side * 0.178],
          rot: [side * 0.28, -side * 0.12, -0.18]
        }),
        1,
        0.48
      )
    );
    titaniumTrimMeshes.push(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.064, 0.036, 0.032, 0.01), {
          pos: [0.026, 0.166, side * 0.205],
          rot: [side * 0.28, 0, -0.18]
        }),
        1,
        0.45
      )
    );
    glowMeshes.push(
      transformMesh(bevelBoxMesh(0.014, 0.042, 0.014, 0.004), {
        pos: [-0.032, 0.142, side * 0.186],
        rot: [side * 0.24, 0, -0.16]
      })
    );

    if (tuckedBike) {
      // Sculpted MotoGP tuck arm (`sculptHumanoidLimbMesh`) + forearm armor + titanium elbow slider + SDF armored gauntlet on clip-ons
      suitMeshes.push(
        sculptHumanoidLimbMesh(
          [
            [0.018, 0.148, side * 0.165, 0.052],
            [0.185, 0.085, side * 0.200, 0.046],
            [0.395, 0.128, side * 0.186, 0.037]
          ],
          26,
          0.14
        )
      );
      armorMeshes.push(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.135, 0.042, 0.044, 0.015), {
            pos: [0.295, 0.112, side * 0.198],
            rot: [0, -side * 0.08, 0.2]
          }),
          1,
          0.46
        )
      );
      titaniumTrimMeshes.push(
        // Titanium elbow slider puck
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.056, 0.038, 0.034, 0.012), {
            pos: [0.182, 0.078, side * 0.218],
            rot: [side * 0.2, 0, 0.1]
          }),
          1,
          0.45
        ),
        // Studio-sculpted SDF racing gauntlet gripping clip-on handlebar (`analyticNormals: true` preserved!)
        transformMesh(gauntletSdf, {
          pos: [0.41, 0.132, side * 0.185],
          rot: [0, -side * 0.1, 0.1]
        })
      );
    } else {
      suitMeshes.push(
        sculptHumanoidLimbMesh(
          [
            [0.018, 0.145, side * 0.165, 0.052],
            [0.14, 0.04, side * 0.22, 0.045],
            [0.27, -0.02, side * 0.19, 0.037]
          ],
          26,
          0.14
        )
      );
      titaniumTrimMeshes.push(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.054, 0.036, 0.034, 0.012), {
            pos: [0.14, 0.038, side * 0.238]
          }),
          1,
          0.45
        ),
        transformMesh(gauntletSdf, {
          pos: [0.29, -0.03, side * 0.188],
          rot: [0, -side * 0.14, -0.15]
        })
      );
    }
  }

  return [
    { mesh: bakeMeshCavityAO(paintMeshColors(mergeRawMeshesToRaw(suitMeshes), "#ffffff"), 0.24), materialIndex: 0 },
    { mesh: bakeMeshCavityAO(paintMeshColors(mergeRawMeshesToRaw(armorMeshes), "#ffffff"), 0.24), materialIndex: 1 },
    { mesh: bakeMeshCavityAO(paintMeshColors(mergeRawMeshesToRaw(titaniumTrimMeshes), "#ffffff"), 0.24), materialIndex: 2 },
    { mesh: mergeRawMeshesToRaw(glowMeshes), materialIndex: 3 }
  ];
}

function buildMotoGpHelmetSlots(): MultiMatSlot[] {
  // Aggressive forward-swept Tron / Wipeout Cosmic Aero-Helmet (`+X` forward chin-bar, `-X` elongated Kamm-tail spoiler)
  const sculptedBase = subdivideSmoothMesh(
    deformMesh(
      sculptStylizedHeadMesh(0.128, {
        jawTaper: 0.34,
        cheekFullness: 0.18,
        noseBridge: 0.22,
        browRidge: 0.28,
        subdivisions: 2,
        seed: 13
      }),
      ([x, y, z]) => {
        // In `sculptStylizedHeadMesh`, `+Z` is front face, `-Z` is back of cranium.
        const chinForward = z > 0.02 && y < -0.01 ? (z - 0.02) * (-0.01 - y) * 1.45 : 0;
        const rearKammTail = z < -0.02 ? Math.pow(-z - 0.02, 1.15) * 0.85 * Math.max(0, 1 - Math.abs(y - 0.025) * 5.2) : 0;
        const tailPinch = z < -0.04 ? Math.max(0.62, 1 - (-z - 0.04) * 1.65) : 1.03;
        return [x * tailPinch, y * 0.96 + (z < -0.03 ? (-z - 0.03) * 0.12 : 0), z + chinForward - rearKammTail];
      }
    ),
    1,
    0.45
  );
  // Rotate `+90 deg` about Y so `+Z` maps to `+X` forward and `-Z` Kamm-tail points `-X` aft!
  const shellMesh = bakeMeshCavityAO(
    paintMeshColors(transformMesh(sculptedBase, { rot: [0, Math.PI * 0.5, 0] }), "#ffffff"),
    0.24
  );

  // Swept dorsal aero shark-fin (`extrudePolygonMesh`) + twin canted side aero-stabilizer winglets (`accentColor`)
  const dorsalFinPoly: V2[] = [
    [0.055, 0.105],
    [-0.08, 0.158],
    [-0.225, 0.145],
    [-0.185, 0.082],
    [-0.04, 0.085]
  ];
  const finParts: RawMesh[] = [
    subdivideSmoothMesh(extrudePolygonMesh(dorsalFinPoly, 0.024, 0.006, true), 1, 0.42),
    // Sculpted forward chin-bar spoiler crest
    subdivideSmoothMesh(
      transformMesh(bevelBoxMesh(0.068, 0.038, 0.115, 0.012), { pos: [0.126, -0.062, 0], rot: [0, 0, -0.22] }),
      1,
      0.46
    )
  ];
  for (const side of [-1, 1] as const) {
    finParts.push(
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.165, 0.022, 0.032, 0.008), {
          pos: [-0.065, 0.038, side * 0.118],
          rot: [side * 0.36, -side * 0.14, 0.12]
        }),
        1,
        0.45
      )
    );
  }
  const stripeMesh = bakeMeshCavityAO(paintMeshColors(mergeRawMeshesToRaw(finParts), "#ffffff"), 0.24);

  // Dark carbon inner eyeport seal + jawline breather + padded neck collar (`y = -0.108`)
  const sealMesh = bakeMeshCavityAO(
    paintMeshColors(
      mergeRawMeshesToRaw([
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.095, 0.078, 0.205, 0.024), {
            pos: [0.082, 0.012, 0]
          }),
          1,
          0.42
        ),
        latheMesh([[0.056, -0.115], [0.094, -0.104], [0.100, -0.072], [0.066, -0.068]], 28, false)
      ]),
      "#ffffff"
    ),
    0.24
  );

  // Wide `210 deg` wraparound reflective gold/cyan cosmic visor shield (`+X` forward wrapping back to temples)
  const visorSections: V3[][] = [
    superEllipseRingZ(0.074, 0.042, 0.040, 0.004, -0.158, 28, 0.90),
    superEllipseRingZ(0.106, 0.052, 0.047, 0.008, -0.130, 28, 0.89),
    superEllipseRingZ(0.128, 0.058, 0.052, 0.012, -0.102, 28, 0.88),
    superEllipseRingZ(0.135, 0.055, 0.048, 0.015, -0.060, 28, 0.88),
    superEllipseRingZ(0.138, 0.050, 0.044, 0.018, -0.018, 28, 0.88)
  ];
  const visorMesh = transformMesh(
    subdivideSmoothMesh(loftSectionsMesh(visorSections, true, false), 1, 0.48),
    { rot: [0, -Math.PI * 0.5, 0] }
  );

  // Glowing Tron visor brow-slit + rear Kamm-tail telemetry V-chevron facing `-X` chase camera!
  const browPts = catmullRomSpline3(
    [
      [0.01, 0.048, -0.132],
      [0.125, 0.054, -0.082],
      [0.158, 0.050, 0],
      [0.125, 0.054, 0.082],
      [0.01, 0.048, 0.132]
    ],
    6
  );
  const rearChevronPts = catmullRomSpline3(
    [
      [-0.148, 0.058, -0.068],
      [-0.196, 0.042, 0],
      [-0.148, 0.058, 0.068]
    ],
    6
  );
  const glowMesh = mergeRawMeshesToRaw([
    tubeSweepMesh(browPts.map((p): V4 => [p[0], p[1], p[2], 0.0075]), 14, false),
    tubeSweepMesh(rearChevronPts.map((p): V4 => [p[0], p[1], p[2], 0.0085]), 14, false)
  ]);

  return [
    { mesh: shellMesh, materialIndex: 0 },
    { mesh: stripeMesh, materialIndex: 1 },
    { mesh: sealMesh, materialIndex: 2 },
    { mesh: visorMesh, materialIndex: 3 },
    { mesh: glowMesh, materialIndex: 4 }
  ];
}

/** Builds wide dark racing slick wheel (`roughness: 0.78`, `#171a20`) with 5-spoke turbine rim & brake rotors (2 draws). */
export function buildBikeWheelNode(options: {
  readonly id: string;
  readonly vehicle?: Vehicle;
  readonly isHero: boolean;
}): GroupBuilder {
  const meshes = cachedSubPartMeshes();
  return assembleMultiMaterialNode(
    options.id,
    options.vehicle === "skate" ? meshes.skateWheel : meshes.bikeWheel,
    [
      racingSlickTireMaterial("#161920"),
      polishedTitaniumMaterial("#ffffff", 0.18)
    ],
    { id: options.id, castShadow: false, receiveShadow: false, coalesceColors: false }
  );
}

/** Builds compact sleek anodized-titanium exhaust / ion thruster nozzle nested inside the rear fairing nacelles (2 draws). */
export function buildThrusterPodNode(options: {
  readonly id: string;
  readonly isHero: boolean;
}): GroupBuilder {
  const meshes = cachedSubPartMeshes();
  const glowHex = options.isHero ? "#58e2ff" : "#ff9d42";
  return assembleMultiMaterialNode(
    options.id,
    meshes.nozzle,
    [
      anisotropicAlloyMaterial("#ffffff", 0.22),
      practicalIonGlowMaterial(glowHex, options.isHero ? 2.4 : 1.9)
    ],
    { id: options.id, castShadow: false, receiveShadow: false, coalesceColors: false }
  );
}

/** Builds the tucked Tron/Wipeout Cosmic Moto-Racer (`torso` armored suit + spine capacitor or `visor` aero-fin space helmet). */
export function buildSpacesuitRiderNode(options: {
  readonly id: string;
  readonly part?: "torso" | "visor";
  readonly vehicle?: Vehicle;
  readonly liveryColor: string;
  readonly accentColor: string;
  readonly suitColor: string;
  readonly isHero: boolean;
}): GroupBuilder {
  const meshes = cachedSubPartMeshes();
  const glowHex = options.isHero ? "#58e2ff" : "#ff9d42";
  if (options.part === "visor") {
    const helmetShellHex = mixColorHex("#151c2a", options.liveryColor, 0.76);
    const visorHex = options.isHero ? "#ffb638" : "#5ce0ff";
    return assembleMultiMaterialNode(
      options.id,
      meshes.visorHelmet,
      [
        accentCarPaintMaterial(helmetShellHex),
        accentCarPaintMaterial(options.accentColor),
        lunarRubberGripMaterial("#10151f"),
        goldReflectiveGlassMaterial(visorHex, 0.86),
        practicalIonGlowMaterial(glowHex, options.isHero ? 2.6 : 2.1)
      ],
      { id: options.id, castShadow: false, receiveShadow: false }
    );
  }
  const darkSuitTint = mixColorHex("#181f2c", options.suitColor, 0.16);
  const armorLiveryHex = mixColorHex("#1a2232", options.liveryColor, 0.82);
  return assembleMultiMaterialNode(
    options.id,
    options.vehicle === "skate" ? meshes.skateTorso : meshes.bikeTorso,
    [
      evaThermalSuitMaterial(darkSuitTint, "#dce6f5"),
      accentCarPaintMaterial(armorLiveryHex),
      anisotropicAlloyMaterial("#8c99ac", 0.24),
      practicalIonGlowMaterial(glowHex, options.isHero ? 2.6 : 2.1)
    ],
    { id: options.id, castShadow: false, receiveShadow: false }
  );
}

export interface RiderSubPartOptions {
  readonly id: string;
  readonly kind: string;
  readonly vehicle: Vehicle;
  readonly liveryColor: string;
  readonly accentColor: string;
  readonly suitColor: string;
  readonly isHero: boolean;
}

/** Builds an articulated sub-part (`fairing`, `wheelF/R`, `nozzleL/R`, `coneL/R`, `torso`, `visor`) for `riderRig`. */
export function createRiderSubPartNode(
  options: RiderSubPartOptions
): GroupBuilder | PrimitiveBuilder {
  const meshes = cachedSubPartMeshes();
  const glowHex = options.isHero ? "#58e2ff" : "#ff9d42";

  switch (options.kind) {
    case "fairing":
      return geometry
        .custom(options.vehicle === "skate" ? meshes.skateFairing : meshes.bikeFairing, {
          name: options.id,
          castShadow: false,
          receiveShadow: false,
          material: options.vehicle === "skate"
            ? accentCarPaintMaterial(options.liveryColor)
            : darkSmokeWindscreenMaterial("#121b2b", 0.68)
        })
        .runtime({ id: options.id });

    case "wheelF":
    case "wheelR":
      return buildBikeWheelNode({
        id: options.id,
        vehicle: options.vehicle,
        isHero: options.isHero
      });

    case "nozzleL":
    case "nozzleR":
      return buildThrusterPodNode({
        id: options.id,
        isHero: options.isHero
      });

    case "coneL":
    case "coneR":
      return geometry
        .custom(meshes.machCone, {
          name: options.id,
          castShadow: false,
          receiveShadow: false,
          material: unnamed(
            material.glowingEmissive({
              color: options.isHero ? "#7ae4ff" : "#ffbe73",
              emissive: glowHex,
              emissiveIntensity: options.isHero ? 1.95 : 1.55,
              roughness: 0.16,
              opacity: 0.72,
              blend: "alpha",
              practical: true
            })
          )
        })
        .runtime({ id: options.id });

    case "torso":
      return buildSpacesuitRiderNode({
        id: options.id,
        part: "torso",
        vehicle: options.vehicle,
        liveryColor: options.liveryColor,
        accentColor: options.accentColor,
        suitColor: options.suitColor,
        isHero: options.isHero
      });

    case "visor":
    default:
      return buildSpacesuitRiderNode({
        id: options.id,
        part: "visor",
        vehicle: options.vehicle,
        liveryColor: options.liveryColor,
        accentColor: options.accentColor,
        suitColor: options.suitColor,
        isHero: options.isHero
      });
  }
}

// ---------------------------------------------------------------------------
// 3. Start/Finish Truss Gantry, Course Gate Pylons, Apollo Lander & Observatory
// ---------------------------------------------------------------------------

/** Monumental Lunar GP Start/Finish Gantry (`latticeTrussMesh` span + LED race clock + Marshal lights). */
export function createStartFinishGantryNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
}): GroupBuilder {
  // Track frame basis (`basisMatrix(tangent, up, side)`): +X along track, +Y up, +Z across track
  const slots: MultiMatSlot[] = [];

  for (const side of [-1, 1] as const) {
    // Concrete/basalt anchor pad + vertical 4-chord X-braced lattice tower
    slots.push({
      mesh: transformMesh(bevelBoxMesh(2.4, 0.9, 2.4, 0.14), { pos: [0, 0.45, side * 13.6] }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.35, 14.2, 1.35], bays: 7, chordRadius: 0.09, braceRadius: 0.05 }),
        { pos: [0, 7.3, side * 13.6] }
      ),
      materialIndex: 0
    });
    // Diagonal knee brace into overhead bridge
    slots.push({
      mesh: tubeSweepMesh(
        [
          [0, 10.6, side * 13.1, 0.085],
          [0, 13.7, side * 10.2, 0.085]
        ],
        8,
        true
      ),
      materialIndex: 0
    });
  }

  // Overhead 28.6 m `latticeTrussMesh` span across track (+Z)
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [1.5, 1.65, 28.6], bays: 12, chordRadius: 0.095, braceRadius: 0.052 }),
      { pos: [0, 14.4, 0] }
    ),
    materialIndex: 0
  });

  // Central bevelled LED Race Clock & Telemetry Fascia Board + checkered GP header accents
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.68, 2.1, 11.6, 0.09), { pos: [0.58, 14.45, 0] }),
    materialIndex: 1
  });
  for (let c = -5; c <= 5; c += 1) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.12, 0.36, 0.92, 0.02), {
        pos: [0.92, 15.22, c * 1.0],
      }),
      materialIndex: c % 2 === 0 ? 3 : 1
    });
  }
  // Digital race clock readout digits bar
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.08, 0.68, 6.4, 0.02), { pos: [0.94, 14.38, 0] }),
    materialIndex: 4
  });

  // 5 Marshal Start-Light Pods (3 amber/red outer + 2 jade inner, `practical: true`)
  const lensMeshes: RawMesh[] = [];
  for (let m = -2; m <= 2; m += 1) {
    const mz = m * 2.1;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.62, 0.86, 0.76, 0.06), { pos: [0.56, 12.95, mz] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [0.24, 0.02], [0.26, 0.12], [0, 0.14]], 16, false),
        { pos: [0.84, 12.95, mz], rot: [0, 0, -Math.PI * 0.5] }
      ),
      materialIndex: Math.abs(m) <= 1 ? 5 : 4
    });
    lensMeshes.push(
      transformMesh(
        latheMesh([[0, 0], [0.27, 0.03], [0.28, 0.1], [0, 0.13]], 16, false),
        { pos: [0.9, 12.95, mz], rot: [0, 0, -Math.PI * 0.5] }
      )
    );
  }

  const structGroup = assembleMultiMaterialNode(
    `${options.name}-frame`,
    slots,
    [
      anisotropicAlloyMaterial("#9aa5b4", 0.26),
      accentCarPaintMaterial("#243040"),
      regolithBasaltMaterial("#5c4d49", 0.92),
      lunarCeramicMaterial("#f3ede2"),
      practicalIonGlowMaterial("#f2b857", 3.1),
      practicalIonGlowMaterial("#93ead5", 2.9)
    ],
    { castShadow: false, receiveShadow: false }
  );
  const lensCover = geometry.custom(mergeRawMeshes(lensMeshes), {
    name: `${options.name}-lenses`,
    castShadow: false,
    receiveShadow: false,
    material: goldReflectiveGlassMaterial("#ffd8a8", 0.45)
  });

  return group(options.name, [structGroup, lensCover], {
    position: options.position,
    rotation: options.rotation
  });
}

const cachedGatePylonSlots = (() => {
  let cache: readonly MultiMatSlot[] | null = null;
  return (): readonly MultiMatSlot[] => {
    if (cache) return cache;
    // Grounded at y = 0, total height = 13.0 m (matches `PILLAR = { lateral: 11.1, height: 13, radius: 1.1 }`)
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(1.9, 1.1, 1.9, 0.14), { pos: [0, 0.55, 0] }), materialIndex: 2 },
      {
        mesh: transformMesh(
          latticeTrussMesh({ span: [1.02, 11.4, 1.02], bays: 6, chordRadius: 0.075, braceRadius: 0.042 }),
          { pos: [0, 6.7, 0] }
        ),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(1.26, 3.8, 0.34, 0.06), { pos: [0, 4.2, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(1.18, 0.9, 1.18, 0.08), { pos: [0, 12.55, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 9.6, 0.22, 0.03), { pos: [0.56, 6.9, 0] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.16, 9.6, 0.22, 0.03), { pos: [-0.56, 6.9, 0] }), materialIndex: 3 }
    ];
    cache = slots;
    return slots;
  };
})();

export function createCourseGatePylonNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly gateIndex: number;
}): GroupBuilder {
  const glow = options.gateIndex % 2 === 0 ? "#ecb75f" : "#93ead5";
  return assembleMultiMaterialNode(
    options.name,
    cachedGatePylonSlots(),
    [
      anisotropicAlloyMaterial("#8e99a8", 0.27),
      polishedTitaniumMaterial("#cfd8e4", 0.18),
      regolithBasaltMaterial("#61514c", 0.92),
      practicalIonGlowMaterial(glow, 2.6)
    ],
    {
      position: options.position,
      rotation: options.rotation,
      castShadow: false,
      receiveShadow: false
    }
  );
}

const cachedGateLintelSlots = (() => {
  let cache: readonly MultiMatSlot[] | null = null;
  return (): readonly MultiMatSlot[] => {
    if (cache) return cache;
    // Centered at lintel midpoint, span = 23.2 m along Z (matches `LINTEL = { height: 13.1, halfLength: 11.6 }`)
    cache = [
      {
        mesh: latticeTrussMesh({ span: [0.96, 0.84, 23.2], bays: 10, chordRadius: 0.068, braceRadius: 0.038 }),
        materialIndex: 0
      },
      { mesh: bevelBoxMesh(1.12, 0.56, 5.2, 0.07), materialIndex: 1 },
      { mesh: bevelBoxMesh(1.18, 0.24, 14.8, 0.03), materialIndex: 2 }
    ];
    return cache;
  };
})();

export function createCourseGateLintelNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly gateIndex: number;
}): GroupBuilder {
  const glow = options.gateIndex % 2 === 0 ? "#f2b857" : "#93ead5";
  return assembleMultiMaterialNode(
    options.name,
    cachedGateLintelSlots(),
    [
      anisotropicAlloyMaterial("#b6a388", 0.26),
      lunarCeramicMaterial("#efe9de"),
      practicalIonGlowMaterial(glow, 2.5)
    ],
    {
      position: options.position,
      rotation: options.rotation,
      castShadow: false,
      receiveShadow: false
    }
  );
}

// ---------------------------------------------------------------------------
// 4. Apollo Lander, Observatory, Course-Side Rocks, Meteors & Resonance Crystals
// ---------------------------------------------------------------------------

/** Apollo-style gold-foil & ceramic Lunar Descent Lander (`dress-lander`, grounded at `y = 0`). */
export function createLunarLanderNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly size: number;
}): GroupBuilder {
  // Normalized unit height = 1.0 -> scaled by `options.size` (`BOUNDS.lander` h = 1.9, max = 1.9)
  const slots: MultiMatSlot[] = [];

  // Octagonal crinkly gold-foil descent stage (`y = 0.22..0.52`) + descent engine bell
  const octProf: V2[] = [
    [0, 0.22],
    [0.34, 0.22],
    [0.36, 0.5],
    [0, 0.5]
  ];
  slots.push({ mesh: latheMesh(octProf, 8, true), materialIndex: 0 });
  slots.push({
    mesh: latheMesh([[0.08, 0.08], [0.16, 0.08], [0.11, 0.22], [0.06, 0.22]], 16, false),
    materialIndex: 2
  });

  // 4 splayed landing gear A-frame struts + circular dish footpads at `y = 0`
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const ca = Math.cos(a), sa = Math.sin(a);
    slots.push({
      mesh: tubeSweepMesh(
        [
          [ca * 0.29, 0.44, sa * 0.29, 0.018],
          [ca * 0.46, 0.03, sa * 0.46, 0.015]
        ],
        8,
        false
      ),
      materialIndex: 2
    });
    slots.push({
      mesh: tubeSweepMesh(
        [
          [ca * 0.31, 0.25, sa * 0.31, 0.014],
          [ca * 0.44, 0.05, sa * 0.44, 0.012]
        ],
        8,
        false
      ),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [0.085, 0], [0.095, 0.024], [0, 0.02]], 14, false),
        { pos: [ca * 0.46, 0, sa * 0.46] }
      ),
      materialIndex: 0
    });
  }

  // Faceted ceramic ascent stage cabin (`y = 0.5..0.84`) + S-band dish antenna + beacon strobe
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.42, 0.3, 0.38, 0.06), { pos: [0, 0.65, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: latheMesh([[0, 0.8], [0.14, 0.8], [0.11, 0.88], [0, 0.89]], 14, false),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.06, 0.015], [0.13, 0.055], [0.145, 0.07]], 16, false),
      { pos: [0.14, 0.94, 0.06], rot: [0.65, 0.4, 0] }
    ),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.05, 0.06, 0.05, 0.015), { pos: [-0.12, 0.92, 0] }),
    materialIndex: 3
  });

  const body = assembleMultiMaterialNode(
    `${options.name}-body`,
    slots,
    [
      goldFoilMetalMaterial(),
      lunarCeramicMaterial("#f2ede3"),
      anisotropicAlloyMaterial("#8d98a7", 0.28),
      practicalIonGlowMaterial("#ecb75f", 2.8)
    ],
    { castShadow: false, receiveShadow: false }
  );
  const viewport = geometry.custom(
    mergeRawMeshes([
      transformMesh(bevelBoxMesh(0.03, 0.11, 0.13, 0.008), { pos: [0.215, 0.68, -0.08], rot: [0, 0, -0.18] }),
      transformMesh(bevelBoxMesh(0.03, 0.11, 0.13, 0.008), { pos: [0.215, 0.68, 0.08], rot: [0, 0, -0.18] })
    ]),
    {
      name: `${options.name}-windows`,
      castShadow: false,
      receiveShadow: false,
      material: goldReflectiveGlassMaterial("#ffd8a8", 0.45)
    }
  );

  return group(options.name, [body, viewport], {
    position: options.position,
    rotation: options.rotation,
    scale: options.size
  });
}

/** Domed Lunar Crater Observatory (`dress-observatory`, smooth `latheMesh` dome + telescope barrel). */
export function createLunarObservatoryNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly size: number;
}): GroupBuilder {
  const slots: MultiMatSlot[] = [
    // Stepped basalt plinth (`y = 0..0.18`)
    { mesh: latheMesh([[0, 0], [0.44, 0], [0.41, 0.16], [0.36, 0.18], [0, 0.18]], 16, true), materialIndex: 0 },
    // Ribbed ceramic cylindrical observatory drum (`y = 0.18..0.54`)
    { mesh: latheMesh([[0.35, 0.18], [0.36, 0.22], [0.35, 0.52], [0.37, 0.55], [0, 0.55]], 24, false), materialIndex: 1 },
    // Smooth rotatable titanium observatory dome (`y = 0.54..0.92`, smooth normals!)
    {
      mesh: latheMesh(
        [
          [0.355, 0.54],
          [0.352, 0.62],
          [0.32, 0.73],
          [0.24, 0.83],
          [0.12, 0.9],
          [0, 0.925]
        ],
        24,
        false
      ),
      materialIndex: 2
    },
    // Shutter slit arch ribs + protruding Cassegrain telescope barrel + side telemetry mast
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.28, 0.13, 0.025), { pos: [0.12, 0.74, 0], rot: [0, 0, -0.42] }), materialIndex: 2 },
    {
      mesh: transformMesh(
        latheMesh([[0.068, 0], [0.075, 0.34], [0.086, 0.38], [0.064, 0.38]], 18, false),
        { pos: [0.16, 0.72, 0], rot: [0, 0, -0.92] }
      ),
      materialIndex: 1
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.035, 0.28, 0.035, 0.008), { pos: [-0.28, 0.82, 0.16] }),
      materialIndex: 2
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.055, 0.055, 0.055, 0.016), { pos: [-0.28, 0.98, 0.16] }),
      materialIndex: 3
    }
  ];

  const structure = assembleMultiMaterialNode(
    `${options.name}-structure`,
    slots,
    [
      regolithBasaltMaterial("#65534e", 0.93),
      lunarCeramicMaterial("#f0ebe1"),
      polishedTitaniumMaterial("#d6dfe9", 0.17),
      practicalIonGlowMaterial("#93ead5", 2.7)
    ],
    { castShadow: false, receiveShadow: false }
  );
  const objectiveLens = geometry.custom(
    mergeRawMeshes([
      transformMesh(
        latheMesh([[0, 0], [0.064, 0.01], [0.062, 0.03], [0, 0.035]], 18, false),
        { pos: [0.45, 0.94, 0], rot: [0, 0, -0.92] }
      )
    ]),
    {
      name: `${options.name}-lens`,
      castShadow: false,
      receiveShadow: false,
      material: goldReflectiveGlassMaterial("#b8ecff", 0.45)
    }
  );

  return group(options.name, [structure, objectiveLens], {
    position: options.position,
    rotation: options.rotation,
    scale: options.size
  });
}

/** Sculpted lunar impact-fractured crater boulder (`subdivideSmoothMesh` + planar fracture cuts + `fbm3` crags + cavity AO). */
function sculptCraterBoulderMesh(radius: number, seed: number): RawMesh {
  const base = subdivideSmoothMesh(icosphereFacetMesh(radius, 1, 0.26, seed), 1, 0.42);
  const pos = base.positions.slice();
  const planes: V3[] = [
    [hash01(seed + 3) * 2 - 1, hash01(seed + 7) * 1.4 - 0.5, hash01(seed + 11) * 2 - 1],
    [hash01(seed + 19) * 2 - 1, hash01(seed + 23) * 1.4 - 0.5, hash01(seed + 29) * 2 - 1],
    [hash01(seed + 37) * 2 - 1, hash01(seed + 41) * 1.4 - 0.5, hash01(seed + 47) * 2 - 1]
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l] as const;
  });

  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i]!;
    let y = pos[i + 1]!;
    let z = pos[i + 2]!;
    const r = Math.hypot(x, y, z) || 1;
    const nx = x / r;
    const ny = y / r;
    const nz = z / r;
    const crag = 0.86 + 0.28 * fbm3(nx * 2.4 + seed * 0.13, ny * 2.6, nz * 2.4 - seed * 0.09, 3);
    let cut = 1;
    for (let p = 0; p < planes.length; p += 1) {
      const pl = planes[p]!;
      const d = nx * pl[0] + ny * pl[1] + nz * pl[2];
      if (d > 0.52) cut = Math.min(cut, 0.78 + (1 - d) * 0.45);
    }
    const scale = crag * cut;
    x *= scale;
    y *= scale * 0.86;
    z *= scale;
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;
  }
  const recomputed = toFlatShaded({
    positions: pos,
    normals: base.normals.slice(),
    uvs: base.uvs.slice(),
    indices: base.indices.slice()
  });
  return bakeMeshCavityAO(subdivideSmoothMesh(recomputed, 1, 0.34), 0.36);
}

/** Course-side solid collider boulder or stratified basalt spire (`dress-boulder-*` / `dress-spire-*`). */
export function createCourseSideRockNode(options: {
  readonly name: string;
  readonly kind: "boulder" | "spire";
  readonly position: V3;
  readonly rotation: V3;
  readonly size: number;
  readonly seed: number;
}): PrimitiveBuilder {
  const raw = options.kind === "spire"
    ? bakeMeshCavityAO(stratifiedCliffMesh({ radiusX: 0.23, radiusZ: 0.22, height: 1, terraces: 5, seed: options.seed }), 0.32)
    : normalizeMeshGroundedUnit(sculptCraterBoulderMesh(0.5, options.seed));
  const scale: V3 = options.kind === "spire"
    ? [options.size, options.size, options.size]
    : [options.size, options.size * 0.78, options.size * 0.98];
  const tint = options.kind === "spire" ? "#9c6750" : "#8b6355";
  return geometry.custom(mergeRawMeshes([raw]), {
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale,
    castShadow: false,
    receiveShadow: false,
    material: regolithBasaltMaterial(tint, 0.92)
  });
}

/** Tumbling lunar chondrite meteoroid collectible (`rock-${id}`, diameter ~2.0 m centered at origin, single-draw coalesced). */
export function createMeteorRockNode(id: number): PrimitiveBuilder {
  const variant = ((id % 5) + 5) % 5;
  const spec = memoizeGeometry(`strange-orbit:meteor:${variant}`, () => {
    const seed = 101 + variant * 37;
    const crust = paintMeshColors(sculptCraterBoulderMesh(0.94, seed), "#72666e");
    const inclusionA = paintMeshColors(
      transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.36, 0, 0.16, seed + 7), 1, 0.42), {
        pos: [0.44, 0.22, -0.26]
      }),
      "#b5c0cf"
    );
    const inclusionB = paintMeshColors(
      transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.30, 0, 0.16, seed + 19), 1, 0.42), {
        pos: [-0.40, -0.26, 0.32]
      }),
      "#a8b4c4"
    );
    const fissure = paintMeshColors(
      transformMesh(bevelBoxMesh(1.32, 0.075, 0.40, 0.022), { rot: [0.4, variant * 0.7, -0.3] }),
      "#f2ad5a"
    );
    return mergeRawMeshes([crust, inclusionA, inclusionB, fissure]);
  });
  return geometry
    .custom(spec, {
      name: `rock-${id}`,
      castShadow: false,
      receiveShadow: false,
      material: regolithBasaltMaterial("#ffffff", 0.86)
    })
    .runtime({ id: `rock-${id}` });
}

/** Faceted hexagonal lunar resonance crystal spire (`crystal-${i}-${k}`). */
export function createResonanceCrystalNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly height: number;
}): GroupBuilder {
  const h = options.height;
  const crystalProf: V2[] = [
    [0, -h * 0.48],
    [0.28, -h * 0.42],
    [0.32, -h * 0.08],
    [0.25, h * 0.24],
    [0, h * 0.52]
  ];
  const collarProf: V2[] = [
    [0, -h * 0.5],
    [0.38, -h * 0.5],
    [0.34, -h * 0.3],
    [0, -h * 0.3]
  ];
  return assembleMultiMaterialNode(
    options.name,
    [
      { mesh: latheMesh(collarProf, 7, true), materialIndex: 0 },
      { mesh: latheMesh(crystalProf, 6, true), materialIndex: 1 },
      { mesh: transformMesh(latheMesh(crystalProf, 6, true), { scale: 0.55 }), materialIndex: 2 }
    ],
    [
      regolithBasaltMaterial("#585264", 0.92),
      goldReflectiveGlassMaterial("#9fd8ff", 0.48),
      practicalIonGlowMaterial("#b4a2ff", 2.4)
    ],
    {
      position: options.position,
      rotation: options.rotation,
      castShadow: false,
      receiveShadow: false
    }
  );
}


/** Builds batched world-space checkpoint gate pylons + optional overhead lintels (`course-gates-batched`). */
export function createBatchedCourseGatesNode(
  gates: readonly {
    readonly pillarLeftPos: V3;
    readonly pillarRightPos: V3;
    readonly lintelPos: V3;
    readonly rotation: V3;
    readonly gateIndex: number;
  }[],
  includeLintels: boolean
): GroupBuilder {
  const pylonSlots = cachedGatePylonSlots();
  const lintelSlots = cachedGateLintelSlots();
  const mergedSlots: MultiMatSlot[] = [];
  // Material table:
  // 0: pylon alloy, 1: pylon titanium, 2: pylon basalt, 3: warm amber glow, 4: jade glow,
  // 5: lintel alloy, 6: lintel ceramic
  for (const g of gates) {
    const glowMatIdx = g.gateIndex % 2 === 0 ? 3 : 4;
    for (const pos of [g.pillarLeftPos, g.pillarRightPos]) {
      for (const s of pylonSlots) {
        const matIdx = s.materialIndex === 3 ? glowMatIdx : s.materialIndex;
        mergedSlots.push({
          mesh: transformMesh(s.mesh, { pos, rot: g.rotation }),
          materialIndex: matIdx
        });
      }
    }
    if (includeLintels) {
      for (const s of lintelSlots) {
        const matIdx = s.materialIndex === 0 ? 5 : s.materialIndex === 1 ? 6 : glowMatIdx;
        mergedSlots.push({
          mesh: transformMesh(s.mesh, { pos: g.lintelPos, rot: g.rotation }),
          materialIndex: matIdx
        });
      }
    }
  }
  return assembleMultiMaterialNode(
    "course-gates-batched",
    mergedSlots,
    [
      anisotropicAlloyMaterial("#8e99a8", 0.27),
      polishedTitaniumMaterial("#cfd8e4", 0.18),
      regolithBasaltMaterial("#61514c", 0.92),
      practicalIonGlowMaterial("#f2b857", 2.6),
      practicalIonGlowMaterial("#93ead5", 2.6),
      anisotropicAlloyMaterial("#b6a388", 0.26),
      lunarCeramicMaterial("#efe9de")
    ],
    { castShadow: false, receiveShadow: false }
  );
}

/** Builds batched world-space hexagonal lunar resonance crystals (`resonance-crystals-batched`). */
export function createBatchedResonanceCrystalsNode(
  crystals: readonly {
    readonly position: V3;
    readonly rotation: V3;
    readonly height: number;
  }[]
): GroupBuilder {
  const slots: MultiMatSlot[] = [];
  for (const c of crystals) {
    const h = c.height;
    const crystalProf: V2[] = [
      [0, -h * 0.48],
      [0.28, -h * 0.42],
      [0.32, -h * 0.08],
      [0.25, h * 0.24],
      [0, h * 0.52]
    ];
    const collarProf: V2[] = [
      [0, -h * 0.5],
      [0.38, -h * 0.5],
      [0.34, -h * 0.3],
      [0, -h * 0.3]
    ];
    const outerCrystal = latheMesh(crystalProf, 6, true);
    slots.push({
      mesh: transformMesh(latheMesh(collarProf, 7, true), { pos: c.position, rot: c.rotation }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(outerCrystal, { pos: c.position, rot: c.rotation }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(outerCrystal, { pos: c.position, rot: c.rotation, scale: 0.55 }),
      materialIndex: 2
    });
  }
  return assembleMultiMaterialNode(
    "resonance-crystals-batched",
    slots,
    [
      regolithBasaltMaterial("#585264", 0.92),
      goldReflectiveGlassMaterial("#9fd8ff", 0.48),
      practicalIonGlowMaterial("#b4a2ff", 2.4)
    ],
    { castShadow: false, receiveShadow: false }
  );
}

/** Builds WebGPU-safe (`clearcoat: 0, sheen: 0`) instanced course-side boulders & stratified basalt spires. */
export function createCourseSideRocksInstancedNodes(
  boulders: readonly { readonly position: V3; readonly rotation: V3; readonly size: number }[],
  spires: readonly { readonly position: V3; readonly rotation: V3; readonly size: number }[]
) {
  const specs = cachedInstancedSpecs();
  return {
    bouldersNode: instances.custom(specs.rimBoulder, {
      name: "dress-boulders",
      transforms: boulders.map((b) => ({
        position: [b.position[0], b.position[1], b.position[2]],
        rotation: [b.rotation[0], b.rotation[1], b.rotation[2]],
        scale: [b.size, b.size * 0.78, b.size * 0.98]
      })),
      castShadow: false,
      receiveShadow: false,
      material: unnamed(
        material.pbr({ color: "#8b6355", roughness: 0.92, metallic: 0.03, clearcoat: 0, sheen: 0 })
      )
    }),
    spiresNode: instances.custom(specs.rimSpire, {
      name: "dress-spires",
      transforms: spires.map((s) => ({
        position: [s.position[0], s.position[1], s.position[2]],
        rotation: [s.rotation[0], s.rotation[1], s.rotation[2]],
        scale: [s.size, s.size, s.size]
      })),
      castShadow: false,
      receiveShadow: false,
      material: unnamed(
        material.pbr({ color: "#9c6750", roughness: 0.92, metallic: 0.03, clearcoat: 0, sheen: 0 })
      )
    })
  };
}

// ---------------------------------------------------------------------------
// 5. Instanced Crater Rim Scatter (`clearcoat: 0, sheen: 0`) & Track Beacons
// ---------------------------------------------------------------------------

export interface RimScatterInput {
  readonly rocks: readonly { readonly position: V3; readonly rotation: V3; readonly scale: V3 }[];
  readonly spires: readonly { readonly position: V3; readonly rotation: V3; readonly scale: V3 }[];
  readonly moonRocks: readonly { readonly position: V3; readonly rotation: V3; readonly scale: V3 }[];
}

const cachedInstancedSpecs = (() => {
  let cache: {
    readonly rimBoulder: AuraCustomGeometrySpec;
    readonly rimSpire: AuraCustomGeometrySpec;
    readonly rimMoonRock: AuraCustomGeometrySpec;
    readonly beaconPost: AuraCustomGeometrySpec;
    readonly beaconHood: AuraCustomGeometrySpec;
    readonly beaconLamp: AuraCustomGeometrySpec;
  } | null = null;
  return () => {
    if (cache) return cache;
    const postRaw = mergeRawMeshes([
      transformMesh(bevelBoxMesh(0.46, 0.24, 0.36, 0.05), { pos: [0, -1.03, 0] }),
      bevelBoxMesh(0.3, 2.18, 0.22, 0.05),
      transformMesh(bevelBoxMesh(0.38, 0.14, 0.3, 0.03), { pos: [0, 0.62, 0] })
    ]);
    const hoodRaw = mergeRawMeshes([
      bevelBoxMesh(0.48, 0.16, 0.42, 0.045),
      transformMesh(bevelBoxMesh(0.44, 0.18, 0.08, 0.02), { pos: [0, -0.12, -0.17] })
    ]);
    const lampRaw = mergeRawMeshes([
      latheMesh([[0, -0.17], [0.135, -0.14], [0.15, 0], [0.135, 0.14], [0, 0.17]], 12, false)
    ]);
    cache = {
      rimBoulder: mergeRawMeshes([normalizeMeshGroundedUnit(sculptCraterBoulderMesh(0.5, 17))]),
      rimSpire: mergeRawMeshes([
        bakeMeshCavityAO(
          stratifiedCliffMesh({ radiusX: 0.24, radiusZ: 0.22, height: 1, terraces: 5, seed: 31 }),
          0.32
        )
      ]),
      rimMoonRock: mergeRawMeshes([normalizeMeshGroundedUnit(sculptCraterBoulderMesh(0.5, 73))]),
      beaconPost: postRaw,
      beaconHood: hoodRaw,
      beaconLamp: lampRaw
    };
    return cache;
  };
})();

/** Builds WebGPU-safe (`clearcoat: 0, sheen: 0`) instanced crater-rim boulders & stratified spires. */
export function createRimScatterInstancedNodes(scatter: RimScatterInput) {
  const specs = cachedInstancedSpecs();
  const rockPalette = ["#a8644c", "#7d5a4e", "#c58a6a", "#5d5a66"];
  const spirePalette = ["#7a4f3e", "#b06e4e", "#c9925f"];
  const moonPalette = ["#8b837c", "#6f6965", "#a4988e"];
  const toTransforms = (
    items: readonly { readonly position: V3; readonly rotation: V3; readonly scale: V3 }[]
  ): AuraTransformSpec[] =>
    items.map((r) => ({
      position: [r.position[0], r.position[1], r.position[2]],
      rotation: [r.rotation[0], r.rotation[1], r.rotation[2]],
      scale: [r.scale[0], r.scale[1], r.scale[2]]
    }));

  const baseRockMat = unnamed(
    material.pbr({ color: "#ffffff", roughness: 0.91, metallic: 0.03, clearcoat: 0, sheen: 0 })
  );

  return {
    rocks: instances.custom(specs.rimBoulder, {
      name: "rim-rocks",
      transforms: toTransforms(scatter.rocks),
      colors: scatter.rocks.map((_, i) => rockPalette[i % rockPalette.length]!),
      castShadow: false,
      receiveShadow: true,
      material: baseRockMat
    }),
    spires: instances.custom(specs.rimSpire, {
      name: "rim-spires",
      transforms: toTransforms(scatter.spires),
      colors: scatter.spires.map((_, i) => spirePalette[i % spirePalette.length]!),
      castShadow: false,
      receiveShadow: true,
      material: baseRockMat
    }),
    moonRocks: instances.custom(specs.rimMoonRock, {
      name: "rim-moon-rocks",
      transforms: toTransforms(scatter.moonRocks),
      colors: scatter.moonRocks.map((_, i) => moonPalette[i % moonPalette.length]!),
      castShadow: false,
      receiveShadow: true,
      material: baseRockMat
    })
  };
}

/** Builds WebGPU-safe (`clearcoat: 0, sheen: 0`) instanced trackside pylon posts, cowls & lamps. */
export function createTrackBeaconInstancedNodes(
  posts: readonly AuraTransformSpec[],
  hoods: readonly AuraTransformSpec[],
  lamps: readonly AuraTransformSpec[],
  lampMaterial: AuraMaterialSpec
) {
  const specs = cachedInstancedSpecs();
  return {
    postsNode: instances.custom(specs.beaconPost, {
      name: "beacon-posts",
      transforms: posts,
      castShadow: false,
      receiveShadow: false,
      material: unnamed(
        material.metal({ color: "#8e99a8", roughness: 0.29, metallic: 1, clearcoat: 0, sheen: 0, envMapIntensity: 1.45 })
      )
    }),
    hoodsNode: instances.custom(specs.beaconHood, {
      name: "beacon-hoods",
      transforms: hoods,
      castShadow: false,
      receiveShadow: false,
      material: unnamed(
        material.metal({ color: "#3d4652", roughness: 0.34, metallic: 1, clearcoat: 0, sheen: 0, envMapIntensity: 1.25 })
      )
    }),
    lampsNode: instances
      .custom(specs.beaconLamp, {
        name: "beacon-lamps",
        transforms: lamps,
        castShadow: false,
        receiveShadow: false,
        material: lampMaterial
      })
      .runtime({ id: "beacon-lamps" })
  };
}

// ---------------------------------------------------------------------------
// 6. Lunar Colony Outpost Props (Habitat Dome, Comms Dish, Solar, Trailer, Cryo Tank)
// ---------------------------------------------------------------------------

/**
 * Architectural Sci-Fi Geodesic Lunar Habitat Dome (`icosphereSmoothMesh` segmented white
 * ceramic dome + dark gunmetal geodesic rib arches + gold Kapton thermal-foil equipment bays +
 * corrugated pressurized airlock tunnel + warm lit recessed viewport windows + crown skylight).
 */
export function createLunarHabitatDomeNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  // Sculpt grounded geodesic pressure dome from `icosphereSmoothMesh` into segmented ceramic panels
  const rawSphere = icosphereSmoothMesh(4.32, 2, 0.01, 17);
  const domePositions = rawSphere.positions.slice();
  for (let i = 0; i < domePositions.length; i += 3) {
    const px = domePositions[i]!;
    const py = domePositions[i + 1]!;
    const pz = domePositions[i + 2]!;
    const ny = Math.max(0, py / 4.32);
    const radialScale = py < 0 ? 0.985 : 1;
    domePositions[i] = px * radialScale;
    domePositions[i + 1] = 1.05 + ny * 3.82;
    domePositions[i + 2] = pz * radialScale;
  }
  const geodesicShell = toFlatShaded({
    positions: domePositions,
    normals: rawSphere.normals.slice(),
    uvs: rawSphere.uvs.slice(),
    indices: rawSphere.indices.slice()
  });

  // Material indices:
  // 0: sintered regolith berm, 1: white ceramic geodesic shell, 2: dark gunmetal structural ribs/frames,
  // 3: gold Kapton thermal foil bays, 4: warm lit recessed viewport windows & EVA beacon
  const slots: MultiMatSlot[] = [
    // Sintered regolith radiation-shield foundation berm (`y = 0..1.12`) + dark gunmetal base ring
    { mesh: latheMesh([[0, 0], [5.55, 0], [5.05, 1.02], [4.46, 1.12], [0, 1.12]], 24, false), materialIndex: 0 },
    { mesh: latheMesh([[4.22, 0.98], [4.52, 1.04], [4.52, 1.32], [4.28, 1.38]], 24, true), materialIndex: 2 },
    { mesh: geodesicShell, materialIndex: 1 },
    // Crown cupola dark gunmetal compression collar (`y = 4.56..4.88`)
    { mesh: latheMesh([[1.75, 4.54], [2.02, 4.6], [1.92, 4.84], [1.58, 4.86]], 18, true), materialIndex: 2 }
  ];

  // 8 dark gunmetal geodesic meridian rib arches (`tubeSweepMesh`)
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const archPts: V4[] = [];
    for (let k = 0; k <= 10; k += 1) {
      const th = (k / 10) * Math.PI;
      const r = Math.cos(th) * 4.38;
      const y = 1.06 + Math.sin(th) * 3.86;
      archPts.push([ca * r, y, sa * r, 0.125]);
    }
    slots.push({ mesh: tubeSweepMesh(archPts, 8, false), materialIndex: 2 });
  }

  // 3 horizontal geodesic latitude structural rings + diagonal triangulation struts
  const latBands: readonly { readonly elev: number; readonly rad: number }[] = [
    { elev: 0.2, rad: 0.105 },
    { elev: 0.52, rad: 0.1 },
    { elev: 0.84, rad: 0.09 }
  ];
  for (const band of latBands) {
    const r = Math.cos(band.elev) * 4.39;
    const y = 1.06 + Math.sin(band.elev) * 3.86;
    const ringPts: V4[] = [];
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      ringPts.push([Math.cos(a) * r, y, Math.sin(a) * r, band.rad]);
    }
    slots.push({ mesh: tubeSweepMesh(ringPts, 7, true), materialIndex: 2 });
  }
  for (let i = 0; i < 16; i += 1) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 1) / 16) * Math.PI * 2;
    const r0 = Math.cos(0.2) * 4.37, y0 = 1.06 + Math.sin(0.2) * 3.86;
    const r1 = Math.cos(0.52) * 4.37, y1 = 1.06 + Math.sin(0.52) * 3.86;
    const r2 = Math.cos(0.84) * 4.37, y2 = 1.06 + Math.sin(0.84) * 3.86;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [Math.cos(a0) * r0, y0, Math.sin(a0) * r0, 0.068],
          [Math.cos(a1) * r1, y1, Math.sin(a1) * r1, 0.064],
          [Math.cos(a0) * r2, y2, Math.sin(a0) * r2, 0.058]
        ],
        6,
        false
      ),
      materialIndex: 2
    });
  }

  // Corrugated pressurized EVA airlock tunnel (`+X` radial axis) + blast hatch + status beacon
  const tunnelCyl = latheMesh(
    [
      [0, 0], [1.18, 0], [1.22, 0.45], [1.14, 0.9], [1.22, 1.4],
      [1.14, 1.9], [1.24, 2.38], [1.08, 2.62], [0, 2.62]
    ],
    18,
    false
  );
  slots.push({
    mesh: transformMesh(tunnelCyl, { pos: [3.85, 1.28, 0], rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: 1
  });
  for (const tx of [4.18, 5.08, 5.98]) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 2.58, 2.58, 0.08), { pos: [tx, 1.32, 0] }),
      materialIndex: 2
    });
  }
  // Airlock threshold ramp, heavy blast door & glowing warm airlock porthole + overhead EVA beacon
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.4, 0.36, 2.3, 0.06), { pos: [6.45, 0.18, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.26, 1.82, 1.46, 0.09), { pos: [6.48, 1.22, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.56, 0.56, 0.06), { pos: [6.58, 1.52, 0] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.24, 0.62, 0.05), { pos: [6.28, 2.68, 0] }), materialIndex: 4 });

  // 3 Gold Kapton thermal-foil ECLSS / avionics equipment bays flanking the perimeter
  for (const bayYaw of [-0.74, 0.74, Math.PI * 0.82]) {
    const cb = Math.cos(bayYaw), sb = Math.sin(bayYaw);
    const bx = cb * 4.55, bz = -sb * 4.55;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.48, 1.62, 2.18, 0.1), { pos: [bx, 1.05, bz], rot: [0, bayYaw, 0] }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.36, 1.38, 1.94, 0.12), { pos: [cb * 4.78, 1.12, -sb * 4.78], rot: [0, bayYaw, 0] }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.92, 0.42, 1.44, 0.08), { pos: [cb * 4.65, 1.98, -sb * 4.65], rot: [0, bayYaw, 0] }),
      materialIndex: 3
    });
  }

  // 6 Warm-lit recessed viewport windows set into dark metallic frames around the upper-mid dome
  for (const winYaw of [-1.28, -0.38, 0.38, 1.28, 2.18, -2.18]) {
    const cw = Math.cos(winYaw), sw = Math.sin(winYaw);
    const wr = 3.92;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.42, 0.82, 1.24, 0.08), {
        pos: [cw * wr, 2.52, -sw * wr],
        rot: [0, winYaw, 0.36]
      }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.26, 0.56, 0.94, 0.05), {
        pos: [cw * (wr + 0.1), 2.55, -sw * (wr + 0.1)],
        rot: [0, winYaw, 0.36]
      }),
      materialIndex: 4
    });
  }

  const body = assembleMultiMaterialNode(
    `${options.name}-shell`,
    slots,
    [
      regolithBasaltMaterial("#6b5852", 0.93),
      lunarCeramicMaterial("#f2ede3"),
      anisotropicAlloyMaterial("#232b38", 0.3),
      goldFoilMetalMaterial(),
      practicalIonGlowMaterial("#ffcf7d", 2.8)
    ],
    { castShadow: false, receiveShadow: false }
  );
  // Gold-iridium `material.physical` crown observation cupola (`castShadow: false`)
  const crownGlass = geometry.custom(
    mergeRawMeshes([
      latheMesh([[1.72, 4.76], [1.28, 5.04], [0.68, 5.2], [0, 5.26]], 18, false)
    ]),
    {
      name: `${options.name}-skylight`,
      castShadow: false,
      receiveShadow: false,
      material: goldReflectiveGlassMaterial("#ffd8a8", 0.45)
    }
  );
  return group(options.name, [body, crownGlass], {
    position: options.position,
    rotation: options.rotation,
    scale: options.scale ?? 1
  });
}

/** Deep-Space Parabolic Comms Dish (`latticeTrussMesh` tower + `latheMesh` dish + tripod feed horn). */
export function createDeepSpaceDishNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  const dishProf: V2[] = [
    [0, 0],
    [0.9, 0.14],
    [1.8, 0.56],
    [2.65, 1.22],
    [3.15, 1.78],
    [3.22, 1.86],
    [2.58, 1.12],
    [1.65, 0.44],
    [0, -0.14]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(2.4, 0.65, 2.4, 0.12), { pos: [0, 0.32, 0] }), materialIndex: 2 },
    {
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.3, 4.6, 1.3], bays: 4, chordRadius: 0.08, braceRadius: 0.045 }),
        { pos: [0, 2.8, 0] }
      ),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(1.1, 0.85, 1.1, 0.1), { pos: [0, 5.3, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latheMesh(dishProf, 24, false), { pos: [0, 5.85, 0], rot: [0.58, 0, 0.16] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.36, 0.42, 0.36, 0.08), { pos: [0.36, 7.95, 1.48] }), materialIndex: 3 }
  ];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [Math.cos(a) * 2.1, 6.2, Math.sin(a) * 1.9, 0.055],
          [0.36, 7.88, 1.46, 0.045]
        ],
        8,
        false
      ),
      materialIndex: 0
    });
  }
  return assembleMultiMaterialNode(
    options.name,
    slots,
    [
      anisotropicAlloyMaterial("#94a0b0", 0.27),
      lunarCeramicMaterial("#f4efe6"),
      regolithBasaltMaterial("#62524d", 0.92),
      practicalIonGlowMaterial("#93ead5", 2.9)
    ],
    { position: options.position, rotation: options.rotation, scale: options.scale ?? 1, castShadow: false, receiveShadow: false }
  );
}

/** Dual-Wing Photovoltaic Solar Array + Rover Service Trailer + Pressurized Cryo-Fuel Skid. */
export function createSolarArrayNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.4, 0.45, 1.4, 0.09), { pos: [0, 0.22, 0] }), materialIndex: 2 },
    { mesh: latheMesh([[0.18, 0.4], [0.15, 3.6], [0.22, 3.9], [0, 3.95]], 14, false), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.22, 8.6, 0.04), { pos: [0, 3.85, 0] }), materialIndex: 0 }
  ];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(2.5, 0.1, 3.6, 0.03), { pos: [0, 3.92, side * 2.35], rot: [0, 0, -0.34] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(2.36, 0.06, 3.44, 0.015), { pos: [0.03, 3.98, side * 2.35], rot: [0, 0, -0.34] }),
      materialIndex: 1
    });
  }
  return assembleMultiMaterialNode(
    options.name,
    slots,
    [
      anisotropicAlloyMaterial("#9da8b7", 0.26),
      accentCarPaintMaterial("#1b3a6f"),
      regolithBasaltMaterial("#63524d", 0.92)
    ],
    { position: options.position, rotation: options.rotation, scale: options.scale ?? 1, castShadow: false, receiveShadow: false }
  );
}

/** 6-Wheel Lunar Rover Service Trailer (`wheelAssemblySlots` + pressurized pod + truss rack). */
export function createRoverServiceTrailerNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.9, 0.22, 4.2, 0.06), { pos: [0, 0.56, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(1.78, 1.32, 2.75, 0.18), { pos: [0, 1.32, -0.35] }), materialIndex: 1 },
    {
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.55, 0.85, 1.15], bays: 2, chordRadius: 0.045, braceRadius: 0.028 }),
        { pos: [0, 1.1, 1.45] }
      ),
      materialIndex: 2
    },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.2, 0.42, 0.05), { pos: [0, 2.06, -0.35] }), materialIndex: 4 }
  ];
  const baseWheel = wheelAssemblySlots({ radius: 0.48, width: 0.28, spokeCount: 6, tireMat: 0, rimMat: 3, rotorMat: 2 });
  for (const zAxle of [-1.35, 0, 1.35] as const) {
    for (const side of [-1, 1] as const) {
      for (const w of baseWheel) {
        slots.push({
          mesh: transformMesh(w.mesh, { pos: [side * 1.06, 0.48, zAxle] }),
          materialIndex: w.materialIndex
        });
      }
    }
  }
  return assembleMultiMaterialNode(
    options.name,
    slots,
    [
      lunarRubberGripMaterial("#181c24"),
      lunarCeramicMaterial("#efeae0"),
      anisotropicAlloyMaterial("#8d98a8", 0.28),
      polishedTitaniumMaterial("#dce5ef", 0.16),
      practicalIonGlowMaterial("#ecb75f", 2.6)
    ],
    { position: options.position, rotation: options.rotation, scale: options.scale ?? 1, castShadow: false, receiveShadow: false }
  );
}

/** Twin-Capsule Pressurized Cryo-Fuel Tank Skid (`latheMesh` vessels + `latticeTrussMesh` cradle). */
export function createPressurizedFuelTankNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  const vesselProf: V2[] = [
    [0, -1.85],
    [0.48, -1.68],
    [0.68, -1.25],
    [0.7, 1.25],
    [0.48, 1.68],
    [0, 1.85]
  ];
  const slots: MultiMatSlot[] = [
    {
      mesh: transformMesh(
        latticeTrussMesh({ span: [3.2, 0.65, 3.8], bays: 4, chordRadius: 0.06, braceRadius: 0.036 }),
        { pos: [0, 0.35, 0] }
      ),
      materialIndex: 0
    }
  ];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(vesselProf, 20, false), { pos: [side * 0.86, 1.32, 0], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.46, 1.46, 0.26, 0.14), { pos: [side * 0.86, 1.32, 0.55] }),
      materialIndex: 2
    });
  }
  slots.push({
    mesh: tubeSweepMesh(
      [
        [-0.86, 1.32, 1.9, 0.075],
        [0, 1.62, 2.05, 0.08],
        [0.86, 1.32, 1.9, 0.075]
      ],
      10,
      false
    ),
    materialIndex: 3
  });
  return assembleMultiMaterialNode(
    options.name,
    slots,
    [
      anisotropicAlloyMaterial("#8e99a8", 0.28),
      lunarCeramicMaterial("#f3eee5"),
      accentCarPaintMaterial("#d98448"),
      polishedTitaniumMaterial("#dde6f0", 0.15)
    ],
    { position: options.position, rotation: options.rotation, scale: options.scale ?? 1, castShadow: false, receiveShadow: false }
  );
}
