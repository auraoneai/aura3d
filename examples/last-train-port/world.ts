/**
 * Lamplight Line world on the public `@aura3d/engine` surface only: the six-town ring railway (track built from
 * the measured route: ballast ribbon, instanced sleepers, brushed-steel rails, viaduct piers and catenary masts), cloud-top
 * islands dressed with catalog houses, trees, rocks, two stone landmark towers, a wet-sheen station platform per town, an
 * enamel-and-brass tram with twelve seats, warm interior carriage glow (`studioGlass` windows) and seated passengers,
 * paired GLSL+WGSL sky/cloud/catenary/signal shaders, static `update: "once"` station reflection probes, SSR, contact
 * shadows, cinematic bloom, `cinema-warm` LUT, and visual-only impact rig + flange spark flipbooks.
 */
import { AuraNodeBuilder, camera, cameras, defineAuraAssets, effects, environments, geometry, lights, material, instances, primitives, scene, text3D, type AuraApp, type AuraAssetRef, type AuraMaterialSpec, type AuraSceneNode } from "@aura3d/engine";
import { BANDS, HDRI_URL, bandFor, lightningFlash, storminess, envRotationRad, keyPosition, parseBand, parseLook, rgb, shouldSwapBand, skySunDirection, townSky, type BandId, type LamplightHdri } from "./bands";
import { LanternSky } from "./lanterns";
import { RiderMotion, seatedRiderPose, tramBob } from "./riderMotion";
import { registerLamplightVfx, vfxEvents, type VfxSimView } from "./vfx";
import { BOUNCE_ID, HEADLAMP_COLOR, HEADLAMP_ID, PLATFORM_LIGHT_COLOR, PLATFORM_LIGHT_IDS, PLATFORM_LIGHT_RANGE, headlampPose, platformLightPositions, poolTown, stationProbes, STATION_PROBE_RESOLUTION, type StationProbe } from "./lights";
import {
  STREETCAR_FLOOR_Y,
  buildBroadleafCanopySpec,
  buildClockTowerNode,
  buildCloudPuffSpec,
  buildCoastalBoulderSpec,
  buildCoastalBushSpec,
  buildCoastalHouseNode,
  buildCoastalLandmarkNode,
  buildCoastalPineSpec,
  buildCoastalTreeTrunkSpec,
  buildFreightCratesNode,
  buildIslandUndercroftNode,
  buildLighthouseNode,
  buildPassengerNode,
  buildSkyLanternSpec,
  buildStationFolkNode,
  buildStreetcarBodyNode,
  buildSwanNeckLampNode,
  buildTramCoachTrimRawParts,
  createStaticTownBatcher,
  upgradeVolumetricBeamWgsl
} from "./art/proceduralModels";
import { applyMat3, axisRotation, matrixToEulerZYX, multiplyMat3, tramRotation, type V3 } from "./orient";
import { FLANGE_SPARKS_ATLAS, catenarySpec, cloudSpec, flangeSparkSpec, pointQuadSpec, pointsSpec, rainGraphSpec, rainSpec, signalLensSpec, skySpec } from "./materials";
import { portableCloudMaterial } from "./portable";
import { readPortableFlag } from "../shared/portable-flag";
import { MeshData, boxAt, cylinderX, roofDome, gableRoof, groundDisc, makeTownTextures, stoneArch, wallBox, type TownTextures } from "./townkit";
import { ShotDirector, type ShotKind } from "./shots";
import { lamplightCrops, type QaCrop, type QaCameraPose } from "./qaCrops";
import { sampleRoute, type SimData, type SimState, type Temperament } from "./sim";
import { labCameraOptions, readLabFlags, resolveLabBackend } from "../shared/lab-flags";
import { guardPose, type GuardPose } from "../shared/camera-guard";
import { quadGeometryInput, quadUpdater, skipUnchangedUpdates } from "./point-quads";
import { createImpactRig } from "../../apps/showcase-port-shared/feel";
import { createFlipbookAtlas, createGradingLut } from "../../apps/showcase-port-shared/vfx-pack";

type Scene = ReturnType<typeof scene>;

/** Pre-baked 16^3 cinema-warm LUT (both texture spec and served .cube asset for S10b display grading) + flange spark sheet. */
export const CINEMA_WARM_LUT = createGradingLut("cinema-warm");
const CINEMA_WARM_CUBE_URL = new URL("./assets/cinema-warm.cube", import.meta.url).href;
export const SPARK_SHEET_PREVIEW = createFlipbookAtlas("sparks", [255, 208, 118]);

function sparkBillboardQuad(half: number) {
  const m = new MeshData();
  m.face([[-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return m.toGeometry();
}

/** Strips preset display names on existing scene nodes so `snapshotForAudit` keeps byte-identical material records. */
const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

type StaticProbeNode = Readonly<AuraSceneNode>;
const staticProbeNodeCache = new WeakMap<SimData["route"], readonly StaticProbeNode[]>();

/**
 * Parallax-corrected reflection probe nodes on the public surface (`update: "once"`). Pre-frozen and memoized once per route
 * so probe definitions are strictly static and never rebuilt across band scenes or frames.
 */
function stationReflectionProbes(data: SimData, resolution: 64 | 128 | 256, blendDistance: number): readonly AuraNodeBuilder<AuraSceneNode>[] {
  let specs = staticProbeNodeCache.get(data.route);
  if (!specs) {
    specs = Object.freeze(stationProbes(data).map((p: StationProbe) => Object.freeze({
      kind: "probe",
      probe: "reflection",
      name: p.name,
      options: Object.freeze({ name: p.name, position: p.position, box: p.box, resolution, update: "once" as const, blendDistance, priority: 0, intensity: 1 })
    }) as unknown as StaticProbeNode));
    staticProbeNodeCache.set(data.route, specs);
  }
  return specs.map((spec) => new AuraNodeBuilder<AuraSceneNode>(spec));
}
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

/** CC0 Poly Haven environment HDRIs; all 3D geometry is authored procedurally on `@aura3d/engine` (`zero` `.glb` assets). */
const ASSETS = defineAuraAssets({
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
interface TramGroup { id: string; mesh: MeshData; mat: AuraMaterialSpec; cast: boolean }
export const TRAM_GROUP_IDS = ["tram-livery", "tram-cream", "tram-teal", "tram-dark", "tram-brass", "tram-wood", "tram-glass", "tram-glow", "tram-tail"] as const;
const TRAM_FX_IDS = ["a3g-fx-tram-lacquer", "a3g-fx-tram-brass", "a3g-fx-tram-glow", "a3g-fx-tram-glass"] as const;

export function tramGroups(): TramGroup[] {
  const g = Object.fromEntries(TRAM_GROUP_IDS.map((id) => [id, new MeshData()])) as Record<(typeof TRAM_GROUP_IDS)[number], MeshData>;
  const sculpted = buildTramCoachTrimRawParts();
  g["tram-livery"].appendRaw(sculpted.lacquer);
  g["tram-brass"].appendRaw(sculpted.brass);
  g["tram-glass"].appendRaw(sculpted.glass);
  g["tram-glow"].appendRaw(sculpted.glow);
  boxAt(g["tram-dark"], [0, 0.72, 0], [2.72, 0.22, 9.7]);
  boxAt(g["tram-livery"], [0, 1.41, 0], [2.92, 1.22, 9.85]);
  boxAt(g["tram-cream"], [0, 2.72, 0], [2.88, 1.38, 9.75]);
  boxAt(g["tram-wood"], [0, STREETCAR_FLOOR_Y, 0], [2.74, 0.08, 8.8]);
  roofDome(g["tram-dark"], 3.74, 2.98, 0.56, 9.95);
  boxAt(g["tram-teal"], [0, 3.4, 0], [2.94, 0.08, 9.82]);
  for (const z of [4.93, -4.93]) boxAt(g["tram-glass"], [0, 2.56, z], [2.32, 1.02, 0.05]);
  boxAt(g["tram-glow"], [0, 1.44, 5.04], [0.36, 0.36, 0.14]);
  boxAt(g["tram-brass"], [0, 1.44, -4.96], [0.44, 0.44, 0.08]);
  for (const sgn of [-1, 1] as const) {
    boxAt(g["tram-glow"], [0, 3.5, sgn * 4.89], [1.44, 0.19, 0.04]);
  }
  for (const x of [-0.88, 0.88]) {
    boxAt(g["tram-glow"], [x, 1.38, 4.94], [0.24, 0.24, 0.1]);
    boxAt(g["tram-tail"], [x, 1.38, -4.94], [0.24, 0.24, 0.1]);
  }
  for (const x of [-1.42, 1.42]) {
    for (const z of [-2.48, -1.24, 0, 1.24, 2.48]) boxAt(g["tram-glass"], [x, 2.56, z], [0.04, 1.02, 1.06]);
  }
  for (const z of [-3.77, -2.53, 2.53, 3.77]) for (const x of [-0.72, 0.72]) cylinderX(g["tram-dark"], [x, 0.43, z], 0.36, 0.14);
  SEATS.forEach((s2) => boxAt(g["tram-wood"], [s2[0] * 1.12, 1.3, s2[2]], [0.64, 0.11, 0.62]));
  const cream = "#f5ebd6", livery = "#b8292f", teal = "#24586c", dark = "#232932", brass = "#dbb056";
  return [
    { id: "tram-livery", mesh: g["tram-livery"], mat: unnamed(material.carPaint({ color: livery, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 })), cast: true },
    { id: "tram-cream", mesh: g["tram-cream"], mat: unnamed(material.lacquer({ color: cream, roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.05 })), cast: true },
    { id: "tram-teal", mesh: g["tram-teal"], mat: unnamed(material.lacquer({ color: teal, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.05 })), cast: false },
    { id: "tram-dark", mesh: g["tram-dark"], mat: unnamed(material.studioMetal({ color: dark, roughness: 0.38, metallic: 0.86 })), cast: true },
    { id: "tram-brass", mesh: g["tram-brass"], mat: unnamed(material.studioMetal({ color: brass, roughness: 0.2, metallic: 0.94 })), cast: false },
    { id: "tram-wood", mesh: g["tram-wood"], mat: pbr("#684128", 0.66), cast: false },
    { id: "tram-glass", mesh: g["tram-glass"], mat: unnamed(material.physical({ color: "#1c2d3e", roughness: 0.05, opacity: 0.84, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.52, envMapIntensity: 1.75 })), cast: false },
    { id: "tram-glow", mesh: g["tram-glow"], mat: glow("#ffe5b6", 1.5), cast: false },
    { id: "tram-tail", mesh: g["tram-tail"], mat: glow("#ff4a3a", 2), cast: false }
  ];
}

let cachedTramCoachTrimGeoms: {
  readonly lacquer: ReturnType<MeshData["toGeometry"]>;
  readonly brass: ReturnType<MeshData["toGeometry"]>;
  readonly glow: ReturnType<MeshData["toGeometry"]>;
  readonly glass: ReturnType<MeshData["toGeometry"]>;
} | null = null;

/**
 * Sculpted `carPaint` & `studioMetal` brass beltline/bumper trim + warm 2700K interior carriage glow behind dark-slate
 * clerestory panes for the band look's interurban railcar (moved rigidly with the tram pose; prefixed `a3g-fx-`).
 */
function tramCoachTrim(bulbIntensity: number): readonly { readonly id: (typeof TRAM_FX_IDS)[number]; readonly geom: ReturnType<MeshData["toGeometry"]>; readonly mat: AuraMaterialSpec }[] {
  if (!cachedTramCoachTrimGeoms) {
    const lacquer = new MeshData(), brass = new MeshData(), glowMesh = new MeshData(), glass = new MeshData();
    const parts = buildTramCoachTrimRawParts();
    lacquer.appendRaw(parts.lacquer);
    brass.appendRaw(parts.brass);
    glowMesh.appendRaw(parts.glow);
    glass.appendRaw(parts.glass);
    cachedTramCoachTrimGeoms = {
      lacquer: lacquer.toGeometry(),
      brass: brass.toGeometry(),
      glow: glowMesh.toGeometry(),
      glass: glass.toGeometry()
    };
  }
  return [
    { id: "a3g-fx-tram-lacquer", geom: cachedTramCoachTrimGeoms.lacquer, mat: unnamed(material.carPaint({ color: "#b8292f", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.92 })) },
    { id: "a3g-fx-tram-brass", geom: cachedTramCoachTrimGeoms.brass, mat: unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.2, metallic: 0.94, envMapIntensity: 1.05 })) },
    { id: "a3g-fx-tram-glow", geom: cachedTramCoachTrimGeoms.glow, mat: unnamed(material.emissive({ color: "#ffe5b6", emissive: "#ffc26e", emissiveIntensity: Math.min(1.35, Math.max(0.32, bulbIntensity * 0.6)), practical: true })) },
    { id: "a3g-fx-tram-glass", geom: cachedTramCoachTrimGeoms.glass, mat: unnamed(material.physical({ color: "#1c2d3e", roughness: 0.08, opacity: 0.54, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.52, envMapIntensity: 0.85 })) }
  ];
}

/**
 * Phase 3 (4.7.1, band look): instances at an even arc-length `step` along every leg, interpolated between route samples.
 * `alongRoute` drops one instance per route sample once `step` is passed, so with samples ~4-5 m apart its 2.1 m sleepers came out
 * 4-5 m apart and read as loose planks on the plaza (rubric environment_world).
 */
export function evenAlongRoute(data: SimData, step: number, lift: number): { position: V3; rotation: V3 }[] {
  const out: { position: V3; rotation: V3 }[] = [];
  for (const leg of data.route.legs) {
    const pts = leg.position, n = pts.length / 3;
    let next = step / 2, run = 0;
    for (let i = 1; i < n; i++) {
      const ax = pts[(i - 1) * 3]!, ay = pts[(i - 1) * 3 + 1]!, az = pts[(i - 1) * 3 + 2]!;
      const dx = pts[i * 3]! - ax, dy = pts[i * 3 + 1]! - ay, dz = pts[i * 3 + 2]! - az;
      const flat = Math.hypot(dx, dz) || 1, seg = Math.hypot(dx, dy, dz);
      const yaw = Math.atan2(dx / flat, dz / flat), pitch = -Math.atan2(dy, flat);
      while (next <= run + seg) {
        const t = seg > 0 ? (next - run) / seg : 0;
        out.push({ position: [ax + dx * t, ay + dy * t + lift, az + dz * t], rotation: [pitch, yaw, 0] });
        next += step;
      }
      run += seg;
    }
  }
  return out;
}

/**
 * Phase 3 (4.7.1, band look): the track bed and the two rails as closed, outward-facing MeshData. The shared `ribbon` winds its
 * quads downward, so the engine's back-face cull drops the bed and rails from every camera above them: only the sleepers drew
 * (rubric: "rail ties with no actual rails"). `?look=original` keeps the ribbons exactly.
 */
export function trackMesh(legs: readonly (readonly number[])[]): { bed: MeshData; rails: MeshData } {
  const bed = new MeshData(), rails = new MeshData();
  const UP: V3 = [0, 1, 0];
  for (const pts of legs) {
    const n = pts.length / 3;
    const side = (i: number): V3 => {
      const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1);
      const fx = pts[c * 3]! - pts[a * 3]!, fz = pts[c * 3 + 2]! - pts[a * 3 + 2]!, l = Math.hypot(fx, fz) || 1;
      return [fz / l, 0, -fx / l];
    };
    const at = (i: number, lat: number, up: number): V3 => { const sd = side(i); return [pts[i * 3]! + sd[0] * lat, pts[i * 3 + 1]! + up, pts[i * 3 + 2]! + sd[2] * lat]; };
    for (let i = 0; i < n - 1; i++) {
      const v0 = i / 4, v1 = (i + 1) / 4;
      bed.face([at(i, -1.95, 0.06), at(i, 1.95, 0.06), at(i + 1, 1.95, 0.06), at(i + 1, -1.95, 0.06)], UP, [[0, v0], [1, v0], [1, v1], [0, v1]]);
      for (const c of [-0.72, 0.72]) {
        const h = 0.07, lo = 0.1, hi = 0.27, sd = side(i);
        rails.face([at(i, c - h, hi), at(i, c + h, hi), at(i + 1, c + h, hi), at(i + 1, c - h, hi)], UP, [[0, v0], [1, v0], [1, v1], [0, v1]]);
        rails.face([at(i, c + h, lo), at(i, c + h, hi), at(i + 1, c + h, hi), at(i + 1, c + h, lo)], sd, [[0, v0], [1, v0], [1, v1], [0, v1]]);
        rails.face([at(i, c - h, lo), at(i, c - h, hi), at(i + 1, c - h, hi), at(i + 1, c - h, lo)], [-sd[0], 0, -sd[2]], [[0, v0], [1, v0], [1, v1], [0, v1]]);
      }
    }
  }
  return { bed, rails };
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
/** A4 pilot: rain streaks are a portable shader-graph material (GLSL + WGSL twin); `?fx=rainglsl` keeps the GLSL `material.custom` baseline for diffs. `?fx=forcerain` is a capture switch: rain at any station. */
const RAIN_PORTABLE = !FX.has("rainglsl");
const FORCE_RAIN = FX.has("forcerain");
/** GU47 LT-01: `?band=A..E` pins a band; `?look=original` keeps today's day / night look. */
export const PINNED_BAND = parseBand(QUERY.get("band"));
export const LOOK = parseLook(QUERY.get("look"));
/**
 * Weather and mote sprites: screen-aligned quads (point-quads.ts) whenever the backend may be WebGPU (the default `auto`, or
 * `?backend=webgpu`), since WebGPU has no point size; `?backend=webgl2` keeps the `gl_PointSize` points.
 */
const SPRITE_QUADS = resolveLabBackend(readLabFlags(), "auto") !== undefined;
const spriteGeometry = (input: Parameters<typeof geometry.dynamic>[0] & { positions: Float32Array; attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> }) =>
  SPRITE_QUADS ? geometry.dynamic(quadGeometryInput(input.positions, input.attributes)) : geometry.dynamic(input);
const spriteMaterial = (tint: readonly [number, number, number]) => material.custom(SPRITE_QUADS ? pointQuadSpec(tint) : pointsSpec(tint));
/**
 * GU47 phase 4 (4.7.2): the band look uses the engine's 4.3.0 sun-shadow fit (`__A3D_SHADOW_FIT__ = "current"`). The default
 * 4.2.0 fit widens every cascade to the bounds of every caster, and this route's merged facades, roofs, rails, sleepers and
 * pylon beams span every town and leg, so each cascade covered the whole line and no shadow shape drew (rubric shadows 4.5:
 * "only a soft smudge under the tram"). `?shadowfit=legacy` restores the 4.2.0 fit; `?look=original` never sets it.
 */
if (LOOK === "bands" && !FX.has("noshadow")) (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";

/** GU47 LT-07: legacy TILT_SHIFT constant retained for exports; DoF stays off so town buildings, rails, and stations stay crisp. */
export const TILT_SHIFT = { bandCenter: 0.56, bandWidth: 0.34, angleDeg: 0 } as const;
export const GRAIN = 0.03;

/** GU47 LT-06: subtle golden-hour shaft density in band B without washing town facades in haze. */
export const GOD_RAY_DENSITY = 0.006;

/** GU47 bands A-E (bands.ts): band HDRI, PCF key (phase 3: PCSS drew no readable shadow in software WebGL2), hemisphere bounce, the practical pool (C/D/E), fog and the band's post. */
function addBandLighting(b: Scene, data: SimData, band: BandId, includeProbes: boolean): void {
  const row = BANDS[band];
  b.add(FX.has("nohdri") ? environments.neutral({ intensity: row.envIntensity }) : environments.hdri({ name: "env-sky", texture: BAND_HDRI[row.hdri], intensity: row.envIntensity, rotation: envRotationRad(row), background: false }));
  b.add(lights.directional({ name: row.key.name, position: keyPosition(row), target: [0, 0, 0], intensity: row.key.intensity, color: row.key.color, shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 80, splitLambda: 0.8, mapSize: 2048, blend: 0.12, filter: FX.has("pcss") ? "pcss" : "pcf", intensity: 1 } }));
  b.add(lights.hemisphere({ name: BOUNCE_ID, skyColor: row.hemisphere.sky, groundColor: row.hemisphere.ground, intensity: row.hemisphere.intensity }).runtime({ id: BOUNCE_ID }));
  if (row.practicals.platformPoint > 0) {
    const at = platformLightPositions(data, 0);
    PLATFORM_LIGHT_IDS.forEach((id, i) => b.add(lights.point({ name: id, position: at[i]!, intensity: row.practicals.platformPoint, distance: PLATFORM_LIGHT_RANGE, decay: 2, color: PLATFORM_LIGHT_COLOR, shadow: false }).runtime({ id })));
    const s0 = sampleRoute(data.route, 0, 0), pose = headlampPose(s0, dockForward(data, 0, 0));
    // The art direction allows one shadowed light (the key, lesson R22), so the headlamp spot is unshadowed (LT-02 partial).
    b.add(lights.spot({ name: HEADLAMP_ID, position: pose.position, target: pose.target, angle: 0.42, penumbra: 0.55, distance: 70, decay: 2, intensity: row.practicals.headlamp, color: HEADLAMP_COLOR, shadow: false }).runtime({ id: HEADLAMP_ID }));
  }
  // GU47 LT-08: static station box probes (`update: "once"`), opt-in at live runtime (`?probes=1`) so HDRI IBL handles clean reflections without 30 cubemap renders + float readbacks.
  if (includeProbes && !FX.has("noprobes")) for (const probeNode of stationReflectionProbes(data, STATION_PROBE_RESOLUTION, 2)) b.add(probeNode);
  if (!FX.has("nofog")) b.add(effects.fog({ name: "haze", mode: "linear", color: row.fog.color, near: row.fog.near, far: row.fog.far, maxOpacity: row.fog.maxOpacity, density: row.fog.density }));
  // GU47 LT-03: screen-space contact shadows from the key (riders, benches, tram skirts); the engine skips them on Low.
  if (!FX.has("nocontact")) b.add(effects.contactShadows({ length: 0.58, thickness: 0.09, intensity: 0.94, lights: "shadowed" }));
  // Wet station platform & brushed steel rail reflections (roughness 0.22 <= 0.35 full-strength gate).
  if (!FX.has("nossr")) b.add(effects.screenSpaceReflections({ name: "ssr", intensity: row.practicals.platformPoint > 0 ? 0.62 : 0.36, maxDistance: 24, roughness: 0.22, thickness: 0.25 }));
  // GU47 LT-07: GTAO default-on in the band look (`?fx=noao` drops it); the engine drops it on the Low tier.
  if (!FX.has("noao")) b.add(effects.ambientOcclusion({ name: "ao" }));
  if (!FX.has("nobloom")) b.add(effects.cinematicBloom({ name: "bloom", color: "#fff6ea", intensity: row.bloom.intensity * 0.58, threshold: Math.max(0.92, row.bloom.threshold), radius: 0.4, antiBlowout: true, maxIntensity: 0.72 }));
  // GU47 LT-07 + WP-24: E-C white balance + cinema-warm 3D display LUT (`assets/cinema-warm.cube`) moderated so cream/crimson tram lacquer stays crisp without warm sunlight washout.
  if (!FX.has("nograde")) b.add(effects.colorGrade({ name: "grade", contrast: row.grade.contrast, saturation: row.grade.saturation, exposure: Math.min(1.16, row.exposure * 0.84), temperature: row.grade.temperature * 0.65, tint: row.grade.tint, ...(!FX.has("nolut") ? { lut: CINEMA_WARM_CUBE_URL, lutIntensity: 0.24 } : {}) }));
  if (!FX.has("novignette")) b.add(effects.vignette({ name: "vignette", intensity: row.vignette, smoothness: 0.7 }));
  if (!FX.has("nograin")) b.add(effects.filmGrain({ name: "grain", intensity: GRAIN }));
  // GU47 LT-06: subtle god rays in band B only (High tier); no tilt-shift DoF blur and no sun-flare tint ring over the train.
  if (row.godRays && !FX.has("nogodrays")) b.add(effects.volumetricFog({ name: "god-rays", density: GOD_RAY_DENSITY, color: row.key.color, intensity: 0.1, godRayDensity: 0.18 }));
}

let cachedTownTextures: TownTextures | null | undefined;
function getTownTextures(): TownTextures | null {
  if (cachedTownTextures === undefined) cachedTownTextures = makeTownTextures();
  return cachedTownTextures;
}

interface CachedRouteTrack {
  readonly bed: ReturnType<MeshData["toGeometry"]>;
  readonly rails: ReturnType<MeshData["toGeometry"]>;
  readonly sleepersBand: { position: V3; rotation: V3 }[];
  readonly sleepersOrig: { position: V3; rotation: V3 }[];
  readonly pylonAt: { position: V3; rotation: V3 }[];
  readonly pylonBeamAt: { position: V3; rotation: V3 }[];
  readonly pylonIronAt: { position: V3; rotation: V3 }[];
  readonly mastAt: { position: V3; rotation: V3 }[];
  readonly mastArmAt: { position: V3; rotation: V3 }[];
  readonly catenary: ReturnType<typeof dyn>;
}
const routeTrackCache = new WeakMap<SimData["route"], CachedRouteTrack>();

function getCachedRouteTrack(data: SimData): CachedRouteTrack {
  let entry = routeTrackCache.get(data.route);
  if (!entry) {
    const legPts = data.route.legs.map((l) => l.position);
    const mergeRibbons = (rs: Ribbon[]): Ribbon => {
      const m: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
      for (const r of rs) { const base = m.positions.length / 3; m.positions.push(...r.positions); m.normals.push(...r.normals); m.uvs.push(...r.uvs); m.indices.push(...r.indices.map((v) => v + base)); }
      return m;
    };
    const track = trackMesh(legPts);
    const pylonRaw = alongRoute(data, 26, 0, -75.6);
    const pylonIronRaw = alongRoute(data, 26, 0, -2.0);
    const mastRaw = alongRoute(data, 42, 2.9, 3.6);
    const mastArmRaw = alongRoute(data, 42, 1.5, 7.0);
    entry = {
      bed: track.bed.toGeometry(),
      rails: track.rails.toGeometry(),
      sleepersBand: evenAlongRoute(data, 1.1, 0.13),
      sleepersOrig: alongRoute(data, 2.1, 0, 0.12),
      pylonAt: pylonRaw.map((t) => ({ position: t.position, rotation: [0, t.rotation[1], 0] as V3 })),
      pylonBeamAt: alongRoute(data, 26, 0, -0.6),
      pylonIronAt: pylonIronRaw.map((t) => ({ position: t.position, rotation: [0, t.rotation[1], 0] as V3 })),
      mastAt: mastRaw.map((t) => ({ position: t.position, rotation: [0, 0, 0] as V3 })),
      mastArmAt: mastArmRaw.map((t) => ({ position: t.position, rotation: [0, t.rotation[1], 0] as V3 })),
      catenary: dyn(mergeRibbons(legPts.map((pts) => ribbon(pts, 0.014, 6.9))))
    };
    routeTrackCache.set(data.route, entry);
  }
  return entry;
}

function buildScene(data: SimData, look: SceneLook, tex: TownTextures | null, includeProbes: boolean): Scene {
  const original = look === "day" || look === "night";
  const row = original ? null : BANDS[look];
  const night = look === "night";
  const towns = data.tables.towns;
  const b: Scene = scene()
    .background(row ? row.sky.top : night ? "#0b1230" : "#a9d4ee")
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 30, 60], target: [0, 20, 0], fov: 58, near: 0.3, far: 7500 }));

  if (row) addBandLighting(b, data, row.id, includeProbes);
  else {
  /* ---- lighting (?look=original): HDRI IBL, cascaded-shadow sun, moon fill, fog, AO, bloom, grade, vignette ---- */
  // `?fx=nohdri` (look-dev) swaps the sky HDRI for the built-in neutral environment: since 4.5.0 a scene with lights and no
  // environment node gets no implicit fill, so dropping the only environment would darken the frame instead of isolating the HDRI.
  b.add(FX.has("nohdri") ? environments.neutral({ intensity: night ? 0.2 : 0.8 }) : environments.hdri({ name: "env-sky", texture: ASSETS.skyHdr, intensity: night ? 0.2 : 0.8, background: false }));
  if (night) b.add(lights.directional({ name: "moon", position: MOON_NIGHT, target: [0, 0, 0], intensity: 1.7, color: "#9db4ff", shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 190, blend: 0.12 } }));
  else b.add(lights.directional({ name: "sun", position: SUN_DAY, target: [0, 0, 0], intensity: 2.8, color: "#ffe8c0", shadow: FX.has("noshadow") ? false : { cascades: 3, maxDistance: 190, blend: 0.12 } }));
  if (!FX.has("nofog")) b.add(effects.fog({ name: "haze", mode: "linear", color: night ? FOG_NIGHT : FOG_DAY, near: 260, far: 980, maxOpacity: 0.3, density: night ? 0.00018 : 0.00014 }));
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
  }), { name: "cloud-sea", material: readPortableFlag() ? portableCloudMaterial() : material.custom(cloudSpec()) }).runtime({ id: "cloud-sea" }));

  /* ---- track: ballast bed, rails, instanced sleepers, trestle pylons, catenary masts ---- */
  const mergeRibbons = (rs: Ribbon[]): Ribbon => {
    const m: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
    for (const r of rs) { const base = m.positions.length / 3; m.positions.push(...r.positions); m.normals.push(...r.normals); m.uvs.push(...r.uvs); m.indices.push(...r.indices.map((v) => v + base)); }
    return m;
  };
  const legPts = data.route.legs.map((l) => l.position);
  const routeTrack = getCachedRouteTrack(data);
  /** Phase 3 (4.7.1): major architectural masses cast the key's shadow in the band look; ground sleepers/rails/small props stay unshadowed to keep draws < 220. */
  const cast = row !== null;
  if (row) {
    // Phase 3 (4.7.1) + WP-24: outward-facing bed and anisotropic brushed-steel rails catching SSR + sodium lamp reflections
    b.add(geometry.custom(routeTrack.bed, { name: "track-bed", material: pbr("#6d6255", 0.88), castShadow: false, receiveShadow: true }));
    b.add(geometry.custom(routeTrack.rails, { name: "track-rails", material: unnamed(material.brushedMetal({ color: "#d8e0e8", roughness: 0.16, anisotropy: 0.88, anisotropyRotation: 0, envMapIntensity: 1.15 })), castShadow: false, receiveShadow: true }));
    b.add(primitives.box({ name: "sleepers", size: [2.7, 0.14, 0.3], instances: routeTrack.sleepersBand, material: pbr("#4f3b2b", 0.86), castShadow: false }));
  } else {
  b.add(geometry.custom(dyn(mergeRibbons(legPts.map((pts) => ribbon(pts, 1.95, 0.02)))), { name: "track-bed", material: pbr("#8d8171", 0.95), castShadow: false }));
  b.add(geometry.custom(dyn(mergeRibbons(legPts.flatMap((pts) => [ribbon(pts, 0.09, 0.2, -0.72), ribbon(pts, 0.09, 0.2, 0.72)]))), { name: "track-rails", material: pbr("#9aa3ad", 0.28, 0.9), castShadow: false }));
  b.add(primitives.box({ name: "sleepers", size: [3.3, 0.14, 0.42], instances: routeTrack.sleepersOrig, material: pbr("#5a4533", 0.9), castShadow: false }));
  }
  b.add(primitives.cylinder({ name: "pylons", size: row ? [1.65, 150, 1.65] : [1.0, 150, 1.0], instances: routeTrack.pylonAt, material: row && tex ? material.pbr({ color: "#a59b8f", roughness: 0.82, texture: tex.stone as never, textureAnisotropy: 8 }) : pbr("#8f8780", 0.8), castShadow: false, receiveShadow: cast }));
  b.add(primitives.box({ name: "pylon-beams", size: [5.8, 0.76, 1.24], instances: routeTrack.pylonBeamAt, material: row ? unnamed(material.brushedMetal({ color: "#4d5259", roughness: 0.38 })) : pbr("#5d5750", 0.85), castShadow: false }));
  if (row) b.add(primitives.box({ name: "a3g-fx-pylon-iron", size: [2.8, 2.2, 2.2], instances: routeTrack.pylonIronAt, material: unnamed(material.brushedMetal({ color: "#3d4550", roughness: 0.34 })), castShadow: false }));
  b.add(primitives.cylinder({ name: "masts", size: [0.26, 7.4, 0.26], instances: routeTrack.mastAt, material: row ? unnamed(material.brushedMetal({ color: "#454c56", roughness: 0.34 })) : pbr("#3d4047", 0.5, 0.5), castShadow: false }));
  b.add(primitives.box({ name: "mast-arms", size: [2.9, 0.12, 0.12], instances: routeTrack.mastArmAt, material: row ? unnamed(material.brushedMetal({ color: "#454c56", roughness: 0.34 })) : pbr("#3d4047", 0.5, 0.5), castShadow: false }));

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
  const stoneMesh = new MeshData(), cobbleMesh = new MeshData(), signalLensMesh = new MeshData();
  const trunkAt: Inst[] = [], canopyAt: Inst[] = [], pineAt: Inst[] = [], stoneAt: Inst[] = [];
  const canopyColors: string[] = [], pineColors: string[] = [];
  const planterAt: Inst[] = [], awningAt: Inst[] = [], awningColors: string[] = [], stallAt: Inst[] = [];
  const islandTop: Inst[] = [], islandRim: Inst[] = [], islandRock: Inst[] = [], islandColors: string[] = [];
  const platformAt: Inst[] = [], platformEdgeAt: Inst[] = [], canopyBoxAt: Inst[] = [], canopyBoxColors: string[] = [], canopyTrimAt: Inst[] = [];
  const lampAt: Inst[] = [], benchAt: Inst[] = [], signAt: Inst[] = [];
  const signalAt: Inst[] = [], signalHeadAt: Inst[] = [], signalColors: string[] = [], festoonAt: Inst[] = [];
  const townBatch = createStaticTownBatcher();
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
    const lampGlow = row ? row.practicals.lampEmissive : night ? 3 : 0.5;
    for (const k of [-9, 9]) {
      b.add(buildSwanNeckLampNode(`lamp-post-${i}-${k}`, [s0.x + sx * 6.8 + fx * k, s0.y + 0.75, s0.z + sz * 6.8 + fz * k], yaw - Math.PI * 0.5, lampGlow, cast, townBatch));
      lampAt.push({ position: [s0.x + sx * 5.96 + fx * k, s0.y + 4.25, s0.z + sz * 5.96 + fz * k] });
    }
    for (const k of [-6, 0, 6]) benchAt.push({ position: [s0.x + sx * 6.4 + fx * k, s0.y + 1.15, s0.z + sz * 6.4 + fz * k], rotation: [0, yaw, 0] });
    signAt.push({ position: [s0.x + sx * 8.1 + fx * 12, s0.y + 2.6, s0.z + sz * 8.1 + fz * 12], rotation: [0, yaw + Math.PI / 2, 0] });
    if (row) {
      // GU47 LT-12: SDF nameboard on the station sign (track-facing side), one text3D node per town
      b.add(text3D(town.name.toUpperCase(), { name: `nameboard-${i}`, size: 0.34, depth: 0.03, backend: "sdf", position: [s0.x + sx * 7.98 + fx * 13.4, s0.y + 2.5, s0.z + sz * 7.98 + fz * 13.4], rotation: [0, yaw - Math.PI / 2, 0], material: pbr("#f3e6cc", 0.5), castShadow: false }));
      // LT-12 signal posts: one red (stop) behind the platform, one green (clear) at the departure end + optical Fresnel lens quads
      for (const [k, al] of [[0, -16], [1, 20]] as const) {
        const sgx = s0.x - sx * 2.9 + fx * al, sgy = s0.y + 4.5, sgz = s0.z - sz * 2.9 + fz * al;
        signalAt.push({ position: [sgx, s0.y + 2.2, sgz] });
        signalHeadAt.push({ position: [sgx, sgy, sgz] }); signalColors.push(k === 0 ? "#ff3a2a" : "#3aff7a");
        const lx = sgx - fx * 0.19, lz = sgz - fz * 0.19, lr = 0.28, vBase = k === 0 ? 0 : 2;
        signalLensMesh.face(
          [[lx - sx * lr, sgy - lr, lz - sz * lr], [lx + sx * lr, sgy - lr, lz + sz * lr], [lx + sx * lr, sgy + lr, lz + sz * lr], [lx - sx * lr, sgy + lr, lz - sz * lr]],
          [-fx, 0, -fz],
          [[0, vBase], [1, vBase], [1, vBase + 1], [0, vBase + 1]]
        );
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
    const winGlow = row ? row.practicals.windowEmissive : night ? 1.8 : 0;
    const snowTown = row !== null && i === SNOW_TOWN;
    buildRow(1, 21, -56, 56, 3, 5, (m) => m > -37 && m < -1);
    buildRow(-1, 17, -56, 56, 3, 5, (m, w) => Math.abs(m - TOWER_ALONG) < w / 2 + 6 || (m > -51 && m < -13));
    {
      const house = (k: number, side: 1 | -1, along: number, depth: number): void => {
        const [hx, hz] = at(side * (side > 0 ? 21 : 17) + side * depth / 2, along);
        b.add(buildCoastalHouseNode(k % 3, `house-${i}-${side > 0 ? "a" : "b"}-${k}`, [hx, top, hz], Math.atan2(-side * sx, -side * sz), winGlow, snowTown, cast, townBatch));
      };
      house(2, 1, -30, 8.9); house(0, 1, -18, 7.1); house(1, 1, -8, 10.7);
      house((i + 0) % 3, -1, -44, 7.1); house((i + 1) % 3, -1, -32, 10.7); house((i + 2) % 3, -1, -20, 8.9);
    }
    buildRow(1, 46, -34, 34, 4, 6);
    buildRow(-1, 46, -34, 34, 4, 6);
    {
      const [tx, tz] = at(-21, TOWER_ALONG);
      b.add(buildClockTowerNode(`clock-tower-${i}`, [tx, top, tz], Math.atan2(sx, sz), winGlow, snowTown, true, townBatch));
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
      if (onPlatform && folkModels < 5) {
        const fs = 0.92 + rand() * 0.16;
        b.add(buildStationFolkNode(folkModels + i, `folk-${i}-${folkModels}`, [fxp, s0.y + 0.75, fzp], rand() * Math.PI * 2, fs, false, townBatch));
        folkModels++;
        continue;
      }
      const r = rand();
      const fs = 0.92 + ((r * 7) % 1) * 0.16;
      const folkYaw = ((r * 13) % 1) * Math.PI * 2;
      b.add(buildStationFolkNode(Math.floor(r * 6) + k + i, `folk-plaza-${i}-${k}`, [fxp, onPlatform ? s0.y + 0.75 : base, fzp], folkYaw, fs, false, townBatch));
    }
    const placed: [number, number][] = [];
    const free = (l: number, a: number, r: number): boolean => Math.hypot(l, a) < 74 && placed.every(([pl, pa]) => Math.hypot(pl - l, pa - a) > r);
    const landmarkVariant = (["keep", "keep", "tower", "tower", "tower", "keep"] as const)[i]!;
    const lx = 36 * (i % 2 ? 1 : -1), la = -26 + (i % 3) * 18;
    placed.push([lx, la]);
    b.add(buildCoastalLandmarkNode(landmarkVariant, `landmark-${i}`, [s0.x + sx * lx + fx * la, top, s0.z + sz * lx + fz * la], yaw + i, winGlow, snowTown, false, townBatch));
    for (const [k, al] of [[0, 12.5], [1, -12.5]] as const) {
      const [cx, cz] = at(4.6, al);
      b.add(buildFreightCratesNode(`crates-${i}-${k}`, [cx, s0.y + 0.75, cz], yaw + k * 1.9, false, townBatch));
    }
    if (i % 3 === 1) {
      const [lx2, lz2] = at(-40, 44);
      const beamGain = row ? (row.practicals.headlamp > 0 ? 0.44 : 0.14) : night ? 0.5 : 0.12;
      b.add(buildLighthouseNode(`lighthouse-${i}`, [lx2, top, lz2], yaw + i, beamGain, true));
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
  for (const staticTownNode of townBatch.buildNodes("town-static")) b.add(staticTownNode);
  b.add(primitives.cylinder({ name: "islands", size: [150, 6, 150], instances: islandTop, instanceColors: islandColors, material: pbr("#ffffff", 0.95), castShadow: false }));
  b.add(primitives.cylinder({ name: "island-rims", size: [146, 3.2, 146], instances: islandRim, material: pbr("#b59a78", 1), castShadow: false }));
  b.add(buildIslandUndercroftNode(
    islandRock.map((r) => ({ position: [r.position[0], r.position[1] + 2, r.position[2]] as V3, rotation: r.rotation as V3 })),
    row !== null,
    false
  ));
  b.add(primitives.box({ name: "platforms", size: [4.4, 0.9, 30], instances: platformAt, material: pbr(row ? "#cfc5b0" : "#d9cfba", row ? (row.practicals.platformPoint > 0 ? 0.24 : 0.34) : 0.82), castShadow: false }).runtime({ id: "platforms" }));
  b.add(primitives.box({ name: "platform-edges", size: [0.3, 0.06, 30], instances: platformEdgeAt, material: pbr("#e9c24a", 0.6), castShadow: false }));
  b.add(primitives.box({ name: "canopies", size: [5.4, 0.3, 24], instances: canopyBoxAt, instanceColors: canopyBoxColors, material: pbr("#ffffff", 0.6), castShadow: true }));
  b.add(primitives.box({ name: "canopy-trims", size: [5.6, 0.14, 24.4], instances: canopyTrimAt, material: pbr("#f4ead2", 0.6), castShadow: false }));
  b.add(primitives.sphere({ name: "lamps", size: 0.42, instances: lampAt, material: glow("#ffd89a", row ? row.practicals.lampEmissive : night ? 3 : 0.5), castShadow: false }).runtime({ id: "lamps" }));
  b.add(primitives.box({ name: "benches", size: [0.6, 0.12, 2.0], instances: benchAt, material: pbr("#8a5a35", 0.8), castShadow: false }));
  if (row) {
    // GU47 LT-12 + WP-24: merged copper-bronze catenary wire + paired GLSL/WGSL corona, signal posts/heads + Fresnel lenses, festoon bulbs
    b.add(geometry.custom(routeTrack.catenary, { name: "catenary", material: material.custom(catenarySpec(row.practicals.platformPoint > 0 ? 0.65 : 0.28)), castShadow: false }).runtime({ id: "catenary" }));
    b.add(primitives.cylinder({ name: "signal-posts", size: [0.18, 4.4, 0.18], instances: signalAt, material: pbr("#3d4047", 0.5, 0.5), castShadow: false }));
    b.add(instances.sphere({ name: "signal-heads", size: 0.32, transforms: signalHeadAt, colors: signalColors, instanceColorTarget: "both", material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2.2 }), castShadow: false }));
    b.add(geometry.custom(signalLensMesh.toGeometry(), { name: "a3g-fx-signal-lenses", material: material.custom(signalLensSpec(row.practicals.platformPoint > 0 ? 0.85 : 0.25)), castShadow: false, receiveShadow: false }).runtime({ id: "a3g-fx-signal-lenses" }));
    b.add(primitives.sphere({ name: "festoon-bulbs", size: 0.16, instances: festoonAt, material: glow("#ffc77a", row.practicals.platformPoint > 0 ? 2.4 : 0.3), castShadow: false }));
  }
  b.add(primitives.box({ name: "signboards", size: [0.2, 1.0, 3.2], instances: signAt, material: pbr("#23423a", 0.6), castShadow: false }));
  b.add(primitives.sphere({ name: "flowers", size: 0.9, instances: flowerAt, instanceColors: flowerColors, material: pbr("#ffffff", 0.7), castShadow: false }));
  b.add(instances.custom(buildCoastalBushSpec(), { name: "bushes", transforms: bushAt, colors: bushColors, material: unnamed(material.pbr({ color: "#ffffff", roughness: 0.92, clearcoat: 0 })), castShadow: false }));
  b.add(instances.custom(buildCloudPuffSpec(), { name: "cloud-puffs", transforms: puffs, material: unnamed(material.pbr({ color: "#fbfaf6", roughness: 1, clearcoat: 0, emissive: "#e8ecf6", emissiveIntensity: row ? 0.06 : 0.28 })), castShadow: false }));
  const asRef = (t: unknown): never => t as never;
  const facadeMat = (tint: string, glowK: number) => tex
    ? material.pbr({ color: tint, roughness: 0.86, texture: asRef(tex.facade), emissiveMap: tex.facadeEmissive as never, emissive: "#ffffff", emissiveIntensity: glowK, textureAnisotropy: 8, ...(row ? { practical: true } : {}) })
    : pbr(tint, 0.86);
  const texMat = (t: unknown, color: string, roughness: number) => t ? material.pbr({ color, roughness, texture: asRef(t), textureAnisotropy: 8 }) : pbr(color, roughness);
  FACADE_TINTS.forEach((tint, k) => b.add(geometry.custom(facadeMesh[k]!.toGeometry(), { name: `facades-${k}`, material: facadeMat(tint, row ? row.practicals.windowEmissive : night ? 1.8 : 0), castShadow: true, receiveShadow: true }).runtime({ id: `facades-${k}` })));
  ROOF_TINTS.forEach((tint, k) => b.add(geometry.custom(roofMesh[k]!.toGeometry(), { name: `roofs-${k}`, material: texMat(tex?.roof, tint, 0.72), castShadow: true, receiveShadow: true })));
  if (row) b.add(geometry.custom(snowRoofMesh.toGeometry(), { name: "roofs-snow", material: material.pbr({ color: SNOW_ROOF_COLOR, roughness: 0.62 }), castShadow: true, receiveShadow: true }));
  b.add(geometry.custom(stoneMesh.toGeometry(), { name: "stonework", material: texMat(tex?.stone, "#ffffff", 0.9), castShadow: true, receiveShadow: true }));
  b.add(geometry.custom(cobbleMesh.toGeometry(), { name: "plaza-cobbles", material: texMat(tex?.cobble, "#ffffff", row ? 0.38 : 0.92), castShadow: false, receiveShadow: true }));
  b.add(primitives.box({ name: "planters", size: [2.4, 0.9, 1.0], instances: planterAt, material: pbr("#cdbfa4", 0.9), castShadow: false }));
  b.add(primitives.box({ name: "stalls", size: [3, 1.4, 1.6], instances: stallAt, material: pbr("#8a5a35", 0.8), castShadow: false }));
  b.add(primitives.box({ name: "awnings", size: [3.6, 0.14, 2.4], instances: awningAt, instanceColors: awningColors, material: pbr("#ffffff", 0.7), castShadow: false }));
  b.add(instances.custom(buildCoastalTreeTrunkSpec(), { name: "tree-trunks", transforms: trunkAt, material: unnamed(material.pbr({ color: "#6b4a32", roughness: 0.94, clearcoat: 0 })), castShadow: false }));
  b.add(instances.custom(buildBroadleafCanopySpec(), { name: "tree-canopies", transforms: canopyAt, colors: canopyColors, material: unnamed(material.pbr({ color: "#ffffff", roughness: 0.88, clearcoat: 0 })), castShadow: true }));
  b.add(instances.custom(buildCoastalPineSpec(), { name: "tree-pines", transforms: pineAt, colors: pineColors, material: unnamed(material.pbr({ color: "#ffffff", roughness: 0.88, clearcoat: 0 })), castShadow: true }));
  b.add(instances.custom(buildCoastalBoulderSpec(), { name: "stones", transforms: stoneAt, material: unnamed(material.pbr({ color: "#8a867f", roughness: 0.94, clearcoat: 0 })), castShadow: false }));

  /* ---- tram and passengers (sculpted multi-material nodes, moved from the runtime) ---- */
  b.add(buildStreetcarBodyNode("tram-body", row ? row.practicals.tramBulbs : night ? 2.4 : 0.6, true));
  if (row) {
    for (const part of tramCoachTrim(row.practicals.tramBulbs)) {
      b.add(geometry.custom(part.geom, { name: part.id, material: part.mat, castShadow: false, receiveShadow: false }).runtime({ id: part.id }));
    }
  }
  SEATS.forEach((_, i) => {
    for (const t of TEMPERAMENTS) b.add(buildPassengerNode(t, `pax-${i}-${t}`, false));
  });

  /* ---- GU47 LT-13 signature: earned sky lanterns + WP-24 warm brass headlamp volumetric cone & wheel-flange spark flipbooks ---- */
  if (row) {
    b.add(instances.custom(buildSkyLanternSpec(), { name: "sky-lanterns", transforms: [{ position: [0, -400, 0], scale: 0.001 }], material: unnamed(material.emissive({ color: "#ffb35c", emissive: "#ffc77a", emissiveIntensity: row.lanternGlow, practical: true })), castShadow: false }).runtime({ id: "sky-lanterns" }));
    b.add(upgradeVolumetricBeamWgsl(effects.volumetricBeam({ name: "a3g-fx-headlamp-cone", position: [0, -400, 0], direction: [0, -0.08, 1], length: 22, endRadius: 3.1, color: "#ffdca2", intensity: row.practicals.headlamp > 0 ? (row.id === "C" ? 0.22 : 0.34) : 0.001, falloff: 1.9, edgeSoftness: 1.5, noise: 0.2 })).runtime({ id: "a3g-fx-headlamp-cone" }));
    for (const id of ["a3g-fx-flange-spark-l", "a3g-fx-flange-spark-r"] as const) {
      b.add(geometry.custom(sparkBillboardQuad(0.32), { name: id, position: [0, -400, 0], material: material.custom(flangeSparkSpec(FLANGE_SPARKS_ATLAS, 1.75)), castShadow: false, receiveShadow: false }).runtime({ id }));
    }
  }

  /* ---- weather points (rain / snow around the camera) and ambient motes ---- */
  b.add(geometry.custom(spriteGeometry({
    positions: f32(new Array(WEATHER_COUNT * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(3)) },
      fade: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(0)) }
    }
  }), { name: "weather", material: spriteMaterial([0.8, 0.88, 1]) }).runtime({ id: "weather" }));
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(RAIN_COUNT * 12).fill(0)),
    indices: Uint32Array.from(Array.from({ length: RAIN_COUNT }, (_, i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3]).flat()),
    // Portable path: `fade` rides in uv0.x (graph builtins have no author attributes); GLSL path keeps the `fade` attribute.
    ...(RAIN_PORTABLE ? { uvs: f32(new Array(RAIN_COUNT * 8).fill(0)) } : { attributes: { fade: { itemSize: 1, data: f32(new Array(RAIN_COUNT * 4).fill(0)) } } })
  }), { name: "rain", material: RAIN_PORTABLE ? rainGraphSpec([0.75, 0.85, 1]) : material.custom(rainSpec([0.75, 0.85, 1])) }).runtime({ id: "rain" }));
  b.add(geometry.custom(spriteGeometry({
    positions: f32(new Array(MOTE_COUNT * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array(MOTE_COUNT).fill(3)) },
      fade: { itemSize: 1, data: f32(new Array(MOTE_COUNT).fill(0)) }
    }
  }), { name: "motes", material: spriteMaterial([1, 0.93, 0.7]) }).runtime({ id: "motes" }));

  return b;
}

export function buildWorld(data: SimData, look: "bands" | "original" = LOOK, options?: { readonly probes?: boolean }): World {
  const tex = getTownTextures();
  const includeProbes = options?.probes ?? !FX.has("noprobes");
  const cache = new Map<SceneLook, Scene>();
  const sceneFor = (l: SceneLook): Scene => { let sc = cache.get(l); if (!sc) cache.set(l, sc = buildScene(data, l, tex, includeProbes)); return sc; };
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
 * `sampleRoute(leg, 0..4)`, and near the arrival end (`distance > len - 4`) it clamps `d0 <= len - span` so `c` and `a`
 * never collapse to the same point (`[0,0,0]` -> `atan2(0,0)` sideways camera snap!).
 */
export function dockForward(data: SimData, leg: number, distance: number): V3 {
  const len = data.route.legs[leg]!.length;
  const span = Math.min(4, Math.max(0.5, len));
  const d0 = distance < 1 ? 0 : Math.max(0, Math.min(distance, Math.max(0, len - span)));
  const a = sampleRoute(data.route, leg, d0), c = sampleRoute(data.route, leg, Math.min(d0 + span, len));
  const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

function bindRuntime(app: AuraApp, data: SimData, sceneFor: (look: SceneLook) => Scene, look: "bands" | "original", startNight: boolean): WorldRuntime {
  const maybeCamera = app.camera;
  if (!maybeCamera) throw new Error("last-train-port: the app exposes no camera controller");
  const cam: NonNullable<typeof maybeCamera> = maybeCamera;
  const chase = cameras.chase({ lag: { eye: 16, look: 20, fov: 12 } });
  const handles = new Map<string, Handle>();
  const seenIds = new Set<string>();
  const node = (id: string): Handle => { seenIds.add(id); let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const towns = data.tables.towns;
  const rand = lehmer(4242);
  const seeds = Array.from({ length: WEATHER_COUNT }, () => [rand(), rand(), rand(), rand()] as const);
  const moteSeeds = Array.from({ length: MOTE_COUNT }, () => [rand(), rand(), rand(), rand()] as const);
  const wpos = new Float32Array(WEATHER_COUNT * 3), wfade = new Float32Array(WEATHER_COUNT), wsize = new Float32Array(WEATHER_COUNT);
  const mpos = new Float32Array(MOTE_COUNT * 3), mfade = new Float32Array(MOTE_COUNT), msize = new Float32Array(MOTE_COUNT);
  /** With sprite quads, the point arrays written below land on the four corners of each quad (unchanged arrays are not rewritten). */
  const spriteHandle = (h: Handle) => SPRITE_QUADS ? skipUnchangedUpdates(quadUpdater(h, { position: 3, size: 1, fade: 1 })) : h;
  let sky = node("sky"), clouds = node("cloud-sea"), weather = spriteHandle(node("weather")), motes = spriteHandle(node("motes")), rain = node("rain");
  const rebindSceneHandles = (): void => {
    handles.clear();
    sky = node("sky");
    clouds = node("cloud-sea");
    weather = spriteHandle(node("weather"));
    motes = spriteHandle(node("motes"));
    rain = node("rain");
    weatherWasOn = true;
  };
  const rpos = new Float32Array(RAIN_COUNT * 12), rfade = new Float32Array(RAIN_COUNT * 4), ruv = new Float32Array(RAIN_COUNT * 8);
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
  const impactRig = createImpactRig();
  let prevSpeed = 0;
  let flashUntil = -1, flashOn = false;
  let platformsWet = false;
  /* GU47 LT-16: arrival rail, departure trackside, finale crane (band look only; ?shots=0 turns them off) */
  const shots = new ShotDirector(look === "bands" && QUERY.get("shots") !== "0");
  /* QA crops (E-I capture): the camera pose on screen, the pool town and the headlamp of the last update */
  /** Last pose that passed `guardPose` (a non-finite frame repeats it). */
  let lastGoodPose: GuardPose | null = null;
  let wasOrbit: boolean | null = null;
  let prevCamLeg = -1;
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
        rebindSceneHandles();
      }
    } else {
      const wanted = bandFor(sim.leg, sim.timeOfDay, PINNED_BAND);
      if (shouldSwapBand(shownBand, wanted, sim.phase, forceSwap)) {
        if (sim.phase === "enroute") enrouteSwaps++;
        shownBand = wanted;
        app.setScene(sceneFor(wanted));
        rebindSceneHandles();
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
    const body = node("tram-body");
    body.setPosition(here.x, here.y + 0.2 + bob, here.z);
    body.setRotation(euler[0], euler[1], euler[2]);
    if (shownBand !== null) {
      for (const id of TRAM_FX_IDS) {
        const h = node(id);
        h.setPosition(here.x, here.y + 0.2 + bob, here.z);
        h.setRotation(euler[0], euler[1], euler[2]);
      }
    }
    const seated = new Set(sim.trips.map((t) => t.seat));
    SEATS.forEach((seat, i) => {
      const trip = sim.trips.find((t) => t.seat === i);
      for (const t of TEMPERAMENTS) {
        const h = node(`pax-${i}-${t}`);
        const on = seated.has(i) && trip?.temperament === t;
        h.setVisible(on);
        if (on) {
          if (shownBand !== null) {
            const sp = seatedRiderPose(i, seat[0], t, seconds, riderLean, rm);
            const seatedPos = applyMat3(rot, [seat[0] + sp.latShift, STREETCAR_FLOOR_Y + sp.yOffset + sp.breathY, seat[2]]);
            const paxRot = multiplyMat3(multiplyMat3(multiplyMat3(rot, axisRotation("z", riderLean)), axisRotation("y", (seat[0] < 0 ? Math.PI / 2 : -Math.PI / 2) + sp.yawOffset)), axisRotation("x", sp.pitch));
            const paxEuler = matrixToEulerZYX(paxRot);
            h.setPosition(here.x + seatedPos[0], here.y + seatedPos[1] + 0.2 + bob, here.z + seatedPos[2]);
            h.setRotation(paxEuler[0], paxEuler[1], paxEuler[2]);
          } else {
            const seatedPos = applyMat3(rot, [seat[0], STREETCAR_FLOOR_Y + 1.24, seat[2]]);
            const paxEuler = matrixToEulerZYX(multiplyMat3(multiplyMat3(rot, axisRotation("z", riderLean)), axisRotation("y", seat[0] < 0 ? Math.PI / 2 : -Math.PI / 2)));
            h.setPosition(here.x + seatedPos[0], here.y + seatedPos[1] + 0.2 + bob, here.z + seatedPos[2]);
            h.setRotation(paxEuler[0], paxEuler[1], paxEuler[2]);
          }
        }
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
      // GU47 LT-05 + WP-24: band afterglow/stars, catenary pantograph wave, and optical signal lens breath
      const br = BANDS[shownBand];
      sky.setUniform?.("afterglow", br.sky.afterglow); sky.setUniform?.("starMix", br.sky.stars);
      clouds.setUniform?.("sunDir", [dir[0]! / dl, dir[1]! / dl, dir[2]! / dl]);
      clouds.setUniform?.("cloudLit", rgb(br.clouds.lit)); clouds.setUniform?.("cloudValley", rgb(br.clouds.valley));
      clouds.setUniform?.("sunGain", br.clouds.sunGain); clouds.setUniform?.("bandMix", 1);
      const cat = node("catenary");
      cat.setUniform?.("wirePhase", seconds);
      cat.setUniform?.("arcBoost", (br.practicals.platformPoint > 0 ? 0.65 : 0.28) + (Math.abs(sim.speed) > 5 && Math.abs(sim.roll) > 0.15 ? 0.55 : 0));
      node("a3g-fx-signal-lenses").setUniform?.("signalPhase", seconds);
    }
    clouds.setUniform?.("cloudPhase", seconds); clouds.setUniform?.("nightMix", nightLevel);
    clouds.setUniform?.("hazeColor", mixRgb(hor, [0.05, 0.07, 0.16], nightLevel));
    clouds.setPosition(here.x, 0, here.z);

    /* gameplay rear-chase & docked rear-platform 3/4 camera — always framing the train and railway track ahead */
    const absSpeed = Math.abs(sim.speed);
    const still = options.reducedMotion === true;
    const orbit = options.orbit && !still ? seconds * 0.16 : 0;
    const dockTarget = sim.phase !== "enroute" && absSpeed < 0.3 ? 1 : 0;
    dockBlend = dockBlend < 0 || dt === 0 ? dockTarget : dockBlend + (dockTarget - dockBlend) * Math.min(1, dt * 3.2);
    const kd = dockBlend * dockBlend * (3 - 2 * dockBlend);
    const sh = Math.hypot(f[0], f[2]) || 1, sd: V3 = [f[2] / sh, 0, -f[0] / sh];
    const lean = Math.max(-1, Math.min(1, sim.roll / 0.42));
    const speed01 = Math.max(0, Math.min(1, absSpeed / Math.max(1, data.tables.TM)));
    const chaseBack = 14.5 + speed01 * 3.0;
    const chaseUp = 5.2 + speed01 * 0.4;
    const chaseLat = lean * 0.38;
    const chaseEye: V3 = [
      here.x - f[0] * chaseBack + sd[0] * chaseLat,
      here.y + chaseUp - f[1] * chaseBack,
      here.z - f[2] * chaseBack + sd[2] * chaseLat
    ];
    const chaseTarget: V3 = [here.x + f[0] * 22, here.y + 2.0 + f[1] * 22, here.z + f[2] * 22];
    const sway = still ? 0 : Math.sin(seconds * 0.45) * 0.12;
    const band = shownBand !== null;
    const dockEye: V3 = [
      here.x - f[0] * 13.5 - sd[0] * (3.4 + sway),
      here.y + 4.8 - f[1] * 13.5 + (still ? 0 : Math.sin(seconds * 0.31) * 0.08),
      here.z - f[2] * 13.5 - sd[2] * (3.4 + sway)
    ];
    const dockAim: V3 = [
      here.x + f[0] * 10 - sd[0] * 0.8,
      here.y + 2.1 + f[1] * 10,
      here.z + f[2] * 10 - sd[2] * 0.8
    ];
    const mix3 = (a: V3, c: V3, t: number): V3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    const eye: V3 = options.orbit
      ? [here.x + Math.sin(orbit + 0.6) * 22, here.y + (band ? 5.6 : 7.5) + (still ? 0 : Math.sin(seconds * 0.23) * 1.2), here.z + Math.cos(orbit + 0.6) * 22]
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
      /* GU47 LT-14 + WP-24: effect pack & visual-only impactRig from read-only sim events */
      const view: VfxSimView = { phase: sim.phase, fares: sim.attempt.fares, catches: sim.attempt.catches, speed: sim.speed, roll: sim.roll, leg: sim.leg };
      if (prevVfx) {
        if (!still) {
          if (prevVfx.phase === "enroute" && sim.phase === "docked") {
            impactRig.trigger({ trauma: 0.16, freezeSeconds: 0.03, fovKickDeg: -1.3 });
          }
          if (sim.attempt.catches > prevVfx.catches) {
            impactRig.trigger({ trauma: 0.4, freezeSeconds: 0.045, fovKickDeg: 2.1 });
          } else if (prevVfx.phase === "closing" && sim.phase === "enroute") {
            impactRig.trigger({ trauma: 0.12, freezeSeconds: 0, fovKickDeg: 1.0 });
          }
        }
        if (fx) {
          for (const kind of vfxEvents(prevVfx, view, weatherOf(data, sim))) {
            if (kind === "lamplight-pantograph") { if (seconds - pantographAt < 0.25) continue; pantographAt = seconds; }
            const up = kind === "lamplight-pantograph" ? 4.7 : kind === "lamplight-gutter" ? 30 : 0.9;
            fx.spawn(kind, [here.x, here.y + up, here.z]);
          }
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

    /* GU47 LT-02 + WP-24: practical pool, volumetric headlamp shaft & 8x4 wheel-flange spark flipbooks */
    if (shownBand !== null) {
      const row = BANDS[shownBand];
      const hlPose = headlampPose(here, f);
      const beam = node("a3g-fx-headlamp-cone");
      if (row.practicals.platformPoint > 0) {
        const t = poolTown(data, sim.leg, sim.distance, sim.phase);
        if (t !== lightTown) {
          lightTown = t;
          const at = platformLightPositions(data, t);
          PLATFORM_LIGHT_IDS.forEach((id, i) => moveLight(node(id), at[i]!));
        }
        moveLight(node(HEADLAMP_ID), hlPose.position, hlPose.direction);
      }
      const beamOn = row.practicals.headlamp > 0;
      beam.setVisible(beamOn);
      if (beamOn) {
        const beamEuler = matrixToEulerZYX(multiplyMat3(tramRotation(hlPose.direction, 0), axisRotation("x", -Math.PI / 2)));
        beam.setPosition(hlPose.position[0] + hlPose.direction[0] * 11, hlPose.position[1] + hlPose.direction[1] * 11, hlPose.position[2] + hlPose.direction[2] * 11);
        beam.setRotation(beamEuler[0], beamEuler[1], beamEuler[2]);
      }
      const braking = absSpeed > 4.2 && absSpeed < prevSpeed - 0.015;
      const flangeRub = absSpeed > 5.2 && Math.abs(sim.roll) > 0.16;
      const sparkOn = !still && sim.phase === "enroute" && (braking || flangeRub);
      const sparkAlpha = sparkOn ? Math.min(1, (braking ? 0.85 : 0.65) * (absSpeed / 12)) : 0;
      const sparkFrame = (seconds * 30) % 32;
      const sparkYaw = Math.atan2(eye[0] - here.x, eye[2] - here.z);
      for (const [id, lat, fOff] of [["a3g-fx-flange-spark-l", -0.74, 0], ["a3g-fx-flange-spark-r", 0.74, 11]] as const) {
        const sh2 = node(id);
        sh2.setVisible(sparkAlpha > 0.02);
        if (sparkAlpha > 0.02) {
          const sp = applyMat3(rot, [lat, 0.14, 3.15]);
          sh2.setPosition(here.x + sp[0], here.y + 0.2 + bob + sp[1], here.z + sp[2]);
          sh2.setRotation(0, sparkYaw, 0);
          sh2.setUniform?.("burstState", [(sparkFrame + fOff) % 32, sparkAlpha, 1.85, 0]);
        }
      }
    }
    prevSpeed = absSpeed;
    const feel = impactRig.step(dt);
    let wantEye = eye, wantLook = target, fovTarget = 56 - 2 * kd + speed01 * 6;
    let shakeOffset: V3 | undefined;
    const isOrbit = Boolean(options.orbit);
    const cut = wasOrbit === null || wasOrbit !== isOrbit || (prevCamLeg !== -1 && prevCamLeg !== sim.leg && sim.distance < 2);
    wasOrbit = isOrbit;
    prevCamLeg = sim.leg;
    if (shownBand !== null && !options.orbit) {
      // Observe ShotDirector for telemetry & catch-shake only — never override gameplay track-ahead eye/look with side cutaways!
      shots.observe({ phase: sim.phase, complete: sim.attempt.status === "complete", catches: sim.attempt.catches }, seconds);
      const shot = shots.frame({ eye, target, fov: fovTarget }, { here: [here.x, here.y, here.z], forward: f, side: sd }, seconds, still);
      shakeOffset = shot.shakeOffset;
      if (!still) {
        fovTarget += feel.fovDeltaDeg ?? 0;
        if (Math.hypot(feel.shakeOffset[0], feel.shakeOffset[1], feel.shakeOffset[2]) > 1e-4) {
          shakeOffset = shakeOffset
            ? [shakeOffset[0] + feel.shakeOffset[0], shakeOffset[1] + feel.shakeOffset[1], shakeOffset[2] + feel.shakeOffset[2]]
            : feel.shakeOffset;
        }
      }
    }
    const camRoll = still || options.orbit ? 0 : lean * 0.032 * (1 - kd);
    const camUp: V3 = [sd[0] * Math.sin(camRoll), Math.cos(camRoll), sd[2] * Math.sin(camRoll)];
    const pose = chase.step({ wantEye, wantLook, fovTarget, cut, ...(shakeOffset ? { shakeOffset } : {}) }, dt);
    const safe = guardPose({ position: pose.eye, target: pose.look, up: camUp, fov: pose.fov }, lastGoodPose, { position: [here.x - f[0] * 14.5, here.y + 5.2, here.z - f[2] * 14.5], target: [here.x + f[0] * 22, here.y + 2.0, here.z + f[2] * 22], up: [0, 1, 0], fov: 56 });
    lastGoodPose = safe;
    cam.setPose({ position: [...safe.position], target: [...safe.target], up: [...safe.up], fov: safe.fov }, { cut });
    shownPose = { eye: [...safe.position], target: [...safe.target], fov: safe.fov };
    cropTown = poolTown(data, sim.leg, sim.distance, sim.phase);
    cropHeadlamp = headlampPose(here, f).position;

    /* rain (Monsoon Exchange, index 4) or snow (Drowned Observatory, index 3) near those towns */
    const weatherNow = FORCE_RAIN ? "rain" : weatherOf(data, sim);
    const raining = weatherNow === "rain", snowing = weatherNow === "snow";
    /* GU47 LT-09 + WP-24: wet platforms in Monsoon rain (roughness 0.16) vs damp twilight stone (0.24 / 0.34), setMaterial only when weather changes */
    if (shownBand !== null && raining !== platformsWet) {
      platformsWet = raining;
      const dampRough = BANDS[shownBand].practicals.platformPoint > 0 ? 0.24 : 0.34;
      node("platforms").setMaterial(material.pbr({ color: raining ? "#b9b2a2" : "#cfc5b0", roughness: raining ? 0.16 : dampRough }));
    }
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
        if (RAIN_PORTABLE) { for (let k = 0; k < 4; k++) { ruv[i * 8 + k * 2] = k >= 2 ? a : 0; } }
        else { rfade[i * 4] = 0; rfade[i * 4 + 1] = 0; rfade[i * 4 + 2] = a; rfade[i * 4 + 3] = a; }
      }
      rain.updateAttribute?.("position", { array: rpos, offset: 0 });
      if (RAIN_PORTABLE) rain.updateAttribute?.("uv", { array: ruv, offset: 0 });
      else rain.updateAttribute?.("fade", { array: rfade, offset: 0 });
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
