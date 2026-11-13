/**
 * WP-8 / WP-16 Splat Turf — Street-Sport Ink Arena Procedural Multi-Material Models (`@aura3d/engine`).
 *
 * Sculpted via `apps/showcase-port-shared/proceduralKernel.ts` with zero static `.glb` mounts
 * and zero `three` imports:
 * - Hero turf-painting ink rover & character pilot (`subdivideSmoothMesh` + `sculptStreamlinedHullMesh` +
 *   `sculptHumanoidLimbMesh` + `wheelAssemblySlots`, lathed borosilicate glass ink tank on back with
 *   `material.physical`, and anisotropic brass spray nozzle/roller manifold)
 * - Rival turf-painter / rotary scrubber rovers (`subdivideSmoothMesh` + `sculptStreamlinedHullMesh`)
 * - Chamfered arena curb bumper walls (`extrudePolygonMesh`) & pillowed sheen-fabric turf barriers
 * - Pressurized chromed ink-reservoir tanks (`latheMesh` Bezier domes + `material.physical` sight-glasses)
 * - Urban skatepark bleachers with hyperbolic sun-sail canopies (`loftSectionsMesh`)
 * - Open lattice truss speaker & stadium floodlight towers (`latticeTrussMesh`)
 * - Gore-ribbed stitched hot-air balloons & artist palette / brush sky-studio islands (`memoizeGeometry`)
 */
import {
  geometry,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type TransformOpts,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { MeshData } from "../../../../examples/shared/runner-kit/index";

export const TURF_MAT = {
  CHROME: 0,
  ANISO_STEEL: 1,
  ANISO_BRASS: 2,
  CLEARCOAT_MAGENTA: 3,
  CLEARCOAT_CYAN: 4,
  CLEARCOAT_GOLD: 5,
  CLEARCOAT_LIME: 6,
  CLEARCOAT_PLUM: 7,
  SAIL_FABRIC_WARM: 8,
  SAIL_FABRIC_COOL: 9,
  BLEACHER_WOOD: 10,
  HOSE_RUBBER: 11,
  FOLIAGE_PBR: 12,
  CONCRETE_PBR: 13,
  LED_MAGENTA: 14,
  LED_CYAN: 15,
  LED_FLOOD: 16,
  CERAMIC_WHITE: 17,
  TERRACOTTA_CLAY: 18
} as const;

export const TURF_ARENA_MATERIALS: readonly AuraMaterialSpec[] = [
  material.studioMetal({ color: "#f6fbff", roughness: 0.05, metalness: 0.96 }),
  material.brushedMetal({ color: "#c9d4e2", roughness: 0.24, anisotropy: 0.82, anisotropyRotation: 0.35 }),
  material.brushedMetal({ color: "#e8bb4e", roughness: 0.18, anisotropy: 0.88, anisotropyRotation: 1.1 }),
  material.carPaint({ color: "#ff2e84", flakeColor: "#ff9fd0", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
  material.carPaint({ color: "#14c8ff", flakeColor: "#9beaff", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
  material.carPaint({ color: "#ffb400", flakeColor: "#ffe494", roughness: 0.065, clearcoat: 1, clearcoatRoughness: 0.022 }),
  material.carPaint({ color: "#34dc6c", flakeColor: "#a6f7c0", roughness: 0.065, clearcoat: 1, clearcoatRoughness: 0.022 }),
  material.carPaint({ color: "#4f2a8f", flakeColor: "#9c74e4", roughness: 0.09, clearcoat: 0.92, clearcoatRoughness: 0.035 }),
  material.fabric({ color: "#ff669e", roughness: 0.72, sheen: 0.92, sheenColor: "#ffe5f0", sheenRoughness: 0.32 }),
  material.fabric({ color: "#2fd6c8", roughness: 0.7, sheen: 0.9, sheenColor: "#d9fffb", sheenRoughness: 0.34 }),
  material.lacquer({ color: "#d69456", roughness: 0.16, clearcoat: 0.72, clearcoatRoughness: 0.08 }),
  material.blackRubber({ color: "#211c2c", roughness: 0.62 }),
  material.pbr({ color: "#2cc86e", roughness: 0.48, metalness: 0.02, clearcoat: 0, sheen: 0 }),
  material.pbr({ color: "#f3efe6", roughness: 0.56, metalness: 0.03, clearcoat: 0, sheen: 0 }),
  material.emissive({ color: "#ff3d8b", emissive: "#ff2a82", emissiveIntensity: 3.1, practical: true }),
  material.emissive({ color: "#2ce6ff", emissive: "#16d8ff", emissiveIntensity: 3.0, practical: true }),
  material.emissive({ color: "#fff6dc", emissive: "#ffefc2", emissiveIntensity: 3.4, practical: true }),
  material.ceramic({ color: "#f8f5ee", roughness: 0.14 }),
  material.matteClay({ color: "#d4724e", roughness: 0.76 })
];

/** Pressurized ink-reservoir & rover backpack sight-glass material (`castShadow: false` node). */
export const TURF_SIGHT_GLASS_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#d8f3ff",
  roughness: 0.04,
  opacity: 0.45,
  clearcoat: 1,
  ior: 1.5
});

/** Zero-clearcoat, zero-sheen PBR preset for GPU-instanced sky-studio backdrop islands. */
export const TURF_INSTANCED_ISLAND_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#ffffff",
  roughness: 0.44,
  metalness: 0.05,
  clearcoat: 0,
  sheen: 0
});

function rawPartsToMeshData(parts: readonly RawMesh[]): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 1) positions.push(p.positions[i]!);
    for (let i = 0; i < p.normals.length; i += 1) normals.push(p.normals[i]!);
    for (let i = 0; i < p.uvs.length; i += 1) uvs.push(p.uvs[i]!);
    for (let i = 0; i < p.indices.length; i += 1) indices.push(p.indices[i]! + off);
  }
  return { positions, normals, uvs, indices };
}

function transformSlots(slots: readonly MultiMatSlot[], opts: TransformOpts): MultiMatSlot[] {
  return slots.map((s) => ({
    mesh: transformMesh(s.mesh, opts),
    materialIndex: s.materialIndex
  }));
}

// ---------------------------------------------------------------------------
// 1. Hero Turf-Painting Ink Rover, Character Pilot & Brass Roller Manifold
// ---------------------------------------------------------------------------

export interface HeroInkRoverNodes {
  readonly bodyNode: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glassNode: ReturnType<typeof geometry.custom>;
}

/**
 * Sculpted Hero Turf-Painting Ink Rover & Character Pilot riding behind the `0.45 m`
 * front wet-ink roller ball (`ball` sits at local `[0, 0, 0]`, rover trails at `+Z`):
 * - Smooth `subdivideSmoothMesh` + `sculptStreamlinedHullMesh` street-sport rover chassis
 * - Twin rear turf outrigger wheels (`wheelAssemblySlots`)
 * - Smooth sculpted painter pilot helmet & jacket + `sculptHumanoidLimbMesh` arms on handlebars
 * - Lathed borosilicate glass ink tank on back (`glassNode`, `castShadow: false` `material.physical`)
 *   with glowing magenta/gold inner ink core, brass regulator cap, pressure gauge & feed hoses
 * - Forward brass multi-nozzle spray manifold bar poised over the paint roller!
 */
export function assembleHeroInkRoverNodes(): HeroInkRoverNodes {
  const slots: MultiMatSlot[] = [];
  const glassParts: RawMesh[] = [];

  // Smooth sculpted compact turf-rover chassis trailing at z = +0.58 (`sculptStreamlinedHullMesh` + `subdivideSmoothMesh`)
  const rawChassis = transformMesh(
    sculptStreamlinedHullMesh(0.76, 0.66, 0.28, {
      noseSharpness: 0.42,
      tailTaper: 0.34,
      canopyBulge: 0.16,
      undersideFlat: 0.45,
      stations: 10,
      ringPoints: 14
    }),
    { pos: [0, -0.14, 0.62], rot: [0, Math.PI, 0] }
  );
  slots.push({ mesh: subdivideSmoothMesh(rawChassis, 1, 0.52), materialIndex: TURF_MAT.CLEARCOAT_MAGENTA });

  // Cyan clearcoat side fenderpods + rear bumper diffuser
  for (const side of [-1, 1] as const) {
    const pod = subdivideSmoothMesh(bevelBoxMesh(0.14, 0.16, 0.46, 0.045), 1, 0.48);
    slots.push({
      mesh: transformMesh(pod, { pos: [side * 0.34, -0.16, 0.66] }),
      materialIndex: TURF_MAT.CLEARCOAT_CYAN
    });
    // Rear outrigger turf tires (`wheelAssemblySlots`)
    const wheelSlots = wheelAssemblySlots({
      radius: 0.17,
      width: 0.12,
      spokes: 5,
      tireMat: TURF_MAT.HOSE_RUBBER,
      rimMat: TURF_MAT.ANISO_BRASS,
      hubMat: TURF_MAT.CHROME
    });
    slots.push(...transformSlots(wheelSlots, { pos: [side * 0.41, -0.26, 0.74] }));
  }

  // Sculpted turf-painter character pilot perched on the rover deck (`z = 0.56`)
  const torsoRings: V3[][] = [];
  const torsoStations: readonly [number, number, number, number][] = [
    [-0.02, 0.15, 0.11, 0.62],
    [0.12, 0.17, 0.12, 0.59],
    [0.26, 0.19, 0.13, 0.55],
    [0.34, 0.11, 0.09, 0.53]
  ];
  for (const [ty, rx, rz, tz] of torsoStations) {
    const ring: V3[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      ring.push([Math.cos(a) * rx, ty, tz + Math.sin(a) * rz]);
    }
    torsoRings.push(ring);
  }
  slots.push({
    mesh: subdivideSmoothMesh(loftSectionsMesh(torsoRings, true, true), 1, 0.52),
    materialIndex: TURF_MAT.SAIL_FABRIC_COOL
  });

  // Smooth street-sport painter helmet (`subdivideSmoothMesh`) + tinted glass visor
  const rawHelmet = transformMesh(
    sculptStreamlinedHullMesh(0.28, 0.24, 0.23, {
      noseSharpness: 0.38,
      tailTaper: 0.48,
      canopyBulge: 0.24,
      undersideFlat: 0.22,
      stations: 8,
      ringPoints: 12
    }),
    { pos: [0, 0.46, 0.51], rot: [0.12, Math.PI, 0] }
  );
  slots.push({ mesh: subdivideSmoothMesh(rawHelmet, 1, 0.56), materialIndex: TURF_MAT.CERAMIC_WHITE });
  glassParts.push(
    transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.21, 0.1, 0.12, 0.035), 1, 0.5), {
      pos: [0, 0.45, 0.4],
      rot: [0.18, 0, 0]
    })
  );

  // Pilot arms gripping the brass roller handlebar (`sculptHumanoidLimbMesh`)
  for (const side of [-1, 1] as const) {
    const arm = sculptHumanoidLimbMesh(
      [
        [side * 0.17, 0.27, 0.55, 0.048],
        [side * 0.22, 0.22, 0.42, 0.041],
        [side * 0.19, 0.29, 0.31, 0.036]
      ],
      10,
      0.16
    );
    slots.push({ mesh: arm, materialIndex: TURF_MAT.CLEARCOAT_GOLD });
  }

  // Swept brass handlebar crossbar
  const barPts = catmullRomSpline3(
    [
      [-0.24, 0.29, 0.31],
      [-0.1, 0.31, 0.28],
      [0.1, 0.31, 0.28],
      [0.24, 0.29, 0.31]
    ],
    4
  );
  slots.push({
    mesh: tubeSweepMesh(barPts.map((p): V4 => [p[0], p[1], p[2], 0.024]), 8),
    materialIndex: TURF_MAT.ANISO_BRASS
  });

  // Lathed borosilicate glass ink tank on back (`pos: [0, 0.04, 0.79]`, tilted slightly forward)
  const tankPose: TransformOpts = { pos: [0, 0.02, 0.79], rot: [-0.18, 0, 0] };
  const botCapPts = bezierCurve2([0, 0], [0.16, 0], [0.21, 0.05], [0.21, 0.12], 6);
  const topCapPts = bezierCurve2([0.21, 0.48], [0.21, 0.56], [0.13, 0.61], [0.05, 0.63], 6);
  slots.push(
    { mesh: transformMesh(latheMesh([...botCapPts, [0.225, 0.13], [0.225, 0.16], [0.19, 0.17]], 18), tankPose), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: transformMesh(latheMesh([[0.19, 0.45], [0.225, 0.46], [0.225, 0.49], ...topCapPts, [0.06, 0.68], [0, 0.69]], 18), tankPose), materialIndex: TURF_MAT.ANISO_BRASS },
    // Vivid pressurized inner liquid ink core + glowing meniscus ring inside the glass tank
    { mesh: transformMesh(latheMesh([[0, 0.15], [0.165, 0.15], [0.165, 0.41], [0.145, 0.43], [0, 0.42]], 16), tankPose), materialIndex: TURF_MAT.CLEARCOAT_MAGENTA },
    { mesh: transformMesh(latheMesh([[0.12, 0.4], [0.168, 0.41], [0.168, 0.44], [0.12, 0.44]], 16), tankPose), materialIndex: TURF_MAT.LED_MAGENTA }
  );

  // Outer translucent lathed glass cylinder (`TURF_SIGHT_GLASS_MATERIAL`, `castShadow: false`)
  glassParts.push(
    transformMesh(latheMesh([[0.192, 0.16], [0.206, 0.17], [0.206, 0.46], [0.192, 0.47]], 20), tankPose)
  );

  // Brass pressure gauge on top of rear ink tank + twin rubber ink hoses feeding forward brass spray bar
  slots.push({
    mesh: transformMesh(latheMesh([[0, -0.025], [0.068, -0.025], [0.072, 0.02], [0, 0.022]], 12), {
      pos: [0, 0.56, 0.96],
      rot: [-0.35, 0, 0]
    }),
    materialIndex: TURF_MAT.ANISO_BRASS
  });
  for (const side of [-1, 1] as const) {
    const hosePts = catmullRomSpline3(
      [
        [side * 0.15, 0.16, 0.82],
        [side * 0.28, 0.06, 0.62],
        [side * 0.34, 0.08, 0.34],
        [side * 0.26, 0.22, 0.16]
      ],
      5
    );
    slots.push({
      mesh: tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.024]), 8),
      materialIndex: TURF_MAT.HOSE_RUBBER
    });
  }

  const glassSpec = memoizeGeometry("splat-turf:hero-rover-glass:v1", () => mergeRawMeshes(glassParts));
  return {
    bodyNode: assembleMultiMaterialNode("ink-rover-body", slots, TURF_ARENA_MATERIALS, {
      id: "ink-rover-body",
      castShadow: true,
      receiveShadow: true
    }),
    glassNode: geometry
      .custom(glassSpec, {
        name: "ink-rover-glass",
        material: TURF_SIGHT_GLASS_MATERIAL,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "ink-rover-glass" })
  };
}

/**
 * Sculpted anisotropic brass gimbal paint-roller yoke & 3-jet spray-bar nozzle manifold
 * straddling the `0.45 m` wet-ink roller ball (`src/meshes.ts` remains untouched).
 */
export function turfRollerYokeMesh(): MeshData {
  const leftArmPts = catmullRomSpline3([[-0.5, 0, 0], [-0.55, 0.05, 0.26], [-0.36, 0.12, 0.46], [0, 0.14, 0.52]], 5);
  const rightArmPts = catmullRomSpline3([[0.5, 0, 0], [0.55, 0.05, 0.26], [0.36, 0.12, 0.46], [0, 0.14, 0.52]], 5);
  const toSpine = (pts: readonly V3[], r: number): V4[] => pts.map((p) => [p[0], p[1], p[2], r]);
  const collar = transformMesh(
    latheMesh([[0, -0.055], [0.072, -0.055], [0.084, 0], [0.066, 0.072], [0, 0.072]], 14),
    { pos: [0, 0.15, 0.53], rot: [0.58, 0, 0] }
  );
  // Transverse brass spray manifold bar + 3 lathed brass conical spray nozzles aimed onto roller
  const sprayBar = tubeSweepMesh([[-0.32, 0.34, 0.24, 0.026], [0.32, 0.34, 0.24, 0.026]], 10);
  const nozzleCone = latheMesh(
    [[0, 0], [0.038, 0], [0.032, 0.045], [0.018, 0.085], [0.026, 0.1], [0, 0.102]],
    10
  );
  const nozzles = [-0.22, 0, 0.22].map((nx) =>
    transformMesh(nozzleCone, { pos: [nx, 0.33, 0.23], rot: [-2.35, 0, 0] })
  );
  return rawPartsToMeshData([
    tubeSweepMesh(toSpine(leftArmPts, 0.034), 10),
    tubeSweepMesh(toSpine(rightArmPts, 0.034), 10),
    collar,
    sprayBar,
    ...nozzles
  ]);
}

/** Sculpted bearing hubs + knurled end-caps clamping both ends of the roller ball. */
export function turfRollerCapsMesh(): MeshData {
  const hubProfile: V2[] = [
    [0, -0.06],
    [0.12, -0.052],
    [0.132, -0.012],
    [0.102, 0.038],
    [0.058, 0.054],
    [0, 0.056]
  ];
  const leftHub = transformMesh(latheMesh(hubProfile, 16), { pos: [-0.48, 0, 0], rot: [0, 0, Math.PI * 0.5] });
  const rightHub = transformMesh(latheMesh(hubProfile, 16), { pos: [0.48, 0, 0], rot: [0, 0, -Math.PI * 0.5] });
  return rawPartsToMeshData([leftHub, rightHub]);
}

/** Chamfered street-arena curb bumper wall (`0.34 x 0.38 x 1.02 m`) with drainage groove & joint bolster. */
export function turfArenaCurbWallMesh(): MeshData {
  const profile: V2[] = [
    [-0.17, -0.18],
    [0.17, -0.18],
    [0.17, 0.08],
    [0.12, 0.19],
    [-0.11, 0.19],
    [-0.17, 0.09]
  ];
  const rail = extrudePolygonMesh(profile, 1.02, 0.014, true);
  const jointCap = transformMesh(bevelBoxMesh(0.36, 0.39, 0.12, 0.022), { pos: [0, 0.005, 0] });
  return rawPartsToMeshData([rail, jointCap]);
}

/** Rolled-chime pressurized aerosol canister body (`y = 0 .. 0.56`). */
export function turfAerosolCanBodyMesh(): MeshData {
  const profile: V2[] = [
    [0, 0.01], [0.27, 0.01], [0.298, 0.032], [0.282, 0.062],
    [0.284, 0.47], [0.302, 0.495], [0.274, 0.522], [0.21, 0.556], [0, 0.56]
  ];
  return rawPartsToMeshData([latheMesh(profile, 20)]);
}

/** Concave chrome/brass aerosol dome, valve cup & directional spray actuator nozzle (`y = 0.52 .. 0.69`). */
export function turfAerosolCanNozzleMesh(): MeshData {
  const dome = latheMesh([[0.215, 0.52], [0.19, 0.565], [0.12, 0.59], [0.126, 0.616], [0.07, 0.62], [0.07, 0.682], [0, 0.688]], 16);
  const spout = tubeSweepMesh([[0, 0.656, 0, 0.028], [0, 0.662, 0.102, 0.022]], 8);
  return rawPartsToMeshData([dome, spout]);
}

/**
 * Upgraded Rival Turf-Painter / Scrubber Rover body (`y = 0.08 .. 0.62`):
 * smooth `subdivideSmoothMesh` + `sculptStreamlinedHullMesh` armored rover shell +
 * twin rear angled solvent/paint tanks (`latheMesh`) + front cowcatcher wiper plow + roll-bar.
 */
export function turfEraserBotBodyMesh(): MeshData {
  const hull = subdivideSmoothMesh(
    transformMesh(
      sculptStreamlinedHullMesh(0.96, 1.04, 0.42, {
        noseSharpness: 0.34,
        tailTaper: 0.28,
        canopyBulge: 0.26,
        undersideFlat: 0.52,
        stations: 9,
        ringPoints: 14
      }),
      { pos: [0, 0.3, 0] }
    ),
    1,
    0.5
  );
  const plow = transformMesh(bevelBoxMesh(1.14, 0.12, 0.22, 0.032), { pos: [0, 0.15, 0.42] });
  const rearTank = latheMesh([[0, 0], [0.13, 0], [0.14, 0.04], [0.14, 0.3], [0.09, 0.36], [0, 0.37]], 12);
  const tankL = transformMesh(rearTank, { pos: [-0.24, 0.28, -0.28], rot: [-0.32, 0, 0.12] });
  const tankR = transformMesh(rearTank, { pos: [0.24, 0.28, -0.28], rot: [-0.32, 0, -0.12] });
  const archPts = catmullRomSpline3([[-0.36, 0.34, -0.14], [-0.28, 0.56, -0.22], [0.28, 0.56, -0.22], [0.36, 0.34, -0.14]], 4);
  const rollBar = tubeSweepMesh(archPts.map((p): V4 => [p[0], p[1], p[2], 0.03]), 8);
  return rawPartsToMeshData([hull, plow, tankL, tankR, rollBar]);
}

/** Notched rotary foam-scrubber pad & 6 curved impeller squeegee blades around each rival bot base. */
export function turfEraserBotScrubberMesh(): MeshData {
  const pad = latheMesh([[0.2, 0.02], [0.58, 0.02], [0.61, 0.068], [0.55, 0.11], [0.2, 0.11]], 18);
  const parts: RawMesh[] = [pad];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      transformMesh(bevelBoxMesh(0.46, 0.068, 0.1, 0.018), {
        pos: [Math.cos(a) * 0.38, 0.062, Math.sin(a) * 0.38],
        rot: [0, -a + 0.32, 0]
      })
    );
  }
  return rawPartsToMeshData(parts);
}

/** Stepped Fresnel hazard strobe dome + brass bezel collar atop each rival bot (`y = 0.52 .. 0.74`). */
export function turfEraserBotBeaconMesh(): MeshData {
  return rawPartsToMeshData([
    latheMesh(
      [
        [0, 0.52],
        [0.16, 0.52],
        [0.16, 0.555],
        [0.132, 0.565],
        [0.124, 0.63],
        [0.102, 0.69],
        [0.052, 0.73],
        [0, 0.74]
      ],
      16
    )
  ]);
}

/** Open street-art paint bucket with rolled chime, overflowing wet drips, arched wire bail & resting roller brush. */
export function turfRoadsidePropMesh(): MeshData {
  const pail = latheMesh([
    [0, 0], [0.46, 0], [0.54, 0.86], [0.6, 0.9], [0.6, 0.96], [0.51, 0.97], [0.48, 0.88], [0, 0.9]
  ], 18);
  const bailPts = catmullRomSpline3([[-0.55, 0.91, 0], [-0.42, 1.25, 0.12], [0, 1.38, 0.16], [0.42, 1.25, 0.12], [0.55, 0.91, 0]], 4);
  const dripA = tubeSweepMesh([[0.54, 0.92, 0.12, 0.065], [0.55, 0.62, 0.14, 0.048], [0.53, 0.42, 0.13, 0.068]], 7);
  const dripB = tubeSweepMesh([[-0.48, 0.92, -0.24, 0.055], [-0.5, 0.68, -0.26, 0.042], [-0.49, 0.52, -0.25, 0.058]], 7);
  const restingRoller = transformMesh(
    latheMesh([[0, -0.24], [0.11, -0.24], [0.11, 0.24], [0, 0.24]], 12),
    { pos: [0.12, 0.96, -0.08], rot: [0.18, 0.4, Math.PI * 0.44] }
  );
  return rawPartsToMeshData([
    pail,
    tubeSweepMesh(bailPts.map((p): V4 => [p[0], p[1], p[2], 0.025]), 7),
    dripA,
    dripB,
    restingRoller
  ]);
}

/** Curved skate-park gooseneck lamp post (`base y = 0`, reflector hood over road edge). */
export function turfGooseneckPostMesh(): MeshData {
  const plinth = latheMesh([[0, 0], [0.16, 0], [0.14, 0.16], [0.075, 0.26], [0.06, 0.3]], 10);
  const neckPts = catmullRomSpline3([[0, 0.26, 0], [0, 1.65, 0], [0, 2.52, 0.04], [0, 2.86, 0.24], [0, 2.74, 0.44]], 4);
  const neck = tubeSweepMesh(neckPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.056 - idx * 0.0012]), 8);
  const shade = transformMesh(latheMesh([[0, 0.12], [0.06, 0.11], [0.19, 0.02], [0.22, -0.02], [0.17, -0.02]], 12), { pos: [0, 2.72, 0.45] });
  return rawPartsToMeshData([plinth, neck, shade]);
}

/** Teardrop stadium globe bulb suspended under the gooseneck reflector hood. */
export function turfLampBulbMesh(): MeshData {
  return rawPartsToMeshData([
    transformMesh(
      latheMesh([[0, -0.18], [0.11, -0.14], [0.165, -0.03], [0.12, 0.09], [0, 0.14]], 12),
      { pos: [0, 2.58, 0.45] }
    )
  ]);
}

// ---------------------------------------------------------------------------
// 2. Street-Sport Ink Arena Multi-Material Architectural Assemblies
// ---------------------------------------------------------------------------

export interface InkTankAssembly {
  readonly opaqueSlots: MultiMatSlot[];
  readonly glassMeshes: RawMesh[];
}

/**
 * Pressurized chromed ink-reservoir tank:
 * `latheMesh` Bezier pressure domes + inner vivid ink column + translucent `material.physical`
 * sight-glass tube (`glassMeshes`) + anisotropic brass pressure gauge + `tubeSweepMesh` hoses.
 */
export function buildInkReservoirTankParts(accentMat: number, ledMat: number): InkTankAssembly {
  const opaqueSlots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];

  opaqueSlots.push(
    { mesh: transformMesh(bevelBoxMesh(2.5, 0.34, 2.5, 0.05), { pos: [0, 0.17, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(2.1, 0.22, 2.1, 0.04), { pos: [0, 0.43, 0] }), materialIndex: TURF_MAT.ANISO_STEEL }
  );

  const botDomePts = bezierCurve2([0, 0.52], [0.68, 0.52], [0.98, 0.72], [0.98, 1.18], 8);
  const botCollar: V2[] = [...botDomePts, [1.08, 1.2], [1.08, 1.34], [0.92, 1.36]];
  opaqueSlots.push({ mesh: latheMesh(botCollar, 20), materialIndex: TURF_MAT.CHROME });

  const topDomePts = bezierCurve2([0.98, 3.42], [0.98, 3.92], [0.64, 4.18], [0.22, 4.24], 8);
  const topCollar: V2[] = [[0.92, 3.26], [1.08, 3.28], [1.08, 3.4], ...topDomePts, [0.22, 4.44], [0.3, 4.46], [0.3, 4.54], [0, 4.56]];
  opaqueSlots.push({ mesh: latheMesh(topCollar, 20), materialIndex: TURF_MAT.CHROME });

  const bandRing = latheMesh([[0.94, -0.11], [1.05, -0.09], [1.05, 0.09], [0.94, 0.11]], 20);
  opaqueSlots.push(
    { mesh: transformMesh(bandRing, { pos: [0, 1.46, 0] }), materialIndex: accentMat },
    { mesh: transformMesh(bandRing, { pos: [0, 3.16, 0] }), materialIndex: accentMat }
  );

  const inkCore = latheMesh([[0, 1.34], [0.76, 1.34], [0.76, 2.86], [0.71, 2.93], [0, 2.9]], 18);
  const meniscusGlow = latheMesh([[0.58, 2.84], [0.77, 2.86], [0.77, 2.96], [0.58, 2.95]], 18);
  opaqueSlots.push(
    { mesh: inkCore, materialIndex: accentMat },
    { mesh: meniscusGlow, materialIndex: ledMat }
  );

  glassMeshes.push(latheMesh([[0.88, 1.35], [0.93, 1.37], [0.93, 3.25], [0.88, 3.27]], 20));

  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) * 0.5 + Math.PI * 0.25;
    const tx = Math.cos(a) * 1.01;
    const tz = Math.sin(a) * 1.01;
    opaqueSlots.push({
      mesh: tubeSweepMesh([[tx, 1.18, tz, 0.042], [tx, 3.44, tz, 0.042]], 7),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  const gaugeStem = tubeSweepMesh([[0.88, 2.35, 0, 0.055], [1.18, 2.35, 0, 0.055]], 8);
  const gaugeBezel = transformMesh(
    latheMesh([[0, -0.08], [0.27, -0.08], [0.29, 0.04], [0.24, 0.07], [0.22, 0.02], [0, 0.02]], 16),
    { pos: [1.22, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] }
  );
  const gaugeDial = transformMesh(
    latheMesh([[0, 0], [0.21, 0], [0.21, 0.025], [0, 0.025]], 14),
    { pos: [1.23, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] }
  );
  const gaugeNeedle = transformMesh(bevelBoxMesh(0.025, 0.16, 0.03, 0.005), { pos: [1.26, 2.39, 0.03], rot: [0.55, 0, 0] });
  glassMeshes.push(
    transformMesh(latheMesh([[0, 0], [0.23, 0], [0.21, 0.035], [0, 0.04]], 14), { pos: [1.26, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] })
  );
  const valveWheelPts = catmullRomSpline3([
    [1.14, 1.62, -0.18], [1.14, 1.8, 0], [1.14, 1.62, 0.18], [1.14, 1.44, 0]
  ], 4, true);
  opaqueSlots.push(
    { mesh: gaugeStem, materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: gaugeBezel, materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: gaugeDial, materialIndex: TURF_MAT.CERAMIC_WHITE },
    { mesh: gaugeNeedle, materialIndex: TURF_MAT.CLEARCOAT_MAGENTA },
    { mesh: tubeSweepMesh(valveWheelPts.map((p): V4 => [p[0], p[1], p[2], 0.028]), 7), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  const hoseAPts = catmullRomSpline3([[0.82, 0.98, 0.42], [1.34, 0.82, 0.62], [1.56, 0.24, 0.88], [1.92, 0.14, 1.02]], 6);
  const hoseBPts = catmullRomSpline3([[0.82, 0.98, -0.42], [1.28, 0.72, -0.68], [1.48, 0.2, -0.92], [1.86, 0.14, -1.08]], 6);
  opaqueSlots.push(
    { mesh: tubeSweepMesh(hoseAPts.map((p): V4 => [p[0], p[1], p[2], 0.078]), 9), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: tubeSweepMesh(hoseBPts.map((p): V4 => [p[0], p[1], p[2], 0.072]), 9), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: transformMesh(latheMesh([[0, -0.09], [0.11, -0.09], [0.11, 0.09], [0, 0.09]], 10), { pos: [0.92, 0.96, 0.45], rot: [0, 0, -1.3] }), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: transformMesh(latheMesh([[0, -0.09], [0.11, -0.09], [0.11, 0.09], [0, 0.09]], 10), { pos: [0.92, 0.96, -0.45], rot: [0, 0, -1.3] }), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  return { opaqueSlots, glassMeshes };
}

/**
 * Urban skatepark / turf spectator bleachers (oriented facing `+X` toward the track)
 * topped with a doubly-curved hyperbolic sheen-fabric sun-sail canopy (`loftSectionsMesh`).
 */
export function buildArenaBleacherWithSunSailSlots(warmSail: boolean): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const spanZ = 6.4;
  const stringerPoly: V2[] = [[-1.7, 0], [1.65, 0], [1.65, 0.42], [-1.25, 2.28], [-1.7, 2.28]];
  for (const sz of [-spanZ * 0.44, 0, spanZ * 0.44]) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(stringerPoly, 0.14, 0.02, true), { pos: [0, 0, sz] }),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  for (let tier = 0; tier < 4; tier += 1) {
    const tx = 1.28 - tier * 0.78;
    const ty = 0.44 + tier * 0.52;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.56, 0.09, spanZ, 0.02), { pos: [tx, ty, 0] }), materialIndex: TURF_MAT.BLEACHER_WOOD },
      { mesh: transformMesh(bevelBoxMesh(0.36, 0.05, spanZ - 0.16, 0.012), { pos: [tx + 0.34, ty - 0.22, 0] }), materialIndex: TURF_MAT.ANISO_STEEL }
    );
  }

  const railPts = catmullRomSpline3([
    [1.45, 0.95, -spanZ * 0.5], [-1.55, 2.75, -spanZ * 0.5],
    [-1.55, 2.75, spanZ * 0.5], [1.45, 0.95, spanZ * 0.5]
  ], 4);
  slots.push({
    mesh: tubeSweepMesh(railPts.map((p): V4 => [p[0], p[1], p[2], 0.042]), 7),
    materialIndex: warmSail ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN
  });

  const mastCoords: readonly [number, number, number][] = [
    [-1.82, 4.45, -spanZ * 0.52], [-1.82, 3.85, spanZ * 0.52],
    [1.58, 3.55, -spanZ * 0.48], [1.58, 4.25, spanZ * 0.48]
  ];
  for (const [mx, my, mz] of mastCoords) {
    slots.push({
      mesh: tubeSweepMesh([[mx * 0.88, 0, mz * 0.94, 0.068], [mx, my + 0.18, mz, 0.052]], 8),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  const sailSections: V3[][] = [];
  const secCount = 7;
  for (let s = 0; s < secCount; s += 1) {
    const v = s / (secCount - 1);
    const z = (-0.5 + v) * (spanZ * 1.04);
    const backY = 4.42 * (1 - v) + 3.82 * v;
    const frontY = 3.52 * (1 - v) + 4.22 * v;
    const sagZ = Math.sin(v * Math.PI) * 0.28;
    const ptsTop: V3[] = [];
    const ptsBot: V3[] = [];
    const cols = 6;
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      const x = -1.78 + u * 3.32;
      const sagX = Math.sin(u * Math.PI) * 0.22;
      const y = backY * (1 - u) + frontY * u - sagZ - sagX;
      ptsTop.push([x, y + 0.035, z]);
      ptsBot.push([x, y - 0.035, z]);
    }
    sailSections.push([...ptsTop, ...ptsBot.reverse()]);
  }
  slots.push({
    mesh: loftSectionsMesh(sailSections, true, false),
    materialIndex: warmSail ? TURF_MAT.SAIL_FABRIC_WARM : TURF_MAT.SAIL_FABRIC_COOL
  });

  return slots;
}

/**
 * Open 4-chord structural steel truss tower (`latticeTrussMesh`) carrying a J-hang
 * line-array speaker cluster and canted stadium floodlight bank (`practical: true`).
 */
export function buildTrussSpeakerFloodlightTowerSlots(accentMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  slots.push(
    { mesh: transformMesh(bevelBoxMesh(1.75, 0.48, 1.75, 0.06), { pos: [0, 0.24, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(1.42, 0.18, 1.42, 0.035), { pos: [0, 0.56, 0] }), materialIndex: accentMat }
  );

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.86, 6.2, 0.86], bays: 7, chordRadius: 0.044, braceRadius: 0.024 }),
      { pos: [0, 3.72, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });

  const woofer = latheMesh([[0, 0.03], [0.055, 0.02], [0.135, -0.025], [0.155, 0], [0.135, 0.015]], 12);
  for (let b = 0; b < 3; b += 1) {
    const by = 4.55 - b * 0.44;
    const tilt = 0.12 + b * 0.11;
    const bx = 0.62 + b * 0.05;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.48, 0.38, 0.92, 0.035), { pos: [bx, by, 0], rot: [0, 0, -tilt] }), materialIndex: TURF_MAT.HOSE_RUBBER },
      { mesh: transformMesh(bevelBoxMesh(0.08, 0.34, 0.88, 0.015), { pos: [bx - 0.22, by, 0], rot: [0, 0, -tilt] }), materialIndex: accentMat },
      { mesh: transformMesh(woofer, { pos: [bx + 0.24, by, -0.22], rot: [0, 0, -Math.PI * 0.5 - tilt] }), materialIndex: TURF_MAT.CHROME },
      { mesh: transformMesh(woofer, { pos: [bx + 0.24, by, 0.22], rot: [0, 0, -Math.PI * 0.5 - tilt] }), materialIndex: TURF_MAT.CHROME }
    );
  }

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.42, 0.42, 2.6], bays: 4, chordRadius: 0.03, braceRadius: 0.018 }),
      { pos: [0.18, 6.95, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });
  for (const lz of [-0.96, -0.32, 0.32, 0.96]) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.42, 0.48, 0.03), { pos: [0.36, 7.12, lz], rot: [0, 0, -0.42] }), materialIndex: TURF_MAT.ANISO_STEEL },
      { mesh: transformMesh(bevelBoxMesh(0.06, 0.34, 0.4, 0.01), { pos: [0.51, 7.05, lz], rot: [0, 0, -0.42] }), materialIndex: TURF_MAT.LED_FLOOD }
    );
  }

  return slots;
}

/**
 * Heroic tilted aerosol spray-can monument on a beveled skate-plaza plinth (`extrudePolygonMesh`)
 * with a frozen dynamic ink-spray arc (`catmullRomSpline3` + `tubeSweepMesh` + `icosphereFacetMesh`).
 */
export function buildAerosolMonumentSlots(bodyMat: number, sprayMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  const oct: V2[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    oct.push([Math.cos(a) * 1.45, Math.sin(a) * 1.45]);
  }
  slots.push(
    { mesh: transformMesh(extrudePolygonMesh(oct, 0.42, 0.06, true), { pos: [0, 0.21, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(1.9, 0.18, 1.9, 0.035), { pos: [0, 0.5, 0], rot: [0, Math.PI * 0.25, 0] }), materialIndex: TURF_MAT.CLEARCOAT_PLUM }
  );

  const canTilt: TransformOpts = { pos: [-0.15, 0.58, 0], rot: [0.1, 0, -0.26] };
  const bodyProfile: V2[] = [
    [0, 0], [0.76, 0], [0.82, 0.08], [0.78, 0.16],
    [0.78, 2.24], [0.83, 2.32], [0.75, 2.4], [0, 2.4]
  ];
  const domeProfile: V2[] = [
    [0.75, 2.4], [0.64, 2.66], [0.34, 2.78], [0.36, 2.88],
    [0.2, 2.9], [0.2, 3.16], [0, 3.18]
  ];
  slots.push(
    { mesh: transformMesh(latheMesh(bodyProfile, 20), canTilt), materialIndex: bodyMat },
    { mesh: transformMesh(latheMesh([[0.79, 0.85], [0.81, 0.87], [0.81, 1.58], [0.79, 1.6]], 20), canTilt), materialIndex: TURF_MAT.CERAMIC_WHITE },
    { mesh: transformMesh(latheMesh(domeProfile, 18), canTilt), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  const jetPts = catmullRomSpline3([
    [0.64, 3.52, 0], [1.28, 3.74, 0.14], [1.95, 3.46, 0.28], [2.48, 2.86, 0.36]
  ], 5);
  const jetSpine: V4[] = jetPts.map((p, idx) => [p[0], p[1], p[2], 0.05 + (idx / jetPts.length) * 0.24]);
  slots.push(
    { mesh: tubeSweepMesh(jetSpine, 10), materialIndex: sprayMat },
    { mesh: transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.24, 0, 0.1, 13), 1, 0.5), { pos: [2.58, 2.62, 0.42] }), materialIndex: sprayMat },
    { mesh: transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.16, 0, 0.08, 29), 1, 0.5), { pos: [2.22, 3.18, 0.08] }), materialIndex: sprayMat }
  );

  return slots;
}

/**
 * Pillowed sheen-fabric inflatable turf arena barrier (`loftSectionsMesh` + `subdivideSmoothMesh`)
 * with rubber ground ballast skirt, stitched end-bolsters, and brass air-lock valves.
 */
export function buildTurfInflatableBarrierSlots(fabricMat: number, trimMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  slots.push({
    mesh: transformMesh(bevelBoxMesh(1.18, 0.15, 3.44, 0.045), { pos: [0, 0.075, 0] }),
    materialIndex: TURF_MAT.HOSE_RUBBER
  });

  const mkOvalRing = (rx: number, ry: number, cy: number, z: number): V3[] => {
    const ring: V3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ring.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, z]);
    }
    return ring;
  };
  for (let row = 0; row < 3; row += 1) {
    const cy = 0.36 + row * 0.46;
    const rx = 0.44 - row * 0.045;
    const sections: V3[][] = [
      mkOvalRing(rx * 0.72, 0.2, cy, -1.56),
      mkOvalRing(rx, 0.25, cy, -0.85),
      mkOvalRing(rx * 0.88, 0.22, cy, 0),
      mkOvalRing(rx, 0.25, cy, 0.85),
      mkOvalRing(rx * 0.72, 0.2, cy, 1.56)
    ];
    slots.push({
      mesh: loftSectionsMesh(sections, true, true),
      materialIndex: row === 1 ? trimMat : fabricMat
    });
  }

  const bolster = subdivideSmoothMesh(bevelBoxMesh(0.98, 1.5, 0.48, 0.16), 1, 0.48);
  const valve = latheMesh([[0, 0], [0.08, 0], [0.08, 0.065], [0.048, 0.095], [0, 0.095]], 10);
  for (const sz of [-1.42, 1.42]) {
    slots.push(
      { mesh: transformMesh(bolster, { pos: [0, 0.82, sz] }), materialIndex: fabricMat },
      { mesh: transformMesh(valve, { pos: [0.49, 0.56, sz], rot: [0, 0, -Math.PI * 0.5] }), materialIndex: TURF_MAT.ANISO_BRASS }
    );
  }

  return slots;
}

/**
 * Colorful glazed street-planter drum (`latheMesh`) with curved ringed trunk (`tubeSweepMesh`),
 * multi-puff `layeredCanopyMesh` crown, and 6 arched palm fronds (`loftSectionsMesh`).
 */
export function buildPottedStreetPalmSlots(potMat: number, seed: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  const planterProfile: V2[] = [
    [0, 0], [0.62, 0], [0.76, 0.78], [0.84, 0.84], [0.84, 0.96],
    [0.72, 0.96], [0.68, 0.84], [0, 0.84]
  ];
  slots.push(
    { mesh: latheMesh(planterProfile, 16), materialIndex: potMat },
    { mesh: latheMesh([[0.69, 0.42], [0.74, 0.43], [0.75, 0.56], [0.7, 0.57]], 16), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: latheMesh([[0, 0.82], [0.68, 0.84], [0.54, 0.9], [0, 0.92]], 14), materialIndex: TURF_MAT.TERRACOTTA_CLAY }
  );

  const leanX = ((seed % 3) - 1) * 0.26;
  const trunkPts = catmullRomSpline3([
    [0, 0.86, 0], [leanX * 0.45, 1.85, 0.12], [leanX, 2.92, 0.06], [leanX * 0.82, 3.88, -0.08]
  ], 5);
  const trunkSpine: V4[] = trunkPts.map((p, idx) => {
    const t = idx / Math.max(1, trunkPts.length - 1);
    const ringBump = idx % 2 === 0 ? 0.018 : -0.008;
    return [p[0], p[1], p[2], 0.2 * (1 - t * 0.36) + ringBump];
  });
  slots.push({ mesh: tubeSweepMesh(trunkSpine, 9), materialIndex: TURF_MAT.BLEACHER_WOOD });

  const crownTop: V3 = [leanX * 0.82, 3.85, -0.08];
  slots.push({
    mesh: transformMesh(layeredCanopyMesh({ radius: 1.25, height: 1.15, puffs: 11, seed }), { pos: [crownTop[0], crownTop[1] - 0.25, crownTop[2]] }),
    materialIndex: TURF_MAT.FOLIAGE_PBR
  });
  for (let f = 0; f < 6; f += 1) {
    const yaw = (f / 6) * Math.PI * 2 + seed * 0.37;
    const frondSecs: V3[][] = [
      [[-0.08, 0, 0.1], [0.08, 0, 0.1], [0, -0.05, 0.1]],
      [[-0.28, 0.32, 0.68], [0.28, 0.32, 0.68], [0, 0.22, 0.68]],
      [[-0.34, 0.18, 1.38], [0.34, 0.18, 1.38], [0, 0.08, 1.38]],
      [[-0.14, -0.34, 1.96], [0.14, -0.34, 1.96], [0, -0.4, 1.96]],
      [[-0.02, -0.72, 2.28], [0.02, -0.72, 2.28], [0, -0.75, 2.28]]
    ];
    slots.push({
      mesh: transformMesh(loftSectionsMesh(frondSecs, true, true), { pos: crownTop, rot: [0, yaw, 0] }),
      materialIndex: TURF_MAT.FOLIAGE_PBR
    });
  }

  return slots;
}

/**
 * Overhead multi-material Street-Sport Scoreboard Gantry (`id: "finish"`) spanning the track:
 * twin `latticeTrussMesh` portal towers, overhead truss bridge, chamfered LED territory scoreboard,
 * gold crown emblem, and rooftop chromed ink-reservoir canisters (`assembleMultiMaterialNode`).
 */
export function assembleTurfScoreboardGantryNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  for (const sx of [-1, 1] as const) {
    const px = sx * 3.46;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.76, 0.42, 0.92, 0.05), { pos: [px, 0.21, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
      { mesh: transformMesh(bevelBoxMesh(0.62, 0.18, 0.76, 0.03), { pos: [px, 0.5, 0] }), materialIndex: sx < 0 ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN },
      {
        mesh: transformMesh(
          latticeTrussMesh({ span: [0.46, 3.8, 0.52], bays: 6, chordRadius: 0.036, braceRadius: 0.02 }),
          { pos: [px, 2.48, 0] }
        ),
        materialIndex: TURF_MAT.ANISO_STEEL
      }
    );

    const canX = sx * 2.86;
    const tankMesh = latheMesh([[0, 4.38], [0.28, 4.38], [0.3, 4.46], [0.3, 5.12], [0.22, 5.28], [0, 5.32]], 14);
    const hosePts = catmullRomSpline3([[canX, 4.62, 0], [sx * 2.42, 4.48, 0.14], [sx * 2.05, 4.72, 0.08]], 4);
    slots.push(
      { mesh: transformMesh(tankMesh, { pos: [canX, 0, 0] }), materialIndex: TURF_MAT.CHROME },
      { mesh: transformMesh(latheMesh([[0.29, 4.66], [0.315, 4.68], [0.315, 4.96], [0.29, 4.98]], 14), { pos: [canX, 0, 0] }), materialIndex: sx < 0 ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN },
      { mesh: tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.036]), 7), materialIndex: TURF_MAT.HOSE_RUBBER }
    );
  }

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [7.38, 0.52, 0.54], bays: 9, chordRadius: 0.036, braceRadius: 0.02 }),
      { pos: [0, 4.08, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });

  const wingPoly: V2[] = [[-2.18, 4.36], [2.18, 4.36], [2.46, 4.92], [2.06, 5.48], [-2.06, 5.48], [-2.46, 4.92]];
  const crownPoly: V2[] = [[-0.48, 5.46], [0.48, 5.46], [0.58, 5.88], [0.22, 5.68], [0, 5.98], [-0.22, 5.68], [-0.58, 5.88]];
  slots.push(
    { mesh: extrudePolygonMesh(wingPoly, 0.36, 0.05, true), materialIndex: TURF_MAT.CLEARCOAT_PLUM },
    { mesh: transformMesh(bevelBoxMesh(4.12, 0.86, 0.4, 0.035), { pos: [0, 4.92, 0] }), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: transformMesh(bevelBoxMesh(1.76, 0.34, 0.44, 0.02), { pos: [-1.02, 4.92, 0] }), materialIndex: TURF_MAT.LED_MAGENTA },
    { mesh: transformMesh(bevelBoxMesh(1.76, 0.34, 0.44, 0.02), { pos: [1.02, 4.92, 0] }), materialIndex: TURF_MAT.LED_CYAN },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.62, 0.45, 0.02), { pos: [0, 4.92, 0] }), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: extrudePolygonMesh(crownPoly, 0.24, 0.03, true), materialIndex: TURF_MAT.CLEARCOAT_GOLD }
  );

  for (let i = 0; i < 10; i += 1) {
    const bx = -2.7 + i * 0.6;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.56, 0.24, 0.14, 0.02), { pos: [bx, 3.46, 0] }),
      materialIndex: i % 2 === 0 ? TURF_MAT.CLEARCOAT_GOLD : TURF_MAT.CERAMIC_WHITE
    });
  }

  return assembleMultiMaterialNode("finish", slots, TURF_ARENA_MATERIALS, {
    id: "finish",
    castShadow: true,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 3. Scrolling Street-Sport Ink Arena Sideline Belts + Stitched Balloons & Palettes
// ---------------------------------------------------------------------------

export const ARENA_BELT_SPAN = 96;

export interface TurfArenaBeltDescriptor {
  readonly opaqueId: string;
  readonly glassId: string;
  readonly tileIndex: number;
  readonly opaqueNode: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glassNode: ReturnType<typeof geometry.custom>;
}

/** Builds 2 seamless 96 m multi-material Street-Sport Ink Arena sideline belts + `castShadow: false` sight-glasses. */
export function createTurfArenaSidelineBelts(): readonly TurfArenaBeltDescriptor[] {
  const opaqueModule: MultiMatSlot[] = [];
  const glassModule: RawMesh[] = [];

  const placeAssembly = (slots: readonly MultiMatSlot[], side: -1 | 1, xAbs: number, z: number, extraYaw = 0): void => {
    const rotY = (side === -1 ? 0 : Math.PI) + extraYaw;
    opaqueModule.push(...transformSlots(slots, { pos: [side * xAbs, -0.35, z], rot: [0, rotY, 0] }));
  };

  const placeTank = (side: -1 | 1, xAbs: number, z: number, accent: number, led: number): void => {
    const tank = buildInkReservoirTankParts(accent, led);
    const opts: TransformOpts = { pos: [side * xAbs, -0.35, z], rot: [0, side === -1 ? 0 : Math.PI, 0] };
    opaqueModule.push(...transformSlots(tank.opaqueSlots, opts));
    for (const gm of tank.glassMeshes) glassModule.push(transformMesh(gm, opts));
  };

  placeTank(-1, 10.6, -10, TURF_MAT.CLEARCOAT_MAGENTA, TURF_MAT.LED_MAGENTA);
  placeTank(1, 10.6, -58, TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.LED_CYAN);
  placeTank(1, 10.8, -14, TURF_MAT.CLEARCOAT_LIME, TURF_MAT.LED_CYAN);
  placeTank(-1, 10.8, -62, TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.LED_MAGENTA);

  placeAssembly(buildArenaBleacherWithSunSailSlots(true), -1, 12.2, -28);
  placeAssembly(buildArenaBleacherWithSunSailSlots(false), 1, 12.2, -32);
  placeAssembly(buildArenaBleacherWithSunSailSlots(false), -1, 12.2, -78);
  placeAssembly(buildArenaBleacherWithSunSailSlots(true), 1, 12.2, -82);

  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_MAGENTA), -1, 11.2, -44);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_CYAN), 1, 11.2, -46);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_GOLD), -1, 11.2, -92);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_LIME), 1, 11.2, -94);

  placeAssembly(buildAerosolMonumentSlots(TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.CLEARCOAT_MAGENTA), 1, 11.6, -22, 0.18);
  placeAssembly(buildAerosolMonumentSlots(TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.CLEARCOAT_LIME), -1, 11.6, -70, -0.18);

  const warmBarrier = buildTurfInflatableBarrierSlots(TURF_MAT.SAIL_FABRIC_WARM, TURF_MAT.CLEARCOAT_GOLD);
  const coolBarrier = buildTurfInflatableBarrierSlots(TURF_MAT.SAIL_FABRIC_COOL, TURF_MAT.CLEARCOAT_MAGENTA);
  for (const [side, z, warm] of [[-1, -18, true], [1, -26, false], [-1, -52, false], [1, -68, true]] as const) {
    placeAssembly(warm ? warmBarrier : coolBarrier, side, 9.2, z);
  }

  const palmPots = [TURF_MAT.CLEARCOAT_MAGENTA, TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.CLEARCOAT_LIME];
  for (let p = 0; p < 6; p += 1) {
    const side: -1 | 1 = p % 2 === 0 ? -1 : 1;
    const z = -6 - p * 15.5;
    placeAssembly(buildPottedStreetPalmSlots(palmPots[p % palmPots.length]!, 11 + p * 7), side, 9.8, z);
  }

  const glassSpec = memoizeGeometry("splat-turf:arena-belt-glass:v2", () => mergeRawMeshes(glassModule));
  const belts: TurfArenaBeltDescriptor[] = [];
  for (let tile = 0; tile < 2; tile += 1) {
    const opaqueId = `arena-belt-${tile}`;
    const glassId = `arena-glass-${tile}`;
    belts.push({
      opaqueId,
      glassId,
      tileIndex: tile,
      opaqueNode: assembleMultiMaterialNode(opaqueId, opaqueModule, TURF_ARENA_MATERIALS, {
        id: opaqueId,
        castShadow: false,
        receiveShadow: true
      }),
      glassNode: geometry
        .custom(glassSpec, {
          name: glassId,
          material: TURF_SIGHT_GLASS_MATERIAL,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: glassId })
    });
  }
  return belts;
}

export type TurfBackdropKind =
  | "balloon"
  | "easelIsland"
  | "islandTower"
  | "islandTree"
  | "paintPotIsland"
  | "paletteIsland";

export interface TurfBackdropPiece {
  readonly id: string;
  readonly kind: TurfBackdropKind;
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

/**
 * Pure procedural sculpted sky-studio islands, gore-stitched hot-air balloons,
 * and artist palette + paintbrush monuments (zero `.glb` dependencies, memoized).
 */
export function buildTurfBackdropIslandSpec(kind: TurfBackdropKind): AuraCustomGeometrySpec {
  return memoizeGeometry(`splat-turf:backdrop:${kind}:v2`, () => {
    if (kind === "balloon") {
      // 14-gore scalloped stitched hot-air balloon envelope (`loftSectionsMesh`) + meridian seam ribs
      const envProfile = [
        [0.02, -1.36],
        ...bezierCurve2([0.42, -1.22], [2.52, -0.32], [2.72, 2.34], [0.02, 3.16], 10)
      ];
      const gores = 14;
      const ringPts = gores * 2;
      const envSections: V3[][] = envProfile.map(([rad, y]) => {
        const ring: V3[] = [];
        for (let i = 0; i < ringPts; i += 1) {
          const a = (i / ringPts) * Math.PI * 2;
          const puff = i % 2 === 1 ? 1.055 : 0.965;
          ring.push([Math.cos(a) * rad * puff, y, Math.sin(a) * rad * puff]);
        }
        return ring;
      });
      const envelope = loftSectionsMesh(envSections, true, true);
      const throatSkirt = latheMesh([[0.38, -1.42], [0.46, -1.24], [0.42, -1.16]], 14);
      const burner = latheMesh([[0, -1.68], [0.22, -1.68], [0.26, -1.52], [0.16, -1.46], [0, -1.46]], 10);
      const basket = transformMesh(
        subdivideSmoothMesh(bevelBoxMesh(0.96, 0.72, 0.96, 0.09), 1, 0.42),
        { pos: [0, -2.28, 0] }
      );
      const basketRim = transformMesh(bevelBoxMesh(1.06, 0.12, 1.06, 0.04), { pos: [0, -1.92, 0] });
      const cords: RawMesh[] = [];
      for (const [cx, cz] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]] as const) {
        cords.push(tubeSweepMesh([[cx, -1.9, cz, 0.032], [cx * 1.08, -1.24, cz * 1.08, 0.032]], 5));
        cords.push(transformMesh(icosphereFacetMesh(0.14, 0, 0.04, 7), { pos: [cx * 1.18, -2.1, cz * 1.18] }));
      }
      return mergeRawMeshes([envelope, throatSkirt, burner, basket, basketRim, ...cords]);
    }

    const cliff = transformMesh(
      stratifiedCliffMesh({ radiusX: 4.4, radiusZ: 4.1, height: 4.2, terraces: 4, seed: kind.length * 13 }),
      { pos: [0, -4.1, 0], rot: [Math.PI, 0, 0] }
    );
    const deck = latheMesh([[0, -0.15], [4.1, -0.15], [4.25, 0.2], [3.85, 0.42], [0, 0.45]], 16);

    if (kind === "islandTower") {
      const truss = transformMesh(latticeTrussMesh({ span: [1.5, 5.8, 1.5], bays: 5, chordRadius: 0.09 }), { pos: [0, 3.3, 0] });
      const tank = latheMesh([[0, 6.1], [1.15, 6.2], [1.15, 7.6], [0.7, 8.15], [0, 8.25]], 14);
      return mergeRawMeshes([cliff, deck, truss, tank]);
    }
    if (kind === "islandTree") {
      const trunkPts = catmullRomSpline3([[0, 0.35, 0], [0.35, 2.1, 0.2], [-0.15, 3.9, -0.1]], 4);
      const trunk = tubeSweepMesh(trunkPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.42 - idx * 0.025]), 8);
      const crown = transformMesh(layeredCanopyMesh({ radius: 3.1, height: 2.8, puffs: 11, seed: 31 }), { pos: [-0.1, 3.5, -0.1] });
      return mergeRawMeshes([cliff, deck, trunk, crown]);
    }
    if (kind === "paintPotIsland") {
      const pot = transformMesh(
        latheMesh([[0, 0], [1.55, 0], [1.75, 2.7], [1.95, 2.95], [1.65, 3.06], [0, 2.95]], 16),
        { pos: [-0.3, 1.15, 0], rot: [0, 0, -0.42] }
      );
      const pourPts = catmullRomSpline3([[0.85, 2.15, 0], [1.68, 1.45, 0.2], [2.15, 0.42, 0.3]], 5);
      const pour = tubeSweepMesh(pourPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.32 + idx * 0.03]), 8);
      const puddle = transformMesh(latheMesh([[0, 0.42], [1.25, 0.42], [1.35, 0.56], [0, 0.58]], 14), { pos: [2.05, 0, 0.28] });
      return mergeRawMeshes([cliff, deck, pot, pour, puddle]);
    }
    if (kind === "easelIsland") {
      const legA = tubeSweepMesh([[-1.4, 0.35, 0.6, 0.12], [0, 4.9, -0.2, 0.09]], 6);
      const legB = tubeSweepMesh([[1.4, 0.35, 0.6, 0.12], [0, 4.9, -0.2, 0.09]], 6);
      const legC = tubeSweepMesh([[0, 0.35, -1.5, 0.12], [0, 4.7, -0.25, 0.09]], 6);
      const canvas = transformMesh(bevelBoxMesh(3.2, 2.4, 0.24, 0.05), { pos: [0, 2.85, 0.32], rot: [-0.16, 0, 0] });
      const ledge = transformMesh(bevelBoxMesh(3.5, 0.18, 0.44, 0.03), { pos: [0, 1.62, 0.54], rot: [-0.16, 0, 0] });
      return mergeRawMeshes([cliff, deck, legA, legB, legC, canvas, ledge]);
    }

    // "paletteIsland": contoured kidney artist palette + 5 swirled paint dabs + crossed artist paintbrushes
    const palPoly: V2[] = [
      [-2.45, -1.15],
      [1.75, -1.62],
      [2.78, -0.18],
      [2.12, 1.64],
      [-0.38, 1.95],
      [-1.18, 0.82],
      [-0.55, 0.35],
      [-1.42, 0.15],
      [-2.52, 0.68]
    ];
    const palette = transformMesh(extrudePolygonMesh(palPoly, 0.34, 0.08, true), {
      pos: [0, 1.88, 0],
      rot: [-0.52, 0.24, 0.16]
    });
    const dabPositions: readonly V3[] = [
      [-1.15, 2.18, 0.38],
      [0.98, 2.38, -0.26],
      [1.55, 1.92, 0.45],
      [-0.15, 2.48, -0.58]
    ];
    const dabs = dabPositions.map((pos, idx) =>
      transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.42, 0, 0.08, 5 + idx * 7), 1, 0.52), { pos })
    );
    const brushA = tubeSweepMesh(
      [
        [-1.6, 0.85, -1.1, 0.07],
        [0.45, 2.55, 0.35, 0.12],
        [1.15, 3.15, 0.85, 0.18],
        [1.48, 3.45, 1.08, 0.03]
      ],
      8
    );
    const brushB = tubeSweepMesh(
      [
        [1.45, 0.9, -1.15, 0.07],
        [-0.35, 2.45, 0.25, 0.11],
        [-0.98, 3.02, 0.72, 0.17],
        [-1.28, 3.3, 0.96, 0.03]
      ],
      8
    );
    return mergeRawMeshes([cliff, deck, palette, ...dabs, brushA, brushB]);
  });
}

const BACKDROP_TINTS: readonly string[] = ["#ff7ab8", "#6ee4ff", "#ffd46b", "#7bf0a8", "#c8a4ff", "#ff9e7d"];

export function createTurfBackdropIslandNodes(
  pieces: readonly TurfBackdropPiece[],
  kinds: readonly TurfBackdropKind[],
  span: number,
  near: number
): readonly { readonly nodeId: string; readonly kind: TurfBackdropKind; readonly phase: number; readonly node: ReturnType<typeof instances.custom> }[] {
  const out: { readonly nodeId: string; readonly kind: TurfBackdropKind; readonly phase: number; readonly node: ReturnType<typeof instances.custom> }[] = [];
  for (let kIdx = 0; kIdx < kinds.length; kIdx += 1) {
    const kind = kinds[kIdx]!;
    const groupPieces = pieces.filter((p) => p.kind === kind);
    if (groupPieces.length === 0) continue;
    const nodeId = `isle-group-${kind}`;
    const transforms = [];
    const colors: string[] = [];
    for (let tile = 0; tile < 2; tile += 1) {
      const tileOffsetZ = -tile * span;
      for (let pIdx = 0; pIdx < groupPieces.length; pIdx += 1) {
        const p = groupPieces[pIdx]!;
        transforms.push({
          position: [p.side * p.offset, p.y, near - p.z0 + tileOffsetZ] as const,
          rotation: [0, p.z0 * 0.45, 0] as const,
          scale: p.size / 10.5
        });
        colors.push(BACKDROP_TINTS[(kIdx + pIdx + tile) % BACKDROP_TINTS.length]!);
      }
    }
    const spec = buildTurfBackdropIslandSpec(kind);
    const node = instances
      .custom(spec, {
        name: nodeId,
        material: TURF_INSTANCED_ISLAND_MATERIAL,
        transforms,
        colors,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: nodeId });
    out.push({ nodeId, kind, phase: kIdx * 1.15, node });
  }
  return out;
}
