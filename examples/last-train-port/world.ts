/**
 * Last Train to the Sea world on the public `@aura3d/engine` surface only: the six-town ring railway (track built from
 * the original's measured route: ballast ribbon, instanced sleepers, rails, trestle pylons and masts), cloud-top
 * islands dressed with catalog houses, trees, rocks, a windmill and a watchtower, a station platform per town, an
 * open-sided tram with twelve seats and seated passengers, a sky dome and cloud sea (`material.custom`), and rain / snow /
 * mote points. The look is image-based lighting (CC0 sky HDRI), a cascaded-shadow sun, a cool moon fill, exp2 fog,
 * bloom, colour grade and vignette (AO is opt-in with `?fx=ao`: the engine drops the pass on this path for a missing
 * normals input, audit D-08); day/night re-aims the lights and moves the lighting runtime's environment intensity
 * and the output exposure. Everything the original fetched remotely is re-created or replaced with licensed assets.
 */
import { camera, cameras, defineAuraAssets, effects, environments, geometry, lights, material, model, instances, primitives, scene, text3D, type AuraApp, type AuraAssetRef } from "@aura3d/engine";
import { BANDS, HDRI_URL, bandFor, lightningFlash, storminess, envRotationRad, keyPosition, parseBand, parseLook, rgb, shouldSwapBand, skySunDirection, townSky, type BandId, type LamplightHdri } from "./bands";
import { LanternSky } from "./lanterns";
import { RiderMotion, tramBob } from "./riderMotion";
import { registerLamplightVfx, vfxEvents, type VfxSimView } from "./vfx";
import { BOUNCE_ID, HEADLAMP_COLOR, HEADLAMP_ID, PLATFORM_LIGHT_COLOR, PLATFORM_LIGHT_IDS, PLATFORM_LIGHT_RANGE, headlampPose, platformLightPositions, poolTown, stationProbes, STATION_PROBE_RESOLUTION } from "./lights";
import { probes } from "@aura3d/engine/lanes";
import { MESHY_ASSETS, MESHY_ENABLED, PAX_SCALE, TRAM } from "./models";
import { applyMat3, axisRotation, matrixToEulerZYX, multiplyMat3, tramRotation, type V3 } from "./orient";
import { cloudSpec, pointsSpec, rainSpec, skySpec } from "./materials";
import { MeshData, boxAt, cylinderX, roofDome, gableRoof, groundDisc, makeTownTextures, pyramidRoof, stoneArch, wallBox, type TownTextures } from "./townkit";
import { ShotDirector, type ShotKind } from "./shots";
import { lamplightCrops, type QaCrop, type QaCameraPose } from "./qaCrops";
import { sampleRoute, type SimData, type SimState, type Temperament } from "./sim";

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

export function lehmer(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646;
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const rgbHex = (c: readonly number[]): string => `#${[0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(1, c[i]!)) * 255).toString(16).padStart(2, "0")).join("")}`;
const mixRgb = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const mixHex = (a: string, b: string, t: number): string => rgbHex(mixRgb(hexToRgb(a), hexToRgb(b), t));
const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const TEMPERAMENT_COLORS: Record<Temperament, string> = { easy: "#f2c14e", sightseer: "#6bc5a0", rushed: "#e4572e", sleeper: "#7a8cff" };
const TEMPERAMENTS = Object.keys(TEMPERAMENT_COLORS) as Temperament[];

/** Seat layout in tram-local coordinates (x side, y up, z forward): two benches of six, torso centre height. */
export const SEATS: V3[] = Array.from({ length: 12 }, (_, i) => [i < 6 ? -0.85 : 0.85, 2.3, -3.4 + (i % 6) * 1.36] as V3);

/** GU47 LT-09: the snowing town (Drowned Observatory, see `weatherOf`) and its snow-dusted roof colour (band look). */
export const SNOW_TOWN = 3;
export const SNOW_ROOF_COLOR = "#eef1f4";
/** Particles around the camera for the monsoon rain and the observatory snow. */
export const WEATHER_COUNT = 360;
const MOTE_COUNT = 160;
const RAIN_COUNT = 320;

export interface Ribbon { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }

/** A flat ribbon along sampled centreline points (`pts` is x,y,z triples); `half` is the half-width, `lift` raises it. */
export function ribbon(pts: readonly number[], half: number, lift: number, offset = 0): Ribbon {
  const n = pts.length / 3;
  const out: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let fx = pts[b * 3]! - pts[a * 3]!, fz = pts[b * 3 + 2]! - pts[a * 3 + 2]!;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sx = fz, sz = -fx; // right-hand side on the ground plane
    const cx = pts[i * 3]! + sx * offset, cy = pts[i * 3 + 1]! + lift, cz = pts[i * 3 + 2]! + sz * offset;
    out.positions.push(cx - sx * half, cy, cz - sz * half, cx + sx * half, cy, cz + sz * half);
    out.normals.push(0, 1, 0, 0, 1, 0);
    out.uvs.push(0, i / 8, 1, i / 8);
    if (i < n - 1) { const k = i * 2; out.indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  return out;
}

const dyn = (r: Ribbon) => geometry.dynamic({ positions: f32(r.positions), normals: f32(r.normals), uvs: f32(r.uvs), indices: Uint32Array.from(r.indices) });
const pbr = (color: string, roughness = 0.8, metallic = 0) => material.pbr({ color, roughness, metallic });
const glow = (color: string, intensity = 1.2) => material.emissive({ color, emissive: color, emissiveIntensity: intensity });

const PAX_ASSET = { easy: MESHY_ASSETS.paxEasy, sightseer: MESHY_ASSETS.paxSightseer, rushed: MESHY_ASSETS.paxRushed, sleeper: MESHY_ASSETS.paxSleeper };
const HOUSES = [MESHY_ASSETS.houseCream, MESHY_ASSETS.houseOchre, MESHY_ASSETS.houseBlue];
const LICENSE_CATALOG = "Aura3D catalog (gullsiege Meshy set), licensed for use with the engine";
/** The windmill and tower are the catalog GLBs with their 1024 px maps resized to 512 px (audit D-09: they are distant landmarks). */
const ASSETS = defineAuraAssets({
  windmill: {
    type: "model", format: "glb", url: new URL("./assets/windmill.glb", import.meta.url).href,
    sha256: "612f5ff55b5c0d3544f3dfbf17f38b290ade0b58eb118f16b681d25572324fa7", sizeBytes: 866416,
    metadata: { license: LICENSE_CATALOG, provenance: { sourcePath: "public/aura-assets/gullsiegeWindmillMeshy.f4ebca18.glb" } }
  },
  tower: {
    type: "model", format: "glb", url: new URL("./assets/tower.glb", import.meta.url).href,
    sha256: "f682cf1b45ee70e663eecd5cc84b58fbfa60f555e34450472ee91b5a57336006", sizeBytes: 803968,
    metadata: { license: LICENSE_CATALOG, provenance: { sourcePath: "public/aura-assets/gullsiegeWatchtowerMeshy.546ee761.glb" } }
  },
  skyHdr: { type: "texture", format: "hdr", url: new URL("./assets/sky.hdr", import.meta.url).href, metadata: { license: "CC0 1.0, Poly Haven kloppenheim_06_puresky (1k)" } },
  /* GU47 LT-04: the band HDRIs from the E-A catalogue (served at /hdri/<id>_1k.hdr; CC0, Poly Haven, public/hdri/ATTRIBUTION.md) */
  belfast_sunset_puresky: { type: "texture", format: "hdr", url: HDRI_URL("belfast_sunset_puresky"), metadata: { license: "CC0 1.0, Poly Haven belfast_sunset_puresky (1k, E-A catalogue)" } },
  industrial_sunset_puresky: { type: "texture", format: "hdr", url: HDRI_URL("industrial_sunset_puresky"), metadata: { license: "CC0 1.0, Poly Haven industrial_sunset_puresky (1k, E-A catalogue)" } },
  rooftop_night: { type: "texture", format: "hdr", url: HDRI_URL("rooftop_night"), metadata: { license: "CC0 1.0, Poly Haven rooftop_night (1k, E-A catalogue)" } }
});
const BAND_HDRI: Readonly<Record<LamplightHdri, AuraAssetRef<"texture">>> = { belfast_sunset_puresky: ASSETS.belfast_sunset_puresky, industrial_sunset_puresky: ASSETS.industrial_sunset_puresky, rooftop_night: ASSETS.rooftop_night };

/** A scene look: a GU47 time band (A-E), or today's `day` / `night` look (`?look=original`). */
export type SceneLook = BandId | "day" | "night";

/** Rain near Monsoon Exchange (town 4), snow near the Drowned Observatory (town 3), judged at the nearer town of the current leg. */
export function weatherOf(data: SimData, sim: SimState): "clear" | "rain" | "snow" {
  const k = smooth(0.22, 0.82, sim.distance / data.route.legs[sim.leg]!.length);
  const near = k < 0.5 ? sim.leg : (sim.leg + 1) % data.tables.towns.length;
  return near === 4 ? "rain" : near === SNOW_TOWN ? "snow" : "clear";
}

/**
 * `scene` is the first scene shown (band A, or today's day look under `?look=original`); `nightScene` is the night one (band E,
 * or today's night). `sceneFor(look)` builds any band scene on first use and caches it: every band scene has the same node
 * ids, so the runtime swaps them with `setScene` while the tram is docked (GU47 LT-01).
 */
export interface World {
  readonly scene: Scene;
  readonly nightScene: Scene;
  readonly look: "bands" | "original";
  sceneFor(look: SceneLook): Scene;
  bind(app: AuraApp, data: SimData, startNight?: boolean): WorldRuntime;
}
export interface WorldRuntime {
  /** `orbit` swings the camera slowly around the tram (title screen) instead of chasing it; `reducedMotion` holds the title camera still and drops the dock sway. */
  update(sim: SimState, seconds: number, options?: { readonly orbit?: boolean; readonly reducedMotion?: boolean }): void;
  readonly nodeCount: number;
  readonly camera: { eye: V3; target: V3 };
  /** The band scene on screen (`null` under `?look=original`) and how many scene swaps happened while en route (LT-01: 0). */
  readonly band: BandId | null;
  readonly enrouteSwaps: number;
  /** LT-13: lanterns aloft now and released this session. */
  readonly lanterns: { readonly aloft: number; readonly released: number };
  /** LT-16: the camera shot on screen and shots started this session (6 arrivals per circuit). */
  readonly shots: { readonly active: ShotKind | null; readonly started: Readonly<Record<ShotKind, number>> };
  /** LT-16: ends the current shot (any key or tap). */
  skipShot(): void;
  /** E-I capture crops (`sky-top`, `platform`, `headlamp`), normalised to the canvas, from the pose of the last update. */
  qaCrops(aspect: number): QaCrop[];
  /** Forces the band scene for the current state now (QA `setTimeOfDay`, `?band=`). */
  syncBand(sim: SimState): void;
}

/** Sun and moon rig directions (the directional lights are re-aimed, not toggled). */
const SUN_DAY: V3 = [340, 330, 210];
const MOON_NIGHT: V3 = [-260, 300, -180];
const FOG_DAY = "#cfe3f1";
const FOG_NIGHT = "#1a2240";

/** The tram is a handful of merged meshes in tram-local coordinates (x side, y up, z forward), one node per material, each moved with the tram's pose. */
interface TramGroup { id: string; mesh: MeshData; mat: ReturnType<typeof pbr>; cast: boolean }
export const TRAM_GROUP_IDS = ["tram-livery", "tram-cream", "tram-teal", "tram-dark", "tram-brass", "tram-wood", "tram-glass", "tram-glow", "tram-tail"] as const;

function tramGroups(): TramGroup[] {
  const g = Object.fromEntries(TRAM_GROUP_IDS.map((id) => [id, new MeshData()])) as Record<(typeof TRAM_GROUP_IDS)[number], MeshData>;
  boxAt(g["tram-dark"], [0, 0.55, 0], [3.1, 0.5, 9.9]);
  boxAt(g["tram-livery"], [0, 1.2, 0], [3.0, 0.95, 9.4]);
  boxAt(g["tram-cream"], [0, 1.62, 0], [3.04, 0.14, 9.44]);
  boxAt(g["tram-wood"], [0, 1.7, 0], [2.8, 0.08, 9.0]);
  roofDome(g["tram-cream"], 3.82, 3.3, 0.9, 9.7);
  boxAt(g["tram-teal"], [0, 3.78, 0], [3.3, 0.14, 9.8]);
  for (const z of [4.62, -4.62]) boxAt(g["tram-livery"], [0, 2.1, z], [3.0, 0.8, 0.12]);
  boxAt(g["tram-glass"], [0, 2.95, 4.69], [2.2, 1.0, 0.05]);
  boxAt(g["tram-glow"], [0, 3.55, 4.7], [1.3, 0.24, 0.06]);
  for (const x of [-0.9, 0.9]) { boxAt(g["tram-glow"], [x, 1.35, 4.72], [0.36, 0.36, 0.2]); boxAt(g["tram-tail"], [x, 1.35, -4.72], [0.26, 0.26, 0.12]); }
  for (const z of [5.0, -5.0]) boxAt(g["tram-brass"], [0, 0.75, z], [2.7, 0.2, 0.28]);
  boxAt(g["tram-dark"], [0, 4.35, -1.2], [0.16, 0.7, 0.16]); boxAt(g["tram-dark"], [0, 4.72, -1.2], [1.5, 0.07, 0.07]); boxAt(g["tram-dark"], [0, 4.55, -0.8], [0.08, 0.08, 0.9]);
  for (const x of [-1.45, 1.45]) for (const z of [-3.9, -1.95, 0, 1.95, 3.9]) boxAt(g["tram-cream"], [x, 2.7, z], [0.12, 2.1, 0.16]);
  for (const z of [-3.2, 3.2]) for (const x of [-1.2, 1.2]) cylinderX(g["tram-dark"], [x, 0.38, z], 0.43, 0.26);
  SEATS.forEach((s2) => boxAt(g["tram-wood"], [s2[0] * 1.12, 1.82, s2[2]], [0.82, 0.12, 0.62]));
  const cream = "#efe3c8", livery = "#b9452f", teal = "#2f6f86", dark = "#2b2e35", brass = "#c9a24b";
  return [
    { id: "tram-livery", mesh: g["tram-livery"], mat: pbr(livery, 0.45, 0.05), cast: true },
    { id: "tram-cream", mesh: g["tram-cream"], mat: pbr(cream, 0.5), cast: true },
    { id: "tram-teal", mesh: g["tram-teal"], mat: pbr(teal, 0.4, 0.1), cast: false },
    { id: "tram-dark", mesh: g["tram-dark"], mat: pbr(dark, 0.45, 0.55), cast: true },
    { id: "tram-brass", mesh: g["tram-brass"], mat: pbr(brass, 0.3, 0.8), cast: false },
    { id: "tram-wood", mesh: g["tram-wood"], mat: pbr("#7a5236", 0.78), cast: false },
    { id: "tram-glass", mesh: g["tram-glass"], mat: pbr("#7fb4c8", 0.08, 0.1), cast: false },
    { id: "tram-glow", mesh: g["tram-glow"], mat: glow("#fff0c2", 3), cast: false },
    { id: "tram-tail", mesh: g["tram-tail"], mat: glow("#ff4a3a", 2), cast: false }
  ];
}

/** Instances of one primitive along every route leg: positions at `step` spacing, yawed to the local forward direction. */
function alongRoute(data: SimData, step: number, offset: number, lift: number): { position: V3; rotation: V3 }[] {
  const out: { position: V3; rotation: V3 }[] = [];
  for (const leg of data.route.legs) {
    const pts = leg.position, n = pts.length / 3;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const dx = pts[i * 3]! - pts[(i - 1) * 3]!, dy = pts[i * 3 + 1]! - pts[(i - 1) * 3 + 1]!, dz = pts[i * 3 + 2]! - pts[(i - 1) * 3 + 2]!;
      const len = Math.hypot(dx, dz) || 1;
      acc += Math.hypot(dx, dy, dz);
      if (acc >= step) {
        acc = 0;
        const fx = dx / len, fz = dz / len;
        const yaw = Math.atan2(fx, fz), pitch = -Math.atan2(dy, len);
        out.push({ position: [pts[i * 3]! + fz * offset, pts[i * 3 + 1]! + lift, pts[i * 3 + 2]! - fx * offset], rotation: [pitch, yaw, 0] });
      }
    }
  }
  return out;
}

/** Debug switches for look-dev captures: `?fx=ao,nofog,nobloom,nograde,novignette,nohdri,skyflat`. */
const QUERY = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const FX = new Set((QUERY.get("fx") ?? "").split(","));
/** GU47 LT-01: `?band=A..E` pins a band; `?look=original` keeps today's day / night look. */
export const PINNED_BAND = parseBand(QUERY.get("band"));
export const LOOK = parseLook(QUERY.get("look"));

/** GU47 LT-07: the tilt-shift band (screen rows in focus) and the grain; DOF and god rays drop below High in the engine's post tiers. */
export const TILT_SHIFT = { bandCenter: 0.56, bandWidth: 0.34, angleDeg: 0 } as const;
export const GRAIN = 0.03;

/** GU47 bands A-E (bands.ts): band HDRI, PCSS key, hemisphere bounce, the practical pool (C/D/E), fog and the band's post. */
function addBandLighting(b: Scene, data: SimData, band: BandId): void {
  const row = BANDS[band];
  b.add(FX.has("nohdri") ? environments.neutral({ intensity: row.envIntensity }) : environments.hdri({ name: "env-sky", texture: BAND_HDRI[row.hdri], intensity: row.envIntensity, rotation: envRotationRad(row), background: false }));
  b.add(lights.directional({ name: row.key.name, position: keyPosition(row), target: [0, 0, 0], intensity: row.key.intensity, color: row.key.color, shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 190, blend: 0.12, filter: "pcss" } }));
  b.add(lights.hemisphere({ name: BOUNCE_ID, skyColor: row.hemisphere.sky, groundColor: row.hemisphere.ground, intensity: row.hemisphere.intensity }).runtime({ id: BOUNCE_ID }));
  if (row.practicals.platformPoint > 0) {
    const at = platformLightPositions(data, 0);
    PLATFORM_LIGHT_IDS.forEach((id, i) => b.add(lights.point({ name: id, position: at[i]!, intensity: row.practicals.platformPoint, distance: PLATFORM_LIGHT_RANGE, decay: 2, color: PLATFORM_LIGHT_COLOR, shadow: false }).runtime({ id })));
    const s0 = sampleRoute(data.route, 0, 0), pose = headlampPose(s0, dockForward(data, 0, 0));
    // The art direction allows one shadowed light (the key, lesson R22), so the headlamp spot is unshadowed (LT-02 partial).
    b.add(lights.spot({ name: HEADLAMP_ID, position: pose.position, target: pose.target, angle: 0.42, penumbra: 0.55, distance: 70, decay: 2, intensity: row.practicals.headlamp, color: HEADLAMP_COLOR, shadow: false }).runtime({ id: HEADLAMP_ID }));
  }
  // GU47 LT-08: six station box probes, captured once (inert until the runtime installs the probe face renderer: handoff E-B)
  if (!FX.has("noprobes")) for (const p of stationProbes(data)) b.add(probes.reflection({ name: p.name, position: p.position, box: p.box, resolution: STATION_PROBE_RESOLUTION, update: "once", blendDistance: 2 }));
  if (!FX.has("nofog")) b.add(effects.fog({ name: "haze", color: row.fog.color, density: row.fog.density }));
  // GU47 LT-03: screen-space contact shadows from the key (riders, benches, tram skirts); the engine skips them on Low.
  if (!FX.has("nocontact")) b.add(effects.contactShadows({ length: 0.35, thickness: 0.06, intensity: 0.9, lights: "shadowed" }));
  // GU47 LT-07: GTAO default-on in the band look (`?fx=noao` drops it); the engine drops it on the Low tier.
  if (!FX.has("noao")) b.add(effects.ambientOcclusion({ name: "ao" }));
  if (!FX.has("nobloom")) b.add(effects.bloom({ name: "bloom", intensity: row.bloom.intensity, threshold: row.bloom.threshold }));
  // GU47 LT-07: E-C white balance (temperature / tint) is the split tone: warm A/B highlights, blue D/E shadows; exposure per band.
  if (!FX.has("nograde")) b.add(effects.colorGrade({ name: "grade", contrast: row.grade.contrast, saturation: row.grade.saturation, exposure: row.exposure, temperature: row.grade.temperature, tint: row.grade.tint }));
  if (!FX.has("novignette")) b.add(effects.vignette({ name: "vignette", intensity: row.vignette, smoothness: 0.7 }));
  if (!FX.has("nograin")) b.add(effects.filmGrain({ name: "grain", intensity: GRAIN }));
  // GU47 LT-07: tilt-shift miniature band (E-C S6 dof-tilt-shift); High only via the post tiers.
  if (!FX.has("nodof")) b.add(effects.depthOfField({ name: "tilt-shift", tiltShift: { ...TILT_SHIFT } }));
  // GU47 LT-06: god rays in band B only (High only in the post tiers); the sun flare in A/B, moved with the camera.
  if (row.godRays && !FX.has("nogodrays")) b.add(effects.volumetricFog({ name: "god-rays", density: 0.12, color: row.key.color, intensity: 0.55, godRayDensity: 0.35 }));
  if (row.flare && !FX.has("noflare")) b.add(lights.lensFlare({ name: "sun-flare", position: keyPosition(row, 3000), intensity: 0.55, runtime: { id: "sun-flare" } }));
}

function buildScene(data: SimData, look: SceneLook, tex: TownTextures | null): Scene {
  const original = look === "day" || look === "night";
  const row = original ? null : BANDS[look];
  const night = look === "night";
  const towns = data.tables.towns;
  const b: Scene = scene()
    .background(row ? row.sky.top : night ? "#0b1230" : "#a9d4ee")
    .camera(camera.perspective({ position: [0, 30, 60], target: [0, 20, 0], fov: 58, near: 0.3, far: 7500 }));

  if (row) addBandLighting(b, data, row.id);
  else {
  /* ---- lighting (?look=original): HDRI IBL, cascaded-shadow sun, moon fill, fog, AO, bloom, grade, vignette ---- */
  // `?fx=nohdri` (look-dev) swaps the sky HDRI for the built-in neutral environment: since 4.5.0 a scene with lights and no
  // environment node gets no implicit fill, so dropping the only environment would darken the frame instead of isolating the HDRI.
  b.add(FX.has("nohdri") ? environments.neutral({ intensity: night ? 0.2 : 0.8 }) : environments.hdri({ name: "env-sky", texture: ASSETS.skyHdr, intensity: night ? 0.2 : 0.8, background: false }));
  if (night) b.add(lights.directional({ name: "moon", position: MOON_NIGHT, target: [0, 0, 0], intensity: 1.7, color: "#9db4ff", shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 190, blend: 0.12 } }));
  else b.add(lights.directional({ name: "sun", position: SUN_DAY, target: [0, 0, 0], intensity: 2.8, color: "#ffe8c0", shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 190, blend: 0.12 } }));
  if (!FX.has("nofog")) b.add(effects.fog({ name: "haze", color: night ? FOG_NIGHT : FOG_DAY, density: night ? 0.00018 : 0.00014 }));
  // AO is off by default: on the hdr-msaa path the engine drops the ssao pass for a missing normals input (audit D-08,
  // engine row owned by E2), so it cost a pass request and drew nothing. `?fx=ao` puts it back for when the engine runs it.
  if (FX.has("ao")) b.add(effects.ambientOcclusion({ name: "ao" }));
  if (!FX.has("nobloom")) b.add(effects.bloom({ name: "bloom", intensity: night ? 0.85 : 0.5, threshold: night ? 0.6 : 0.82 }));
  if (!FX.has("nograde")) b.add(effects.colorGrade({ name: "grade", contrast: night ? 1.1 : 1.08, saturation: night ? 0.95 : 1.12, ...(night ? { exposure: 0.95 } : {}) }));
  if (!FX.has("novignette")) b.add(effects.vignette({ name: "vignette", intensity: night ? 0.34 : 0.22, smoothness: 0.7 }));
  }

  /* ---- sky dome, cloud sea ---- */
  b.add(primitives.sphere({ name: "sky", size: 6400, material: material.custom(skySpec()) }).runtime({ id: "sky" }));
  const Y = -75, R = 3200;
  b.add(geometry.custom(geometry.dynamic({
    positions: f32([-R, Y, -R, R, Y, -R, R, Y, R, -R, Y, R]),
    normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2])
  }), { name: "cloud-sea", material: material.custom(cloudSpec()) }).runtime({ id: "cloud-sea" }));

  /* ---- track: ballast bed, rails, instanced sleepers, trestle pylons, catenary masts ---- */
  const mergeRibbons = (rs: Ribbon[]): Ribbon => {
    const m: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
    for (const r of rs) { const base = m.positions.length / 3; m.positions.push(...r.positions); m.normals.push(...r.normals); m.uvs.push(...r.uvs); m.indices.push(...r.indices.map((v) => v + base)); }
    return m;
  };
  const legPts = data.route.legs.map((l) => l.position);
  b.add(geometry.custom(dyn(mergeRibbons(legPts.map((pts) => ribbon(pts, 1.95, 0.02)))), { name: "track-bed", material: pbr("#8d8171", 0.95), castShadow: false }));
  b.add(geometry.custom(dyn(mergeRibbons(legPts.flatMap((pts) => [ribbon(pts, 0.09, 0.2, -0.72), ribbon(pts, 0.09, 0.2, 0.72)]))), { name: "track-rails", material: pbr("#9aa3ad", 0.28, 0.9), castShadow: false }));
  b.add(primitives.box({ name: "sleepers", size: [3.3, 0.14, 0.42], instances: alongRoute(data, 2.1, 0, 0.12), material: pbr("#5a4533", 0.9), castShadow: false }));
  b.add(primitives.cylinder({ name: "pylons", size: [1.0, 150, 1.0], instances: alongRoute(data, 26, 0, -75.6).map((t) => ({ position: t.position, rotation: [0, t.rotation[1], 0] as V3 })), material: pbr("#8f8780", 0.8), castShadow: false }));
  b.add(primitives.box({ name: "pylon-beams", size: [5.6, 0.7, 1.1], instances: alongRoute(data, 26, 0, -0.6), material: pbr("#5d5750", 0.85), castShadow: false }));
  b.add(primitives.cylinder({ name: "masts", size: [0.26, 7.4, 0.26], instances: alongRoute(data, 42, 2.9, 3.6).map((t) => ({ position: t.position, rotation: [0, 0, 0] as V3 })), material: pbr("#3d4047", 0.5, 0.5), castShadow: false }));
  b.add(primitives.box({ name: "mast-arms", size: [2.9, 0.12, 0.12], instances: alongRoute(data, 42, 1.5, 7.0).map((t) => ({ position: t.position, rotation: [0, t.rotation[1], 0] as V3 })), material: pbr("#3d4047", 0.5, 0.5), castShadow: false }));

  /* ---- towns: island, platform, canopy, lamps, houses, trees, rocks, landmark ---- */
  const flowerAt: { position: V3; scale: number }[] = [], flowerColors: string[] = [];
  const bushAt: { position: V3; scale: number }[] = [], bushColors: string[] = [];
  const puffs: { position: V3; scale: number }[] = [];
  const FLOWERS = ["#f26b8a", "#ffd166", "#f4f1de", "#c77dff", "#ff9f1c"];
  type Inst = { position: V3; rotation?: V3; scale?: number };
  const FACADE_TINTS = ["#f7e3d6", "#f7edd2", "#f0d79e", "#d9e8d8"];
  const ROOF_TINTS = ["#b4523d", "#9a4a3a", "#5f6f86"];
  const facadeMesh = FACADE_TINTS.map(() => new MeshData());
  const roofMesh = ROOF_TINTS.map(() => new MeshData());
  /* GU47 LT-09: the Drowned Observatory's roofs carry snow in the band look (one merged mesh, +1 draw; the roof draws keep their count) */
  const snowRoofMesh = new MeshData();
  const roofOf = (town: number, ri: number): MeshData => (row && town === SNOW_TOWN ? snowRoofMesh : roofMesh[ri]!);
  const stoneMesh = new MeshData(), cobbleMesh = new MeshData(), clockMesh = new MeshData();
  const trunkAt: Inst[] = [], canopyAt: Inst[] = [], pineAt: Inst[] = [], stoneAt: Inst[] = [];
  const canopyColors: string[] = [], pineColors: string[] = [];
  const planterAt: Inst[] = [], awningAt: Inst[] = [], awningColors: string[] = [], stallAt: Inst[] = [];
  const folkBodyAt: Inst[] = [], folkHeadAt: Inst[] = [], folkColors: string[] = [];
  const islandTop: Inst[] = [], islandRim: Inst[] = [], islandRock: Inst[] = [], islandColors: string[] = [];
  const platformAt: Inst[] = [], platformEdgeAt: Inst[] = [], canopyBoxAt: Inst[] = [], canopyBoxColors: string[] = [], canopyTrimAt: Inst[] = [];
  const postAt: Inst[] = [], lampAt: Inst[] = [], benchAt: Inst[] = [], signAt: Inst[] = [];
  const signalAt: Inst[] = [], signalHeadAt: Inst[] = [], signalColors: string[] = [], festoonAt: Inst[] = [];
  towns.forEach((town, i) => {
    const s0 = sampleRoute(data.route, i, 0);
    const s1 = sampleRoute(data.route, i, 6);
    let fx = s1.x - s0.x, fz = s1.z - s0.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const sx = fz, sz = -fx;
    const rand = lehmer(7000 + i * 31);
    const grass = mixHex(town.color, "#6a9c4a", 0.62);
    const top = s0.y - 0.3;
    islandTop.push({ position: [s0.x, top - 3, s0.z] }); islandColors.push(grass);
    islandRim.push({ position: [s0.x, top - 7.5, s0.z] });
    islandRock.push({ position: [s0.x, top - 62, s0.z], rotation: [Math.PI, 0.3, 0] });
    for (let k = 0; k < 34; k++) {
      const a = rand() * Math.PI * 2, r = 54 + rand() * 40;
      puffs.push({ position: [s0.x + Math.cos(a) * r, top - 30 - rand() * 55, s0.z + Math.sin(a) * r], scale: 11 + rand() * 20 });
    }
    const yaw = Math.atan2(fx, fz);
    platformAt.push({ position: [s0.x + sx * 4.6, s0.y + 0.3, s0.z + sz * 4.6], rotation: [0, yaw, 0] });
    platformEdgeAt.push({ position: [s0.x + sx * 2.55, s0.y + 0.78, s0.z + sz * 2.55], rotation: [0, yaw, 0] });
    canopyBoxAt.push({ position: [s0.x + sx * 5.6, s0.y + 4.9, s0.z + sz * 5.6], rotation: [0, yaw, 0] }); canopyBoxColors.push(mixHex(town.color, "#b4523d", 0.55));
    canopyTrimAt.push({ position: [s0.x + sx * 5.6, s0.y + 4.68, s0.z + sz * 5.6], rotation: [0, yaw, 0] });
    for (const k of [-9, 9]) {
      if (MESHY_ENABLED) b.add(model(MESHY_ASSETS.lamp, { name: `lamp-post-${i}-${k}`, position: [s0.x + sx * 6.8 + fx * k, s0.y + 2.85, s0.z + sz * 6.8 + fz * k], scaleMode: "world", scale: 2.5, castShadow: false, receiveShadow: false }).runtime({ id: `lamp-post-${i}-${k}` }));
      else postAt.push({ position: [s0.x + sx * 6.8 + fx * k, s0.y + 2.7, s0.z + sz * 6.8 + fz * k] });
      lampAt.push({ position: [s0.x + sx * 6.8 + fx * k, s0.y + 4.35, s0.z + sz * 6.8 + fz * k] });
    }
    for (const k of [-6, 0, 6]) benchAt.push({ position: [s0.x + sx * 6.4 + fx * k, s0.y + 1.15, s0.z + sz * 6.4 + fz * k], rotation: [0, yaw, 0] });
    signAt.push({ position: [s0.x + sx * 8.1 + fx * 12, s0.y + 2.6, s0.z + sz * 8.1 + fz * 12], rotation: [0, yaw + Math.PI / 2, 0] });
    if (row) {
      // GU47 LT-12: SDF nameboard on the station sign (track-facing side), one text3D node per town
      b.add(text3D(town.name.toUpperCase(), { name: `nameboard-${i}`, size: 0.34, depth: 0.03, backend: "sdf", position: [s0.x + sx * 7.98 + fx * 13.4, s0.y + 2.5, s0.z + sz * 7.98 + fz * 13.4], rotation: [0, yaw - Math.PI / 2, 0], material: pbr("#f3e6cc", 0.5), castShadow: false }));
      // LT-12 signal posts: one red (stop) behind the platform, one green (clear) at the departure end
      for (const [k, al] of [[0, -16], [1, 20]] as const) {
        signalAt.push({ position: [s0.x - sx * 2.9 + fx * al, s0.y + 2.2, s0.z - sz * 2.9 + fz * al] });
        signalHeadAt.push({ position: [s0.x - sx * 2.9 + fx * al, s0.y + 4.5, s0.z - sz * 2.9 + fz * al] }); signalColors.push(k === 0 ? "#ff3a2a" : "#3aff7a");
      }
      // LT-12 festoon bulbs along the canopy's track edge (lit in C/D/E)
      for (let q = 0; q < 13; q++) festoonAt.push({ position: [s0.x + sx * 3.1 + fx * (-12 + q * 2), s0.y + 4.45 - 0.25 * Math.sin((q / 12) * Math.PI), s0.z + sz * 3.1 + fz * (-12 + q * 2)] });
    }

    const at = (lateral: number, along: number): [number, number] => [s0.x + sx * lateral + fx * along, s0.z + sz * lateral + fz * along];
    groundDisc(cobbleMesh, s0.x, top + 0.04, s0.z, 62, 6);
    const buildRow = (side: 1 | -1, innerLat: number, alongMin: number, alongMax: number, minSt: number, maxSt: number, skip?: (along: number, w: number) => boolean): void => {
      let along = alongMin;
      while (along < alongMax) {
        const w = 8.4 + rand() * 5.2, d = 9.5 + rand() * 2.8, st = minSt + Math.floor(rand() * (maxSt - minSt + 1));
        const h = st * 3.2, mid = along + w / 2;
        along += w + 0.3;
        if (skip?.(mid, w)) continue;
        const lat = side * (innerLat + d / 2);
        const [bx, bz] = at(lat, mid);
        const yawB = Math.atan2(-side * sx, -side * sz);
        const ti = Math.floor(rand() * FACADE_TINTS.length), ri = Math.floor(rand() * ROOF_TINTS.length);
        const rise = 3 + rand() * 1.8;
        wallBox(facadeMesh[ti]!, bx, top, bz, w, h, d, yawB, { gables: true, uOffset: rand() }, rise);
        gableRoof(roofOf(i, ri), bx, top + h, bz, w, d, rise, yawB);
        if (rand() < 0.5) { const [cxm, czm] = at(lat - side * d * 0.2, mid + w * 0.25); wallBox(stoneMesh, cxm, top + h + rise * 0.3, czm, 1.2, rise + 2.4, 1.2, yawB, { uTile: 3, vTile: 3 }); }
      }
    };
    const TOWER_ALONG = 18;
    buildRow(1, 21, -56, 56, 3, 5, MESHY_ENABLED ? (m) => m > -37 && m < -1 : undefined);
    buildRow(-1, 17, -56, 56, 3, 5, (m, w) => Math.abs(m - TOWER_ALONG) < w / 2 + 6 || (MESHY_ENABLED && m > -51 && m < -13));
    if (MESHY_ENABLED) {
      /* Meshy townhouses with real facade relief in the reserved windows; front (+Z) faces the track */
      const SC = 6.84, HALF_H = 0.951 * SC;
      const house = (k: number, side: 1 | -1, along: number, depth: number): void => {
        const [hx, hz] = at(side * (side > 0 ? 21 : 17) + side * depth / 2, along);
        b.add(model(HOUSES[k % 3]!, { name: `house-${i}-${side > 0 ? "a" : "b"}-${k}`, position: [hx, top + HALF_H, hz], rotation: [0, Math.atan2(-side * sx, -side * sz), 0], scaleMode: "world", scale: SC, castShadow: false, receiveShadow: true }).runtime({ id: `house-${i}-${side > 0 ? "a" : "b"}-${k}` }));
      };
      house(2, 1, -30, 8.9); house(0, 1, -18, 7.1); house(1, 1, -8, 10.7);
      house((i + 0) % 3, -1, -44, 7.1); house((i + 1) % 3, -1, -32, 10.7); house((i + 2) % 3, -1, -20, 8.9);
    }
    buildRow(1, 46, -34, 34, 4, 6);
    buildRow(-1, 46, -34, 34, 4, 6);
    if (MESHY_ENABLED) {
      const [tx, tz] = at(-21, TOWER_ALONG), ts = 14.7;
      b.add(model(MESHY_ASSETS.clockTower, { name: `clock-tower-${i}`, position: [tx, top + 0.951 * ts, tz], rotation: [0, Math.atan2(sx, sz), 0], scaleMode: "world", scale: ts, castShadow: true, receiveShadow: true }).runtime({ id: `clock-tower-${i}` }));
    } else {
      const [tx, tz] = at(-21, TOWER_ALONG);
      const th = 27, tw = 7;
      wallBox(stoneMesh, tx, top, tz, tw, th, tw, yaw, { uTile: 4, vTile: 4 });
      pyramidRoof(roofOf(i, 0), tx, top + th, tz, tw, 9.5, yaw, 0.9);
      for (const [lx, lz, nx, nz] of [[0, tw / 2 + 0.05, 0, 1], [0, -tw / 2 - 0.05, 0, -1], [tw / 2 + 0.05, 0, 1, 0], [-tw / 2 - 0.05, 0, -1, 0]] as const) {
        const cy = top + th - 5.2, half = 2.3;
        const px = (u: number, v: number): V3 => {
          const lxp = lx + (nz !== 0 ? u : 0), lzp = lz + (nx !== 0 ? u : 0);
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          return [tx + lxp * c + lzp * sn, cy + v, tz - lxp * sn + lzp * c];
        };
        clockMesh.face([px(-half, -half), px(half, -half), px(half, half), px(-half, half)], [nx * Math.cos(yaw) + nz * Math.sin(yaw), 0, -nx * Math.sin(yaw) + nz * Math.cos(yaw)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
    {
      const trackY = sampleRoute(data.route, i, 52).y;
      const [ax, az] = at(0, 52);
      stoneArch(stoneMesh, ax, top, az, yaw, 4.8, 2.0, 3.4, Math.max(5, trackY - top + 5));
    }
    for (let k = 0; k < 11; k++) {
      const along = -50 + k * 9.6 + rand() * 2, side = k % 2 ? 1 : -1;
      const [px, pz] = at(side * (side > 0 ? 17 : 14.4), along);
      planterAt.push({ position: [px, top + 0.45, pz], rotation: [0, yaw, 0] });
      bushAt.push({ position: [px, top + 1.15, pz], scale: 0.7 + rand() * 0.35 }); bushColors.push(mixHex("#4f8a3c", town.color, 0.2));
      for (let f = 0; f < 3; f++) { flowerAt.push({ position: [px + (rand() - 0.5) * 1.8, top + 1.4 + rand() * 0.3, pz + (rand() - 0.5) * 0.6], scale: 0.5 + rand() * 0.4 }); flowerColors.push(FLOWERS[Math.floor(rand() * FLOWERS.length)]!); }
    }
    for (let k = 0; k < 4; k++) {
      const [qx, qz] = at(-10 - (k % 2) * 4.2, -34 + k * 12);
      stallAt.push({ position: [qx, top + 0.7, qz], rotation: [0, yaw, 0] });
      awningAt.push({ position: [qx, top + 2.75, qz], rotation: [0, yaw, 0.12] });
      awningColors.push([town.color, "#e4572e", "#f2c14e", "#4fa5b8"][k]!);
    }
    let folkModels = 0;
    for (let k = 0; k < 14; k++) {
      const onPlatform = rand() < 0.7;
      const [fxp, fzp] = onPlatform ? at(4.4 + (rand() - 0.5) * 2.4, (rand() - 0.5) * 24) : at(-4 - rand() * 8, (rand() - 0.5) * 60);
      const base = rand() < 0.7 ? s0.y + 0.75 : top + 0.04;
      if (MESHY_ENABLED && onPlatform && folkModels < 5) {
        const kinds = [MESHY_ASSETS.paxEasy, MESHY_ASSETS.paxSightseer, MESHY_ASSETS.paxRushed, MESHY_ASSETS.paxSleeper] as const;
        const fs = 0.85 + rand() * 0.2;
        b.add(model(kinds[(folkModels + i) % 4]!, { name: `folk-${i}-${folkModels}`, position: [fxp, s0.y + 0.75 + 0.951 * fs, fzp], rotation: [0, rand() * Math.PI * 2, 0], scaleMode: "world", scale: fs, castShadow: false, receiveShadow: false }).runtime({ id: `folk-${i}-${folkModels}` }));
        folkModels++;
        continue;
      }
      folkBodyAt.push({ position: [fxp, base + 0.8, fzp] });
      folkHeadAt.push({ position: [fxp, base + 1.75, fzp] });
      folkColors.push(["#e4572e", "#2f8f9d", "#f2c14e", "#7a8cff", "#6bc5a0", "#d96aa7", "#8c6b4f"][Math.floor(rand() * 7)]!);
    }
    const placed: [number, number][] = [];
    const free = (l: number, a: number, r: number): boolean => Math.hypot(l, a) < 74 && placed.every(([pl, pa]) => Math.hypot(pl - l, pa - a) > r);
    const landmark = [ASSETS.windmill, ASSETS.windmill, ASSETS.tower, ASSETS.tower, ASSETS.tower, ASSETS.windmill][i]!;
    const lx = 36 * (i % 2 ? 1 : -1), la = -26 + (i % 3) * 18;
    placed.push([lx, la]);
    const lh = landmark === ASSETS.windmill ? 30 : 34;
    b.add(model(landmark, { name: `landmark-${i}`, position: [s0.x + sx * lx + fx * la, top + lh / 2 - 0.4, s0.z + sz * lx + fz * la], rotation: [0, yaw + i, 0], targetMaxDimension: lh, castShadow: false, receiveShadow: true }).runtime({ id: `landmark-${i}` }));
    if (MESHY_ENABLED) {
      for (const [k, al] of [[0, 12.5], [1, -12.5]] as const) {
        const [cx, cz] = at(4.6, al);
        b.add(model(MESHY_ASSETS.crates, { name: `crates-${i}-${k}`, position: [cx, s0.y + 0.75 + 0.85, cz], rotation: [0, yaw + k * 1.9, 0], scaleMode: "world", scale: 0.9, castShadow: false, receiveShadow: true }).runtime({ id: `crates-${i}-${k}` }));
      }
      if (i % 3 === 1) {
        const [lx2, lz2] = at(-40, 44), ls = 20;
        b.add(model(MESHY_ASSETS.lighthouse, { name: `lighthouse-${i}`, position: [lx2, top + 0.951 * ls, lz2], rotation: [0, yaw + i, 0], scaleMode: "world", scale: ls, castShadow: true, receiveShadow: true }).runtime({ id: `lighthouse-${i}` }));
      }
    }
    for (let k = 0; k < 22; k++) {
      for (let tries = 0; tries < 10; tries++) {
        const ang = rand() * Math.PI * 2, rr = 63 + rand() * 8;
        const lateral = Math.cos(ang) * rr, along = Math.sin(ang) * rr;
        if (!free(lateral, along, 5.5)) continue;
        placed.push([lateral, along]);
        const [tx, tz] = at(lateral, along);
        const sc = 0.8 + rand() * 0.7;
        trunkAt.push({ position: [tx, top + 1.6 * sc, tz], scale: sc });
        if (rand() < 0.5) { canopyAt.push({ position: [tx, top + 5.0 * sc, tz], scale: sc }); canopyColors.push(mixHex("#4f9a46", town.color, 0.18 + rand() * 0.2)); }
        else { pineAt.push({ position: [tx, top + 4.9 * sc, tz], scale: sc }); pineColors.push(mixHex("#2f6e4a", town.color, 0.1 + rand() * 0.15)); }
        break;
      }
    }
    for (let k = 0; k < 7; k++) {
      const a = rand() * Math.PI * 2, r = 63 + rand() * 9;
      stoneAt.push({ position: [s0.x + Math.cos(a) * r, top + 0.4, s0.z + Math.sin(a) * r], rotation: [rand(), rand() * 6.28, rand()], scale: 1.4 + rand() * 2.6 });
    }
    for (let k = 0; k < 44; k++) {
      const lateral = (rand() - 0.5) * 120, along = (rand() - 0.5) * 120;
      if (Math.abs(lateral) < 9 || !free(lateral, along, 3.2)) continue;
      const wx = s0.x + sx * lateral + fx * along, wz = s0.z + sz * lateral + fz * along;
      if (rand() < 0.55) { flowerAt.push({ position: [wx, top + 0.45, wz], scale: 0.7 + rand() * 0.6 }); flowerColors.push(FLOWERS[Math.floor(rand() * FLOWERS.length)]!); }
      else { bushAt.push({ position: [wx, top + 0.9, wz], scale: 1.1 + rand() * 1.2 }); bushColors.push(mixHex("#4f8a3c", town.color, 0.25)); }
    }
  });
  b.add(primitives.cylinder({ name: "islands", size: [150, 6, 150], instances: islandTop, instanceColors: islandColors, material: pbr("#ffffff", 0.95), castShadow: false }));
  b.add(primitives.cylinder({ name: "island-rims", size: [146, 3.2, 146], instances: islandRim, material: pbr("#b59a78", 1), castShadow: false }));
  b.add(primitives.cone({ name: "island-rocks", size: [136, 108, 136], params: { radialSegments: 11 }, instances: islandRock, material: material.pbr({ color: "#d3c9c0", roughness: 1, emissive: "#8c8793", emissiveIntensity: row ? 0.08 : 0.55 }), castShadow: false }));
  b.add(primitives.box({ name: "platforms", size: [4.4, 0.9, 30], instances: platformAt, material: pbr("#d9cfba", 0.82), castShadow: false }).runtime({ id: "platforms" }));
  b.add(primitives.box({ name: "platform-edges", size: [0.3, 0.06, 30], instances: platformEdgeAt, material: pbr("#e9c24a", 0.6), castShadow: false }));
  b.add(primitives.box({ name: "canopies", size: [5.4, 0.3, 24], instances: canopyBoxAt, instanceColors: canopyBoxColors, material: pbr("#ffffff", 0.6), castShadow: true }));
  b.add(primitives.box({ name: "canopy-trims", size: [5.6, 0.14, 24.4], instances: canopyTrimAt, material: pbr("#f4ead2", 0.6), castShadow: false }));
  if (postAt.length > 0) b.add(primitives.cylinder({ name: "posts", size: [0.3, 4.4, 0.3], instances: postAt, material: pbr("#3b3d46", 0.5, 0.5), castShadow: false }));
  b.add(primitives.sphere({ name: "lamps", size: 0.7, instances: lampAt, material: glow("#ffd89a", row ? row.practicals.lampEmissive : night ? 3 : 0.5), castShadow: false }).runtime({ id: "lamps" }));
  b.add(primitives.box({ name: "benches", size: [0.6, 0.12, 2.0], instances: benchAt, material: pbr("#8a5a35", 0.8), castShadow: false }));
  if (row) {
    // GU47 LT-12: merged catenary wire over every leg (1 draw), signal posts and heads (2), festoon bulbs (1)
    b.add(geometry.custom(dyn(mergeRibbons(legPts.map((pts) => ribbon(pts, 0.035, 6.9)))), { name: "catenary", material: pbr("#2b2e35", 0.5, 0.6), castShadow: false }));
    b.add(primitives.cylinder({ name: "signal-posts", size: [0.18, 4.4, 0.18], instances: signalAt, material: pbr("#3d4047", 0.5, 0.5), castShadow: false }));
    b.add(instances.sphere({ name: "signal-heads", size: 0.32, transforms: signalHeadAt, colors: signalColors, instanceColorTarget: "both", material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2.2 }), castShadow: false }));
    b.add(primitives.sphere({ name: "festoon-bulbs", size: 0.16, instances: festoonAt, material: glow("#ffc77a", row.practicals.platformPoint > 0 ? 2.4 : 0.3), castShadow: false }));
  }
  b.add(primitives.box({ name: "signboards", size: [0.2, 1.0, 3.2], instances: signAt, material: pbr("#23423a", 0.6), castShadow: false }));
  b.add(primitives.sphere({ name: "flowers", size: 0.9, instances: flowerAt, instanceColors: flowerColors, material: pbr("#ffffff", 0.7), castShadow: false }));
  b.add(primitives.sphere({ name: "bushes", size: [2.4, 1.8, 2.4], instances: bushAt, instanceColors: bushColors, material: pbr("#ffffff", 0.95), castShadow: false }));
  b.add(primitives.sphere({ name: "cloud-puffs", size: [2.2, 1.0, 2.2], instances: puffs, material: material.pbr({ color: "#fbfaf6", roughness: 1, emissive: "#e8ecf6", emissiveIntensity: row ? 0.06 : 0.28 }), castShadow: false }));
  const asRef = (t: unknown): never => t as never;
  const facadeMat = (tint: string, glowK: number) => tex
    ? material.pbr({ color: tint, roughness: 0.86, texture: asRef(tex.facade), emissiveMap: tex.facadeEmissive as never, emissive: "#ffffff", emissiveIntensity: glowK, textureAnisotropy: 8, ...(row ? { practical: true } : {}) })
    : pbr(tint, 0.86);
  const texMat = (t: unknown, color: string, roughness: number) => t ? material.pbr({ color, roughness, texture: asRef(t), textureAnisotropy: 8 }) : pbr(color, roughness);
  FACADE_TINTS.forEach((tint, k) => b.add(geometry.custom(facadeMesh[k]!.toGeometry(), { name: `facades-${k}`, material: facadeMat(tint, row ? row.practicals.windowEmissive : night ? 1.8 : 0), castShadow: true, receiveShadow: true }).runtime({ id: `facades-${k}` })));
  ROOF_TINTS.forEach((tint, k) => b.add(geometry.custom(roofMesh[k]!.toGeometry(), { name: `roofs-${k}`, material: texMat(tex?.roof, tint, 0.72), castShadow: true, receiveShadow: true })));
  if (row) b.add(geometry.custom(snowRoofMesh.toGeometry(), { name: "roofs-snow", material: material.pbr({ color: SNOW_ROOF_COLOR, roughness: 0.62 }), castShadow: true, receiveShadow: true }));
  b.add(geometry.custom(stoneMesh.toGeometry(), { name: "stonework", material: texMat(tex?.stone, "#ffffff", 0.9), castShadow: true, receiveShadow: true }));
  b.add(geometry.custom(cobbleMesh.toGeometry(), { name: "plaza-cobbles", material: texMat(tex?.cobble, "#ffffff", 0.92), castShadow: false, receiveShadow: true }));
  if (!MESHY_ENABLED) b.add(geometry.custom(clockMesh.toGeometry(), { name: "clock-faces", material: texMat(tex?.clock, "#ffffff", 0.55), castShadow: false, receiveShadow: false }));
  b.add(primitives.box({ name: "planters", size: [2.4, 0.9, 1.0], instances: planterAt, material: pbr("#cdbfa4", 0.9), castShadow: false }));
  b.add(primitives.box({ name: "stalls", size: [3, 1.4, 1.6], instances: stallAt, material: pbr("#8a5a35", 0.8), castShadow: false }));
  b.add(primitives.box({ name: "awnings", size: [3.6, 0.14, 2.4], instances: awningAt, instanceColors: awningColors, material: pbr("#ffffff", 0.7), castShadow: false }));
  b.add(primitives.capsule({ name: "folk-bodies", size: [0.7, 1.5, 0.7], instances: folkBodyAt, instanceColors: folkColors, material: pbr("#ffffff", 0.75), castShadow: false }));
  b.add(primitives.sphere({ name: "folk-heads", size: 0.55, instances: folkHeadAt, material: pbr("#f0c9a4", 0.6), castShadow: false }));
  b.add(primitives.cylinder({ name: "tree-trunks", size: [0.7, 3.2, 0.7], instances: trunkAt, material: pbr("#6b4a32", 0.95), castShadow: false }));
  b.add(primitives.sphere({ name: "tree-canopies", size: [5.2, 4.6, 5.2], instances: canopyAt, instanceColors: canopyColors, material: pbr("#ffffff", 0.9), castShadow: true }));
  b.add(primitives.cone({ name: "tree-pines", size: [3.6, 6.6, 3.6], params: { radialSegments: 8 }, instances: pineAt, instanceColors: pineColors, material: pbr("#ffffff", 0.9), castShadow: true }));
  b.add(primitives.sphere({ name: "stones", size: [3.2, 2.2, 2.8], instances: stoneAt, material: pbr("#8a867f", 0.95), castShadow: false }));

  /* ---- tram and passengers (flat top-level nodes, moved from the runtime) ---- */
  if (MESHY_ENABLED) b.add(model(MESHY_ASSETS.tram, { name: "tram-body", scaleMode: "world", scale: [...TRAM.scale] as [number, number, number], castShadow: true, receiveShadow: true }).runtime({ id: "tram-body" }));
  else for (const gp of tramGroups()) b.add(geometry.custom(gp.mesh.toGeometry(), { name: gp.id, material: gp.mat, castShadow: gp.cast, receiveShadow: false }).runtime({ id: gp.id }));
  SEATS.forEach((_, i) => {
    if (MESHY_ENABLED) {
      for (const t of TEMPERAMENTS) b.add(model(PAX_ASSET[t], { name: `pax-${i}-${t}`, scaleMode: "world", scale: PAX_SCALE, castShadow: false, receiveShadow: false }).runtime({ id: `pax-${i}-${t}` }));
      return;
    }
    b.add(primitives.sphere({ name: `head-${i}`, size: 0.42, material: pbr("#f0c9a4", 0.6), castShadow: false }).runtime({ id: `head-${i}` }));
    for (const t of TEMPERAMENTS) b.add(primitives.capsule({ name: `pax-${i}-${t}`, size: [0.55, 1.1, 0.55], material: pbr(TEMPERAMENT_COLORS[t], 0.65), castShadow: false }).runtime({ id: `pax-${i}-${t}` }));
  });

  /* ---- GU47 LT-13 signature: earned sky lanterns, one instanced emissive node (parked under the cloud sea until released) ---- */
  if (row) b.add(primitives.capsule({ name: "sky-lanterns", size: [0.9, 1.2, 0.9], instances: [{ position: [0, -400, 0], scale: 0.001 }], material: material.emissive({ color: "#ffb35c", emissive: "#ffc77a", emissiveIntensity: row.lanternGlow }), castShadow: false }).runtime({ id: "sky-lanterns" }));

  /* ---- weather points (rain / snow around the camera) and ambient motes ---- */
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(WEATHER_COUNT * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(3)) },
      fade: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(0)) }
    }
  }), { name: "weather", material: material.custom(pointsSpec([0.8, 0.88, 1])) }).runtime({ id: "weather" }));
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(RAIN_COUNT * 12).fill(0)),
    indices: Uint32Array.from(Array.from({ length: RAIN_COUNT }, (_, i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3]).flat()),
    attributes: { fade: { itemSize: 1, data: f32(new Array(RAIN_COUNT * 4).fill(0)) } }
  }), { name: "rain", material: material.custom(rainSpec([0.75, 0.85, 1])) }).runtime({ id: "rain" }));
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(MOTE_COUNT * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array(MOTE_COUNT).fill(3)) },
      fade: { itemSize: 1, data: f32(new Array(MOTE_COUNT).fill(0)) }
    }
  }), { name: "motes", material: material.custom(pointsSpec([1, 0.93, 0.7])) }).runtime({ id: "motes" }));

  return b;
}

export function buildWorld(data: SimData, look: "bands" | "original" = LOOK): World {
  const tex = makeTownTextures();
  const cache = new Map<SceneLook, Scene>();
  const sceneFor = (l: SceneLook): Scene => { let sc = cache.get(l); if (!sc) cache.set(l, sc = buildScene(data, l, tex)); return sc; };
  const first: SceneLook = look === "original" ? "day" : bandFor(0, "day", PINNED_BAND);
  const nightLook: SceneLook = look === "original" ? "night" : bandFor(0, "night", PINNED_BAND);
  return {
    get scene() { return sceneFor(first); },
    get nightScene() { return sceneFor(nightLook); },
    look,
    sceneFor,
    bind: (app, d, startNight = false) => bindRuntime(app, d, sceneFor, look, startNight)
  };
}

type Handle = ReturnType<AuraApp["nodes"]["require"]>;

/**
 * Unit forward direction of the track at `distance` on `leg`. Docked (`distance < 1`) it is the platform heading from
 * `sampleRoute(leg, 0..4)`, so the docked pose never depends on the last rendered frame (D-11: a results frame reached by
 * fast-forwarding used a stale heading and showed the tram tilted into the canopy).
 */
export function dockForward(data: SimData, leg: number, distance: number): V3 {
  const len = data.route.legs[leg]!.length;
  const d0 = distance < 1 ? 0 : distance;
  const a = sampleRoute(data.route, leg, d0), c = sampleRoute(data.route, leg, Math.min(d0 + 4, len));
  const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

function bindRuntime(app: AuraApp, data: SimData, sceneFor: (look: SceneLook) => Scene, look: "bands" | "original", startNight: boolean): WorldRuntime {
  const maybeCamera = app.camera;
  if (!maybeCamera) throw new Error("last-train-port: the app exposes no camera controller");
  const cam: NonNullable<typeof maybeCamera> = maybeCamera;
  const chase = cameras.chase();
  const handles = new Map<string, Handle>();
  const seenIds = new Set<string>();
  const node = (id: string): Handle => { seenIds.add(id); let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const towns = data.tables.towns;
  const rand = lehmer(4242);
  const seeds = Array.from({ length: WEATHER_COUNT }, () => [rand(), rand(), rand(), rand()] as const);
  const moteSeeds = Array.from({ length: MOTE_COUNT }, () => [rand(), rand(), rand(), rand()] as const);
  const wpos = new Float32Array(WEATHER_COUNT * 3), wfade = new Float32Array(WEATHER_COUNT), wsize = new Float32Array(WEATHER_COUNT);
  const mpos = new Float32Array(MOTE_COUNT * 3), mfade = new Float32Array(MOTE_COUNT), msize = new Float32Array(MOTE_COUNT);
  const sky = node("sky"), clouds = node("cloud-sea"), weather = node("weather"), motes = node("motes"), rain = node("rain");
  const rpos = new Float32Array(RAIN_COUNT * 12), rfade = new Float32Array(RAIN_COUNT * 4);
  let shownNight = startNight ? 1 : 0;
  let nightLevel = startNight ? 1 : 0;
  let lastSeconds = 0;
  let dockBlend = -1;
  const rig = { eye: [0, 0, 0] as V3, target: [0, 0, 0] as V3 };
  let weatherWasOn = true;
  /* GU47 LT-01: the band on screen; swaps only while docked (or when forced by ?band= / the QA hook) */
  let shownBand: BandId | null = look === "bands" ? bandFor(0, startNight ? "night" : "day", PINNED_BAND) : null;
  let enrouteSwaps = 0;
  let forceSwap = false;
  let lightTown = -1;
  const prefetched = new Set<BandId>();
  /* GU47 LT-13 / LT-14: the lantern sky and the effect pack (registered once per app; spawned from read-only sim events) */
  const lanternSky = new LanternSky();
  let lastLanternCount = -1;
  const fx = app.effects;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (look === "bands" && fx) { fx.runtime = "on"; registerLamplightVfx(fx, reduced); }
  let prevVfx: VfxSimView | null = null;
  let pantographAt = -1;
  const riders = new RiderMotion();
  let flashUntil = -1, flashOn = false;
  let platformsWet = false;
  /* GU47 LT-16: arrival rail, departure trackside, finale crane (band look only; ?shots=0 turns them off) */
  const shots = new ShotDirector(look === "bands" && QUERY.get("shots") !== "0");
  /* QA crops (E-I capture): the camera pose on screen, the pool town and the headlamp of the last update */
  let shownPose: QaCameraPose = { eye: [0, 30, 60], target: [0, 20, 0], fov: 58 };
  let cropTown = 0;
  let cropHeadlamp: V3 = [0, 0, 0];
  /** Builds the next town's band scene off the frame (a timer) so the docked swap does not build it. */
  const prefetch = (band: BandId): void => {
    if (prefetched.has(band)) return;
    prefetched.add(band);
    setTimeout(() => { sceneFor(band); }, 0);
  };

  function update(sim: SimState, seconds: number, options: { readonly orbit?: boolean; readonly reducedMotion?: boolean } = {}): void {
    const dt = Math.max(0, Math.min(0.1, seconds - lastSeconds));
    lastSeconds = seconds;
    /* day / night (?look=original) or bands A-E: the lighting rig differs per scene, so the app swaps scenes (node ids are identical); the sky and clouds blend smoothly */
    let night: number;
    if (shownBand === null) {
      night = sim.timeOfDay === "night" ? 1 : 0;
      if (night !== shownNight) {
        shownNight = night;
        app.setScene(sceneFor(night ? "night" : "day"));
        handles.clear();
      }
    } else {
      const wanted = bandFor(sim.leg, sim.timeOfDay, PINNED_BAND);
      if (shouldSwapBand(shownBand, wanted, sim.phase, forceSwap)) {
        if (sim.phase === "enroute") enrouteSwaps++;
        shownBand = wanted;
        app.setScene(sceneFor(wanted));
        handles.clear();
        lightTown = -1;
        platformsWet = false; lastLanternCount = -1; flashOn = false;
      }
      forceSwap = false;
      if (!PINNED_BAND) prefetch(bandFor((sim.leg + 1) % towns.length, sim.timeOfDay));
      night = shownBand === "E" ? 1 : 0;
    }
    nightLevel = dt > 0 ? nightLevel + (night - nightLevel) * Math.min(1, dt * 2.4) : night;
    if (Math.abs(nightLevel - night) < 0.01) nightLevel = night;

    const here = sampleRoute(data.route, sim.leg, sim.distance);
    /* GU47 LT-15: rider counter-lean with a 0.25 s lag and a 1.5 cm tram bob (band look only; reduced motion 30%) */
    const rm = options.reducedMotion === true;
    const riderLean = shownBand !== null ? riders.step(sim.roll, dt, rm) : 0;
    const bob = shownBand !== null ? tramBob(seconds, sim.speed, rm) : 0;
    const f = dockForward(data, sim.leg, sim.distance);
    const rot = tramRotation(f, -sim.roll);
    const euler = matrixToEulerZYX(rot);
    if (MESHY_ENABLED) {
      const body = node("tram-body"), bodyEuler = matrixToEulerZYX(multiplyMat3(rot, axisRotation("y", TRAM.yaw))), c = applyMat3(rot, [0, TRAM.centerY, 0]);
      body.setPosition(here.x + c[0], here.y + 0.2 + bob + c[1], here.z + c[2]); body.setRotation(bodyEuler[0], bodyEuler[1], bodyEuler[2]);
    } else for (const id of TRAM_GROUP_IDS) { const h = node(id); h.setPosition(here.x, here.y + 0.2, here.z); h.setRotation(euler[0], euler[1], euler[2]); }
    const seated = new Set(sim.trips.map((t) => t.seat));
    SEATS.forEach((seat, i) => {
      const trip = sim.trips.find((t) => t.seat === i);
      if (MESHY_ENABLED) {
        const standing = applyMat3(rot, [seat[0], TRAM.floorY + PAX_SCALE * 0.951, seat[2]]);
        const paxEuler = matrixToEulerZYX(multiplyMat3(multiplyMat3(rot, axisRotation("z", riderLean)), axisRotation("y", seat[0] < 0 ? Math.PI / 2 : -Math.PI / 2)));
        for (const t of TEMPERAMENTS) {
          const h = node(`pax-${i}-${t}`);
          const on = seated.has(i) && trip?.temperament === t;
          h.setVisible(on);
          if (on) { h.setPosition(here.x + standing[0], here.y + standing[1] + 0.2 + bob, here.z + standing[2]); h.setRotation(paxEuler[0], paxEuler[1], paxEuler[2]); }
        }
        return;
      }
      const w = applyMat3(rot, seat);
      const hw = applyMat3(rot, [seat[0], seat[1] + 0.95, seat[2]]);
      const head = node(`head-${i}`);
      head.setVisible(seated.has(i));
      if (seated.has(i)) head.setPosition(here.x + hw[0], here.y + hw[1] + 0.2, here.z + hw[2]);
      for (const t of TEMPERAMENTS) {
        const h = node(`pax-${i}-${t}`);
        const on = seated.has(i) && trip?.temperament === t;
        h.setVisible(on);
        if (on) { h.setPosition(here.x + w[0], here.y + w[1] + 0.2, here.z + w[2]); h.setRotation(euler[0], euler[1], euler[2]); }
      }
    });

    /* sky blends the two towns' palettes along the leg (smoothstep 0.22..0.82 of the leg, as the original) */
    const a = towns[sim.leg]!, nb = towns[(sim.leg + 1) % towns.length]!;
    const k = smooth(0.22, 0.82, sim.distance / data.route.legs[sim.leg]!.length);
    let top: [number, number, number], hor: [number, number, number], dir: readonly number[];
    if (shownBand === null) {
      top = mixRgb(hexToRgb(a.sky[0]), hexToRgb(nb.sky[0]), k); hor = mixRgb(hexToRgb(a.sky[1]), hexToRgb(nb.sky[1]), k);
      dir = night ? MOON_NIGHT : SUN_DAY;
    } else {
      // GU47 LT-05: the band's sky pushed toward each town's own hue, blended along the leg
      const sa = townSky(shownBand, sim.leg), sb = townSky(shownBand, (sim.leg + 1) % towns.length);
      top = mixRgb(rgb(sa.top), rgb(sb.top), k); hor = mixRgb(rgb(sa.horizon), rgb(sb.horizon), k);
      dir = skySunDirection(BANDS[shownBand]);
    }
    const dl = Math.hypot(...dir);
    if (FX.has("skyflat")) { sky.setUniform?.("skyTop", [0.26, 0.66, 0.93]); sky.setUniform?.("skyHorizon", [0.26, 0.66, 0.93]); } else { sky.setUniform?.("skyTop", top); sky.setUniform?.("skyHorizon", hor); } sky.setUniform?.("nightMix", nightLevel);
    sky.setUniform?.("sunDir", [dir[0] / dl, dir[1] / dl, dir[2] / dl]);
    sky.setPosition(here.x, here.y, here.z);
    if (shownBand !== null) {
      // GU47 LT-05: band afterglow and stars on the dome; the cloud sea lit toward the sun with lilac valleys
      const br = BANDS[shownBand];
      sky.setUniform?.("afterglow", br.sky.afterglow); sky.setUniform?.("starMix", br.sky.stars);
      clouds.setUniform?.("sunDir", [dir[0]! / dl, dir[1]! / dl, dir[2]! / dl]);
      clouds.setUniform?.("cloudLit", rgb(br.clouds.lit)); clouds.setUniform?.("cloudValley", rgb(br.clouds.valley));
      clouds.setUniform?.("sunGain", br.clouds.sunGain); clouds.setUniform?.("bandMix", 1);
    }
    clouds.setUniform?.("cloudPhase", seconds); clouds.setUniform?.("nightMix", nightLevel);
    clouds.setUniform?.("hazeColor", mixRgb(hor, [0.05, 0.07, 0.16], nightLevel));
    clouds.setPosition(here.x, 0, here.z);

    /* chase camera, widening with speed */
    const still = options.reducedMotion === true;
    const orbit = options.orbit && !still ? seconds * 0.16 : 0;
    const dockTarget = sim.phase === "enroute" ? 0 : 1;
    dockBlend = dockBlend < 0 || dt === 0 ? dockTarget : dockBlend + (dockTarget - dockBlend) * Math.min(1, dt * 2.2);
    const kd = dockBlend * dockBlend * (3 - 2 * dockBlend);
    const sh = Math.hypot(f[0], f[2]) || 1, sd: V3 = [f[2] / sh, 0, -f[0] / sh];
    const chaseEye: V3 = [here.x - f[0] * 17, here.y + 6.2 - f[1] * 17, here.z - f[2] * 17];
    const chaseTarget: V3 = [here.x + f[0] * 12, here.y + 2.2 + f[1] * 12, here.z + f[2] * 12];
    const sway = still ? 0 : Math.sin(seconds * 0.45) * 0.5;
    const dockEye: V3 = [here.x - sd[0] * (13 + sway) - f[0] * 8, here.y + 7.4 + (still ? 0 : Math.sin(seconds * 0.31) * 0.3), here.z - sd[2] * (13 + sway) - f[2] * 8];
    const dockAim: V3 = [here.x + f[0] * 4 + sd[0] * 3, here.y + 2.6, here.z + f[2] * 4 + sd[2] * 3];
    const mix3 = (a: V3, c: V3, t: number): V3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    const eye: V3 = options.orbit
      ? [here.x + Math.sin(orbit + 0.6) * 22, here.y + 7.5 + (still ? 0 : Math.sin(seconds * 0.23) * 1.2), here.z + Math.cos(orbit + 0.6) * 22]
      : mix3(chaseEye, dockEye, kd);
    const target: V3 = options.orbit ? [here.x, here.y + 2.6, here.z] : mix3(chaseTarget, dockAim, kd);
    rig.eye = eye; rig.target = target;

    /* GU47 LT-13: release lanterns on clean arrivals, drop one on a catch; one setInstances when the set or its motion changes */
    if (shownBand !== null) {
      const plat = sampleRoute(data.route, sim.leg, 0);
      lanternSky.observe({ leg: sim.leg, phase: sim.phase, catches: sim.attempt.catches }, seconds, [plat.x, plat.y, plat.z], sim.attempt.streak);
      const ts = lanternSky.transforms(seconds, still);
      if (ts.length > 0 || lastLanternCount !== 0) {
        node("sky-lanterns").setInstances(ts.length > 0 ? ts : [{ position: [0, -400, 0], scale: 0.001 }]);
        lastLanternCount = ts.length;
      }
      /* GU47 LT-14: effect pack from read-only sim events (pantograph sparks at most every 0.25 s) */
      const view: VfxSimView = { phase: sim.phase, fares: sim.attempt.fares, catches: sim.attempt.catches, speed: sim.speed, roll: sim.roll, leg: sim.leg };
      if (fx && prevVfx) {
        for (const kind of vfxEvents(prevVfx, view, weatherOf(data, sim))) {
          if (kind === "lamplight-pantograph") { if (seconds - pantographAt < 0.25) continue; pantographAt = seconds; }
          const up = kind === "lamplight-pantograph" ? 4.7 : kind === "lamplight-gutter" ? 30 : 0.9;
          fx.spawn(kind, [here.x, here.y + up, here.z]);
        }
      }
      prevVfx = view;
    }

    /* GU47 LT-14: storm lightning in band C: the hemisphere bounce flares for <= 200 ms (peak 0.3 under reduced motion / flash) */
    if (shownBand === "C") {
      const fl = lightningFlash(rm);
      if (!flashOn && storminess(seconds) && seconds > flashUntil + 1) { flashOn = true; flashUntil = seconds + fl.seconds; node(BOUNCE_ID).setLight?.({ intensity: BANDS.C.hemisphere.intensity * (1 + fl.peak * 6) }); }
      else if (flashOn && seconds >= flashUntil) { flashOn = false; node(BOUNCE_ID).setLight?.({ intensity: BANDS.C.hemisphere.intensity }); }
    }

    /* GU47 LT-02: move the practical pool (platform points to the nearest town, the headlamp with the tram); LT-06 flare follows the sky sun */
    if (shownBand !== null) {
      const row = BANDS[shownBand];
      if (row.practicals.platformPoint > 0) {
        const t = poolTown(data, sim.leg, sim.distance, sim.phase);
        if (t !== lightTown) {
          lightTown = t;
          const at = platformLightPositions(data, t);
          PLATFORM_LIGHT_IDS.forEach((id, i) => moveLight(node(id), at[i]!));
        }
        const pose = headlampPose(here, f);
        moveLight(node(HEADLAMP_ID), pose.position, pose.direction);
      }
      if (row.flare && !FX.has("noflare")) {
        const sd = skySunDirection(row);
        node("sun-flare").setPosition(eye[0] + sd[0] * 3000, eye[1] + sd[1] * 3000, eye[2] + sd[2] * 3000);
      }
    }
    let wantEye = eye, wantLook = target, fovTarget = 56 - 4 * kd + Math.min(8, Math.abs(sim.speed) * 0.35);
    let shakeOffset: V3 | undefined, cut = false;
    if (shownBand !== null && !options.orbit) {
      shots.observe({ phase: sim.phase, complete: sim.attempt.status === "complete", catches: sim.attempt.catches }, seconds);
      const shot = shots.frame({ eye, target, fov: fovTarget }, { here: [here.x, here.y, here.z], forward: f, side: sd }, seconds, still);
      wantEye = shot.eye; wantLook = shot.target; fovTarget = shot.fov; shakeOffset = shot.shakeOffset; cut = shot.cut;
      if (cut) chase.reset();
    }
    const pose = chase.step({ wantEye, wantLook, fovTarget, ...(shakeOffset ? { shakeOffset } : {}) }, dt);
    cam.setPose({ position: pose.eye, target: pose.look, up: [0, 1, 0], fov: pose.fov }, { cut });
    shownPose = { eye: [...pose.eye], target: [...pose.look], fov: pose.fov };
    cropTown = poolTown(data, sim.leg, sim.distance, sim.phase);
    cropHeadlamp = headlampPose(here, f).position;

    /* rain (Monsoon Exchange, index 4) or snow (Drowned Observatory, index 3) near those towns */
    const weatherNow = weatherOf(data, sim);
    const raining = weatherNow === "rain", snowing = weatherNow === "snow";
    /* GU47 LT-09: wet platforms in the Monsoon rain (roughness 0.82 -> 0.25), setMaterial only when the weather changes */
    if (shownBand !== null && raining !== platformsWet) { platformsWet = raining; node("platforms").setMaterial(material.pbr({ color: raining ? "#b9b2a2" : "#d9cfba", roughness: raining ? 0.25 : 0.82 })); }
    const amount = raining || snowing ? 1 : 0;
    // In clear weather the rain and snow buffers are uploaded once with every fade at 0, then left alone (E-04).
    const weatherOn = amount > 0;
    const uploadWeather = weatherOn || weatherWasOn;
    weatherWasOn = weatherOn;
    if (uploadWeather) {
      for (let i = 0; i < WEATHER_COUNT; i++) {
        const [sx, sy, sz, ss] = seeds[i]!;
        const y = ((sy * 60 - seconds * 4) % 60 + 60) % 60 - 20;
        wpos[i * 3] = eye[0] + (sx - 0.5) * 80 + Math.sin(seconds * 0.8 + ss * 6) * 2;
        wpos[i * 3 + 1] = eye[1] + y; wpos[i * 3 + 2] = eye[2] + (sz - 0.5) * 80;
        wfade[i] = snowing ? 0.95 : 0; wsize[i] = 7 + ss * 5;
      }
      weather.updateAttribute?.("position", { array: wpos, offset: 0 });
      weather.updateAttribute?.("fade", { array: wfade, offset: 0 });
      weather.updateAttribute?.("size", { array: wsize, offset: 0 });
      for (let i = 0; i < RAIN_COUNT; i++) {
        const [sx, sy, sz, ss] = seeds[i % WEATHER_COUNT]!;
        const x = eye[0] + (sx - 0.5) * 70 + (raining ? seconds * 1.5 : 0) % 1, z = eye[2] + (sz - 0.5) * 70;
        const y = eye[1] + ((sy * 50 - seconds * 46) % 50 + 50) % 50 - 20, len = 1.4 + ss * 1.4;
        const dx = eye[0] - x, dz = eye[2] - z, l = Math.hypot(dx, dz) || 1, rx = (-dz / l) * 0.04, rz = (dx / l) * 0.04;
        const o = i * 12;
        rpos[o] = x - rx; rpos[o + 1] = y; rpos[o + 2] = z - rz;
        rpos[o + 3] = x + rx; rpos[o + 4] = y; rpos[o + 5] = z + rz;
        rpos[o + 6] = x + rx; rpos[o + 7] = y + len; rpos[o + 8] = z + rz;
        rpos[o + 9] = x - rx; rpos[o + 10] = y + len; rpos[o + 11] = z - rz;
        const a = raining ? 0.5 : 0;
        rfade[i * 4] = 0; rfade[i * 4 + 1] = 0; rfade[i * 4 + 2] = a; rfade[i * 4 + 3] = a;
      }
      rain.updateAttribute?.("position", { array: rpos, offset: 0 });
      rain.updateAttribute?.("fade", { array: rfade, offset: 0 });
    }
    for (let i = 0; i < MOTE_COUNT; i++) {
      const [sx, sy, sz, ss] = moteSeeds[i]!;
      mpos[i * 3] = eye[0] + (sx - 0.5) * 70 + Math.sin(seconds * 0.4 + ss * 9) * 3;
      mpos[i * 3 + 1] = eye[1] - 6 + sy * 26 + Math.sin(seconds * 0.6 + ss * 7) * 1.5;
      mpos[i * 3 + 2] = eye[2] + (sz - 0.5) * 70 + Math.cos(seconds * 0.35 + ss * 5) * 3;
      mfade[i] = amount ? 0 : 0.55 + 0.4 * Math.sin(seconds * 1.7 + ss * 20);
      msize[i] = 2.4 + ss * 2 + nightLevel * 2;
    }
    motes.updateAttribute?.("position", { array: mpos, offset: 0 });
    motes.updateAttribute?.("fade", { array: mfade, offset: 0 });
    motes.updateAttribute?.("size", { array: msize, offset: 0 });
  }

  return {
    update,
    get nodeCount() { return seenIds.size; },
    camera: rig,
    get band() { return shownBand; },
    get enrouteSwaps() { return enrouteSwaps; },
    get shots() { return { active: shots.active, started: { ...shots.started } }; },
    skipShot() { shots.skip(); },
    qaCrops(aspect: number) { return lamplightCrops(shownPose, aspect, platformLightPositions(data, cropTown), cropHeadlamp); },
    get lanterns() { return { aloft: lanternSky.aloft(), released: lanternSky.released }; },
    syncBand(sim: SimState) { forceSwap = true; update(sim, lastSeconds); }
  };
}

/** E-B `setLight` moves a light node; `setPosition` is the fallback where the extension is not attached. */
function moveLight(h: Handle, position: V3, direction?: V3): void {
  if (h.setLight) h.setLight(direction ? { position, direction } : { position });
  else h.setPosition(position[0], position[1], position[2]);
}
