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
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  sculptStreamlinedHullMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
  color: "#c86228",
  roughness: 0.2,
  metallic: 0.68,
  clearcoat: 0.94,
  clearcoatRoughness: 0.045,
  envMapIntensity: 0.96,
  emissive: "#0d222a",
  emissiveIntensity: 0.04,
  practical: true
});

/** Secondary automotive racing paint for vector airbrakes and interceptor cowlings. */
const MAT_FLAP_CARPAINT: AuraMaterialSpec = material.carPaint({
  color: "#c9642a",
  roughness: 0.2,
  metallic: 0.68,
  clearcoat: 0.94,
  clearcoatRoughness: 0.04,
  envMapIntensity: 0.96
});

const MAT_INTERCEPTOR_CRIMSON: AuraMaterialSpec = material.carPaint({
  color: "#b8282c",
  roughness: 0.22,
  metallic: 0.68,
  clearcoat: 0.92,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.35
});

/** Anisotropic machined titanium for rotor blades, heat-exchanger fins, and winglet bevels. */
const MAT_TITANIUM_BRUSHED: AuraMaterialSpec = material.brushedMetal({
  color: "#8d9cac",
  roughness: 0.26,
  anisotropy: 0.85,
  envMapIntensity: 1.05
});

/** Dark gunmetal studio alloy for sculpted fuselage armor panels, mag-lev nacelles, and thruster shrouds. */
const MAT_GUNMETAL_STUDIO: AuraMaterialSpec = material.studioMetal({
  color: "#222a38",
  roughness: 0.26,
  metallic: 0.92,
  envMapIntensity: 1.12
});

/** Polished copper-bronze heat-pipe manifold alloy. */
const MAT_HEATPIPE_COPPER: AuraMaterialSpec = material.metal({
  color: "#d47e42",
  roughness: 0.2,
  metallic: 0.94,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.2
});

/** Vibration-damping vulcanized rubber for cockpit tub liner, blast-bumper chimes, and actuator seals. */
const MAT_SEAL_RUBBER: AuraMaterialSpec = material.blackRubber({
  color: "#12161e",
  roughness: 0.88
});

/** Pearl-white glazed ceramic AG speed-livery nose flashes and thermal tiles. */
const MAT_CERAMIC_LIVERY: AuraMaterialSpec = material.ceramic({
  color: "#e6edf6",
  roughness: 0.18,
  glaze: 0.78
});

/** Dark smoked polycarbonate cockpit canopy (WebGPU-safe `material.physical`, eliminates white bloom blowout, never castShadow). */
const MAT_CANOPY_GLASS: AuraMaterialSpec = material.physical({
  color: "#0e1726",
  roughness: 0.05,
  metallic: 0.1,
  transmission: 0.48,
  ior: 1.52,
  thickness: 0.42,
  attenuationColor: "#122236",
  attenuationDistance: 0.65,
  clearcoat: 0.94,
  clearcoatRoughness: 0.035,
  opacity: 0.82,
  transparent: true,
  envMapIntensity: 1.05
});

/** Translucent tinted cryo-containment glass sleeve for pickups (`material.physical`). */
const MAT_CRYO_SLEEVE_GLASS: AuraMaterialSpec = material.physical({
  color: "#163042",
  roughness: 0.08,
  metallic: 0.06,
  transmission: 0.54,
  ior: 1.48,
  thickness: 0.3,
  attenuationColor: "#1d4258",
  attenuationDistance: 0.72,
  clearcoat: 0.68,
  clearcoatRoughness: 0.06,
  opacity: 0.66,
  transparent: true,
  envMapIntensity: 0.95
});

/** Controlled recessed plasma nozzle cores (no white bloom blob blowout). */
const MAT_NOZZLE_CYAN: AuraMaterialSpec = material.emissive({
  color: "#081c28",
  emissive: "#2cd4f8",
  emissiveIntensity: 1.12,
  roughness: 0.24,
  practical: true
});

const MAT_NOZZLE_AMBER: AuraMaterialSpec = material.emissive({
  color: "#221006",
  emissive: "#f59228",
  emissiveIntensity: 1.06,
  roughness: 0.24,
  practical: true
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
// 1. Hero Wipeout-Class Twin-Hull AG Strike Craft (Lofted + Subdivided Hulls)
// ---------------------------------------------------------------------------

const MULTI_SLOT_CACHE = new Map<string, readonly MultiMatSlot[]>();
function memoizeSlots(key: string, build: () => MultiMatSlot[]): MultiMatSlot[] {
  const hit = MULTI_SLOT_CACHE.get(key);
  if (hit) return hit as MultiMatSlot[];
  const built = build();
  MULTI_SLOT_CACHE.set(key, built);
  return built;
}

/** Smooth 20-point compound-curved cross-section ring for aerodynamic chined hulls (`Z` longitudinal: `-Z` nose, `+Z` tail). */
function chinedHullRing(z: number, halfW: number, deckY: number, bellyY: number, chineY: number, crown = 0.08): V3[] {
  const topSpan = deckY - chineY;
  const botSpan = chineY - bellyY;
  const half: Array<[number, number]> = [
    [halfW * 0.22, deckY + crown * 0.82],
    [halfW * 0.48, deckY + crown * 0.34],
    [halfW * 0.72, chineY + topSpan * 0.72],
    [halfW * 0.91, chineY + topSpan * 0.36],
    [halfW, chineY],
    [halfW * 0.92, bellyY + botSpan * 0.56],
    [halfW * 0.74, bellyY + botSpan * 0.24],
    [halfW * 0.46, bellyY + botSpan * 0.05],
    [halfW * 0.2, bellyY - 0.012]
  ];
  const out: V3[] = [[0, deckY + crown, z]];
  for (const [x, y] of half) out.push([x, y, z]);
  out.push([0, bellyY - 0.02, z]);
  for (let i = half.length - 1; i >= 0; i -= 1) {
    const [x, y] = half[i]!;
    out.push([-x, y, z]);
  }
  return out;
}

/** Smooth 16-point asymmetric catamaran sponson cross-section (`side` = -1 port, +1 starboard; steeper inner Venturi tunnel wall). */
function twinProngRing(
  side: -1 | 1,
  cx: number,
  z: number,
  inwardW: number,
  outwardW: number,
  deckY: number,
  bellyY: number,
  chineY: number
): V3[] {
  const ox = side * outwardW;
  const ix = -side * inwardW;
  const topSpan = deckY - chineY;
  const botSpan = chineY - bellyY;
  const pts: V3[] = [
    [cx + ix * 0.12, deckY + 0.036, z],
    [cx + ox * 0.3, deckY + 0.022, z],
    [cx + ox * 0.64, chineY + topSpan * 0.76, z],
    [cx + ox * 0.89, chineY + topSpan * 0.38, z],
    [cx + ox, chineY, z],
    [cx + ox * 0.88, bellyY + botSpan * 0.54, z],
    [cx + ox * 0.62, bellyY + botSpan * 0.2, z],
    [cx + ox * 0.26, bellyY + botSpan * 0.04, z],
    [cx, bellyY, z],
    [cx + ix * 0.36, bellyY + botSpan * 0.06, z],
    [cx + ix * 0.76, bellyY + botSpan * 0.24, z],
    [cx + ix * 0.95, bellyY + botSpan * 0.62, z],
    [cx + ix, chineY + 0.015, z],
    [cx + ix * 0.92, chineY + topSpan * 0.52, z],
    [cx + ix * 0.72, deckY - 0.004, z],
    [cx + ix * 0.42, deckY + 0.024, z]
  ];
  return side > 0 ? pts : [...pts].reverse();
}

/**
 * Primary copper-clearcoat Wipeout-class twin-hull AG strike craft (`name: "drone-hull"`).
 * Built as a single smooth-normal `geometry.custom` mesh so `node("drone-hull").setEmissive(hex, k)`
 * drives 8-step hull heat glow directly at runtime and `castShadow: casts` sits on the root node.
 */
export function buildDroneHullNode(lite = false, casts = false): ProceduralNodeBuilder {
  const spec = memoizeGeometry(`heatsink-port:drone-hull:${lite ? "l" : "h"}`, () => {
    // Central raised cockpit pod & dorsal spine starting aft of the split-prong forward air channel
    const centerPodRaw = loftSectionsMesh(
      [
        chinedHullRing(-1.46, 0.08, 0.10, -0.04, 0.03, 0.02),
        chinedHullRing(-1.26, 0.18, 0.18, -0.08, 0.042, 0.038),
        chinedHullRing(-1.04, 0.26, 0.24, -0.11, 0.05, 0.05),
        chinedHullRing(-0.74, 0.32, 0.295, -0.145, 0.056, 0.068),
        chinedHullRing(-0.44, 0.36, 0.33, -0.17, 0.06, 0.08),
        chinedHullRing(-0.08, 0.40, 0.345, -0.184, 0.062, 0.088),
        chinedHullRing(0.28, 0.42, 0.35, -0.19, 0.06, 0.09),
        chinedHullRing(0.66, 0.445, 0.34, -0.188, 0.056, 0.082),
        chinedHullRing(1.04, 0.46, 0.32, -0.18, 0.05, 0.07),
        chinedHullRing(1.38, 0.475, 0.29, -0.162, 0.04, 0.06),
        chinedHullRing(1.68, 0.48, 0.25, -0.14, 0.03, 0.05),
        chinedHullRing(1.90, 0.455, 0.21, -0.12, 0.024, 0.035),
        chinedHullRing(2.06, 0.42, 0.17, -0.10, 0.02, 0.02)
      ],
      true,
      false
    );
    const centerPod = subdivideSmoothMesh(centerPodRaw, 1, 0.45);

    const parts: RawMesh[] = [centerPod];

    // Twin razor-sleek forward Wipeout catamaran prongs + swept delta wings
    for (const side of [-1, 1] as const) {
      const prongRaw = loftSectionsMesh(
        [
          twinProngRing(side, side * 0.42, -2.26, 0.025, 0.035, 0.02, -0.025, -0.005),
          twinProngRing(side, side * 0.43, -2.06, 0.07, 0.10, 0.058, -0.055, 0.0),
          twinProngRing(side, side * 0.44, -1.86, 0.11, 0.16, 0.09, -0.08, 0.005),
          twinProngRing(side, side * 0.456, -1.55, 0.144, 0.205, 0.134, -0.112, 0.013),
          twinProngRing(side, side * 0.47, -1.24, 0.17, 0.24, 0.17, -0.14, 0.02),
          twinProngRing(side, side * 0.486, -0.86, 0.198, 0.268, 0.198, -0.162, 0.026),
          twinProngRing(side, side * 0.50, -0.48, 0.22, 0.29, 0.22, -0.18, 0.03),
          twinProngRing(side, side * 0.512, -0.05, 0.232, 0.308, 0.232, -0.186, 0.033),
          twinProngRing(side, side * 0.52, 0.38, 0.24, 0.32, 0.24, -0.19, 0.035),
          twinProngRing(side, side * 0.506, 0.82, 0.232, 0.312, 0.232, -0.182, 0.033),
          twinProngRing(side, side * 0.49, 1.24, 0.22, 0.30, 0.22, -0.17, 0.03),
          twinProngRing(side, side * 0.47, 1.64, 0.194, 0.266, 0.194, -0.144, 0.025),
          twinProngRing(side, side * 0.45, 1.98, 0.16, 0.22, 0.16, -0.11, 0.02)
        ],
        true,
        false
      );
      parts.push(subdivideSmoothMesh(prongRaw, 1, 0.44));

      const wingSection = (ix: number, ox: number, iyTop: number, iyBot: number, oyTop: number, oyBot: number, iz: number, oz: number): V3[] => {
        const mx = (ix + ox) * 0.5;
        const mz = (iz + oz) * 0.5;
        return [
          [side * ix, iyTop, iz],
          [side * mx, (iyTop + oyTop) * 0.5 + 0.012, mz],
          [side * ox, oyTop, oz],
          [side * (ox + 0.015), (oyTop + oyBot) * 0.5, oz + 0.01],
          [side * ox, oyBot, oz],
          [side * mx, (iyBot + oyBot) * 0.5 - 0.008, mz],
          [side * ix, iyBot, iz],
          [side * (ix - 0.01), (iyTop + iyBot) * 0.5, iz]
        ];
      };
      const wingRaw = loftSectionsMesh(
        [
          wingSection(0.62, 0.74, 0.08, -0.05, 0.04, -0.02, -0.64, -0.52),
          wingSection(0.67, 0.96, 0.098, -0.068, 0.04, -0.02, -0.18, -0.02),
          wingSection(0.70, 1.16, 0.11, -0.08, 0.04, -0.02, 0.28, 0.48),
          wingSection(0.69, 1.26, 0.118, -0.072, 0.062, -0.005, 0.74, 1.02),
          wingSection(0.68, 1.32, 0.12, -0.06, 0.08, 0.01, 1.18, 1.54),
          wingSection(0.58, 0.96, 0.09, -0.03, 0.07, 0.01, 1.78, 1.96)
        ],
        true,
        false
      );
      parts.push(subdivideSmoothMesh(wingRaw, 1, 0.36));
    }

    if (!lite) {
      const spineSections: V3[][] = [
        [[-0.11, 0.30, 0.18], [-0.06, 0.41, 0.21], [0, 0.46, 0.24], [0.06, 0.41, 0.21], [0.11, 0.30, 0.18], [0, 0.25, 0.18]],
        [[-0.13, 0.30, 0.58], [-0.07, 0.43, 0.60], [0, 0.475, 0.62], [0.07, 0.43, 0.60], [0.13, 0.30, 0.58], [0, 0.24, 0.58]],
        [[-0.14, 0.29, 0.98], [-0.075, 0.43, 0.99], [0, 0.48, 1.00], [0.075, 0.43, 0.99], [0.14, 0.29, 0.98], [0, 0.23, 0.98]],
        [[-0.12, 0.26, 1.42], [-0.065, 0.38, 1.44], [0, 0.425, 1.46], [0.065, 0.38, 1.44], [0.12, 0.26, 1.42], [0, 0.20, 1.42]],
        [[-0.10, 0.22, 1.80], [-0.05, 0.31, 1.82], [0, 0.35, 1.84], [0.05, 0.31, 1.82], [0.10, 0.22, 1.80], [0, 0.17, 1.80]]
      ];
      parts.push(subdivideSmoothMesh(loftSectionsMesh(spineSections, true, false), 1, 0.4));
    }

    return mergeRawMeshes([bakeMeshCavityAO(mergeRawMeshesToRaw(parts), 0.24)]);
  });

  return geometry.custom(spec, {
    name: "drone-hull",
    material: MAT_HULL_COPPER,
    castShadow: casts,
    receiveShadow: false
  });
}

/**
 * Multi-material Wipeout AG strike craft trim (`name: "drone-trim"`): twin-prong bridge hydrofoil,
 * pearl ceramic livery flashes, gunmetal armor saddles, canted aero winglets, copper heat-pipes, and recessed plasma nozzles.
 */
export function buildDroneTrimNode(lite = false): ProceduralNodeBuilder {
  // Material table: 0=gunmetal, 1=brushedTitanium, 2=copperPipe, 3=rubberSeal, 4=nozzleCyan, 5=nozzleAmber, 6=ceramicLivery
  const mats: readonly AuraMaterialSpec[] = [
    MAT_GUNMETAL_STUDIO,
    MAT_TITANIUM_BRUSHED,
    MAT_HEATPIPE_COPPER,
    MAT_SEAL_RUBBER,
    MAT_NOZZLE_CYAN,
    MAT_NOZZLE_AMBER,
    MAT_CERAMIC_LIVERY
  ];

  const slots = memoizeSlots(`heatsink-port:drone-trim:${lite ? "l" : "h"}`, () => {
    const out: MultiMatSlot[] = [];
    const radSegs = lite ? 16 : 32;
    const finCount = lite ? 4 : 7;

    // Recessed matte-black cockpit tub & gunmetal canopy frame arch under smoked physical canopy
    out.push({
      mesh: transformMesh(bevelBoxMesh(0.44, 0.06, 1.54, 0.015), { pos: [0, 0.25, -0.40] }),
      materialIndex: 3
    });
    out.push({
      mesh: transformMesh(bevelBoxMesh(0.54, 0.045, 1.68, 0.014), { pos: [0, 0.265, -0.38] }),
      materialIndex: 0
    });
    if (!lite) {
      const archCurve = catmullRomSpline3([[0, 0.24, -1.26], [0, 0.535, -0.40], [0, 0.35, 0.46]], 8);
      out.push({
        mesh: tubeSweepMesh(archCurve.map((p) => [p[0], p[1], p[2], 0.022] as V4), 18),
        materialIndex: 0
      });
    }

    // Twin-prong forward Venturi hydrofoil cross-bridge & recessed cyan LiDAR seeker array
    const bridgeWingRaw = loftSectionsMesh(
      [
        [[-0.36, 0.02, -1.68], [-0.36, -0.02, -1.62], [-0.36, -0.03, -1.30], [-0.36, 0.03, -1.34]],
        [[-0.18, 0.03, -1.75], [-0.18, -0.02, -1.68], [-0.18, -0.033, -1.33], [-0.18, 0.04, -1.37]],
        [[0.0, 0.035, -1.78], [0.0, -0.02, -1.70], [0.0, -0.035, -1.34], [0.0, 0.045, -1.38]],
        [[0.18, 0.03, -1.75], [0.18, -0.02, -1.68], [0.18, -0.033, -1.33], [0.18, 0.04, -1.37]],
        [[0.36, 0.02, -1.68], [0.36, -0.02, -1.62], [0.36, -0.03, -1.30], [0.36, 0.03, -1.34]]
      ],
      true,
      false
    );
    out.push({ mesh: lite ? bridgeWingRaw : subdivideSmoothMesh(bridgeWingRaw, 1, 0.36), materialIndex: 0 });
    out.push({
      mesh: transformMesh(latheMesh([[0, -0.05], [0.038, -0.042], [0.055, -0.03], [0.062, 0.02], [0.034, 0.033], [0, 0.038]], lite ? 16 : 32), {
        pos: [0, 0.005, -1.76],
        rot: [-Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 4
    });

    // Dorsal gunmetal spine armor saddle & rear twin-bell thruster bulkhead
    // Streamlined sculpted fairings (`sculptStreamlinedHullMesh`, Taubin-faired) replace the former bevelled slab blocks
    out.push({
      mesh: transformMesh(
        sculptStreamlinedHullMesh(1.48, 0.38, 0.12, {
          noseSharpness: 0.5,
          tailTaper: 0.4,
          canopyBulge: 0.18,
          undersideFlat: 0.8,
          stations: lite ? 10 : 16,
          ringPoints: lite ? 14 : 22
        }),
        { pos: [0, 0.335, 1.12] }
      ),
      materialIndex: 0
    });
    out.push({
      mesh: transformMesh(
        sculptStreamlinedHullMesh(0.4, 1.06, 0.15, {
          noseSharpness: 0.42,
          tailTaper: 0.36,
          canopyBulge: 0.1,
          undersideFlat: 0.5,
          stations: lite ? 9 : 13,
          ringPoints: lite ? 16 : 26
        }),
        { pos: [0, 0.14, 1.92] }
      ),
      materialIndex: 0
    });

    // Twin sponson pearl livery flashes, outrigger mag-lev nacelles, aero winglets, copper heat-pipes & plasma shrouds
    for (const side of [-1, 1] as const) {
      // Pearl-ceramic Wipeout team nose flash along each forward catamaran prong
      const flashRaw = loftSectionsMesh(
        [
          [[side * 0.41, 0.04, -2.18], [side * 0.45, 0.03, -2.18], [side * 0.44, 0.015, -2.18]],
          [[side * 0.39, 0.095, -1.84], [side * 0.51, 0.074, -1.84], [side * 0.485, 0.05, -1.84]],
          [[side * 0.38, 0.14, -1.48], [side * 0.56, 0.11, -1.48], [side * 0.52, 0.08, -1.48]],
          [[side * 0.39, 0.17, -1.14], [side * 0.585, 0.134, -1.14], [side * 0.54, 0.102, -1.14]],
          [[side * 0.40, 0.19, -0.82], [side * 0.60, 0.15, -0.82], [side * 0.55, 0.12, -0.82]]
        ],
        true,
        false
      );
      out.push({ mesh: lite ? flashRaw : subdivideSmoothMesh(flashRaw, 1, 0.35), materialIndex: 6 });

      const nx = side * 0.96;
      const nacelleRaw = transformMesh(
        sculptStreamlinedHullMesh(2.58, 0.36, 0.28, {
          noseSharpness: 0.65,
          tailTaper: 0.34,
          canopyBulge: 0.14,
          undersideFlat: 0.22,
          stations: lite ? 12 : 20,
          ringPoints: lite ? 18 : 28
        }),
        { pos: [nx, 0.03, 0.22], rot: [0, Math.PI, 0] }
      );
      out.push({ mesh: nacelleRaw, materialIndex: 0 });

      // Canted razor-sleek twin-tail vertical stabilizer + wingtip aero-blade winglet
      const tailFinRaw = loftSectionsMesh(
        [
          [[side * 0.48, 0.18, 0.88], [side * 0.53, 0.17, 0.94], [side * 0.53, 0.17, 1.92], [side * 0.48, 0.18, 1.88]],
          [[side * 0.64, 0.50, 1.38], [side * 0.67, 0.49, 1.44], [side * 0.67, 0.46, 2.04], [side * 0.64, 0.47, 1.98]]
        ],
        true,
        false
      );
      out.push({ mesh: lite ? tailFinRaw : subdivideSmoothMesh(tailFinRaw, 1, 0.32), materialIndex: 6 });

      // Wingtip aero-blade winglet: a thin streamlined airfoil fin (was an extruded slab + bevelled box block)
      out.push({
        mesh: transformMesh(
          sculptStreamlinedHullMesh(0.74, 0.05, 0.4, {
            noseSharpness: 0.56,
            tailTaper: 0.3,
            canopyBulge: 0.08,
            undersideFlat: 0,
            stations: lite ? 9 : 14,
            ringPoints: lite ? 12 : 18
          }),
          { pos: [side * 1.26, 0.2, 1.04], rot: [0, side * 0.05, -side * 0.28] }
        ),
        materialIndex: 0
      });
      out.push({
        mesh: transformMesh(
          sculptStreamlinedHullMesh(0.2, 0.034, 0.34, {
            noseSharpness: 0.5,
            tailTaper: 0.4,
            canopyBulge: 0,
            undersideFlat: 0,
            stations: lite ? 7 : 10,
            ringPoints: lite ? 10 : 14
          }),
          { pos: [side * 1.3, 0.21, 1.1], rot: [0.22, 0, -side * 0.28] }
        ),
        materialIndex: 1
      });

      // Ventral mag-lev runner & cyan field strip under each catamaran hull + outrigger
      out.push({
        mesh: transformMesh(bevelBoxMesh(0.14, 0.042, 2.86, 0.01), { pos: [side * 0.48, -0.17, -0.12] }),
        materialIndex: 1
      });
      out.push({
        mesh: transformMesh(bevelBoxMesh(0.048, 0.018, 2.42, 0.005), { pos: [side * 0.48, -0.195, -0.12] }),
        materialIndex: 4
      });

      // Swept copper superconductor heat-pipe manifold linking prong intake to rear thruster plenum
      const pipePts = catmullRomSpline3(
        [
          [side * 0.44, 0.16, -1.16],
          [side * 0.66, 0.22, -0.26],
          [side * 0.70, 0.23, 0.72],
          [side * 0.48, 0.16, 1.66]
        ],
        lite ? 6 : 10
      );
      out.push({
        mesh: tubeSweepMesh(pipePts.map((p) => [p[0], p[1], p[2], 0.034] as V4), lite ? 10 : 18),
        materialIndex: 2
      });

      // Stacked machined titanium radiator cooling louvers along hull flank
      const finPoly: V2[] = [[0, -0.05], [0.22, -0.02], [0.25, 0.07], [0.04, 0.09]];
      for (let f = 0; f < finCount; f += 1) {
        const fz = -0.36 + (f / Math.max(1, finCount - 1)) * 1.40;
        out.push({
          mesh: transformMesh(extrudePolygonMesh(finPoly, 0.022, 0.004, true), {
            pos: [side * 0.56, 0.18, fz],
            scale: [side, 1, 1]
          }),
          materialIndex: 1
        });
      }

      // +Z Rear twin dark gunmetal parabolic shrouds with deeply recessed cyan/amber plasma nozzles
      const bellCurve = bezierCurve2([0.14, -0.22], [0.17, -0.04], [0.23, 0.12], [0.26, 0.28], lite ? 8 : 14);
      const bellProfile: V2[] = [[0.09, -0.22], ...bellCurve, [0.22, 0.28], [0.13, -0.02], [0.08, -0.18]];
      out.push({
        mesh: transformMesh(latheMesh(bellProfile, radSegs), {
          pos: [side * 0.44, 0.06, 1.90],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 0
      });
      out.push({
        mesh: transformMesh(latheMesh([[0.055, -0.08], [0.125, -0.04], [0.135, 0.05], [0.06, 0.06]], radSegs), {
          pos: [side * 0.44, 0.06, 1.88],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 4
      });
      out.push({
        mesh: transformMesh(latheMesh([[0, -0.06], [0.052, -0.03], [0.045, 0.03], [0, 0.045]], radSegs), {
          pos: [side * 0.44, 0.06, 1.85],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 5
      });
    }
    return out;
  });

  return assembleMultiMaterialNode("drone-trim", slots, mats, {
    castShadow: false,
    receiveShadow: false
  });
}

/** Smooth-normal wrap-around tinted cockpit canopy (`name: "drone-canopy"`, WebGPU-safe `material.physical`, `castShadow: false`). */
export function buildDroneCanopyNode(lite = false): ProceduralNodeBuilder {
  const spec = memoizeGeometry(`heatsink-port:drone-canopy:${lite ? "l" : "h"}`, () => {
    const ringPts = lite ? 16 : 28;
    const canopyRing = (z: number, wx: number, baseY: number, topY: number): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i < ringPts; i += 1) {
        const a = (i / ringPts) * Math.PI * 2;
        const sy = Math.sin(a);
        const y = sy >= 0 ? baseY + Math.pow(sy, 0.88) * (topY - baseY) : baseY + sy * 0.025;
        out.push([Math.cos(a) * wx, y, z]);
      }
      return out;
    };
    const canopyRaw = loftSectionsMesh(
      [
        canopyRing(-1.28, 0.05, 0.21, 0.24),
        canopyRing(-1.10, 0.135, 0.226, 0.335),
        canopyRing(-0.92, 0.20, 0.24, 0.42),
        canopyRing(-0.65, 0.256, 0.256, 0.49),
        canopyRing(-0.38, 0.28, 0.27, 0.53),
        canopyRing(-0.12, 0.268, 0.276, 0.514),
        canopyRing(0.14, 0.24, 0.28, 0.48),
        canopyRing(0.32, 0.175, 0.286, 0.42),
        canopyRing(0.48, 0.10, 0.29, 0.35)
      ],
      true,
      false
    );
    return mergeRawMeshes([subdivideSmoothMesh(canopyRaw, 1, 0.48)]);
  });

  return geometry.custom(spec, {
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
    [MAT_FLAP_CARPAINT, MAT_TITANIUM_BRUSHED, MAT_SEAL_RUBBER, MAT_NOZZLE_CYAN],
    { castShadow: false, receiveShadow: false }
  );
}

/**
 * Sculpted vectoring ion-thruster nozzle (`name: "drone-nozzle-${index}"`, `castShadow: false`).
 * Local `+Y` maps to `-X` rearward under `axisRotation("z", Math.PI / 2)` in `world.ts`.
 * Cyan/amber plasma injector cores are deeply recessed inside the dark gunmetal shroud (`y <= 0.05` vs `0.21` lip).
 */
export function buildDroneNozzleNode(index: number, lite = false): ProceduralNodeBuilder {
  const segs = lite ? 16 : 32;
  const bellCurve = bezierCurve2([0.095, -0.15], [0.132, -0.04], [0.168, 0.08], [0.196, 0.21], lite ? 6 : 12);
  const outerBell: V2[] = [
    ...bellCurve,
    [0.164, 0.21],
    [0.112, 0.02],
    [0.082, -0.13]
  ];
  const plasmaRing: V2[] = [
    [0.048, -0.10],
    [0.098, -0.06],
    [0.108, 0.045],
    [0.052, 0.055]
  ];
  const amberPilot: V2[] = [
    [0, -0.09],
    [0.046, -0.05],
    [0.042, 0.03],
    [0, 0.045]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(outerBell, segs), materialIndex: 0 },
    { mesh: latheMesh(plasmaRing, segs), materialIndex: 1 },
    { mesh: latheMesh(amberPilot, segs), materialIndex: 3 }
  ];
  if (!lite) {
    for (let p = 0; p < 6; p += 1) {
      const a = (p / 6) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028, 0.24, 0.046, 0.006), {
          pos: [Math.cos(a) * 0.158, 0.04, Math.sin(a) * 0.158],
          rot: [0, -a, -0.16]
        }),
        materialIndex: 2
      });
    }
  }
  return assembleMultiMaterialNode(
    `drone-nozzle-${index}`,
    slots,
    [MAT_GUNMETAL_STUDIO, MAT_NOZZLE_CYAN, MAT_TITANIUM_BRUSHED, MAT_NOZZLE_AMBER],
    { castShadow: false, receiveShadow: false }
  );
}

/** Sculpted counter-rotating mag-lev lift rotor (`name: "drone-rotor-${index}"`, `castShadow: false`). */
export function buildDroneRotorNode(index: number, lite = false): ProceduralNodeBuilder {
  const segs = lite ? 16 : 32;
  const hubCurve = bezierCurve2([0.115, -0.03], [0.135, 0.008], [0.092, 0.042], [0.025, 0.054], lite ? 5 : 9);
  const hubProfile: V2[] = [[0, -0.035], ...hubCurve, [0, 0.056]];
  const bladePoly: V2[] = [[0.08, -0.055], [0.54, -0.032], [0.56, 0.028], [0.10, 0.062]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(hubProfile, segs), materialIndex: 0 },
    { mesh: latheMesh([[0, 0.048], [0.038, 0.05], [0.055, 0.052], [0.032, 0.06], [0, 0.064]], lite ? 14 : 28), materialIndex: 2 }
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
    [MAT_GUNMETAL_STUDIO, MAT_TITANIUM_BRUSHED, MAT_NOZZLE_CYAN],
    { castShadow: false, receiveShadow: false }
  );
}

// ---------------------------------------------------------------------------
// 2. Rival Combat Craft / Strike Targets (Sentry Interceptor & Heavy Gunship)
// ---------------------------------------------------------------------------

/** High-visibility strike-target & hazard-barrel physical/emissive materials so shootables pop from 180+ m against canyon rock. */
const MAT_TARGET_ARMOR_CRIMSON: AuraMaterialSpec = material.carPaint({
  color: "#e11d48",
  roughness: 0.18,
  metallic: 0.36,
  clearcoat: 0.95,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.4,
  emissive: "#58081c",
  emissiveIntensity: 0.42
});

const MAT_TARGET_ARMOR_CYAN: AuraMaterialSpec = material.carPaint({
  color: "#22d3ee",
  roughness: 0.18,
  metallic: 0.38,
  clearcoat: 0.94,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.4,
  emissive: "#063a48",
  emissiveIntensity: 0.38
});

const MAT_TARGET_EYE_BLAZE: AuraMaterialSpec = material.emissive({
  color: "#3a0612",
  emissive: "#ff3358",
  emissiveIntensity: 3.6,
  roughness: 0.14,
  practical: true
});

const MAT_TARGET_IRIS_CYAN: AuraMaterialSpec = material.emissive({
  color: "#062c3a",
  emissive: "#54f4ff",
  emissiveIntensity: 3.4,
  roughness: 0.14,
  practical: true
});

const MAT_BARREL_CRIMSON: AuraMaterialSpec = material.carPaint({
  color: "#dc2626",
  roughness: 0.2,
  metallic: 0.3,
  clearcoat: 0.94,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.35,
  emissive: "#5c0814",
  emissiveIntensity: 0.46
});

const MAT_BARREL_RING_MAGENTA: AuraMaterialSpec = material.emissive({
  color: "#3a061c",
  emissive: "#ff2a7a",
  emissiveIntensity: 3.2,
  roughness: 0.18,
  practical: true
});

const MAT_BARREL_RING_AMBER: AuraMaterialSpec = material.emissive({
  color: "#341604",
  emissive: "#ffb020",
  emissiveIntensity: 3.2,
  roughness: 0.18,
  practical: true
});

const MAT_BARREL_CHEVRON_GOLD: AuraMaterialSpec = material.ceramic({
  color: "#ffd84d",
  roughness: 0.2,
  glaze: 0.84,
  emissive: "#4c3400",
  emissiveIntensity: 0.32
});

/**
 * Twin-rotor swept-wing interceptor sentry drone (`name: "target-${id}"`), facing `+Z` toward oncoming racer:
 * high-contrast electric-cyan & hazard-crimson armored plating, twin ducted wingtip rotors, and a blazing emissive bullseye core.
 */
export function buildSentryTargetNode(id: number, size: number, lite = false, casts = false): ProceduralNodeBuilder {
  const slots = memoizeSlots(`heatsink-port:sentry:${size.toFixed(3)}:${lite ? "l" : "h"}`, () => {
    const r = size * 0.5;
    const segs = lite ? 12 : 18;
    const out: MultiMatSlot[] = [];

    // Sculpted high-contrast cyan armored interceptor fuselage
    const coreProfile: V2[] = [
      [0, -r * 0.58],
      [r * 0.54, -r * 0.46],
      [r * 0.82, -r * 0.12],
      [r * 0.84, r * 0.14],
      [r * 0.52, r * 0.48],
      [0, r * 0.60]
    ];
    const coreRaw = latheMesh(coreProfile, segs);
    out.push({ mesh: lite ? coreRaw : subdivideSmoothMesh(coreRaw, 1, 0.38), materialIndex: 0 });

    // Oversized blazing crimson core eye + concentric cyan optic iris facing +Z
    out.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [r * 0.42, r * 0.05], [r * 0.46, r * 0.22], [0, r * 0.30]], segs),
        { pos: [0, 0, r * 0.66], rot: [Math.PI * 0.5, 0, 0] }
      ),
      materialIndex: 3
    });
    out.push({
      mesh: transformMesh(
        latheMesh([[r * 0.44, -r * 0.04], [r * 0.62, 0], [r * 0.62, r * 0.12], [r * 0.44, r * 0.14]], segs),
        { pos: [0, 0, r * 0.60], rot: [Math.PI * 0.5, 0, 0] }
      ),
      materialIndex: 4
    });

    // Dorsal crimson stabilizer crest
    const dorsalPoly: V2[] = [[-r * 0.16, r * 0.38], [r * 0.16, r * 0.38], [r * 0.08, r * 1.12], [-r * 0.08, r * 1.12]];
    out.push({
      mesh: transformMesh(extrudePolygonMesh(dorsalPoly, r * 0.12, r * 0.02, true), { pos: [0, 0, -r * 0.06] }),
      materialIndex: 1
    });

    // Swept crimson strike wings + twin wingtip ducted rotor shrouds + glowing cyan rotor rings + forward pulse barrels
    const wingPoly: V2[] = [[r * 0.42, -r * 0.10], [r * 1.34, -r * 0.24], [r * 1.28, r * 0.16], [r * 0.40, r * 0.22]];
    for (const sx of [-1, 1] as const) {
      out.push({
        mesh: transformMesh(extrudePolygonMesh(wingPoly, r * 0.12, r * 0.02, true), {
          scale: [sx, 1, 1],
          rot: [0, sx * -0.14, sx * -0.08]
        }),
        materialIndex: 1
      });
      // Twin ducted rotor shroud & glowing cyan plasma ring
      out.push({
        mesh: transformMesh(
          latheMesh([[r * 0.24, -r * 0.10], [r * 0.36, -r * 0.08], [r * 0.36, r * 0.08], [r * 0.24, r * 0.10]], segs),
          { pos: [sx * r * 1.18, -r * 0.12, -r * 0.04], rot: [0.18, 0, sx * -0.12] }
        ),
        materialIndex: 2
      });
      out.push({
        mesh: transformMesh(
          latheMesh([[r * 0.16, -r * 0.04], [r * 0.26, -r * 0.02], [r * 0.26, r * 0.04], [0, r * 0.06]], segs),
          { pos: [sx * r * 1.18, -r * 0.10, -r * 0.04], rot: [0.18, 0, sx * -0.12] }
        ),
        materialIndex: 4
      });
      // Forward pulse cannon barrel
      out.push({
        mesh: tubeSweepMesh(
          [
            [sx * r * 0.44, -r * 0.18, -r * 0.16, r * 0.085],
            [sx * r * 0.44, -r * 0.18, r * 0.84, r * 0.07],
            [sx * r * 0.44, -r * 0.18, r * 1.00, r * 0.095]
          ],
          lite ? 6 : 8
        ),
        materialIndex: 2
      });
    }
    return out;
  });

  return assembleMultiMaterialNode(
    `target-${id}`,
    slots,
    [MAT_TARGET_ARMOR_CYAN, MAT_TARGET_ARMOR_CRIMSON, MAT_TITANIUM_BRUSHED, MAT_TARGET_EYE_BLAZE, MAT_TARGET_IRIS_CYAN],
    { castShadow: casts, receiveShadow: false }
  );
}

/**
 * Swept-wing twin-rotor armored heavy AG strike gunship (`name: "target-${id}"`), distinct wide silhouette from sentry:
 * bright crimson & cyan armored plating, wide forward-swept strike wings, twin rotor/weapon sponsons, and blazing reactor eye.
 */
export function buildHeavyTargetNode(id: number, size: number, lite = false, casts = false): ProceduralNodeBuilder {
  const slots = memoizeSlots(`heatsink-port:heavy:${size.toFixed(3)}:${lite ? "l" : "h"}`, () => {
    const r = size * 0.5;
    const segs = lite ? 10 : 16;
    const out: MultiMatSlot[] = [];

    // Central crimson armored gunship fuselage (`loftSectionsMesh` + `subdivideSmoothMesh`)
    const bastionRaw = loftSectionsMesh(
      [
        chinedHullRing(-r * 0.98, r * 0.44, r * 0.32, -r * 0.26, 0, r * 0.06),
        chinedHullRing(-r * 0.36, r * 0.68, r * 0.46, -r * 0.36, r * 0.04, r * 0.09),
        chinedHullRing(r * 0.40, r * 0.66, r * 0.42, -r * 0.34, r * 0.02, r * 0.08),
        chinedHullRing(r * 1.00, r * 0.38, r * 0.26, -r * 0.20, 0, r * 0.05)
      ],
      true,
      false
    );
    out.push({ mesh: lite ? bastionRaw : subdivideSmoothMesh(bastionRaw, 1, 0.42), materialIndex: 1 });

    // Dorsal structural truss & cyan high-contrast armor saddle
    out.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [r * 1.62, r * 0.26, r * 0.66], bays: lite ? 3 : 4, chordRadius: r * 0.04 }),
        { pos: [0, r * 0.48, -r * 0.06] }
      ),
      materialIndex: 2
    });
    out.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.86, r * 0.14, r * 0.96, r * 0.03), { pos: [0, r * 0.38, 0.04] }),
      materialIndex: 0
    });

    // Oversized blazing multi-ring amber-crimson reactor core eye facing +Z
    out.push({
      mesh: transformMesh(icosphereFacetMesh(r * 0.40, 1, 0.04, 19), { pos: [0, r * 0.06, r * 0.84] }),
      materialIndex: 4
    });
    out.push({
      mesh: transformMesh(
        latheMesh([[r * 0.38, -r * 0.06], [r * 0.58, 0], [r * 0.58, r * 0.14], [r * 0.38, r * 0.16]], segs),
        { pos: [0, r * 0.06, r * 0.78], rot: [Math.PI * 0.5, 0, 0] }
      ),
      materialIndex: 3
    });

    // Swept strike wings + twin catamaran weapon/rotor sponsons + glowing wingtip beacons + quad plasma cannons
    const sweptWing: V2[] = [[r * 0.54, -r * 0.08], [r * 1.56, r * 0.06], [r * 1.48, r * 0.28], [r * 0.52, r * 0.22]];
    for (const sx of [-1, 1] as const) {
      out.push({
        mesh: transformMesh(extrudePolygonMesh(sweptWing, r * 0.14, r * 0.022, true), {
          scale: [sx, 1, 1],
          rot: [0, sx * 0.18, sx * 0.06]
        }),
        materialIndex: 0
      });
      const sponsonHull = transformMesh(
        sculptStreamlinedHullMesh(r * 1.62, r * 0.46, r * 0.48, {
          noseSharpness: 0.58,
          tailTaper: 0.38,
          canopyBulge: 0.16,
          undersideFlat: 0.24,
          stations: lite ? 10 : 18,
          ringPoints: lite ? 14 : 24
        }),
        { pos: [sx * r * 0.94, -r * 0.02, -r * 0.02] }
      );
      out.push({ mesh: sponsonHull, materialIndex: 1 });
      // Wingtip ducted lift-rotor halo
      out.push({
        mesh: transformMesh(
          latheMesh([[r * 0.18, -r * 0.06], [r * 0.32, -r * 0.04], [r * 0.32, r * 0.06], [0, r * 0.08]], segs),
          { pos: [sx * r * 1.42, r * 0.18, r * 0.12], rot: [0.22, 0, 0] }
        ),
        materialIndex: 4
      });
      for (const cy of [-r * 0.12, r * 0.12] as const) {
        out.push({
          mesh: tubeSweepMesh(
            [
              [sx * r * 0.94, cy, r * 0.44, r * 0.078],
              [sx * r * 0.94, cy, r * 1.08, r * 0.064],
              [sx * r * 0.94, cy, r * 1.20, r * 0.09]
            ],
            lite ? 6 : 8
          ),
          materialIndex: 2
        });
      }
    }
    return out;
  });

  return assembleMultiMaterialNode(
    `target-${id}`,
    slots,
    [MAT_TARGET_ARMOR_CYAN, MAT_TARGET_ARMOR_CRIMSON, MAT_TITANIUM_BRUSHED, MAT_TARGET_EYE_BLAZE, MAT_BARREL_RING_AMBER],
    { castShadow: casts, receiveShadow: false }
  );
}
// ---------------------------------------------------------------------------
// 3. Cryo-Coolant / Ion-Shield Pickups & Volatile Plasma Barrels
// ---------------------------------------------------------------------------

/** Cryo-coolant / ion-shield pickup cell (`name: "pickup-${i}"`, `castShadow: false`). */
export function buildPickupNode(i: number, shield: boolean, lite = false): ProceduralNodeBuilder {
  const slots = memoizeSlots(`heatsink-port:pickup:${shield ? "s" : "c"}:${lite ? "l" : "h"}`, () => {
    const h = shield ? 1.18 : 0.98;
    const r = shield ? 0.54 : 0.46;
    const segs = lite ? 12 : 18;
    const out: MultiMatSlot[] = [];

    for (const sy of [-1, 1] as const) {
      out.push({
        mesh: transformMesh(
          latheMesh([[0, 0], [r * 0.96, 0.02], [r * 1.04, 0.14], [r * 0.72, 0.24], [0, 0.26]], segs),
          { pos: [0, sy * (h - 0.26), 0], scale: [1, sy, 1] }
        ),
        materialIndex: 0
      });
    }

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
      out.push({ mesh: tubeSweepMesh(spine, 6), materialIndex: 1 });
    }

    out.push({
      mesh: shield
        ? icosphereFacetMesh(r * 0.56, 1, 0.05, 31)
        : latheMesh([[0, -h * 0.56], [r * 0.46, -h * 0.42], [r * 0.46, h * 0.42], [0, h * 0.56]], segs),
      materialIndex: 2
    });
    out.push({
      mesh: latheMesh([[r * 0.78, -h * 0.68], [r * 0.84, 0], [r * 0.78, h * 0.68]], segs),
      materialIndex: 3
    });
    return out;
  });

  return assembleMultiMaterialNode(
    `pickup-${i}`,
    slots,
    [MAT_TITANIUM_BRUSHED, MAT_HEATPIPE_COPPER, shield ? MAT_PLASMA_CYAN : MAT_REPAIR_EMERALD, MAT_CRYO_SLEEVE_GLASS],
    { castShadow: false, receiveShadow: false }
  );
}

/**
 * High-visibility volatile hazard-crimson plasma containment drum (`name: "barrel-${i}"`, `y in [-1.1, +1.18]`):
 * bright crimson armored корпус, glowing neon-amber & magenta plasma containment rings, and gold hazard chevrons.
 */
export function buildBarrelNode(i: number, lite = false, casts = false): ProceduralNodeBuilder {
  const slots = memoizeSlots(`heatsink-port:barrel:${lite ? "l" : "h"}`, () => {
    const segs = lite ? 12 : 18;
    const drumProfile: V2[] = [
      [0, -1.10],
      [0.76, -1.10],
      [0.84, -0.96],
      [0.79, -0.48],
      [0.85, -0.34],
      [0.78, 0.0],
      [0.85, 0.34],
      [0.79, 0.48],
      [0.84, 0.96],
      [0.76, 1.10],
      [0, 1.10]
    ];
    const out: MultiMatSlot[] = [{ mesh: latheMesh(drumProfile, segs), materialIndex: 0 }];

    // Glowing neon-magenta top/bottom plasma containment rings + blazing neon-amber waist ring
    for (const ry of [-0.94, 0.94] as const) {
      out.push({
        mesh: transformMesh(
          latheMesh([[0.77, -0.08], [0.91, -0.055], [0.91, 0.055], [0.77, 0.08]], segs),
          { pos: [0, ry, 0] }
        ),
        materialIndex: 1
      });
    }
    for (const gy of [-0.42, 0.0, 0.42] as const) {
      out.push({
        mesh: transformMesh(
          latheMesh([[0.77, -0.065], [0.89, -0.045], [0.89, 0.045], [0.77, 0.065]], segs),
          { pos: [0, gy, 0] }
        ),
        materialIndex: gy === 0.0 ? 1 : 2
      });
    }

    // High-contrast gold hazard chevron plates around the crimson drum circumference
    const chevCount = lite ? 4 : 6;
    for (let k = 0; k < chevCount; k += 1) {
      const ang = (k / chevCount) * Math.PI * 2;
      const cx = Math.sin(ang) * 0.85;
      const cz = Math.cos(ang) * 0.85;
      for (const arm of [-1, 1] as const) {
        out.push({
          mesh: transformMesh(bevelBoxMesh(0.24, 0.085, 0.055, 0.01), {
            pos: [cx + Math.cos(ang) * arm * 0.08, arm * 0.16, cz - Math.sin(ang) * arm * 0.08],
            rot: [0, ang, arm * 0.52]
          }),
          materialIndex: 3
        });
      }
    }

    // Glowing plasma pressure beacon cap on top
    out.push({
      mesh: transformMesh(
        latheMesh([[0, -0.02], [0.34, 0.0], [0.28, 0.12], [0, 0.16]], segs),
        { pos: [0, 1.08, 0] }
      ),
      materialIndex: 2
    });
    return out;
  });

  return assembleMultiMaterialNode(
    `barrel-${i}`,
    slots,
    [MAT_BARREL_CRIMSON, MAT_BARREL_RING_MAGENTA, MAT_BARREL_RING_AMBER, MAT_BARREL_CHEVRON_GOLD],
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

/** Aerodynamic diamond-foil cross-section ring oriented normal to an XY arch curve at `(cx, cy)` with tangent `(tx, ty)`. */
function aeroArchRibRing(cx: number, cy: number, cz: number, tx: number, ty: number, halfThick: number, halfChord: number): V3[] {
  const len = Math.max(1e-5, Math.hypot(tx, ty));
  const nx = -ty / len;
  const ny = tx / len;
  return [
    [cx + nx * halfThick, cy + ny * halfThick, cz],
    [cx + nx * halfThick * 0.28, cy + ny * halfThick * 0.28, cz + halfChord],
    [cx - nx * halfThick, cy - ny * halfThick, cz],
    [cx + nx * halfThick * 0.28, cy + ny * halfThick * 0.28, cz - halfChord]
  ];
}

/** Stratified basalt canyon mesas, cryo-vents, hyperbolic coolant towers/reactor domes, and Wipeout magnetic boost arches. */
export function buildSceneryInstancedNodes(buckets: SceneryBuckets, lite = false, casts = false): ProceduralNodeBuilder[] {
  const nodes: ProceduralNodeBuilder[] = [];
  const tierTag = lite ? "tier:/models-lite/" : "tier:/models/";
  const tierKey = lite ? "l" : "h";

  // A. Stratified Basalt Canyon Mesas + Overhanging Mineral Terrace Caps (~9 m tall)
  if (buckets.caps.length > 0) {
    const tfs = toInstanceTransforms(buckets.caps);
    const mesaSpec = memoizeGeometry(`heatsink-port:caps-mesa:${tierKey}`, () =>
      mergeRawMeshes([stratifiedCliffMesh({ radiusX: 3.4, radiusZ: 3.1, height: 8.4, terraces: lite ? 4 : 6, seed: 41 })])
    );
    const crestSpec = memoizeGeometry(`heatsink-port:caps-crest:${tierKey}`, () => {
      const capShelf = loftSectionsMesh(
        [
          chinedHullRing(0, 2.9, 7.6, 6.9, 7.2, 0.15).map(([x, y]) => [x, y, -2.4] as V3),
          chinedHullRing(0, 3.8, 8.9, 7.8, 8.3, 0.25).map(([x, y]) => [x, y, 0.0] as V3),
          chinedHullRing(0, 2.7, 8.5, 7.5, 8.0, 0.15).map(([x, y]) => [x, y, 2.4] as V3)
        ],
        true,
        true
      );
      return mergeRawMeshes([capShelf]);
    });
    nodes.push(
      instances
        .custom(mesaSpec, { name: "scenery-caps", material: MAT_INST_BASALT, transforms: tfs, castShadow: casts })
        .runtime({ id: "scenery-caps", tags: [tierTag] })
    );
    nodes.push(
      instances.custom(crestSpec, {
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
    const coralBaseSpec = memoizeGeometry(`heatsink-port:corals-base:${tierKey}`, () => {
      const baseParts: RawMesh[] = [stratifiedCliffMesh({ radiusX: 1.5, radiusZ: 1.4, height: 1.4, terraces: 3, seed: 73 })];
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
      }
      return mergeRawMeshes(baseParts);
    });
    const coralGlowSpec = memoizeGeometry(`heatsink-port:corals-glow:${tierKey}`, () => {
      const glowParts: RawMesh[] = [];
      const branches = lite ? 3 : 5;
      for (let b = 0; b < branches; b += 1) {
        const a = (b / branches) * Math.PI * 2 + 0.35;
        const reach = 0.65 + (b % 2) * 0.42;
        const topY = 2.9 + (b % 3) * 0.72;
        glowParts.push(
          transformMesh(latheMesh([[0, -0.18], [0.28, 0.04], [0.36, 0.24], [0, 0.34]], lite ? 8 : 12), {
            pos: [Math.cos(a) * reach, topY, Math.sin(a) * reach]
          })
        );
      }
      return mergeRawMeshes(glowParts);
    });
    nodes.push(instances.custom(coralBaseSpec, { name: "scenery-corals", material: MAT_INST_BASALT, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(coralGlowSpec, { name: "scenery-corals-glow", material: MAT_INST_CRYO_VIOLET, transforms: tfs, castShadow: false }));
  }

  // C. Hyperbolic Cryo-Coolant Towers & Geodesic Reactor Core Domes (~14 m tall)
  if (buckets.ruins.length > 0) {
    const tfs = toInstanceTransforms(buckets.ruins);
    const ruinShellSpec = memoizeGeometry(`heatsink-port:ruins-shell:${tierKey}`, () => {
      const towerProfile = bezierCurve2([3.2, 0], [1.95, 4.8], [1.75, 9.6], [2.45, 13.6], lite ? 6 : 10);
      const towerShell = latheMesh([[0, 0], ...towerProfile, [2.1, 13.6], [1.65, 8.2], [0, 8.2]], lite ? 12 : 18);
      const reactorDome = transformMesh(icosphereFacetMesh(2.55, 1, 0.03, 97), { pos: [0, 2.2, 0], scale: [1.18, 0.85, 1.18] });
      return mergeRawMeshes([towerShell, reactorDome]);
    });
    const ruinTrussSpec = memoizeGeometry(`heatsink-port:ruins-truss:${tierKey}`, () =>
      mergeRawMeshes([
        transformMesh(latticeTrussMesh({ span: [0.95, 13.4, 0.95], bays: lite ? 4 : 6, chordRadius: 0.08 }), { pos: [2.55, 6.7, 0] }),
        tubeSweepMesh([[-2.7, 0.4, 0, 0.22], [-2.05, 6.8, 0, 0.18], [-2.4, 13.1, 0, 0.20]], 7)
      ])
    );
    const ruinCoreSpec = memoizeGeometry(`heatsink-port:ruins-core:${tierKey}`, () =>
      mergeRawMeshes([transformMesh(latheMesh([[2.15, -0.24], [2.62, 0], [2.15, 0.24]], lite ? 12 : 18), { pos: [0, 13.4, 0] })])
    );

    nodes.push(instances.custom(ruinShellSpec, { name: "scenery-ruins", material: MAT_INST_REACTOR_SHELL, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(ruinTrussSpec, { name: "scenery-ruins-truss", material: MAT_HEATPIPE_COPPER, transforms: tfs, castShadow: false }));
    nodes.push(instances.custom(ruinCoreSpec, { name: "scenery-ruins-core", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false }));
  }

  // D. Razor-Sleek Wipeout Magnetic Boost Gates & Overhead Aero-Blade Spans (~12.4 m tall)
  if (buckets.arches.length > 0) {
    const tfs = toInstanceTransforms(buckets.arches);
    const archSpanSpec = memoizeGeometry(`heatsink-port:arches-span:${tierKey}`, () => {
      const archCurve = catmullRomSpline3(
        [[-5.55, 0.9, 0], [-4.45, 8.8, 0], [0, 12.4, 0], [4.45, 8.8, 0], [5.55, 0.9, 0]],
        lite ? 5 : 8
      );
      const spanParts: RawMesh[] = [];
      for (const cz of [-0.62, 0.62] as const) {
        const ribSections: V3[][] = archCurve.map((p, idx) => {
          const prev = archCurve[Math.max(0, idx - 1)]!;
          const next = archCurve[Math.min(archCurve.length - 1, idx + 1)]!;
          const t = idx / Math.max(1, archCurve.length - 1);
          const taper = 0.72 + Math.sin(t * Math.PI) * 0.42;
          return aeroArchRibRing(p[0], p[1], cz, next[0] - prev[0], next[1] - prev[1], 0.34 * taper, 0.26 * taper);
        });
        const ribRaw = loftSectionsMesh(ribSections, true, false);
        spanParts.push(lite ? ribRaw : subdivideSmoothMesh(ribRaw, 1, 0.42));
      }
      // Sleek overhead projector fairing + precision cross-truss bridge
      const crownRaw = loftSectionsMesh(
        [
          chinedHullRing(-0.92, 1.85, 12.62, 11.78, 12.18, 0.14),
          chinedHullRing(0.0, 2.35, 12.84, 11.72, 12.24, 0.18),
          chinedHullRing(0.92, 1.85, 12.62, 11.78, 12.18, 0.14)
        ],
        true,
        false
      );
      spanParts.push(lite ? crownRaw : subdivideSmoothMesh(crownRaw, 1, 0.38));
      spanParts.push(
        transformMesh(latticeTrussMesh({ span: [7.8, 0.84, 1.05], bays: lite ? 4 : 6, chordRadius: 0.065 }), { pos: [0, 11.25, 0] })
      );
      return mergeRawMeshes(spanParts);
    });

    const archFootSpec = memoizeGeometry(`heatsink-port:arches-foot:${tierKey}`, () =>
      mergeRawMeshes([
        transformMesh(stratifiedCliffMesh({ radiusX: 1.8, radiusZ: 1.6, height: 3.6, terraces: 3, seed: 53 }), { pos: [-5.5, 0, 0] }),
        transformMesh(stratifiedCliffMesh({ radiusX: 1.8, radiusZ: 1.6, height: 3.6, terraces: 3, seed: 61 }), { pos: [5.5, 0, 0] })
      ])
    );

    const archChevSpec = memoizeGeometry(`heatsink-port:arches-chev:${tierKey}`, () => {
      const chevPoly: V2[] = [[-0.92, 0.44], [0, -0.36], [0.92, 0.44], [0.60, 0.64], [0, 0.04], [-0.60, 0.64]];
      const chevParts: RawMesh[] = [
        transformMesh(extrudePolygonMesh(chevPoly, 0.26, 0.03, true), { pos: [0, 10.65, 0] }),
        transformMesh(extrudePolygonMesh(chevPoly, 0.20, 0.025, true), { pos: [-2.35, 10.1, 0], scale: [0.72, 0.72, 1], rot: [0, 0, 0.24] }),
        transformMesh(extrudePolygonMesh(chevPoly, 0.20, 0.025, true), { pos: [2.35, 10.1, 0], scale: [0.72, 0.72, 1], rot: [0, 0, -0.24] })
      ];
      return mergeRawMeshes(chevParts);
    });

    nodes.push(instances.custom(archSpanSpec, { name: "scenery-arches", material: MAT_INST_PYLON_ALLOY, transforms: tfs, castShadow: casts }));
    nodes.push(instances.custom(archFootSpec, { name: "scenery-arches-footings", material: MAT_INST_BASALT, transforms: tfs, castShadow: false }));
    nodes.push(instances.custom(archChevSpec, { name: "scenery-arches-chevrons", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false }));
  }

  return nodes;
}

/** Razor-Sleek Swept Aero-Blade Track Pylons & Holographic Chevron Gantries (`y in [0, 22]`, instanced). */
export function buildGatePylonInstancedNodes(
  transforms: readonly PylonTransform[],
  lite = false,
  casts = false
): ProceduralNodeBuilder[] {
  if (transforms.length === 0) return [];
  const tfs = transforms.map((t) => ({ position: t.position, rotation: t.rotation }));
  const tierKey = lite ? "l" : "h";

  const pylonAlloySpec = memoizeGeometry(`heatsink-port:gate-pylons-alloy:${tierKey}`, () => {
    // Sculpted chined anchor plinth (`y = 0 .. 4.6`)
    const plinthRaw = loftSectionsMesh(
      [
        [[-1.12, 0, -0.82], [0, 0, -1.16], [1.12, 0, -0.82], [1.12, 0, 0.82], [0, 0, 1.16], [-1.12, 0, 0.82]],
        [[-0.86, 2.4, -0.64], [0, 2.4, -0.92], [0.86, 2.4, -0.64], [0.86, 2.4, 0.64], [0, 2.4, 0.92], [-0.86, 2.4, 0.64]],
        [[-0.68, 4.6, -0.52], [0, 4.6, -0.74], [0.68, 4.6, -0.52], [0.68, 4.6, 0.52], [0, 4.6, 0.74], [-0.68, 4.6, 0.52]]
      ],
      true,
      false
    );
    const pylonParts: RawMesh[] = [lite ? plinthRaw : subdivideSmoothMesh(plinthRaw, 1, 0.36)];

    // Twin razor-sleek swept aero-blade vertical pylon fairings (`y = 3.8 .. 21.6`)
    for (const sz of [-1, 1] as const) {
      const bladeRaw = loftSectionsMesh(
        [
          [[-0.58, 3.8, sz * 0.42], [0.58, 3.8, sz * 0.42], [0.34, 3.8, sz * 0.86], [-0.34, 3.8, sz * 0.86]],
          [[-0.48, 10.2, sz * 0.38], [0.48, 10.2, sz * 0.38], [0.26, 10.2, sz * 0.94], [-0.26, 10.2, sz * 0.94]],
          [[-0.42, 16.8, sz * 0.34], [0.42, 16.8, sz * 0.34], [0.22, 16.8, sz * 0.78], [-0.22, 16.8, sz * 0.78]],
          [[-0.32, 21.4, sz * 0.24], [0.32, 21.4, sz * 0.24], [0.16, 21.4, sz * 0.52], [-0.16, 21.4, sz * 0.52]]
        ],
        true,
        false
      );
      pylonParts.push(lite ? bladeRaw : subdivideSmoothMesh(bladeRaw, 1, 0.42));
    }

    // Exposed precision core truss + cantilevered aerodynamic crown pod (`y = 20.4 .. 21.9`)
    pylonParts.push(
      transformMesh(latticeTrussMesh({ span: [0.88, 16.2, 0.68], bays: lite ? 6 : 9, chordRadius: 0.075 }), { pos: [0, 12.4, 0] })
    );
    const crownRaw = loftSectionsMesh(
      [
        chinedHullRing(-0.92, 0.62, 21.65, 20.25, 20.95, 0.12),
        chinedHullRing(0.0, 0.82, 21.85, 20.15, 21.00, 0.16),
        chinedHullRing(0.92, 0.58, 21.65, 20.25, 20.95, 0.12)
      ],
      true,
      false
    );
    pylonParts.push(lite ? crownRaw : subdivideSmoothMesh(crownRaw, 1, 0.38));

    for (const cy of [6.8, 12.2, 17.4] as const) {
      pylonParts.push(transformMesh(latheMesh([[0.58, -0.24], [0.86, 0], [0.58, 0.24]], lite ? 10 : 14), { pos: [0, cy, 0] }));
    }
    return mergeRawMeshes(pylonParts);
  });

  const pylonCopperSpec = memoizeGeometry(`heatsink-port:gate-pylons-copper:${tierKey}`, () =>
    mergeRawMeshes([
      tubeSweepMesh([[-0.64, 1.2, 0, 0.092], [-0.56, 11.0, 0, 0.082], [-0.62, 20.5, 0, 0.092]], 6),
      tubeSweepMesh([[0.64, 1.2, 0, 0.092], [0.56, 11.0, 0, 0.082], [0.62, 20.5, 0, 0.092]], 6)
    ])
  );

  const pylonChevSpec = memoizeGeometry(`heatsink-port:gate-pylons-chev:${tierKey}`, () => {
    const chevPoly: V2[] = [[-0.72, -0.38], [0, 0.36], [0.72, -0.38], [0.46, -0.56], [0, -0.04], [-0.46, -0.56]];
    const chevMeshes: RawMesh[] = [
      transformMesh(latheMesh([[0, 21.8], [0.54, 22.12], [0, 22.48]], lite ? 8 : 12), { pos: [0, 0, 0] })
    ];
    for (const hy of [8.8, 13.8, 18.6] as const) {
      chevMeshes.push(transformMesh(extrudePolygonMesh(chevPoly, 1.32, 0.04, true), { pos: [0, hy, 0], rot: [0, Math.PI * 0.5, 0] }));
    }
    return mergeRawMeshes(chevMeshes);
  });

  return [
    instances.custom(pylonAlloySpec, { name: "gate-pylons", material: MAT_INST_PYLON_ALLOY, transforms: tfs, castShadow: casts }),
    instances.custom(pylonCopperSpec, { name: "gate-pylons-copper", material: MAT_HEATPIPE_COPPER, transforms: tfs, castShadow: false }),
    instances.custom(pylonChevSpec, { name: "gate-pylons-chevrons", material: MAT_INST_CHEVRON_CYAN, transforms: tfs, castShadow: false })
  ];
}
