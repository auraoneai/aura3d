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
  bezierCurve2,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
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
      clearcoatRoughness: 0.024,
      envMapIntensity: 1.55,
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
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5
    })
  );
}

export function anisotropicAlloyMaterial(color = "#9aa5b4", roughness = 0.28): AuraMaterialSpec {
  return unnamed(
    material.brushedMetal({
      color,
      roughness,
      anisotropy: 0.88,
      envMapIntensity: 1.5
    })
  );
}

export function polishedTitaniumMaterial(color = "#dce5ef", roughness = 0.14): AuraMaterialSpec {
  return unnamed(
    material.studioMetal({
      color,
      roughness,
      envMapIntensity: 1.65
    })
  );
}

export function goldFoilMetalMaterial(): AuraMaterialSpec {
  return unnamed(
    material.studioMetal({
      color: "#e6b44a",
      roughness: 0.24,
      envMapIntensity: 1.75
    })
  );
}

export function evaThermalSuitMaterial(color: string, sheenColor = "#f5efe6"): AuraMaterialSpec {
  return unnamed(
    material.fabric({
      color,
      sheenColor,
      roughness: 0.76,
      sheen: 0.62,
      sheenRoughness: 0.56,
      envMapIntensity: 0.55
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
      roughness: 0.04,
      metallic: 0.06,
      opacity,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ior: 1.52,
      envMapIntensity: 1.85
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
      envMapIntensity: 1.22
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
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.38
    })
  );
}

/** Dark-tinted smoked bubble windscreen (`material.physical`, WebGPU-safe `castShadow: false`). */
export function darkSmokeWindscreenMaterial(color = "#101826", opacity = 0.62): AuraMaterialSpec {
  return unnamed(
    material.physical({
      color,
      roughness: 0.04,
      metallic: 0.08,
      opacity,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ior: 1.52,
      envMapIntensity: 1.9
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
// Front wheel hub sits at `[0, 0.33, -0.74]` (R = 0.33 -> z in [-1.07, -0.41], y <= 0.66, |x| <= 0.095).
// Rear wheel hub sits at `[0, 0.33, +0.72]` (R = 0.33 -> z in [+0.39, +1.05], y <= 0.66, |x| <= 0.095).

const cachedBikeHullSlots = (() => {
  let cache: readonly MultiMatSlot[] | null = null;
  return (): readonly MultiMatSlot[] => {
    if (cache) return cache;
    const slots: MultiMatSlot[] = [];

    // Slot 0 (`liveryClearcoatMaterial` — Cobalt/Teal/Crimson GP livery with `rim` & `clearcoat: 1`):
    // 1A. Sculpted aerodynamic MotoGP nose cowl sweeping cleanly above the front wheel (y >= 0.68 over front tire)
    const noseCowlSections: V3[][] = [
      superEllipseRingZ(0.032, 0.022, 0.018, 0.70, -1.05, 16, 0.9),
      superEllipseRingZ(0.115, 0.052, 0.032, 0.725, -0.90, 16, 0.86),
      superEllipseRingZ(0.175, 0.072, 0.048, 0.75, -0.70, 16, 0.84),
      superEllipseRingZ(0.19, 0.078, 0.065, 0.755, -0.50, 16, 0.84),
      superEllipseRingZ(0.165, 0.055, 0.055, 0.74, -0.42, 16, 0.88)
    ];
    slots.push({ mesh: loftSectionsMesh(noseCowlSections, true, false), materialIndex: 0 });

    // 1B. Sculpted fuel tank with proud front shoulders (-0.36) narrowing into concave rider knee recesses (-0.08..+0.06)
    const fuelTankSections: V3[][] = [
      superEllipseRingZ(0.145, 0.065, 0.055, 0.725, -0.43, 16, 0.88),
      superEllipseRingZ(0.182, 0.105, 0.085, 0.735, -0.28, 16, 0.82),
      superEllipseRingZ(0.148, 0.095, 0.08, 0.73, -0.14, 16, 0.86),
      superEllipseRingZ(0.112, 0.075, 0.065, 0.71, -0.02, 16, 0.9),
      superEllipseRingZ(0.102, 0.048, 0.048, 0.695, 0.08, 16, 0.92)
    ];
    slots.push({ mesh: loftSectionsMesh(fuelTankSections, true, false), materialIndex: 0 });

    // 1C. Upswept sharp MotoGP wasp-tail cowl rising cleanly above the wide rear slick (y >= 0.72 over rear wheel)
    const tailCowlSections: V3[][] = [
      superEllipseRingZ(0.118, 0.048, 0.036, 0.725, 0.26, 16, 0.88),
      superEllipseRingZ(0.138, 0.068, 0.042, 0.765, 0.44, 16, 0.84),
      superEllipseRingZ(0.122, 0.064, 0.038, 0.80, 0.64, 16, 0.84),
      superEllipseRingZ(0.078, 0.042, 0.028, 0.825, 0.80, 16, 0.88),
      superEllipseRingZ(0.032, 0.022, 0.018, 0.835, 0.90, 16, 0.92)
    ];
    slots.push({ mesh: loftSectionsMesh(tailCowlSections, true, false), materialIndex: 0 });

    // Slot 1 (`accentCarPaintMaterial` — high-contrast racing stripes, side cheek fairings & knee sliders):
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.052, 0.018, 0.38, 0.006), {
        pos: [0, 0.832, -0.22],
        rot: [0.06, 0, 0]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.068, 0.018, 0.34, 0.006), {
        pos: [0, 0.852, 0.58],
        rot: [0.16, 0, 0]
      }),
      materialIndex: 1
    });

    // Slot 2 (`carbonLacquerMaterial` — dark gloss carbon-weave belly pan & close-fitting front fender hugger):
    // Belly pan sits strictly between front wheel (-0.41) and rear wheel (+0.39) so zero tire clipping occurs.
    const bellyPanSections: V3[][] = [
      superEllipseRingZ(0.078, 0.055, 0.045, 0.31, -0.37, 14, 0.86),
      superEllipseRingZ(0.138, 0.095, 0.072, 0.33, -0.20, 14, 0.8),
      superEllipseRingZ(0.142, 0.092, 0.075, 0.32, 0.04, 14, 0.8),
      superEllipseRingZ(0.112, 0.068, 0.055, 0.33, 0.25, 14, 0.86),
      superEllipseRingZ(0.065, 0.042, 0.035, 0.35, 0.34, 14, 0.9)
    ];
    slots.push({ mesh: loftSectionsMesh(bellyPanSections, true, false), materialIndex: 2 });

    // Carbon front fender arch hugging just above the front slick crown
    const fenderPts = catmullRomSpline3([
      [0, 0.625, -0.92],
      [0, 0.678, -0.76],
      [0, 0.642, -0.58]
    ], 5);
    slots.push({
      mesh: transformMesh(
        tubeSweepMesh(fenderPts.map((p) => [p[0], p[1], p[2], 0.088] as const), 12, false),
        { scale: [1.08, 0.22, 1] }
      ),
      materialIndex: 2
    });

    for (const side of [-1, 1] as const) {
      // Sculpted diagonal side cheek fairing panels sweeping from nose cowl down to mid-frame (no protruding pods!)
      const cheekSections: V3[][] = [
        superEllipseRingZ(0.018, 0.048, 0.042, 0, -0.58, 10, 0.86),
        superEllipseRingZ(0.024, 0.085, 0.078, -0.04, -0.36, 10, 0.84),
        superEllipseRingZ(0.02, 0.065, 0.058, -0.08, -0.18, 10, 0.88)
      ];
      slots.push({
        mesh: transformMesh(loftSectionsMesh(cheekSections, true, false), {
          pos: [side * 0.158, 0.61, 0],
          rot: [0, side * 0.06, -side * 0.12]
        }),
        materialIndex: 1
      });

      // Carbon tank knee-grip traction pads inside the tank recesses
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.016, 0.085, 0.22, 0.005), {
          pos: [side * 0.132, 0.72, -0.10],
          rot: [0, side * 0.14, 0]
        }),
        materialIndex: 5
      });

      // Slot 3 (`anisotropicAlloyMaterial` dark gunmetal):
      // Exposed twin-spar perimeter frame beam sweeping from steering head (-0.50, 0.73) to swingarm pivot (+0.16, 0.41)
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.088, 0.73, -0.50, 0.026],
            [side * 0.136, 0.59, -0.22, 0.032],
            [side * 0.132, 0.44, 0.08, 0.03],
            [side * 0.126, 0.39, 0.18, 0.028]
          ],
          10,
          false
        ),
        materialIndex: 3
      });
      // Exposed tubular rear subframe strut supporting the upswept tail cowl
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.118, 0.43, 0.16, 0.018],
            [side * 0.105, 0.60, 0.34, 0.016],
            [side * 0.092, 0.74, 0.52, 0.014]
          ],
          8,
          false
        ),
        materialIndex: 3
      });

      // Twin-sided sculpted dark gunmetal rear swingarm (|x| = 0.126 > 0.095 tire halfWidth -> clean hub clearance!)
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.126, 0.40, 0.16, 0.034],
            [side * 0.132, 0.385, 0.44, 0.032],
            [side * 0.122, 0.33, 0.72, 0.026]
          ],
          10,
          false
        ),
        materialIndex: 3
      });
      // Lower swingarm triangulation brace + machined rear axle carrier block
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.124, 0.35, 0.22, 0.018],
            [side * 0.128, 0.32, 0.48, 0.018],
            [side * 0.122, 0.33, 0.72, 0.018]
          ],
          8,
          false
        ),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028, 0.056, 0.075, 0.008), {
          pos: [side * 0.122, 0.33, 0.72]
        }),
        materialIndex: 3
      });

      // Rearset alloy footpeg hanger + knurled racing peg
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.055, 0.018, 0.024, 0.005), {
          pos: [side * 0.162, 0.365, 0.20]
        }),
        materialIndex: 3
      });

      // Slot 4 (`polishedTitaniumMaterial` anodized gold-titanium):
      // Inverted telescopic front fork outer tube & lower slider reaching cleanly to front wheel hub (-0.74, 0.33)
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.112, 0.755, -0.49, 0.025],
            [side * 0.115, 0.565, -0.605, 0.024]
          ],
          10,
          false
        ),
        materialIndex: 4
      });
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.115, 0.57, -0.60, 0.019],
            [side * 0.118, 0.33, -0.74, 0.019]
          ],
          10,
          false
        ),
        materialIndex: 3
      });
      // Radial front brake caliper mount at bottom of fork leg
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028, 0.068, 0.062, 0.008), {
          pos: [side * 0.114, 0.355, -0.70],
          rot: [0.46, 0, 0]
        }),
        materialIndex: 4
      });

      // Low MotoGP clip-on handlebar tube + black rubber grip (`[side * 0.25, 0.73, -0.42]`)
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.11, 0.748, -0.49, 0.015],
            [side * 0.19, 0.738, -0.45, 0.014],
            [side * 0.27, 0.724, -0.405, 0.014]
          ],
          8,
          false
        ),
        materialIndex: 4
      });
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.185, 0.739, -0.452, 0.02],
            [side * 0.275, 0.723, -0.402, 0.02]
          ],
          8,
          false
        ),
        materialIndex: 5
      });

      // Slot 6 (`evaThermalSuitMaterial` dark racing leathers):
      // Tucked MotoGP rider thigh hugging fuel tank recess -> knee -> shin -> boot tucked onto rearset footpeg!
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.088, 0.735, 0.17, 0.072],
            [side * 0.136, 0.565, -0.13, 0.062],
            [side * 0.148, 0.415, 0.16, 0.05]
          ],
          12,
          false
        ),
        materialIndex: 6
      });
      // Livery knee-slider puck on outer knee
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.026, 0.068, 0.088, 0.01), {
          pos: [side * 0.168, 0.555, -0.12],
          rot: [0.24, side * 0.12, 0]
        }),
        materialIndex: 1
      });
      // Sleek armored racing boot planted toes-down on rearset footpeg
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.078, 0.064, 0.185, 0.02), {
          pos: [side * 0.152, 0.39, 0.18],
          rot: [0.34, 0, 0]
        }),
        materialIndex: 5
      });

      // Slot 7 (`practicalIonGlowMaterial`): aggressive twin slanted LED endurance headlamps in nose cowl
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.056, 0.02, 0.042, 0.006), {
          pos: [side * 0.062, 0.708, -1.005],
          rot: [0.18, side * 0.22, -side * 0.18]
        }),
        materialIndex: 7
      });
    }

    // Machined upper & lower triple clamp bridges across steering head
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.022, 0.065, 0.006), {
        pos: [0, 0.752, -0.495],
        rot: [0.46, 0, 0]
      }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.245, 0.024, 0.068, 0.006), {
        pos: [0, 0.59, -0.585],
        rot: [0.46, 0, 0]
      }),
      materialIndex: 3
    });

    // Contoured black Alcantara MotoGP race saddle +ライダー pelvis bridge seamlessly meeting `torso`
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.205, 0.048, 0.28, 0.018), {
        pos: [0, 0.705, 0.18],
        rot: [0.08, 0, 0]
      }),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.195, 0.115, 0.19, 0.046), {
        pos: [0, 0.755, 0.16],
        rot: [0.28, 0, 0]
      }),
      materialIndex: 6
    });

    // Razor-thin vertical LED tail blade recessed in upswept wasp-tail tip
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.044, 0.036, 0.035, 0.008), {
        pos: [0, 0.832, 0.895],
        rot: [0.14, 0, 0]
      }),
      materialIndex: 7
    });

    cache = slots;
    return slots;
  };
})();

const cachedSkateHullSlots = (() => {
  let cache: readonly MultiMatSlot[] | null = null;
  return (): readonly MultiMatSlot[] => {
    if (cache) return cache;
    const slots: MultiMatSlot[] = [];

    // Twin-tip concave lunar gravity-skate aero deck (smooth normals)
    const deckSections: V3[][] = [
      superEllipseRingZ(0.06, 0.018, 0.016, 0.145, -0.56, 14, 0.85),
      superEllipseRingZ(0.165, 0.024, 0.022, 0.132, -0.38, 14, 0.78),
      superEllipseRingZ(0.185, 0.026, 0.028, 0.122, 0, 14, 0.74),
      superEllipseRingZ(0.165, 0.024, 0.022, 0.132, 0.38, 14, 0.78),
      superEllipseRingZ(0.075, 0.02, 0.018, 0.148, 0.56, 14, 0.85)
    ];
    slots.push({ mesh: loftSectionsMesh(deckSections, true, false), materialIndex: 0 });

    // Non-slip grip deck pad & side magnetic levitation rail bumpers
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.014, 0.74, 0.005), { pos: [0, 0.15, 0] }),
      materialIndex: 4
    });
    for (const side of [-1, 1] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.18, 0.13, -0.4, 0.016],
            [side * 0.195, 0.122, 0, 0.018],
            [side * 0.18, 0.13, 0.4, 0.016]
          ],
          8,
          false
        ),
        materialIndex: 1
      });
      // +Z Rear twin micro-ion thruster housings & glowing cores
      const microBell: V2[] = [
        [0.042, 0],
        [0.058, 0.08],
        [0.068, 0.14],
        [0.052, 0.14]
      ];
      slots.push({
        mesh: transformMesh(latheMesh(microBell, 14, false), {
          pos: [side * 0.11, 0.16, 0.36],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.065, 0.065, 0.04, 0.018), {
          pos: [side * 0.11, 0.16, 0.48]
        }),
        materialIndex: 6
      });
    }

    // Front & rear magnetic truck hangers + nose LED guide strip
    for (const zTruck of [-0.33, 0.33] as const) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.26, 0.04, 0.09, 0.01), { pos: [0, 0.095, zTruck] }),
        materialIndex: 2
      });
    }
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.13, 0.022, 0.04, 0.008), { pos: [0, 0.148, -0.54] }),
      materialIndex: 6
    });

    // Crouched EVA skater lower legs & magnetic boots planted in board stance
    const stance = [
      { foot: [-0.04, 0.2, -0.22] as V3, knee: [-0.08, 0.52, -0.18] as V3, hip: [-0.02, 0.82, -0.05] as V3, yaw: 0.34 },
      { foot: [0.05, 0.2, 0.22] as V3, knee: [0.08, 0.5, 0.16] as V3, hip: [0.02, 0.82, 0.06] as V3, yaw: -0.22 }
    ];
    for (const leg of stance) {
      slots.push({
        mesh: tubeSweepMesh(
          [
            [leg.hip[0], leg.hip[1], leg.hip[2], 0.082],
            [leg.knee[0], leg.knee[1], leg.knee[2], 0.068],
            [leg.foot[0], leg.foot[1], leg.foot[2], 0.056]
          ],
          12,
          false
        ),
        materialIndex: 5
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.105, 0.072, 0.22, 0.022), {
          pos: [leg.foot[0], 0.185, leg.foot[2]],
          rot: [0, leg.yaw, 0]
        }),
        materialIndex: 4
      });
    }
    // Pelvis bridge connecting stance legs cleanly into `torso`
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.16, 0.24, 0.055), { pos: [0, 0.84, 0] }),
      materialIndex: 5
    });

    cache = slots;
    return slots;
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

/** Builds the sleek Lunar GP racing motorcycle chassis (`rider-i-model`) with Cobalt/Crimson/Carbon contrast, exposed twin-spar frame, swingarm & forks. */
export function buildHoverBikeChassisNode(
  options: RiderVehicleNodeOptions
): GroupBuilder {
  const slots = cachedBikeHullSlots();
  const rimColor = options.isHero ? "#ffe2c4" : "#c8d0ef";
  const rimIntensity = options.isHero ? 0.28 : 0.34;
  const glowColor = options.isHero ? "#62e2ff" : "#ffae5c";
  const materials: readonly AuraMaterialSpec[] = [
    liveryClearcoatMaterial(options.primaryColor, rimColor, rimIntensity),
    accentCarPaintMaterial(options.accentColor),
    carbonLacquerMaterial("#151923"),
    anisotropicAlloyMaterial("#2b3340", 0.26),
    polishedTitaniumMaterial("#d6b265", 0.16),
    lunarRubberGripMaterial("#151820"),
    evaThermalSuitMaterial(options.suitColor, "#9aa6b8"),
    practicalIonGlowMaterial(glowColor, options.isHero ? 2.8 : 2.2)
  ];
  return assembleMultiMaterialNode(options.id, slots, materials, {
    id: options.id,
    castShadow: options.castShadow,
    receiveShadow: options.look === "original"
  });
}

/** Builds `rider-i-model` (`parts[0]`) with per-rider clearcoat livery (`material 0`) & `rim` highlight. */
export function createLunarRiderVehicleNode(
  options: RiderVehicleNodeOptions
): GroupBuilder {
  if (options.vehicle === "bike") {
    return buildHoverBikeChassisNode(options);
  }
  const slots = cachedSkateHullSlots();
  const rimColor = options.isHero ? "#ffe2c4" : "#c8d0ef";
  const rimIntensity = options.isHero ? 0.28 : 0.35;
  const glowColor = options.isHero ? "#7ae6ff" : "#ffae5c";
  const materials: readonly AuraMaterialSpec[] = [
    liveryClearcoatMaterial(options.primaryColor, rimColor, rimIntensity),
    accentCarPaintMaterial(options.accentColor),
    anisotropicAlloyMaterial("#3a4352", 0.27),
    polishedTitaniumMaterial("#cdd6e2", 0.15),
    lunarRubberGripMaterial("#141821"),
    evaThermalSuitMaterial(options.suitColor, "#9aa6b8"),
    practicalIonGlowMaterial(glowColor, options.isHero ? 2.9 : 2.2)
  ];
  return assembleMultiMaterialNode(options.id, slots, materials, {
    id: options.id,
    castShadow: options.castShadow,
    receiveShadow: options.look === "original"
  });
}

/** Builds the translucent cyan hologram `ghost-rider` for Time Trial best-lap playback. */
export function createGhostRiderNode(vehicle: Vehicle): PrimitiveBuilder {
  const slots = vehicle === "skate" ? cachedSkateHullSlots() : cachedBikeHullSlots();
  const merged = mergeRawMeshes(slots.map((s) => s.mesh));
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

/** Builds a wide MotoGP racing slick wheel centered on local `+Y` axle (`wheel` maps `+Y -> +Z` lateral axle). */
function buildMotoGpWheelSlots(radius: number, halfWidth: number, spokes: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const rimR = radius * 0.64;

  // Slot 0: Wide rounded MotoGP dark rubber racing slick tire (`latheMesh` around local +Y axle)
  const slickProfile: V2[] = [
    [rimR, -halfWidth * 0.82],
    [radius * 0.78, -halfWidth * 0.98],
    [radius * 0.91, -halfWidth],
    [radius * 0.975, -halfWidth * 0.68],
    [radius, -halfWidth * 0.26],
    [radius, halfWidth * 0.26],
    [radius * 0.975, halfWidth * 0.68],
    [radius * 0.91, halfWidth],
    [radius * 0.78, halfWidth * 0.98],
    [rimR, halfWidth * 0.82],
    [rimR * 0.94, halfWidth * 0.72],
    [rimR * 0.94, -halfWidth * 0.72],
    [rimR, -halfWidth * 0.82]
  ];
  slots.push({ mesh: latheMesh(slickProfile, 26, false), materialIndex: 0 });

  // Slot 1: Deep-dish machined alloy rim barrel + center hub + 5-spoke split turbine spokes
  const rimBarrel: V2[] = [
    [rimR * 0.88, -halfWidth * 0.72],
    [rimR * 0.98, -halfWidth * 0.76],
    [rimR * 0.98, halfWidth * 0.76],
    [rimR * 0.88, halfWidth * 0.72],
    [rimR * 0.88, -halfWidth * 0.72]
  ];
  slots.push({ mesh: latheMesh(rimBarrel, 22, false), materialIndex: 1 });

  const hubProfile: V2[] = [
    [0, -halfWidth * 0.86],
    [radius * 0.19, -halfWidth * 0.86],
    [radius * 0.22, -halfWidth * 0.45],
    [radius * 0.22, halfWidth * 0.45],
    [radius * 0.19, halfWidth * 0.86],
    [0, halfWidth * 0.86]
  ];
  slots.push({ mesh: latheMesh(hubProfile, 16, false), materialIndex: 1 });

  for (let s = 0; s < spokes; s += 1) {
    const baseAngle = (s / spokes) * Math.PI * 2;
    for (const branch of [-0.14, 0.14] as const) {
      const a0 = baseAngle + branch * 0.35;
      const a1 = baseAngle + branch;
      slots.push({
        mesh: tubeSweepMesh(
          [
            [Math.cos(a0) * radius * 0.19, 0, Math.sin(a0) * radius * 0.19, radius * 0.036],
            [Math.cos(a1) * rimR * 0.9, 0, Math.sin(a1) * rimR * 0.9, radius * 0.026]
          ],
          6,
          false
        ),
        materialIndex: 1
      });
    }
  }

  // Slot 2: Twin ventilated steel brake rotors flanking the hub
  for (const side of [-1, 1] as const) {
    const yDisc = side * halfWidth * 0.56;
    const rotorProfile: V2[] = [
      [radius * 0.26, yDisc - 0.008],
      [radius * 0.50, yDisc - 0.008],
      [radius * 0.50, yDisc + 0.008],
      [radius * 0.26, yDisc + 0.008],
      [radius * 0.26, yDisc - 0.008]
    ];
    slots.push({ mesh: latheMesh(rotorProfile, 20, false), materialIndex: 2 });
  }

  // Slot 3: Crisp glowing cyan/amber rim lip caliper accent ring on both wheel faces
  for (const side of [-1, 1] as const) {
    const yLip = side * halfWidth * 0.77;
    const accentRing: V2[] = [
      [rimR * 0.92, yLip - 0.006],
      [rimR * 1.01, yLip - 0.006],
      [rimR * 1.01, yLip + 0.006],
      [rimR * 0.92, yLip + 0.006],
      [rimR * 0.92, yLip - 0.006]
    ];
    slots.push({ mesh: latheMesh(accentRing, 22, false), materialIndex: 3 });
  }

  return slots;
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

    // Curved MotoGP dark-smoke double-bubble windscreen sweeping smoothly from nose cowl (+X) up & aft (-X)
    // `superEllipseRingZ` lofts along Z; rotating -90 deg about Y maps -Z -> +X (forward nose edge) and +Z -> -X (aft lip)
    const windscreenSections: V3[][] = [
      superEllipseRingZ(0.055, 0.012, 0.008, -0.045, -0.24, 12, 0.9),
      superEllipseRingZ(0.125, 0.042, 0.012, -0.005, -0.08, 12, 0.84),
      superEllipseRingZ(0.145, 0.058, 0.012, 0.038, 0.08, 12, 0.82),
      superEllipseRingZ(0.132, 0.048, 0.01, 0.068, 0.20, 12, 0.86)
    ];
    const fairingBike = mergeRawMeshes([
      transformMesh(loftSectionsMesh(windscreenSections, true, false), {
        rot: [0, -Math.PI * 0.5, 0]
      })
    ]);
    const fairingSkate = mergeRawMeshes([
      transformMesh(bevelBoxMesh(0.76, 0.04, 0.22, 0.014), { pos: [0, 0, 0] })
    ]);

    // Compact sleek anodized-titanium slash-cut exhaust/ion nozzle (`alongForward` maps +Y -> -X aft)
    const nozzleSleeveProfile: V2[] = [
      [0.032, -0.10],
      [0.038, -0.03],
      [0.045, 0.05],
      [0.048, 0.10],
      [0.041, 0.10],
      [0.034, 0.02],
      [0.032, -0.10]
    ];
    const nozzleCollarProfile: V2[] = [
      [0.044, 0.055],
      [0.050, 0.065],
      [0.050, 0.092],
      [0.045, 0.098],
      [0.044, 0.055]
    ];
    const nozzle: MultiMatSlot[] = [
      { mesh: latheMesh(nozzleSleeveProfile, 18, false), materialIndex: 0 },
      { mesh: latheMesh(nozzleCollarProfile, 18, false), materialIndex: 1 },
      {
        mesh: latheMesh(
          [
            [0, -0.01],
            [0.034, 0.02],
            [0.039, 0.088],
            [0, 0.095]
          ],
          14,
          false
        ),
        materialIndex: 2
      }
    ];

    const coneProfile = bezierCurve2([0.046, -0.15], [0.056, -0.04], [0.028, 0.09], [0.003, 0.21], 10);
    const machCone = mergeRawMeshes([latheMesh([[0, -0.15], ...coneProfile], 14, false)]);

    cache = {
      bikeFairing: fairingBike,
      skateFairing: fairingSkate,
      bikeWheel: buildMotoGpWheelSlots(0.33, 0.095, 5),
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
  const slots: MultiMatSlot[] = [];

  // Tapered athletic MotoGP racing leathers torso (`+X` chest toward tank, `-X` arched spine, `+Y` waist->neck, `+-Z` shoulders)
  const makeTorsoRing = (rxFront: number, rxBack: number, rz: number, cx: number, y: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const ca = Math.cos(a);
      const rx = ca >= 0 ? rxFront : rxBack;
      pts.push([cx + ca * rx, y, Math.sin(a) * rz]);
    }
    return pts;
  };
  slots.push({
    mesh: loftSectionsMesh(
      [
        makeTorsoRing(0.092, 0.095, 0.118, -0.015, -0.20),
        makeTorsoRing(0.108, 0.105, 0.145, 0.0, -0.06),
        makeTorsoRing(0.118, 0.112, 0.172, 0.01, 0.10),
        makeTorsoRing(0.088, 0.088, 0.118, 0.015, 0.22)
      ],
      true,
      false
    ),
    materialIndex: 0
  });

  // Compact sculpted aerodynamic MotoGP speed-hump tapering seamlessly down the spine (-X dorsal side; NO boxy backpack!)
  const speedHumpSections: V3[][] = [
    makeTorsoRing(0.018, 0.032, 0.045, -0.085, -0.14),
    makeTorsoRing(0.022, 0.062, 0.072, -0.10, 0.02),
    makeTorsoRing(0.024, 0.068, 0.078, -0.102, 0.14),
    makeTorsoRing(0.016, 0.036, 0.052, -0.082, 0.215)
  ];
  slots.push({
    mesh: loftSectionsMesh(speedHumpSections, true, false),
    materialIndex: 1
  });

  // Sleek contoured chest armor plate (+X front)
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.036, 0.14, 0.17, 0.014), { pos: [0.112, 0.05, 0] }),
    materialIndex: 1
  });

  for (const side of [-1, 1] as const) {
    // Titanium/livery MotoGP shoulder slider cups
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.078, 0.068, 0.052, 0.02), {
        pos: [0.015, 0.155, side * 0.182],
        rot: [side * 0.22, 0, -0.18]
      }),
      materialIndex: 1
    });

    if (tuckedBike) {
      // Articulated MotoGP tuck arm: shoulder -> low tucked elbow -> forearm -> racing glove gripping clip-on bar!
      slots.push({
        mesh: tubeSweepMesh(
          [
            [0.015, 0.16, side * 0.175, 0.052],
            [0.225, 0.105, side * 0.252, 0.046],
            [0.415, 0.142, side * 0.242, 0.038]
          ],
          12,
          false
        ),
        materialIndex: 0
      });
      // Armored racing gauntlet glove wrapped onto clip-on grip
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.095, 0.055, 0.065, 0.018), {
          pos: [0.43, 0.148, side * 0.24],
          rot: [0, -side * 0.14, 0.12]
        }),
        materialIndex: 2
      });
    } else {
      // Athletic crouched gravity-skate balance arms
      slots.push({
        mesh: tubeSweepMesh(
          [
            [0.015, 0.15, side * 0.175, 0.052],
            [0.14, 0.04, side * 0.23, 0.045],
            [0.27, -0.02, side * 0.20, 0.038]
          ],
          12,
          false
        ),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.09, 0.055, 0.065, 0.018), {
          pos: [0.29, -0.03, side * 0.195],
          rot: [0, -side * 0.15, -0.16]
        }),
        materialIndex: 2
      });
    }
  }
  return slots;
}

function buildMotoGpHelmetSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  // Aerodynamic full-face MotoGP racing helmet shell elongated fore-aft (`+X` pointed chin bar, `-X` rear aero spoiler)
  // Built via `superEllipseRingZ` (-Z chin -> +Z rear spoiler) rotated -90 deg about Y so -Z maps to +X forward!
  const helmetSections: V3[][] = [
    superEllipseRingZ(0.048, 0.038, 0.048, -0.035, -0.155, 16, 0.88),
    superEllipseRingZ(0.105, 0.095, 0.088, 0.0, -0.095, 16, 0.84),
    superEllipseRingZ(0.126, 0.125, 0.108, 0.012, -0.01, 16, 0.84),
    superEllipseRingZ(0.118, 0.118, 0.098, 0.018, 0.085, 16, 0.84),
    superEllipseRingZ(0.072, 0.068, 0.048, 0.032, 0.165, 16, 0.78),
    superEllipseRingZ(0.032, 0.022, 0.016, 0.042, 0.205, 16, 0.86)
  ];
  slots.push({
    mesh: transformMesh(loftSectionsMesh(helmetSections, true, false), {
      rot: [0, -Math.PI * 0.5, 0]
    }),
    materialIndex: 0
  });

  // Center crown racing stripe & rear aero diffuser lip (`accentColor`)
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.24, 0.022, 0.046, 0.008), {
      pos: [-0.015, 0.122, 0],
      rot: [0, 0, -0.08]
    }),
    materialIndex: 1
  });

  // Dark inner eyeport recess + chin-bar air vent (`lunarRubberGripMaterial`) so visor reads rich dark-gold, never hollow
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.08, 0.075, 0.19, 0.022), {
      pos: [0.088, 0.015, 0]
    }),
    materialIndex: 2
  });

  // Wraparound dark gold / iridescent MotoGP racing shield visor (+X forward face, `material.physical`, `castShadow: false`)
  const visorSections: V3[][] = [
    superEllipseRingZ(0.068, 0.036, 0.032, 0.012, -0.148, 14, 0.88),
    superEllipseRingZ(0.118, 0.048, 0.042, 0.018, -0.095, 14, 0.84),
    superEllipseRingZ(0.131, 0.045, 0.038, 0.022, -0.035, 14, 0.86)
  ];
  slots.push({
    mesh: transformMesh(loftSectionsMesh(visorSections, true, false), {
      rot: [0, -Math.PI * 0.5, 0]
    }),
    materialIndex: 3
  });
  return slots;
}

/** Builds wide dark racing slick wheel (`roughness: 0.78`, `#171a20`) with 5-spoke turbine rim & glowing caliper accent. */
export function buildBikeWheelNode(options: {
  readonly id: string;
  readonly vehicle?: Vehicle;
  readonly isHero: boolean;
}): GroupBuilder {
  const meshes = cachedSubPartMeshes();
  const glowHex = options.isHero ? "#52dcff" : "#ff9d42";
  return assembleMultiMaterialNode(
    options.id,
    options.vehicle === "skate" ? meshes.skateWheel : meshes.bikeWheel,
    [
      racingSlickTireMaterial("#171a20"),
      polishedTitaniumMaterial("#cdd6e2", 0.16),
      anisotropicAlloyMaterial("#586270", 0.28),
      practicalIonGlowMaterial(glowHex, options.isHero ? 2.1 : 1.7)
    ],
    { id: options.id, castShadow: false, receiveShadow: false }
  );
}

/** Builds compact sleek anodized-titanium exhaust / ion thruster nozzle tucked under the tail cowl. */
export function buildThrusterPodNode(options: {
  readonly id: string;
  readonly isHero: boolean;
}): GroupBuilder {
  const meshes = cachedSubPartMeshes();
  const glowHex = options.isHero ? "#52dcff" : "#ff9d42";
  return assembleMultiMaterialNode(
    options.id,
    meshes.nozzle,
    [
      anisotropicAlloyMaterial("#3b4554", 0.24),
      goldFoilMetalMaterial(),
      practicalIonGlowMaterial(glowHex, options.isHero ? 3.0 : 2.3)
    ],
    { id: options.id, castShadow: false, receiveShadow: false }
  );
}

/** Builds the MotoGP-tucked racing rider (`torso` with sculpted speed-hump or `visor` full-face helmet with dark-gold shield). */
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
  if (options.part === "visor") {
    const helmetShellHex = mixColorHex(options.liveryColor, "#141924", 0.28);
    const visorHex = options.isHero ? "#d89834" : "#6ec8e8";
    return assembleMultiMaterialNode(
      options.id,
      meshes.visorHelmet,
      [
        accentCarPaintMaterial(helmetShellHex),
        accentCarPaintMaterial(options.accentColor),
        lunarRubberGripMaterial("#0d1118"),
        goldReflectiveGlassMaterial(visorHex, 0.72)
      ],
      { id: options.id, castShadow: false, receiveShadow: false }
    );
  }
  return assembleMultiMaterialNode(
    options.id,
    options.vehicle === "skate" ? meshes.skateTorso : meshes.bikeTorso,
    [
      evaThermalSuitMaterial(options.suitColor, "#9aa6b8"),
      accentCarPaintMaterial(options.liveryColor),
      lunarRubberGripMaterial("#151820")
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
  const glowHex = options.isHero ? "#52dcff" : "#ff9d42";

  switch (options.kind) {
    case "fairing":
      return geometry
        .custom(options.vehicle === "skate" ? meshes.skateFairing : meshes.bikeFairing, {
          name: options.id,
          castShadow: false,
          receiveShadow: false,
          material: options.vehicle === "skate"
            ? accentCarPaintMaterial(options.liveryColor)
            : darkSmokeWindscreenMaterial("#101826", 0.62)
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
              color: options.isHero ? "#8ce8ff" : "#ffbe73",
              emissive: glowHex,
              emissiveIntensity: options.isHero ? 3.2 : 2.4,
              roughness: 0.14,
              opacity: 0.84,
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
    ? stratifiedCliffMesh({ radiusX: 0.23, radiusZ: 0.22, height: 1, terraces: 5, seed: options.seed })
    : normalizeMeshGroundedUnit(icosphereFacetMesh(0.5, 1, 0.24, options.seed));
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

/** Tumbling lunar chondrite meteoroid collectible (`rock-${id}`, diameter ~2.0 m centered at origin). */
export function createMeteorRockNode(id: number): GroupBuilder {
  const seed = 101 + id * 37;
  const crust = icosphereFacetMesh(0.96, 1, 0.22, seed);
  const inclusionA = transformMesh(icosphereFacetMesh(0.38, 0, 0.14, seed + 7), { pos: [0.46, 0.24, -0.28] });
  const inclusionB = transformMesh(icosphereFacetMesh(0.32, 0, 0.14, seed + 19), { pos: [-0.42, -0.28, 0.34] });
  const fissure = transformMesh(bevelBoxMesh(1.36, 0.08, 0.42, 0.02), { rot: [0.4, id * 0.7, -0.3] });
  return assembleMultiMaterialNode(
    `rock-${id}`,
    [
      { mesh: crust, materialIndex: 0 },
      { mesh: inclusionA, materialIndex: 1 },
      { mesh: inclusionB, materialIndex: 1 },
      { mesh: fissure, materialIndex: 2 }
    ],
    [
      regolithBasaltMaterial("#685d66", 0.9),
      polishedTitaniumMaterial("#9ba5b4", 0.26),
      practicalIonGlowMaterial("#f2a855", 1.9)
    ],
    { id: `rock-${id}`, castShadow: false, receiveShadow: false }
  );
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
      rimBoulder: mergeRawMeshes([normalizeMeshGroundedUnit(icosphereFacetMesh(0.5, 1, 0.24, 17))]),
      rimSpire: mergeRawMeshes([
        stratifiedCliffMesh({ radiusX: 0.24, radiusZ: 0.22, height: 1, terraces: 5, seed: 31 })
      ]),
      rimMoonRock: mergeRawMeshes([normalizeMeshGroundedUnit(icosphereFacetMesh(0.5, 1, 0.28, 73))]),
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
