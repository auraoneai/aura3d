/**
 * Strange Orbit world on the public `@aura3d/engine` surface only: the painted
 * track ribbon (`geometry.dynamic` + author attributes + `material.custom`), opal
 * islands, ramps, loops, checkpoint veils, crystals, meteors, stardust and star
 * points (`topology: "points"`), six riders and the chase camera. Visual assets
 * the original fetched as remote GLB/PNG files are re-created procedurally.
 */
import { camera, defineAuraAssets, effects, environments, geometry, instances, lights, material, model, primitives, scene, type AuraApp } from "@aura3d/engine";
import {
  COURSE_LENGTH,
  GATES,
  RESONANCE_GATES,
  RIDERS,
  SKATE_LOOPS,
  collectibles,
  groundHeight,
  islandHeight,
  meteorLane,
  rampHeightAt,
  trackLane,
  type Route,
  type Vehicle
} from "./course";
import { buildCourse, buildIslands, buildLoops, buildRamps, veilQuad, type MeshData } from "./meshes";
import { axisRotation, basisMatrix, matrixToEulerZYX, multiplyMat3, type Mat3 } from "./orient";
import { MESHY, MESHY_ENABLED, MESHY_SIZE } from "./models";
import { dressingPlan, lehmer } from "./obstacles";
import { hexLinear } from "./palette";
import { loopFrame, type RaceState } from "./race";
import type { GhostPose } from "./progress";
import { atmosphereSpec, mineralSpec, pointsSpec, skySpec, solidSpec, trackSpec, veilSpec, type SolidExtra } from "./materials";
import { CONTACT_STRENGTH, CONTACT_UNIFORMS } from "./shaders";
import { mainFrame, routeFrame, surfaceNoise } from "./track";
import { Vec3 } from "./vec3";
import { LOOKS, SECTOR_LERP_SECONDS, type OrbitLook } from "./art/look";
import { RIM, RIM_UNIT, buildCraterRim, rimScatter } from "./art/craterRim";
import { countdownShot, createCameraFeel, createPostDirector, createSectorDirector, resultsOrbitAngle, type PostFrame } from "./art/director";
import { ORBIT_VFX_COLORS, orbitVfxFor, registerOrbitVfx } from "./art/vfx";

export { lehmer };

type Rgb = readonly [number, number, number];
type Scene = ReturnType<typeof scene>;

export interface WorldOptions {
  readonly vehicle: Vehicle;
  readonly rider: number;
  readonly quality: "high" | "low";
  /** Time trial: add a translucent ghost rider for the saved best run (SO-E3). */
  readonly ghost?: boolean;
  /** `prefers-reduced-motion`: damp the zero-G spin and bank (SO-E2). */
  readonly reducedMotion?: boolean;
  /** GU47 look variant (`?look=original` keeps the 4.6.1 look); default gouache. */
  readonly look?: OrbitLook;
}

/** Seconds and metres of the rebound after a zero-G crash, so the rider never rests inside the scenery it hit (SO-E5). */
export const IMPACT_REBOUND = { seconds: 0.2, metres: 0.6 } as const;
/** Zero-G spin and bank are scaled by this under reduced motion. */
export const REDUCED_MOTION_SPIN = 0.25;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

/** Licensed catalog rock (diamondRock, 1.1 MB), bundled with the example so the built site serves it. */
const ROCK_ASSET = defineAuraAssets({
  moonRock: {
    type: "model",
    format: "glb",
    url: new URL("./assets/moon-rock.glb", import.meta.url).href,
    sha256: "debb9bb132ab6338b9df8b7129315f097f19dc7e5b4b65351b0c09ed5feb67e9",
    sizeBytes: 1142612,
    metadata: {
      license: "Aura3D catalog (diamondRock.af699d5e), licensed for use with the engine",
      provenance: { sourcePath: "public/aura-assets/diamondRock.af699d5e.glb" }
    }
  }
}).moonRock;

function dynamicFrom(m: MeshData, withPigments: boolean) {
  const attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {};
  if (withPigments) {
    attributes.pigmentBase = { itemSize: 3, data: f32(m.pigmentBase) };
    attributes.pigmentVein = { itemSize: 3, data: f32(m.pigmentVein) };
    attributes.pigmentChalk = { itemSize: 3, data: f32(m.pigmentChalk) };
    attributes.paintOriginal = { itemSize: 1, data: f32(m.paintOriginal) };
  }
  return geometry.dynamic({
    positions: f32(m.positions),
    normals: f32(m.normals),
    uvs: f32(m.uvs),
    indices: Uint32Array.from(m.indices),
    attributes
  });
}

/** The look `buildWorld` is building (set once at its start; the material helpers below bake the matching shader variant). */
let activeLook: OrbitLook = "gouache";
const trackMaterial = () => material.custom(trackSpec(activeLook));
const solidMaterial = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0, banding = 0, extra: SolidExtra = {}) => material.custom(solidSpec(base, glow, glowAmount, banding, extra, activeLook));
const mineralMaterial = (base: Rgb, opal: boolean) => material.custom(mineralSpec(base, opal, activeLook));
const pointsMaterial = (additive: boolean) => material.custom(pointsSpec(additive));

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number): number => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(f(0)), lin(f(8)), lin(f(4))];
}

function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, "0"));
  return `#${out.join("")}`;
}

const euler = (m: Mat3): [number, number, number] => [...matrixToEulerZYX(m)];

interface PartSpec {
  readonly id: string;
  readonly offset: readonly [number, number, number];
  /** Local rotation applied after the rider basis. */
  readonly local: Mat3;
}

export const RIVAL_COLORS: readonly (readonly [string, string])[] = [
  ["#6aa8c9", "#efd7a0"], ["#d6a24b", "#4e697b"], ["#8d7bc4", "#f0dcb4"], ["#6fbf8e", "#d86a43"], ["#c96a6a", "#ead8a0"]
];

/** GU47 SO47-M2: gouache rival liveries (cobalt, vermilion, violet, chalk, deep teal); none uses the amber/jade objective colours. */
/** SO47-L4: tail points on the nearest rivals (the art direction caps practicals at 6). */
export const TAIL_LIGHTS = 3;

/** SO47-N1: drawn-lean gain (0.24 rad sim lean -> ~25 degrees), landing squash depth, planet spin in rad/s. */
export const LEAN_GAIN = 1.8;
export const LANDING_SQUASH = 0.09;
const PLANET_SPIN = 0.01;

/** SO47-W2: beacon lamp glow steps (rest, then the leader pulse); quantised so the material is rewritten only on a step. */
export const BEACON_GLOW: readonly number[] = [2.2, 2.8, 3.5, 4.2];
const beaconLampMaterial = (glow: number) => material.pbr({ color: "#ecb75f", emissive: "#ecb75f", emissiveIntensity: glow, roughness: 0.5, metallic: 0, practical: true });

/** SO47-W2: metres between amber beacon posts. */
export const BEACON_SPACING = 40;

export const GOUACHE_LIVERIES: readonly string[] = ["#3f78c0", "#c4503c", "#8a62cc", "#e2d6bb", "#2f7464"];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

interface Riderrig {
  readonly root: string;
  readonly parts: readonly PartSpec[];
}

/** Local yaw that turns each Meshy rider model so its forward points along the rig's +X. */
const MODEL_YAW: Record<Vehicle, Mat3> = { bike: axisRotation("y", Math.PI), skate: axisRotation("y", Math.PI / 2) };

function riderRig(index: number, vehicle: Vehicle): Riderrig {
  const root = `rider-${index}`;
  if (MESHY_ENABLED) {
    // `model()` grounds a model: its origin is the bottom centre of the bounds, so the rig origin is the ground contact.
    return { root, parts: [{ id: `${root}-model`, offset: [0, 0, 0], local: MODEL_YAW[vehicle] }] };
  }
  const wheel = multiplyMat3(IDENTITY, axisRotation("x", Math.PI / 2));
  const lean = axisRotation("z", -0.45);
  const acrossSide = axisRotation("x", Math.PI / 2); // cylinder axis Y -> Z
  const alongForward = axisRotation("z", Math.PI / 2); // cylinder axis Y -> X
  const part = (kind: string, offset: readonly [number, number, number], local: Mat3 = IDENTITY): PartSpec => ({ id: `${root}-${kind}`, offset, local });
  if (vehicle === "skate") {
    return {
      root,
      parts: [
        part("deck", [0, 0.14, 0]),
        part("truckFL", [0.3, 0.07, 0.11], acrossSide), part("truckFR", [0.3, 0.07, -0.11], acrossSide),
        part("truckRL", [-0.3, 0.07, 0.11], acrossSide), part("truckRR", [-0.3, 0.07, -0.11], acrossSide),
        part("legL", [0, 0.48, 0.1]), part("legR", [0, 0.48, -0.1]),
        part("torso", [0, 0.88, 0]),
        part("armL", [0.05, 0.95, 0.24], axisRotation("z", -0.3)), part("armR", [0.05, 0.95, -0.24], axisRotation("z", -0.3)),
        part("head", [0.02, 1.36, 0]), part("visor", [0.1, 1.38, 0])
      ]
    };
  }
  return {
    root,
    parts: [
      part("frame", [0.06, 0.52, 0]),
      part("headlight", [0.64, 0.6, 0]),
      part("seat", [-0.27, 0.76, 0]),
      part("bar", [0.46, 0.93, 0], acrossSide),
      part("wheelF", [0.58, 0.34, 0], wheel), part("wheelR", [-0.58, 0.34, 0], wheel),
      part("tireF", [0.58, 0.34, 0]), part("tireR", [-0.58, 0.34, 0]),
      part("hubF", [0.58, 0.34, 0], wheel), part("hubR", [-0.58, 0.34, 0], wheel),
      part("nozzleL", [-0.72, 0.46, 0.13], alongForward), part("nozzleR", [-0.72, 0.46, -0.13], alongForward),
      part("legL", [0, 0.58, 0.13], axisRotation("z", 0.44)), part("legR", [0, 0.58, -0.13], axisRotation("z", 0.44)),
      part("torso", [-0.02, 0.98, 0], lean),
      part("armL", [0.3, 1.08, 0.19], axisRotation("z", -0.68)), part("armR", [0.3, 1.08, -0.19], axisRotation("z", -0.68)),
      part("head", [0.16, 1.4, 0]), part("visor", [0.25, 1.43, 0])
    ]
  };
}

export interface WorldRuntime {
  update(state: RaceState, dt: number, time: number, view: "chase" | "wide", aspect: number, shake?: { readonly x: number; readonly y: number; readonly roll: number }, ghost?: GhostPose | null): void;
  resetCamera(): void;
  /** A zero-G crash along `normal`: push the drawn rider out along it for `IMPACT_REBOUND.seconds`. */
  impact(normal: readonly [number, number, number]): void;
  /** GU47 SO47-V1 / C1: a race event for the VFX pack and the camera kicks (presentation only). */
  event(ev: { readonly type: string; readonly point?: readonly [number, number, number] }): void;
  /** QA: where the rider at `index` (6 = trial ghost) would land on screen with the last camera pose (x, y in 0..1 from top left). */
  projectRider(index: number, aspect: number): { x: number; y: number; depth: number } | null;
  readonly nodeCount: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

/** Neutral-room environment intensity, calibrated on the remote runner against the 4.3.7 rider-region luma (docs/audits/lanes/g15.md). */
export const ENVIRONMENT_INTENSITY = 0.9;

function environmentIntensity(fallback: number = ENVIRONMENT_INTENSITY): number {
  const raw = typeof location !== "undefined" ? new URLSearchParams(location.search).get("env") : null;
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 4 ? parsed : fallback;
}

/** `?env=neutral` (SO47-E1): the neutral room instead of the captured nebula probe. */
function neutralEnvironment(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("env") === "neutral";
}

export function buildWorld(options: WorldOptions): World {
  const { vehicle, rider } = options;
  const high = options.quality === "high";
  const look: OrbitLook = options.look ?? "gouache";
  activeLook = look;
  /** Debug switch: `?off=lights,bloom,grade,vignette,sky,atmo,stars2,rocks,lintel` disables individual look upgrades (bisecting a render problem). */
  const off = new Set((typeof location !== "undefined" ? new URLSearchParams(location.search).get("off") ?? "" : "").split(",").filter(Boolean));
  const builder: Scene = scene()
    .background("#05060d")
    .camera(camera.perspective({ position: [0, 40, 0], target: [0, 0, 0], fov: 72, near: 0.15, far: 2400 }));
  // GU47 SO47-L1/L2: the rig comes from the look table. The custom shaders read these same lights (a3d_lights/a3d_scene),
  // so the GLBs and the painted surfaces share one key. Gouache: raking 18-degree white key from the left of the start
  // grid with 3 PCSS cascades, warm unshadowed planetshine from the gas giant, cool hemisphere ground. `?look=original`
  // keeps the 4.6.1 rig (53-degree warm key, 2 cascades, cool fill).
  const row = LOOKS[look];
  const shadowOff = typeof location !== "undefined" && new URLSearchParams(location.search).get("shadow") === "0";
  if (!off.has("lights")) {
    builder
      .add(lights.hemisphere({ name: "hemisphere", skyColor: row.hemisphere.sky, groundColor: row.hemisphere.ground, intensity: row.hemisphere.intensity }))
      .add(lights.directional({
        name: "key",
        position: [...row.key.position],
        target: [0, 0, 0],
        intensity: row.key.intensity,
        color: row.key.color,
        shadow: shadowOff ? false : { cascades: high ? row.key.cascades : 1, maxDistance: row.key.maxDistance, filter: high ? row.key.filter : "pcf" }
      }).runtime({ id: "key" }));
    if (row.fill) builder.add(lights.directional({ name: "fill", position: [...row.fill.position], target: [0, 0, 0], intensity: row.fill.intensity, color: row.fill.color, shadow: false }));
    if (row.planetshine) builder.add(lights.directional({ name: "planetshine", position: [...row.planetshine.position], target: [0, 0, 0], intensity: row.planetshine.intensity, color: row.planetshine.color, shadow: false }));
    // SO47-L4 (gouache, `?off=headlight` removes them): an unshadowed headlight spot on the player and red tail points
    // on the three nearest rivals (re-assigned every frame), so the art direction's 6-practical cap holds.
    if (look === "gouache" && !off.has("headlight")) {
      builder.add(lights.spot({ name: "headlight", position: [0, 1, 0], target: [0, 0, 6], angle: 0.45, penumbra: 0.5, distance: 34, intensity: 5, color: "#fff2d8", shadow: false }).runtime({ id: "headlight" }));
      for (let k = 0; k < TAIL_LIGHTS; k++) builder.add(lights.point({ name: `tail-${k}`, position: [0, -500, 0], distance: 7, intensity: 2.2, color: "#ff3b2a", shadow: false }).runtime({ id: `tail-${k}` }));
    }
  }
  // Image-based fill for the lit GLBs (riders, pylons, boulders, props) (LIGHT-01). Gouache (SO47-E1): the nebula dome,
  // gas giant and track are captured once into a 128 px probe with no background, so the riders pick up the painted sky;
  // `?env=neutral` keeps the neutral room. `?env=<n>` overrides the intensity for calibration captures; `?off=env` removes it.
  if (!off.has("env")) {
    builder.add(row.environment.kind === "capture" && !neutralEnvironment()
      ? environments.capture({ name: "fill-environment", intensity: environmentIntensity(row.environment.intensity), background: false, resolution: 128, update: "once", include: "all", position: [0, 30, 0] })
      : environments.neutral({ name: "fill-environment", intensity: environmentIntensity(look === "original" ? ENVIRONMENT_INTENSITY : row.environment.intensity), background: false }));
  }
  // Scene fog (SO47-E3): the custom shaders read its colour and density (u_a3dFogColor / u_a3dFogDensity) and add the
  // height mist; the engine fogs the GLBs with the same values, so a rider and the island behind it match.
  if (row.fog && !off.has("fog")) builder.add(effects.fog({ name: "haze", color: row.fog.color, density: row.fog.density, intensity: (row.fog.maxOpacity - 0.25) / 0.55 }).runtime({ id: "haze" }));
  if (!off.has("bloom")) builder.add(effects.bloom({ name: "bloom", ...row.post.bloom }));
  if (!off.has("grade")) builder.add(effects.colorGrade({ name: "grade", ...row.post.grade }));
  if (!off.has("vignette")) builder.add(effects.vignette({ name: "vignette", ...row.post.vignette }));
  // SO47-P1 grain on every tier but Low (PRD §6.4).
  if (row.post.grain && high && !off.has("grain")) builder.add(effects.filmGrain({ name: "grain", intensity: row.post.grain.intensity, size: row.post.grain.size }));
  // SO47-P2 / P3 (High gouache only): boost motion blur and CA start at 0 and are driven at runtime through
  // app.post.setEffect (art/director.ts); menu/results depth of field focuses the grid riders 8 m out.
  if (look === "gouache" && high && !options.reducedMotion && !off.has("boostpost")) {
    builder.add(effects.motionBlur({ name: "boost-motion-blur", intensity: 0 }));
    builder.add(effects.chromaticAberration({ name: "boost-ca", intensity: 0 }));
  }
  if (look === "gouache" && high && !off.has("dof")) builder.add(effects.depthOfField({ name: "menu-dof", focusDistance: 8, fStop: 2.8, focalLength: 50 }));

  /* ---- track, rails, islands, ramps, loops ---- */
  const course = buildCourse(high ? 1.3 : 2.1);
  builder.add(geometry.custom(dynamicFrom(course.track, true), { name: "track", material: trackMaterial() }).runtime({ id: "track" }));
  // GU47 phase 3 (distinctness: "teal glowing track edges" read as Thermal Drift): gouache rails glow chalk-amber.
  builder.add(geometry.custom(dynamicFrom(course.rails, false), { name: "rails", material: solidMaterial(hexLinear("#e5e4b9"), hexLinear(look === "gouache" ? "#ecb75f" : "#9ebdae"), 0.22) }));
  builder.add(geometry.custom(dynamicFrom(buildIslands(), true), { name: "islands", material: mineralMaterial(hexLinear("#b9c5e1"), true) }));
  builder.add(geometry.custom(dynamicFrom(buildRamps(vehicle), true), { name: "ramps", material: trackMaterial() }).runtime({ id: "ramps" }));
  if (vehicle === "skate") builder.add(geometry.custom(dynamicFrom(buildLoops(SKATE_LOOPS), true), { name: "loops", material: trackMaterial() }));

  /* ---- sky: nebula dome, planet with atmosphere, star layers ---- */
  if (!off.has("sky")) builder.add(primitives.sphere({ name: "sky-dome", size: 3700, material: material.custom(skySpec()) }).runtime({ id: "sky-dome" }));
  // SO47-E2: gouache moves the gas giant out past the ring on -X (it fills the right of the sky at the start grid),
  // 520 m across, with a banded ring and a small second moon; `?look=original` keeps the small overhead planet.
  const planet = row.planet;
  builder.add(primitives.sphere({
    name: "planet",
    position: [...planet.position],
    rotation: [0.1, 0.4, 1.12],
    size: planet.size,
    material: solidMaterial(hexLinear("#f9ece3"), hexLinear(look === "original" ? "#c98a68" : "#d9895f"), 0, look === "original" ? 0.045 : 0.026)
  }).runtime({ id: "planet" }));
  if (!off.has("atmo")) builder.add(primitives.sphere({
    name: "planet-atmosphere",
    position: [...planet.position],
    size: planet.size * 1.06,
    material: material.custom(atmosphereSpec(hexLinear("#ffb48c")))
  }));
  if (planet.ring) {
    // Banded ring: an opaque painted band plus (High only) an additive outer edge (+1 draw each).
    const ringRot: [number, number, number] = [1.2, 0.35, 0.18];
    builder.add(primitives.ring({
      name: "planet-ring",
      position: [...planet.position],
      rotation: ringRot,
      params: { innerRadius: planet.size * 0.66, outerRadius: planet.size * 0.98, thetaSegments: 96 },
      material: solidMaterial(hexLinear("#e8c7a4"), hexLinear("#a8705a"), 0, 0.05)
    }));
    if (high) builder.add(primitives.ring({
      name: "planet-ring-edge",
      position: [...planet.position],
      rotation: ringRot,
      params: { innerRadius: planet.size * 0.98, outerRadius: planet.size * 1.03, thetaSegments: 96 },
      material: solidMaterial(hexLinear("#ffd9b4"), hexLinear("#ffcf9e"), 0.9, 0, { transparent: true, blending: "additive", depthWrite: false })
    }));
  }
  if (planet.moon && high) builder.add(primitives.sphere({
    name: "second-moon",
    position: [planet.position[0] + 260, planet.position[1] + 250, planet.position[2] - 340],
    size: 60,
    material: solidMaterial(hexLinear("#c9c3d8"), hexLinear("#7f7898"), 0, 0.08)
  }));
  const rand = lehmer(77);
  const starCount = high ? 8000 : 3000;
  const starPositions: number[] = [];
  const starTints: number[] = [];
  for (let i = 0; i < starCount; i++) {
    const y = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 1000 + rand() * 700, k = Math.sqrt(1 - y * y);
    const c = hslToRgb(0.09 + rand() * 0.12, 0.12 + rand() * 0.25, 0.35 + rand() * 0.55);
    starPositions.push(r * k * Math.cos(a), r * y, r * k * Math.sin(a));
    starTints.push(...c);
  }
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(starPositions),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(Array.from({ length: starCount }, () => 1.65)) },
      tint: { itemSize: 3, data: f32(starTints) },
      fade: { itemSize: 1, data: f32(Array.from({ length: starCount }, () => 1)) }
    }
  }), { name: "stars", material: pointsMaterial(false) }));

  /* bright foreground stars with a warm/cool spread (picked up by bloom) */
  const rand2 = lehmer(991);
  const brightCount = high ? 360 : 120;
  const brightPositions: number[] = [];
  const brightTints: number[] = [];
  const brightSizes: number[] = [];
  for (let i = 0; i < brightCount; i++) {
    const y = rand2() * 2 - 1, a = rand2() * Math.PI * 2, r = 900 + rand2() * 600, k = Math.sqrt(1 - y * y);
    const warm = rand2() > 0.5;
    brightPositions.push(r * k * Math.cos(a), r * y, r * k * Math.sin(a));
    brightTints.push(...(warm ? hexLinear("#ffd9ae") : hexLinear("#b8d4ff")).map((v) => v * (1.3 + rand2() * 1.2)));
    brightSizes.push(2.6 + rand2() * 3.4);
  }
  if (!off.has("stars2")) builder.add(geometry.custom(geometry.dynamic({
    positions: f32(brightPositions),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(brightSizes) },
      tint: { itemSize: 3, data: f32(brightTints) },
      fade: { itemSize: 1, data: f32(Array.from({ length: brightCount }, () => 1)) }
    }
  }), { name: "stars-bright", material: pointsMaterial(true) }));

  /* ---- checkpoints: veils + pillars ---- */
  GATES.forEach((gate, i) => {
    builder.add(geometry.custom(dynamicFrom(veilQuad(gate.s), false), {
      name: `gate-veil-${i}`,
      material: material.custom(veilSpec())
    }).runtime({ id: `gate-veil-${i}` }));
    const f = mainFrame(gate.s);
    const rot = euler(basisMatrix(f.tangent, f.up, f.side));
    for (const side of [-1, 1]) {
      const p = f.p.clone().addScaledVector(f.side, side * 11.1).addScaledVector(f.up, 6.4);
      if (MESHY_ENABLED) {
        builder.add(model(MESHY.pylon, { name: `gate-${i}-pillar-${side}`, position: [p.x - f.up.x * 6.5, p.y - f.up.y * 6.5, p.z - f.up.z * 6.5], rotation: rot, targetMaxDimension: 13, castShadow: false, receiveShadow: false }));
        continue;
      }
      builder.add(primitives.cylinder({
        name: `gate-${i}-pillar-${side}`,
        position: [p.x, p.y, p.z],
        rotation: rot,
        size: [1.1, 13, 1.1],
        material: solidMaterial(hexLinear("#f3ddaf"), hexLinear("#ecb75f"), 2.2)
      }));
    }
    const top = f.p.clone().addScaledVector(f.up, 13.1);
    if (!off.has("lintel")) builder.add(primitives.roundedBox({
      name: `gate-${i}-lintel`,
      position: [top.x, top.y, top.z],
      rotation: rot,
      size: [0.9, 0.7, 23.2],
      params: { radius: 0.2 },
      material: solidMaterial(hexLinear("#f3ddaf"), hexLinear("#ecb75f"), 2.6)
    }));
  });

  /* ---- GU47 SO47-W1: jagged crater rim at 600-900 m + instanced rocks and spires (gouache; 3 draws) ---- */
  if (look === "gouache" && !off.has("rim")) {
    const rim = buildCraterRim(high ? RIM.segments : 128);
    builder.add(geometry.custom(geometry.dynamic({
      positions: f32(rim.positions),
      normals: f32(rim.normals),
      uvs: f32(rim.uvs),
      indices: Uint32Array.from(rim.indices)
    }), { name: "crater-rim", scale: RIM_UNIT, material: mineralMaterial(hexLinear("#b9785e"), false) }));
    const scatter = rimScatter(high);
    const rockColors = ["#a8644c", "#7d5a4e", "#c58a6a", "#5d5a66"];
    builder.add(instances.polyhedron({
      name: "rim-rocks",
      params: { variant: "dodecahedron", detail: 0 },
      transforms: scatter.rocks.map((r) => ({ position: [...r.position], rotation: [...r.rotation], scale: [...r.scale] })),
      colors: scatter.rocks.map((_, i) => rockColors[i % rockColors.length]!),
      castShadow: false,
      receiveShadow: false,
      material: material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0 })
    }));
    // GU47 phase 3 (distinctness vs Thermal Drift: "spiky crystal cones"): the spires are eroded terracotta hoodoos
    // (truncated 7-sided columns, warm umber/ochre), not crystal spikes; still one instanced draw.
    builder.add(instances.cylinder({
      name: "rim-spires",
      params: { radiusTop: 0.24, radiusBottom: 0.5, radialSegments: 7 },
      transforms: scatter.spires.map((r) => ({ position: [...r.position], rotation: [...r.rotation], scale: [...r.scale] })),
      colors: scatter.spires.map((_, i) => (i % 3 === 0 ? "#7a4f3e" : i % 3 === 1 ? "#b06e4e" : "#c9925f")),
      castShadow: false,
      receiveShadow: false,
      material: material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0 })
    }));
  }
  /* ---- GU47 SO47-W2 (part): amber beacon posts every 40 m along the outer edge (2 instanced draws) ---- */
  if (look === "gouache" && !off.has("beacons")) {
    const posts: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
    const lamps: { position: [number, number, number] }[] = [];
    for (let s = 20; s < COURSE_LENGTH; s += BEACON_SPACING) {
      const f = mainFrame(s);
      const side = (Math.floor(s / BEACON_SPACING) % 2 === 0 ? 1 : -1) * 13.5;
      const p = f.p.clone().addScaledVector(f.side, side).addScaledVector(f.up, 1.1);
      posts.push({ position: [p.x, p.y, p.z], rotation: euler(basisMatrix(f.tangent, f.up, f.side)) });
      lamps.push({ position: [p.x + f.up.x * 1.2, p.y + f.up.y * 1.2, p.z + f.up.z * 1.2] });
    }
    builder.add(instances.cylinder({
      name: "beacon-posts",
      size: [0.22, 2.2, 0.22],
      transforms: posts,
      castShadow: false,
      material: material.pbr({ color: "#e2d6bb", roughness: 0.8, metallic: 0 })
    }));
    builder.add(instances.sphere({
      name: "beacon-lamps",
      size: 0.42,
      transforms: lamps,
      castShadow: false,
      material: beaconLampMaterial(BEACON_GLOW[0])
    }).runtime({ id: "beacon-lamps" }));
  }
  // SO47-P3: sun lens flare on the key (High gouache); frustum occlusion drops it when the sun is off screen.
  if (look === "gouache" && high && !off.has("flare")) builder.add(lights.lensFlare({ name: "sun-flare", light: "key", position: [...row.key.position], intensity: 0.55, occlusion: "frustum" }));

  /* ---- crystal resonance clusters ---- */
  RESONANCE_GATES.forEach((gate, i) => {
    const f = mainFrame(gate.s);
    [0, 1, 2].forEach((k) => {
      const lane = gate.lane + (k - 1) * 0.55;
      const p = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, 0.9 + k * 0.15);
      builder.add(primitives.cone({
        name: `crystal-${i}-${k}`,
        position: [p.x, p.y, p.z],
        rotation: euler(multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("z", (k - 1) * 0.25))),
        params: { radius: 0.32, height: 1.8 + k * 0.4, radialSegments: 6 },
        material: solidMaterial(hexLinear("#9fd8ff"), hexLinear("#b4a2ff"), 1.1)
      }));
    });
  });

  /* ---- Meshy set dressing: boulders along the rim, a lander and an observatory on the horizon ---- */
  if (MESHY_ENABLED) {
    const ASSET = { boulder: MESHY.boulderA, spire: MESHY.boulderB, lander: MESHY.lander, observatory: MESHY.observatory } as const;
    for (const d of dressingPlan()) {
      const f = mainFrame(d.s);
      const p = f.p.clone().addScaledVector(f.side, d.lateral).addScaledVector(f.up, d.drop);
      const base = multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("y", d.spin));
      const rock = d.kind === "boulder" || d.kind === "spire";
      builder.add(model(ASSET[d.kind], { name: d.name, position: [p.x, p.y, p.z], rotation: euler(rock ? multiplyMat3(base, axisRotation("z", d.tilt)) : base), targetMaxDimension: d.size, castShadow: false, receiveShadow: false }));
    }
  }

  /* ---- meteors (moon rocks) ---- */
  const meteors = collectibles("painted").filter((c) => c.kind === "meteor");
  meteors.forEach((c) => {
    builder.add(off.has("rocks")
      ? primitives.sphere({
        name: `rock-${c.id}`,
        size: 1.7,
        scale: [1, 0.8, 1.1],
        material: solidMaterial(hexLinear("#6b6470"), hexLinear("#2a2630"), 0.05)
      }).runtime({ id: `rock-${c.id}` })
      : model(ROCK_ASSET, { name: `rock-${c.id}`, targetMaxDimension: 2.1, castShadow: false, receiveShadow: false }).runtime({ id: `rock-${c.id}` }));
  });

  /* ---- stardust ---- */
  const dustItems = collectibles("painted").filter((c) => c.kind === "dust");
  const dustFrames = dustItems.map((c) => routeFrame(c.s, c.route));
  const dustBase = dustItems.map((c, i) => {
    const f = dustFrames[i]!;
    return f.p.clone().addScaledVector(f.side, c.lane).addScaledVector(f.up, 1 + (islandHeight(c.s, c.route) ?? 0));
  });
  /** Each item's bob axis, computed once here instead of a `routeFrame` per item per frame (SO-E1). */
  const dustUp = Float32Array.from(dustFrames.flatMap((f) => [f.up.x, f.up.y, f.up.z]));
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(dustBase.flatMap((p) => [p.x, p.y, p.z])),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(dustItems.map(() => 9)) },
      tint: { itemSize: 3, data: f32(dustItems.flatMap(() => [...hexLinear("#ffd9a0")])) },
      fade: { itemSize: 1, data: f32(dustItems.map(() => 1)) }
    }
  }), { name: "stardust", material: pointsMaterial(true) }).runtime({ id: "stardust" }));

  /* ---- exhaust ---- */
  const EXHAUST = 160;
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(Array.from({ length: EXHAUST * 3 }, () => 0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(Array.from({ length: EXHAUST }, () => 0)) },
      tint: { itemSize: 3, data: f32(Array.from({ length: EXHAUST }, () => [...hexLinear("#ffe1a1")]).flat()) },
      fade: { itemSize: 1, data: f32(Array.from({ length: EXHAUST }, () => 0)) }
    }
  }), { name: "exhaust", material: pointsMaterial(true) }).runtime({ id: "exhaust" }));

  /* ---- riders ---- */
  const riders = Array.from({ length: 6 }, (_, i) => riderRig(i, vehicle));
  riders.forEach((rig, i) => {
    const [bodyHex, accentHex] = i === 0 ? [RIDERS[rider]!.color, RIDERS[rider]!.accent] : RIVAL_COLORS[i - 1]!;
    const body = hexLinear(bodyHex), accent = hexLinear(accentHex), dark = hexLinear("#2a2f3b");
    if (MESHY_ENABLED) {
      const part = rig.parts[0]!;
      const size = vehicle === "skate" ? MESHY_SIZE.skate.target : MESHY_SIZE.bike.target;
      const wedge = vehicle === "bike" && i % 2 === 1; // rivals 1, 3, 5 ride the second Meshy bike design
      // GU47 SO47-M2 (gouache): five distinct rival liveries on both bike designs, a clearcoat hero, and the E-D rim
      // term on every rider. `?look=original` keeps the 4.6.1 tints (3 tinted rivals, the wedge bikes untinted).
      const tint = look === "gouache"
        ? [{
          ...(i === 0 ? { clearcoat: 1, clearcoatRoughness: 0.12 } : { color: mixHex(GOUACHE_LIVERIES[i - 1]!, "#ffffff", 0.3), colorMode: "multiply" as const }),
          rim: { color: i === 0 ? "#ffe2c4" : "#c8d0ef", power: 3, intensity: i === 0 ? 0.5 : 0.35 }
        }]
        : i === 0 || wedge ? undefined : [{ color: mixHex(RIVAL_COLORS[i - 1]![0], "#ffffff", 0.55), colorMode: "multiply" as const }];
      builder.add(model(vehicle === "skate" ? MESHY.skateRider : wedge ? MESHY.rivalBike : MESHY.bikeRider, {
        name: part.id,
        targetMaxDimension: size,
        // SO47-L1: the player casts into the raking key so its long shadow reads on the road (+1 draw per cascade).
        castShadow: look === "gouache" && i === 0,
        receiveShadow: false,
        ...(tint ? { materialOverrides: tint } : {})
      }).runtime({ id: part.id }));
      return;
    }
    for (const part of rig.parts) {
      const kind = part.id.slice(rig.root.length + 1);
      const suit = hexLinear("#d9d6cf");
      const cyan = hexLinear("#8fe9ff");
      const make = (): ReturnType<typeof primitives.box> => {
        switch (kind) {
          case "frame": return primitives.roundedBox({ name: part.id, size: [1.04, 0.17, 0.22], params: { radius: 0.075 }, material: solidMaterial(body, accent, 0.12) });
          case "deck": return primitives.roundedBox({ name: part.id, size: [0.95, 0.05, 0.27], params: { radius: 0.02 }, material: solidMaterial(accent, accent, 0.18) });
          case "seat": return primitives.roundedBox({ name: part.id, size: [0.44, 0.1, 0.3], params: { radius: 0.04 }, material: solidMaterial(dark) });
          case "bar": return primitives.cylinder({ name: part.id, size: [0.045, 0.62, 0.045], material: solidMaterial(dark) });
          case "headlight": return primitives.sphere({ name: part.id, size: 0.15, material: solidMaterial(hexLinear("#fff3d6"), hexLinear("#ffe4a8"), 2.4) });
          case "tireF":
          case "tireR": return primitives.torus({ name: part.id, size: 0.8, material: solidMaterial(hexLinear("#171a22"), [0, 0, 0], 0) });
          case "wheelF":
          case "wheelR": return primitives.cylinder({ name: part.id, size: [0.58, 0.05, 0.58], material: solidMaterial(hexLinear("#3a4150")) });
          case "hubF":
          case "hubR": return primitives.cylinder({ name: part.id, size: [0.5, 0.085, 0.5], material: solidMaterial(accent, accent, 0.9) });
          case "nozzleL":
          case "nozzleR": return primitives.cylinder({ name: part.id, size: [0.12, 0.3, 0.12], material: solidMaterial(cyan, cyan, 2.4) });
          case "truckFL":
          case "truckFR":
          case "truckRL":
          case "truckRR": return primitives.cylinder({ name: part.id, size: [0.12, 0.06, 0.12], material: solidMaterial(dark, accent, 0.4) });
          case "legL":
          case "legR": return primitives.capsule({ name: part.id, size: [vehicle === "skate" ? 0.14 : 0.13, vehicle === "skate" ? 0.6 : 0.62, vehicle === "skate" ? 0.14 : 0.13], material: solidMaterial(dark) });
          case "armL":
          case "armR": return primitives.capsule({ name: part.id, size: [0.1, 0.58, 0.1], material: solidMaterial(suit, accent, 0.06) });
          case "torso": return primitives.capsule({ name: part.id, size: [0.34, 0.89, 0.34], material: solidMaterial(accent, accent, 0.1) });
          case "visor": return primitives.sphere({ name: part.id, size: 0.17, material: solidMaterial(cyan, cyan, 2.0) });
          default: return primitives.sphere({ name: part.id, size: 0.3, material: solidMaterial(suit) });
        }
      };
      builder.add(make().runtime({ id: part.id }));
    }
  });

  /* ---- time-trial ghost: the player's model, translucent and cyan ---- */
  if (options.ghost) {
    builder.add(MESHY_ENABLED
      ? model(vehicle === "skate" ? MESHY.skateRider : MESHY.bikeRider, {
        name: "ghost-rider",
        targetMaxDimension: vehicle === "skate" ? MESHY_SIZE.skate.target : MESHY_SIZE.bike.target,
        castShadow: false,
        receiveShadow: false,
        materialOverrides: [{ color: "#9fe8ff", colorMode: "replace", opacity: 0.38, emissive: "#5fd8ff", emissiveIntensity: 0.6 }]
      }).runtime({ id: "ghost-rider" })
      : primitives.capsule({ name: "ghost-rider", size: [0.5, 1.5, 0.5], material: solidMaterial(hexLinear("#9fe8ff"), hexLinear("#5fd8ff"), 0.8, 0, { transparent: true, blending: "additive", depthWrite: false }) }).runtime({ id: "ghost-rider" }));
  }

  /* ---- gravity halo ---- */
  builder.add(primitives.ring({
    name: "gravity-halo",
    params: { innerRadius: 1.54, outerRadius: 1.66, thetaSegments: 48 },
    material: solidMaterial(hexLinear("#93ead5"), hexLinear("#93ead5"), 1, 0, { transparent: true, blending: "additive", depthWrite: false })
  }).runtime({ id: "gravity-halo" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      return bindRuntime(app, { vehicle, riders, meteors, dustBase, dustUp, dustItems, exhaust: EXHAUST, ghost: Boolean(options.ghost), reducedMotion: Boolean(options.reducedMotion), look, high, headlight: look === "gouache" && !off.has("headlight") && !off.has("lights") });
    }
  };
}

interface BindInput {
  readonly vehicle: Vehicle;
  readonly riders: readonly Riderrig[];
  readonly meteors: ReturnType<typeof collectibles>;
  readonly dustBase: readonly Vec3[];
  readonly dustUp: Float32Array;
  readonly ghost: boolean;
  readonly reducedMotion: boolean;
  readonly dustItems: ReturnType<typeof collectibles>;
  readonly exhaust: number;
  readonly look: OrbitLook;
  readonly high: boolean;
  readonly headlight: boolean;
}

interface Pose { position: Vec3; forward: Vec3; up: Vec3 }

function bindRuntime(app: AuraApp, input: BindInput): WorldRuntime {
  const maybeCamera = app.camera;
  if (!maybeCamera) throw new Error("strange-orbit-port: the app exposes no camera controller");
  const cameraController: NonNullable<typeof maybeCamera> = maybeCamera;
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => {
    let h = handles.get(id);
    if (!h) handles.set(id, h = app.nodes.require(id));
    return h;
  };
  const gateVeils = GATES.map((_, i) => node(`gate-veil-${i}`));
  const gatePulse = GATES.map(() => 0);
  let rig: { forward: Vec3; up: Vec3 } | null = null;
  const exhaustPos = new Float32Array(input.exhaust * 3);
  const exhaustSize = new Float32Array(input.exhaust);
  const exhaustFade = new Float32Array(input.exhaust);
  const exhaustAge = new Float32Array(input.exhaust).fill(1);
  const exhaustVel = new Float32Array(input.exhaust * 3);
  let exhaustHead = 0;
  let exhaustBudget = 0;
  const rng = lehmer(4242);
  let dustLap = -1;
  const dustSize = new Float32Array(input.dustItems.length);
  const dustPositions = new Float32Array(input.dustBase.length * 3);
  let lastSizeKey = "";
  const rebound = { t: 0, x: 0, y: 0, z: 0 };
  let lastCamera: { eye: Vec3; look: Vec3; up: Vec3; fov: number } | null = null;
  const riderAt: Vec3[] = Array.from({ length: 7 }, () => new Vec3()); // 0 player, 1..5 rivals, 6 ghost
  const riderFwd: Vec3[] = Array.from({ length: 7 }, () => new Vec3(1, 0, 0));
  const riderUp: Vec3[] = Array.from({ length: 7 }, () => new Vec3(0, 1, 0));
  const riderShown: boolean[] = Array.from({ length: 6 }, () => true);
  /** SO47-N1 landing squash (vertical scale drop, decays in ~0.3 s; 30% amplitude on reduced motion). */
  let squash = 0;
  /** SO47-E4 meteor streaks: next streak time and a presentation-only RNG (the sim RNG is untouched). */
  const skyRng = lehmer(5309);
  let nextMeteor = 4 + skyRng() * 4;
  /* GU47 WP-25 presentation directors (read-only race values; art/director.ts). */
  const row = LOOKS[input.look];
  const feel = createCameraFeel(input.look, input.reducedMotion);
  const sectors = createSectorDirector(input.look);
  const postDirector = createPostDirector(row, input.high, input.reducedMotion);
  const keyLight = app.nodes.get("key");
  const skyDome = app.nodes.get("sky-dome");
  const planetNode = app.nodes.get("planet");
  const beaconLamps = app.nodes.get("beacon-lamps");
  let beaconStep = 0;
  let lastPost = "";
  let lastShift = Number.NaN;
  if (input.look === "gouache") registerOrbitVfx(app.effects ?? { registerPreset: () => undefined });
  // SO47-V2: amber player ribbon (jade while the gravity grip is on) and livery-coloured rival trails (High), widening
  // with speed so they show on boost. One ribbon per rider; the engine batches them.
  const trailColor = { amber: "#ecb75f", jade: "#93ead5" } as const;
  let playerTrailColor: keyof typeof trailColor = "amber";
  const riderNode = (i: number): string => input.riders[i]!.parts[0]!.id;
  const makePlayerTrail = () => app.effects?.trail(riderNode(0), { width: 0.35, life: 0.5, color: trailColor[playerTrailColor], widthOverSpeed: [18, 34] });
  let playerTrail = input.look === "gouache" ? makePlayerTrail() : undefined;
  if (input.look === "gouache" && input.high) {
    for (let i = 1; i < 6; i++) app.effects?.trail(riderNode(i), { width: 0.22, life: 0.35, color: GOUACHE_LIVERIES[i - 1]!, widthOverSpeed: [20, 34] });
  }
  /** QA crops for E-I's capture (normalised 0..1, updated as the camera moves): rider, sky band, planet. */
  const publishCrops = (aspect: number): void => {
    // GU47 phase 2: nothing else creates `__AURA_QA__` on this page, so the old `if (!qa) return` never published the
    // crops and the luma capture saw no `rider` crop. Create the hook object on first use (QA only, no gameplay read).
    const g = globalThis as { __AURA_QA__?: { crops?: unknown } };
    const qa = (g.__AURA_QA__ ??= {});
    const crops: { name: string; x: number; y: number; w: number; h: number }[] = [{ name: "sky", x: 0, y: 0, w: 1, h: 0.3 }];
    const rider = projectPoint(riderAt[0]!, aspect);
    if (rider) crops.push(boxAround("rider", rider, 0.22 / Math.max(0.6, aspect), 0.24));
    const planet = projectPoint(new Vec3(...row.planet.position), aspect);
    if (planet) crops.push(boxAround("planet", planet, (row.planet.size / Math.max(1, planet.depth)) / Math.max(0.6, aspect), row.planet.size / Math.max(1, planet.depth)));
    qa.crops = crops;
  };
  const projectPoint = (p: Vec3, aspect: number): { x: number; y: number; depth: number } | null => {
    const c = lastCamera;
    if (!c) return null;
    const f = c.look.clone().sub(c.eye).normalize();
    const r = new Vec3().crossVectors(f, c.up).normalize();
    const u = new Vec3().crossVectors(r, f).normalize();
    const d = p.clone().sub(c.eye);
    const depth = d.dot(f);
    if (depth <= 0) return null;
    const t = Math.tan((c.fov * Math.PI) / 360);
    return { x: 0.5 + (d.dot(r) / (depth * t * aspect)) / 2, y: 0.5 - (d.dot(u) / (depth * t)) / 2, depth };
  };
  const applyPost = (frame: PostFrame): void => {
    const key = `${frame.motionBlur}|${frame.chromaticAberration}|${frame.depthOfField}`;
    if (key === lastPost || !app.post) return;
    lastPost = key;
    if (input.high && input.look === "gouache" && !input.reducedMotion) {
      app.post.setEffectEnabled("motion-blur", frame.motionBlur > 0);
      app.post.setEffect("motion-blur", { intensity: frame.motionBlur });
      app.post.setEffectEnabled("chromatic-aberration", frame.chromaticAberration > 0);
      app.post.setEffect("chromatic-aberration", { intensity: frame.chromaticAberration });
    }
    if (input.high && input.look === "gouache") app.post.setEffectEnabled("depth-of-field", frame.depthOfField);
  };

  /** Group pose for a rider standing at (`s`, `lane`) on `route`. */
  const poseAt = (s: number, lane: number, route: Route, height: number, heading: number, lean: number): Pose => {
    const f = routeFrame(s, route);
    const noise = surfaceNoise(s, trackLane(s, lane, route));
    const position = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, height + noise);
    const forward = f.tangent.clone().multiplyScalar(Math.cos(heading)).addScaledVector(f.side, Math.sin(heading));
    const up = f.up.clone();
    if (lean) up.applyAxisAngle(forward, -lean);
    return { position, forward, up };
  };

  const placeRider = (index: number, pose: Pose, scale: number, extraPitch = 0, extraRoll = 0): void => {
    const side = new Vec3().crossVectors(pose.forward, pose.up).normalize();
    const up = new Vec3().crossVectors(side, pose.forward).normalize();
    let base = basisMatrix(pose.forward, up, side);
    if (extraPitch) base = multiplyMat3(base, axisRotation("z", extraPitch));
    if (extraRoll) base = multiplyMat3(base, axisRotation("x", extraRoll));
    riderAt[index]!.copy(pose.position).addScaledVector(up, 0.8 * scale);
    riderFwd[index]!.copy(pose.forward);
    riderUp[index]!.copy(up);
    const rigDef = input.riders[index]!;
    for (const part of rigDef.parts) {
      const [dx, dy, dz] = part.offset;
      const p = pose.position.clone()
        .addScaledVector(pose.forward, dx * scale)
        .addScaledVector(up, dy * scale)
        .addScaledVector(side, dz * scale);
      const e = euler(multiplyMat3(base, part.local));
      const h = node(part.id);
      h.setPosition(p.x, p.y, p.z);
      h.setRotation(e[0], e[1], e[2]);
      if (index === 0 && squash > 0.001) h.setScale([scale * (1 + squash * 0.5), scale * (1 - squash), scale * (1 + squash * 0.5)]);
      else h.setScale(scale);
    }
  };

  const hideRider = (index: number): void => {
    riderShown[index] = false;
    for (const part of input.riders[index]!.parts) node(part.id).setVisible(false);
  };
  const showRider = (index: number): void => {
    riderShown[index] = true;
    for (const part of input.riders[index]!.parts) node(part.id).setVisible(true);
  };
  /** GU47 phase 3 (gouache): soft contact shadow under each shown rider on the road and the ramps (presentation only). */
  const contactSurfaces = input.look === "gouache" ? [app.nodes.get("track"), app.nodes.get("ramps")].filter((h) => h !== undefined && h !== null) : [];
  const contactLast = CONTACT_UNIFORMS.map(() => "");
  const updateContactShadows = (): void => {
    if (contactSurfaces.length === 0) return;
    for (let i = 0; i < CONTACT_UNIFORMS.length; i++) {
      const p = riderAt[i]!;
      const value: [number, number, number, number] = [p.x, p.y, p.z, riderShown[i] ? CONTACT_STRENGTH : 0];
      const key = value.map((v) => v.toFixed(2)).join(",");
      if (key === contactLast[i]) continue;
      contactLast[i] = key;
      for (const h of contactSurfaces) h.setUniform?.(CONTACT_UNIFORMS[i]!, value);
    }
  };
  /** SO47-L4: headlight 0.6 m ahead aimed 6 m down the road; tail points behind the nearest visible rivals. */
  const updateRiderLights = (menu: boolean): void => {
    if (!input.headlight) return;
    const p = riderAt[0]!, f = riderFwd[0]!, u = riderUp[0]!;
    const head = node("headlight");
    head.setPosition(p.x + f.x * 0.6 - u.x * 0.1, p.y + f.y * 0.6 - u.y * 0.1, p.z + f.z * 0.6 - u.z * 0.1);
    const aim = f.clone().multiplyScalar(6).addScaledVector(u, -0.9).normalize();
    head.setLight?.({ direction: [aim.x, aim.y, aim.z] });
    const near = [1, 2, 3, 4, 5].filter((i) => riderShown[i]).sort((a, b) => riderAt[a]!.distanceToSquared(p) - riderAt[b]!.distanceToSquared(p));
    for (let k = 0; k < TAIL_LIGHTS; k++) {
      const i = near[k];
      const tail = node(`tail-${k}`);
      if (i === undefined || menu) { tail.setPosition(0, -500, 0); continue; }
      const r = riderAt[i]!, rf = riderFwd[i]!, ru = riderUp[i]!;
      tail.setPosition(r.x - rf.x * 1.0 - ru.x * 0.2, r.y - rf.y * 1.0 - ru.y * 0.2, r.z - rf.z * 1.0 - ru.z * 0.2);
    }
  };

  function update(state: RaceState, dt: number, time: number, view: "chase" | "wide", aspect: number, shake?: { readonly x: number; readonly y: number; readonly roll: number }, ghost?: GhostPose | null): void {
    const menu = state.phase === "menu";
    // GU47 phase 3 (gouache): the parked grid idles on its hover pads (a few cm, none on reduced motion; presentation only).
    const menuHover = (i: number): number => (input.look === "gouache" && !input.reducedMotion ? 0.07 * (1 + Math.sin(time * 2.1 + i * 1.7)) : 0);
    const sForPlayer = menu ? 35 : state.s;
    const scale = menu ? 1.3 : 1.15;

    /* player */
    let playerPose: Pose;
    if (state.flight) {
      const f = state.flight;
      playerPose = { position: f.position.clone(), forward: f.forward.clone(), up: f.up.clone() };
    } else if (state.loop) {
      playerPose = loopFramePose(state);
    } else {
      const ground = menu ? menuHover(0) : state.air?.height ?? ((groundHeight(state.s, state.lane, state.route, state.vehicle) ?? 0) + (state.route === "main" ? rampHeightAt(state.s, state.lane, state.vehicle) : 0));
      // SO47-N1 (gouache): the drawn rider leans up to ~25 degrees (1.8x the sim's 0.24 rad lean; presentation only).
      playerPose = poseAt(sForPlayer, menu ? 0 : state.lane, menu ? "main" : state.route, ground, menu ? 0 : state.heading || 0, menu ? 0 : state.lean * (input.look === "gouache" ? LEAN_GAIN : 1));
    }
    let pitch = 0, roll = 0;
    if (!state.flight && !state.loop && !menu) {
      pitch = state.air
        ? Math.max(-0.28, Math.min(0.28, state.air.vy * 0.025))
        : state.route === "main"
          ? Math.atan((rampHeightAt(state.s + 0.05, state.lane, state.vehicle) - rampHeightAt(state.s, state.lane, state.vehicle)) / 0.05)
          : 0;
      if (state.air) roll = Math.sin(state.air.age * 3) * 0.22;
    }
    if (state.flight) {
      const damp = input.reducedMotion ? REDUCED_MOTION_SPIN : 1;
      const spin = state.flight.mode === "drift" ? Math.sin(state.flight.age * 0.5) * 0.45 * damp : 0;
      const bank = state.flight.mode === "drift" ? Math.sin(state.flight.age * 0.3) * 0.3 * damp : 0;
      roll = spin;
      pitch = bank;
    }
    if (rebound.t > 0) {
      const k = (rebound.t / IMPACT_REBOUND.seconds) * IMPACT_REBOUND.metres;
      playerPose.position.x += rebound.x * k;
      playerPose.position.y += rebound.y * k;
      playerPose.position.z += rebound.z * k;
      rebound.t = Math.max(0, rebound.t - dt);
    }
    placeRider(0, playerPose, scale, pitch, roll);

    /* time-trial ghost */
    if (input.ghost) {
      const g = node("ghost-rider");
      g.setVisible(Boolean(ghost) && !menu);
      if (ghost && !menu) {
        const pose = poseAt(ghost.s, ghost.lane, ghost.route, ghost.height, 0, 0);
        const side = new Vec3().crossVectors(pose.forward, pose.up).normalize();
        const up = new Vec3().crossVectors(side, pose.forward).normalize();
        const e = euler(multiplyMat3(basisMatrix(pose.forward, up, side), MESHY_ENABLED ? MODEL_YAW[input.vehicle] : IDENTITY));
        g.setPosition(pose.position.x, pose.position.y, pose.position.z);
        riderAt[6]!.copy(pose.position).addScaledVector(up, 0.8 * scale);
        g.setRotation(e[0], e[1], e[2]);
        g.setScale(scale);
      }
    }

    /* rivals */
    for (let i = 0; i < 5; i++) {
      const rival = state.rivals[i];
      if (!rival || state.mode === "trial") { hideRider(i + 1); continue; }
      showRider(i + 1);
      const s = menu ? 35 + 10 + i * 5 : rival.s;
      const lane = menu ? (i % 3 - 1) * 3 : rival.lane;
      const ground = menu ? menuHover(i + 1) : rival.air?.height ?? (islandHeight(rival.s, rival.route) ?? 0);
      placeRider(i + 1, poseAt(s, lane, menu ? "main" : rival.route, ground, 0, menu ? 0 : rival.lean ?? 0), scale);
    }

    updateRiderLights(menu);
    updateContactShadows();

    /* camera */
    const frame = routeFrame(sForPlayer, menu ? "main" : state.route);
    const fwd = state.flight ? state.flight.forward : state.loop ? playerPose.forward : poseAt(sForPlayer, menu ? 0 : state.lane, menu ? "main" : state.route, 0, menu ? 0 : state.heading || 0, 0).forward;
    const up0 = state.flight ? state.flight.up : frame.up;
    const side = new Vec3().crossVectors(fwd, up0).normalize();
    const up = new Vec3().crossVectors(side, fwd).normalize();
    if (!rig) rig = { forward: fwd.clone(), up: up.clone() };
    else {
      const k = 1 - Math.exp(-dt * 12);
      rig.forward.lerp(fwd, k).normalize();
      rig.up.lerp(up, k).normalize();
    }
    const cs = new Vec3().crossVectors(rig.forward, rig.up).normalize();
    const cu = new Vec3().crossVectors(cs, rig.forward).normalize();
    // SO47-C1: chase base fov from the look table (gouache 64, original 72) plus the boost/landing kicks and lean roll.
    const kick = feel.update(dt, { boosting: Boolean(state.boosting), lean: state.lean, racing: state.phase === "racing" && !state.flight });
    const params = view === "wide" ? { back: 4.5, height: 4, fov: 82, portraitFov: 82 } : { back: 4.5, height: 3, fov: feel.baseFov, portraitFov: feel.baseFov + 4 };
    const origin = playerPose.position;
    let eye: Vec3, look: Vec3, fov: number;
    if (menu && aspect < 0.85) {
      // Portrait (SO-5): the menu panel takes the top of the screen, so the camera stands further back and aims above
      // the riders, which puts them in the lower third.
      const m = menuPortraitCamera(aspect);
      eye = frame.p.clone().addScaledVector(fwd, m.forward).addScaledVector(frame.side, m.side).addScaledVector(frame.up, m.height);
      look = frame.p.clone().addScaledVector(fwd, m.lookForward).addScaledVector(frame.side, m.lookSide).addScaledVector(frame.up, m.lookHeight);
      fov = m.fov;
    } else if (menu && input.look === "gouache") {
      // GU47 phase 3 (rubric composition/camera): a lower, slowly drifting grid shot. The eye sits nearer the road so the
      // crater rim, the planet and the course fill the top half instead of empty road; the drift (none under reduced
      // motion) keeps the menu a moving painting.
      const m = menuLandscapeCamera(time, input.reducedMotion);
      eye = frame.p.clone().addScaledVector(fwd, m.forward).addScaledVector(frame.side, m.side).addScaledVector(frame.up, m.height);
      look = frame.p.clone().addScaledVector(fwd, m.lookForward).addScaledVector(frame.side, m.lookSide).addScaledVector(frame.up, m.lookHeight);
      fov = m.fov;
    } else if (menu) {
      eye = frame.p.clone().addScaledVector(fwd, 4.5).addScaledVector(frame.side, -7).addScaledVector(frame.up, 2.7);
      look = frame.p.clone().addScaledVector(frame.side, 3.8).addScaledVector(frame.up, 1.1);
      fov = 48;
    } else if (input.look === "gouache" && view === "chase" && state.phase === "countdown" && countdownShot(state.countdown, input.reducedMotion).shot !== "chase") {
      // SO47-C2 countdown sequence: planet wide, then a pan across the grid.
      const c = countdownShot(state.countdown, input.reducedMotion);
      if (c.shot === "planet") {
        eye = origin.clone().addScaledVector(fwd, 9 - c.progress * 2).addScaledVector(side, 5).addScaledVector(up, 2.2);
        look = origin.clone().lerp(new Vec3(...row.planet.position), 0.06).addScaledVector(up, 6);
        fov = 70;
      } else {
        eye = frame.p.clone().addScaledVector(fwd, 8).addScaledVector(side, 9 - 18 * c.progress).addScaledVector(up, 2.4);
        look = origin.clone().addScaledVector(fwd, 6).addScaledVector(up, 0.8);
        fov = 58;
      }
    } else if (input.look === "gouache" && state.phase === "finished") {
      // SO47-C2 results orbit around the player, held well off the chase axis.
      const a = resultsOrbitAngle(time, input.reducedMotion);
      eye = origin.clone().addScaledVector(rig.forward, Math.cos(a) * 7).addScaledVector(cs, Math.sin(a) * 7).addScaledVector(cu, 2.4);
      look = origin.clone().addScaledVector(cu, 0.9);
      fov = 50;
    } else {
      eye = origin.clone().addScaledVector(rig.forward, -params.back).addScaledVector(cu, params.height - kick.punch);
      if (shake) eye.addScaledVector(cs, shake.x).addScaledVector(cu, shake.y);
      look = origin.clone().addScaledVector(rig.forward, 3).addScaledVector(cu, 1.4);
      fov = (aspect < 0.85 ? params.portraitFov : params.fov) + kick.fovOffset;
    }
    const camRoll = (shake?.roll ?? 0) + kick.roll;
    lastCamera = { eye: eye.clone(), look: look.clone(), up: menu ? frame.up.clone() : cu.clone(), fov };
    cameraController.setPose({
      position: [eye.x, eye.y, eye.z],
      target: [look.x, look.y, look.z],
      up: menu ? [frame.up.x, frame.up.y, frame.up.z] : [cu.x + cs.x * camRoll, cu.y + cs.y * camRoll, cu.z + cs.z * camRoll],
      fov
    }, { cut: false });

    /* meteors */
    const lap = Math.floor(state.s / COURSE_LENGTH);
    for (const c of input.meteors) {
      const h = node(`rock-${c.id}`);
      const collected = state.collected.has(lap + ":" + c.id);
      h.setVisible(!collected);
      if (collected) continue;
      const f = routeFrame(c.s, c.route);
      const p = f.p.clone().addScaledVector(f.side, meteorLane(c, state.time)).addScaledVector(f.up, 1 + (islandHeight(c.s, c.route) ?? 0));
      const base = multiplyMat3(multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("x", state.time * 0.3 + c.id)), axisRotation("z", Math.sin(state.time * 0.48 + c.id * 0.9) * 0.8));
      const e = euler(base);
      h.setPosition(p.x, p.y, p.z);
      h.setRotation(e[0], e[1], e[2]);
    }

    /* stardust: hide collected, bob the rest */
    const dust = node("stardust");
    const positions = dustPositions;
    const ups = input.dustUp;
    for (let i = 0; i < input.dustBase.length; i++) {
      const c = input.dustItems[i]!;
      const p = input.dustBase[i]!;
      const bob = Math.sin(time * 2 + c.id) * 0.22;
      positions[i * 3] = p.x + ups[i * 3]! * bob;
      positions[i * 3 + 1] = p.y + ups[i * 3 + 1]! * bob;
      positions[i * 3 + 2] = p.z + ups[i * 3 + 2]! * bob;
      dustSize[i] = state.collected.has(lap + ":" + c.id) ? 0 : 9;
    }
    dust.updateAttribute?.("position", { array: positions, offset: 0 });
    const sizeKey = lap + ":" + state.dust;
    if (sizeKey !== lastSizeKey || dustLap !== lap) {
      dust.updateAttribute?.("size", { array: dustSize, offset: 0 });
      lastSizeKey = sizeKey;
      dustLap = lap;
    }

    /* checkpoint veils */
    state.events.forEach((e) => {
      if (e.type === "gate") {
        const i = GATES.findIndex((g) => g.s === e.gate);
        if (i >= 0) gatePulse[i] = 1;
      }
    });
    gateVeils.forEach((veil, i) => {
      gatePulse[i] = Math.max(0, gatePulse[i]! - dt * 0.65);
      veil.setUniform?.("veilTime", time);
      veil.setUniform?.("veilPulse", gatePulse[i]!);
    });

    /* gravity halo */
    const halo = node("gravity-halo");
    const haloOn = !menu && (state.gravityTime > 0 || state.flight?.mode === "sling");
    halo.setVisible(haloOn);
    if (haloOn) {
      const side2 = new Vec3().crossVectors(playerPose.forward, playerPose.up).normalize();
      const up2 = new Vec3().crossVectors(side2, playerPose.forward).normalize();
      const m = multiplyMat3(multiplyMat3(basisMatrix(playerPose.forward, up2, side2), axisRotation("y", Math.PI / 2)), axisRotation("z", time * 2));
      const e = euler(m);
      halo.setPosition(playerPose.position.x + up2.x, playerPose.position.y + up2.y, playerPose.position.z + up2.z);
      halo.setRotation(e[0], e[1], e[2]);
    }

    squash *= Math.exp(-dt * 10);
    if (input.look === "gouache" && input.high && !menu && time >= nextMeteor && app.effects) {
      // SO47-E4 meteor streak high in the sky every 4-8 s (High only; +0 authored draws, runtime particles).
      nextMeteor = time + 4 + skyRng() * 4;
      const a = skyRng() * Math.PI * 2;
      app.effects.burst("streak", [Math.cos(a) * 700, 260 + skyRng() * 200, Math.sin(a) * 700], { count: 6, speed: 60, scale: 6, color: "#ffe6c4", camera: false });
    }
    if (input.look === "gouache") planetNode?.setRotation(0.1, 0.4 + time * PLANET_SPIN, 1.12);
    // SO47-W2: the beacons pulse while the player leads (a steady glow under reduced flash/motion).
    if (beaconLamps) {
      const leading = state.phase === "racing" && state.mode !== "trial" && state.place === 1 && !input.reducedMotion;
      const step = leading ? 1 + Math.floor((Math.sin(time * 5) * 0.5 + 0.5) * (BEACON_GLOW.length - 1.001)) : 0;
      if (step !== beaconStep) { beaconStep = step; beaconLamps.setMaterial(beaconLampMaterial(BEACON_GLOW[step]!)); }
    }

    /* GU47 SO47-L3 / E2: sector key tint, haze and nebula hue; SO47-P2 / P3 boost and menu post */
    const sector = sectors.update(sForPlayer, dt);
    if (sector.changed) {
      keyLight?.setLight?.({ color: sector.changed.keyColor, intensity: sector.changed.keyIntensity }, { transitionSeconds: SECTOR_LERP_SECONDS });
      app.atmosphere?.setFog({ color: sector.changed.fogColor, density: sector.changed.fogDensity }, { transitionSeconds: SECTOR_LERP_SECONDS, overrideSceneFog: true });
    }
    if (Math.abs(sector.nebulaShift - lastShift) > 0.002 || Number.isNaN(lastShift)) {
      skyDome?.setUniform?.("nebulaShift", sector.nebulaShift);
      lastShift = sector.nebulaShift;
    }
    const wantTrail: keyof typeof trailColor = state.gravityTime > 0 || state.flight?.mode === "sling" ? "jade" : "amber";
    if (playerTrail && wantTrail !== playerTrailColor) {
      playerTrail.stop({ immediate: false });
      playerTrailColor = wantTrail;
      playerTrail = makePlayerTrail();
    }
    applyPost(postDirector.update(dt, { boosting: Boolean(state.boosting), zeroG: Boolean(state.flight), phase: state.phase }));
    publishCrops(aspect);

    /* exhaust */
    if (!state.flight && !state.air && !menu && state.phase === "racing" && state.speed > 4) {
      exhaustBudget += Math.min(0.1, dt) * (state.boosting ? 600 : 110 + state.speed * 3);
      let spawned = 0;
      const pf = poseAt(state.s, state.lane, state.route, 0, state.heading || 0, 0);
      const fr = routeFrame(state.s, state.route);
      while (exhaustBudget >= 1 && spawned < 14) {
        exhaustBudget -= 1;
        spawned++;
        const k = exhaustHead++ % input.exhaust;
        const p = pf.position.clone().addScaledVector(fr.tangent, -0.75 - rng() * 0.3).addScaledVector(fr.side, (rng() - 0.5) * 0.7).addScaledVector(fr.up, 0.25);
        exhaustPos[k * 3] = p.x; exhaustPos[k * 3 + 1] = p.y; exhaustPos[k * 3 + 2] = p.z;
        exhaustVel[k * 3] = fr.up.x * 0.6; exhaustVel[k * 3 + 1] = fr.up.y * 0.6; exhaustVel[k * 3 + 2] = fr.up.z * 0.6;
        exhaustAge[k] = 0;
      }
    }
    for (let k = 0; k < input.exhaust; k++) {
      exhaustAge[k]! += dt / 0.6;
      const alive = exhaustAge[k]! < 1;
      exhaustPos[k * 3]! += exhaustVel[k * 3]! * dt;
      exhaustPos[k * 3 + 1]! += exhaustVel[k * 3 + 1]! * dt;
      exhaustPos[k * 3 + 2]! += exhaustVel[k * 3 + 2]! * dt;
      exhaustSize[k] = alive ? 7 * (1 - exhaustAge[k]! * 0.5) : 0;
      exhaustFade[k] = alive ? (1 - exhaustAge[k]!) * 0.7 : 0;
    }
    const ex = node("exhaust");
    ex.updateAttribute?.("position", { array: exhaustPos, offset: 0 });
    ex.updateAttribute?.("size", { array: exhaustSize, offset: 0 });
    ex.updateAttribute?.("fade", { array: exhaustFade, offset: 0 });
  }

  return {
    update,
    resetCamera() { rig = null; rebound.t = 0; },
    projectRider(index, aspect) {
      const p = riderAt[index];
      return p ? projectPoint(p, aspect) : null;
    },
    event(ev) {
      if (ev.type === "land" || ev.type === "stunt") {
        feel.landing(ev.type === "stunt");
        if (input.look === "gouache") {
          squash = LANDING_SQUASH * (input.reducedMotion ? 0.3 : 1);
          // SO47-V3: a tyre scuff on the road under the rider, fading over 6 s.
          const p0 = riderAt[0]!, u0 = riderUp[0]!;
          app.effects?.decal({ position: [p0.x - u0.x * 0.78, p0.y - u0.y * 0.78, p0.z - u0.z * 0.78], normal: [u0.x, u0.y, u0.z] }, { kind: "scuff", size: 1.4, lifetime: 6, color: "#3a2626", opacity: 0.55 });
        }
      }
      if (input.look !== "gouache" || !app.effects) return;
      const vfx = orbitVfxFor(ev.type, input.reducedMotion);
      if (!vfx) return;
      const p0 = riderAt[0]!;
      const at = ev.point ?? [p0.x, p0.y, p0.z];
      app.effects.burst(vfx.kind, [at[0], at[1], at[2]], { count: vfx.count, color: ORBIT_VFX_COLORS[vfx.kind], camera: false });
    },
    impact(normal) {
      const len = Math.hypot(normal[0], normal[1], normal[2]) || 1;
      rebound.x = normal[0] / len; rebound.y = normal[1] / len; rebound.z = normal[2] / len;
      rebound.t = IMPACT_REBOUND.seconds;
    },
    get nodeCount() { return handles.size; }
  };
}

/**
 * GU47 phase 3: gouache menu camera for landscape screens, in the menu frame's axes (metres along the track, across it
 * and up from it). The 4.6.1 shot (4.5 / -7 / 2.7 looking at 0 / 3.8 / 1.1, fov 48) spent the lower half on bare road;
 * this one is lower and a little wider and drifts +-0.6 m sideways and +-0.15 m up over ~21 s (still on reduced motion).
 */
export function menuLandscapeCamera(time: number, reducedMotion: boolean): { forward: number; side: number; height: number; lookForward: number; lookSide: number; lookHeight: number; fov: number } {
  const drift = reducedMotion ? 0 : Math.sin(time * 0.3);
  const bob = reducedMotion ? 0 : Math.sin(time * 0.47 + 1.1);
  return { forward: 4.2 + drift * 0.5, side: -6.6 + drift * 0.6, height: 1.75 + bob * 0.15, lookForward: 0.6, lookSide: 3.8, lookHeight: 1.45, fov: 50 };
}

/**
 * Menu camera for portrait screens, in the menu frame's axes (metres along the track, across it and up from it).
 * Chosen by projecting the rider positions for a 390x844 screen; the remote capture checks it (`riderScreen`).
 */
export function menuPortraitCamera(_aspect: number): { forward: number; side: number; height: number; lookForward: number; lookSide: number; lookHeight: number; fov: number } {
  // Behind the grid, aimed 8 m above the track 14 m ahead: at 390x844 this projects the player to (0.50, 0.84) and the
  // rivals to y 0.71 to 0.75 (fractions of the screen from the top left), below the menu panel.
  return { forward: -12, side: 0, height: 3.4, lookForward: 14, lookSide: 0, lookHeight: 8, fov: 60 };
}

function boxAround(name: string, p: { x: number; y: number }, w: number, h: number): { name: string; x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.min(1, p.x - w / 2));
  const y = Math.max(0, Math.min(1, p.y - h / 2));
  return { name, x, y, w: Math.max(0, Math.min(1 - x, w)), h: Math.max(0, Math.min(1 - y, h)) };
}

function loopFramePose(state: RaceState): Pose {
  const l = loopFrame(state.loop!.def, state.loop!.t, state.loop!.lane);
  return { position: l.p.clone().addScaledVector(l.up, 0.06), forward: l.tangent, up: l.up };
}
