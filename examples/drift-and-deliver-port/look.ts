/**
 * Gridlock Courier: the visual layer. Lit PBR city (facade textures with metric UVs, glossy shopfronts, awnings, tiered
 * crowns), wet-asphalt road tile with SSR, parks, street furniture, skyline ring, clearcoat cars, HDRI-lit sun with
 * cascaded shadows + contact shadows, exp2 haze, GTAO, cinematic bloom, AgX + cinema-warm 3D LUT and vignette.
 * Simulation state is read, never written.
 */
import type { AuraPhotometricProfile } from "@aura3d/engine";
import { camera, defineAuraAssets, effects, environments, geometry, instances, lights, material, primitives, scene, texture } from "@aura3d/engine";
import { CAR_KINDS, buildCarShell, buildProceduralTrafficFleet, type CarKind, type CarShell } from "./vehicles";
import { planProps, propNodes, type PropPlan } from "./props";
import { GROUND_HALF, SIDEWALK_MID, WALLS, blockDecals, buildCity, buildFurniture, buildProps, facadeKey, farCity, roadPlane, type Furniture } from "./city";
import { farCitySpec, shiftFarSpec, shiftSkySpec, skySpec } from "./sky";
import { HDRI_URL, ORIGINAL, environmentRotationFor, lightDir, type LookMode, type PhaseRow } from "./phases";
import { KEY_DISTANCE, lookFrame } from "./daylight";
import { waterSpec } from "./water";
import { paintWetRoughness, wetRoad } from "./wet";
import { HALO_COLOR, haloCount } from "./brakes";
import { heightField, heightToNormal } from "./facadeNormal";
import { FESTOON, festoonBulbs, festoonIntensity } from "./festoons";
import { HEADLIGHT, SODIUM_COLOR, SODIUM_POOL, SODIUM_RANGE } from "./lamps";
import { PALETTE_SLOTS, Palette, bakePaletteUVs, createMesh, quad, toArrays, type MeshData } from "./mesh";
import { paintRoadMarkings } from "./roadPaint";
import { paintFacade, paintLaneMarkings, paintPalette, paintPark, paintPlaza, paintRoadTile, paintShopfront, paintSky, type FacadeKind } from "./textures";
import type { Block, Building, Pickup, TrafficCar } from "./world";
import type { Solid } from "./sim";
import { labCameraOptions, readLabFlags } from "../shared/lab-flags";

type TextureHandle = ReturnType<typeof texture.canvas>;
type Matrix = number[];

export const ASSETS = defineAuraAssets({
  skyHdr: { type: "texture", format: "hdr", url: new URL("./assets/sky.hdr", import.meta.url).href, metadata: { license: "CC0 1.0, Poly Haven kloppenheim_06_puresky (1k)" } },
  /** GU47 WP-28 GC-L1: the E-A catalogue copy (1.44 MB, 1024 x 512); only this game uses it as its environment. */
  veniceHdr: { type: "texture", format: "hdr", url: HDRI_URL, metadata: { license: "CC0 1.0, Poly Haven venice_sunset (1k, E-A HDRI catalogue)" } }
});

/**
 * GU47 WP-28 GC-M2: pastel stucco districts for the shift look (same variant counts as `WALLS`, so every facade key
 * keeps its texture slot): downtown towers in pale sea-glass greys, old-town apartments in cream, mint and apricot,
 * the harbour blocks in terracotta.
 */
export const SHIFT_WALLS: Record<FacadeKind, readonly string[]> = {
  // Sunlit coastal stone, sea-glass, mint & terracotta districts with crisp cool/warm facade separation (no tan wash)
  tower: ["#e8eef5", "#b4dce8", "#f2f0eb"],
  apartment: ["#f5efe4", "#9fd8c4", "#f2ba9c"],
  brick: ["#d9765f", "#e28f6d"]
};

export const FOG = { mode: "linear" as const, color: "#bdd5ea", density: 0.00016, near: 260, far: 680, maxOpacity: 0.16 } as const;

/* ------------------------------------------------------------------ matrices */

/** Column-major TRS: yaw about +y, then pitch about the local x axis, then non-uniform scale. */
export function mat(x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [cy * sx, 0, -sn * sx, 0, sn * sp * sy, cp * sy, cy * sp * sy, 0, sn * cp * sz, -sp * sz, cy * cp * sz, 0, x, y, z, 1];
}

/** `mat` written into `out` (no allocation; for per-frame instance updates). */
export function matInto(out: Float32Array, x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number): Float32Array {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  out[0] = cy * sx; out[1] = 0; out[2] = -sn * sx; out[3] = 0;
  out[4] = sn * sp * sy; out[5] = cp * sy; out[6] = cy * sp * sy; out[7] = 0;
  out[8] = sn * cp * sz; out[9] = -sp * sz; out[10] = cy * cp * sz; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

/** `coinMat` written into `out`. */
export function coinMatInto(out: Float32Array, x: number, y: number, z: number, yaw: number, diameter: number, thickness: number): Float32Array {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  out[0] = cy * diameter; out[1] = 0; out[2] = -sn * diameter; out[3] = 0;
  out[4] = sn * thickness; out[5] = 0; out[6] = cy * thickness; out[7] = 0;
  out[8] = 0; out[9] = -diameter; out[10] = 0; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

/** A cylinder lying on its side with its axis along the car's x axis (a wheel), at `(x, y, z)`. */
export function wheelMat(x: number, y: number, z: number, yaw: number, diameter: number, thickness: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [0, diameter, 0, 0, -cy * thickness, 0, sn * thickness, 0, sn * diameter, 0, cy * diameter, 0, x, y, z, 1];
}

/** A coin standing on its edge, facing along `yaw`. */
export function coinMat(x: number, y: number, z: number, yaw: number, diameter: number, thickness: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [cy * diameter, 0, -sn * diameter, 0, sn * thickness, 0, cy * thickness, 0, 0, -diameter, 0, 0, x, y, z, 1];
}

const local = (yaw: number, lx: number, lz: number): [number, number] => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)];

/* ------------------------------------------------------------------ textures */

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** The compiler binds live texture handles in the `texture` slot; the public type only names asset refs. */
const asRef = (t: TextureHandle): never => t as never;

function repeating(t: TextureHandle): TextureHandle {
  t.wrapS = "repeat";
  t.wrapT = "repeat";
  return t;
}

export interface Textures {
  road: TextureHandle;
  /** GC-M1 wet-road roughness (shift look only). */
  roadRoughness: TextureHandle | null;
  park: TextureHandle;
  plaza: TextureHandle;
  sky: TextureHandle;
  /** `normal` (GU47 WP-28 GC-M2): the relief map derived from the albedo, shift look only. */
  facade: Record<string, { albedo: TextureHandle; emissive: TextureHandle; normal?: TextureHandle; orm?: TextureHandle }>;
  shop: { albedo: TextureHandle; emissive: TextureHandle };
}

export function paintTextures(quality: "high" | "low", look: LookMode = "original"): Textures {
  const roadPx = quality === "high" ? 2048 : 1024;
  const road = canvas(roadPx, roadPx);
  paintRoadTile(road.g, roadPx);
  let roadRoughness: TextureHandle | null = null;
  if (look === "shift") {
    paintRoadMarkings(road.g, roadPx);
    wetRoad(road.g, roadPx);
    // GU47 phase 2: lane paint sits on top of the wet asphalt (the multiply pass greyed it out)
    paintLaneMarkings(road.g, roadPx);
    const rough = canvas(roadPx / 2, roadPx / 2);
    paintWetRoughness(rough.g, roadPx / 2);
    roadRoughness = repeating(texture.canvas({ canvas: rough.c, colorSpace: "linear" }));
  }
  const walls = look === "shift" ? SHIFT_WALLS : WALLS;
  const park = canvas(512, 512);
  paintPark(park.g, 512);
  const plaza = canvas(512, 512);
  paintPlaza(plaza.g, 512);
  const sky = canvas(8, 256);
  paintSky(sky.g, 8, 256);
  const facadePx = quality === "high" ? 1024 : 512;
  const facade: Textures["facade"] = {};
  (["tower", "apartment", "brick"] as const).forEach((kind, k) => {
    walls[kind].forEach((wall, v) => {
      const a = canvas(facadePx, facadePx);
      const e = canvas(facadePx, facadePx);
      // GU47 phase 4: glossy window glass in the shift look (metal-rough map at half the albedo size)
      const o = look === "shift" ? canvas(facadePx / 2, facadePx / 2) : null;
      o?.g.scale(0.5, 0.5);
      paintFacade(kind, a.g, e.g, facadePx, k * 7 + v + 1, wall, o?.g);
      facade[facadeKey(kind, v)] = { albedo: repeating(texture.canvas({ canvas: a.c, colorSpace: "srgb" })), emissive: repeating(texture.canvas({ canvas: e.c, colorSpace: "srgb" })), ...(look === "shift" ? { normal: facadeNormal(a.g, facadePx) } : {}), ...(o ? { orm: repeating(texture.canvas({ canvas: o.c, colorSpace: "linear" })) } : {}) };
    });
  });
  const sa = canvas(1024, 256);
  const se = canvas(1024, 256);
  paintShopfront(sa.g, se.g, 1024, 256);
  return {
    road: repeating(texture.canvas({ canvas: road.c, colorSpace: "srgb" })),
    roadRoughness,
    park: texture.canvas({ canvas: park.c, colorSpace: "srgb" }),
    plaza: texture.canvas({ canvas: plaza.c, colorSpace: "srgb" }),
    sky: texture.canvas({ canvas: sky.c, colorSpace: "srgb" }),
    facade,
    shop: { albedo: repeating(texture.canvas({ canvas: sa.c, colorSpace: "srgb" })), emissive: repeating(texture.canvas({ canvas: se.c, colorSpace: "srgb" })) }
  };
}

/** GC-M2: the facade relief normal map at half the albedo size (linear, repeating). */
function facadeNormal(albedo: CanvasRenderingContext2D, px: number): TextureHandle {
  const field = heightField(albedo.getImageData(0, 0, px, px).data, px, px, 2);
  const n = canvas(field.w, field.h);
  n.g.putImageData(new ImageData(heightToNormal(field) as Uint8ClampedArray<ArrayBuffer>, field.w, field.h), 0, 0);
  return repeating(texture.canvas({ canvas: n.c, colorSpace: "linear" }));
}

/* ------------------------------------------------------------------ build */

export interface TrafficRig {
  kind: CarKind;
  cars: number[];
  paint: ReturnType<typeof instances.mesh>;
  detail: ReturnType<typeof instances.mesh>;
}

export interface TrafficGroup {
  /** primary runtime id of the instanced vehicle class */
  id: string;
  /** all multi-material instanced layer ids updated together per frame */
  layerIds?: readonly string[];
  /** traffic indices drawn by this node, in instance order */
  cars: readonly number[];
  scale: number;
}

export interface LookRig {
  builder: ReturnType<typeof scene>;
  traffic: TrafficRig[];
  /** traffic drawn as generated models, one instanced node per car kind; empty when the instanced shells are used */
  modelTraffic: TrafficGroup[];
  /** collision solids of the generated hydrants and bus shelters (empty with `models: false`) */
  propSolids: readonly Solid[];
  coinMesh: ReturnType<typeof instances.mesh>;
  starMesh: ReturnType<typeof instances.mesh>;
  heartMesh: ReturnType<typeof instances.mesh>;
  /** GU47 WP-28 GC-AN1/GC-L5: brake-lamp halos, two per car (courier first), one draw; null in the original look. */
  tailHalos: ReturnType<typeof instances.mesh> | null;
  coins: Pickup[];
  stars: Pickup[];
  hearts: Pickup[];
  furniture: Furniture;
  playerShell: CarShell;
  palette: TextureHandle;
  /** GU47 WP-28: the painted textures (facade materials are rebuilt from them as the windows come on). */
  textures: Textures;
  /** Runtime ids and facade keys of the window-lit facade nodes (shift look; empty in the original look). */
  facadeNodes: readonly { id: string; key: string }[];
  /** True when the time-of-day shift look was built. */
  shift: boolean;
  stats: { cityTriangles: number; chunks: number; awnings: number; tallest: number; lamps: number; trees: number; pedestrians: number; propTriangles: number };
}

const PAINTS = ["#c9402a", "#2f3138", "#3c8fcf", "#e0a02a", "#d8d2c4", "#5f8a45", "#8a2f4d", "#e9e4da"];
const LEAF = ["#6f9a45", "#7aa84e", "#5f8a3e", "#86b05a", "#6a9f58"];

const geo = (m: MeshData, _name: string) => {
  const a = toArrays(m);
  return geometry.define({ positions: a.positions, normals: a.normals, uvs: a.uvs, colors: a.colors, indices: a.indices });
};

/**
 * Hemisphere "sky-fill" intensity. Up to 4.5.0 the engine dropped an authored hemisphere next to an environment node
 * (LIGHT-05), so the shipped HDRI frame never had this fill; the 1.7 only lit the lights-only `env=0` path (heal rung
 * `no-env`). With the hemisphere now adding to the HDRI, 1.7 lifts the steady-state frame by 10.7% (mean luma 108.2 to
 * 119.8, lane E2). Next to the HDRI the fill is kept small so the shipped frame holds; the lights-only path keeps 1.7.
 */
export const SKY_FILL = { withEnv: 0.3, lightsOnly: 1.7 } as const;

/** Sky-fill intensity for the light rig; `override` is the `skyfill=` diagnostics switch. */
export function skyFillIntensity(env: boolean, override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override >= 0) return override;
  return env ? SKY_FILL.withEnv : SKY_FILL.lightsOnly;
}

/**
 * Neutral-room fill for the lights-only path (`env=0`, the heal ladder's `no-env` rung). Up to 4.3.7 the engine added
 * this room probe implicitly to a scene without an environment node; 4.5.0 stopped (`implicitFill: false`, LIGHT-01), and
 * the rung read 39% darker (mean luma 123.5 on 4.3.7, 75.5 on 4.5.0, remote software GL). Authoring it restores the 4.3.7
 * frame. It is generated in code, so the rung still loads no HDRI.
 */
export const LIGHTS_ONLY_NEUTRAL = 1;

/** Neutral fill intensity for the light rig; `override` is the `neutral=` diagnostics switch. 0 next to the HDRI. */
export function neutralFillIntensity(env: boolean, override?: number): number {
  if (env) return 0;
  if (override !== undefined && Number.isFinite(override) && override >= 0) return override;
  return LIGHTS_ONLY_NEUTRAL;
}

export interface LookOptions {
  models: boolean;
  quality: "high" | "low";
  ao: boolean;
  env: boolean;
  shadow: boolean;
  fog: boolean;
  post: boolean;
  aa?: boolean;
  sky: boolean;
  sun: number;
  skyFill?: number;
  neutral?: number;
  roadCells?: number;
  start: { x: number; z: number };
  /** GU47 WP-28: "shift" (the time-of-day look, default) or "original" (the 4.6.1 look, `?look=original`). */
  look?: LookMode;
  /** Look-table row the shift look is built at (the first frame; `daylight.ts` drives it from there). */
  row?: PhaseRow;
  /** 5.x A5 lab (`?lights=ies`): measured IES low-beam for the headlight spot; absent = the scalar spot. */
  headlightProfile?: AuraPhotometricProfile;
  /** Coarse-pointer mobile handset budget trim (`>=60 FPS` on iPhone while keeping desktop/QA captures at full High). */
  mobileTrim?: boolean;
}

/**
 * Cool coastal sky-blue IBL balance against `venice_sunset_1k.hdr` so diffuse environment fill reads as crisp daylight
 * sky rather than an amber sunset cast, with clean road reflections on wet slate asphalt.
 */
export const SHIFT_ENV_TINT = "#9ec8ff";
export const SHIFT_ROAD_ENV = 0.42;
export const CINEMA_WARM_LUT_URL = new URL("./assets/luts/cinema-warm.cube", import.meta.url).pathname;

/** GU47 WP-28 GC-L2: the shift look's key shadow per tier (High: 3 cascades over 220 m, PCSS; Mobile: 2 cascades PCF; Low: 1 cascade, PCF). */
export function shiftShadow(quality: "high" | "low", mobileTrim = false) {
  if (quality !== "high") return { cascades: 1 as const, maxDistance: 110, mapSize: 1024 as const, filter: "pcf" as const };
  if (mobileTrim) return { cascades: 2 as const, maxDistance: 140, blend: 0.1, mapSize: 1024 as const, filter: "pcf" as const };
  return { cascades: 3 as const, maxDistance: 220, blend: 0.12, mapSize: 2048 as const, filter: "pcss" as const, lightSize: 1.6 };
}

/** GC-P3: the title/results tilt-shift band (normalised screen height; the courier sits just under the middle). */
export const TILT = { bandCenter: 0.56, bandWidth: 0.2, maxBlur: 0 } as const;

/** GC-S5: crisp neutral-white atmospheric shafts (disabled during day, zero warm beige haze). */
export const GOD_RAYS = { density: 0.012, color: "#f6f9ff", intensity: 0, godRayDensity: 0.28 } as const;

/** GC-V3: festoon bulb material at a festoon strength 0..1 (quantised). */
export const festoonMaterial = (strength: number) => material.emissive({ color: FESTOON.color, emissive: FESTOON.color, emissiveIntensity: festoonIntensity(strength) });

/** GC-M2: facade material at a window emissive intensity (0.15 by day to 1.4 at blue hour in the shift look). */
export function facadeMaterial(tex: Textures, key: string, windows: number) {
  const f = tex.facade[key]!;
  const glass = f.orm ? { roughness: 1, metallic: 1, roughnessMap: asRef(f.orm), metalnessMap: asRef(f.orm) } : { roughness: 0.82, metallic: 0.02 };
  return material.pbr({ color: "#ffffff", ...glass, texture: asRef(f.albedo), emissiveMap: f.emissive, emissive: "#ffffff", emissiveIntensity: windows, textureAnisotropy: 8, ...(f.normal ? { normal: asRef(f.normal), normalScale: 1 } : {}) });
}

export function buildLook(world: { blocks: readonly Block[]; buildings: readonly Building[]; traffic: readonly TrafficCar[]; pickups: readonly Pickup[] }, opts: LookOptions): LookRig {
  const high = opts.quality === "high";
  const shift = (opts.look ?? "shift") === "shift" && opts.row !== undefined;
  const row = opts.row;
  const frame = shift && row ? lookFrame(row) : null;
  const tex = paintTextures(opts.quality, shift ? "shift" : "original");
  const city = buildCity(world.blocks, world.buildings);
  const furniture = buildFurniture(world.blocks);
  // solid colours (awnings, roofs, trims, car glass and lamps) sample one palette strip, baked into the UVs
  const palette = new Palette();
  for (const chunk of city.chunks) bakePaletteUVs(chunk.meshes.trim as MeshData, palette);
  const shells = new Map<CarKind, CarShell>(CAR_KINDS.map((k) => [k, buildCarShell(k)] as const));
  const playerShell = buildCarShell("sedan");
  for (const shell of [...shells.values(), playerShell]) bakePaletteUVs(shell.detail, palette);
  const far = farCity();
  bakePaletteUVs(far, palette);
  const propPlan: PropPlan | null = opts.models ? planProps(furniture, world.blocks, world.buildings, opts.start) : null;
  const props = buildProps(furniture, propPlan?.skip);
  bakePaletteUVs(props, palette);
  const paletteCanvas = canvas(PALETTE_SLOTS * 16, 16);
  paintPalette(paletteCanvas.g, palette.hexes, PALETTE_SLOTS);
  const paletteTex = texture.canvas({ canvas: paletteCanvas.c, colorSpace: "srgb" });
  paletteTex.generateMipmaps = false;

  const mobileTrim = Boolean(opts.mobileTrim);
  const b = scene()
    .background({ texture: asRef(tex.sky) })
    .camera(
      camera.perspective({
        ...labCameraOptions(readLabFlags(), "reversed"),
        position: shift ? [opts.start.x, 2.12, opts.start.z - 4.95] : [opts.start.x, 2.22, opts.start.z - 4.95],
        target: shift ? [opts.start.x, 1.08, opts.start.z + 4.6] : [opts.start.x, 1.08, opts.start.z + 4.6],
        fov: shift ? 56 : 55,
        near: 0.4,
        far: 2400
      })
    );

  // ---- light rig, atmosphere and post ----
  if (frame && row) {
    // GU47 WP-28 (GC-L1/L2/L6/S1/S3/P1): venice_sunset IBL, one shadowed key driven per frame, linear Mediterranean aerial fog
    if (opts.env) b.add(environments.hdri({ name: "env-sky", texture: ASSETS.veniceHdr, intensity: row.environmentIntensity, background: false, rotation: environmentRotationFor(row.sun.azimuthDeg), color: SHIFT_ENV_TINT }));
    const neutral = neutralFillIntensity(opts.env, opts.neutral);
    if (neutral > 0) b.add(environments.neutral({ name: "env-room", intensity: neutral }));
    const toKey = lightDir(row.key);
    const at = opts.start;
    b.add(lights.directional({ name: "sun", position: [at.x + toKey[0] * KEY_DISTANCE, toKey[1] * KEY_DISTANCE, at.z + toKey[2] * KEY_DISTANCE], target: [at.x, 0, at.z], intensity: row.key.intensity * (opts.sun / 4.4), color: row.key.color, shadow: opts.shadow ? shiftShadow(opts.quality, mobileTrim) : false }).runtime({ id: "sun" }));
    if (!opts.env) b.add(lights.hemisphere({ name: "sky-fill", skyColor: row.hemisphere.sky, groundColor: row.hemisphere.ground, intensity: skyFillIntensity(false, opts.skyFill) }).runtime({ id: "sky-fill" }));
    // GC-L4 sodium pool and GC-L5 headlight spot: placed by main.ts each frame, dark until sunset / headlights on
    for (let i = 0; i < SODIUM_POOL; i++) b.add(lights.point({ name: `sodium-${i}`, position: [at.x, -40, at.z], color: SODIUM_COLOR, intensity: 0, distance: SODIUM_RANGE }).runtime({ id: `sodium-${i}` }));
    b.add(lights.spot({ name: "headlight", position: [at.x, HEADLIGHT.y, at.z + HEADLIGHT.ahead], target: [at.x, 0, at.z + 20], color: HEADLIGHT.color, intensity: 0, distance: HEADLIGHT.distance, angle: (HEADLIGHT.angleDeg * Math.PI) / 180, penumbra: HEADLIGHT.penumbra, ...(opts.headlightProfile ? { photometricProfile: opts.headlightProfile } : {}) }).runtime({ id: "headlight" }));
    if (opts.fog) b.add(effects.fog({ name: "haze", mode: "linear", color: row.fog.color, near: row.fog.near, far: row.fog.far, maxOpacity: row.fog.maxOpacity }));
    if (high && !mobileTrim && opts.ao) b.add(effects.ambientOcclusion({ name: "ao", intensity: 0.62, radius: 0.85 }));
    // GC-L3: crisp contact shadows under cars, tires, posts and grounded street props (Desktop High tier)
    if (high && !mobileTrim && opts.shadow) b.add(effects.contactShadows({ length: 0.42, thickness: 0.14, steps: 16, intensity: 0.9, lights: "sun" }));
    if (opts.post) {
      b.add(effects.cinematicBloom({ intensity: row.bloom.intensity, threshold: row.bloom.threshold, radius: 0.32, color: "#ffffff", maxIntensity: 0.65 }));
      b.add(effects.colorGrade({ name: "grade", contrast: row.grade.contrast, saturation: row.grade.saturation, temperature: row.grade.temperature }));
      b.add(effects.vignette({ name: "vignette", intensity: row.vignette, smoothness: 0.72 }));
      if (high && !mobileTrim) {
        b.add(effects.screenSpaceReflections({ name: "ssr", intensity: 0.46, maxDistance: 26, roughness: 0.24, thickness: 0.28 }));
        b.add(effects.filmGrain({ name: "grain", intensity: row.grain }));
      }
      if (opts.aa !== false) b.add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
    }
    if (opts.sky) b.add(primitives.sphere({ name: "sky-dome", size: 3600, material: material.custom(shiftSkySpec({ ...frame.sky, skyDrift: 0 })), castShadow: false, receiveShadow: false }).runtime({ id: "sky-dome" }));
  } else {
    if (opts.env) b.add(environments.hdri({ name: "env-sky", texture: ASSETS.skyHdr, intensity: ORIGINAL.environmentIntensity, background: false, color: "#eef5ff" }));
    const neutral = neutralFillIntensity(opts.env, opts.neutral);
    if (neutral > 0) b.add(environments.neutral({ name: "env-room", intensity: neutral }));
    b.add(lights.directional({ name: "sun", position: [-62, 78, -54], target: [0, 0, 0], intensity: opts.sun, color: ORIGINAL.key.color, shadow: high && opts.shadow ? { cascades: 2, maxDistance: 150, blend: 0.12, mapSize: mobileTrim ? 1024 : 2048 } : false }).runtime({ id: "sun" }));
    b.add(lights.hemisphere({ name: "sky-fill", skyColor: ORIGINAL.hemisphere.sky, groundColor: ORIGINAL.hemisphere.ground, intensity: skyFillIntensity(opts.env, opts.skyFill) }));
    if (opts.fog) b.add(effects.fog({ name: "haze", mode: "linear", color: FOG.color, near: FOG.near, far: FOG.far, maxOpacity: FOG.maxOpacity }));
    if (high && opts.ao) b.add(effects.ambientOcclusion({ name: "ao" }));
    if (opts.post) {
      b.add(effects.bloom({ name: "bloom", intensity: ORIGINAL.bloom.intensity, threshold: ORIGINAL.bloom.threshold, radius: 0.32 }));
      b.add(effects.colorGrade({ name: "grade", contrast: ORIGINAL.grade.contrast, saturation: ORIGINAL.grade.saturation, temperature: ORIGINAL.grade.temperature }));
      b.add(effects.vignette({ name: "vignette", intensity: ORIGINAL.vignette, smoothness: 0.7 }));
      if (opts.aa !== false) b.add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
    }

    if (opts.sky) b.add(primitives.sphere({ name: "sky-dome", size: 3600, material: material.custom(skySpec()), castShadow: false, receiveShadow: false }));
  }

  // ---- ground, roads, parks, water ----
  // GC-M1: wet road in the shift look (darkened asphalt baked in the tile, puddles at roughness 0.04)
  const roadMat = tex.roadRoughness
    ? material.pbr({ color: "#ffffff", roughness: 1, metallic: 0, texture: asRef(tex.road), roughnessMap: asRef(tex.roadRoughness), envMapIntensity: SHIFT_ROAD_ENV, textureAnisotropy: 8 })
    : material.pbr({ color: "#ffffff", roughness: 0.88, texture: asRef(tex.road), textureAnisotropy: 8 });
  b.add(geometry.custom(geo(roadPlane(opts.roadCells), "road"), { name: "road-tiles", material: roadMat, castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(blockDecals(world.blocks, "park", 21.5), "parks"), { name: "parks", material: material.pbr({ color: "#ffffff", roughness: 0.95, texture: asRef(tex.park) }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(blockDecals(world.blocks, "plaza", 21.5), "plazas"), { name: "plazas", material: material.pbr({ color: "#ffffff", roughness: 0.9, texture: asRef(tex.plaza) }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(outerGround(), "outer"), { name: "outer-ground", material: material.pbr({ color: "#7d8c82", roughness: 1 }), castShadow: false, receiveShadow: true }));
  if (frame) {
    // GC-S4 animated harbour water and GC-S2 skyline aerial perspective, both driven per frame by daylight.ts
    b.add(geometry.custom(geo(waterPlane(), "water"), { name: "harbour", material: material.custom(waterSpec({ ...frame.water, waterTime: 0 })), castShadow: false, receiveShadow: false }).runtime({ id: "harbour" }));
    if (opts.sky) b.add(geometry.custom(geo(far, "far-city"), { name: "far-city", material: material.custom(shiftFarSpec(paletteTex, frame.far)), castShadow: false, receiveShadow: false }).runtime({ id: "far-city" }));
  } else {
    b.add(geometry.custom(geo(waterPlane(), "water"), { name: "harbour", material: material.pbr({ color: "#3f8fb0", roughness: 0.16, metallic: 0.05 }), castShadow: false, receiveShadow: false }));
    if (opts.sky) b.add(geometry.custom(geo(far, "far-city"), { name: "far-city", material: material.custom(farCitySpec(paletteTex)), castShadow: false, receiveShadow: false }));
  }

  // ---- the city itself ----
  const facadeMat = (key: string) => facadeMaterial(tex, key, row && shift ? row.windows : 0.6);
  const facadeNodes: { id: string; key: string }[] = [];
  const shopMat = material.pbr({
    color: "#ffffff",
    roughness: shift ? 0.22 : 0.7,
    metallic: shift ? 0.08 : 0,
    ...(shift ? { clearcoat: 0.88, clearcoatRoughness: 0.06, envMapIntensity: 1.28 } : {}),
    texture: asRef(tex.shop.albedo),
    emissiveMap: tex.shop.emissive,
    emissive: "#ffffff",
    emissiveIntensity: 0.7,
    textureAnisotropy: 8
  });
  const solidMat = material.pbr({ color: "#ffffff", roughness: 0.78, texture: asRef(paletteTex) });
  for (const chunk of city.chunks) {
    for (const [key, m] of Object.entries(chunk.meshes)) {
      if (!m.indices.length) continue;
      const mat = key === "shop" ? shopMat : key === "trim" ? solidMat : facadeMat(key);
      const name = `city-${chunk.key}-${key.replace(":", "-")}`;
      const n = geometry.custom(geo(m, key), { name, material: mat, castShadow: key !== "trim", receiveShadow: true });
      if (shift && key !== "shop" && key !== "trim") {
        facadeNodes.push({ id: name, key });
        b.add(n.runtime({ id: name }));
      } else b.add(n);
    }
  }

  // ---- street furniture, trees and pedestrians: one merged static mesh in palette colours ----
  b.add(geometry.custom(geo(props, "props"), { name: "props", material: material.pbr({ color: "#ffffff", roughness: 0.82, texture: asRef(paletteTex) }), castShadow: false, receiveShadow: true }));

  // ---- procedural multi-material props: near-field lamps, signals, trees, hydrants, shelters, shopfronts & landmarks ----
  // GC-L2: in the shift look the near-field lamps, signals, shelters and landmarks cast into the raking sun
  if (propPlan) {
    for (const n of propNodes(propPlan, shift)) b.add(n);
  }

  // ---- traffic: 6-class multi-material procedural city fleet (or `?models=0` low-poly fallback shells) ----
  const modelTraffic: TrafficGroup[] = [];
  if (opts.models) {
    const fleet = buildProceduralTrafficFleet(world.traffic, shift && !mobileTrim);
    for (const n of fleet.nodes) b.add(n);
    modelTraffic.push(...fleet.groups);
  }
  const traffic: TrafficRig[] = (opts.models ? [] : CAR_KINDS).map((kind) => {
    const cars = world.traffic.map((_, i) => i).filter((i) => i % CAR_KINDS.length === CAR_KINDS.indexOf(kind));
    const shell = shells.get(kind)!;
    const paint = instances.mesh(geo(shell.paint, `${kind}-paint`), material.carPaint({ color: "#ffffff", roughness: 0.28, metallic: 0.16, clearcoat: 0.88, clearcoatRoughness: 0.07, envMapIntensity: 1.32 }), cars.length);
    const detail = instances.mesh(geo(shell.detail, `${kind}-detail`), material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1, texture: asRef(paletteTex) }), cars.length);
    cars.forEach((carIndex, n) => paint.setColorAt(n, PAINTS[(carIndex * 5 + CAR_KINDS.indexOf(kind)) % PAINTS.length] as string));
    b.add(paint).add(detail);
    return { kind, cars, paint, detail };
  });

  // ---- pickups ----
  const coins = world.pickups.filter((p) => p.kind === "coin");
  const stars = world.pickups.filter((p) => p.kind === "star");
  const hearts = world.pickups.filter((p) => p.kind === "heart");
  const coinMesh = instances.mesh("cylinder", material.emissive({ color: "#ffd15c", emissive: "#ffb300", emissiveIntensity: 1.2 }), coins.length);
  const starMesh = instances.mesh("polyhedron", material.emissive({ color: "#fff0a8", emissive: "#ffd54a", emissiveIntensity: 1.3 }), stars.length);
  const heartMesh = instances.mesh("sphere", material.emissive({ color: "#ff8aa8", emissive: "#ff4d79", emissiveIntensity: 1.2 }), hearts.length);
  b.add(coinMesh).add(starMesh).add(heartMesh);
  // GC-AN1 / GC-L5 (shift look): brake-lamp halos in tail red, hidden until a car brakes (+1 draw)
  const tailHalos = shift ? instances.mesh("sphere", material.emissive({ color: HALO_COLOR, emissive: HALO_COLOR, emissiveIntensity: 2.4 }), haloCount(world.traffic.length)) : null;
  if (tailHalos) b.add(tailHalos);
  // GC-V3 (shift look): festoon bulbs across the harbour-front streets, lit from sunset (+1 draw)
  if (shift && row) {
    const bulbs = festoonBulbs(furniture.lamps, SIDEWALK_MID);
    if (bulbs.length) b.add(instances.sphere({ name: "festoons", size: [FESTOON.size, FESTOON.size, FESTOON.size], material: festoonMaterial(row.festoon), transforms: bulbs.map((p) => ({ position: [p.x, p.y, p.z] as [number, number, number] })), castShadow: false, receiveShadow: false }).runtime({ id: "festoons" }));
  }

  return {
    builder: b,
    traffic,
    modelTraffic,
    propSolids: propPlan?.solids ?? [],
    coinMesh,
    starMesh,
    heartMesh,
    tailHalos,
    coins,
    stars,
    hearts,
    furniture,
    playerShell,
    palette: paletteTex,
    textures: tex,
    facadeNodes,
    shift,
    stats: { cityTriangles: city.stats.triangles, chunks: city.stats.chunks, awnings: city.stats.awnings, tallest: city.stats.tallest, lamps: furniture.lamps.length, trees: furniture.streetTrees.length + furniture.parkTrees.length, pedestrians: furniture.pedestrians.length, propTriangles: props.indices.length / 3 }
  };
}

/* ------------------------------------------------------------------ small geometry */


/**
 * The terrain around the road square. It is a frame with a hole where the road lies, never a full plane under it: a
 * plane 3 cm below the road competes with the road in the depth buffer on a coarse depth buffer (one depth step at 30 m
 * on a 16-bit buffer is about 3 cm), and a tie goes to the later-drawn layer. Hardening only: the road flip seen in
 * the first frames was reproduced with and without this change (see the render-fix README).
 */
export function outerGroundRects(): readonly (readonly [number, number, number, number])[] {
  const h = 1600;
  const r = GROUND_HALF;
  // [x0, z0, x1, z1]
  return [
    [-h, r, h, h], // north strip
    [-h, -h, h, -r], // south strip
    [-h, -r, -r, r], // west strip
    [r, -r, h, r] // east strip
  ];
}

export function outerGround(): MeshData {
  const m = createMesh();
  for (const [x0, z0, x1, z1] of outerGroundRects()) quad(m, [x0, -0.03, z1], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)], [1, 1, 1], [0, 0], [1, 1]);
  return m;
}

export function waterPlane(): MeshData {
  const m = createMesh();
  quad(m, [-1600, 0.02, 1700], [3200, 0, 0], [0, 0, -1190], [1, 1, 1], [0, 0], [1, 1]);
  return m;
}

export { GROUND_HALF };
