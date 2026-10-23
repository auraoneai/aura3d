/**
 * Ninja Runner world on the public `@aura3d/engine` surface: the route ribbon, buildings, trees, river and
 * sky (`geometry.dynamic` + `material.custom`), barriers/beams, chakra flames, Rasengan ball, wind
 * shuriken and particles, plus every character: one `cloneSkinned` call builds the hero, three shadow
 * clones and eight enemies with independent skeletons and mixers that share one set of GPU textures.
 * The original's GLB heroes/enemies and remote textures are not redistributed; the characters are the
 * repository's mixamo soldier fixture tinted per form/type (documented in PORTING-NOTES.md).
 */
import { camera, cloneSkinned, geometry, lights, looks, primitives, scene, texture, material, type AuraApp } from "@aura3d/engine";
import { attachRootRenderSource, type TypedGLBActor } from "@aura3d/engine/production-runtime";
import { groundFrame, laneOffset, smooth, COURSE_LENGTH } from "./course";
import { ballSpec, fallsSpec, flameSpec, groundSpec, particleSpec, skySpec, solidSpec, sparksSpec, waterSpec } from "./materials";
import { buildProps, buildRoute, buildSheet, buildWater, type MeshData } from "./meshes";
import { hexLinear, type Rgb } from "./palette";
import { isEnemy, seededRandom, type Entity, type EnemyKind, type SimEvent, type SimState } from "./sim";

export const SOLDIER_URL = "/fixtures/threejs-parity/assets/character/soldier.glb";
/** The soldier fixture faces +Z; characters are turned so +Z points along the route (or back at the runner). */
const MODEL_YAW_OFFSET = 0;
export const ACTOR_COUNT = 12;
const HERO = 0;
const CLONE_SLOTS = [1, 2, 3] as const;
const ENEMY_SLOTS = [4, 5, 6, 7, 8, 9, 10, 11] as const;
const PARTICLES = 320;
const BARRIER_POOL = 8;
const BEAM_POOL = 8;
const SHURIKEN_POOL = 3;

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData, attributes: Record<string, { itemSize: 1 | 2 | 3 | 4; data: Float32Array }> = {}) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), attributes });
}

/** Column-major model matrix: uniform scale, yaw about +Y, translation. */
export function modelMatrix(x: number, y: number, z: number, yaw: number, scale: number): number[] {
  const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
  return [c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, x, y, z, 1];
}

/** Flame sprite the original draws on a 128 x 128 canvas (`texture.canvas`, bound by R-26). */
export function drawFlame(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "#cfffffee"); g.addColorStop(0.42, "#51dfffbb"); g.addColorStop(1, "#19c4ff00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.shadowColor = "#83efff"; ctx.shadowBlur = 14; ctx.fillStyle = "#c7ffff";
  ctx.beginPath(); ctx.moveTo(72, 17); ctx.bezierCurveTo(45, 38, 28, 52, 36, 77); ctx.bezierCurveTo(45, 106, 89, 99, 92, 73); ctx.bezierCurveTo(95, 49, 65, 54, 72, 17); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#107694"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(49, 82); ctx.bezierCurveTo(34, 57, 73, 48, 78, 66); ctx.bezierCurveTo(82, 83, 59, 89, 56, 75); ctx.bezierCurveTo(53, 64, 68, 60, 68, 72); ctx.moveTo(48, 79); ctx.lineTo(40, 92); ctx.lineTo(58, 87); ctx.stroke();
}

export interface ChakraPickup { readonly id: number; readonly s: number; readonly position: readonly [number, number, number] }

export function chakraPickups(entities: readonly Entity[]): ChakraPickup[] {
  return entities.filter((e) => e.type === "chakra").map((e) => {
    const p = groundFrame(e.s, e.lane * laneOffset(e.s), 1.12);
    return { id: e.id, s: e.s, position: [p.x, p.y, p.z] as const };
  });
}

const FORM_TINT: Record<string, { base: readonly [number, number, number, number]; emissive: Rgb; strength: number }> = {
  base: { base: [0.95, 0.52, 0.16, 1], emissive: [0.05, 0.03, 0.0], strength: 0.2 },
  sage: { base: [0.98, 0.62, 0.18, 1], emissive: [1.0, 0.5, 0.1], strength: 0.9 },
  kurama: { base: [1.0, 0.78, 0.2, 1], emissive: [1.0, 0.65, 0.1], strength: 2.2 }
};
const ENEMY_TINT: Record<EnemyKind, readonly [number, number, number, number]> = {
  scout: [0.9, 0.42, 0.2, 1], swordsman: [0.45, 0.5, 0.6, 1], caster: [0.55, 0.3, 0.7, 1], heavy: [0.28, 0.4, 0.28, 1]
};
const CLONE_TINT: readonly [number, number, number, number] = [0.55, 0.78, 1.0, 1];

export interface ActorAssets {
  readonly actors: readonly TypedGLBActor[];
  readonly clip: string;
  readonly clipDuration: number;
  readonly sharedTextureEntries: number;
  readonly sharedTextureRefs: number;
  readonly clips: readonly string[];
  dispose(): void;
}

export async function loadActors(canvas: HTMLCanvasElement): Promise<ActorAssets> {
  const asset = { url: SOLDIER_URL, type: "model" as const, format: "glb" };
  const batch = await cloneSkinned(asset, ACTOR_COUNT, { width: canvas.width, height: canvas.height, idPrefix: "ninja" });
  const first = batch.actors[0]!;
  const clips = first.evidence.clips;
  const clip = clips.includes("Run") ? "Run" : clips[0];
  if (!clip) throw new Error("ninja-runner-port: the soldier fixture exposes no animation clips");
  const info = first.animation.resolvedClipInfos().find((c) => c.name === clip);
  return {
    actors: batch.actors,
    clip,
    clipDuration: info && info.duration > 0 ? info.duration : 1,
    sharedTextureEntries: batch.sharedTextures.size,
    sharedTextureRefs: batch.sharedTextures.refCount,
    clips,
    dispose: () => batch.dispose()
  };
}

export interface WorldOptions { readonly canvas: HTMLCanvasElement; readonly actors: ActorAssets; readonly entities: readonly Entity[] }

export interface WorldRuntime {
  update(state: SimState, dt: number, time: number, events: readonly SimEvent[]): void;
  resetCamera(): void;
  /** World translation of `joint` on every actor after posing each at a staggered clip phase (independence probe). */
  probeBones(joint?: string): { joint: string; translations: [number, number, number][]; distinct: number };
  readonly stats: () => { visibleActors: number; actors: number; pickups: number; particles: number };
  dispose(): void;
}

export interface World { readonly scene: Scene; bind(app: AuraApp): WorldRuntime }

export function buildWorld(options: WorldOptions): World {
  const route = buildRoute(2);
  const flameMap = texture.canvas({ canvas: (() => { const c = document.createElement("canvas"); c.width = c.height = 128; drawFlame(c.getContext("2d")!); return c; })(), colorSpace: "srgb" });
  const builder: Scene = scene()
    .background("#8fb7c9")
    .camera(camera.perspective({ position: [0, 6, 12], target: [0, 2, -20], fov: 57, near: 0.1, far: 3200 }))
    .add(looks.preset("outdoor-day"))
    .add(lights.directional({ position: [-40, 67, 31], intensity: 3, color: "#ffe3b1" }))
    .add(lights.directional({ position: [30, 20, -40], intensity: 0.9, color: "#bcd9ff" }));

  builder.add(geometry.custom(dynamicFrom(route, { tone: { itemSize: 3, data: f32(route.tones) } }), { name: "route", material: material.custom(groundSpec()) }).runtime({ id: "route" }));
  const props = buildProps();
  builder.add(geometry.custom(dynamicFrom(props, { tone: { itemSize: 3, data: f32(props.tones) } }), { name: "props", material: material.custom(groundSpec()) }).runtime({ id: "props" }));
  const water = buildWater();
  builder.add(geometry.custom(dynamicFrom(water), { name: "river", material: material.custom(waterSpec()), position: [0, -2.5, 0] }).runtime({ id: "river" }));
  builder.add(primitives.sphere({ name: "sky", size: 4000, material: material.custom(skySpec()) }).runtime({ id: "sky" }));
  const endFrame = groundFrame(COURSE_LENGTH - 90, 0, 0);
  builder.add(geometry.custom(dynamicFrom(buildSheet(56, 63)), { name: "valley-falls", material: material.custom(fallsSpec()), position: [endFrame.x + 30, endFrame.y - 40, endFrame.z - 30] }).runtime({ id: "valley-falls" }));

  const wood = hexLinear("#8a5a35"), beam = hexLinear("#c2603a"), glowOrange = hexLinear("#ff8a3a");
  for (let i = 0; i < BARRIER_POOL; i++) builder.add(primitives.box({ name: `barrier-${i}`, size: [2.0, 1.5, 0.55], material: material.custom(solidSpec(wood)) }).runtime({ id: `barrier-${i}` }));
  for (let i = 0; i < BEAM_POOL; i++) builder.add(primitives.box({ name: `beam-${i}`, size: [2.5, 0.34, 0.34], material: material.custom(solidSpec(beam, { glow: 0.7, glowColor: glowOrange })) }).runtime({ id: `beam-${i}` }));

  const pickups = chakraPickups(options.entities);
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(pickups.flatMap((p) => [...p.position])),
    topology: "points",
    attributes: { aAlive: { itemSize: 1, data: f32(pickups.map(() => 1)) }, aDistance: { itemSize: 1, data: f32(pickups.map((p) => p.s)) } }
  }), { name: "chakra-flames", material: material.custom(flameSpec(flameMap)) }).runtime({ id: "chakra-flames" }));

  builder.add(primitives.sphere({ name: "rasengan", size: 0.21, material: material.custom(ballSpec()) }).runtime({ id: "rasengan" }));
  const sparkSeeds = Array.from({ length: 90 * 3 }, (_, i) => (((i + 1) * (i % 3 === 0 ? 0.618034 : i % 3 === 1 ? 0.754878 : 0.56984)) % 1));
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(90 * 3).fill(0)),
    topology: "points",
    attributes: { seed: { itemSize: 3, data: f32(sparkSeeds) } }
  }), { name: "rasengan-sparks", material: material.custom(sparksSpec()) }).runtime({ id: "rasengan-sparks" }));
  for (let i = 0; i < SHURIKEN_POOL; i++) builder.add(primitives.sphere({ name: `shuriken-${i}`, size: 1, material: material.custom(ballSpec()) }).runtime({ id: `shuriken-${i}` }));

  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(PARTICLES * 3).fill(0)),
    topology: "points",
    attributes: { tone: { itemSize: 3, data: f32(new Array(PARTICLES * 3).fill(1)) }, aSize: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) }, aAlpha: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) } }
  }), { name: "particles", material: material.custom(particleSpec()) }).runtime({ id: "particles" }));

  return { scene: builder, bind: (app) => bindRuntime(app, options, pickups) };
}

interface Particle { life: number; max: number; vx: number; vy: number; vz: number; gravity: number; size: number; r: number; g: number; b: number; x: number; y: number; z: number }

function bindRuntime(app: AuraApp, options: WorldOptions, pickups: readonly ChakraPickup[]): WorldRuntime {
  const cameraController = app.camera;
  if (!cameraController) throw new Error("ninja-runner-port: the app exposes no camera controller");
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const { actors, clip, clipDuration } = options.actors;
  const clocks = actors.map((_, i) => (i * 0.137) % clipDuration);
  const visible = new Array<boolean>(actors.length).fill(false);
  const tints = new Array<string>(actors.length).fill("");
  const slotEntity = new Map<number, number>();
  const rng = seededRandom(4242);
  const pool: Particle[] = Array.from({ length: PARTICLES }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, gravity: 0, size: 0, r: 1, g: 1, b: 1, x: 0, y: 0, z: 0 }));
  let head = 0;
  const pPos = new Float32Array(PARTICLES * 3), pTone = new Float32Array(PARTICLES * 3), pSize = new Float32Array(PARTICLES), pAlpha = new Float32Array(PARTICLES);
  const aliveFlags = new Float32Array(pickups.length).fill(1);
  const pickupIndex = new Map(pickups.map((p, i) => [p.id, i]));
  let flamesDirty = false;
  let camPos: [number, number, number] | null = null;
  let lastFogMix = -1;
  const fogNodes = ["route", "props", ...Array.from({ length: BARRIER_POOL }, (_, i) => `barrier-${i}`), ...Array.from({ length: BEAM_POOL }, (_, i) => `beam-${i}`)];
  let heroYaw = 0;
  const cloneYaw = new Array<number>(CLONE_SLOTS.length).fill(0);
  const entityById = new Map(options.entities.map((e) => [e.id, e]));

  const emit = (x: number, y: number, z: number, count: number, color: Rgb, speed: number, size: number, life: number, gravity: number): void => {
    for (let k = 0; k < count; k++) {
      const p = pool[head]!;
      head = (head + 1) % PARTICLES;
      const a = rng() * Math.PI * 2, e = rng() * 1.1 - 0.15, v = speed * (0.35 + rng() * 0.65);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * Math.cos(e) * v; p.vy = Math.sin(e) * v + speed * 0.25; p.vz = Math.sin(a) * Math.cos(e) * v;
      p.life = life * (0.6 + rng() * 0.4); p.max = p.life; p.gravity = gravity; p.size = size * (0.6 + rng() * 0.8);
      p.r = color[0]; p.g = color[1]; p.b = color[2];
    }
  };

  const place = (slot: number, entity: { s: number; x: number; y: number }, yawExtra: number, scale: number, clipRate: number, dt: number, show: boolean, tint?: { key: string; base: readonly [number, number, number, number]; emissive?: Rgb; strength?: number }): void => {
    const actor = actors[slot]!;
    visible[slot] = show;
    if (!show) return;
    const f = groundFrame(entity.s, entity.x, entity.y);
    clocks[slot] = (clocks[slot]! + dt * clipRate) % clipDuration;
    actor.playClip(clip, clocks[slot]!);
    if (tint && tints[slot] !== tint.key) {
      tints[slot] = tint.key;
      actor.setTint({ baseColor: tint.base, ...(tint.emissive ? { emissiveColor: tint.emissive } : {}), ...(tint.strength !== undefined ? { emissiveStrength: tint.strength } : {}) });
    }
    (actor as TypedGLBActor & { __mm?: number[] }).__mm = modelMatrix(f.x, f.y, f.z, Math.atan2(f.dx, f.dz) + MODEL_YAW_OFFSET + yawExtra, scale);
  };

  const detach = attachRootRenderSource(options.canvas, {
    source: { collectRenderItems: () => actors.flatMap((actor, i) => visible[i] ? actor.collectRenderItems({ modelMatrix: (actor as TypedGLBActor & { __mm?: number[] }).__mm ?? modelMatrix(0, -1000, 0, 0, 1) }) : []) }
  });

  const window60 = (e: Entity, s: number): number => e.s - s;

  return {
    update(state, dt, time, events) {
      const s = state.s;
      /* sky, fog and animated uniforms */
      const sky = groundFrame(s, 0, 0);
      node("sky").setPosition(sky.x, 0, sky.z);
      const forest = smooth(1470, 1660, s) * (1 - smooth(2110, 2300, s));
      if (Math.abs(forest - lastFogMix) > 0.004) { lastFogMix = forest; for (const id of fogNodes) node(id).setUniform?.("fogMix", forest); }
      node("river").setUniform?.("waterTime", time);
      node("valley-falls").setUniform?.("fallsTime", time);
      const flames = node("chakra-flames");
      flames.setUniform?.("flameTime", time);
      flames.setUniform?.("runnerS", s);

      /* events -> particles, pickups */
      for (const ev of events) {
        const at = (es: number, lane: number, y = 0.9): [number, number, number] => { const p = groundFrame(es, lane * laneOffset(es), y); return [p.x, p.y, p.z]; };
        if (ev.type === "pickup") {
          const i = pickupIndex.get(ev.entity as number);
          if (i !== undefined) { aliveFlags[i] = 0; flamesDirty = true; const p = pickups[i]!.position; emit(p[0], p[1], p[2], 10, [0.3, 0.85, 1], 3, 0.16, 0.5, -2); }
        } else if (ev.type === "kill") { const p = at(ev.s as number, ev.lane as number, 1); emit(p[0], p[1], p[2], 26, ev.heavy ? [1, 0.55, 0.2] : [1, 0.85, 0.5], 6, 0.3, 0.7, 4); }
        else if (ev.type === "land") { const p = groundFrame(s, state.x, 0.1); emit(p.x, p.y, p.z, 8, [0.8, 0.75, 0.6], 2.2, 0.28, 0.5, 1); }
        else if (ev.type === "damage") { const p = groundFrame(s, state.x, 1.2); emit(p.x, p.y, p.z, 18, [1, 0.25, 0.2], 5, 0.26, 0.6, 3); }
        else if (ev.type === "windImpact" || ev.type === "cloneStrike") { const p = at(ev.s as number, ev.lane as number, 1.1); emit(p[0], p[1], p[2], 22, [0.6, 0.95, 1], 6.5, 0.28, 0.6, 0); }
        else if (ev.type === "break") { const p = at(ev.s as number, ev.lane as number, 0.8); emit(p[0], p[1], p[2], 22, [0.85, 0.6, 0.35], 5, 0.3, 0.65, 5); }
        else if (ev.type === "dash") { const p = groundFrame(s, state.x, 1); emit(p.x, p.y, p.z, 20, [0.5, 0.9, 1], 4, 0.25, 0.5, 0); }
        else if (ev.type === "rasengan") { const p = groundFrame(s + 0.8, state.x, 1.2); emit(p.x, p.y, p.z, 12, [0.4, 0.8, 1], 3, 0.2, 0.4, 0); }
      }
      if (flamesDirty) { flames.updateAttribute?.("aAlive", { array: aliveFlags, offset: 0 }); flamesDirty = false; }

      /* hero */
      const heroRate = state.phase === "running" ? 1.1 + (state.speed - 18) * 0.05 : 0.2;
      const heroScale = state.form === "kurama" ? 1.14 : 1;
      const tintKey = `${state.form}${state.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0 ? "-flash" : ""}`;
      const base = FORM_TINT[state.form]!;
      place(HERO, { s, x: state.x, y: Math.max(state.y, state.falling ? state.y : 0) }, MODEL_YAW_OFFSET, heroScale * (state.slide > 0 ? 0.82 : 1), heroRate, dt, true,
        { key: tintKey, base: tintKey.endsWith("-flash") ? [1, 1, 1, 1] : base.base, emissive: base.emissive, strength: base.strength });
      const hf = groundFrame(s, state.x, state.y);
      heroYaw = Math.atan2(hf.dx, hf.dz);

      /* shadow clones */
      CLONE_SLOTS.forEach((slot, k) => {
        const show = state.clones > 0;
        const lateral = [-1.5, 1.5, 0][k]!;
        const behind = [0.6, 0.6, 2.4][k]!;
        cloneYaw[k] = heroYaw;
        place(slot, { s: s - behind, x: state.x + lateral, y: state.y }, 0, 0.96, heroRate * (1 + k * 0.07), dt, show, { key: "clone", base: CLONE_TINT, emissive: [0.2, 0.5, 1], strength: 1.2 });
      });

      /* enemies: stable slot per entity while in window */
      const window: Entity[] = [];
      for (const e of state.entities) {
        if (!isEnemy(e)) continue;
        const d = window60(e, s);
        if (d > 72 || d < -6) continue;
        if (!e.alive && state.time - e.defeatedAt > 0.45) continue;
        window.push(e);
      }
      window.sort((a, b) => a.s - b.s);
      const wanted = new Set(window.slice(0, ENEMY_SLOTS.length).map((e) => e.id));
      for (const [slot, id] of slotEntity) if (!wanted.has(id)) slotEntity.delete(slot);
      const assigned = new Set(slotEntity.values());
      for (const e of window.slice(0, ENEMY_SLOTS.length)) {
        if (assigned.has(e.id)) continue;
        const free = ENEMY_SLOTS.find((sl) => !slotEntity.has(sl));
        if (free !== undefined) { slotEntity.set(free, e.id); assigned.add(e.id); tints[free] = ""; }
      }
      for (const slot of ENEMY_SLOTS) {
        const id = slotEntity.get(slot);
        const e = id === undefined ? undefined : entityById.get(id);
        if (!e) { visible[slot] = false; continue; }
        const dead = !e.alive;
        const pop = dead ? Math.max(0, 1 - (state.time - e.defeatedAt) / 0.45) : 1;
        place(slot, { s: e.s, x: e.lane * laneOffset(e.s), y: e.y + (dead ? (1 - pop) * 1.6 : 0) }, Math.PI, (e.type === "heavy" ? 1.35 : 1) * (0.4 + 0.6 * pop), e.approachSpeed > 0 ? 1.4 : 0.5, dt, pop > 0.02,
          { key: e.type, base: ENEMY_TINT[e.type as EnemyKind] });
      }

      /* barriers and beams */
      const barriers = state.entities.filter((e) => e.type === "barrier" && e.alive && e.s - s > -6 && e.s - s < 90);
      const beams = state.entities.filter((e) => e.type === "beam" && e.alive && e.s - s > -6 && e.s - s < 90);
      for (let i = 0; i < BARRIER_POOL; i++) {
        const e = barriers[i];
        const h = node(`barrier-${i}`);
        h.setVisible(!!e);
        if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), 0.75); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
      }
      for (let i = 0; i < BEAM_POOL; i++) {
        const e = beams[i];
        const h = node(`beam-${i}`);
        h.setVisible(!!e);
        if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), 1.1); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
      }

      /* Rasengan ball + sparks, wind shuriken */
      const ball = node("rasengan");
      const casting = state.attack > 0 || state.shurikenCast > 0;
      ball.setVisible(casting);
      const sparks = node("rasengan-sparks");
      sparks.setVisible(casting);
      if (casting) {
        const f = groundFrame(s + 0.7, state.x + 0.25, state.y + 1.15);
        const k = state.shurikenCast > 0 ? 3.2 : 1;
        ball.setPosition(f.x, f.y, f.z);
        ball.setScale(k);
        ball.setUniform?.("ballTime", time);
        ball.setUniform?.("ballOpacity", 1);
        sparks.setPosition(f.x, f.y, f.z);
        sparks.setUniform?.("sparkTime", time);
        sparks.setUniform?.("sparkStrength", 1);
      }
      for (let i = 0; i < SHURIKEN_POOL; i++) {
        const sh = state.shurikens[i];
        const h = node(`shuriken-${i}`);
        h.setVisible(!!sh);
        if (sh) {
          const f = groundFrame(sh.s, sh.x, 1.1);
          h.setPosition(f.x, f.y, f.z);
          h.setScale([2.4, 0.22, 2.4]);
          h.setRotation(0, time * 18, 0);
          h.setUniform?.("ballTime", time);
          h.setUniform?.("ballOpacity", 0.9);
        }
      }

      /* particles */
      for (let i = 0; i < PARTICLES; i++) {
        const p = pool[i]!;
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        }
        const alive = p.life > 0;
        const t = alive ? p.life / p.max : 0;
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
        pTone[i * 3] = p.r; pTone[i * 3 + 1] = p.g; pTone[i * 3 + 2] = p.b;
        pSize[i] = alive ? p.size : 0;
        pAlpha[i] = alive ? t * 0.9 : 0;
      }
      const particles = node("particles");
      particles.updateAttribute?.("position", { array: pPos, offset: 0 });
      particles.updateAttribute?.("tone", { array: pTone, offset: 0 });
      particles.updateAttribute?.("aSize", { array: pSize, offset: 0 });
      particles.updateAttribute?.("aAlpha", { array: pAlpha, offset: 0 });

      /* chase camera: the original's offsets, eased with 1 - exp(-7 dt) */
      const widen = smooth(2220, 2410, s);
      const eyeF = groundFrame(s - 6.4 - widen * 3.4, state.x * 0.45, 3.35 + widen * 0.95 + state.y * 0.22);
      const lookF = groundFrame(s + 12 + widen * 6, state.x * 0.38, 1.6 + widen * 0.35 + state.y * 0.15);
      const k = camPos ? 1 - Math.exp(-7 * dt) : 1;
      camPos = camPos ? [camPos[0] + (eyeF.x - camPos[0]) * k, camPos[1] + (eyeF.y - camPos[1]) * k, camPos[2] + (eyeF.z - camPos[2]) * k] : [eyeF.x, eyeF.y, eyeF.z];
      cameraController.setPose({ position: camPos, target: [lookF.x, lookF.y, lookF.z], fov: 57 }, { cut: false });
    },
    resetCamera() { camPos = null; },
    probeBones(joint) {
      const names = actors[0]!.animation.skeletonJointNames();
      const name = joint && names.includes(joint) ? joint : names.includes("mixamorig:LeftForeArm") ? "mixamorig:LeftForeArm" : names[0]!;
      const translations: [number, number, number][] = actors.map((actor, i) => {
        actor.playClip(clip, (i * 0.0713) % clipDuration);
        const graph = actor.pipeline.resources.scene;
        graph.updateWorldTransforms();
        const n = graph.findByName(name)[0];
        const m = n?.transform.worldMatrix;
        return m ? [m[12]!, m[13]!, m[14]!] : [0, 0, 0];
      });
      return { joint: name, translations, distinct: new Set(translations.map((t) => t.map((v) => v.toFixed(4)).join(","))).size };
    },
    stats: () => ({ visibleActors: visible.filter(Boolean).length, actors: actors.length, pickups: pickups.length, particles: pool.filter((p) => p.life > 0).length }),
    dispose() { detach(); }
  };
}
