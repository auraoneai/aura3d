/**
 * Last Train to the Sea world on the public `@aura3d/engine` surface only: the six-town ring railway (track ribbons
 * built from the original's measured route), cloud-top islands with dressing, a station platform per town, the tram
 * with twelve seats, a sky dome and cloud sea (`material.custom`), and rain / snow points (`geometry.dynamic`
 * with `topology: "points"`). Models and textures the original fetched remotely are re-created procedurally.
 */
import { camera, geometry, lights, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { applyMat3, matrixToEulerZYX, tramRotation, type V3 } from "./orient";
import { cloudSpec, pointsSpec, skySpec } from "./materials";
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
const mixRgb = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const TEMPERAMENT_COLORS: Record<Temperament, string> = { easy: "#f2c14e", sightseer: "#6bc5a0", rushed: "#e4572e", sleeper: "#7a8cff" };
const TEMPERAMENTS = Object.keys(TEMPERAMENT_COLORS) as Temperament[];

/** Seat layout in tram-local coordinates (x side, y up, z forward): two rows of six. */
export const SEATS: V3[] = Array.from({ length: 12 }, (_, i) => [i < 6 ? -0.85 : 0.85, 1.75, -3.4 + (i % 6) * 1.36] as V3);

/** Particles around the camera for the monsoon rain and the observatory snow. */
export const WEATHER_COUNT = 360;

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
/** Surfaces re-coloured at night: the lights and exposure controls do not reach these materials on the remote renderer, so night is a per-surface tint. */
const NIGHT_GAIN: V3 = [0.2, 0.25, 0.42];
const nightColor = (hex: string): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number, k: number): string => Math.round(Math.min(1, v * k) * 255).toString(16).padStart(2, "0");
  return `#${c(r, NIGHT_GAIN[0])}${c(g, NIGHT_GAIN[1])}${c(b, NIGHT_GAIN[2])}`;
};
const glow = (color: string, intensity = 1.2) => material.emissive({ color, emissive: color, emissiveIntensity: intensity });

export interface World { readonly scene: Scene; bind(app: AuraApp, data: SimData): WorldRuntime }
export interface WorldRuntime {
  update(sim: SimState, seconds: number): void;
  readonly nodeCount: number;
  readonly camera: { eye: V3; target: V3 };
}

export function buildWorld(data: SimData): World {
  const towns = data.tables.towns;
  const b: Scene = scene()
    .background("#a9d4ee")
    .camera(camera.perspective({ position: [0, 30, 60], target: [0, 20, 0], fov: 58, near: 0.3, far: 7500 }));

  /* ---- lights: a day set and a night set, toggled by visibility ---- */
  b.add(lights.hemisphere({ name: "hemi-day", skyColor: "#d9ecff", groundColor: "#9a8866", intensity: 1.15 }).runtime({ id: "hemi-day" }));
  b.add(lights.directional({ name: "sun", position: [260, 420, 180], target: [0, 0, -300], intensity: 2.1, color: "#fff2d6" }).runtime({ id: "sun" }));
  b.add(lights.hemisphere({ name: "hemi-night", skyColor: "#1c2650", groundColor: "#0a0e22", intensity: 0.32 }).runtime({ id: "hemi-night" }));
  b.add(lights.directional({ name: "moon", position: [-220, 380, 120], target: [0, 0, -300], intensity: 0.28, color: "#8aa3ff" }).runtime({ id: "moon" }));

  /* ---- sky dome, cloud sea ---- */
  b.add(primitives.sphere({ name: "sky", size: 6400, material: material.custom(skySpec()) }).runtime({ id: "sky" }));
  const Y = -75, R = 3200;
  b.add(geometry.custom(geometry.dynamic({
    positions: f32([-R, Y, -R - 400, R, Y, -R - 400, R, Y, R - 400, -R, Y, R - 400]),
    normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2])
  }), { name: "cloud-sea", material: material.custom(cloudSpec()) }).runtime({ id: "cloud-sea" }));

  /* ---- track: ballast, sleepers band, two rails per leg ---- */
  data.route.legs.forEach((leg, i) => {
    const pts = leg.position;
    b.add(geometry.custom(dyn(ribbon(pts, 1.9, 0.02)), { name: `bed-${i}`, material: pbr("#9d8f78", 0.95) }));
    b.add(geometry.custom(dyn(ribbon(pts, 0.07, 0.16, -0.72)), { name: `rail-l-${i}`, material: pbr("#4f5964", 0.4, 0.8) }));
    b.add(geometry.custom(dyn(ribbon(pts, 0.07, 0.16, 0.72)), { name: `rail-r-${i}`, material: pbr("#4f5964", 0.4, 0.8) }));
  });

  const dimmable: { id: string; color: string; rough: number }[] = [];
  const dim = (id: string, color: string, rough: number) => { dimmable.push({ id, color, rough }); return pbr(color, rough); };

  /* ---- towns: island, platform, canopy, lamps, buildings ---- */
  towns.forEach((town, i) => {
    const s0 = sampleRoute(data.route, i, 0);
    const s1 = sampleRoute(data.route, i, 6);
    let fx = s1.x - s0.x, fz = s1.z - s0.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const sx = fz, sz = -fx;
    const rand = lehmer(7000 + i * 31);
    b.add(primitives.cylinder({ name: `island-${i}`, position: [s0.x, s0.y - 5.2, s0.z], size: [150, 9, 150], material: dim(`island-${i}`, town.color, 0.95) }).runtime({ id: `island-${i}` }));
    b.add(primitives.cylinder({ name: `island-rock-${i}`, position: [s0.x, s0.y - 17, s0.z], size: [96, 18, 96], material: dim(`island-rock-${i}`, "#6f6a73", 1) }).runtime({ id: `island-rock-${i}` }));
    const yaw = Math.atan2(fx, fz);
    b.add(primitives.box({ name: `platform-${i}`, position: [s0.x + sx * 4.6, s0.y + 0.3, s0.z + sz * 4.6], rotation: [0, yaw, 0], size: [4.4, 0.9, 30], material: dim(`platform-${i}`, "#d8cdb6", 0.9) }).runtime({ id: `platform-${i}` }));
    b.add(primitives.box({ name: `canopy-${i}`, position: [s0.x + sx * 5.6, s0.y + 4.6, s0.z + sz * 5.6], rotation: [0, yaw, 0], size: [4.8, 0.3, 22], material: dim(`canopy-${i}`, town.color, 0.7) }).runtime({ id: `canopy-${i}` }));
    for (const k of [-9, 9]) {
      b.add(primitives.cylinder({ name: `post-${i}-${k}`, position: [s0.x + sx * 6.8 + fx * k, s0.y + 2.4, s0.z + sz * 6.8 + fz * k], size: [0.3, 4.2, 0.3], material: pbr("#3b3d46", 0.5, 0.5) }));
      b.add(primitives.sphere({ name: `lamp-${i}-${k}`, position: [s0.x + sx * 6.8 + fx * k, s0.y + 4.7, s0.z + sz * 6.8 + fz * k], size: 0.7, material: glow("#ffd89a", 1.6) }).runtime({ id: `lamp-${i}-${k}` }));
    }
    for (let k = 0; k < 14; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const lateral = side * (14 + rand() * 38);
      const along = (rand() - 0.5) * 100;
      const w = 6 + rand() * 9, d = 6 + rand() * 9, h = 5 + rand() * 16;
      const tint = rand() < 0.5 ? town.color : "#efe4cd";
      b.add(primitives.box({ name: `bld-${i}-${k}`, position: [s0.x + sx * lateral + fx * along, s0.y + h / 2, s0.z + sz * lateral + fz * along], rotation: [0, yaw + (rand() - 0.5) * 0.4, 0], size: [w, h, d], material: dim(`bld-${i}-${k}`, tint, 0.85) }).runtime({ id: `bld-${i}-${k}` }));
      if (k % 3 === 0) b.add(primitives.cone({ name: `roof-${i}-${k}`, position: [s0.x + sx * lateral + fx * along, s0.y + h + 2, s0.z + sz * lateral + fz * along], size: [w * 1.1, 4, d * 1.1], params: { radialSegments: 4 }, material: dim(`roof-${i}-${k}`, "#b4523d", 0.8) }).runtime({ id: `roof-${i}-${k}` }));
    }
  });

  /* ---- tram ---- */
  const tram: { id: string; local: V3; size: [number, number, number]; color: string; shape: "box" | "cylinder"; glow?: boolean; night?: boolean }[] = [
    { id: "tram-base", local: [0, 0.65, 0], size: [3.0, 0.5, 9.6], color: "#3b3f4a", shape: "box" },
    { id: "tram-body", local: [0, 2.05, 0], size: [3.0, 2.4, 9.0], color: "#f1e7d0", shape: "box" },
    { id: "tram-stripe", local: [0, 1.15, 0], size: [3.04, 0.4, 9.04], color: "#c9503b", shape: "box" },
    { id: "tram-roof", local: [0, 3.4, 0], size: [3.2, 0.3, 9.4], color: "#4b7f9c", shape: "box" },
    { id: "tram-lamp", local: [0, 1.5, 4.7], size: [1.2, 0.5, 0.2], color: "#fff0b8", shape: "box", glow: true },
    { id: "tram-win-l", local: [-1.52, 2.4, 0], size: [0.05, 0.9, 7.6], color: "#ffe6a8", shape: "box", glow: true, night: true },
    { id: "tram-win-r", local: [1.52, 2.4, 0], size: [0.05, 0.9, 7.6], color: "#ffe6a8", shape: "box", glow: true, night: true }
  ];
  for (const z of [-3.2, 3.2]) for (const x of [-1.2, 1.2]) tram.push({ id: `tram-wheel-${x}-${z}`, local: [x, 0.35, z], size: [0.7, 0.3, 0.7], color: "#2b2d33", shape: "cylinder" });
  for (const p of tram) {
    const mat = p.glow ? glow(p.color, p.night ? 1.1 : 1.6) : pbr(p.color, 0.65, p.id === "tram-base" ? 0.4 : 0);
    const node = p.shape === "box" ? primitives.box({ name: p.id, size: p.size, material: mat }) : primitives.cylinder({ name: p.id, size: p.size, material: mat });
    b.add(node.runtime({ id: p.id }));
  }
  SEATS.forEach((_, i) => {
    for (const t of TEMPERAMENTS) b.add(primitives.capsule({ name: `pax-${i}-${t}`, size: [0.55, 1.1, 0.55], material: pbr(TEMPERAMENT_COLORS[t], 0.7) }).runtime({ id: `pax-${i}-${t}` }));
  });

  /* ---- weather points (rain / snow around the camera) ---- */
  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(WEATHER_COUNT * 3).fill(0)),
    topology: "points",
    attributes: {
      size: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(3)) },
      fade: { itemSize: 1, data: f32(new Array(WEATHER_COUNT).fill(0)) }
    }
  }), { name: "weather", material: material.custom(pointsSpec([0.8, 0.88, 1])) }).runtime({ id: "weather" }));

  return { scene: b, bind: (app, d) => bindRuntime(app, d, dimmable) };
}

type Handle = ReturnType<AuraApp["nodes"]["require"]>;

function bindRuntime(app: AuraApp, data: SimData, dimmable: readonly { id: string; color: string; rough: number }[]): WorldRuntime {
  const maybeCamera = app.camera;
  if (!maybeCamera) throw new Error("last-train-port: the app exposes no camera controller");
  const cam: NonNullable<typeof maybeCamera> = maybeCamera;
  const handles = new Map<string, Handle>();
  const node = (id: string): Handle => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const towns = data.tables.towns;
  const tramParts: { id: string; local: V3 }[] = [
    { id: "tram-base", local: [0, 0.65, 0] }, { id: "tram-body", local: [0, 2.05, 0] }, { id: "tram-stripe", local: [0, 1.15, 0] }, { id: "tram-roof", local: [0, 3.4, 0] },
    { id: "tram-lamp", local: [0, 1.5, 4.7] }, { id: "tram-win-l", local: [-1.52, 2.4, 0] }, { id: "tram-win-r", local: [1.52, 2.4, 0] }
  ];
  for (const z of [-3.2, 3.2]) for (const x of [-1.2, 1.2]) tramParts.push({ id: `tram-wheel-${x}-${z}`, local: [x, 0.35, z] });
  const rand = lehmer(4242);
  const seeds = Array.from({ length: WEATHER_COUNT }, () => [rand(), rand(), rand(), rand()] as const);
  const wpos = new Float32Array(WEATHER_COUNT * 3), wfade = new Float32Array(WEATHER_COUNT), wsize = new Float32Array(WEATHER_COUNT);
  const sky = node("sky"), clouds = node("cloud-sea"), weather = node("weather");
  const lampIds = towns.flatMap((_, i) => [`lamp-${i}-9`, `lamp-${i}-${-9}`]);
  let lastNight = -1;
  const rig = { eye: [0, 0, 0] as V3, target: [0, 0, 0] as V3 };
  let smoothedForward: V3 = [0, 0, 1];

  function update(sim: SimState, seconds: number): void {
    const here = sampleRoute(data.route, sim.leg, sim.distance);
    const ahead = sampleRoute(data.route, sim.leg, Math.min(sim.distance + 4, data.route.legs[sim.leg]!.length));
    let f: V3 = [ahead.x - here.x, ahead.y - here.y, ahead.z - here.z];
    const fl = Math.hypot(...f) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    if (sim.distance < 1) f = smoothedForward; else smoothedForward = f;
    const rot = tramRotation(f, -sim.roll);
    const euler = matrixToEulerZYX(rot);
    for (const p of tramParts) {
      const w = applyMat3(rot, p.local);
      const h = node(p.id);
      h.setPosition(here.x + w[0], here.y + w[1] + 0.2, here.z + w[2]);
      h.setRotation(euler[0], euler[1], euler[2]);
    }
    const seated = new Set(sim.trips.map((t) => t.seat));
    SEATS.forEach((seat, i) => {
      const w = applyMat3(rot, seat);
      const trip = sim.trips.find((t) => t.seat === i);
      for (const t of TEMPERAMENTS) {
        const h = node(`pax-${i}-${t}`);
        const on = seated.has(i) && trip?.temperament === t;
        h.setVisible(on);
        if (on) { h.setPosition(here.x + w[0], here.y + w[1] + 0.2, here.z + w[2]); h.setRotation(euler[0], euler[1], euler[2]); }
      }
    });

    /* day / night */
    const night = sim.timeOfDay === "night" ? 1 : 0;
    if (night !== lastNight) {
      lastNight = night;
      node("hemi-day").setVisible(!night); node("sun").setVisible(!night);
      node("hemi-night").setVisible(!!night); node("moon").setVisible(!!night);
      for (const id of lampIds) node(id).setVisible(!!night);
      for (const d of dimmable) node(d.id).setMaterial(pbr(night ? nightColor(d.color) : d.color, d.rough));
      for (const id of ["tram-win-l", "tram-win-r"]) node(id).setVisible(true);
    }

    /* sky blends the two towns' palettes along the leg (smoothstep 0.22..0.82 of the leg, as the original) */
    const a = towns[sim.leg]!, nb = towns[(sim.leg + 1) % towns.length]!;
    const k = smooth(0.22, 0.82, sim.distance / data.route.legs[sim.leg]!.length);
    const top = mixRgb(hexToRgb(a.sky[0]), hexToRgb(nb.sky[0]), k), hor = mixRgb(hexToRgb(a.sky[1]), hexToRgb(nb.sky[1]), k);
    sky.setUniform?.("skyTop", top); sky.setUniform?.("skyHorizon", hor); sky.setUniform?.("nightMix", night);
    clouds.setUniform?.("cloudPhase", seconds); clouds.setUniform?.("nightMix", night);

    /* chase camera */
    const eye: V3 = [here.x - f[0] * 17, here.y + 6.2 - f[1] * 17, here.z - f[2] * 17];
    const target: V3 = [here.x + f[0] * 12, here.y + 2.2 + f[1] * 12, here.z + f[2] * 12];
    rig.eye = eye; rig.target = target;
    cam.setPose({ position: eye, target, up: [0, 1, 0], fov: 58 }, { cut: false });

    /* rain (Monsoon Exchange, index 4) or snow (Drowned Observatory, index 3) near those towns */
    const nearTown = k < 0.5 ? sim.leg : (sim.leg + 1) % towns.length;
    const raining = nearTown === 4, snowing = nearTown === 3;
    const amount = raining || snowing ? 1 : 0;
    for (let i = 0; i < WEATHER_COUNT; i++) {
      const [sx, sy, sz, ss] = seeds[i]!;
      const fall = raining ? 38 : 4;
      const y = ((sy * 60 - seconds * fall) % 60 + 60) % 60 - 20;
      wpos[i * 3] = eye[0] + (sx - 0.5) * 80 + (raining ? seconds * 2 : Math.sin(seconds + ss * 6) * 2) % 1;
      wpos[i * 3 + 1] = eye[1] + y; wpos[i * 3 + 2] = eye[2] + (sz - 0.5) * 80;
      wfade[i] = amount * (raining ? 0.55 : 0.9); wsize[i] = raining ? 2 : 4.5;
    }
    weather.updateAttribute?.("position", { array: wpos, offset: 0 });
    weather.updateAttribute?.("fade", { array: wfade, offset: 0 });
    weather.updateAttribute?.("size", { array: wsize, offset: 0 });
  }

  return { update, get nodeCount() { return handles.size; }, camera: rig };
}
