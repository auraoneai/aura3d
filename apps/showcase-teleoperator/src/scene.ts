import { camera, effects, game, instances, lights, looks, material, model, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";
import { assets, type GridAssetKey } from "./aura-assets";
import { RIVALS, TRAFFIC_SPECS } from "./sim";
import { CURB_BEACON_X, PLAYABLE_FLEET, PLAYABLE_IDS, SCENE_CAM_FOV_DEG, SCENE_CAM_POS, SCENE_CAM_TARGET, type PlayableCarId, type Vec3, type WeatherPreset } from "./rules";

export const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
export const HIDDEN_POS: Vec3 = [0, -90, 140];
export const IMPACT_SPARK_COUNT = 12;
export const DASH_ROWS = 14;
export const DASH_STRIDE_Z = 14;
export const DASH_LINES_X = [-5.4, 5.4] as const;
export const INTERSECTION_COUNT = 3;
export const BUILDING_PAIRS = 8;
export const BUILDING_STRIDE_Z = 34;
export const LAMP_PAIRS = 6;
export const LAMP_STRIDE_Z = 38;
export const PATH_RIBBON_COUNT = 9;

/** Road strips: long boxes that run the length of the avenue. Their world x goes through `viewX` every frame (C2). */
export const ROAD_STRIPS: ReadonlyArray<{ readonly id: string; readonly x: number; readonly y: number }> = [
  { id: "sf-avenue-asphalt", x: 0, y: -0.06 },
  { id: "sf-center-yellow-l", x: -0.18, y: 0.014 },
  { id: "sf-center-yellow-r", x: 0.18, y: 0.014 },
  { id: "sf-cable-rail-1", x: -3.8, y: 0.016 },
  { id: "sf-cable-rail-2", x: -2.6, y: 0.016 },
  { id: "sf-cable-rail-3", x: 2.8, y: 0.016 },
  { id: "sf-cable-rail-4", x: 4.0, y: 0.016 },
  { id: "sf-curb-left", x: -10.8, y: 0.11 },
  { id: "sf-curb-right", x: 10.8, y: 0.11 },
  { id: "sf-sidewalk-left", x: -15.2, y: 0.09 },
  { id: "sf-sidewalk-right", x: 15.2, y: 0.09 }
];

// Street-front building models (facade on +Z in the file). Left blocks are yawed +90 degrees and right blocks -90 degrees so
// the facade faces the road; "depth" runs along the file's z axis (away from the road) and "frontage" along its x axis.
export const BUILDING_SPECS = [
  { key: "gridBldgVictorian", x: 0.912, y: 1.737, z: 1.918 },
  { key: "gridBldgGlassTower", x: 0.844, y: 1.902, z: 0.87 },
  { key: "gridBldgMidrise", x: 1.85, y: 1.893, z: 1.641 },
  { key: "gridBldgArtDeco", x: 0.952, y: 1.902, z: 0.951 }
] as const satisfies ReadonlyArray<{ key: GridAssetKey; x: number; y: number; z: number }>;
const BUILDING_ROAD_EDGE_X = 19.5;
const BUILDING_MAX_DEPTH = 24;
const BUILDING_MAX_FRONTAGE = 30;

export function buildingLayout(spec: (typeof BUILDING_SPECS)[number], targetHeight: number): { scale: number; maxDim: number; centerX: number; height: number } {
  const scale = Math.min(targetHeight / spec.y, BUILDING_MAX_DEPTH / spec.z, BUILDING_MAX_FRONTAGE / spec.x);
  return { scale, maxDim: Math.max(spec.x, spec.y, spec.z) * scale, centerX: BUILDING_ROAD_EDGE_X + (spec.z * scale) / 2, height: spec.y * scale };
}
export const buildingLayoutLeft = (i: number) => buildingLayout(BUILDING_SPECS[i % BUILDING_SPECS.length]!, 18 + ((i * 7) % 22));
export const buildingLayoutRight = (i: number) => buildingLayout(BUILDING_SPECS[(i + 1) % BUILDING_SPECS.length]!, 20 + ((i * 11) % 24));

// A missing building GLB must never take the whole scene down: the production build only copies manifest-admitted assets, and
// a 404 here rejects auraApp.ready() (4.3.0 shipped a black canvas that way). Unreachable models get a plain box instead.
const buildingModelReachable: Record<string, boolean> = {};
export async function probeBuildingModels(): Promise<void> {
  await Promise.all(
    BUILDING_SPECS.map(async (spec) => {
      try {
        const res = await fetch(assets[spec.key].url, { method: "HEAD", cache: "force-cache" });
        buildingModelReachable[spec.key] = res.ok && !/text\/html/i.test(res.headers.get("content-type") ?? "");
      } catch {
        buildingModelReachable[spec.key] = false;
      }
    })
  );
  const missing = BUILDING_SPECS.filter((spec) => buildingModelReachable[spec.key] === false).map((spec) => spec.key);
  if (missing.length) console.error(`[grid-dispatch] building models unreachable, using box fallbacks: ${missing.join(", ")}`);
}

const buildingFallbackMat = material.pbr({ color: "#94a3b8", roughness: 0.82, metalness: 0.05 });
function buildingNode(spec: (typeof BUILDING_SPECS)[number], name: string, lay: ReturnType<typeof buildingLayout>, x: number, z: number) {
  if (buildingModelReachable[spec.key] === false) {
    const k = lay.maxDim / Math.max(spec.x, spec.y, spec.z);
    return primitives.box({ name, size: [spec.z * k, spec.y * k, spec.x * k], material: buildingFallbackMat }).position(x, (spec.y * k) / 2, z);
  }
  return model(assets[spec.key], { name, role: "setDressing", scaleMode: "fit", targetMaxDimension: lay.maxDim }).position(x, 0, z);
}

export const PLAYER_ASSET: Readonly<Record<PlayableCarId, GridAssetKey>> = {
  cruiser: "gridCruiser",
  coupe: "gridCoupe",
  truck: "gridTruck",
  gt: "gridGt",
  interceptor: "gridInterceptor"
};

interface WeatherLook {
  readonly look: "outdoor-day" | "golden-hour" | "overcast" | "night-city";
  readonly fogDensityScale: number;
  readonly exposureEv: number;
  readonly sky: string;
  readonly horizonEmissive: string;
  readonly horizonIntensity: number;
  readonly sunColor: string;
  readonly sunY: number;
  readonly ground: string;
  readonly water: string;
  readonly sun: { readonly color: string; readonly intensity: number; readonly position: Vec3 };
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  readonly fill: { readonly color: string; readonly intensity: number; readonly position: Vec3 };
  readonly bloom: number;
  readonly label: string;
}

/** Each sky preset brings its own look, lights and fog, so the lighting matches the sky (C8). */
export const WEATHER: Readonly<Record<WeatherPreset, WeatherLook>> = {
  noon: {
    look: "outdoor-day", fogDensityScale: 0, exposureEv: 0, sky: "#69abe0", horizonEmissive: "#bae6fd", horizonIntensity: 0.35, sunColor: "#fde047", sunY: 58, ground: "#1e293b", water: "#0c4a6e",
    sun: { color: "#fff1d6", intensity: 2.45, position: [36, 62, -48] }, hemisphere: { sky: "#8ed0ff", ground: "#2d3748", intensity: 0.92 },
    fill: { color: "#3fd6c6", intensity: 1.65, position: [6, 5, -18] }, bloom: 0.24, label: "Sunny noon"
  },
  golden: {
    look: "golden-hour", fogDensityScale: 0.6, exposureEv: 0, sky: "#d97757", horizonEmissive: "#fb923c", horizonIntensity: 0.45, sunColor: "#f97316", sunY: 28, ground: "#271c24", water: "#1e3a5f",
    sun: { color: "#ffb070", intensity: 1.7, position: [70, 20, -60] }, hemisphere: { sky: "#ffcf9a", ground: "#3b2a2a", intensity: 0.6 },
    fill: { color: "#ffb347", intensity: 1.2, position: [6, 5, -18] }, bloom: 0.3, label: "Golden hour"
  },
  fog: {
    look: "overcast", fogDensityScale: 1.4, exposureEv: 0, sky: "#94a3b8", horizonEmissive: "#cbd5e1", horizonIntensity: 0.3, sunColor: "#e2e8f0", sunY: 46, ground: "#334155", water: "#3b5266",
    sun: { color: "#e2e8f0", intensity: 0.9, position: [36, 62, -48] }, hemisphere: { sky: "#cbd5e1", ground: "#475569", intensity: 0.7 },
    fill: { color: "#cbd5e1", intensity: 0.8, position: [6, 5, -18] }, bloom: 0.18, label: "Marine fog"
  },
  night: {
    look: "night-city", fogDensityScale: 1, exposureEv: 0, sky: "#090d16", horizonEmissive: "#1e293b", horizonIntensity: 0.25, sunColor: "#cbd5e1", sunY: 64, ground: "#0b0f19", water: "#081c2e",
    sun: { color: "#7d9dd4", intensity: 0.35, position: [-30, 60, -40] }, hemisphere: { sky: "#1e3a5f", ground: "#0b0f19", intensity: 0.25 },
    fill: { color: "#ffd9a0", intensity: 2.2, position: [0, 3.2, -9] }, bloom: 0.42, label: "Neon night"
  }
};

const placed = (items: ReadonlyArray<readonly [number, number, number]>): AuraTransformSpec[] => items.map(([x, y, z]) => ({ position: [x, y, z] }));

export function buildGridDispatchScene(weather: WeatherPreset): ReturnType<typeof scene> {
  const w = WEATHER[weather];
  const s = scene()
    .add(looks.preset(w.look, { fogDensityScale: w.fogDensityScale, exposureEv: w.exposureEv }))
    .background(w.sky)
    .camera(camera.perspective({ fov: SCENE_CAM_FOV_DEG, near: 0.25, far: 620, position: SCENE_CAM_POS, target: SCENE_CAM_TARGET }))
    // No ambient light: the look's HDRI already fills the shadows, and an extra ambient blew out the white hero car (C14).
    .add(lights.hemisphere({ skyColor: w.hemisphere.sky, groundColor: w.hemisphere.ground, intensity: w.hemisphere.intensity }))
    .add(lights.directional({ color: w.sun.color, intensity: w.sun.intensity, position: w.sun.position, shadow: true }))
    .add(lights.point({ color: w.fill.color, intensity: w.fill.intensity, position: w.fill.position, distance: 65 }))
    .add(effects.bloom({ intensity: w.bloom, threshold: 0.78, radius: 0.45 }))
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.65 }))
    .add(effects.colorGrade({ contrast: 1.06, saturation: 1.1 }));

  // 1. Ground, bay, avenue asphalt, centre line, cable-car rails, kerbs and pavements
  const brassRailMat = material.pbr({ color: "#b59449", metalness: 0.82, roughness: 0.28 });
  const graniteCurbMat = material.pbr({ color: "#94a3b8", roughness: 0.72, metalness: 0.08 });
  const sidewalkMat = material.pbr({ color: "#475569", roughness: 0.85, metalness: 0.05 });
  const yellowMat = material.emissive({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 0.42 });
  const stripSize: Record<string, [number, number, number]> = {
    "sf-avenue-asphalt": [21.6, 0.12, 420],
    "sf-center-yellow-l": [0.12, 0.02, 420],
    "sf-center-yellow-r": [0.12, 0.02, 420],
    "sf-curb-left": [0.45, 0.22, 420],
    "sf-curb-right": [0.45, 0.22, 420],
    "sf-sidewalk-left": [8.5, 0.18, 420],
    "sf-sidewalk-right": [8.5, 0.18, 420]
  };
  const stripMat = (id: string) =>
    id === "sf-avenue-asphalt" ? material.pbr({ color: "#1e232d", roughness: 0.82, metalness: 0.08 })
      : id.startsWith("sf-center-yellow") ? yellowMat
        : id.startsWith("sf-cable-rail") ? brassRailMat
          : id.startsWith("sf-curb") ? graniteCurbMat
            : sidewalkMat;
  s.addMany([
    primitives.box({ name: "sf-peninsula-ground", size: [1400, 0.2, 620], material: material.pbr({ color: w.ground, roughness: 0.94 }) }).position(0, -0.25, -180).runtime(game.runtimeNode("sf-peninsula-ground")),
    primitives.box({ name: "sf-bay-water", size: [1400, 0.08, 220], material: material.pbr({ color: w.water, roughness: 0.22, metalness: 0.45 }) }).position(0, -0.1, -330).runtime(game.runtimeNode("sf-bay-water")),
    ...ROAD_STRIPS.map((strip) =>
      primitives.box({ name: strip.id, size: stripSize[strip.id] ?? [0.09, 0.025, 420], material: stripMat(strip.id) }).position(strip.x, strip.y, -160).runtime(game.runtimeNode(strip.id))
    ),
    primitives.box({ name: "sf-horizon-sky", size: [1400, 340, 2], material: material.emissive({ color: w.sky, emissive: w.horizonEmissive, emissiveIntensity: w.horizonIntensity }) }).position(0, 72, -350).runtime(game.runtimeNode("sf-horizon-sky")),
    primitives.sphere({ name: "sf-sun-disc", size: [26, 26, 4], material: material.emissive({ color: w.sunColor, emissive: w.sunColor, emissiveIntensity: weather === "night" ? 0.9 : 1.65 }) }).position(42, w.sunY, -320).runtime(game.runtimeNode("sf-sun-disc"))
  ]);

  // 2. Skyline landmarks: a white pyramid tower, a glass obelisk and two suspension-bridge towers on the bay
  const pyramidMat = material.pbr({ color: "#f1f5f9", roughness: 0.42, metalness: 0.18 });
  const glassMat = material.pbr({ color: "#38bdf8", roughness: 0.18, metalness: 0.72 });
  const bridgeMat = material.pbr({ color: "#c0362c", roughness: 0.48, metalness: 0.35 });
  s.addMany([
    primitives.cylinder({ name: "sf-pyramid-spire", size: [22, 145, 22], material: pyramidMat }).position(44, 72, -210),
    primitives.box({ name: "sf-pyramid-wing", size: [28, 78, 8], material: pyramidMat }).position(44, 39, -210),
    primitives.sphere({ name: "sf-pyramid-crown", size: [3.2, 5.5, 3.2], material: material.emissive({ color: "#e0f2fe", emissive: "#3fd6c6", emissiveIntensity: 2.2 }) }).position(44, 145, -210),
    primitives.cylinder({ name: "sf-glass-obelisk", size: [22, 158, 22], material: glassMat }).position(-48, 79, -235),
    primitives.cylinder({ name: "sf-glass-obelisk-crown", size: [18.5, 16, 18.5], material: material.emissive({ color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 1.65 }) }).position(-48, 162, -235),
    instances.box({ name: "sf-bridge-towers", size: [3.5, 118, 3.5], material: bridgeMat, transforms: placed([[-96, 59, -315], [-78, 59, -315], [78, 59, -315], [96, 59, -315]]) }),
    instances.box({ name: "sf-bridge-struts", size: [21, 3.2, 3.8], material: bridgeMat, transforms: placed([[-87, 108, -315], [-87, 78, -315], [87, 108, -315]]) }),
    primitives.box({ name: "sf-bridge-deck", size: [260, 2.2, 12], material: bridgeMat }).position(0, 36, -315)
  ]);

  // 3. Skyline and overpass models
  s.addMany([
    model(assets.gridSkylineTowerL, { name: "sf-skyline-tower-l", role: "setDressing", scaleMode: "fit", targetMaxDimension: 72 }).position(-58, 0, -145),
    model(assets.gridSkylineTowerT, { name: "sf-skyline-tower-t", role: "setDressing", scaleMode: "fit", targetMaxDimension: 68 }).position(58, 0, -135),
    model(assets.gridSkylineTowerX, { name: "sf-skyline-tower-x", role: "setDressing", scaleMode: "fit", targetMaxDimension: 74 }).position(-62, 0, -255),
    model(assets.gridBayOverpass, { name: "sf-bay-overpass", role: "setDressing", scaleMode: "fit", targetMaxDimension: 64 }).position(0, 0, -275)
  ]);

  // 4. Repeated street furniture as instanced nodes (C12): lane dashes, intersections, signal masts, lamps and trees.
  // main.ts rewrites every instance transform each frame (setInstances), so the initial transforms only size the pools.
  const dashMat = material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.45 });
  const zebraMat = material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.4 });
  const signalPoleMat = material.pbr({ color: "#334155", metalness: 0.72, roughness: 0.32 });
  const signalHeadMat = material.emissive({ color: "#43d17a", emissive: "#43d17a", emissiveIntensity: 2.1 });
  const lampMat = material.emissive({ color: "#fef3c7", emissive: "#fbbf24", emissiveIntensity: weather === "night" ? 2.4 : 1.55 });
  const pool = (n: number): AuraTransformSpec[] => Array.from({ length: n }, (_, i) => ({ position: [0, -50, 200 + i] }));
  s.addMany([
    instances.box({ name: "sf-dashes", size: [0.14, 0.02, 4.2], material: dashMat, transforms: pool(DASH_ROWS * DASH_LINES_X.length) }).runtime(game.runtimeNode("sf-dashes")),
    instances.box({ name: "sf-cross-roads", size: [140, 0.03, 14], material: material.pbr({ color: "#222834", roughness: 0.84 }), transforms: pool(INTERSECTION_COUNT) }).runtime(game.runtimeNode("sf-cross-roads")),
    instances.box({ name: "sf-crosswalks", size: [19.6, 0.035, 2.2], material: zebraMat, transforms: pool(INTERSECTION_COUNT * 2) }).runtime(game.runtimeNode("sf-crosswalks")),
    instances.cylinder({ name: "sf-signal-poles", size: [0.24, 6.8, 0.24], material: signalPoleMat, transforms: pool(INTERSECTION_COUNT * 2) }).runtime(game.runtimeNode("sf-signal-poles")),
    instances.box({ name: "sf-signal-arms", size: [5.6, 0.16, 0.16], material: signalPoleMat, transforms: pool(INTERSECTION_COUNT * 2) }).runtime(game.runtimeNode("sf-signal-arms")),
    instances.sphere({ name: "sf-signal-lights", size: [0.52, 0.52, 0.52], material: signalHeadMat, transforms: pool(INTERSECTION_COUNT * 2) }).runtime(game.runtimeNode("sf-signal-lights")),
    instances.cylinder({ name: "sf-lamp-poles", size: [0.16, 6.2, 0.16], material: signalPoleMat, transforms: pool(LAMP_PAIRS * 2) }).runtime(game.runtimeNode("sf-lamp-poles")),
    instances.sphere({ name: "sf-lamp-globes", size: [0.42, 0.42, 0.42], material: lampMat, transforms: pool(LAMP_PAIRS * 2) }).runtime(game.runtimeNode("sf-lamp-globes")),
    instances.cylinder({ name: "sf-tree-trunks", size: [0.28, 3.2, 0.28], material: material.pbr({ color: "#5c4033", roughness: 0.88 }), transforms: pool(LAMP_PAIRS) }).runtime(game.runtimeNode("sf-tree-trunks")),
    instances.sphere({ name: "sf-tree-crowns", size: [2.6, 3.1, 2.6], material: material.pbr({ color: "#15803d", roughness: 0.78 }), transforms: pool(LAMP_PAIRS) }).runtime(game.runtimeNode("sf-tree-crowns"))
  ]);

  // 5. Street-front buildings
  for (let i = 0; i < BUILDING_PAIRS; i++) {
    const bz = -18 - i * BUILDING_STRIDE_Z;
    const spec = BUILDING_SPECS[i % BUILDING_SPECS.length]!;
    const specR = BUILDING_SPECS[(i + 1) % BUILDING_SPECS.length]!;
    const lay = buildingLayoutLeft(i);
    const layR = buildingLayoutRight(i);
    s.addMany([
      buildingNode(spec, `sf-bldg-l-${i}`, lay, -lay.centerX, bz).runtime(game.runtimeNode(`sf-bldg-l-${i}`)),
      buildingNode(specR, `sf-bldg-r-${i}`, layR, layR.centerX, bz).runtime(game.runtimeNode(`sf-bldg-r-${i}`))
    ]);
  }

  // 6. Kerb beacon (ring, floor disc, beam, core), the waiting passenger and the route ribbon
  const beaconTealMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.1 });
  const beaconBeamMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.35 });
  s.addMany([
    instances.box({ name: "route-ribbons", size: [1.35, 0.03, 3.2], material: beaconTealMat, transforms: pool(PATH_RIBBON_COUNT) }).runtime(game.runtimeNode("route-ribbons")),
    primitives.torus({ name: "taxi-beacon-ring", size: [2.1, 2.1, 0.14], material: beaconTealMat }).position(CURB_BEACON_X, 0.08, -38).runtime(game.runtimeNode("taxi-beacon-ring")),
    primitives.cylinder({ name: "taxi-beacon-disc", size: [1.85, 0.04, 1.85], material: beaconBeamMat }).position(CURB_BEACON_X, 0.04, -38).runtime(game.runtimeNode("taxi-beacon-disc")),
    primitives.cylinder({ name: "taxi-beacon-beam", size: [0.42, 34, 0.42], material: beaconBeamMat }).position(CURB_BEACON_X, 17, -38).runtime(game.runtimeNode("taxi-beacon-beam")),
    primitives.cylinder({ name: "taxi-beacon-core", size: [0.16, 36, 0.16], material: material.emissive({ color: "#ffffff", emissive: "#8ff0e6", emissiveIntensity: 2.4 }) }).position(CURB_BEACON_X, 18, -38).runtime(game.runtimeNode("taxi-beacon-core")),
    primitives.cylinder({ name: "taxi-passenger-body", size: [0.44, 1.35, 0.34], material: material.pbr({ color: "#38bdf8", roughness: 0.55 }) }).position(11.35, 0.88, -38).runtime(game.runtimeNode("taxi-passenger-body")),
    primitives.sphere({ name: "taxi-passenger-head", size: [0.34, 0.36, 0.34], material: material.pbr({ color: "#fde68a", roughness: 0.6 }) }).position(11.35, 1.76, -38).runtime(game.runtimeNode("taxi-passenger-head")),
    primitives.box({ name: "taxi-passenger-arm", size: [0.14, 0.58, 0.14], material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.2 }) }).position(11.05, 1.55, -38).runtime(game.runtimeNode("taxi-passenger-arm"))
  ]);

  // 7. Five playable cars (one shown at a time) and the impact sparks
  s.addMany([
    ...PLAYABLE_IDS.map((id, i) =>
      model(assets[PLAYER_ASSET[id]], { name: `player-car-${id}`, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET[id].maxDim })
        .position(i === 0 ? 0 : HIDDEN_POS[0], i === 0 ? 0 : HIDDEN_POS[1], i === 0 ? -0.8 : HIDDEN_POS[2])
        .scale(i === 0 ? [1, 1, 1] : HIDDEN_SCALE)
        .runtime(game.runtimeNode(`player-car-${id}`, i === 0 ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined))
    ),
    instances.sphere({ name: "impact-sparks", size: [0.16, 0.16, 0.16], material: material.emissive({ color: "#fff3c4", emissive: "#ffb347", emissiveIntensity: 3.2 }), transforms: pool(IMPACT_SPARK_COUNT) }).runtime(game.runtimeNode("impact-sparks"))
  ]);

  // 8. Five AI rivals and ten traffic cars
  RIVALS.forEach((r, k) => {
    s.add(model(assets[r.asset], { name: `rival-car-${k}`, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: r.maxDim }).position(r.laneX, 0, r.z).runtime(game.runtimeNode(`rival-car-${k}`)));
  });
  TRAFFIC_SPECS.forEach((t, i) => {
    s.add(model(assets[t.asset], { name: `traffic-${i}`, role: "setDressing", scaleMode: "fit", targetMaxDimension: t.maxDim }).position(0, 0, -80).runtime(game.runtimeNode(`traffic-${i}`)));
  });
  return s;
}
