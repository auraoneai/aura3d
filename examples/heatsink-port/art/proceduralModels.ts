/**
 * WP-23: Ion Circuit (`heatsink-port`) Procedural Multi-Material Asset Library.
 *
 * Pure TypeScript procedural 3D sculpting module built on `@aura3d/engine` (`geometry.custom`,
 * `geometry.multiMaterial`, `instances.custom`, physical `material.*` presets) and
 * `apps/showcase-port-shared/proceduralKernel.ts` with zero `.glb` dependencies and zero `three` imports.
 */
import {
  geometry,
  instances,
  material,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";

export type ProceduralNodeBuilder = AuraNodeBuilder<AuraSceneNode>;

export interface ScenerySpot {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly scale: number;
}

export interface SceneryBuckets {
  readonly caps: readonly ScenerySpot[];
  readonly corals: readonly ScenerySpot[];
  readonly ruins: readonly ScenerySpot[];
  readonly arches: readonly ScenerySpot[];
}

export interface PylonTransform {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
}

// ---------------------------------------------------------------------------
// Physical Multi-Material Library (>= 8 distinct @aura3d/engine factories)
// ---------------------------------------------------------------------------

/** Hero AG racer clearcoat copper-orange fuselage (`practical: true` for live 8-step heat emissive updates). */
const MAT_HULL_COPPER: AuraMaterialSpec = material.clearcoatPaint({
  color: "#cf682e",
  roughness: 0.18,
  metallic: 0.74,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.65,
  emissive: "#102830",
  emissiveIntensity: 0.06,
  practical: true
});

/** Secondary automotive racing paint for vector airbrakes and interceptor cowlings. */
const MAT_FLAP_CARPAINT: AuraMaterialSpec = material.carPaint({
  color: "#d46a2c",
  roughness: 0.2,
  metallic: 0.72,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.65
});

const MAT_INTERCEPTOR_CRIMSON: AuraMaterialSpec = material.carPaint({
  color: "#b8282c",
  roughness: 0.22,
  metallic: 0.68,
  clearcoat: 0.92,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.5
});

/** Anisotropic machined titanium for rotor blades, heat-exchanger fins, and thruster collars. */
const MAT_TITANIUM_BRUSHED: AuraMaterialSpec = material.brushedMetal({
  color: "#d6e2ee",
  roughness: 0.22,
  anisotropy: 0.88,
  envMapIntensity: 1.65
});

/** Dark gunmetal studio alloy for magnetic-levitation nacelles, gunship armor, and rotary barrels. */
const MAT_GUNMETAL_STUDIO: AuraMaterialSpec = material.studioMetal({
  color: "#2a3342",
  roughness: 0.28,
  metallic: 0.92,
  envMapIntensity: 1.45
});

/** Polished copper-bronze heat-pipe manifold alloy. */
const MAT_HEATPIPE_COPPER: AuraMaterialSpec = material.metal({
  color: "#df8848",
  roughness: 0.18,
  metallic: 0.96,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.55
});

/** Vibration-damping vulcanized rubber for blast-bumper chimes and actuator seals. */
const MAT_SEAL_RUBBER: AuraMaterialSpec = material.blackRubber({
  color: "#171a21",
  roughness: 0.86
});

/** WebGPU-safe tinted cockpit canopy & cryo-coolant containment glass (never castShadow). */
const MAT_CANOPY_GLASS: AuraMaterialSpec = material.physical({
  color: "#80e8ff",
  roughness: 0.04,
  opacity: 0.42,
  clearcoat: 1,
  ior: 1.52
});

/** Practical plasma, shield, repair, and target optic emissives. */
const MAT_PLASMA_CYAN: AuraMaterialSpec = material.emissive({
  color: "#0b2230",
  emissive: "#40e0ff",
  emissiveIntensity: 2.6,
  roughness: 0.2,
  practical: true
});

const MAT_PLASMA_AMBER: AuraMaterialSpec = material.emissive({
  color: "#2a1406",
  emissive: "#ff9a2e",
  emissiveIntensity: 2.5,
  roughness: 0.22,
  practical: true
});

const MAT_OPTIC_CRIMSON: AuraMaterialSpec = material.emissive({
  color: "#2c080a",
  emissive: "#ff4838",
  emissiveIntensity: 2.7,
  roughness: 0.18,
  practical: true
});

const MAT_REPAIR_EMERALD: AuraMaterialSpec = material.emissive({
  color: "#082818",
  emissive: "#4dff9e",
  emissiveIntensity: 2.4,
  roughness: 0.2,
  practical: true
});

/** Instanced-safe (`clearcoat: 0, sheen: 0`) canyon basalt, mineral strata, and reactor architecture materials. */
const MAT_INST_BASALT: AuraMaterialSpec = material.pbr({
  color: "#242c38",
  roughness: 0.84,
  metallic: 0.08,
  clearcoat: 0,
  sheen: 0
});

const MAT_INST_MINERAL_CAP: AuraMaterialSpec = material.pbr({
  color: "#3d6b72",
  roughness: 0.62,
  metallic: 0.18,
  emissive: "#123840",
  emissiveIntensity: 0.08,
  clearcoat: 0,
  sheen: 0
});

const MAT_INST_REACTOR_SHELL: AuraMaterialSpec = material.pbr({
  color: "#384354",
  roughness: 0.52,
  metallic: 0.36,
  clearcoat: 0,
  sheen: 0
});

const MAT_INST_PYLON_ALLOY: AuraMaterialSpec = material.metal({
  color: "#313c4e",
  roughness: 0.28,
  metallic: 0.92,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.35
});

const MAT_INST_CHEVRON_CYAN: AuraMaterialSpec = material.pbr({
  color: "#163848",
  roughness: 0.24,
  metallic: 0.2,
  emissive: "#40e0ff",
  emissiveIntensity: 2.35,
  practical: true,
  clearcoat: 0,
  sheen: 0
});

const MAT_INST_CRYO_VIOLET: AuraMaterialSpec = material.pbr({
  color: "#231a3e",
  roughness: 0.3,
  metallic: 0.16,
  emissive: "#8a68ff",
  emissiveIntensity: 2.1,
  practical: true,
  clearcoat: 0,
  sheen: 0
});

// ---------------------------------------------------------------------------
// 1. Hero Ion-Circuit AG Strike Craft (Smooth-Normal Fuselage, Nacelles, Canopy)
// ---------------------------------------------------------------------------

/** Cross-section ring helper for aerodynamic chined hulls (`Z` longitudinal: `-Z` nose, `+Z` tail). */
function chinedHullRing(z: number, halfW: number, deckY: number, bellyY: number, chineY: number, crown = 0.08): V3[] {
  return [
    [0, deckY + crown, z],
    [halfW * 0.46, deckY, z],
    [halfW * 0.86, chineY + (deckY - chineY) * 0.38, z],
    [halfW, chineY, z],
    [halfW * 0.78, bellyY + (chineY - bellyY) * 0.28, z],
    [halfW * 0.34, bellyY, z],
    [0, bellyY - 0.02, z],
    [-halfW * 0.34, bellyY, z],
    [-halfW * 0.78, bellyY + (chineY - bellyY) * 0.28, z],
    [-halfW, chineY, z],
    [-halfW * 0.86, chineY + (deckY - chineY) * 0.38, z],
    [-halfW * 0.46, deckY, z]
  ];
}
/**
 * Primary copper-clearcoat AG strike craft hull (`name: "drone-hull"`).
 * Built as a single smooth-normal `geometry.custom` mesh so `node("drone-hull").setEmissive(hex, k)`
 * drives 8-step hull heat glow directly at runtime and `castShadow: casts` sits on the root node.
 */
export function buildDroneHullNode(lite = false, casts = false): ProceduralNodeBuilder {
  const hullSections: V3[][] = [
    chinedHullRing(-2.12, 0.05, 0.01, -0.02, -0.005, 0.01),
    chinedHullRing(-1.78, 0.21, 0.09, -0.09, 0.0, 0.03),
    chinedHullRing(-1.26, 0.42, 0.21, -0.16, 0.02, 0.06),
    chinedHullRing(-0.62, 0.58, 0.30, -0.21, 0.04, 0.08),
    chinedHullRing(0.08, 0.68, 0.33, -0.23, 0.05, 0.09),
    chinedHullRing(0.76, 0.74, 0.31, -0.22, 0.04, 0.08),
    chinedHullRing(1.36, 0.68, 0.27, -0.19, 0.03, 0.06),
    chinedHullRing(1.82, 0.56, 0.22, -0.15, 0.02, 0.04),
    chinedHullRing(2.06, 0.46, 0.16, -0.11, 0.01, 0.02)
  ];
  const fuselage = loftSectionsMesh(hullSections, true, false);

  const parts: RawMesh[] = [fuselage];
  for (const side of [-1, 1] as const) {
    const strakeSections: V3[][] = [
      [
        [side * 0.36, 0.06, -0.92],
        [side * 0.48, 0.03, -0.84],
        [side * 0.48, -0.03, -0.84],
        [side * 0.36, -0.05, -0.92]
      ],
      [
        [side * 0.56, 0.11, 0.05],
        [side * 1.12, 0.05, 0.22],
        [side * 1.12, -0.02, 0.22],
        [side * 0.56, -0.09, 0.05]
      ],
      [
        [side * 0.54, 0.12, 1.18],
        [side * 1.24, 0.09, 1.46],
        [side * 1.24, 0.01, 1.46],
        [side * 0.54, -0.07, 1.18]
      ],
      [
        [side * 0.48, 0.09, 1.76],
        [side * 0.88, 0.08, 1.92],
        [side * 0.88, 0.02, 1.92],
        [side * 0.48, -0.04, 1.76]
      ]
    ];
    parts.push(loftSectionsMesh(strakeSections, true, false));
  }

  if (!lite) {
    const spineSections: V3[][] = [
      [[-0.12, 0.28, 0.18], [0, 0.43, 0.24], [0.12, 0.28, 0.18], [0, 0.24, 0.18]],
      [[-0.15, 0.27, 0.96], [0, 0.46, 0.98], [0.15, 0.27, 0.96], [0, 0.22, 0.96]],
      [[-0.11, 0.21, 1.78], [0, 0.34, 1.82], [0.11, 0.21, 1.78], [0, 0.17, 1.78]]
    ];
    parts.push(loftSectionsMesh(spineSections, true, false));
  }

  return geometry.custom(mergeRawMeshes(parts), {
    name: "drone-hull",
    material: MAT_HULL_COPPER,
    castShadow: casts,
    receiveShadow: false
  });
}

/**
 * Multi-material AG strike craft trim (`name: "drone-trim"`): smooth-normal twin mag-lev nacelles,
 * copper/titanium heat-pipe radiator arrays, chin splitter, and `+Z` rear twin ion-thruster bells.
 */
export function buildDroneTrimNode(lite = false): ProceduralNodeBuilder {
  const slots: MultiMatSlot[] = [];
  const radSegs = lite ? 12 : 18;
  const finCount = lite ? 4 : 7;

  // Material table: 0=gunmetal, 1=brushedTitanium, 2=copperPipe, 3=rubberSeal, 4=plasmaCyan
  const mats: readonly AuraMaterialSpec[] = [
    MAT_GUNMETAL_STUDIO,
    MAT_TITANIUM_BRUSHED,
    MAT_HEATPIPE_COPPER,
    MAT_SEAL_RUBBER,
    MAT_PLASMA_CYAN
  ];

  // Forward needle canard splitter & LiDAR optic
  const canardPoly: V2[] = [[-0.36, -0.02], [0.36, -0.02], [0.24, 0.025], [-0.24, 0.025]];
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(canardPoly, 0.34, 0.012, true), { pos: [0, -0.06, -1.68] }),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, -0.06], [0.065, -0.04], [0.075, 0.03], [0, 0.05]], 12), {
      pos: [0, -0.09, -1.86],
      rot: [-Math.PI * 0.5, 0, 0]
    }),
    materialIndex: 4
  });

  // Twin magnetic-levitation side nacelles (smooth-normal lofted pods) + copper heat-pipes + radiator fins
  for (const side of [-1, 1] as const) {
    const nx = side * 0.92;
    const nacelleRing = (z: number, rx: number, ry: number, cy: number): V3[] => {
      const pts: V3[] = [];
      const n = lite ? 8 : 12;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        pts.push([nx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z]);
      }
      return pts;
    };
    const nacelle = loftSectionsMesh(
      [
        nacelleRing(-1.12, 0.05, 0.04, 0.02),
        nacelleRing(-0.78, 0.16, 0.13, 0.03),
        nacelleRing(0.12, 0.21, 0.16, 0.04),
        nacelleRing(1.08, 0.19, 0.15, 0.04),
        nacelleRing(1.56, 0.13, 0.11, 0.04)
      ],
      true,
      false
    );
    slots.push({ mesh: nacelle, materialIndex: 0 });

    // Ventral mag-lev rail & cyan plasma strip under each nacelle
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.14, 0.045, 1.92, 0.01), { pos: [nx, -0.11, 0.24] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.065, 0.024, 1.64, 0.006), { pos: [nx, -0.135, 0.24] }),
      materialIndex: 4
    });

    // Swept copper heat-pipe manifold linking forward intake to rear thruster plenum
    const pipePts = catmullRomSpline3(
      [
        [side * 0.42, 0.16, -0.86],
        [side * 0.64, 0.21, -0.18],
        [side * 0.68, 0.22, 0.74],
        [side * 0.48, 0.16, 1.62]
      ],
      lite ? 4 : 6
    );
    const pipeSpine: V4[] = pipePts.map((p) => [p[0], p[1], p[2], 0.034]);
    slots.push({ mesh: tubeSweepMesh(pipeSpine, lite ? 6 : 8), materialIndex: 2 });

    // Stacked machined titanium radiator cooling fins along hull flank
    const finPoly: V2[] = [[0, -0.05], [0.22, -0.02], [0.25, 0.07], [0.04, 0.09]];
    for (let f = 0; f < finCount; f += 1) {
      const fz = -0.34 + (f / Math.max(1, finCount - 1)) * 1.38;
      slots.push({
        mesh: transformMesh(extrudePolygonMesh(finPoly, 0.022, 0.004, true), {
          pos: [side * 0.52, 0.17, fz],
          scale: [side, 1, 1]
        }),
        materialIndex: 1
      });
    }

    // +Z Rear twin ion-thruster outer parabolic shrouds & glowing plasma injector cores
    const bellCurve = bezierCurve2([0.13, -0.18], [0.15, -0.04], [0.22, 0.10], [0.27, 0.24], lite ? 5 : 8);
    const bellProfile: V2[] = [[0.09, -0.20], ...bellCurve, [0.23, 0.24], [0.14, 0.02], [0.09, -0.16]];
    slots.push({
      mesh: transformMesh(latheMesh(bellProfile, radSegs), {
        pos: [side * 0.44, 0.04, 1.92],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.05], [0.14, -0.02], [0.16, 0.09], [0, 0.12]], radSegs), {
        pos: [side * 0.44, 0.04, 1.94],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 4
    });
  }

  return assembleMultiMaterialNode("drone-trim", slots, mats, {
    castShadow: false,
    receiveShadow: false
  });
}

/** Smooth-normal tinted cockpit canopy (`name: "drone-canopy"`, WebGPU-safe `material.physical`, `castShadow: false`). */
export function buildDroneCanopyNode(lite = false): ProceduralNodeBuilder {
  const ringPts = lite ? 8 : 12;
  const canopyRing = (z: number, wx: number, baseY: number, topY: number): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const sy = Math.sin(a);
      const y = sy >= 0 ? baseY + sy * (topY - baseY) : baseY + sy * 0.03;
      out.push([Math.cos(a) * wx, y, z]);
    }
    return out;
  };
  const canopy = loftSectionsMesh(
    [
      canopyRing(-1.32, 0.05, 0.19, 0.22),
      canopyRing(-0.96, 0.21, 0.22, 0.40),
      canopyRing(-0.42, 0.30, 0.25, 0.52),
      canopyRing(0.12, 0.26, 0.26, 0.47),
      canopyRing(0.48, 0.11, 0.27, 0.33)
    ],
    true,
    false
  );
  return geometry.custom(mergeRawMeshes([canopy]), {
    name: "drone-canopy",
    material: MAT_CANOPY_GLASS,
    castShadow: false,
    receiveShadow: false
  });
}
/** Sculpted armored side vector airbrake flap (`name: "drone-flap-${index}"`, `castShadow: false`). */
export function buildDroneFlapNode(index: number, lite = false): ProceduralNodeBuilder {
  const side = index === 0 ? -1 : 1;
  const bladePoly: V2[] = [[-0.44, -0.018], [0.42, -0.026], [0.36, 0.028], [-0.38, 0.022]];
  const slots: MultiMatSlot[] = [
    {
      mesh: transformMesh(extrudePolygonMesh(bladePoly, 0.40, 0.012, true), { rot: [side * 0.05, 0, 0] }),
      materialIndex: 0
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.68, 0.042, 0.08, 0.01), { pos: [0.06, -0.022, -side * 0.14] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.18, 0.055, 0.09, 0.012), { pos: [0.18, -0.03, -side * 0.16] }),
      materialIndex: 2
    }
  ];
  if (!lite) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.05, 0.024, 0.36, 0.005), { pos: [-0.41, 0.005, 0] }),
      materialIndex: 3
    });
  }
  return assembleMultiMaterialNode(
    `drone-flap-${index}`,
    slots,
    [MAT_FLAP_CARPAINT, MAT_TITANIUM_BRUSHED, MAT_SEAL_RUBBER, MAT_PLASMA_CYAN],
    { castShadow: false, receiveShadow: false }
  );
}

/**
 * Sculpted vectoring ion-thruster nozzle (`name: "drone-nozzle-${index}"`, `castShadow: false`).
 * Local `+Y` maps to `-X` rearward under `axisRotation("z", Math.PI / 2)` in `world.ts`.
 */
export function buildDroneNozzleNode(index: number, lite = false): ProceduralNodeBuilder {
  const segs = lite ? 12 : 18;
  const outerBell: V2[] = [
    [0.09, -0.14],
    [0.125, -0.06],
    [0.145, 0.03],
    [0.185, 0.15],
    [0.155, 0.16],
    [0.105, 0.01],
    [0.085, -0.12]
  ];
  const plasmaCore: V2[] = [
    [0, -0.08],
    [0.095, -0.04],
    [0.128, 0.11],
    [0, 0.13]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(outerBell, segs), materialIndex: 0 },
    { mesh: latheMesh(plasmaCore, segs), materialIndex: 1 }
  ];
  if (!lite) {
    for (let p = 0; p < 6; p += 1) {
      const a = (p / 6) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028, 0.22, 0.042, 0.006), {
          pos: [Math.cos(a) * 0.148, 0.02, Math.sin(a) * 0.148],
          rot: [0, -a, -0.16]
        }),
        materialIndex: 2
      });
    }
  }
  return assembleMultiMaterialNode(
    `drone-nozzle-${index}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_PLASMA_CYAN, MAT_TITANIUM_BRUSHED],
    { castShadow: false, receiveShadow: false }
  );
}

/** Sculpted counter-rotating mag-lev lift rotor (`name: "drone-rotor-${index}"`, `castShadow: false`). */
export function buildDroneRotorNode(index: number, lite = false): ProceduralNodeBuilder {
  const segs = lite ? 10 : 16;
  const hubProfile: V2[] = [[0, -0.035], [0.11, -0.03], [0.13, 0.01], [0.075, 0.048], [0, 0.056]];
  const bladePoly: V2[] = [[0.08, -0.055], [0.54, -0.032], [0.56, 0.028], [0.10, 0.062]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(hubProfile, segs), materialIndex: 0 },
    { mesh: latheMesh([[0, 0.048], [0.062, 0.052], [0, 0.068]], 10), materialIndex: 2 }
  ];
  const bladeCount = lite ? 3 : 4;
  for (let b = 0; b < bladeCount; b += 1) {
    const ang = (b / bladeCount) * Math.PI * 2;
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(bladePoly, 0.018, 0.004, true), {
        rot: [Math.PI * 0.5 + 0.18, ang, 0]
      }),
      materialIndex: 1
    });
  }
  return assembleMultiMaterialNode(
    `drone-rotor-${index}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_TITANIUM_BRUSHED, MAT_PLASMA_CYAN],
    { castShadow: false, receiveShadow: false }
  );
}

// ---------------------------------------------------------------------------
// 2. Rival Combat Craft / Strike Targets (Sentry Interceptor & Heavy Gunship)
// ---------------------------------------------------------------------------

/**
 * Tri-lobe rotary interceptor sentry drone (`name: "target-${id}"`), facing `+Z` toward oncoming racer.
 */
export function buildSentryTargetNode(id: number, size: number, lite = false, casts = false): ProceduralNodeBuilder {
  const r = size * 0.5;
  const segs = lite ? 12 : 18;
  const slots: MultiMatSlot[] = [];

  // Armored oblate central interceptor core + crimson optic eye facing +Z
  const coreProfile: V2[] = [
    [0, -r * 0.54],
    [r * 0.48, -r * 0.44],
    [r * 0.72, -r * 0.12],
    [r * 0.74, r * 0.14],
    [r * 0.46, r * 0.46],
    [0, r * 0.56]
  ];
  slots.push({ mesh: latheMesh(coreProfile, segs), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [r * 0.28, r * 0.04], [r * 0.32, r * 0.18], [0, r * 0.24]], segs),
      { pos: [0, 0, r * 0.62], rot: [Math.PI * 0.5, 0, 0] }
    ),
    materialIndex: 3
  });

  // Three radial swept crimson stabilizer fins + twin forward rotary pulse barrels
  const finPoly: V2[] = [[r * 0.48, -r * 0.18], [r * 1.02, -r * 0.34], [r * 0.96, r * 0.26], [r * 0.46, r * 0.24]];
  for (let i = 0; i < 3; i += 1) {
    const ang = (i / 3) * Math.PI * 2 + Math.PI * 0.5;
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(finPoly, r * 0.09, r * 0.015, true), { rot: [0, 0, ang] }),
      materialIndex: 1
    });
  }
  for (const sx of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sx * r * 0.38, -r * 0.14, -r * 0.18, r * 0.08],
          [sx * r * 0.38, -r * 0.14, r * 0.78, r * 0.065],
          [sx * r * 0.38, -r * 0.14, r * 0.92, r * 0.085]
        ],
        lite ? 6 : 8
      ),
      materialIndex: 2
    });
  }

  return assembleMultiMaterialNode(
    `target-${id}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_INTERCEPTOR_CRIMSON, MAT_TITANIUM_BRUSHED, MAT_OPTIC_CRIMSON],
    { castShadow: casts, receiveShadow: false }
  );
}

/**
 * Twin-nacelle armored heavy strike gunship bastion (`name: "target-${id}"`), distinct silhouette from sentry.
 */
export function buildHeavyTargetNode(id: number, size: number, lite = false, casts = false): ProceduralNodeBuilder {
  const r = size * 0.5;
  const slots: MultiMatSlot[] = [];

  // Central armored gunship fuselage (`loftSectionsMesh`)
  const bastionHull = loftSectionsMesh(
    [
      chinedHullRing(-r * 0.92, r * 0.42, r * 0.28, -r * 0.24, 0, r * 0.05),
      chinedHullRing(-r * 0.35, r * 0.64, r * 0.42, -r * 0.34, r * 0.04, r * 0.08),
      chinedHullRing(r * 0.38, r * 0.62, r * 0.38, -r * 0.32, r * 0.02, r * 0.07),
      chinedHullRing(r * 0.94, r * 0.36, r * 0.22, -r * 0.18, 0, r * 0.04)
    ],
    true,
    false
  );
  slots.push({ mesh: bastionHull, materialIndex: 0 });

  // Dorsal structural armor rack (`latticeTrussMesh`) & glowing amber-crimson reactor core
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [r * 1.48, r * 0.24, r * 0.62], bays: lite ? 3 : 4, chordRadius: r * 0.036 }),
      { pos: [0, r * 0.44, -r * 0.08] }
    ),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(r * 0.28, 1, 0.04, 19), { pos: [0, r * 0.06, r * 0.78] }),
    materialIndex: 4
  });

  // Twin outrigger weapon pods + quad heavy plasma cannon barrels + copper radiator vents
  for (const sx of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.36, r * 0.44, r * 1.18, r * 0.05), { pos: [sx * r * 0.84, 0, -r * 0.04] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.22, r * 0.18, r * 0.64, r * 0.02), { pos: [sx * r * 0.84, r * 0.25, -r * 0.12] }),
      materialIndex: 3
    });
    for (const cy of [-r * 0.11, r * 0.11] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [
            [sx * r * 0.84, cy, r * 0.42, r * 0.072],
            [sx * r * 0.84, cy, r * 1.04, r * 0.058],
            [sx * r * 0.84, cy, r * 1.14, r * 0.082]
          ],
          lite ? 6 : 8
        ),
        materialIndex: 2
      });
    }
  }

  return assembleMultiMaterialNode(
    `target-${id}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_INTERCEPTOR_CRIMSON, MAT_TITANIUM_BRUSHED, MAT_HEATPIPE_COPPER, MAT_PLASMA_AMBER],
    { castShadow: casts, receiveShadow: false }
  );
}
// ---------------------------------------------------------------------------
// 3. Cryo-Coolant / Ion-Shield Pickups & Volatile Plasma Barrels
// ---------------------------------------------------------------------------

/** Cryo-coolant / ion-shield pickup cell (`name: "pickup-${i}"`, `castShadow: false`). */
export function buildPickupNode(i: number, shield: boolean, lite = false): ProceduralNodeBuilder {
  const h = shield ? 1.18 : 0.98;
  const r = shield ? 0.54 : 0.46;
  const segs = lite ? 12 : 18;
  const slots: MultiMatSlot[] = [];

  // Top and bottom machined titanium containment endcaps
  for (const sy of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [r * 0.96, 0.02], [r * 1.04, 0.14], [r * 0.72, 0.24], [0, 0.26]], segs),
        { pos: [0, sy * (h - 0.26), 0], scale: [1, sy, 1] }
      ),
      materialIndex: 0
    });
  }

  // Helical / arched copper superconductor cage ribs
  const ribCount = shield ? 4 : 3;
  for (let k = 0; k < ribCount; k += 1) {
    const baseA = (k / ribCount) * Math.PI * 2;
    const spine: V4[] = [];
    const steps = lite ? 6 : 9;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const a = baseA + (shield ? (t - 0.5) * 1.25 : 0);
      const rad = r * (0.98 + Math.sin(t * Math.PI) * 0.14);
      spine.push([Math.cos(a) * rad, -h * 0.74 + t * h * 1.48, Math.sin(a) * rad, 0.042]);
    }
    slots.push({ mesh: tubeSweepMesh(spine, 6), materialIndex: 1 });
  }

  // Glowing inner plasma core + translucent outer cryo-glass sleeve (`material.physical`)
  slots.push({
    mesh: shield
      ? icosphereFacetMesh(r * 0.56, 1, 0.05, 31)
      : latheMesh([[0, -h * 0.56], [r * 0.46, -h * 0.42], [r * 0.46, h * 0.42], [0, h * 0.56]], segs),
    materialIndex: 2
  });
  slots.push({
    mesh: latheMesh([[r * 0.78, -h * 0.68], [r * 0.84, 0], [r * 0.78, h * 0.68]], segs),
    materialIndex: 3
  });

  return assembleMultiMaterialNode(
    `pickup-${i}`,
    slots,
    [MAT_TITANIUM_BRUSHED, MAT_HEATPIPE_COPPER, shield ? MAT_PLASMA_CYAN : MAT_REPAIR_EMERALD, MAT_CANOPY_GLASS],
    { castShadow: false, receiveShadow: false }
  );
}

/** Ribbed volatile plasma containment drum (`name: "barrel-${i}"`, `y in [-1.1, +1.1]` for exact 2.2 m height). */
export function buildBarrelNode(i: number, lite = false, casts = false): ProceduralNodeBuilder {
  const segs = lite ? 12 : 18;
  const drumProfile: V2[] = [
    [0, -1.10],
    [0.62, -1.10],
    [0.68, -0.96],
    [0.64, -0.46],
    [0.69, -0.34],
    [0.63, 0.0],
    [0.69, 0.34],
    [0.64, 0.46],
    [0.68, 0.96],
    [0.62, 1.10],
    [0, 1.10]
  ];
  const slots: MultiMatSlot[] = [{ mesh: latheMesh(drumProfile, segs), materialIndex: 0 }];

  // Vulcanized blast-bumper chimes & glowing amber hazard plasma rings
  for (const ry of [-0.98, 0.0, 0.98] as const) {
    slots.push({
      mesh: transformMesh(
        latheMesh([[0.63, -0.07], [0.74, -0.05], [0.74, 0.05], [0.63, 0.07]], segs),
        { pos: [0, ry, 0] }
      ),
      materialIndex: 1
    });
  }
  for (const gy of [-0.48, 0.48] as const) {
    slots.push({
      mesh: transformMesh(
        latheMesh([[0.62, -0.055], [0.70, -0.035], [0.70, 0.035], [0.62, 0.055]], segs),
        { pos: [0, gy, 0] }
      ),
      materialIndex: 2
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.28, 0.14, 0.28, 0.02), { pos: [0, 1.14, 0] }),
    materialIndex: 3
  });

  return assembleMultiMaterialNode(
    `barrel-${i}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_SEAL_RUBBER, MAT_PLASMA_AMBER, MAT_HEATPIPE_COPPER],
    { castShadow: casts, receiveShadow: false }
  );
}

// ---------------------------------------------------------------------------
// 4. Canyon & Reactor Track Architecture (Instanced Multi-Pass Scenery & Pylons)
// ---------------------------------------------------------------------------

function toInstanceTransforms(spots: readonly ScenerySpot[]) {
  return spots.map((p) => ({
    position: p.position,
    rotation: p.rotation,
    scale: [p.scale, p.scale, p.scale] as [number, number, number]
  }));
}

/** Stratified basalt canyon mesas, cryo-vents, hyperbolic coolant towers/reactor domes, and magnetic boost arches. */
export function buildSceneryInstancedNodes(buckets: SceneryBuckets, lite = false, casts = false): ProceduralNodeBuilder[] {
  const nodes: ProceduralNodeBuilder[] = [];
  const tierTag = lite ? "tier:/models-lite/" : "tier:/models/";

  // A. Stratified Basalt Canyon Mesas + Overhanging Mineral Terrace Caps (~9 m tall)
  if (buckets.caps.length > 0) {
    const tfs = toInstanceTransforms(buckets.caps);
    const mesa = stratifiedCliffMesh({ radiusX: 3.4, radiusZ: 3.1, height: 8.4, terraces: lite ? 4 : 6, seed: 41 });
    const capShelf = loftSectionsMesh(
      [
        chinedHullRing(0, 2.9, 7.6, 6.9, 7.2, 0.15).map(([x, y]) => [x, y, -2.4] as V3),
        chinedHullRing(0, 3.8, 8.9, 7.8, 8.3, 0.25).map(([x, y]) => [x, y, 0.0] as V3),
        chinedHullRing(0, 2.7, 8.5, 7.5, 8.0, 0.15).map(([x, y]) => [x, y, 2.4] as V3)
      ],
      true,
      true
    );
    nodes.push(
      instances
        .custom(mergeRawMeshes([mesa]), { name: "scenery-caps", material: MAT_INST_BASALT, transforms: tfs, castShadow: casts })
        .runtime({ id: "scenery-caps", tags: [tierTag] })
    );
    nodes.push(
      instances.custom(mergeRawMeshes([capShelf]), {
        name: "scenery-caps-crest",
        material: MAT_INST_MINERAL_CAP,
        transforms: tfs,
        castShadow: false
      })
    );
  }

  // B. Bioluminescent Canyon Cryo-Vents & Swept Mineral Chimneys (~4.5 m tall)
  if (buckets.corals.length > 0) {
    const tfs = toInstanceTransforms(buckets.corals);
    const baseParts: RawMesh[] = [stratifiedCliffMesh({ radiusX: 1.5, radiusZ: 1.4, height: 1.4, terraces: 3, seed: 73 })];
    const glowParts: RawMesh[] = [];
    const branches = lite ? 3 : 5;
    for (let b = 0; b < branches; b += 1) {
      const a = (b / branches) * Math.PI * 2 + 0.35;
      const reach = 0.65 + (b % 2) * 0.42;
      const topY = 2.9 + (b % 3) * 0.72;
      const curve = catmullRomSpline3(
        [[0, 0.5, 0], [Math.cos(a) * reach * 0.55, topY * 0.52, Math.sin(a) * reach * 0.55], [Math.cos(a) * reach, topY, Math.sin(a) * reach]],
        lite ? 4 : 6
      );
      baseParts.push(tubeSweepMesh(curve.map((p, idx) => [p[0], p[1], p[2], 0.26 - (idx / curve.length) * 0.11] as V4), 6, true));
      glowParts.push(
        transformMesh(latheMesh([[0, -0.18], [0.28, 0.04], [0.36, 0.24], [0, 0.34]], lite ? 8 : 12), {
          pos: [Math.cos(a) * reach, topY, Math.sin(a) * reach]
        })
      );
    }
    nodes.push(instances.custom(mergeRawMeshes(baseParts), { name: "scenery-corals", material: MAT_INST_BASALT, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(mergeRawMeshes(glowParts), { name: "scenery-corals-glow", material: MAT_INST_CRYO_VIOLET, transforms: tfs, castShadow: false }));
  }

  // C. Hyperbolic Cryo-Coolant Towers & Geodesic Reactor Core Domes (~14 m tall)
  if (buckets.ruins.length > 0) {
    const tfs = toInstanceTransforms(buckets.ruins);
    const towerProfile = bezierCurve2([3.2, 0], [1.95, 4.8], [1.75, 9.6], [2.45, 13.6], lite ? 6 : 10);
    const towerShell = latheMesh([[0, 0], ...towerProfile, [2.1, 13.6], [1.65, 8.2], [0, 8.2]], lite ? 12 : 18);
    const reactorDome = transformMesh(icosphereFacetMesh(2.55, 1, 0.03, 97), { pos: [0, 2.2, 0], scale: [1.18, 0.85, 1.18] });
    const trussParts: RawMesh[] = [
      transformMesh(latticeTrussMesh({ span: [0.95, 13.4, 0.95], bays: lite ? 4 : 6, chordRadius: 0.08 }), { pos: [2.55, 6.7, 0] }),
      tubeSweepMesh([[-2.7, 0.4, 0, 0.22], [-2.05, 6.8, 0, 0.18], [-2.4, 13.1, 0, 0.20]], 7)
    ];
    const coreRing = transformMesh(latheMesh([[2.15, -0.24], [2.62, 0], [2.15, 0.24]], lite ? 12 : 18), { pos: [0, 13.4, 0] });

    nodes.push(instances.custom(mergeRawMeshes([towerShell, reactorDome]), { name: "scenery-ruins", material: MAT_INST_REACTOR_SHELL, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(mergeRawMeshes(trussParts), { name: "scenery-ruins-truss", material: MAT_HEATPIPE_COPPER, transforms: tfs, castShadow: false }));
    nodes.push(instances.custom(mergeRawMeshes([coreRing]), { name: "scenery-ruins-core", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false }));
  }

  // D. Magnetic Canyon Boost Arches & Overhead Reactor Spans (~11 m tall)
  if (buckets.arches.length > 0) {
    const tfs = toInstanceTransforms(buckets.arches);
    const footings = [
      transformMesh(stratifiedCliffMesh({ radiusX: 1.8, radiusZ: 1.6, height: 3.6, terraces: 3, seed: 53 }), { pos: [-4.6, 0, 0] }),
      transformMesh(stratifiedCliffMesh({ radiusX: 1.8, radiusZ: 1.6, height: 3.6, terraces: 3, seed: 61 }), { pos: [4.6, 0, 0] })
    ];
    const archCurve = catmullRomSpline3([[-4.6, 1.2, 0], [-3.5, 7.6, 0], [0, 10.8, 0], [3.5, 7.6, 0], [4.6, 1.2, 0]], lite ? 5 : 8);
    const spanParts: RawMesh[] = [
      tubeSweepMesh(archCurve.map((p) => [p[0], p[1], -0.55, 0.26] as V4), 7, true),
      tubeSweepMesh(archCurve.map((p) => [p[0], p[1], 0.55, 0.26] as V4), 7, true),
      transformMesh(latticeTrussMesh({ span: [6.8, 0.95, 1.1], bays: lite ? 4 : 6, chordRadius: 0.075 }), { pos: [0, 9.8, 0] })
    ];
    const chevPoly: V2[] = [[-0.85, 0.42], [0, -0.32], [0.85, 0.42], [0.55, 0.62], [0, 0.05], [-0.55, 0.62]];
    const chev = transformMesh(extrudePolygonMesh(chevPoly, 0.24, 0.03, true), { pos: [0, 9.2, 0] });

    nodes.push(instances.custom(mergeRawMeshes(spanParts), { name: "scenery-arches", material: MAT_INST_PYLON_ALLOY, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(mergeRawMeshes(footings), { name: "scenery-arches-footings", material: MAT_INST_BASALT, transforms: tfs, castShadow: false }));
    nodes.push(instances.custom(mergeRawMeshes([chev]), { name: "scenery-arches-chevrons", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false }));
  }

  return nodes;
}

/** Electromagnetic Checkpoint Pylons & Holographic Chevron Gantries (`y in [0, 22]`, instanced). */
export function buildGatePylonInstancedNodes(
  transforms: readonly PylonTransform[],
  lite = false,
  casts = false
): ProceduralNodeBuilder[] {
  if (transforms.length === 0) return [];
  const tfs = transforms.map((t) => ({ position: t.position, rotation: t.rotation }));

  const plinth = loftSectionsMesh(
    [
      [[-1.05, 0, -1.05], [1.05, 0, -1.05], [1.05, 0, 1.05], [-1.05, 0, 1.05]],
      [[-0.78, 4.4, -0.78], [0.78, 4.4, -0.78], [0.78, 4.4, 0.78], [-0.78, 4.4, 0.78]]
    ],
    true,
    true
  );
  const mast = transformMesh(
    latticeTrussMesh({ span: [1.05, 16.4, 1.05], bays: lite ? 6 : 9, chordRadius: 0.085 }),
    { pos: [0, 12.4, 0] }
  );
  const crown = transformMesh(bevelBoxMesh(1.45, 2.1, 1.65, 0.12), { pos: [0, 20.9, 0] });
  const pylonParts: RawMesh[] = [plinth, mast, crown];
  for (const cy of [6.5, 11.5, 16.5] as const) {
    pylonParts.push(transformMesh(latheMesh([[0.62, -0.28], [0.88, 0], [0.62, 0.28]], lite ? 10 : 14), { pos: [0, cy, 0] }));
  }

  const copperPipes: RawMesh[] = [
    tubeSweepMesh([[-0.62, 1.2, 0, 0.095], [-0.58, 11.0, 0, 0.085], [-0.62, 20.4, 0, 0.095]], 6),
    tubeSweepMesh([[0.62, 1.2, 0, 0.095], [0.58, 11.0, 0, 0.085], [0.62, 20.4, 0, 0.095]], 6)
  ];

  const chevPoly: V2[] = [[-0.68, -0.36], [0, 0.34], [0.68, -0.36], [0.44, -0.54], [0, -0.04], [-0.44, -0.54]];
  const chevMeshes: RawMesh[] = [
    transformMesh(latheMesh([[0, 21.8], [0.52, 22.1], [0, 22.45]], lite ? 8 : 12), { pos: [0, 0, 0] })
  ];
  for (const hy of [8.8, 13.8, 18.6] as const) {
    chevMeshes.push(transformMesh(extrudePolygonMesh(chevPoly, 1.28, 0.04, true), { pos: [0, hy, 0], rot: [0, Math.PI * 0.5, 0] }));
  }

  return [
    instances.custom(mergeRawMeshes(pylonParts), { name: "gate-pylons", material: MAT_INST_PYLON_ALLOY, transforms: tfs, castShadow: casts }),
    instances.custom(mergeRawMeshes(copperPipes), { name: "gate-pylons-copper", material: MAT_HEATPIPE_COPPER, transforms: tfs, castShadow: false }),
    instances.custom(mergeRawMeshes(chevMeshes), { name: "gate-pylons-chevrons", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false })
  ];
}
