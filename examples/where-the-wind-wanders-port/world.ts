/**
 * Where the Wind Wanders — meadow world on the public `@aura3d/engine` surface only.
 *
 * The original draws painted sprite art fetched from a remote bucket; the port recreates the
 * look procedurally: a painted terrain with baked tree shadows, wind-swayed grass/flower/fern/reed/
 * shrub cards, merged trees and buildings with procedural wood, plaster, tile and leaf materials,
 * a painted sky with clouds and light shafts, water with foam, an animated traveller, glowing
 * letters and a bell. Gameplay state comes from `sim.ts`; this module only draws it.
 */
import { camera, effects, environments, geometry, lights, material, scene, type AuraApp } from "@aura3d/engine";
import { ENV_ASSETS, VALLEY_IBL_INTENSITY } from "./env-assets";
import { createWindVfx } from "./vfx";
import { gustAt } from "./wind";
import { BELL, CAMERA_OFFSET, LETTERS, START, type WindState } from "./sim";
import { GLOW_FRAGMENT, GLOW_VERTEX, HAZE_FRAGMENT, HAZE_VERTEX, MOTE_FRAGMENT, MOTE_VERTEX, PAINT_FRAGMENT, PAINT_VERTEX, PROP_FRAGMENT, PROP_VERTEX, SEA_FRAGMENT, SHAFT_FRAGMENT, SKY_FRAGMENT, STREAM_FRAGMENT, SKY_VERTEX, TRAVELLER_VERTEX, WIND_FRAGMENT, WIND_VERTEX, BLOB_FRAGMENT, BLOB_VERTEX } from "./shaders";
import { DAYLIGHT_KEYS, ORIGINAL_KEY, createDaylightDriver, daylightKeyFor, frameOfKey, linearToHex, type DaylightFrame } from "./daylight";
import { lin, toGeometryInput, type Mesh, type Rgb } from "./meshkit";
import { buildScenery } from "./scenery";
import { addAnimatedModels, addStaticModels, availableModels, createHeroAnimator, type ModelSet } from "./models";
import { SEA_LEVEL, STREAM_POINTS, buildTerrain, lehmer, pathZ, streamInfo, terrainHeight } from "./terrain";

type CustomSpec = Parameters<typeof material.custom>[0];
type Scene = ReturnType<typeof scene>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

/**
 * WW47-L1: the uniforms every COMMON-based program reads, written each frame from the daylight driver (daylight.ts).
 * The defaults are the 4.6 constants, so a program drawn before the first write looks as it did.
 */
const ORIGINAL = frameOfKey(ORIGINAL_KEY);
export const daylightUniforms = (): NonNullable<CustomSpec["uniforms"]> => ({
  sunDir: { type: "vec3", value: [...ORIGINAL.sunDir] },
  sunCol: { type: "vec3", value: [...ORIGINAL.sunColor] },
  sunGain: { type: "f32", value: ORIGINAL.sunIntensity },
  skyCol: { type: "vec3", value: [...ORIGINAL.hemiSky] },
  gndCol: { type: "vec3", value: [...ORIGINAL.hemiGround] },
  fogCol: { type: "vec3", value: [...ORIGINAL.fogColor] },
  fogDensity: { type: "f32", value: ORIGINAL.fogDensity },
  fogHeight: { type: "f32", value: 0 },
  cloudShadowAmt: { type: "f32", value: 0 }
});
/** Writes one daylight frame into a COMMON-based program's uniforms. */
export function writeDaylightUniforms(handle: { setUniform?(name: string, value: number | readonly number[]): unknown }, f: DaylightFrame): void {
  handle.setUniform?.("sunDir", f.sunDir);
  handle.setUniform?.("sunCol", f.sunColor);
  handle.setUniform?.("sunGain", f.sunIntensity);
  handle.setUniform?.("skyCol", f.hemiSky);
  handle.setUniform?.("gndCol", f.hemiGround);
  handle.setUniform?.("fogCol", f.fogColor);
  handle.setUniform?.("fogDensity", f.fogDensity);
  handle.setUniform?.("fogHeight", f.fogHeight);
  handle.setUniform?.("cloudShadowAmt", f.cloudShadow);
}

export const windSpec = (): CustomSpec => ({
  glsl: { vertex: WIND_VERTEX, fragment: WIND_FRAGMENT },
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 }, windStrength: { type: "f32", value: 1 }, playerPos: { type: "vec3", value: [1e4, 0, 1e4] }, gustAmt: { type: "f32", value: 0 } },
  side: "double"
});
export const paintSpec = (): CustomSpec => ({
  glsl: { vertex: PAINT_VERTEX, fragment: PAINT_FRAGMENT },
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 } }
});
export const seaSpec = (): CustomSpec => ({
  glsl: { vertex: PAINT_VERTEX, fragment: SEA_FRAGMENT },
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false
});
export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    ...daylightUniforms(),
    windTime: { type: "f32", value: 0 },
    skyHorizon: { type: "vec3", value: [...ORIGINAL.skyHorizon] },
    skyMid: { type: "vec3", value: [...ORIGINAL.skyMid] },
    skyZenith: { type: "vec3", value: [...ORIGINAL.skyZenith] },
    cloudTint: { type: "vec3", value: [1, 1, 1] },
    starAmt: { type: "f32", value: 0 },
    skyPainted: { type: "f32", value: 0 }
  },
  depthWrite: false,
  side: "double"
});
export const propSpec = (castShadow = false): CustomSpec => ({
  glsl: { vertex: PROP_VERTEX, fragment: PROP_FRAGMENT },
  ...(castShadow ? { castShadow: true } : {}),
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 }, playerPos: { type: "vec3", value: [1e4, 0, 1e4] } },
  side: "double"
});
export const travellerSpec = (): CustomSpec => ({
  glsl: { vertex: TRAVELLER_VERTEX, fragment: PROP_FRAGMENT },
  uniforms: { ...daylightUniforms(),
    windTime: { type: "f32", value: 0 },
    playerPos: { type: "vec3", value: [1e4, 0, 1e4] },
    gait: { type: "f32", value: 0 },
    walkAmt: { type: "f32", value: 0 },
    hopAmt: { type: "f32", value: 0 },
    squash: { type: "f32", value: 0 }
  },
  side: "double"
});
export const glowSpec = (color: Rgb, amount: number, seed: number): CustomSpec => ({
  glsl: { vertex: GLOW_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { ...daylightUniforms(),
    windTime: { type: "f32", value: 0 },
    glowColor: { type: "color3", value: [...color] },
    glowAmount: { type: "f32", value: amount },
    glowSeed: { type: "f32", value: seed }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});
export const moteSpec = (): CustomSpec => ({
  glsl: { vertex: MOTE_VERTEX, fragment: MOTE_FRAGMENT },
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});
export const hazeSpec = (phase: number): CustomSpec => ({
  glsl: { vertex: HAZE_VERTEX, fragment: HAZE_FRAGMENT },
  uniforms: { ...daylightUniforms(),
    windTime: { type: "f32", value: 0 },
    hazePhase: { type: "f32", value: phase },
    hazeOpacity: { type: "f32", value: 0.34 }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});
export const streamSpec = (): CustomSpec => ({
  glsl: { vertex: HAZE_VERTEX, fragment: STREAM_FRAGMENT },
  uniforms: { ...daylightUniforms(), windTime: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});
export const shaftSpec = (seed: number, opacity: number): CustomSpec => ({
  glsl: { vertex: HAZE_VERTEX, fragment: SHAFT_FRAGMENT },
  uniforms: { ...daylightUniforms(),
    windTime: { type: "f32", value: 0 },
    shaftSeed: { type: "f32", value: seed },
    shaftOpacity: { type: "f32", value: opacity }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});
export const blobSpec = (): CustomSpec => ({
  glsl: { vertex: BLOB_VERTEX, fragment: BLOB_FRAGMENT },
  uniforms: { shadowOpacity: { type: "f32", value: 0.5 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

interface FoliageCards {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  tint: number[];
  sway: number[];
  phase: number[];
  kind: number[];
}

const FOLIAGE_KIND = { grass: 0, flower: 1, fern: 2, reed: 3, shrub: 4, rosette: 5, spike: 6 } as const;

function pushCard(f: FoliageCards, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, color: Rgb, sway: number, phase: number, kind: number): void {
  const base = f.positions.length / 3;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
    const lx = (u - 0.5) * w;
    f.positions.push(cx + lx * cs, cy + v * h, cz - lx * sn);
    f.normals.push(0, 1, 0);
    f.uvs.push(u, v);
    f.tint.push(color[0], color[1], color[2]);
    f.sway.push(sway);
    f.phase.push(phase);
    f.kind.push(kind);
  }
  f.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export interface WorldRuntime {
  update(state: WindState, dtSeconds: number, timeSeconds: number, aspect: number): void;
  reset(): void;
  /** Jump the follow camera to the traveller (capture and teleport hooks). */
  snap(state: WindState): void;
  /** Presentation-only voyage after the bell: seconds since it began, or null for the normal follow camera. */
  setEpilogue(seconds: number | null): void;
  readonly nodeCount: number;
  readonly foliageCards: number;
  readonly stats: { trees: number; propTriangles: number; foliageTriangles: number; terrainTriangles: number };
  /** The bell's current swing angle (radians about z), for QA. */
  readonly bellAngle: number;
  /** The daylight frame on screen (WW47-L1). */
  readonly daylight: DaylightFrame;
}

/**
 * The bell's swing about its yoke: a strong, decaying swing every 6 s once it has rung, a slow sway before. The model bell
 * hangs in a narrow frame, so its swing is scaled down to stay inside the posts. `motion` scales everything (reduced motion).
 */
export function bellSwing(time: number, complete: boolean, amplitude = 1, motion = 1): number {
  const a = complete ? 0.32 * Math.sin(time * 5.2) * Math.exp(-((time % 6) * 0.35)) + 0.06 * Math.sin(time * 2.1) : 0.025 * Math.sin(time * 1.3);
  return a * amplitude * motion;
}
/** The model bell's frame is about 0.5 file units wide around a 0.35-wide bell: about a third of the procedural swing fits. */
export const MODEL_BELL_AMPLITUDE = 0.32;
/** Engine sky-fill intensity (the painted programs carry their own hemisphere term at 0.92). */
export const HEMI_INTENSITY = 0.6;
/** Lantern point light: peak intensity at the key's full `lanterns` level, and range in metres (WW47-L5). */
export const LANTERN_PEAK = 5;
export const LANTERN_RANGE = 9;
/** The brass point inside the bell: base level after the bell rings, plus a pulse with the swing. */
export function bellLightIntensity(complete: boolean, swing: number, lanterns: number): number {
  if (!complete) return 0;
  return 1.5 * lanterns + 4 * Math.min(1, Math.abs(swing) / 0.32);
}
/** Epilogue camera height above its look target. */
export const EPILOGUE_CAMERA_RISE = 6.4;

export interface World {
  readonly scene: Scene;
  readonly foliageCards: number;
  bind(app: AuraApp): WorldRuntime;
}

const FACING_YAW: Record<string, number> = { front: 0, frontRight: Math.PI / 4, right: Math.PI / 2, backRight: (3 * Math.PI) / 4, back: Math.PI, backLeft: (-3 * Math.PI) / 4, left: -Math.PI / 2, frontLeft: -Math.PI / 4 };

const dynamic = (m: Mesh, withLimb = false) => geometry.dynamic(toGeometryInput(m, withLimb, !withLimb));

export interface BuildWorldOptions {
  density?: number;
  models?: boolean;
  reducedMotion?: () => boolean;
  /** `original` is the 4.6 look (`?look=original`): fixed midday constants, no engine lights, the 4.6 post. */
  look?: "gu47" | "original";
  /** Pins the daylight key (`?found=0..3|epilogue`, capture variants); null follows the story. */
  daylightKey?: number | null;
  /** `low` drops shadows, god rays, particles and the paper pass (PRD §6.4). */
  quality?: "low" | "high";
}

export function buildWorld(options: BuildWorldOptions = {}): World {
  const density = options.density ?? 1;
  const original = options.look === "original";
  /** Every node drawn with a COMMON-based program: each gets the daylight uniforms every frame. */
  const daylightIds: string[] = [];
  const lit = (id: string): string => { daylightIds.push(id); return id; };
  /** WW47-L2: the engine sun casts on High; Low and the original look draw no shadow rows (PRD §6.4). */
  const shadows = !original && options.quality !== "low";
  /** Reduced motion: smaller bell swing, slower grass and leaf sway, a gentler voyage camera. */
  const motion = (): number => (options.reducedMotion?.() ? 0.3 : 1);
  const rand = lehmer(20261022);
  const none: ModelSet = { letter: false, bell: false, cottage: false, trees: false, hero: false, wisp: false, boat: false, stones: false, shrubs: false };
  const set: ModelSet = options.models === false ? none : availableModels();
  const sc = buildScenery(4242, { bell: set.bell, cottage: set.cottage, trees: set.trees, stones: set.stones, shrubs: set.shrubs });
  const builder: Scene = scene()
    .background("#b8d0bd")
    .camera(camera.perspective({ position: [START.x + CAMERA_OFFSET.x, 6.7, 21], target: [START.x, 2.2, 0.5], fov: 43, near: 0.15, far: 900 }));

  /* ---- GU47 WW47-L2/L3/L4/L5: one engine sun matching the daylight key, a matching sky fill and an IBL for the GLBs ---- */
  if (!original) {
    const k0 = frameOfKey(DAYLIGHT_KEYS[options.daylightKey ?? 0] ?? DAYLIGHT_KEYS[0]!);
    const d = k0.sunDir;
    builder.add(lights.directional({
      name: "valley sun",
      position: [START.x + d[0] * 60, d[1] * 60, START.z + d[2] * 60],
      target: [START.x, 0, START.z],
      color: linearToHex(k0.sunColor),
      intensity: k0.engineSunIntensity,
      shadow: shadows ? { cascades: 2, mapSize: 2048, filter: "pcss", maxDistance: 70 } : false
    }).runtime({ id: "sun" }));
    builder.add(lights.hemisphere({ name: "valley sky fill", skyColor: linearToHex(k0.hemiSky), groundColor: linearToHex(k0.hemiGround), intensity: HEMI_INTENSITY }).runtime({ id: "sky-fill" }));
    builder.add(environments.hdri({ name: "valley ibl", texture: ENV_ASSETS.valleyIbl as never, intensity: VALLEY_IBL_INTENSITY, background: false }));
    sc.lanterns.forEach((p, i) => builder.add(lights.point({ name: `lantern ${i}`, position: [p.x, p.y, p.z], color: "#ffbf66", intensity: 0, distance: LANTERN_RANGE }).runtime({ id: `lantern-light-${i}` })));
    builder.add(lights.point({ name: "bell brass", position: [sc.bellHang.x, sc.bellHang.y - 0.45, sc.bellHang.z + 0.25], color: "#ffcf7a", intensity: 0, distance: 6 }).runtime({ id: "bell-light" }));
  }

  /* ---- terrain with baked shadows ---- */
  const terrain = buildTerrain(0.8, sc.blobs);
  builder.add(geometry.custom(geometry.dynamic({
    positions: terrain.positions,
    normals: terrain.normals,
    indices: terrain.indices,
    attributes: { tint: { itemSize: 3, data: terrain.tint } }
  }), { name: "terrain", material: material.custom(paintSpec()) }).runtime({ id: lit("terrain") }));

  /* ---- sea ---- */
  const S = 360;
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32([-S, SEA_LEVEL, -S, S, SEA_LEVEL, -S, S, SEA_LEVEL, S, -S, SEA_LEVEL, S]),
    normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: [0, 2, 1, 0, 3, 2],
    attributes: { tint: { itemSize: 3, data: f32([0.3, 0.55, 0.6, 0.3, 0.55, 0.6, 0.3, 0.55, 0.6, 0.3, 0.55, 0.6]) } }
  }), { name: "sea", material: material.custom(seaSpec()) }).runtime({ id: lit("sea") }));

  /* ---- sky dome (follows the camera) ---- */
  {
    const rings = 20, seg = 36, R = 520;
    const pos: number[] = [], idx: number[] = [], nrm: number[] = [];
    for (let j = 0; j <= rings; j++) {
      const pol = (j / rings) * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const az = (i / seg) * Math.PI * 2;
        pos.push(Math.cos(az) * Math.sin(pol) * R, Math.cos(pol) * R, Math.sin(az) * Math.sin(pol) * R);
        nrm.push(0, -1, 0);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    builder.add(geometry.custom(geometry.dynamic({ positions: f32(pos), normals: f32(nrm), indices: new Uint32Array(idx) }), { name: "sky", material: material.custom(skySpec()) }).runtime({ id: lit("sky") }));
  }

  /* ---- foliage cards: one merged mesh, one wind material ---- */
  const f: FoliageCards = { positions: [], normals: [], uvs: [], indices: [], tint: [], sway: [], phase: [], kind: [] };
  const inStream = (x: number, z: number, r = 2.5): boolean => streamInfo(x, z).dist < r;
  const blocked = (x: number, z: number, pad = 0): boolean =>
    sc.keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad) || Math.hypot(x - START.x, z - START.z) < 1.4;
  const grassCols: Rgb[] = ["#5f9a32", "#74ac3a", "#8cbc44", "#4f8a2e", "#9bc24a", "#68a23a", "#b0c650"].map(lin);
  const flowerCols: Rgb[] = ["#f2d84a", "#f6f1e2", "#7fa6f0", "#ea8fb2", "#a98be0", "#f2a043", "#e8695a"].map(lin);
  const rosetteCols: Rgb[] = ["#4c9158", "#5aa05a", "#3d7e4c", "#6aa856"].map(lin);
  const spikeCols: Rgb[] = ["#5b7be0", "#8a63d6", "#c05ad0", "#e8e8f2", "#4f8ae8"].map(lin);
  const shrubCols: Rgb[] = ["#3c7a30", "#2f6a2a", "#4a8a36", "#3f7f45"].map(lin);
  let cardCount = 0;
  const lowX = (x: number): boolean => x > -58 && x < 58;
  const put = (x: number, z: number, w: number, h: number, color: Rgb, sway: number, kind: number, phaseOverride?: number): void => {
    const y = terrainHeight(x, z) - 0.04;
    const yaw = rand() * Math.PI;
    const phase = phaseOverride ?? rand() * 6.28;
    pushCard(f, x, y, z, w, h, yaw, color, sway, phase, kind);
    pushCard(f, x, y, z, w, h, yaw + Math.PI / 2 + (rand() - 0.5) * 0.4, color, sway, phase + 0.7, kind);
    cardCount += 2;
  };
  const scatter = (count: number, region: { x0: number; x1: number; z0: number; z1: number }, fn: (x: number, z: number) => void, minH = SEA_LEVEL + 0.35, pad = 0.2, streamOk = false): void => {
    let made = 0, tries = 0;
    const n = Math.round(count * density);
    while (made < n && tries++ < n * 8) {
      const x = region.x0 + rand() * (region.x1 - region.x0), z = region.z0 + rand() * (region.z1 - region.z0);
      if (!lowX(x) || terrainHeight(x, z) < minH || blocked(x, z, pad) || (!streamOk && inStream(x, z))) continue;
      fn(x, z);
      made++;
    }
  };
  const onPath = (x: number, z: number, r = 1.0): boolean => Math.abs(z - pathZ(x)) < r && x > -52 && x < 58;
  // grass: dense everywhere on the meadow, the worn path stays open
  scatter(6500, { x0: -60, x1: 60, z0: -15, z1: 24 }, (x, z) => {
    if (onPath(x, z) && rand() < 0.8) return;
    const tall = 0.8 + 0.5 * Math.sin(x * 0.17) * Math.cos(z * 0.21);
    put(x, z, 1.2 + rand() * 0.7, (0.9 + rand() * 0.7) * tall, grassCols[Math.floor(rand() * grassCols.length)]!, 0.14, FOLIAGE_KIND.grass);
  });
  // broad-leaf ground cover
  scatter(1300, { x0: -60, x1: 60, z0: -15, z1: 24 }, (x, z) => {
    if (onPath(x, z, 0.8)) return;
    put(x, z, 1.5 + rand() * 0.9, 0.9 + rand() * 0.6, rosetteCols[Math.floor(rand() * rosetteCols.length)]!, 0.04, FOLIAGE_KIND.rosette);
  });
  // wild flowers in drifts
  for (let c = 0; c < 85; c++) {
    const cx = -56 + rand() * 112, cz = -12 + rand() * 33;
    const col = flowerCols[Math.floor(rand() * flowerCols.length)]!;
    const alt = flowerCols[Math.floor(rand() * flowerCols.length)]!;
    const r = 2 + rand() * 3.5;
    for (let i = 0; i < Math.round(15 * density); i++) {
      const a = rand() * 6.28, d = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.8;
      if (!lowX(x) || terrainHeight(x, z) < SEA_LEVEL + 0.5 || blocked(x, z, 0.1) || inStream(x, z) || onPath(x, z, 0.8)) continue;
      put(x, z, 0.85 + rand() * 0.45, 0.85 + rand() * 0.6, rand() < 0.75 ? col : alt, 0.1, FOLIAGE_KIND.flower);
    }
  }
  // tall flower spikes in a few stands
  for (let c = 0; c < 36; c++) {
    const cx = -56 + rand() * 112, cz = -12 + rand() * 33;
    const col = spikeCols[Math.floor(rand() * spikeCols.length)]!;
    for (let i = 0; i < Math.round(13 * density); i++) {
      const a = rand() * 6.28, d = Math.sqrt(rand()) * 2.4;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.8;
      if (!lowX(x) || terrainHeight(x, z) < SEA_LEVEL + 0.5 || blocked(x, z, 0.1) || inStream(x, z) || onPath(x, z, 0.8)) continue;
      put(x, z, 0.8 + rand() * 0.3, 1.5 + rand() * 0.9, col, 0.1, FOLIAGE_KIND.spike);
    }
  }
  scatter(150, { x0: -60, x1: -30, z0: -14, z1: 24 }, (x, z) => put(x, z, 1.9 + rand() * 0.8, 1.2 + rand() * 0.7, grassCols[Math.floor(rand() * 3)]!, 0.12, FOLIAGE_KIND.fern));
  scatter(150, { x0: 36, x1: 60, z0: -12, z1: 24 }, (x, z) => put(x, z, 1.9 + rand() * 0.8, 1.2 + rand() * 0.7, grassCols[Math.floor(rand() * 3)]!, 0.12, FOLIAGE_KIND.fern));
  // reeds along the lake edge and the stream banks
  scatter(160, { x0: -58, x1: 58, z0: -21, z1: -11 }, (x, z) => put(x, z, 0.8 + rand() * 0.4, 1.8 + rand() * 0.9, grassCols[Math.floor(rand() * grassCols.length)]!, 0.16, FOLIAGE_KIND.reed), SEA_LEVEL - 0.15, 0, true);
  for (let i = 0; i < Math.round(160 * density); i++) {
    const seg = Math.floor(rand() * (STREAM_POINTS.length - 1)), u = rand();
    const [ax, az] = STREAM_POINTS[seg]!, [bx, bz] = STREAM_POINTS[seg + 1]!;
    const side = rand() < 0.5 ? -1 : 1, off = 1.2 + rand() * 0.9;
    const x = ax + (bx - ax) * u, z = az + (bz - az) * u + side * off;
    if (blocked(x, z, 0)) continue;
    put(x, z, 0.8 + rand() * 0.4, 1.5 + rand() * 0.9, grassCols[Math.floor(rand() * grassCols.length)]!, 0.16, rand() < 0.65 ? FOLIAGE_KIND.reed : FOLIAGE_KIND.rosette);
  }
  // flowering shrubs: the valley's signature, scattered across the whole meadow
  scatter(330, { x0: -58, x1: 58, z0: -14, z1: 22 }, (x, z) => {
    if (onPath(x, z, 1.4)) return;
    put(x, z, 2.2 + rand() * 0.9, 1.4 + rand() * 0.6, shrubCols[Math.floor(rand() * shrubCols.length)]!, 0.04, FOLIAGE_KIND.shrub);
  }, SEA_LEVEL + 0.4, 1.0);
  const foliageGeometry = geometry.dynamic({
    positions: f32(f.positions),
    normals: f32(f.normals),
    uvs: f32(f.uvs),
    indices: new Uint32Array(f.indices),
    attributes: {
      tint: { itemSize: 3, data: f32(f.tint) }, sway: { itemSize: 1, data: f32(f.sway) }, phase: { itemSize: 1, data: f32(f.phase) }, kind: { itemSize: 1, data: f32(f.kind) }
    }
  });
  builder.add(geometry.custom(foliageGeometry, { name: "foliage", material: material.custom(windSpec()) }).runtime({ id: lit("foliage") }));

  /* ---- the stream: a ribbon of water laid in the carved bed ---- */
  {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let run = 0;
    const samples: { x: number; z: number; dx: number; dz: number; run: number }[] = [];
    for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
      const [ax, az] = STREAM_POINTS[i]!, [bx, bz] = STREAM_POINTS[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.9));
      for (let k = 0; k < n; k++) samples.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, dx: (bx - ax) / len, dz: (bz - az) / len, run: run + (len * k) / n });
      run += len;
    }
    const last = STREAM_POINTS[STREAM_POINTS.length - 1]!;
    const prev = samples[samples.length - 1]!;
    samples.push({ x: last[0], z: last[1], dx: prev.dx, dz: prev.dz, run });
    samples.forEach((s, i) => {
      const halfW = 1.3 + 0.35 * Math.sin(s.run * 0.27);
      const y = terrainHeight(s.x, s.z) + 0.3;
      const nx = -s.dz * halfW, nz = s.dx * halfW;
      pos.push(s.x - nx, y, s.z - nz, s.x + nx, y, s.z + nz);
      uv.push(0, s.run, 1, s.run);
      if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    });
    builder.add(geometry.custom(geometry.dynamic({ positions: f32(pos), normals: f32(pos.map((_, i) => (i % 3 === 1 ? 1 : 0))), uvs: f32(uv), indices: new Uint32Array(idx) }), { name: "stream", material: material.custom(streamSpec()) }).runtime({ id: lit("stream") }));
  }

  /* ---- merged scenery ---- */
  builder.add(geometry.custom(dynamic(sc.props), { name: "scenery", material: material.custom(propSpec(shadows)) }).runtime({ id: lit("props") }));
  builder.add(geometry.custom(dynamic(sc.sails), { name: "windmill-sails", material: material.custom(propSpec(shadows)) }).runtime({ id: lit("sails") }));
  builder.add(geometry.custom(dynamic(sc.bellMesh), { name: "bell", material: material.custom(propSpec()) }).runtime({ id: lit("bell") }));
  if (!set.boat) builder.add(geometry.custom(dynamic(sc.boat), { name: "boat", material: material.custom(propSpec()) }).runtime({ id: lit("boat") }));
  addStaticModels(builder, sc, set, shadows, !original);
  LETTERS.forEach((_, i) => {
    if (!set.letter) builder.add(geometry.custom(dynamic(sc.envelope), { name: `letter-${i}`, material: material.custom(propSpec()) }).runtime({ id: lit(`letter-${i}`) }));
    builder.add(geometry.custom(geometry.dynamic(quad(1.5)), { name: `letter-glow-${i}`, material: material.custom(glowSpec(lin("#ffe9a0"), 1.5, i * 2.1)) }).runtime({ id: lit(`letter-glow-${i}`) }));
    builder.add(geometry.custom(geometry.dynamic(beam(0.5, 12)), { name: `letter-beam-${i}`, material: material.custom(shaftSpec(i * 3.7, 0.2)) }).runtime({ id: lit(`letter-beam-${i}`) }));
  });
  builder.add(geometry.custom(geometry.dynamic(quad(2.4)), { name: "bell-glow", material: material.custom(glowSpec(lin("#ffd37a"), 0.0, 4.2)) }).runtime({ id: lit("bell-glow") }));
  sc.lanterns.forEach((_, i) => {
    builder.add(geometry.custom(geometry.dynamic(quad(1.5)), { name: `lantern-glow-${i}`, material: material.custom(glowSpec(lin("#ffbf66"), 1.0, 1.3 + i)) }).runtime({ id: lit(`lantern-glow-${i}`) }));
  });

  /* ---- traveller and contact shadow ---- */
  if (!set.hero) builder.add(geometry.custom(dynamic(sc.traveller, true), { name: "traveller", material: material.custom(travellerSpec()) }).runtime({ id: lit("traveller") }));
  builder.add(geometry.custom(geometry.dynamic(ground(0.8)), { name: "traveller-shadow", material: material.custom(blobSpec()) }).runtime({ id: "shadow" }));
  if (!set.wisp) builder.add(geometry.custom(dynamic(sc.wisp), { name: "wisp", material: material.custom(propSpec()) }).runtime({ id: lit("wisp") }));
  addAnimatedModels(builder, set, LETTERS.length, shadows, !original);
  builder.add(geometry.custom(geometry.dynamic(quad(1.1)), { name: "wisp-glow", material: material.custom(glowSpec(lin("#b78cff"), 1.1, 2.7)) }).runtime({ id: lit("wisp-glow") }));

  /* ---- floating pollen ---- */
  {
    const n = Math.round(240 * density);
    const pos: number[] = [], uv: number[] = [], tint: number[] = [], idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = -56 + rand() * 112, z = -14 + rand() * 36;
      const y = Math.max(terrainHeight(x, z), SEA_LEVEL) + 0.6 + rand() * 7;
      const seed = rand(), size = 0.12 + rand() * 0.2;
      const b = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) { pos.push(x, y, z); uv.push(u, v); tint.push(seed, size, 0); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    builder.add(geometry.custom(geometry.dynamic({ positions: f32(pos), normals: f32(pos.map(() => 0)), uvs: f32(uv), indices: new Uint32Array(idx), attributes: { tint: { itemSize: 3, data: f32(tint) } } }), { name: "pollen", material: material.custom(moteSpec()) }).runtime({ id: lit("motes") }));
  }

  /* ---- post ---- */
  if (original) {
    // the 4.6 post: a gentle bloom for the glow, a saturated grade and a light vignette
    builder
      .add(effects.bloom({ name: "bloom", intensity: 0.32, threshold: 1.05, scatter: 0.55 }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.12, saturation: 1.28 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.1, smoothness: 0.8 }));
  } else {
    // WW47-P1: a softer gouache palette, a warm bloom on the glows and the sun, an umber vignette
    builder
      .add(effects.bloom({ name: "bloom", intensity: 0.42, threshold: 0.92, scatter: 0.55, color: "#ffe2b8" }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.05, exposure: 1.05 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.75, color: "#3a2a1c" }));
    if (options.quality !== "low") {
      // WW47-P2: golden-hour shafts at a low fixed strength from the found-0 sun; P3: grain 0.02 under the paper pass
      // no lightPosition: the stage takes the shadowed key; the WSW sun sits behind the follow camera, so the shafts read
      // mostly in the dusk finale and the voyage, where the camera turns toward the valley (lanes/g23.md)
      builder
        .add(effects.volumetricFog({ name: "golden shafts", density: 0.05, intensity: 0.22, color: "#ffd9a8", godRayDensity: 0.2 }))
        .add(effects.filmGrain({ name: "paper grain", intensity: 0.02 }));
    }
  }

  const propTriangles = sc.props.indices.length / 3;
  return {
    scene: builder,
    foliageCards: cardCount,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const heroAnim = set.hero ? createHeroAnimator(app) : null;
      if (set.bell) node("bell").setVisible(false);
      const cam = app.camera;
      if (!cam) throw new Error("where-the-wind-wanders-port: the app exposes no camera controller");
      const look = { x: START.x + 2, y: 2.2, z: START.z - 3.5 };
      let lastFound = -1;
      let yaw = 0, gait = 0, walkAmt = 0, lastX = START.x, lastZ = START.z, lastStep = -1, lastStepTime = -1;
      let epilogue: number | null = null;
      let bellAngle = 0;
      let swayTime = 0, lastTime = 0;
      const wisp = { x: START.x - 1.1, y: 2.4, z: START.z + 0.6 };
      const allUniformNodes = ["foliage", "sea", "sky", "props", "motes", "stream", "terrain"];
      // WW47-L1: one daylight state for every painted program, eased over 6 s between story keys
      const daylight = createDaylightDriver({ original });
      daylight.snap(options.daylightKey ?? 0);
      if (!original) { node("sky").setUniform?.("skyPainted", 1); node("foliage").setUniform?.("gustAmt", 1); }
      // WW47-V1..V3: the wind's particles and the event bursts (none on Low or under ?look=original)
      const vfx = original ? null : createWindVfx(app, { low: options.quality === "low", reducedMotion: () => motion() < 1, reducedFlash: () => motion() < 1 });
      let vfxFound = 0, vfxComplete = false, vfxHop = "idle", vfxTime = -1, vfxLantern = 1, sailAngle = 0;
      let shownDaylight: DaylightFrame | null = null;
      const applyDaylight = (f: DaylightFrame): void => {
        if (f === shownDaylight) return;
        shownDaylight = f;
        for (const id of daylightIds) writeDaylightUniforms(node(id), f);
        const sky = node("sky");
        sky.setUniform?.("skyHorizon", f.skyHorizon);
        sky.setUniform?.("skyMid", f.skyMid);
        sky.setUniform?.("skyZenith", f.skyZenith);
        sky.setUniform?.("cloudTint", f.cloudTint);
        sky.setUniform?.("starAmt", f.stars);
        if (original) return;
        // WW47-L4: the engine sun follows the day (E-B setLight); its direction is the uniform's, negated (light travel)
        node("sun").setLight?.({ direction: [-f.sunDir[0], -f.sunDir[1], -f.sunDir[2]], color: linearToHex(f.sunColor), intensity: f.engineSunIntensity });
        node("sky-fill").setLight?.({ color: linearToHex(f.hemiSky), intensity: HEMI_INTENSITY });
        app.lighting?.setEnvironmentIntensity?.(f.envIntensity / VALLEY_IBL_INTENSITY);
        sc.lanterns.forEach((_, i) => {
          node(`lantern-light-${i}`).setLight?.({ intensity: LANTERN_PEAK * f.lanterns });
          // the halo ramps with the light: 0.5 in daylight to 1.6 at dusk (WW47-L5 lantern crop >= 1.5x found 0)
          node(`lantern-glow-${i}`).setUniform?.("glowAmount", 0.5 + 1.1 * f.lanterns);
        });
      };
      return {
        foliageCards: cardCount,
        stats: { trees: sc.treeCount, propTriangles, foliageTriangles: f.indices.length / 3, terrainTriangles: terrain.indices.length / 3 },
        get nodeCount() { return handles.size; },
        get bellAngle() { return bellAngle; },
        setEpilogue(seconds) { epilogue = seconds; },
        snap(state) { heroAnim?.reset(state.pos.x, state.pos.z); look.x = state.pos.x + 2; look.y = terrainHeight(state.pos.x, state.pos.z) + 1.8; look.z = state.pos.z - 3.5; epilogue = null; },
        get daylight() { return daylight.frame; },
        reset() {
          daylight.snap(options.daylightKey ?? 0);
          vfxFound = 0; vfxComplete = false; vfxHop = "idle"; vfxTime = -1;
          look.x = START.x + 2; look.y = 2.2; look.z = START.z - 3.5;
          lastFound = -1; lastX = START.x; lastZ = START.z; lastStep = -1; lastStepTime = -1; heroAnim?.reset(START.x, START.z, 0); gait = 0; walkAmt = 0; yaw = 0; epilogue = null; wisp.x = START.x - 1.1; wisp.y = 2.4; wisp.z = START.z + 0.6;
        },
        update(state, dt, time, aspect) {
          applyDaylight(daylight.update(options.daylightKey ?? daylightKeyFor({ found: state.found.length, complete: state.complete, epilogue: epilogue !== null }), dt));
          const { x, z } = state.pos;
          const y = terrainHeight(x, z);
          const hop = state.hop.height;
          // gait follows distance travelled; the contact shadow stays on the ground
          const moved = Math.hypot(x - lastX, z - lastZ);
          if (state.step !== lastStep) {
            // the time since the previous step change, not the frame time: a frame may be shorter than a step on a 120 Hz display
            const sinceStep = lastStepTime < 0 ? dt : time - lastStepTime;
            const speed = sinceStep > 0 ? moved / sinceStep : 0;
            walkAmt += ((speed > 0.4 ? 1 : 0) - walkAmt) * Math.min(1, sinceStep * 10);
            lastX = x; lastZ = z; lastStep = state.step; lastStepTime = time;
          }

          gait = state.stride * Math.PI * 2;
          const targetYaw = FACING_YAW[state.facing] ?? 0;
          let dy = targetYaw - yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          yaw += dy * Math.min(1, dt * 14);
          const air = state.hop.phase === "air" ? 1 : state.hop.phase === "takeoff" ? 0.4 : 0;
          const squash = state.hop.phase === "takeoff" ? -0.08 : state.hop.phase === "landing" ? -0.1 : state.hop.phase === "air" ? 0.06 : 0;
          const onBoat = epilogue !== null;
          const tr = node(set.hero ? "hero" : "traveller");
          if (onBoat) {
            const b = boatPose(epilogue!);
            tr.setPosition(b.x, b.y + 0.55, b.z - 0.3).setRotation(0, b.yaw, 0);
            if (!heroAnim) tr.setUniform?.("windTime", time);
            node("shadow").setPosition(b.x, -10, b.z);
          } else {
            tr.setPosition(x, y + hop, z).setRotation(0, yaw, 0);
            node("shadow").setPosition(x, y + 0.06, z).setScale(1 - 0.35 * Math.min(1, hop / 1.2));
          }
          if (heroAnim) {
            heroAnim.update({ x, z, airborne: state.hop.phase !== "idle", onBoat, time });
          } else tr.setScale(1.3);
          if (!heroAnim) {
            tr.setUniform?.("gait", gait);
            tr.setUniform?.("walkAmt", onBoat ? 0 : walkAmt);
            tr.setUniform?.("hopAmt", air);
            tr.setUniform?.("squash", squash);
            tr.setUniform?.("windTime", time);
          }
          // wind sway runs on its own clock so reduced motion can slow it without touching the sim or the camera
          swayTime += Math.max(0, Math.min(0.25, time - lastTime)) * motion();
          if (time < lastTime) swayTime = time;
          lastTime = time;
          for (const id of allUniformNodes) node(id).setUniform?.("windTime", id === "foliage" || id === "props" ? swayTime : time);
          node("foliage").setUniform?.("playerPos", [x, y, z]);
          node("props").setUniform?.("playerPos", [x, y, z]);
          // the companion wisp drifts after the traveller
          const wk = 1 - Math.exp(-3.5 * dt);
          wisp.x += (x - 1.1 - wisp.x) * wk; wisp.z += (z + 0.6 - wisp.z) * wk; wisp.y += (y + hop * 0.6 + 2.0 + 0.18 * Math.sin(time * 2.4) - wisp.y) * wk;
          node("wisp").setPosition(wisp.x, wisp.y, wisp.z);
          const wg = node("wisp-glow");
          wg.setPosition(wisp.x, wisp.y, wisp.z);
          wg.setUniform?.("windTime", time);
          // WW47-AN1: the sails turn with the gust at the hub (calm 0.38 rad/s, up to 2.5x in a gust; 0.3x under reduced motion)
          if (original) sailAngle = time * 0.38;
          else sailAngle += Math.max(0, Math.min(0.25, dt)) * 0.38 * gustAt(sc.windmillHub.x, sc.windmillHub.z, time) * motion();
          node("sails").setPosition(sc.windmillHub.x, sc.windmillHub.y, sc.windmillHub.z).setRotation(0, 0, sailAngle);
          if (vfx) {
            if (state.found.length > vfxFound) { const l = LETTERS[state.found[state.found.length - 1]!]; if (l) vfx.letterFound([l.x, terrainHeight(l.x, l.z) + 1.3, l.z]); }
            if (state.complete && !vfxComplete) vfx.bellRing([sc.bellHang.x, sc.bellHang.y - 0.4, sc.bellHang.z]);
            if (state.hop.phase === "landing" && vfxHop !== "landing") vfx.hopLanding([x, y + 0.05, z], streamInfo(x, z).dist < 1.6 || y < SEA_LEVEL + 0.15);
            if (vfxTime >= 0 && time > vfxTime) vfx.update([x, y, z], time, time - vfxTime);
            // each lantern flares once as dusk lights it
            const lv = daylight.frame.lanterns;
            if (lv >= 0.5 && vfxLantern < 0.5) sc.lanterns.forEach((p) => vfx.lanternFlare([p.x, p.y, p.z]));
            vfxLantern = lv;
            vfxFound = state.found.length; vfxComplete = state.complete; vfxHop = state.hop.phase; vfxTime = time;
          }
          const complete = state.complete;
          if (set.bellModel) {
            bellAngle = bellSwing(time, complete, MODEL_BELL_AMPLITUDE, motion());
            node("bell-model").setRotation(0, 0, bellAngle);
          } else {
            bellAngle = bellSwing(time, complete, 1, motion());
            node("bell").setPosition(sc.bellHang.x, sc.bellHang.y, sc.bellHang.z).setRotation(0, 0, bellAngle);
          }
          if (!original) node("bell-light").setLight?.({ intensity: bellLightIntensity(complete, bellAngle, daylight.frame.lanterns) });
          node("bell-glow").setPosition(sc.bellHang.x, sc.bellHang.y - 0.55, sc.bellHang.z + 0.2);
          const bg = node("bell-glow");
          bg.setUniform?.("windTime", time);
          bg.setUniform?.("glowAmount", complete ? 1.4 : state.found.length === 3 ? 0.55 : 0);
          // letters float and spin until picked up
          if (state.found.length !== lastFound) {
            lastFound = state.found.length;
            LETTERS.forEach((_, i) => {
              const gone = state.found.includes(i);
              node(`letter-${i}`).setVisible(!gone);
              node(`letter-glow-${i}`).setVisible(!gone);
              node(`letter-beam-${i}`).setVisible(!gone);
            });
          }
          LETTERS.forEach((l, i) => {
            if (state.found.includes(i)) return;
            const ly = terrainHeight(l.x, l.z) + 1.35 + 0.14 * Math.sin(time * 2 + i);
            node(`letter-${i}`).setPosition(l.x, ly, l.z).setRotation(0.25 * Math.sin(time * 1.3 + i), time * 0.7 + i, 0.1);
            const g = node(`letter-glow-${i}`);
            g.setPosition(l.x, ly, l.z);
            g.setUniform?.("windTime", time);
            node(`letter-beam-${i}`).setPosition(l.x, terrainHeight(l.x, l.z) + 0.5, l.z + 0.2).setUniform?.("windTime", time);
          });
          sc.lanterns.forEach((p, i) => {
            const g = node(`lantern-glow-${i}`);
            g.setPosition(p.x, p.y, p.z);
            g.setUniform?.("windTime", time);
          });
          // the boat bobs at its mooring, or sails on the epilogue
          const bp = epilogue !== null ? boatPose(epilogue) : { x: sc.boatMoor.x, y: sc.boatMoor.y, z: sc.boatMoor.z, yaw: 0.06 };
          node("boat").setPosition(bp.x, bp.y + 0.05 * Math.sin(time * 1.3), bp.z).setRotation(0.03 * Math.sin(time * 0.9), bp.yaw, 0.04 * Math.sin(time * 1.1));

          if (epilogue !== null) {
            // slow voyage: pull back over the jetty, then follow the boat towards the far isle
            const e = epilogue;
            const b = boatPose(e);
            const k = Math.min(1, e / 6);
            const tx = b.x - 4 * (1 - k) + 0, tz = b.z - 2;
            look.x += (tx - look.x) * (1 - Math.exp(-1.5 * dt));
            look.y += (b.y + 2.2 - look.y) * (1 - Math.exp(-1.5 * dt));
            look.z += (tz - look.z) * (1 - Math.exp(-1.5 * dt));
            // 6.4 above the look target clears every tree top on the way from the bell to the jetty and out to sea (at 3.2 the
            // camera passed through the oak at (22.8, -1.4) by the jetty); checked against the scenery placements in
            // tests/unit/where-the-wind-wanders-port/footsteps-bell.test.ts
            const ep: [number, number, number] = [look.x - 9 + 4 * motion() * Math.sin(e * 0.05), look.y + EPILOGUE_CAMERA_RISE, look.z + 14];
            node("sky").setPosition(ep[0], ep[1], ep[2]);
            cam.setPose({ position: ep, target: [look.x, look.y, look.z], up: [0, 1, 0], fov: aspect < 1 ? 52 : 45 }, { cut: false });
            return;
          }
          // camera follow: the look target eases toward the traveller (original: lerp 1 - exp(-2.5 dt))
          const tx = x + 2, ty = y + hop + 1.8, tz = z - 3.5;
          const k = 1 - Math.exp(-2.5 * dt);
          look.x += (tx - look.x) * k;
          look.y += (ty - look.y) * k;
          look.z += (tz - look.z) * k;
          const cp: [number, number, number] = [look.x + CAMERA_OFFSET.x, look.y + CAMERA_OFFSET.y, look.z + CAMERA_OFFSET.z];
          node("sky").setPosition(cp[0], cp[1], cp[2]);
          cam.setPose({
            position: cp,
            target: [look.x, look.y, look.z],
            up: [0, 1, 0],
            fov: aspect < 1 ? 50 : 43
          }, { cut: false });
        }
      };
      function boatPose(e: number): { x: number; y: number; z: number; yaw: number } {
        // idle at the mooring for 4 s, then sail along a gentle curve to Stillwater Isle
        const t = Math.max(0, e - 4);
        const u = Math.min(1, t / 80);
        const ease = u * u * (3 - 2 * u);
        const sx = sc.boatMoor.x, sz = sc.boatMoor.z, ex = -22, ez = -108;
        const bx = sx + (ex - sx) * ease + 6 * Math.sin(ease * Math.PI), bz = sz + (ez - sz) * ease;
        const dx = (ex - sx) + 6 * Math.PI * Math.cos(ease * Math.PI), dz = ez - sz;
        return { x: bx, y: SEA_LEVEL + 0.02, z: bz, yaw: t > 0 ? Math.atan2(-dx, -dz) + Math.PI : 0.06 };
      }
    }
  };
}

function quad(size: number): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: number[] } {
  const s = size;
  return { positions: f32([-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0]), normals: f32([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]), indices: [0, 1, 2, 0, 2, 3] };
}

function beam(halfWidth: number, height: number): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: number[] } {
  return {
    positions: f32([-halfWidth, height, 0, halfWidth, height, 0, halfWidth, 0, 0, -halfWidth, 0, 0]),
    normals: f32([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: [0, 1, 2, 0, 2, 3]
  };
}

function ground(r: number): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: number[] } {
  return { positions: f32([-r, 0, -r, r, 0, -r, r, 0, r, -r, 0, r]), normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]), indices: [0, 2, 1, 0, 3, 2] };
}

