/**
 * Beat Hopper world on the public engine surface: toon `material.custom` surfaces, `geometry.dynamic` batches,
 * a synthwave night stage (`stage.ts`: striped sunset sun, neon grid floor, city, palms, arches, floating islands,
 * LED equalizer meters, searchlights, haze) around an elevated track, plus bloom, grade and vignette. Road tiles live in a scrolling frame (written once, node moved by
 * `dist % SEGMENT_LENGTH`); beat stripes and obstacles are placed per frame from the deterministic beat-grid formula
 * `z = (crossTime - t) * speed`. Particles and pulse rings are presentation-only pools with their own LCG — they never
 * consume gameplay RNG draws. The whole world pulses on the sim beat; PERFECT judgements fire expanding timing rings.
 */
import { camera, effects, environments, geometry, lights, material, scene, type AuraApp } from "@aura3d/engine";
import {
  Batch, flatSpec, shadowSpec, toonSpec,
  type CustomSpec, type MeshData
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, obstacleZ, type BeatHopperSim, type ObstacleType } from "./sim";
import { LOOK, beatPulse, linear } from "./look";
import {
  PLAYER_LENGTH, PLAYER_RADIUS, ROAD_WIDTH, SEGMENT_LENGTH, barMesh, blockMesh, boxMesh, gapMesh, mergeMeshes, playerMesh, ringMesh, sphereMesh
} from "./meshes";
import { poseScale, type CameraPose, type Shown } from "./presentation";
import { addStage, transformMesh } from "./stage";
import { glowSpec, heroSpec, stageLitSpec, stageSkySpec, type Haze } from "./stage-shaders";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const STRIPES = 40;
const SKY_RADIUS = 360;

/** Distance haze bands (presentation): near layers, the static far skyline and the horizon ridges. */
export const HAZE: Haze = { color: linear("#6a1a6a"), density: 0.0085 };
const FAR_HAZE: Haze = { color: linear("#6a1a6a"), density: 0.0052 };
const RIDGE_HAZE: Haze = { color: linear("#7a1c6c"), density: 0.0026 };
export const CAMERA_FAR = 400;

export interface WorldOptions {
  readonly sim: BeatHopperSim;
  readonly aspect: number;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly camera?: CameraPose;
  readonly reducedMotion?: boolean;
}

export interface WorldRuntime {
  update(sim: BeatHopperSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

/** Presentation-only LCG (particle jitter, tower heights): never the gameplay stream. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Particle {
  alive: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; color: string; size: number;
}
interface Ring {
  alive: boolean; x: number; y: number; z: number;
  age: number; color: string;
}

const dynamicFrom = (m: MeshData) => geometry.dynamic({
  positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals),
  uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices)
});

export const BATCH_IDS = ["deck", "rails", "stripes", "blocks", "bars", "gaps", "rings", "particles"] as const;

/** Every custom program the world draws (the shaders-compile test bakes each one). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "sky", spec: stageSkySpec() },
    { name: "deck", spec: deckSpec() },
    { name: "hero", spec: heroSpec(linear(LOOK.player)) },
    ...stagePrograms(),
    { name: "toon", spec: toonSpec(linear(LOOK.road)) },
    { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
    { name: "flat", spec: flatSpec(linear(LOOK.roadLine), 0.9) },
    { name: "flat-tone", spec: flatSpec([1, 1, 1], 0.9, true) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

/** Road deck: dark tiles (per-tile tone) with the stage lighting and haze so the far track melts into the horizon. */
const deckSpec = (): CustomSpec => stageLitSpec({ base: [1, 1, 1], haze: HAZE, toneBase: 1, rim: [0.25, 0.04, 0.2] });

const stagePrograms = (): { name: string; spec: CustomSpec }[] =>
  addStage(() => undefined, { haze: HAZE, farHaze: FAR_HAZE, ridgeHaze: RIDGE_HAZE }).programs();

const translateBox = (w: number, h: number, d: number, y: number, z: number): MeshData => {
  const m = boxMesh(w, h, d);
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i + 1] = (m.positions[i + 1] as number) + y;
    m.positions[i + 2] = (m.positions[i + 2] as number) + z;
  }
  return m;
};

/** Headphones on the hopper (presentation): a band over the top and two ear cups, in the player's frame. */
function headphonesMesh(): MeshData {
  const top = PLAYER_RADIUS * 2 + PLAYER_LENGTH;
  const parts: MeshData[] = [];
  const steps = 9;
  for (let k = 0; k <= steps; k++) {
    const a = Math.PI * (k / steps);
    const r = PLAYER_RADIUS + 0.06;
    parts.push(transformMesh(boxMesh(0.07, 0.07, 0.12), 0, 0, Math.cos(a) * r, top - PLAYER_RADIUS * 0.75 + Math.sin(a) * r * 0.9, 0, a));
  }
  for (const side of [-1, 1]) parts.push(transformMesh(boxMesh(0.12, 0.3, 0.3), 0, 0, side * (PLAYER_RADIUS + 0.03), top - PLAYER_RADIUS * 0.85, 0));
  return mergeMeshes(parts);
}

export function buildWorld(options: WorldOptions): World {
  const builder: Scene = scene()
    .background(LOOK.background)
    .camera(camera.perspective({ position: [0, 4.6, 8.5], target: [0, 1, -10], fov: 55, near: 0.1, far: CAMERA_FAR }));

  /* Night key + neutral IBL: the toon programs carry their own light ramp, but the scene keeps one shadowed key and
   * an environment so the art-direction audit (C-35) sees a legitimate rig. */
  builder.add(environments.neutral({ name: "stage-environment", intensity: 0.3 }));
  builder.add(lights.directional({
    name: "moon-key", position: [-12, 18, 10], target: [0, 0, -10], intensity: 0.9, color: "#bcd2ff",
    shadow: { cascades: 1, maxDistance: 60 }
  }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  add("sky", sphereMesh(SKY_RADIUS, 32, 20), stageSkySpec());

  /* synthwave stage: floor, ridges, city, palms, arches, islands, equalizer meters, searchlights, motes */
  const stage = addStage((id, geom, spec) => {
    builder.add(geometry.custom(geom, { name: id, material: material.custom(spec) }).runtime({ id }));
  }, { haze: HAZE, farHaze: FAR_HAZE, ridgeHaze: RIDGE_HAZE });

  /* elevated track girder with a cyan under-glow strip (uniform along z, so it never scrolls) */
  const trackLen = CONFIG.POOL_SEGMENTS * SEGMENT_LENGTH;
  add("girder", translateBox(ROAD_WIDTH + 0.7, 0.55, trackLen, -0.6, 18 - trackLen / 2), stageLitSpec({ base: linear("#1a1038"), haze: HAZE, toneless: true }));
  add("underglow", translateBox(ROAD_WIDTH + 0.78, 0.07, trackLen, -0.42, 18 - trackLen / 2), stageLitSpec({ base: [0, 0, 0], haze: HAZE, emissive: linear("#23e6ff"), toneless: true }));

  /* road tiles + neon rails in the scrolling frame */
  const deck = new Batch(boxMesh(ROAD_WIDTH, 0.3, SEGMENT_LENGTH), CONFIG.POOL_SEGMENTS, linear(LOOK.road));
  const rails = new Batch(boxMesh(0.18, 0.34, SEGMENT_LENGTH), CONFIG.POOL_SEGMENTS * 2, linear(LOOK.rail));
  const tileA = linear(LOOK.road);
  const tileB = linear("#221748");
  for (let k = 0; k < CONFIG.POOL_SEGMENTS; k++) {
    const z = 18 - k * SEGMENT_LENGTH;
    deck.place(k, 0, -0.15, z, 0, 1, 1, 1);
    deck.setTone(k, k % 2 === 0 ? tileA : tileB);
    rails.place(k * 2, -(ROAD_WIDTH / 2 + 0.12), 0.05, z, 0, 1, 1, 1);
    rails.place(k * 2 + 1, ROAD_WIDTH / 2 + 0.12, 0.05, z, 0, 1, 1, 1);
  }
  addBatch("deck", deck, deckSpec());
  addBatch("rails", rails, toonSpec(linear(LOOK.rail), undefined, linear(LOOK.rail)));

  /* beat-grid stripes (world space, placed per frame from the sim clock) */
  const stripes = new Batch(boxMesh(ROAD_WIDTH, 0.02, 0.22), STRIPES, linear(LOOK.roadLine));
  addBatch("stripes", stripes, flatSpec([1, 1, 1], 0.85, true));

  /* the hopper + contact shadow */
  add("player", playerMesh(), heroSpec(linear(LOOK.player)));
  add("player-gear", headphonesMesh(), stageLitSpec({ base: linear("#2a1a5a"), haze: HAZE, emissive: linear("#ff2fb3"), rim: linear("#ff8fd8"), toneless: true }));
  add("player-shadow", boxMesh(1.7, 0.002, 1.7), shadowSpec());

  /* obstacles: one batch per type, slots mirror the sim pool */
  const blocks = new Batch(blockMesh(), CONFIG.POOL_OBSTACLES);
  const bars = new Batch(barMesh(), CONFIG.POOL_OBSTACLES);
  const gaps = new Batch(gapMesh(), CONFIG.POOL_OBSTACLES);
  addBatch("blocks", blocks, toonSpec(linear(LOOK.block), undefined, linear(LOOK.block)));
  addBatch("bars", bars, toonSpec(linear(LOOK.bar), undefined, linear(LOOK.bar)));
  addBatch("gaps", gaps, flatSpec(linear(LOOK.gap), 1));

  /* PERFECT timing rings + event particles (presentation pools) */
  const rings = new Batch(ringMesh(0.8, 1, 32), CONFIG.POOL_RINGS, linear(LOOK.perfect));
  addBatch("rings", rings, glowSpec({ beam: false, wobble: 0, gain: [1.2, 1.2, 1.2] }));
  const particles = new Batch(sphereMesh(0.1, 6, 5), CONFIG.POOL_PARTICLES, [1, 1, 1]);
  addBatch("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  /* post: bloom on the sun, neon and meters; a cool-magenta grade and a soft vignette (tone mapping stays off) */
  builder
    .add(effects.bloom({ name: "bloom", intensity: 0.72, threshold: 0.62, scatter: 0.7 }))
    .add(effects.colorGrade({ name: "grade", contrast: 1.08, saturation: 1.1, temperature: -0.04, gain: 1.04 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.32, color: "#0b0620" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const stageRt = stage.bind(node);
      let clock = 0;
      let lastWall = -1;
      const maybeController = app.camera;
      if (!maybeController) throw new Error("beat-hopper: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;

      const parts: Particle[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => ({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, color: "#ffffff", size: 1
      }));
      const ringPool: Ring[] = Array.from({ length: CONFIG.POOL_RINGS }, () => ({ alive: false, x: 0, y: 0, z: 0, age: 0, color: LOOK.perfect }));
      const jitter = lcg(0x51a7e);
      let lastT = -1;
      let lastJudgeAt = -10;
      let lastMilestones = 0;
      const partShown: boolean[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => false);
      const partColor: string[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => "");
      const ringShown: boolean[] = Array.from({ length: CONFIG.POOL_RINGS }, () => false);
      const obstacleShown: Record<ObstacleType, boolean[]> = {
        gap: Array.from({ length: CONFIG.POOL_OBSTACLES }, () => false),
        block: Array.from({ length: CONFIG.POOL_OBSTACLES }, () => false),
        bar: Array.from({ length: CONFIG.POOL_OBSTACLES }, () => false)
      };

      const burst = (count: number, color: string, y: number, speed: number): void => {
        let spawned = 0;
        for (const p of parts) {
          if (spawned >= count) break;
          if (p.alive) continue;
          p.alive = true;
          p.x = 0; p.y = y; p.z = 0;
          const a = jitter() * Math.PI * 2;
          const r = (0.4 + jitter() * 0.6) * speed;
          p.vx = Math.cos(a) * r;
          p.vz = Math.sin(a) * r * 0.6;
          p.vy = 2 + jitter() * speed;
          p.age = 0;
          p.life = 0.5 + jitter() * 0.35;
          p.color = color;
          p.size = 0.7 + jitter() * 0.8;
          spawned++;
        }
      };
      const spawnRing = (color: string, y: number): void => {
        const slot = ringPool.find((r) => !r.alive) ?? ringPool[0];
        if (!slot) return;
        slot.alive = true;
        slot.x = 0; slot.y = y; slot.z = 0;
        slot.age = 0;
        slot.color = color;
      };

      function update(sim: BeatHopperSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const shown = view.shown;
        const t = shown?.t ?? o.t;
        const dist = shown?.dist ?? o.dist;
        const y = shown?.y ?? o.y;
        const pose = shown?.pose ?? o.pose;
        const reduced = view.reducedMotion === true;
        const dt = lastT < 0 || t < lastT ? 0 : Math.min(0.1, t - lastT);
        lastT = t;
        const pulse = reduced ? 0 : beatPulse(t, CONFIG.BEAT);
        const gain = LOOK.pulseGain * pulse;

        /* scrolling frame: tiles written once, the node carries the scroll */
        const roadZ = dist % SEGMENT_LENGTH;
        node("deck").setPosition(0, 0, roadZ);
        node("rails").setPosition(0, 0, roadZ);
        node("rails").setUniform?.("emissive", [linear(LOOK.rail)[0] * (0.35 + gain), linear(LOOK.rail)[1] * (0.35 + gain), linear(LOOK.rail)[2] * (0.35 + gain)]);
        node("deck").setUniform?.("emissive", [0.02 * gain, 0.05 * gain, 0.09 * gain]);

        /* beat stripes: one per beat, exactly on the obstacle grid */
        const beatNow = Math.floor(t / CONFIG.BEAT + 1e-9);
        for (let i = 0; i < STRIPES; i++) {
          const b = beatNow - 2 + i;
          if (b < 0) { stripes.collapse(i); continue; }
          const z = (b * CONFIG.BEAT - t) * o.speed;
          stripes.place(i, 0, 0.012, z, 0, 1, 1, b % 4 === 0 ? 1.8 : 1);
          const k = b % 4 === 0 ? 1 : 0.45 + 0.55 * pulse;
          const c = linear(LOOK.roadLine);
          stripes.setTone(i, [c[0] * k, c[1] * k, c[2] * k]);
        }
        stripes.flush(node("stripes"), false);

        /* stage scenery: presentation clock from the wall clock (never the sim) */
        const wall = typeof performance !== "undefined" ? performance.now() / 1000 : t;
        clock += lastWall < 0 ? 0 : Math.min(0.1, Math.max(0, wall - lastWall));
        lastWall = wall;
        stageRt.update(dist, t / CONFIG.BEAT, pulse, reduced ? 0 : clock, reduced);
        node("sky").setUniform?.("uClock", reduced ? 0 : clock);
        node("sky").setUniform?.("uPulse", pulse);
        node("underglow").setUniform?.("emissive", [linear("#23e6ff")[0] * (0.6 + gain), linear("#23e6ff")[1] * (0.6 + gain), linear("#23e6ff")[2] * (0.6 + gain)]);

        /* hopper */
        const scale = poseScale(pose, sim.o.vy);
        const bodyColor = pose === "duck" ? LOOK.playerDuck : LOOK.player;
        const rgb = linear(bodyColor);
        node("player").setPosition(0, y, 0).setScale([scale.sx, scale.sy, scale.sz]);
        node("player-gear").setPosition(0, y, 0).setScale([scale.sx, scale.sy, scale.sz]);
        node("player").setUniform?.("baseColor", [...rgb]);
        node("player").setUniform?.("emissive", [rgb[0] * (0.3 + gain * 0.7), rgb[1] * (0.3 + gain * 0.7), rgb[2] * (0.3 + gain * 0.7)]);
        node("player-shadow").setPosition(0, 0.02, 0).setScale(1 / (1 + 0.25 * y));
        node("player-shadow").setUniform?.("alpha", 0.34 / (1 + 0.4 * y));

        /* obstacles: deterministic beat-grid z, collapsed when the slot is free */
        const batches: Record<ObstacleType, Batch> = { gap: gaps, block: blocks, bar: bars };
        for (let i = 0; i < CONFIG.POOL_OBSTACLES; i++) {
          const slot = o.obstacles[i];
          for (const type of ["gap", "block", "bar"] as const) {
            const batch = batches[type];
            const shownHere = slot && slot.active && slot.type === type;
            if (shownHere) {
              batch.place(i, 0, 0, obstacleZ(o, slot), 0, 1, 1, 1);
              obstacleShown[type][i] = true;
            } else if (obstacleShown[type][i]) {
              batch.collapse(i);
              obstacleShown[type][i] = false;
            }
          }
        }
        blocks.flush(node("blocks"));
        bars.flush(node("bars"));
        gaps.flush(node("gaps"), false);
        node("blocks").setUniform?.("emissive", [linear(LOOK.block)[0] * (0.25 + gain * 0.5), linear(LOOK.block)[1] * (0.25 + gain * 0.5), linear(LOOK.block)[2] * (0.25 + gain * 0.5)]);
        node("bars").setUniform?.("emissive", [linear(LOOK.bar)[0] * (0.3 + gain * 0.5), linear(LOOK.bar)[1] * (0.3 + gain * 0.5), linear(LOOK.bar)[2] * (0.3 + gain * 0.5)]);

        /* judgement events → rings + particles (presentation only) */
        const j = o.lastJudge;
        if (j.kind && j.at > lastJudgeAt) {
          lastJudgeAt = j.at;
          if (j.kind === "perfect") {
            spawnRing(LOOK.perfect, 0.06);
            burst(16, LOOK.perfect, 0.8 + y, 3.2);
          } else if (j.kind === "good") {
            spawnRing(LOOK.good, 0.06);
            burst(8, LOOK.good, 0.7 + y, 2.2);
          } else {
            burst(14, LOOK.miss, 0.8 + y, 3.6);
          }
        }
        if (o.milestones > lastMilestones) {
          lastMilestones = o.milestones;
          burst(20, LOOK.gold, 1.2, 4);
          spawnRing(LOOK.gold, 0.06);
        }
        if (o.phase === "splash" && lastMilestones !== 0) {
          lastMilestones = 0;
          lastJudgeAt = -10;
        }

        for (let i = 0; i < ringPool.length; i++) {
          const r = ringPool[i] as Ring;
          if (!r.alive) {
            if (ringShown[i]) { rings.collapse(i); ringShown[i] = false; }
            continue;
          }
          r.age += dt;
          if (r.age >= LOOK.ring.life) {
            r.alive = false;
            rings.collapse(i);
            ringShown[i] = false;
            continue;
          }
          const radius = LOOK.ring.radius + LOOK.ring.growth * r.age;
          const fade = 1 - r.age / LOOK.ring.life;
          rings.place(i, r.x, r.y, r.z, 0, radius, 1, radius);
          const c = linear(r.color);
          rings.setTone(i, [c[0] * fade, c[1] * fade, c[2] * fade]);
          ringShown[i] = true;
        }
        rings.flush(node("rings"), false);

        for (let i = 0; i < parts.length; i++) {
          const p = parts[i] as Particle;
          if (!p.alive) {
            if (partShown[i]) { particles.collapse(i); partShown[i] = false; }
            continue;
          }
          p.age += dt;
          if (p.age >= p.life) {
            p.alive = false;
            particles.collapse(i);
            partShown[i] = false;
            continue;
          }
          p.vy -= 9 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.05, p.y + p.vy * dt);
          p.z += p.vz * dt;
          const k = p.size * (1 - p.age / p.life);
          particles.place(i, p.x, p.y, p.z, 0, k, k, k);
          if (partColor[i] !== p.color) {
            particles.setTone(i, linear(p.color));
            partColor[i] = p.color;
          }
          partShown[i] = true;
        }
        particles.flush(node("particles"));

        /* camera */
        const c = view.camera ?? { x: 0, y: 4.6, z: 8.5, lookX: 0, lookY: 1, lookZ: -10 };
        const fov = (aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5)) + (reduced ? 0 : 2.5 * pulse);
        controller.setPose({ position: [c.x, c.y, c.z], target: [c.lookX, c.lookY, c.lookZ], up: [0, 1, 0], fov }, { cut: false });
      }

      const parked = ["blocks", "bars", "gaps", "rings", "particles"];
      function warm(on: boolean): void {
        for (const id of parked) {
          /* parked far away while the programs warm, then back in place and visible (they were left hidden) */
          const h = node(id).setVisible(true);
          if (on) h.setPosition(0, -50, -60);
          else h.setPosition(0, 0, 0);
        }
      }

      const batches = [deck, rails, stripes, blocks, bars, gaps, rings, particles];
      return {
        update,
        warm,
        get nodeCount() { return handles.size; },
        get uploadedVertices() { return batches.reduce((sum, b) => sum + b.uploadedVertices, 0); }
      };
    }
  };
}