/**
 * HEATSINK world on the public `@aura3d/engine` surface: road ribbon (`geometry.dynamic` + author attributes +
 * `material.custom`), split-lane dividers, rock massifs, neon crystals, aurora sky dome, checkpoint veils, boost pads,
 * pickups, barrels, the player drone (primitives), exhaust points, chase camera, bloom and vignette. The original's
 * GLB/texture assets are re-created procedurally; see PORTING-NOTES.md.
 */
import { createCameraShake } from "@aura3d/engine/game";
import { camera, cameras, effects, environments, geometry, lights, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { CFG } from "./config";
import { buildArches, buildDividers, buildProps, buildRails, buildRoad, buildShards, buildShoulders, groundQuad, hexLinear, padQuad, veilQuad, type MeshData } from "./meshes";
import { beaconSpec, blobSpec, pointsSpec, roadSpec, setShading, skySpec, solidSpec, streakSpec, terrainSpec, veilSpec, wakeSpec, type Rgb } from "./materials";
import { bankRoll, createIonWake, createSporeField, sporeField } from "./art/wake";
import { districtFog, fogApproach } from "./art/look";
import { afterburnerKick, directCamera, HEAT_STEPS, heatStep, SWEEP, VIGNETTE_PULSE, vignettePulse } from "./art/director";
import { buildBeacons } from "./art/beacons";
import { createPoolUniforms, glowEmitters, nearestPools } from "./art/pools";
import { HEATSINK_VFX, registerHeatsinkVfx, vfxScale } from "./art/vfx";
import { axisRotation, droneEuler, matrixToEulerZYX, multiplyMat3 } from "./orient";
import type { Race } from "./race";
import { barrelModel, droneHull, gatePylonNodes, modelSet, sceneryNodes, pickupModel } from "./models";
import { Operation, STRIKE } from "./operation";
import { seededRandom } from "./rng";
import { Track, type Frame } from "./track";
import type { HudValues } from "./hud";
import { lookFromSearch, lowTier, SHADER_SUN_DIR, type HeatsinkLookRow } from "./art/look";

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData) {
  const attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {};
  for (const [k, v] of Object.entries(m.attrs)) if (v.length) attributes[k] = { itemSize: k === "roadUv" ? 2 : 3, data: f32(v) };
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), attributes });
}

const FOG_NODES: string[] = [];
const fogTracked = <T>(id: string, value: T): T => { FOG_NODES.push(id); return value; };

interface PartSpec {
  readonly id: string;
  readonly prim: "box" | "cyl" | "sphere";
  readonly size: number | readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly yaw?: number;
  /** rad/s about the local Y axis, added to `yaw` */
  readonly spin?: number;
  readonly rollZ?: number;
  readonly base: string;
  readonly glow: string;
  readonly glowAmt: number;
  readonly additive?: boolean;
  /** the Meshy hull model instead of a primitive */
  readonly model?: boolean;
}
/** the generated hull's camera gimbal (its nose) must point along the track's +X; a +90 degree yaw rendered it backwards, so -90 */
const HULL_YAW = -Math.PI / 2;
/** Quad-rotor drone in the track frame (x forward, y up, z side): copper body, cyan accents, twin thrusters with plumes. */
const DRONE_PARTS: readonly PartSpec[] = [
  { id: "drone-hull", prim: "box", size: 1, offset: [0, 0.1, 0], yaw: HULL_YAW, base: "#000000", glow: "#000000", glowAmt: 0, model: true }
];

const STREAKS = 110;
/** blob quad corners as (along, lateral) unit offsets, in the uv order of the quad */
const BLOB_CORNERS: readonly (readonly [number, number])[] = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
const BOLTS = STRIKE.boltPool;
const BOLT_LENGTH = CFG.weapons.length;
const BOLT_HALF_WIDTH = 0.22;
/** chase-camera framing of the art pass (lower and closer than `CFG.camera`, matching the original's frames); the sim never reads it */
const FRAMING = { dist: 7.6, height: 2.0 };
/**
 * bloom settings (HP-19). 4.3.7 to 4.5.0 shipped intensity 0.9, threshold 0.85, radius 0.5, which drew the warnings
 * post-field-deprecated:bloom.radius, BLOOM_THRESHOLD_BELOW_HDR_WHITE and bloom-noise-risk (intensity over 0.62).
 * `radius` is no longer authored (the HDR chain uses its default scatter; `effects.bloom` has no typed `scatter`).
 */
export const BLOOM = { intensity: 0.6, threshold: 1.0 } as const;
/** Neutral-room IBL intensity for the lit models (LIGHT-01); see the environment node in `buildWorld`. */
export const NEUTRAL_FILL = 1.0;
/** IC-04: the twilight IBL (E-A catalogue, served at /hdri/sunset-dramatic_1k.hdr); IBL only, never the background */
export const TWILIGHT_HDRI = { type: "texture", format: "hdr", url: "/hdri/sunset-dramatic_1k.hdr" } as const;

/** HP-13: motion the player can turn down (and `prefers-reduced-motion` turns down by default) */
export interface MotionSettings {
  readonly reduced: boolean;
  /** IC-22 countdown sweep and finish orbit; false under `manual=1` (deterministic capture driving). Default true */
  readonly cinematic?: boolean;
}
/** with reduced motion: no camera shake, the speed FOV kick capped at this many degrees, speed streaks at half alpha */
export const REDUCED_FOV_KICK = 6;

/** the custom-shader nodes whose `fogColor` follows the district (IC-06); models and additive strips are not fogged */
export const DISTRICT_FOG_NODES = ["road", "dividers", "rocks", "plains", "rails", "rail-posts", "arches", "arch-neon", "shards", "crystals", "abyss"] as const;
/** the QA crop of the drone published to `window.__AURA_QA__.crops` (static: the chase camera keeps the drone there) */
export const DRONE_CROP = { name: "drone", x: 0.38, y: 0.5, w: 0.24, h: 0.24 } as const;

export interface WorldRuntime {
  update(race: Race, hud: HudValues, dt: number, time: number, aspect: number): void;
  /** forget the camera rig and event cursors and clear every per-frame buffer (particles, streaks, bolts), so a new race never inherits bad values (HP-05) */
  resetCamera(): void;
  setMotion(motion: MotionSettings): void;
  readonly nodeCount: number;
}

export interface World {
  readonly scene: Scene;
  readonly track: Track;
  readonly look: HeatsinkLookRow;
  bind(app: AuraApp): WorldRuntime;
}

/** the look row for a URL search string (`?look=original` is today's look) or an explicit row; Low gets `lowTier` */
export function resolveLook(look: HeatsinkLookRow | string | undefined, quality: "high" | "low"): HeatsinkLookRow {
  const row = typeof look === "object" ? look : lookFromSearch(look ?? (typeof location !== "undefined" ? location.search : ""));
  return quality === "low" ? lowTier(row) : row;
}

export function buildWorld(track: Track, quality: "high" | "low" = "high", lookInput?: HeatsinkLookRow | string): World {
  const high = quality === "high";
  const look = resolveLook(lookInput, quality);
  setShading(look);
  const models = modelSet(quality);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < track.n; i++) { minY = Math.min(minY, track.py[i] as number); maxY = Math.max(maxY, track.py[i] as number); }
  const snowLine = (minY + maxY) / 2 + 45;
  /*
   * The bolt, streak, exhaust and contact-shadow strips are rebuilt every frame through `updateAttribute`, which does
   * not refresh a node's bounds. Their initial positions are all zero, so without authored bounds they were culled
   * against a point at the origin and drew nothing on most of the lap. Author the whole course as their bounds.
   */
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i] as number); maxX = Math.max(maxX, track.px[i] as number);
    minZ = Math.min(minZ, track.pz[i] as number); maxZ = Math.max(maxZ, track.pz[i] as number);
  }
  const PAD = 300;
  const courseBounds = { min: [minX - PAD, minY - PAD, minZ - PAD] as [number, number, number], max: [maxX + PAD, maxY + PAD, maxZ + PAD] as [number, number, number] };
  const b: Scene = scene()
    .background("#02040a")
    .camera(camera.perspective({ position: [0, 40, 0], target: [0, 0, 0], fov: CFG.camera.fovBase, near: 0.3, far: 4200 }));

  b.add(geometry.custom(dynamicFrom(buildRoad(track, high ? 3 : 5)), { name: "road", material: material.custom(roadSpec()) }).runtime({ id: fogTracked("road", "road") }));
  b.add(geometry.custom(dynamicFrom(buildDividers(track, 3, 3)), { name: "dividers", material: material.custom(solidSpec(hexLinear("#2a2f3f"), hexLinear("#40e0ff"), 0.25)) }).runtime({ id: fogTracked("dividers", "dividers") }));
  const props = buildProps(track);
  b.add(geometry.custom(dynamicFrom(props.rocks), { name: "rocks", material: material.custom(terrainSpec(snowLine)) }).runtime({ id: fogTracked("rocks", "rocks") }));
  b.add(geometry.custom(dynamicFrom(buildShoulders(track, high ? 6 : 10)), { name: "plains", material: material.custom(terrainSpec(1e6, [1.15, 1.2, 1.2])) }).runtime({ id: fogTracked("plains", "plains") }));
  const rails = buildRails(track);
  b.add(geometry.custom(dynamicFrom(rails.rails), { name: "rails", material: material.custom(solidSpec(hexLinear("#aab6c0"), hexLinear("#324047"), 0.08)) }).runtime({ id: fogTracked("rails", "rails") }));
  b.add(geometry.custom(dynamicFrom(rails.posts), { name: "rail-posts", material: material.custom(solidSpec(hexLinear("#2a5a62"), hexLinear("#60f4ff"), 1.7)) }).runtime({ id: fogTracked("rail-posts", "rail-posts") }));
  const arches = buildArches(track);
  b.add(geometry.custom(dynamicFrom(arches.body), { name: "arches", material: material.custom(solidSpec(hexLinear("#2a2a33"), hexLinear("#10141c"), 0.06)) }).runtime({ id: fogTracked("arches", "arches") }));
  b.add(geometry.custom(dynamicFrom(arches.neon), { name: "arch-neon", material: material.custom(solidSpec(hexLinear("#bff8ff"), hexLinear("#80f4ff"), 2.2)) }).runtime({ id: fogTracked("arch-neon", "arch-neon") }));
  b.add(geometry.custom(dynamicFrom(buildShards(track)), { name: "shards", material: material.custom(look.wake.enabled ? solidSpec(hexLinear("#1e1a34"), hexLinear("#6a48e0"), 0.55) : solidSpec(hexLinear("#1a1c26"), hexLinear("#241a3a"), 0.12)) }).runtime({ id: fogTracked("shards", "shards") }));
  b.add(geometry.custom(dynamicFrom(props.crystals), { name: "crystals", material: material.custom(solidSpec(hexLinear("#3ad8c8"), hexLinear("#4ff0e0"), 0.9)) }).runtime({ id: fogTracked("crystals", "crystals") }));
  /* IC-24 lane beacons every 44 m on both edges, district-coloured, one merged draw (+1); twilight only */
  if (look.dressing.beacons) b.add(geometry.custom(dynamicFrom(buildBeacons(track)), { name: "beacons", material: material.custom(beaconSpec()), castShadow: false }).runtime({ id: fogTracked("beacons", "beacons") }));
  b.add(geometry.custom(dynamicFrom(groundQuad(5000, minY - 90)), { name: "abyss", material: material.custom(solidSpec(hexLinear("#2a3a40"), hexLinear("#0b1a26"), 0.05)) }).runtime({ id: fogTracked("abyss", "abyss") }));
  /* the earlier black sky was the draw-skip on unused declared uniforms (fixed in 4.0.7); the dome is back-culled again */
  b.add(primitives.sphere({ name: "sky", size: 3000, material: material.custom(skySpec()) }).runtime({ id: "sky" }));

  /* the Meshy models are lit surfaces: a sky fill and the key; the custom (unlit) road/sky/neon shaders evaluate their own `lit()` */
  b.add(lights.hemisphere({ name: "sky-fill", skyColor: look.hemisphere.sky, groundColor: look.hemisphere.ground, intensity: look.hemisphere.intensity }));
  /*
   * LIGHT-01 / IC-04: the lit models need an image-based light (4.5.0 gives none to a scene with authored lights and no
   * environment). `?look=original` keeps the calibrated neutral room (evidence/audit-fix/g19). The twilight look uses a
   * dusk HDRI from the E-A catalogue, IBL only (background off: the authored dome stays the visible sky), rotated to the
   * shader sun's azimuth so the warm side of the reflections faces the sunset band. environments.capture of the custom
   * dome is unverified on custom-material domes (E-G, phase 2), so the HDRI is the PRD's fallback; `?env=capture` tries it.
   */
  const envParam = typeof location !== "undefined" ? new URLSearchParams(location.search).get("env") : null;
  if (look.environment.kind === "neutral") b.add(environments.neutral({ name: "model-fill", intensity: look.environment.intensity }));
  else if (envParam === "capture") b.add(environments.capture({ name: "model-fill", intensity: look.environment.intensity, background: false, include: "all", resolution: 128, update: "once" }));
  else b.add(environments.hdri({ name: "model-fill", texture: TWILIGHT_HDRI as never, intensity: look.environment.intensity, rotation: (look.environment.rotationDeg * Math.PI) / 180, background: false }));
  /*
   * IC-03: the twilight key sits along the shader sun ([0.55, 0.23, -0.62], ~15 degrees up) with the map's sun colour
   * and intensity, so engine shadows fall the way the custom shaders shade; 3 cascades over 220 m and the drone casts.
   * `?look=original` keeps the 52-degree key, 2 cascades over 160 m and no model casters (blob only). `?shadow=0` turns the
   * cascades off. Low tier: 1 cascade.
   */
  const shadowOff = typeof location !== "undefined" && new URLSearchParams(location.search).get("shadow") === "0";
  b.add(lights.directional({ name: "key", position: [...look.key.position], target: [0, 0, 0], intensity: look.key.intensity, color: look.key.color, shadow: (shadowOff ? false : { cascades: look.key.cascades, maxDistance: look.key.maxDistance }) as never }));
  /* IC-02: moving points for the lit GLBs (twilight only, 1 on Low): the drone's exhaust glow and the nearest pad / gate pool */
  if (look.glow.points > 0) b.add(lights.point({ name: "drone-glow", position: [0, -500, 0], intensity: 6, distance: 14, color: "#40e0ff" }).runtime({ id: "drone-glow" }));
  if (look.glow.points > 1) b.add(lights.point({ name: "pool-glow", position: [0, -500, 0], intensity: 7, distance: 20, color: "#ffb02e" }).runtime({ id: "pool-glow" }));
  for (const n of sceneryNodes(track, undefined, models)) b.add(n);

  /* checkpoint gates: veil across the road + two pylons */
  track.checkpoints.forEach((s, i) => {
    const fr = track.frame(s);
    const color = hexLinear(fr.sec.hud.color);
    b.add(geometry.custom(dynamicFrom(veilQuad(track, s, 22)), { name: `gate-veil-${i}`, material: material.custom(veilSpec(color, "gate")), castShadow: false }).runtime({ id: `gate-veil-${i}` }));
  });

  for (const n of gatePylonNodes(track, (fr) => droneEuler(fr, 0, 0, 0), models)) b.add(n);

  /* boost pads */
  track.boostPads.forEach((p, i) => {
    b.add(geometry.custom(dynamicFrom(padQuad(track, p.s, p.x)), { name: `pad-${i}`, material: material.custom(veilSpec([1, 0.62, 0.15], "pad")), castShadow: false }).runtime({ id: `pad-${i}` }));
  });

  /* pickups and barrels */
  track.pickups.forEach((p, i) => {
    const shield = p.kind === "shield";
    b.add(pickupModel(i, shield, models).runtime({ id: fogTracked(`pickup-${i}`, `pickup-${i}`) }));
  });
  track.barrels.forEach((_, i) => {
    b.add(barrelModel(i, models).runtime({ id: fogTracked(`barrel-${i}`, `barrel-${i}`) }));
  });

  /*
   * strike targets (HP-17): a sentry is a glowing sphere in one spinning ring; a heavy is an armoured cube core in two
   * crossed rings, so the two read apart by shape, not only by colour. Every target also carries a health ring that
   * shrinks with its remaining hit points.
   */
  const strike = new Operation(track);
  for (const t of strike.targets) {
    const heavy = t.kind === "heavy";
    const r = STRIKE.radius[t.kind];
    const core = material.custom(solidSpec(hexLinear(heavy ? "#5a1414" : "#c82828"), hexLinear("#ff5a3a"), heavy ? 1.6 : 2.2));
    b.add((heavy
      ? primitives.box({ name: `target-${t.id}`, size: [r * 1.35, r * 1.35, r * 1.35], material: core, castShadow: false })
      : primitives.sphere({ name: `target-${t.id}`, size: r * 2.1, material: core, castShadow: false })).runtime({ id: `target-${t.id}` }));
    b.add(primitives.torus({ name: `target-ring-${t.id}`, size: [r * 1.9, 0.22, 0.22], material: material.custom(solidSpec(hexLinear("#2a1010"), hexLinear(heavy ? "#ff7a3a" : "#ffb347"), 2.6)), castShadow: false }).runtime({ id: `target-ring-${t.id}` }));
    if (heavy) b.add(primitives.torus({ name: `target-ring2-${t.id}`, size: [r * 1.75, 0.3, 0.3], material: material.custom(solidSpec(hexLinear("#2a1010"), hexLinear("#ff7a3a"), 2.6)), castShadow: false }).runtime({ id: `target-ring2-${t.id}` }));
    b.add(primitives.torus({ name: `target-hp-${t.id}`, size: [r * 1.3, 0.12, 0.12], material: material.custom(solidSpec(hexLinear("#0e2a16"), hexLinear("#6dffb0"), 2.4)), castShadow: false }).runtime({ id: `target-hp-${t.id}` }));
  }

  /* bolt tracers: a pooled strip of camera-facing quads, rebuilt every frame */
  {
    const uv: number[] = [], idx: number[] = [];
    for (let k = 0; k < BOLTS; k++) { uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); }
    b.add(geometry.custom(geometry.dynamic({ positions: f32(new Array<number>(BOLTS * 12).fill(0)), uvs: f32(uv), indices: Uint32Array.from(idx), bounds: courseBounds }), { name: "bolts", material: material.custom(streakSpec()) }).runtime({ id: "bolts" }));
  }

  /* the drone's contact shadow on the road (HP-08): a quad rebuilt under the drone every frame */
  b.add(geometry.custom(geometry.dynamic({ positions: f32(new Array<number>(12).fill(0)), uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), bounds: courseBounds }), { name: "drone-blob", material: material.custom(blobSpec()), castShadow: false }).runtime({ id: "drone-blob" }));

  /* player drone */
  for (const part of DRONE_PARTS) {
    if (part.model) { b.add(droneHull(models, look.key.droneCasts).runtime({ id: fogTracked(part.id, part.id) })); continue; }
    const extra = part.additive ? { transparent: true, blending: "additive" as const, depthWrite: false } : {};
    const mat = material.custom(solidSpec(hexLinear(part.base), hexLinear(part.glow), part.glowAmt, extra));
    const handle = part.prim === "box"
      ? primitives.box({ name: part.id, size: part.size as [number, number, number], material: mat })
      : part.prim === "cyl"
        ? primitives.cylinder({ name: part.id, size: part.size as [number, number, number], material: mat })
        : primitives.sphere({ name: part.id, size: part.size as number, material: mat });
    b.add(handle.runtime({ id: fogTracked(part.id, part.id) }));
  }

  /* speed streaks: a dynamic strip of camera-facing quads, rebuilt every frame */
  {
    const uv: number[] = [], idx: number[] = [];
    for (let k = 0; k < STREAKS; k++) { uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); }
    b.add(geometry.custom(geometry.dynamic({ positions: f32(new Array<number>(STREAKS * 12).fill(0)), uvs: f32(uv), indices: Uint32Array.from(idx), bounds: courseBounds }), { name: "streaks", material: material.custom(streakSpec()) }).runtime({ id: "streaks" }));
  }

  /* exhaust / dust points */
  const POINTS = 420;
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array<number>(POINTS * 3).fill(0)),
    topology: "points",
    bounds: courseBounds,
    attributes: {
      size: { itemSize: 1, data: f32(new Array<number>(POINTS).fill(0)) },
      tint: { itemSize: 3, data: f32(new Array<number>(POINTS * 3).fill(1)) },
      fade: { itemSize: 1, data: f32(new Array<number>(POINTS).fill(0)) }
    }
  }), { name: "exhaust", material: material.custom(pointsSpec()) }).runtime({ id: "exhaust" }));

  /* IC-18 ion wake: one dynamic strip (+1 draw), rebuilt every frame from the drone's last 1.2 s; twilight look only */
  if (look.wake.enabled) {
    const wake = createIonWake(look);
    b.add(geometry.custom(geometry.dynamic({
      positions: f32(new Array<number>(wake.positions.length).fill(0)),
      uvs: wake.uvs,
      indices: wake.indices,
      bounds: courseBounds,
      attributes: { wakeColor: { itemSize: 3, data: f32(new Array<number>(wake.colors.length).fill(0)) }, wakeAlpha: { itemSize: 1, data: f32(new Array<number>(wake.alpha.length).fill(0)) } }
    }), { name: "ion-wake", material: material.custom(wakeSpec()), castShadow: false }).runtime({ id: "ion-wake" }));
  }

  /* IC-20: slow bioluminescent spores in a camera-following 60 m box (one points draw, +1); twilight only, 120 on Low */
  if (look.dressing.spores > 0) {
    const n = look.dressing.spores;
    b.add(geometry.custom(geometry.dynamic({
      positions: f32(new Array<number>(n * 3).fill(0)),
      topology: "points",
      bounds: courseBounds,
      attributes: {
        size: { itemSize: 1, data: f32(new Array<number>(n).fill(0)) },
        tint: { itemSize: 3, data: f32(new Array<number>(n * 3).fill(1)) },
        fade: { itemSize: 1, data: f32(new Array<number>(n).fill(0)) }
      }
    }), { name: "spores", material: material.custom(pointsSpec()) }).runtime({ id: "spores" }));
  }

  /* HP-19: no deprecated `radius`; threshold at HDR white and intensity under the noise-risk line */
  b.add(effects.bloom({ name: "bloom", intensity: look.bloom.intensity, threshold: look.bloom.threshold }));
  /* IC-09: the twilight row adds the E-C split tone; the original row authors exactly today's three fields */
  const g = look.grade;
  const split = g.temperature !== 0 || g.tint !== 0 || g.shadows !== 1 || g.highlights !== 1;
  b.add(effects.colorGrade({ name: "grade", exposure: g.exposure, contrast: g.contrast, saturation: g.saturation, ...(split ? { temperature: g.temperature, tint: g.tint, shadows: [...(typeof g.shadows === "number" ? [g.shadows, g.shadows, g.shadows] : g.shadows)] as [number, number, number], highlights: [...(typeof g.highlights === "number" ? [g.highlights, g.highlights, g.highlights] : g.highlights)] as [number, number, number] } : {}) }));
  /* IC-08 / IC-07: the twilight post stack; Low drops AO, motion blur, god rays, grain and CA (lowTier); original mounts none */
  if (look.post.vignette !== null) b.add(effects.vignette({ name: "vignette", intensity: look.post.vignette }));
  else b.add(effects.vignette({ name: "vignette" }));
  if (look.post.ao) b.add(effects.ambientOcclusion({ name: "gtao", intensity: 0.8, radius: 1.6 }));
  if (look.post.motionBlur !== null) b.add(effects.motionBlur({ name: "motion blur", intensity: look.post.motionBlur, samples: 8 }));
  if (look.post.chromaticAberration !== null) b.add(effects.chromaticAberration({ name: "chromatic aberration", intensity: look.post.chromaticAberration }));
  if (look.post.grain !== null) b.add(effects.filmGrain({ name: "film grain", intensity: look.post.grain }));
  if (look.post.godRays !== null) b.add(effects.volumetricFog({ name: "god rays", density: 0.08, intensity: look.post.godRays, color: "#ffb7a0", godRayDensity: look.post.godRays }));

  /* IC-07 sun lens flare, kept on the shader sun's direction from the eye each frame (twilight High only; frustum occlusion) */
  if (look.post.lensFlare !== null) {
    b.add(lights.lensFlare({ name: "sun-flare", position: [...SUN_FLARE_OFFSET], intensity: look.post.lensFlare, edgeFade: 0.25, runtime: { id: "sun-flare" }, elements: [
      { size: 380, distance: 0, color: "#ffb07a" }, { size: 60, distance: 0.45, color: "#ff5ab4" }, { size: 90, distance: 0.7, color: "#9f8cff" }, { size: 40, distance: 1, color: "#40e0ff" }
    ] }));
  }

  return { scene: b, track, look, bind: (app) => bindRuntime(app, track, POINTS, look) };
}

/** IC-07: the flare source sits this far along the shader sun from the eye (inside the 4200 m far plane) */
const SUN_FLARE_DISTANCE = 2000;
const SUN_FLARE_OFFSET = ((): [number, number, number] => {
  const l = Math.hypot(SHADER_SUN_DIR[0], SHADER_SUN_DIR[1], SHADER_SUN_DIR[2]);
  return [SHADER_SUN_DIR[0] / l * SUN_FLARE_DISTANCE, SHADER_SUN_DIR[1] / l * SUN_FLARE_DISTANCE, SHADER_SUN_DIR[2] / l * SUN_FLARE_DISTANCE];
})();

/** linear rgb to an sRGB hex string (for `setLight`) */
function rgbHex(c: readonly [number, number, number]): string {
  const enc = (v: number): number => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
  return `#${((1 << 24) | (enc(c[0]) << 16) | (enc(c[1]) << 8) | enc(c[2])).toString(16).slice(1)}`;
}

function bindRuntime(app: AuraApp, track: Track, points: number, row: HeatsinkLookRow): WorldRuntime {
  const twilight = row.wake.enabled;
  if (twilight) { try { if (app.effects) registerHeatsinkVfx(app as { effects: NonNullable<AuraApp["effects"]> }); } catch { /* effects runtime unavailable: the game's own points still burst */ } }
  const wake = twilight ? createIonWake(row) : null;
  const spores = row.dressing.spores > 0 ? createSporeField(row.dressing.spores) : null;
  const fogNow: [number, number, number] = [...row.fog.color];
  let fogReady = false;
  const glowNow: [number, number, number] = [0.376, 0.957, 1];
  const fogValue = [0, 0, 0];
  /* IC-02 glow pools: the 4 emitters nearest the drone, written into every lit() node's poolPos / poolCol */
  const emitters = row.glow.pools > 0 ? glowEmitters(track) : [];
  const pools = createPoolUniforms();
  let poolSlot0 = -2;
  let droneGlowHot = -1;
  const engineBurst = (kind: string, x: number, y: number, z: number, scale = 1): void => {
    if (!twilight) return;
    try { app.effects?.burst(kind, [x, y, z], { camera: false, scale: scale * vfxScale(motion.reduced) }); } catch { /* runtime effects off */ }
  };
  const cam = app.camera;
  if (!cam) throw new Error("heatsink-port: the app exposes no camera controller");
  const cameraController: NonNullable<typeof cam> = cam;
  const chase = cameras.chase();
  const shake = createCameraShake({ maxOffset: 0.55, maxRoll: 0.02 });
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => {
    let h = handles.get(id);
    if (!h) handles.set(id, h = app.nodes.require(id));
    return h;
  };
  const gatePulse = track.checkpoints.map(() => 0);
  const targetFlash = new Array<number>(STRIKE.perLap).fill(0);
  const boltGeo = new Float32Array(BOLTS * 12);
  let opsSeen = 0;
  const padPulse = track.boostPads.map(() => 0);
  let seen = 0;
  const pos = new Float32Array(points * 3);
  const size = new Float32Array(points);
  const fade = new Float32Array(points);
  const tint = new Float32Array(points * 3);
  const age = new Float32Array(points).fill(1);
  const scale = new Float32Array(points).fill(1);
  const vel = new Float32Array(points * 3);
  let head = 0;
  let budget = 0;
  const rng = seededRandom(4242);
  const sPos = new Float32Array(STREAKS * 3);
  const sLen = new Float32Array(STREAKS);
  const sGeo = new Float32Array(STREAKS * 12);
  let streaksReady = false;
  /* chase-camera heading (x, z); rigReady false means snap on the next update */
  const rig = [0, 0];
  let rigReady = false;
  const frame: Partial<Frame> = {};
  const scratchFrame: Partial<Frame> = {};
  const scratchWorld = { x: 0, y: 0, z: 0 };
  const eye = [0, 0, 0] as [number, number, number];
  const look = [0, 0, 0] as [number, number, number];
  const chaseIn = { wantEye: eye, wantLook: look, fovTarget: 0 };
  const blobGeo = new Float32Array(12);
  let motion: MotionSettings = { reduced: false };
  let rollNow = 0;
  let finishedFor = 0;
  let vigEnv = 0;
  let heatShown = 0;
  let chaseShown = -1;
  let vigShown = -1;

  function burst(x: number, y: number, z: number, count: number, r: number, g: number, bl: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const k = head++ % points;
      const a = rng() * Math.PI * 2, e = (rng() - 0.3) * 1.4;
      const sp = speed * (0.35 + rng() * 0.65);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      vel[k * 3] = Math.cos(a) * Math.cos(e) * sp; vel[k * 3 + 1] = Math.sin(e) * sp; vel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      tint[k * 3] = r; tint[k * 3 + 1] = g; tint[k * 3 + 2] = bl;
      age[k] = 0;
      scale[k] = 2.4;
    }
  }

  /*
   * GU47 phase 3: before the first sim step the drone's visual position is still (0, 0, 0) (`Vehicle.updateVisual` runs
   * only inside `race.frame`), so the menu backdrop drew the drone and the chase camera at the world origin, under a
   * gantry arch beside a centre dash, not on the grid. The twilight look draws the menu from the grid slot instead; a
   * read-only view, the sim's own player is untouched (PRD D8). `?look=original` keeps the 4.6.2 menu frame.
   */
  const menuView = { player: null as Race["player"] | null, position: { x: 0, y: 0, z: 0 } };
  function menuPlayer(race: Race): Race["player"] {
    const p = race.player;
    if (!twilight || race.frames > 0) return p;
    const g = track.frame(p.s, scratchFrame);
    menuView.position.x = g.x + g.rx * p.x; menuView.position.y = p.yW; menuView.position.z = g.z + g.rz * p.x;
    if (!menuView.player || Object.getPrototypeOf(menuView.player) !== p) menuView.player = Object.create(p, { position: { value: menuView.position } }) as Race["player"];
    return menuView.player;
  }

  const rotationOf = (e: readonly [number, number, number]) => multiplyMat3(multiplyMat3(axisRotation("z", e[2]), axisRotation("y", e[1])), axisRotation("x", e[0]));

  function update(race: Race, hud: HudValues, dt: number, time: number, aspect: number): void {
    const p = menuPlayer(race);
    const fr = track.frame(p.s, frame);
    /* drone */
    const euler = droneEuler(fr, p.theta, p.pitch, p.lean);
    const R = rotationOf(euler);
    const heatGlow = Math.min(1, p.heat);
    for (const part of DRONE_PARTS) {
      const h = node(part.id);
      h.setVisible(!p.crashed);
      if (p.crashed) continue;
      const [ox, oy, oz] = part.offset;
      h.setPosition(
        p.position.x + R[0] * ox + R[1] * oy + R[2] * oz,
        p.position.y + R[3] * ox + R[4] * oy + R[5] * oz,
        p.position.z + R[6] * ox + R[7] * oy + R[8] * oz
      );
      const yawNow = (part.yaw ?? 0) + (part.spin ?? 0) * time;
      const local = yawNow || part.rollZ ? multiplyMat3(axisRotation("y", yawNow), axisRotation("z", part.rollZ ?? 0)) : null;
      const e = local ? matrixToEulerZYX(multiplyMat3(R, local)) : euler;
      h.setRotation(e[0], e[1], e[2]);
      if (part.model) {
        /* IC-12: heat glows on the hull in 8 steps (one setEmissive per step change, so no per-frame material churn) */
        const step = heatStep(row, heatGlow);
        if (step !== heatShown) { heatShown = step; const [hex, k] = HEAT_STEPS[step]!; try { (h as { materials?: { setEmissive(t: string, c: string, i: number): void } }).materials?.setEmissive("*", hex, k); } catch { /* materials runtime off */ } }
        continue;
      }
      h.setUniform?.("heat", heatGlow);
      h.setUniform?.("flash", p.invuln > 0 ? 0.5 + 0.5 * Math.sin(time * 30) : 0);
    }

    /* camera */
    const hd = Math.cos(p.theta), hs = Math.sin(p.theta);
    const dirX = fr.tx * hd + fr.rx * hs, dirZ = fr.tz * hd + fr.rz * hs;
    if (!rigReady) { rig[0] = dirX; rig[1] = dirZ; rigReady = true; }
    else {
      const k = 1 - Math.exp(-dt * 6);
      rig[0] = rig[0]! + (dirX - rig[0]!) * k;
      rig[1] = rig[1]! + (dirZ - rig[1]!) * k;
    }
    const rl = Math.hypot(rig[0]!, rig[1]!) || 1;
    const fx = rig[0]! / rl, fz = rig[1]! / rl;
    const c = CFG.camera;
    eye[0] = p.position.x - fx * FRAMING.dist; eye[1] = p.position.y + FRAMING.height; eye[2] = p.position.z - fz * FRAMING.dist;
    look[0] = p.position.x + fx * c.lookAhead; look[1] = p.position.y + 0.8; look[2] = p.position.z + fz * c.lookAhead;
    const speed01 = Math.min(1, p.v / CFG.vehicle.maxSpeed);
    const kick = (c.fovMax - c.fovBase) * speed01 * speed01 + (p.rjActive ? c.fovRamjet * 0.35 : 0) + afterburnerKick(row, p.abActive);
    const fovBase = c.fovBase + (motion.reduced ? Math.min(REDUCED_FOV_KICK, kick) : kick);
    chaseIn.fovTarget = Math.min(c.fovMax, aspect < 0.85 ? fovBase + 8 : fovBase);
    const pose = chase.step(chaseIn, dt);
    const sh = shake.update(dt);
    const shx = motion.reduced ? 0 : sh.x, shy = motion.reduced ? 0 : sh.y;
    /* IC-22 bank roll: the up vector tilts about the heading with the steer (±6 deg cap); none on reduced motion or ?look=original */
    const roll = motion.reduced ? 0 : bankRoll(row, p.steerVal, speed01);
    rollNow += (roll - rollNow) * (1 - Math.exp(-dt * 5));
    const up: [number, number, number] = [-fz * Math.sin(rollNow), Math.cos(rollNow), fx * Math.sin(rollNow)];
    /* IC-22 countdown sweep into the chase pose and the finish orbit (twilight, full motion, not manual) */
    finishedFor = race.state === "finished" ? finishedFor + dt : 0;
    const dEye: [number, number, number] = [0, 0, 0], dLook: [number, number, number] = [0, 0, 0];
    /* GU47 phase 2: before the countdown ticks (the menu) the camera holds the chase pose; the sweep runs once the countdown starts */
    const directorState = race.state === "countdown" && race.countdown >= SWEEP.seconds ? "menu" : race.state;
    directCamera(row, !motion.reduced && motion.cinematic !== false, { state: directorState, countdown: race.countdown, finishedFor, target: [p.position.x, p.position.y, p.position.z], eye: pose.eye, look: pose.look }, dEye, dLook);
    /* fresh arrays here on purpose: the controller keeps the override object by reference */
    cameraController.setPose({ position: [dEye[0] + fz * shx, dEye[1] + shy, dEye[2] - fx * shx], target: dLook, up, fov: pose.fov }, { cut: false });
    node("sky").setPosition(dEye[0], dEye[1], dEye[2]);
    if (row.post.lensFlare !== null) node("sun-flare").setPosition(dEye[0] + SUN_FLARE_OFFSET[0], dEye[1] + SUN_FLARE_OFFSET[1], dEye[2] + SUN_FLARE_OFFSET[2]);

    /* speed streaks radiate from the vanishing point: world-fixed lines along the heading, respawned ahead once passed */
    {
      let fdx = look[0] - eye[0], fdy = look[1] - eye[1], fdz = look[2] - eye[2];
      const fl = Math.hypot(fdx, fdy, fdz) || 1;
      fdx /= fl; fdy /= fl; fdz /= fl;
      let rx = fdz, rz = -fdx;
      const rlen = Math.hypot(rx, rz) || 1;
      rx /= rlen; rz /= rlen;
      // camera up = right x forward
      const upx = 0 * fdz - rz * fdy, upy = rz * fdx - rx * fdz, upz = rx * fdy - 0 * fdx;
      for (let k = 0; k < STREAKS; k++) {
        const dx = sPos[k * 3]! - eye[0], dy = sPos[k * 3 + 1]! - eye[1], dz = sPos[k * 3 + 2]! - eye[2];
        if (!streaksReady || dx * fdx + dy * fdy + dz * fdz < 4) {
          const depth = 28 + rng() * 80, ang = rng() * Math.PI * 2, rad = 2.6 + Math.pow(rng(), 0.7) * 15;
          sPos[k * 3] = eye[0] + fdx * depth + (rx * Math.cos(ang) + upx * Math.sin(ang) * 0.8) * rad;
          sPos[k * 3 + 1] = eye[1] + fdy * depth + (upy * Math.sin(ang) * 0.8) * rad;
          sPos[k * 3 + 2] = eye[2] + fdz * depth + (rz * Math.cos(ang) + upz * Math.sin(ang) * 0.8) * rad;
          sLen[k] = 10 + rng() * 24;
        }
        const px = sPos[k * 3]!, py = sPos[k * 3 + 1]!, pz = sPos[k * 3 + 2]!;
        const vx = px - eye[0], vy = py - eye[1], vz = pz - eye[2];
        // width axis: perpendicular to both the streak direction and the view ray, so the quad always faces the camera
        let wx = fdy * vz - fdz * vy, wy = fdz * vx - fdx * vz, wz = fdx * vy - fdy * vx;
        const wl = Math.hypot(wx, wy, wz) || 1;
        const depthNow = Math.max(4, vx * fdx + vy * fdy + vz * fdz);
        const half = (0.0024 * depthNow + 0.05) / wl;
        wx *= half; wy *= half; wz *= half;
        const ex = px + fdx * sLen[k]!, ey = py + fdy * sLen[k]!, ez = pz + fdz * sLen[k]!;
        const o = k * 12;
        sGeo[o] = px - wx; sGeo[o + 1] = py - wy; sGeo[o + 2] = pz - wz;
        sGeo[o + 3] = px + wx; sGeo[o + 4] = py + wy; sGeo[o + 5] = pz + wz;
        sGeo[o + 6] = ex + wx; sGeo[o + 7] = ey + wy; sGeo[o + 8] = ez + wz;
        sGeo[o + 9] = ex - wx; sGeo[o + 10] = ey - wy; sGeo[o + 11] = ez - wz;
      }
      streaksReady = true;
      const sn = node("streaks");
      sn.updateAttribute?.("position", { array: sGeo, offset: 0 });
      sn.setUniform?.("streakAlpha", (0.15 + 1.5 * Math.min(1, Math.max(0, (p.v - 30) / 80))) * (motion.reduced ? 0.5 : 1));
    }

    /* checkpoint, pad pulses from the sim's events */
    for (; seen < race.events.length; seen++) {
      const e = race.events[seen]!;
      if (e.type === "checkpoint") { const i = track.checkpoints.indexOf(e.detail as number); if (i >= 0) gatePulse[i] = 1; engineBurst(HEATSINK_VFX.checkpoint, p.position.x, p.position.y + 1, p.position.z); }
      if (e.type === "boostPad") { const i = track.boostPads.findIndex((q) => q.s === e.detail); if (i >= 0) padPulse[i] = 1; engineBurst(HEATSINK_VFX.boost, p.position.x, p.position.y, p.position.z); }
    }
    if (seen > race.events.length) seen = race.events.length;
    for (let i = 0; i < gatePulse.length; i++) { gatePulse[i] = Math.max(0, gatePulse[i]! - dt * 0.8); node(`gate-veil-${i}`).setUniform?.("veilPulse", gatePulse[i]!); }
    for (let i = 0; i < padPulse.length; i++) { padPulse[i] = Math.max(0, padPulse[i]! - dt * 1.2); node(`pad-${i}`).setUniform?.("veilPulse", padPulse[i]!); }

    /* pickups and barrels (positions written into one scratch object: no per-frame allocation, HP-18) */
    for (let i = 0; i < race.pickups.length; i++) {
      const pk = race.pickups[i]!;
      const h = node(`pickup-${i}`);
      h.setVisible(pk.respawn <= 0);
      if (pk.respawn > 0) continue;
      const w = track.toWorld(pk.s, pk.x, track.frame(pk.s, scratchFrame).y + 1.6 + Math.sin(time * 2 + i) * 0.25, scratchWorld);
      h.setPosition(w.x, w.y, w.z);
      h.setRotation(0, time * 1.6 + i, 0);
      /* IC-21 pickup pulse (twilight, full motion) */
      if (row.dressing.archChase && !motion.reduced) h.setScale(1 + 0.08 * Math.sin(time * 4 + i));
    }
    for (let i = 0; i < race.barrels.length; i++) {
      const bar = race.barrels[i]!;
      const h = node(`barrel-${i}`);
      h.setVisible(bar.alive);
      if (!bar.alive) continue;
      const w = track.toWorld(bar.s, bar.x, bar.y + 1.1, scratchWorld);
      h.setPosition(w.x, w.y, w.z);
    }

    /* contact shadow: on the road under the drone, wider and fainter the higher it hovers (HP-08) */
    {
      const blob = node("drone-blob");
      const ground = fr.y + track.latY(p.s, p.x);
      const gap = Math.max(0, p.position.y - ground);
      blob.setVisible(!p.crashed && gap < 40);
      if (!p.crashed && gap < 40) {
        const half = 2.1 + gap * 0.12;
        const fade = Math.max(0, Math.min(1, 1 - (gap - CFG.vehicle.hover) / 14));
        const sx = fr.tx, sz = fr.tz, rx = fr.rx, rz = fr.rz;
        let o = 0;
        for (const [a, l] of BLOB_CORNERS) {
          const lat = p.x + l * half;
          const cx = p.position.x + sx * a * half * 1.3 + rx * l * half;
          const cz = p.position.z + sz * a * half * 1.3 + rz * l * half;
          blobGeo[o++] = cx; blobGeo[o++] = fr.y + track.latY(p.s, lat) + 0.12; blobGeo[o++] = cz;
        }
        blob.updateAttribute?.("position", { array: blobGeo, offset: 0 });
        blob.setUniform?.("blobAlpha", 0.6 * (0.25 + 0.75 * fade));
      }
    }

    /* strike targets, bolt tracers, hit flashes and bursts */
    {
      const ops = race.ops;
      if (opsSeen > ops.events.length) opsSeen = 0;
      for (; opsSeen < ops.events.length; opsSeen++) {
        const ev = ops.events[opsSeen]!;
        if (!ev.world) continue;
        if (ev.type === "hit") { targetFlash[ev.detail as number] = 1; burst(ev.world.x, ev.world.y, ev.world.z, 6, 1, 0.9, 0.4, 9); engineBurst(HEATSINK_VFX.hit, ev.world.x, ev.world.y, ev.world.z); }
        else if (ev.type === "kill") { if (!motion.reduced) shake.add(0.45); burst(ev.world.x, ev.world.y, ev.world.z, 36, 1, 0.45, 0.12, 22); engineBurst(HEATSINK_VFX.kill, ev.world.x, ev.world.y, ev.world.z); }
        else if (ev.type === "barrel") { if (!motion.reduced) shake.add(0.8); burst(ev.world.x, ev.world.y, ev.world.z, 60, 1, 0.6, 0.15, 30); engineBurst(HEATSINK_VFX.barrel, ev.world.x, ev.world.y, ev.world.z); }
      }
      for (const t of ops.targets) {
        const core = node(`target-${t.id}`), ring = node(`target-ring-${t.id}`), hp = node(`target-hp-${t.id}`);
        const ring2 = t.kind === "heavy" ? node(`target-ring2-${t.id}`) : null;
        core.setVisible(t.alive);
        ring.setVisible(t.alive);
        ring2?.setVisible(t.alive);
        /* the health ring shows only once the target is damaged, shrinking with its hit points */
        const damaged = t.alive && t.hp < t.maxHp;
        hp.setVisible(damaged);
        targetFlash[t.id] = Math.max(0, (targetFlash[t.id] ?? 0) - dt * 4);
        if (!t.alive) continue;
        const bob = Math.sin(time * 1.7 + t.id) * 0.35;
        core.setPosition(t.world.x, t.world.y + bob, t.world.z);
        core.setUniform?.("flash", targetFlash[t.id] ?? 0);
        if (t.kind === "heavy") core.setRotation(time * 0.7 + t.id, Math.PI / 4 + time * 0.5, Math.PI / 4);
        ring.setPosition(t.world.x, t.world.y + bob, t.world.z);
        ring.setRotation(Math.PI / 2 + Math.sin(time + t.id) * 0.3, time * 2.2 + t.id, 0);
        if (ring2) {
          ring2.setPosition(t.world.x, t.world.y + bob, t.world.z);
          ring2.setRotation(Math.sin(time * 0.8 + t.id) * 0.3, -time * 1.6 - t.id, Math.PI / 2);
        }
        if (damaged) {
          hp.setPosition(t.world.x, t.world.y + bob + STRIKE.radius[t.kind] * 1.25, t.world.z);
          hp.setRotation(Math.PI / 2, 0, 0);
          hp.setScale(Math.max(0.15, t.hp / t.maxHp));
        }
      }
      for (let k = 0; k < BOLTS; k++) {
        const bolt = ops.bolts[k]!;
        const o = k * 12;
        if (!bolt.alive) { boltGeo.fill(0, o, o + 12); continue; }
        const vx = bolt.x - dEye[0], vy = bolt.y - dEye[1], vz = bolt.z - dEye[2];
        let wx = bolt.dy * vz - bolt.dz * vy, wy = bolt.dz * vx - bolt.dx * vz, wz = bolt.dx * vy - bolt.dy * vx;
        const wl = Math.hypot(wx, wy, wz) || 1;
        wx = (wx / wl) * BOLT_HALF_WIDTH; wy = (wy / wl) * BOLT_HALF_WIDTH; wz = (wz / wl) * BOLT_HALF_WIDTH;
        const ex = bolt.x + bolt.dx * BOLT_LENGTH, ey = bolt.y + bolt.dy * BOLT_LENGTH, ez = bolt.z + bolt.dz * BOLT_LENGTH;
        boltGeo[o] = bolt.x - wx; boltGeo[o + 1] = bolt.y - wy; boltGeo[o + 2] = bolt.z - wz;
        boltGeo[o + 3] = bolt.x + wx; boltGeo[o + 4] = bolt.y + wy; boltGeo[o + 5] = bolt.z + wz;
        boltGeo[o + 6] = ex + wx; boltGeo[o + 7] = ey + wy; boltGeo[o + 8] = ez + wz;
        boltGeo[o + 9] = ex - wx; boltGeo[o + 10] = ey - wy; boltGeo[o + 11] = ez - wz;
      }
      const bn = node("bolts");
      bn.updateAttribute?.("position", { array: boltGeo, offset: 0 });
      bn.setUniform?.("streakAlpha", 1.6);
    }

    /* IC-06 district atmosphere: fog drifts 30% toward the district HUD colour over ~120 m; rail posts take its neon */
    if (row.fog.districtMix > 0) {
      const target = districtFog(row, fr.sec.hud.color);
      const k = fogReady ? fogApproach(row, Math.abs(p.v) * dt) : 1;
      fogReady = true;
      for (let c = 0; c < 3; c++) fogNow[c] = fogNow[c]! + (target[c]! - fogNow[c]!) * k;
      fogValue[0] = fogNow[0]; fogValue[1] = fogNow[1]; fogValue[2] = fogNow[2];
      for (const id of DISTRICT_FOG_NODES) node(id).setUniform?.("fogColor", fogValue);
      if (row.dressing.beacons) node("beacons").setUniform?.("fogColor", fogValue);
      const hud = hexLinear(fr.sec.hud.color);
      for (let c = 0; c < 3; c++) glowNow[c] = glowNow[c]! + ((0.5 * hud[c]! + 0.5 * [0.376, 0.957, 1][c]!) - glowNow[c]!) * k;
      node("rail-posts").setUniform?.("glowColor", glowNow);
      /* IC-10: the causeway's ion pulse runs at the drone's speed */
      node("road").setUniform?.("ionSpeed", motion.reduced ? 0 : p.v);
    }

    /* IC-21 arch light chase (twilight, off on reduced motion): written only when it changes */
    if (row.dressing.archChase) {
      const ch = motion.reduced ? 0 : 1;
      if (ch !== chaseShown) { chaseShown = ch; node("arch-neon").setUniform?.("chase", ch); }
    }

    /* IC-08 afterburner vignette pulse (none on reduced motion or ?look=original); written only when it changes */
    if (row.post.vignette !== null) {
      vigEnv = vignettePulse(row, motion.reduced, p.abActive && !p.crashed, vigEnv, dt);
      const v = Math.round((row.post.vignette + VIGNETTE_PULSE.gain * vigEnv) * 200) / 200;
      if (v !== vigShown) { vigShown = v; try { app.post?.setEffect("vignette", { intensity: v }); } catch { /* post runtime unavailable */ } }
    }

    /* IC-02 glow pools (+0 draws) and the two moving points */
    if (emitters.length > 0) {
      const pulseGain = motion.reduced ? 0.5 : 1;
      nearestPools(emitters, p.position.x, p.position.z, pools, row.glow.pools, (kind, i) => (kind === "pad" ? padPulse[i]! : gatePulse[i]!) * pulseGain);
      for (const id of DISTRICT_FOG_NODES) { const h = node(id); h.setUniform?.("poolPos", pools.pos); h.setUniform?.("poolCol", pools.col); }
      if (row.dressing.beacons) { const h = node("beacons"); h.setUniform?.("poolPos", pools.pos); h.setUniform?.("poolCol", pools.col); }
      if (row.glow.points > 0) {
        const dg = node("drone-glow");
        dg.setVisible(!p.crashed);
        dg.setPosition(p.position.x - fx * 2.6, p.position.y - 0.2, p.position.z - fz * 2.6);
        const hot = p.abActive || p.burstT > 0 ? 1 : 0;
        if (hot !== droneGlowHot) { droneGlowHot = hot; dg.setLight?.({ color: hot ? "#ffb02e" : "#40e0ff", intensity: hot ? 9 : 6 }); }
      }
      if (row.glow.points > 1) {
        const first = pools.slot[0]!;
        if (first !== poolSlot0) {
          poolSlot0 = first;
          const e = first >= 0 ? emitters[first]! : null;
          const pg = node("pool-glow");
          pg.setVisible(e !== null);
          if (e) { pg.setPosition(e.x, e.y + 1.5, e.z); pg.setLight?.({ color: rgbHex(e.color) }); }
        }
      }
    }

    /* IC-18 ion wake: cyan to violet at cruise, amber under the afterburner (and the drift burst) */
    if (wake) {
      if (!p.crashed) wake.push({ t: time, x: p.position.x - fx * 2.2, y: p.position.y + 0.15, z: p.position.z - fz * 2.2 });
      else wake.clear();
      wake.build(time, dEye, p.v, p.abActive || p.burstT > 0 ? 1 : 0, p.crashed ? 0 : 1);
      const wn = node("ion-wake");
      wn.updateAttribute?.("position", { array: wake.positions, offset: 0 });
      wn.updateAttribute?.("wakeColor", { array: wake.colors, offset: 0 });
      wn.updateAttribute?.("wakeAlpha", { array: wake.alpha, offset: 0 });
    }

    /* IC-20 spores: positions are a pure function of the seed, time and eye (wrapped into the box); reduced motion shows half */
    if (spores) {
      const live = motion.reduced ? Math.floor(spores.n / 2) : spores.n;
      sporeField(spores, time, dEye, live);
      const sn = node("spores");
      sn.updateAttribute?.("position", { array: spores.pos, offset: 0 });
      sn.updateAttribute?.("fade", { array: spores.fade, offset: 0 });
      if (!spores.tinted) {
        sn.updateAttribute?.("size", { array: spores.size, offset: 0 });
        sn.updateAttribute?.("tint", { array: spores.tint, offset: 0 });
        spores.tinted = true;
      }
    }

    /* exhaust */
    if (!p.crashed && p.v > 4) {
      budget += Math.min(0.1, dt) * (p.abActive ? 520 : 90 + p.v * 1.4);
      let spawned = 0;
      while (budget >= 1 && spawned < 14) {
        budget -= 1;
        spawned++;
        const k = head++ % points;
        const back = 2.9 + rng() * 0.4;
        pos[k * 3] = p.position.x - fx * back + (rng() - 0.5) * 0.9;
        pos[k * 3 + 1] = p.position.y + (rng() - 0.5) * 0.5;
        pos[k * 3 + 2] = p.position.z - fz * back + (rng() - 0.5) * 0.9;
        vel[k * 3] = -fx * 4; vel[k * 3 + 1] = 0.4; vel[k * 3 + 2] = -fz * 4;
        const t = p.abActive || p.burstT > 0 ? [1, 0.55, 0.15] : [0.25, 0.8, 1];
        tint[k * 3] = t[0]!; tint[k * 3 + 1] = t[1]!; tint[k * 3 + 2] = t[2]!;
        age[k] = 0;
        scale[k] = 1;
      }
    }
    for (let k = 0; k < points; k++) {
      age[k]! += dt / 0.5;
      const alive = age[k]! < 1;
      pos[k * 3]! += vel[k * 3]! * dt; pos[k * 3 + 1]! += vel[k * 3 + 1]! * dt; pos[k * 3 + 2]! += vel[k * 3 + 2]! * dt;
      size[k] = alive ? 7 * scale[k]! * (1 - age[k]! * 0.5) : 0;
      fade[k] = alive ? (1 - age[k]!) * 0.8 : 0;
    }
    const ex = node("exhaust");
    ex.updateAttribute?.("position", { array: pos, offset: 0 });
    ex.updateAttribute?.("size", { array: size, offset: 0 });
    ex.updateAttribute?.("fade", { array: fade, offset: 0 });
    ex.updateAttribute?.("tint", { array: tint, offset: 0 });
    void hud;
  }

  function resetCamera(): void {
    rigReady = false;
    rollNow = 0;
    finishedFor = 0;
    vigEnv = 0;
    vigShown = -1;
    heatShown = -1;
    chaseShown = -1;
    fogReady = false;
    poolSlot0 = -2;
    droneGlowHot = -1;
    wake?.clear();
    if (spores) spores.tinted = false;
    seen = 0;
    opsSeen = 0;
    head = 0;
    budget = 0;
    streaksReady = false;
    pos.fill(0); vel.fill(0); size.fill(0); fade.fill(0); tint.fill(1); age.fill(1); scale.fill(1);
    sPos.fill(0); sLen.fill(0); sGeo.fill(0); boltGeo.fill(0); blobGeo.fill(0);
    gatePulse.fill(0); padPulse.fill(0); targetFlash.fill(0);
  }

  return { update, resetCamera, setMotion(m) { motion = m; }, get nodeCount() { return handles.size; } };
}
