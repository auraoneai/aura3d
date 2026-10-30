import { camera, defineAuraAssets, effects, environments, game, instances, lights, material, model, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";
import { assets, type GridAssetKey } from "./aura-assets";
import { KEY_SHADOW, SKY_LOOKS, hdriUrl, keyLightPosition, type HdriId, type SkyLook } from "./look";
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
  /** Clear colour behind the sky node (shown only if the sky node does not draw). */
  readonly sky: string;
  readonly label: string;
}

/**
 * Clear colour per sky. GU47 GD-01/GD-04/GD-08: the lights (IBL, key, hemisphere), the sky and the post stack come from
 * the look table (`SKY_LOOKS` in look.ts), not from a `looks.preset`, a box sky or a sun sphere.
 */
export const WEATHER: Readonly<Record<WeatherPreset, WeatherLook>> = {
  noon: { sky: "#69abe0", label: "Sunny noon" },
  golden: { sky: "#c98a5a", label: "Golden hour" },
  fog: { sky: "#94a3b8", label: "Marine fog" },
  night: { sky: "#0d1424", label: "Neon night" }
};

/** Image-based fill per sky (E-A catalogue HDRIs, `/hdri/<id>_1k.hdr`); never the visible background (GD-01). */
export const SKY_HDRI = defineAuraAssets({
  gridHdriDusk: { type: "texture", format: "hdr", url: hdriUrl("belfast_sunset_puresky") },
  gridHdriNoon: { type: "texture", format: "hdr", url: hdriUrl("outdoor-midday") },
  gridHdriFog: { type: "texture", format: "hdr", url: hdriUrl("autumn_field_puresky") },
  gridHdriNight: { type: "texture", format: "hdr", url: hdriUrl("cobblestone_street_night") }
});
const HDRI_BY_ID: Readonly<Record<HdriId, keyof typeof SKY_HDRI>> = {
  belfast_sunset_puresky: "gridHdriDusk",
  "outdoor-midday": "gridHdriNoon",
  autumn_field_puresky: "gridHdriFog",
  cobblestone_street_night: "gridHdriNight"
};

/**
 * GD-01: the explicit rig of one sky in place of `looks.preset`: the sky's own HDRI as IBL fill, one shadowed key on the
 * visible sun's ray (2048 map, 3 cascades, PCSS) and a hemisphere. No ambient light and no coloured fill point (the old
 * teal fill leaked the objective colour into the noon light).
 */
export function skyRig(look: SkyLook) {
  return [
    environments.hdri({ name: `grid ibl ${look.hdri.id}`, texture: SKY_HDRI[HDRI_BY_ID[look.hdri.id]], intensity: look.hdri.intensity, rotation: (look.hdri.rotationDeg * Math.PI) / 180, background: false }),
    lights.hemisphere({ name: "grid hemisphere", skyColor: look.hemisphere.sky, groundColor: look.hemisphere.ground, intensity: look.hemisphere.intensity }),
    lights.directional({ name: "grid key light", color: look.key.color, intensity: look.key.intensity, position: keyLightPosition(look), target: [0, 0, 0], shadow: KEY_SHADOW })
  ] as const;
}

/**
 * GD-04: the real sky of one row (E-G sky node, A3D_QR_VFX_SKY): a dusk gradient `#2b3a55` to `#f2a65e` with the low sun,
 * a Preetham noon (turbidity 3), a grey fog gradient, a dark night gradient with a sodium horizon band and typed stars.
 * The sun disc sits on the key light's ray. The HDRI stays the IBL (`captureEnvironment: false`).
 */
export function skyNode(look: SkyLook) {
  const sun = { elevationDeg: look.sun.elevationDeg, azimuthDeg: look.sun.azimuthDeg, color: look.sun.color, intensity: look.sun.intensity, discSize: look.sun.discSize };
  const spec = look.sky;
  if (spec.model === "preetham") {
    return sky.preetham({ name: "grid sky", sun, turbidity: spec.turbidity, rayleigh: spec.rayleigh, mieCoefficient: spec.mieCoefficient, mieDirectionalG: spec.mieDirectionalG, groundColor: spec.groundColor, captureEnvironment: false, affectsFog: true });
  }
  return sky.gradient({
    name: "grid sky",
    zenith: spec.zenith,
    horizon: spec.horizon,
    ground: spec.ground,
    exponent: spec.exponent,
    horizonGlow: spec.horizonGlow,
    ...(look.sun.intensity > 0 ? { sun } : {}),
    ...(spec.bands ? { bands: spec.bands } : {}),
    ...(spec.stars ? { stars: spec.stars } : {}),
    captureEnvironment: false,
    affectsFog: true
  });
}

/**
 * GD-05: the row's height fog (A3D_QR_VFX_FOG): slate-teal distance haze that keeps the near street clear and greys the
 * bay and the skyline; it also fogs the sky (`affectsBackground`). The marine deck aloft is drawn by the sensor pass
 * (`scanPulse.ts`), see `SkyLook.fog`.
 */
export function marineHaze(look: SkyLook) {
  const f = look.fog;
  // C-21 fog fields ride through `effects.fog` as data; `mode` there is typed by the shared effect node (anti-alias modes).
  const spec: Record<string, unknown> = {
    name: "grid marine haze",
    mode: "height",
    color: f.color,
    density: f.density,
    heightDensity: f.heightDensity,
    heightFalloff: f.heightFalloff,
    heightReference: f.heightReference,
    start: f.start,
    maxOpacity: f.maxOpacity,
    sunInscatter: f.sunInscatter,
    anisotropy: 0.6,
    affectsBackground: true
  };
  return effects.fog(spec as Parameters<typeof effects.fog>[0]);
}

/**
 * GD-08: the post stack of one row: bloom (noon threshold 0.95 keeps the white pod out of it, fog low, night 0.55), the
 * E-C linear grade (contrast, saturation, white balance) and a vignette. Tone mapping and exposure are output settings,
 * applied with `app.setOutput` after every `setScene` (`skyOutput`).
 */
export function skyPost(look: SkyLook) {
  const g = look.grade;
  return [
    effects.bloom({ name: "grid bloom", intensity: look.bloom.intensity, threshold: look.bloom.threshold, radius: look.bloom.radius }),
    effects.colorGrade({ name: "grid grade", contrast: g.contrast, saturation: g.saturation, temperature: g.temperature, tint: g.tint }),
    effects.vignette({ name: "grid vignette", intensity: look.vignette, smoothness: 0.65 })
  ] as const;
}

/**
 * GD-08: output settings of one row for `app.setOutput`. `supported` lists the operators the renderer reported; Marine
 * dusk asks for AgX and falls back to ACES where AgX is not available.
 */
export function skyOutput(look: SkyLook, supported?: readonly string[]): { readonly toneMapping: "agx" | "aces"; readonly exposure: number } {
  const wanted = look.output.toneMapping;
  const toneMapping = supported === undefined || supported.includes(wanted) ? wanted : look.output.fallback;
  return { toneMapping, exposure: look.output.exposure };
}

/**
 * Renderer options for the mount. The game is tuned and captured at the "high" tier on every device,
 * so it asks for that tier explicitly in object form: same tier as the old `quality: "high"` string,
 * without the engine's RENDERER_QUALITY_STRING diagnostic warning.
 */
export const GRID_DISPATCH_RENDERER = { quality: { tier: "high" } } as const;

/**
 * GD-00: quality-rebuild flags in record form. A3D_QR_GAME stays on as before; the sky and fog node handlers
 * (A3D_QR_VFX_SKY, A3D_QR_VFX_FOG) are named explicitly so the marine-layer sky and height fog never depend on a
 * registry default. Both are default-on today, so the resolved flag set equals the old `["game"]` list
 * (tests/unit/teleoperator/look.test.ts).
 */
export const GRID_DISPATCH_FLAGS = { A3D_QR_GAME: true, A3D_QR_VFX_SKY: true, A3D_QR_VFX_FOG: true } as const;

const placed = (items: ReadonlyArray<readonly [number, number, number]>): AuraTransformSpec[] => items.map(([x, y, z]) => ({ position: [x, y, z] }));

export function buildGridDispatchScene(weather: WeatherPreset): ReturnType<typeof scene> {
  const w = WEATHER[weather];
  const look = SKY_LOOKS[weather];
  const s = scene()
    .background(w.sky)
    .camera(camera.perspective({ fov: SCENE_CAM_FOV_DEG, near: 0.25, far: 620, position: SCENE_CAM_POS, target: SCENE_CAM_TARGET }))
    // No ambient light: the sky's HDRI fills the shadows, and an extra ambient blew out the white hero car (C14).
    .addMany([...skyRig(look)])
    .add(marineHaze(look))
    .addMany([...skyPost(look)]);

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
    primitives.box({ name: "sf-peninsula-ground", size: [1400, 0.2, 620], material: material.pbr({ color: look.street.ground, roughness: 0.94 }) }).position(0, -0.25, -180).runtime(game.runtimeNode("sf-peninsula-ground")),
    primitives.box({ name: "sf-bay-water", size: [1400, 0.08, 220], material: material.pbr({ color: look.street.water, roughness: 0.22, metalness: 0.45 }) }).position(0, -0.1, -330).runtime(game.runtimeNode("sf-bay-water")),
    ...ROAD_STRIPS.map((strip) =>
      primitives.box({ name: strip.id, size: stripSize[strip.id] ?? [0.09, 0.025, 420], material: stripMat(strip.id) }).position(strip.x, strip.y, -160).runtime(game.runtimeNode(strip.id))
    ),
    // GD-04: the emissive box sky and the sun sphere are gone; the sky node below draws the sky and the sun disc.
    skyNode(look)
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

  // 3. Skyline towers: this game's own glass and art-deco towers at skyline scale (GU47: the borrowed Heatsink towers
  // and overpass are gone, D2). The marine layer swallows their tops. GU47(WP-36): Meshy pyramid and glass landmark towers.
  s.addMany([
    model(assets.gridBldgGlassTower, { name: "sf-skyline-tower-l", role: "setDressing", scaleMode: "fit", targetMaxDimension: 72 }).position(-58, 0, -145),
    model(assets.gridBldgArtDeco, { name: "sf-skyline-tower-t", role: "setDressing", scaleMode: "fit", targetMaxDimension: 68 }).position(58, 0, -135),
    model(assets.gridBldgGlassTower, { name: "sf-skyline-tower-x", role: "setDressing", scaleMode: "fit", targetMaxDimension: 74 }).position(-62, 0, -255)
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
