/**
 * Craterline GP (`examples/strange-orbit-port`) — 100% Native `@aura3d/engine` 5.5.1
 * Multi-Material Procedural 3D Vehicles, EVA Riders, Lunar GP Track & Colony Props (`WP-19`).
 *
 * Replaces all 9 static single-mesh Meshy clay `.glb` mounts and raw cone/box placeholders
 * with smooth lofted hoverbikes & gravity-skates, articulated EVA spacesuit riders with
 * gold-tinted `material.physical` bubble visors, open `latticeTrussMesh` start/finish gantries,
 * geodesic lunar habitat domes, parabolic `latheMesh` deep-space comms dishes, solar-panel
 * arrays, Apollo descent landers, domed observatories, rover service trailers, pressurized
 * cryo-fuel tanks, and stratified regolith boulders & basalt spires. Zero `three` imports.
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
// 1. Lunar Hoverbike + Gravity-Skate + Seated EVA Lower Body (`rider-i-model`)
// ---------------------------------------------------------------------------

const cachedBikeHullSlots = (() => {
  let cache: readonly MultiMatSlot[] | null = null;
  return (): readonly MultiMatSlot[] => {
    if (cache) return cache;
    const slots: MultiMatSlot[] = [];

    // Main aerodynamic twin-turbine fuselage cowling (smooth normals: flatShaded = false)
    const fuselageSections: V3[][] = [
      superEllipseRingZ(0.035, 0.035, 0.03, 0.58, -1.12, 16, 0.92),
      superEllipseRingZ(0.13, 0.12, 0.09, 0.62, -0.84, 16, 0.88),
      superEllipseRingZ(0.21, 0.21, 0.14, 0.66, -0.46, 16, 0.84),
      superEllipseRingZ(0.19, 0.24, 0.16, 0.65, -0.14, 16, 0.86),
      superEllipseRingZ(0.16, 0.13, 0.15, 0.56, 0.18, 16, 0.9),
      superEllipseRingZ(0.24, 0.17, 0.14, 0.53, 0.58, 16, 0.82),
      superEllipseRingZ(0.21, 0.13, 0.1, 0.51, 0.88, 16, 0.86)
    ];
    slots.push({ mesh: loftSectionsMesh(fuselageSections, true, false), materialIndex: 0 });

    // Sculpted nose canard winglets & side intake pods (smooth normals)
    const canardPoly: V2[] = [
      [0, -0.02],
      [0.24, -0.05],
      [0.26, 0.01],
      [0.05, 0.035]
    ];
    for (const side of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(extrudePolygonMesh(canardPoly, 0.22, 0.012, false), {
          pos: [side * 0.1, 0.58, -0.82],
          rot: [0.12, side * 0.18, -side * 0.14],
          scale: [side, 1, 1]
        }),
        materialIndex: 1
      });

      const podSections: V3[][] = [
        superEllipseRingZ(0.055, 0.075, 0.065, 0, -0.48, 12, 0.85),
        superEllipseRingZ(0.085, 0.105, 0.09, 0, -0.16, 12, 0.82),
        superEllipseRingZ(0.075, 0.095, 0.08, 0, 0.34, 12, 0.85),
        superEllipseRingZ(0.045, 0.06, 0.05, 0, 0.66, 12, 0.9)
      ];
      slots.push({
        mesh: transformMesh(loftSectionsMesh(podSections, true, false), {
          pos: [side * 0.22, 0.49, 0]
        }),
        materialIndex: 0
      });

      // Radiator louvers inside each side intake pod
      for (let l = 0; l < 4; l += 1) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.09, 0.018, 0.08, 0.004), {
            pos: [side * 0.275, 0.53 - l * 0.034, -0.34 + l * 0.055],
            rot: [0.38, 0, 0]
          }),
          materialIndex: 2
        });
      }

      // Raked front vane forks + telescopic fork stanchions + rear swingarm + ventral hover skid
      const vanePoly: V2[] = [
        [-0.04, -0.24],
        [0.045, -0.24],
        [0.065, 0.22],
        [-0.025, 0.24]
      ];
      slots.push({
        mesh: transformMesh(extrudePolygonMesh(vanePoly, 0.032, 0.008, false), {
          pos: [side * 0.105, 0.55, -0.58],
          rot: [0.56, Math.PI * 0.5, 0]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.095, 0.82, -0.43, 0.024],
            [side * 0.105, 0.56, -0.58, 0.022],
            [side * 0.105, 0.34, -0.72, 0.02]
          ],
          10,
          false
        ),
        materialIndex: 3
      });
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.11, 0.47, 0.22, 0.032],
            [side * 0.125, 0.39, 0.48, 0.028],
            [side * 0.115, 0.34, 0.72, 0.024]
          ],
          10,
          false
        ),
        materialIndex: 2
      });
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.14, 0.13, -0.44, 0.018],
            [side * 0.15, 0.1, -0.1, 0.02],
            [side * 0.15, 0.1, 0.32, 0.02],
            [side * 0.13, 0.15, 0.54, 0.016]
          ],
          8,
          false
        ),
        materialIndex: 2
      });

      // +Z Rear twin ion thruster outer nacelle bells & glowing plasma rings
      const shroudProfile: V2[] = [
        [0.068, 0],
        [0.095, 0.05],
        [0.108, 0.16],
        [0.116, 0.24],
        [0.096, 0.24],
        [0.082, 0.08]
      ];
      slots.push({
        mesh: transformMesh(latheMesh(shroudProfile, 18, false), {
          pos: [side * 0.13, 0.5, 0.74],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 3
      });
      const coreProfile: V2[] = [
        [0, 0.02],
        [0.076, 0.04],
        [0.084, 0.18],
        [0, 0.21]
      ];
      slots.push({
        mesh: transformMesh(latheMesh(coreProfile, 16, false), {
          pos: [side * 0.13, 0.5, 0.78],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 6
      });

      // Seated articulated EVA rider lower leg (hip -> knee -> boot on alloy footpeg)
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.105, 0.74, 0.12, 0.078],
            [side * 0.165, 0.62, -0.14, 0.068],
            [side * 0.175, 0.42, 0.03, 0.058],
            [side * 0.165, 0.35, 0.09, 0.052]
          ],
          12,
          false
        ),
        materialIndex: 5
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.095, 0.075, 0.21, 0.022), {
          pos: [side * 0.168, 0.33, 0.04],
          rot: [0.18, 0, 0]
        }),
        materialIndex: 4
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.09, 0.022, 0.05, 0.006), {
          pos: [side * 0.185, 0.3, 0.06]
        }),
        materialIndex: 3
      });
    }

    // Swept clip-on handlebars, rubber grips, contoured saddle & nose LED headlamp
    const barPts = catmullRomSpline3([
      [-0.33, 0.87, -0.34],
      [-0.17, 0.92, -0.43],
      [0, 0.91, -0.46],
      [0.17, 0.92, -0.43],
      [0.33, 0.87, -0.34]
    ], 6);
    slots.push({
      mesh: tubeSweepMesh(barPts.map((p) => [p[0], p[1], p[2], 0.019] as const), 10, false),
      materialIndex: 3
    });
    for (const side of [-1, 1] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [
            [side * 0.21, 0.9, -0.4, 0.026],
            [side * 0.34, 0.865, -0.335, 0.026]
          ],
          10,
          false
        ),
        materialIndex: 4
      });
    }
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.075, 0.42, 0.028), {
        pos: [0, 0.72, 0.16],
        rot: [-0.08, 0, 0]
      }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.16, 0.05, 0.07, 0.016), {
        pos: [0, 0.6, -1.07],
        rot: [0.22, 0, 0]
      }),
      materialIndex: 6
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

/** Builds `rider-i-model` (`parts[0]`) with per-rider clearcoat livery (`material 0`) & `rim` highlight. */
export function createLunarRiderVehicleNode(
  options: RiderVehicleNodeOptions
): GroupBuilder {
  const slots = options.vehicle === "skate" ? cachedSkateHullSlots() : cachedBikeHullSlots();
  const rimColor = options.isHero ? "#ffe2c4" : "#c8d0ef";
  const rimIntensity = options.isHero ? 0.28 : 0.35;
  const glowColor = options.isHero ? "#7ae6ff" : "#ffae5c";
  const materials: readonly AuraMaterialSpec[] = [
    liveryClearcoatMaterial(options.primaryColor, rimColor, rimIntensity),
    accentCarPaintMaterial(options.accentColor),
    anisotropicAlloyMaterial("#8c97a6", 0.27),
    polishedTitaniumMaterial("#e2eaf3", 0.13),
    lunarRubberGripMaterial("#141821"),
    evaThermalSuitMaterial(options.suitColor, "#f7f2ea"),
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

const cachedSubPartMeshes = (() => {
  let cache: {
    readonly bikeFairing: AuraCustomGeometrySpec;
    readonly skateFairing: AuraCustomGeometrySpec;
    readonly bikeWheel: readonly MultiMatSlot[];
    readonly skateWheel: readonly MultiMatSlot[];
    readonly nozzle: readonly MultiMatSlot[];
    readonly machCone: AuraCustomGeometrySpec;
    readonly torso: readonly MultiMatSlot[];
    readonly visorHelmet: readonly MultiMatSlot[];
  } | null = null;

  const buildGyroWheel = (radius: number, halfWidth: number, spokes: number): MultiMatSlot[] => {
    // `wheelAssemblySlots` builds axle along X; rotate -90 deg about Z so axle aligns along +Y for `wheelSpin`
    const raw = wheelAssemblySlots({
      radius,
      width: halfWidth * 2,
      spokeCount: spokes,
      tireMat: 0,
      rimMat: 1,
      rotorMat: 2
    }).map((s) => ({
      mesh: transformMesh(s.mesh, { rot: [0, 0, Math.PI * 0.5] }),
      materialIndex: s.materialIndex
    }));
    const glowRing: V2[] = [
      [radius * 0.56, -halfWidth * 0.72],
      [radius * 0.64, -halfWidth * 0.72],
      [radius * 0.64, halfWidth * 0.72],
      [radius * 0.56, halfWidth * 0.72]
    ];
    raw.push({ mesh: latheMesh(glowRing, 18, false), materialIndex: 3 });
    return raw;
  };

  return () => {
    if (cache) return cache;

    const fairingBike = mergeRawMeshes([
      transformMesh(
        loftSectionsMesh(
          [
            superEllipseRingZ(0.03, 0.025, 0.02, 0, -0.44, 10, 0.9),
            superEllipseRingZ(0.11, 0.06, 0.045, 0.01, -0.08, 10, 0.84),
            superEllipseRingZ(0.085, 0.048, 0.035, 0, 0.42, 10, 0.88)
          ],
          true,
          false
        ),
        { rot: [0, -Math.PI * 0.5, 0] }
      )
    ]);
    const fairingSkate = mergeRawMeshes([
      transformMesh(bevelBoxMesh(0.76, 0.04, 0.22, 0.014), { pos: [0, 0, 0] })
    ]);

    const nozzleProfile: V2[] = [
      [0.042, -0.11],
      [0.036, -0.04],
      [0.052, 0.04],
      [0.068, 0.11],
      [0.054, 0.11],
      [0.038, 0.02]
    ];
    const nozzle: MultiMatSlot[] = [
      { mesh: latheMesh(nozzleProfile, 16, false), materialIndex: 0 },
      {
        mesh: latheMesh(
          [
            [0, -0.02],
            [0.044, 0.02],
            [0.05, 0.095],
            [0, 0.105]
          ],
          14,
          false
        ),
        materialIndex: 1
      }
    ];

    const coneProfile = bezierCurve2([0.068, -0.18], [0.082, -0.05], [0.038, 0.1], [0.003, 0.24], 10);
    const machCone = mergeRawMeshes([latheMesh([[0, -0.18], ...coneProfile], 14, false)]);

    cache = {
      bikeFairing: fairingBike,
      skateFairing: fairingSkate,
      bikeWheel: buildGyroWheel(0.29, 0.055, 6),
      skateWheel: buildGyroWheel(0.095, 0.042, 5),
      nozzle,
      machCone,
      torso: buildEvaTorsoSlots(),
      visorHelmet: buildEvaHelmetSlots()
    };
    return cache;
  };
})();

function buildEvaTorsoSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  // Smooth lofted EVA thermal suit torso (rig axes: +X forward chest, +Y up, +Z shoulders)
  const makeTorsoRing = (rx: number, rz: number, y: number): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      pts.push([Math.cos(a) * rx, y, Math.sin(a) * rz]);
    }
    return pts;
  };
  slots.push({
    mesh: loftSectionsMesh(
      [
        makeTorsoRing(0.11, 0.145, -0.22),
        makeTorsoRing(0.135, 0.175, -0.06),
        makeTorsoRing(0.15, 0.205, 0.12),
        makeTorsoRing(0.11, 0.145, 0.24)
      ],
      true,
      false
    ),
    materialIndex: 0
  });

  // Contoured `clearcoatPaint` chest telemetry pack (+X front) & shoulder pauldrons
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.065, 0.18, 0.21, 0.018), { pos: [0.145, 0.05, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.018, 0.045, 0.11, 0.005), { pos: [0.18, 0.08, 0] }),
    materialIndex: 3
  });

  // Dorsal PLSS life-support backpack (-X back) + twin `latheMesh` cryo O2 cylinders
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.13, 0.31, 0.26, 0.024), { pos: [-0.165, 0.04, 0] }),
    materialIndex: 2
  });
  const tankProf: V2[] = [
    [0, -0.14],
    [0.048, -0.12],
    [0.052, 0],
    [0.048, 0.12],
    [0, 0.14]
  ];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(tankProf, 14, false), { pos: [-0.215, 0.03, side * 0.072] }),
      materialIndex: 2
    });
    // Articulated EVA shoulder -> elbow -> gauntlet reaching forward toward handlebars
    slots.push({
      mesh: tubeSweepMesh(
        [
          [0.02, 0.16, side * 0.21, 0.064],
          [0.18, 0.04, side * 0.25, 0.055],
          [0.34, -0.04, side * 0.21, 0.048]
        ],
        12,
        false
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.075, 0.08, 0.02), {
        pos: [0.37, -0.05, side * 0.2],
        rot: [0, -side * 0.15, -0.2]
      }),
      materialIndex: 1
    });
  }
  return slots;
}

function buildEvaHelmetSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  // Smooth pressurized EVA helmet shell (`latheMesh` with smooth normals)
  const shellProf: V2[] = [
    [0, -0.13],
    [0.118, -0.12],
    [0.148, -0.04],
    [0.154, 0.04],
    [0.132, 0.115],
    [0.075, 0.152],
    [0, 0.162]
  ];
  slots.push({ mesh: latheMesh(shellProf, 20, false), materialIndex: 0 });

  // Anodized neck disconnect ring + dorsal crest fin + ear comms pods
  const ringProf: V2[] = [
    [0.105, -0.138],
    [0.136, -0.138],
    [0.138, -0.108],
    [0.108, -0.108]
  ];
  slots.push({ mesh: latheMesh(ringProf, 18, false), materialIndex: 2 });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.22, 0.036, 0.044, 0.012), { pos: [-0.02, 0.142, 0] }),
    materialIndex: 1
  });
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.085, 0.085, 0.036, 0.012), { pos: [0, 0.01, side * 0.152] }),
      materialIndex: 2
    });
  }

  // Forward-facing panoramic gold-reflective bubble visor (+X face, smooth normals)
  const visorProf: V2[] = [
    [0, 0.01],
    [0.095, 0.025],
    [0.132, 0.068],
    [0.138, 0.115],
    [0.112, 0.135]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(visorProf, 20, false), {
      pos: [0.055, 0.012, 0],
      rot: [0, 0, -Math.PI * 0.5]
    }),
    materialIndex: 3
  });
  return slots;
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
  const glowHex = options.isHero ? "#66dcff" : "#ff9d42";

  switch (options.kind) {
    case "fairing":
      return geometry
        .custom(options.vehicle === "skate" ? meshes.skateFairing : meshes.bikeFairing, {
          name: options.id,
          castShadow: false,
          receiveShadow: false,
          material: accentCarPaintMaterial(options.liveryColor)
        })
        .runtime({ id: options.id });

    case "wheelF":
    case "wheelR":
      return assembleMultiMaterialNode(
        options.id,
        options.vehicle === "skate" ? meshes.skateWheel : meshes.bikeWheel,
        [
          lunarRubberGripMaterial("#12161f"),
          polishedTitaniumMaterial("#e4ecf5", 0.12),
          anisotropicAlloyMaterial("#6d7785", 0.32),
          practicalIonGlowMaterial(glowHex, options.isHero ? 2.4 : 1.8)
        ],
        { id: options.id, castShadow: false, receiveShadow: false }
      );

    case "nozzleL":
    case "nozzleR":
      return assembleMultiMaterialNode(
        options.id,
        meshes.nozzle,
        [
          anisotropicAlloyMaterial("#8e99a8", 0.24),
          practicalIonGlowMaterial(glowHex, options.isHero ? 3.1 : 2.3)
        ],
        { id: options.id, castShadow: false, receiveShadow: false }
      );

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
      return assembleMultiMaterialNode(
        options.id,
        meshes.torso,
        [
          evaThermalSuitMaterial(options.suitColor, "#f6f0e6"),
          accentCarPaintMaterial(options.liveryColor),
          lunarCeramicMaterial("#e8e4dc"),
          practicalIonGlowMaterial(glowHex, 2.2)
        ],
        { id: options.id, castShadow: false, receiveShadow: false }
      );

    case "visor":
    default:
      return assembleMultiMaterialNode(
        options.id,
        meshes.visorHelmet,
        [
          lunarCeramicMaterial("#f2efe9"),
          accentCarPaintMaterial(options.accentColor),
          polishedTitaniumMaterial("#cfd8e3", 0.16),
          goldReflectiveGlassMaterial("#ffd8a8", 0.45)
        ],
        { id: options.id, castShadow: false, receiveShadow: false }
      );
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

/** Geodesic Lunar Habitat Dome with regolith berm, arch ribs, airlock & gold `material.physical` skylight. */
export function createLunarHabitatDomeNode(options: {
  readonly name: string;
  readonly position: V3;
  readonly rotation: V3;
  readonly scale?: number;
}): GroupBuilder {
  const slots: MultiMatSlot[] = [
    // Sintered regolith radiation-shield berm (`y = 0..1.15`) + ceramic lower pressure wall
    { mesh: latheMesh([[0, 0], [5.4, 0], [4.95, 1.05], [4.35, 1.15], [0, 1.15]], 24, false), materialIndex: 0 },
    { mesh: latheMesh([[4.3, 1.0], [4.25, 2.35], [3.65, 3.35], [2.55, 4.15], [0, 4.2]], 24, false), materialIndex: 1 },
    // Pressurized EVA airlock vestibule (+X) + amber hatch beacon
    { mesh: transformMesh(bevelBoxMesh(2.5, 2.15, 2.1, 0.22), { pos: [4.65, 1.15, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 1.55, 1.25, 0.1), { pos: [5.88, 1.05, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.26, 0.22, 0.48, 0.05), { pos: [5.75, 2.3, 0] }), materialIndex: 3 }
  ];
  // 6 geodesic meridian structural arch ribs (`tubeSweepMesh`)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const archPts: (readonly [number, number, number, number])[] = [];
    for (let k = 0; k <= 8; k += 1) {
      const th = (k / 8) * Math.PI;
      const r = Math.cos(th) * 4.32;
      const y = 1.05 + Math.sin(th) * 3.85;
      archPts.push([ca * r, y, sa * r, 0.11]);
    }
    slots.push({ mesh: tubeSweepMesh(archPts, 8, false), materialIndex: 2 });
  }
  const body = assembleMultiMaterialNode(
    `${options.name}-shell`,
    slots,
    [
      regolithBasaltMaterial("#6b5852", 0.93),
      lunarCeramicMaterial("#f1ece2"),
      anisotropicAlloyMaterial("#9aa5b5", 0.26),
      practicalIonGlowMaterial("#ecb75f", 2.7)
    ],
    { castShadow: false, receiveShadow: false }
  );
  // Smooth `latheMesh` gold-tinted `material.physical` crown viewport (`castShadow: false`)
  const crownGlass = geometry.custom(
    mergeRawMeshes([
      latheMesh([[2.62, 4.05], [1.95, 4.55], [1.05, 4.82], [0, 4.92]], 24, false)
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
