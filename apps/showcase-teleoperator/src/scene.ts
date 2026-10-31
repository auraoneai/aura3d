import { camera, defineAuraAssets, effects, environments, game, instances, lights, material, model, primitives, scene, sky, text3D, type AuraModelMaterialOverride, type AuraTransformSpec } from "@aura3d/engine";
import { assets, type GridAssetKey } from "./aura-assets";
import { BRAKE_RED, KEY_SHADOW, SODIUM, SKY_LOOKS, hdriUrl, keyLightPosition, type HdriId, type SkyLook } from "./look";
import { RIVALS, TRAFFIC_SPECS } from "./sim";
import { MANHOLES } from "./vfx";
import { CATENARY, DISTRICTS, PARKED, SIGN, SIGN_SLOTS, crossStreetName, signNodeId } from "./dressing";
import { CAR_DRAW_Z, CURB_BEACON_X, PLAYABLE_FLEET, PLAYABLE_IDS, SCENE_CAM_FOV_DEG, SCENE_CAM_POS, SCENE_CAM_TARGET, type PlayableCarId, type Vec3, type WeatherPreset } from "./rules";

export const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
export const HIDDEN_POS: Vec3 = [0, -90, 140];
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
  golden: { sky: "#c98a5a", label: "Marine dusk" },
  fog: { sky: "#94a3b8", label: "Marine fog" },
  night: { sky: "#0d1424", label: "Sodium night" }
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
 * GD-06: god rays down the avenue on Marine dusk and Marine fog (`look.godRays`; none at noon or night): the E-C
 * volumetric-fog inscatter (the bridge aims the shafts along the key light) with `godRayDensity` 0.08. The post tiers drop it below
 * High (PRD 6.4). +2 draws max (inscatter + composite).
 */
export function godRayNodes(look: SkyLook) {
  if (!look.godRays) return [];
  return [
    effects.volumetricFog({ name: "grid god rays", density: look.godRays.density, color: look.godRays.color, intensity: look.godRays.intensity, godRayDensity: look.godRays.density })
  ];
}

/**
 * GD-10: contact shadows under the cars and an explicit SSAO (the old look preset's AO went with looks.preset). Low tier
 * drops AO (PRD 6.4); contact shadows follow the shadowed key.
 */
export function groundingNodes() {
  return [
    effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 12, intensity: 0.85, lights: "shadowed" }),
    effects.ambientOcclusion({ name: "grid ao", intensity: 0.45, radius: 0.8, density: 0.6, color: "#05080d" })
  ];
}

/**
 * GD-07: a thin drizzle over Sodium night (`street.drizzle`) so the wet asphalt (roughness 0.22 from the look table)
 * has a cause. Secondary on purpose: Lamplight Line owns rain. Reduced motion halves the particles (PRD 6.3).
 */
export const DRIZZLE = { intensity: 0.16, density: 0.22, particles: 900, color: "#c8d2dc" } as const;
export function drizzleNodes(look: SkyLook, motionOk = true) {
  if (!look.street.drizzle) return [];
  return [effects.rain({ name: "grid drizzle", intensity: DRIZZLE.intensity, density: DRIZZLE.density, color: DRIZZLE.color, particleCount: Math.round(DRIZZLE.particles * (motionOk ? 1 : 0.5)), splashes: false, mist: false })];
}

/**
 * GD-07: screen-space reflections on the wet Sodium night asphalt (eint EC-6), in place of the box probe: a probe
 * rendered once would freeze the lamp reflections while the street scrolls past the fixed camera, and one refreshed
 * every few frames costs six scene renders. The asphalt roughness (0.22) sits under the 0.4 fade so the road reflects;
 * cars and facades stay matte. One post stage, no scene draws; the post tiers drop it below High (PRD 6.4).
 */
export const WET_SSR = { maxDistance: 24, roughness: 0.4, thickness: 0.3, intensity: 0.55 } as const;
export function wetReflectionNodes(look: SkyLook) {
  if (!look.street.drizzle) return [];
  return [effects.screenSpaceReflections({ name: "grid wet ssr", ...WET_SSR })];
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
    effects.vignette({ name: "grid vignette", intensity: look.vignette, smoothness: 0.65 }),
    // GU47 phase 3: sensor-feed grain (the operator watches a remote camera); the post tiers drop it below High.
    effects.filmGrain({ name: "grid feed grain", intensity: look.grain, size: 1.4 })
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

/** GD-03 headlight spots: the pair of spots ahead of the player car (2 of the GD-20 cap of 2 spots). */
export const HEADLIGHT = { color: "#fff1d6", intensity: 34, angle: 0.42, penumbra: 0.55, distance: 34, aheadM: 18, heightM: 0.7, spreadM: 0.62 } as const;
export const HEADLIGHT_IDS = ["player-headlight-l", "player-headlight-r"] as const;

/** Headlight spot position and aim for a car whose nose sits at view (x, z). */
export function headlightPose(side: -1 | 1, carX: number, noseZ: number, y = 0): { position: [number, number, number]; target: [number, number, number] } {
  const x = carX + side * HEADLIGHT.spreadM;
  return { position: [x, y + HEADLIGHT.heightM, noseZ], target: [x + side * 0.6, y, noseZ - HEADLIGHT.aheadM] };
}

/**
 * GD-03 tail and brake lamps. The car GLBs carry no lamp material (`assets inspect`: veh-body/trim/glass/... or one
 * BakedMaterial), so the lamps are an instanced pair of emissive bars at the rear corners (+1 draw) until WP-36 retextures
 * the rear lamps; the material changes only when the sim's read-only `brakeLamp` flag flips.
 * GU47(WP-36): swap to `materials.setEmissive("<rear-lamp material>", BRAKE_RED, ...)` on the retextured cars.
 */
export const TAIL_LAMP = { size: [0.3, 0.08, 0.04] as [number, number, number], heightFrac: 0.52, spreadFrac: 0.36, tail: 0.9, brake: 3.4 } as const;
export function tailLampMaterial(look: SkyLook, braking: boolean) {
  const lit = braking ? TAIL_LAMP.brake : TAIL_LAMP.tail * Math.max(0.35, look.street.headlights);
  return material.emissive({ color: BRAKE_RED, emissive: BRAKE_RED, emissiveIntensity: lit });
}

/** GD-03: the two headlight spots of one sky (none at noon: `street.headlights` is 0). */
export function headlightNodes(look: SkyLook) {
  if (look.street.headlights <= 0) return [];
  return HEADLIGHT_IDS.map((id, i) => {
    const pose = headlightPose(i === 0 ? -1 : 1, 0, CAR_DRAW_Z - 2.3);
    return lights
      .spot({ name: id, position: pose.position, target: pose.target, angle: HEADLIGHT.angle, penumbra: HEADLIGHT.penumbra, distance: HEADLIGHT.distance, intensity: HEADLIGHT.intensity * look.street.headlights, color: HEADLIGHT.color })
      .runtime(game.runtimeNode(id));
  });
}

/**
 * GD-02/GD-20: sodium point lights on the nearest street lamps. The art direction caps non-key lights at 6
 * (defineArtDirection): hemisphere + 2 headlight spots leave 3 sodium points (night 3, dusk and fog 2).
 */
export const SODIUM_POINT_MAX = 3;
export const SODIUM_RANGE_M = 18;
export const sodiumPointIds = (look: SkyLook): string[] => Array.from({ length: Math.min(SODIUM_POINT_MAX, look.street.sodiumPoints) }, (_, i) => `sf-sodium-${i}`);
export function sodiumPointNodes(look: SkyLook) {
  return sodiumPointIds(look).map((id, i) =>
    lights.point({ name: id, position: [i % 2 === 0 ? -10.8 : 10.8, 6.1, -20 - i * LAMP_STRIDE_Z], power: look.street.sodiumPower, distance: SODIUM_RANGE_M, decay: 2, color: SODIUM }).runtime(game.runtimeNode(id))
  );
}

/**
 * GD-02: the lamps a sodium point should sit on this frame: the nearest lamp globes in front of the camera (view z), both
 * sides, nearest first. `lampZ` are the view z of the lamp rows, `x` the globe offset from the avenue centre.
 */
export function nearestLamps(lampZ: readonly number[], count: number, x = 10.8, maxZ = 6): [number, number][] {
  const lamps = lampZ.filter((z) => z <= maxZ).flatMap((z) => [[-x, z], [x, z]] as [number, number][]);
  return lamps.sort((a, b) => b[1] - a[1]).slice(0, count);
}

/**
 * GD-02 window glow, interim: every facade GLB has one baked material and no window mask, so the glow is a warm emissive
 * lift of the whole facade (`street.windowGlow`, 0 at noon). GU47(WP-36): an emissive window map on the 4 retextured
 * facades replaces it.
 */
export const WINDOW_GLOW = { color: SODIUM, intensity: 0.16 } as const;
export const windowGlowOverride = (look: SkyLook) => ({ emissive: WINDOW_GLOW.color, emissiveIntensity: WINDOW_GLOW.intensity * look.street.windowGlow }) as const;

type CarOverrides = readonly AuraModelMaterialOverride[];
/**
 * GD-11 vehicle materials as per-material overrides (no whole-model `setMaterial`). The robotaxi pod (`veh-*` materials
 * from `assets inspect`): pearl clearcoat body, dark glass, black trim and sensor dome; tyres and rims keep their paint.
 * The baked single-material cars get a muted clearcoat; the truck is brushed steel and Kaya's coupe champagne (both used
 * to be whole-model swaps). The fare-lit teal strip needs a strip material on the pod: GU47(WP-36) pod retexture.
 */
export const POD_MATERIALS: CarOverrides = [
  { target: "veh-body", color: "#eef1f4", colorMode: "replace", roughness: 0.32, metallic: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 },
  { target: "veh-glass", color: "#0d1218", colorMode: "replace", roughness: 0.06, metallic: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 },
  { target: ["veh-trim", "veh-cabin"], color: "#14171c", colorMode: "replace", roughness: 0.38, metallic: 0.2 }
];
export const MUTED_CLEARCOAT: CarOverrides = [{ clearcoat: 0.45, clearcoatRoughness: 0.3, roughness: 0.48 }];
export const TRUCK_STEEL: CarOverrides = [{ color: "#cbd5e1", colorMode: "multiply", metallic: 0.8, roughness: 0.22, clearcoat: 0.3, clearcoatRoughness: 0.2 }];
export const RIVAL_CHAMPAGNE: CarOverrides = [{ color: "#e8c27a", colorMode: "multiply", metallic: 0.65, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.12 }];

/** GD-11: overrides for one model asset key (`undefined`: leave the GLB as authored, e.g. the cable car). */
export function carMaterialOverrides(asset: GridAssetKey, role: "player" | "rival" | "traffic", rivalIndex = -1): CarOverrides | undefined {
  if (asset === "gridCruiser" || asset === "gridRivalCruiser") return POD_MATERIALS;
  if (asset === "gridTruck") return TRUCK_STEEL;
  if (role === "rival" && rivalIndex === 1) return RIVAL_CHAMPAGNE;
  if (asset === "gridCablecar") return undefined;
  return MUTED_CLEARCOAT;
}

/**
 * GD-13 road tiles (interim, no textures): the avenue reads as 14 m concrete-and-asphalt bays recycled on the dash stride,
 * so the street visibly moves under the car. Two instanced nodes (+2 draws): repair patches in a second asphalt tone on
 * alternating bays and lanes, and tar-sealed expansion joints across the full width at every bay. The CC0 asphalt, paver
 * and granite texture sets are an asset need (ambientcg Road/Asphalt/PavingStones at 1k) for the admission pass.
 */
export const ROAD_TILE = { strideZ: DASH_STRIDE_Z, rows: DASH_ROWS, patch: [4.6, 0.006, 6.2] as [number, number, number], joint: [21.4, 0.006, 0.14] as [number, number, number] } as const;
/** Lane centres (x) that carry patches, in an order that never repeats on two neighbouring bays. */
export const PATCH_LANES = [-7.6, 3.2, -2.9, 7.8] as const;
/** Patch and joint transforms (sim world space: x, z) for the bays starting at `baseZ`. Deterministic in the bay index. */
export function roadTileLayout(baseZ: number): { patches: [number, number][]; joints: number[] } {
  const patches: [number, number][] = [];
  const joints: number[] = [];
  for (let i = 0; i < ROAD_TILE.rows; i++) {
    const z = baseZ - i * ROAD_TILE.strideZ;
    joints.push(z);
    const bay = Math.round(z / ROAD_TILE.strideZ);
    if (bay % 2 === 0) patches.push([PATCH_LANES[((bay / 2) % PATCH_LANES.length + PATCH_LANES.length) % PATCH_LANES.length]!, z - ROAD_TILE.strideZ / 2]);
  }
  return { patches, joints };
}
export function roadTileMaterials(look: SkyLook) {
  const wet = look.street.asphalt.roughness < 0.4;
  return {
    patch: material.pbr({ color: "#2b3038", roughness: wet ? 0.3 : 0.9, metalness: 0.04 }),
    joint: material.pbr({ color: "#0e1014", roughness: wet ? 0.2 : 0.6, metalness: 0.02 })
  };
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

export function buildGridDispatchScene(weather: WeatherPreset, opts: { readonly motionOk?: boolean } = {}): ReturnType<typeof scene> {
  const w = WEATHER[weather];
  const look = SKY_LOOKS[weather];
  const s = scene()
    .background(w.sky)
    .camera(camera.perspective({ fov: SCENE_CAM_FOV_DEG, near: 0.25, far: 620, position: SCENE_CAM_POS, target: SCENE_CAM_TARGET }))
    // No ambient light: the sky's HDRI fills the shadows, and an extra ambient blew out the white hero car (C14).
    .addMany([...skyRig(look)])
    .add(marineHaze(look))
    .addMany([...godRayNodes(look)])
    .addMany([...drizzleNodes(look, opts.motionOk ?? true), ...wetReflectionNodes(look)])
    .addMany([...groundingNodes()])
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
    id === "sf-avenue-asphalt" ? material.pbr({ color: look.street.asphalt.color, roughness: look.street.asphalt.roughness, metalness: 0.08 })
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
  // GU47 phase 3: slate bay glass (the saturated #38bdf8 read as a glowing glitch at the vanishing point; rubric environment).
  const glassMat = material.pbr({ color: "#5b7d90", roughness: 0.22, metalness: 0.6 });
  const bridgeMat = material.pbr({ color: "#c0362c", roughness: 0.48, metalness: 0.35 });
  s.addMany([
    primitives.cylinder({ name: "sf-pyramid-spire", size: [22, 145, 22], material: pyramidMat }).position(44, 72, -210),
    primitives.box({ name: "sf-pyramid-wing", size: [28, 78, 8], material: pyramidMat }).position(44, 39, -210),
    primitives.sphere({ name: "sf-pyramid-crown", size: [3.2, 5.5, 3.2], material: material.emissive({ color: "#e0f2fe", emissive: "#3fd6c6", emissiveIntensity: 2.2 }) }).position(44, 145, -210),
    primitives.cylinder({ name: "sf-glass-obelisk", size: [22, 158, 22], material: glassMat }).position(-48, 79, -235),
    primitives.cylinder({ name: "sf-glass-obelisk-crown", size: [18.5, 16, 18.5], material: material.emissive({ color: "#9fb8c6", emissive: "#7fa6bb", emissiveIntensity: 0.55 }) }).position(-48, 162, -235),
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
  // GD-02: lamp globes from the look table (night 3.0, dusk 2.4, fog 1.6, noon unlit 0.25).
  const lampMat = material.emissive({ color: "#fef3c7", emissive: SODIUM, emissiveIntensity: look.street.lampEmissive });
  const pool = (n: number): AuraTransformSpec[] => Array.from({ length: n }, (_, i) => ({ position: [0, -50, 200 + i] }));
  s.addMany([
    instances.box({ name: "sf-road-patches", size: ROAD_TILE.patch, material: roadTileMaterials(look).patch, transforms: pool(ROAD_TILE.rows) }).runtime(game.runtimeNode("sf-road-patches")),
    instances.box({ name: "sf-road-joints", size: ROAD_TILE.joint, material: roadTileMaterials(look).joint, transforms: pool(ROAD_TILE.rows) }).runtime(game.runtimeNode("sf-road-joints")),
    instances.box({ name: "sf-dashes", size: [0.14, 0.02, 4.2], material: dashMat, transforms: pool(DASH_ROWS * DASH_LINES_X.length) }).runtime(game.runtimeNode("sf-dashes")),
    instances.box({ name: "sf-cross-roads", size: [140, 0.03, 14], material: material.pbr({ color: "#222834", roughness: 0.84 }), transforms: pool(INTERSECTION_COUNT) }).runtime(game.runtimeNode("sf-cross-roads")),
    // GD-15: cast-iron manhole covers past each crossing (steam source); +1 draw.
    instances.cylinder({ name: "sf-manholes", size: MANHOLES.size, material: material.pbr({ color: "#2b2f33", metalness: 0.6, roughness: look.street.drizzle ? 0.3 : 0.55 }), transforms: pool(INTERSECTION_COUNT * MANHOLES.offsets.length) }).runtime(game.runtimeNode("sf-manholes")),
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

  // 5b. GD-19 dressing: trolley catenary, parked cars on the cross streets, SDF street-name signs (text = HUD cross street).
  const wireMat = material.pbr({ color: "#15181c", metalness: 0.4, roughness: 0.6 });
  s.addMany([
    instances.box({ name: "sf-catenary-wires", size: CATENARY.wire, material: wireMat, transforms: pool(CATENARY.wiresX.length) }).runtime(game.runtimeNode("sf-catenary-wires")),
    instances.box({ name: "sf-catenary-spans", size: CATENARY.span, material: wireMat, transforms: pool(LAMP_PAIRS) }).runtime(game.runtimeNode("sf-catenary-spans")),
    ...PARKED.map((p, k) =>
      instances.model(assets[p.asset], { name: `sf-parked-${k}`, transforms: pool(INTERSECTION_COUNT * p.slots.length), targetMaxDimension: p.maxDim, castShadow: true }).runtime(game.runtimeNode(`sf-parked-${k}`))
    ),
    instances.box({ name: "sf-sign-plates", size: SIGN.plate, material: material.pbr({ color: SIGN.plateColor, roughness: 0.5 }), transforms: pool(INTERSECTION_COUNT) }).runtime(game.runtimeNode("sf-sign-plates"))
  ]);
  const signMat = material.emissive({ color: SIGN.textColor, emissive: SIGN.textColor, emissiveIntensity: look.street.headlights > 0 ? 0.6 : 0.2 });
  for (let d = 0; d < DISTRICTS.length; d++) {
    for (let slot = 0; slot < SIGN_SLOTS; slot++) {
      const id = signNodeId(d, slot);
      s.add(text3D(crossStreetName(d), { name: id, size: SIGN.size, depth: 0.02, backend: "sdf", material: signMat }).position(0, -50, 200).runtime(game.runtimeNode(id)));
    }
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

  // 7. Five playable cars (one shown at a time). GD-14: the 12 instanced spark spheres are gone; collisions fire the
  // `grid-impact` runtime VFX preset (vfx.ts) instead (-1 draw).
  s.addMany([
    ...PLAYABLE_IDS.map((id, i) =>
      model(assets[PLAYER_ASSET[id]], { name: `player-car-${id}`, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET[id].maxDim })
        .position(i === 0 ? 0 : HIDDEN_POS[0], i === 0 ? 0 : HIDDEN_POS[1], i === 0 ? -0.8 : HIDDEN_POS[2])
        .scale(i === 0 ? [1, 1, 1] : HIDDEN_SCALE)
        .runtime(game.runtimeNode(`player-car-${id}`, i === 0 ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined))
    ),
    ...sodiumPointNodes(look),
    instances.box({ name: "player-tail-lamps", size: TAIL_LAMP.size, material: tailLampMaterial(look, false), transforms: pool(2) }).runtime(game.runtimeNode("player-tail-lamps")),
    ...headlightNodes(look)
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
