/**
 * Ninja Runner world on the public `@aura3d/engine` surface. The ground is lit PBR (one mesh per biome and surface),
 * the village, rooftops, crossing, forest and valley are instanced PBR scenery (`scenery.ts`), lit by the outdoor-day
 * look (HDRI, shadowed key light) plus a hemisphere fill, exponential fog, bloom, contact shadows and a vignette. The
 * sky, river, falls, chakra flames, Rasengan orb, wind shuriken, auras and particles keep their ported `material.custom`
 * shaders. Every character comes from one `cloneSkinned` call: the hero, three shadow clones and eight enemies share one
 * rigged model (CC0, see assets/ATTRIBUTION.md) with independent skeletons and animation, differentiated by tint, scale
 * and attached weapons.
 */
import { attachRootRenderSource, camera, cloneSkinned, effects, environments, geometry, instances, lights, material, primitives, scene, texture, type AuraApp, type TypedGLBActor } from "@aura3d/engine";
import { groundFrame, laneOffset, smooth, COURSE_LENGTH } from "./course";
import { auraSpec, ballSpec, fallsSpec, flameSpec, particleSpec, skySpec, solidSpec, sparksSpec, waterSpec } from "./materials";
import { buildRouteGroups, buildSheet, buildTownFloor, buildWater } from "./meshes";
import { hexLinear, type Rgb } from "./palette";
import { LAYERS, buildScenery, type LayerSpec, type ModelSink, type ShapeId, type SurfaceKey } from "./scenery";
import { unitBox, unitCone, unitCylinder, unitDisc, unitGable, unitHip, unitRock, unitSphere, type Shape } from "./shapes";
import { normalFromHeight, paintBark, paintCobble, paintDirt, paintGrass, paintLeaf, paintPlanks, paintPlaster, paintTiles, type Raster } from "./textures";
import { TUNING, isEnemy, seededRandom, type Entity, type EnemyKind, type SimEvent, type SimState } from "./sim";
import { CHARACTER_URLS, PROP_ASSETS, SLOT_MODEL, type CharacterId } from "./models";

/** The rig faces +Z; characters are turned so +Z points along the route (or back at the runner). */
const MODEL_YAW_OFFSET = 0;
export const ACTOR_COUNT = 13;
const HERO = 0;
const CLONE_SLOTS = [1, 2, 3] as const;
const ENEMY_SLOTS = [4, 5, 6, 7, 8, 9, 10, 11] as const;
/** The sage model stands in for the hero in the Sage and Kurama forms (slot 12); heavy enemies use the brute slots. */
const SAGE = 12;
const BRUTE_SLOTS = [10, 11] as const;
const SOLDIER_SLOTS = [4, 5, 6, 7, 8, 9] as const;
const BONES = { handR: "RightHand", foreR: "RightForeArm", handL: "LeftHand" } as const;
const PARTICLES = 480;
const BARRIER_POOL = 8;
const BEAM_POOL = 8;
const SHURIKEN_POOL = 3;
const TOWN_FLOOR_Y = 3.2;

/** Canonical clip names: every character GLB is merged with these names (see tools/crayon-capture/ninja-runner-meshy-merge.mjs). */
const CLIPS = {
  run: "run", jump: "jump", idle: "idle", slide: "slide", punch: "punch", jab: "jab", sword: "sword",
  block: "block", hit: "hit", death: "death"
} as const;
const ENEMY_ATTACK_CLIP: Record<EnemyKind, string> = { scout: CLIPS.jab, swordsman: CLIPS.sword, caster: CLIPS.block, heavy: CLIPS.punch };

type Scene = ReturnType<typeof scene>;
type Vec3 = [number, number, number];
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function defineShape(s: Shape) {
  return geometry.define({ positions: f32(s.positions), normals: f32(s.normals), uvs: f32(s.uvs), indices: Uint32Array.from(s.indices) });
}
const SHAPES: Record<ShapeId, () => Shape> = {
  box: unitBox, gable: unitGable, hip: unitHip, cylinder: () => unitCylinder(10), cone: () => unitCone(9), sphere: () => unitSphere(12, 8), rock: () => unitRock(7)
};
type TextureHandle = ReturnType<typeof texture.canvas>;
interface Surface { readonly albedo: TextureHandle; readonly normal?: TextureHandle }

const canvasOf = (rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return c;
};

/** Upload a painted raster as a repeating base-colour map and, with a strength, a normal map from its height field. */
function surface(r: Raster, normalStrength: number | null, repeat: readonly [number, number] = [1, 1]): Surface {
  const make = (rgba: Uint8ClampedArray, space: "srgb" | "linear"): TextureHandle => {
    const t = texture.canvas({ canvas: canvasOf(rgba, r.width, r.height), colorSpace: space });
    t.wrapS = "repeat"; t.wrapT = "repeat"; t.anisotropy = 8; t.repeat = repeat;
    return t;
  };
  return { albedo: make(r.rgba, "srgb"), ...(normalStrength !== null ? { normal: make(normalFromHeight(r, normalStrength), "linear") } : {}) };
}

const mapped = (s: Surface, color: string, roughness: number, extra: { metallic?: number } = {}) => material.pbr({
  color, roughness, ...(extra.metallic !== undefined ? { metallic: extra.metallic } : {}), texture: s.albedo as never, textureAnisotropy: 8,
  ...(s.normal ? { normal: s.normal, normalScale: 1 } : {})
});

type PathKind = "cobble" | "tiles" | "planks" | "dirt";
const PATH_SURFACE: Record<string, readonly [PathKind, string]> = {
  village: ["cobble", "#ffffff"], alley: ["cobble", "#d6cabb"], stairs: ["cobble", "#ffffff"], rooftops: ["tiles", "#ffffff"], descent: ["cobble", "#ffffff"],
  riverside: ["cobble", "#d6cabb"], bridge: ["planks", "#ffffff"], forest_entry: ["dirt", "#ffffff"], forest: ["dirt", "#ffffff"], forest_exit: ["dirt", "#ffffff"], water: ["cobble", "#ffffff"]
};
const VERGE_TINT: Record<string, string> = {
  village: "#ffffff", alley: "#ffffff", stairs: "#ffffff", rooftops: "#b0a298", descent: "#ffffff", riverside: "#ffffff", bridge: "#ffffff", forest_entry: "#8fb088", forest: "#8fb088", forest_exit: "#8fb088", water: "#ffffff"
};

function paintSurfaces() {
  return {
    cobble: surface(paintCobble(512, 1), 2.4), dirt: surface(paintDirt(256, 2), 1.6), tiles: surface(paintTiles(256, 3, "#527c70"), 1.8, [0.5, 0.5]),
    planks: surface(paintPlanks(256, 4), 1.4), grass: surface(paintGrass(256, 5), 0.8)
  } as const;
}

const layerSurface = (key: SurfaceKey, repeat: readonly [number, number]): Surface => {
  switch (key) {
    case "plaster": return surface(paintPlaster(256, 6), 0.9, repeat);
    case "tiles": return surface(paintTiles(256, 9, "#e6e6e6"), 1.8, repeat);
    case "bark": return surface(paintBark(128, 7), 1.6, repeat);
    case "leaf": return surface(paintLeaf(256, 8), 2.2, repeat);
  }
};

const layerMaterial = (l: LayerSpec) => {
  if (l.emissive) return material.emissive({ color: "#ffffff", emissive: l.emissive });
  if (l.map) return mapped(layerSurface(l.map, l.repeat ?? [1, 1]), "#ffffff", l.roughness, { metallic: l.metalness });
  return material.pbr({ color: "#ffffff", roughness: l.roughness, metallic: l.metalness });
};

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

interface Tint { readonly base: readonly [number, number, number, number]; readonly emissive?: Rgb; readonly strength?: number }
const FORM_TINT: Record<string, Tint> = {
  base: { base: [1, 1, 1, 1], emissive: [0.03, 0.02, 0], strength: 0.1 },
  sage: { base: [1, 1, 1, 1], emissive: [1, 0.5, 0.12], strength: 0.16 },
  kurama: { base: [1, 0.86, 0.5, 1], emissive: [1, 0.62, 0.1], strength: 0.4 }
};
const ENEMY_TINT: Record<EnemyKind, readonly [number, number, number, number]> = {
  scout: [1, 0.8, 0.72, 1], swordsman: [0.8, 0.86, 1, 1], caster: [0.92, 0.8, 1, 1], heavy: [1, 1, 1, 1]
};
const CLONE_TINT: Tint = { base: [0.6, 0.85, 1, 1], emissive: [0.18, 0.45, 1], strength: 0.55 };
const FLASH_TINT: Tint = { base: [1, 1, 1, 1], emissive: [1, 1, 1], strength: 1.4 };

export interface ActorAssets {
  readonly actors: readonly TypedGLBActor[];
  readonly clip: string;
  readonly clipDuration: number;
  /** Clip durations per actor slot (each character GLB has its own clip set). */
  readonly slotDurations: readonly Readonly<Record<string, number>>[];
  readonly slotClips: readonly (readonly string[])[];
  readonly sharedTextureEntries: number;
  readonly sharedTextureRefs: number;
  readonly clips: readonly string[];
  dispose(): void;
}

/** One `cloneSkinned` call per distinct character model: hero (+ shadow clones), foot soldiers, brutes and the sage. */
export async function loadActors(canvas: HTMLCanvasElement): Promise<ActorAssets> {
  const slotsOf = (id: CharacterId): number[] => SLOT_MODEL.flatMap((m, slot) => (m === id ? [slot] : []));
  const order: CharacterId[] = ["hero", "soldier", "brute", "sage"];
  const actors: TypedGLBActor[] = new Array(ACTOR_COUNT);
  const batches: Awaited<ReturnType<typeof cloneSkinned>>[] = [];
  for (const id of order) {
    const slots = slotsOf(id);
    const asset = { url: CHARACTER_URLS[id], type: "model" as const, format: "glb" };
    const batch = await cloneSkinned(asset, slots.length, { width: canvas.width, height: canvas.height, idPrefix: `ninja-${id}` });
    batches.push(batch);
    slots.forEach((slot, i) => { actors[slot] = batch.actors[i]!; });
  }
  const slotClips = actors.map((a) => a.evidence.clips);
  const slotDurations = actors.map((a, i) => {
    const infos = a.animation.resolvedClipInfos();
    const d: Record<string, number> = {};
    for (const c of slotClips[i]!) { const info = infos.find((x) => x.name === c); d[c] = info && info.duration > 0 ? info.duration : 1; }
    return d;
  });
  const first = actors[HERO]!;
  const clips = first.evidence.clips;
  const clip = clips.includes(CLIPS.run) ? CLIPS.run : clips[0];
  if (!clip) throw new Error("ninja-runner-port: the character rig exposes no animation clips");
  return {
    actors,
    clip,
    clipDuration: slotDurations[HERO]![clip] ?? 1,
    slotDurations,
    slotClips,
    sharedTextureEntries: batches.reduce((n, b) => n + b.sharedTextures.size, 0),
    sharedTextureRefs: batches.reduce((n, b) => n + b.sharedTextures.refCount, 0),
    clips,
    dispose: () => { for (const b of batches) b.dispose(); }
  };
}

export interface WorldOptions { readonly canvas: HTMLCanvasElement; readonly actors: ActorAssets; readonly entities: readonly Entity[]; readonly quality?: "low" | "high" }

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
  const high = options.quality !== "low";
  const flameMap = texture.canvas({ canvas: (() => { const c = document.createElement("canvas"); c.width = c.height = 128; drawFlame(c.getContext("2d")!); return c; })(), colorSpace: "srgb" });
  const builder: Scene = scene()
    .background("#8fb7c9")
    .camera(camera.perspective({ position: [0, 6, 12], target: [0, 2, -20], fov: 57, near: 0.1, far: 3200 }))
    .add(environments.hdri({ name: "sky ibl", intensity: 0.7, background: false, texture: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" } as never }))
    // Cast shadows are off on purpose: with this scene the engine's cascaded shadow lookup marks every receiver as fully shadowed (probes in PORTING-NOTES.md), so the sun shades by direction only and the actors keep blob shadows.
    .add(lights.directional({ name: "sun", position: [-40, 67, 56], target: [0, 0, 0], intensity: 2.8, color: "#ffe3b1", shadow: false }))
    .add(lights.hemisphere({ name: "sky fill", skyColor: "#d3ebf3", groundColor: "#80715b", intensity: 0.5 }))
    .add(lights.directional({ name: "cool rim", position: [30, 20, -40], intensity: 0.4, color: "#bcd9ff" }))
    .add(effects.fog({ name: "haze", color: "#b5c8c4", density: 0.0028 }));
  if (high) builder.add(effects.ambientOcclusion({ name: "ao" }));
  builder
    .add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.0, radius: 0.4 }))
    .add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.08 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.7 }))
    .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));

  const ground = paintSurfaces();
  /* ground groups that share a surface and tint become one mesh (one draw call) */
  const merged = new Map<string, { surf: Surface; tint: string; rough: number; positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
  for (const g of buildRouteGroups(2)) {
    const [kind, pathTint] = PATH_SURFACE[g.biome]!;
    const path = g.zone === "path";
    const surf = path ? ground[kind] : g.biome === "rooftops" ? ground.tiles : ground.grass;
    const tint = path ? pathTint : VERGE_TINT[g.biome]!;
    const key = `${path ? kind : g.biome === "rooftops" ? "tiles" : "grass"}|${tint}`;
    let m = merged.get(key);
    if (!m) merged.set(key, m = { surf, tint, rough: path ? 0.92 : 1, positions: [], normals: [], uvs: [], indices: [] });
    const base = m.positions.length / 3;
    for (let i = 0; i < g.mesh.positions.length; i++) { m.positions.push(g.mesh.positions[i]!); m.normals.push(g.mesh.normals[i]!); }
    for (let i = 0; i < g.mesh.uvs.length; i++) m.uvs.push(g.mesh.uvs[i]!);
    for (const idx of g.mesh.indices) m.indices.push(idx + base);
  }
  for (const [key, m] of merged) {
    const spec = geometry.define({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
    builder.add(geometry.custom(spec, { name: `ground-${key}`, material: mapped(m.surf, m.tint, m.rough), castShadow: false, receiveShadow: true }));
  }
  const floor = buildTownFloor(520, 1030, 130, TOWN_FLOOR_Y);
  builder.add(geometry.custom(geometry.define({ positions: f32(floor.positions), normals: f32(floor.normals), uvs: f32(floor.uvs), indices: Uint32Array.from(floor.indices) }), {
    name: "town-floor", material: mapped(ground.cobble, "#a39b8a", 0.95), castShadow: false, receiveShadow: true
  }));

  const modelSink: ModelSink = {};
  for (const layer of buildScenery(modelSink)) {
    const spec = LAYERS.find((l) => l.id === layer.id)!;
    const mesh = instances.mesh(defineShape(SHAPES[layer.shape]()), layerMaterial(spec), layer.placements.length);
    layer.placements.forEach((p, i) => { mesh.setMatrixAt(i, p.matrix); mesh.setColorAt(i, [...hexLinear(p.color), 1]); });
    mesh.computeBoundingSphere();
    builder.add(spec.castShadow ? mesh : ({ ...mesh.toJSON(), castShadow: false } as ReturnType<typeof mesh.toJSON>));
  }

  for (const [id, list] of Object.entries(modelSink)) {
    if (list.length === 0) continue;
    const asset = PROP_ASSETS[id as keyof typeof PROP_ASSETS];
    builder.add(instances.model(asset, {
      name: `model-${id}`,
      castShadow: false,
      transforms: list.map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as [number, number, number], scale: p.scale })),
      ...(list.some((p) => p.tint) ? { colors: list.map((p) => p.tint ?? "#ffffff") } : {})
    }));
  }

  const water = buildWater();
  builder.add(geometry.custom(geometry.dynamic({ positions: f32(water.positions), normals: f32(water.normals), uvs: f32(water.uvs), indices: Uint32Array.from(water.indices) }), { name: "river", material: material.custom(waterSpec()), position: [0, -2.5, 0] }).runtime({ id: "river" }));
  builder.add(primitives.sphere({ name: "sky", size: 4000, material: material.custom(skySpec()) }).runtime({ id: "sky" }));
  const endFrame = groundFrame(COURSE_LENGTH - 90, 0, 0);
  const sheet = buildSheet(56, 63);
  builder.add(geometry.custom(geometry.dynamic({ positions: f32(sheet.positions), normals: f32(sheet.normals), uvs: f32(sheet.uvs), indices: Uint32Array.from(sheet.indices) }), { name: "valley-falls", material: material.custom(fallsSpec()), position: [endFrame.x + 30, endFrame.y - 40, endFrame.z - 30] }).runtime({ id: "valley-falls" }));

  const crate = material.pbr({ color: "#8a5a35", roughness: 0.86 });
  const strap = material.pbr({ color: "#3a3028", roughness: 0.6, metallic: 0.3 });
  const beam = hexLinear("#c2603a"), glowOrange = hexLinear("#ff8a3a");
  for (let i = 0; i < BARRIER_POOL; i++) {
    builder.add(primitives.box({ name: `barrier-${i}`, size: [2.0, 1.5, 0.55], material: crate, castShadow: true }).runtime({ id: `barrier-${i}` }));
    builder.add(primitives.box({ name: `barrier-band-${i}`, size: [2.1, 0.2, 0.62], material: strap, castShadow: true }).runtime({ id: `barrier-band-${i}` }));
    builder.add(primitives.box({ name: `barrier-top-${i}`, size: [2.2, 0.14, 0.7], material: material.pbr({ color: "#c8a57b", roughness: 0.8 }), castShadow: true }).runtime({ id: `barrier-top-${i}` }));
  }
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
  builder.add(primitives.sphere({ name: "aura", size: 1, material: material.custom(auraSpec()) }).runtime({ id: "aura" }));

  const steel = material.pbr({ color: "#cfd6dc", roughness: 0.28, metallic: 0.85 });
  const club = material.pbr({ color: "#5a4332", roughness: 0.8 });
  for (let i = 0; i < ENEMY_SLOTS.length; i++) {
    builder.add(primitives.box({ name: `blade-${i}`, size: [0.07, 0.05, 1], material: steel, castShadow: false }).runtime({ id: `blade-${i}` }));
    builder.add(primitives.box({ name: `club-${i}`, size: [0.26, 0.26, 1.1], material: club, castShadow: false }).runtime({ id: `club-${i}` }));
    builder.add(primitives.sphere({ name: `orb-${i}`, size: 0.3, material: material.custom(ballSpec()) }).runtime({ id: `orb-${i}` }));
  }

  const blobShadow = solidSpec([0.02, 0.025, 0.02], { alpha: 0.4 });
  const disc = defineShape(unitDisc(20));
  for (let i = 0; i < ACTOR_COUNT; i++) builder.add(geometry.custom(disc, { name: `blob-${i}`, material: material.custom(blobShadow), castShadow: false, receiveShadow: false }).runtime({ id: `blob-${i}` }));

  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(PARTICLES * 3).fill(0)),
    topology: "points",
    attributes: { tone: { itemSize: 3, data: f32(new Array(PARTICLES * 3).fill(1)) }, aSize: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) }, aAlpha: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) } }
  }), { name: "particles", material: material.custom(particleSpec()) }).runtime({ id: "particles" }));

  return { scene: builder, bind: (app) => bindRuntime(app, options, pickups) };
}

interface Particle { life: number; max: number; vx: number; vy: number; vz: number; gravity: number; size: number; r: number; g: number; b: number; x: number; y: number; z: number }
interface Anim { clip: string; t?: number; rate?: number }
interface SceneNodeLike { transform: { worldMatrix: ArrayLike<number> } }

const normalize = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function bindRuntime(app: AuraApp, options: WorldOptions, pickups: readonly ChakraPickup[]): WorldRuntime {
  const cameraController = app.camera;
  if (!cameraController) throw new Error("ninja-runner-port: the app exposes no camera controller");
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const { actors, slotDurations, slotClips } = options.actors;
  const clipLength = (clip: string, slot: number = HERO): number => slotDurations[slot]?.[clip] ?? options.actors.clipDuration;
  const has = (clip: string, slot: number = HERO): string => {
    const list = slotClips[slot]!;
    return list.includes(clip) ? clip : list.includes(CLIPS.idle) ? CLIPS.idle : list[0]!;
  };
  let activeHero = HERO;
  const loopClock = actors.map((_, i) => i * 0.137);
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
  let lastDamage = -10, lostAt = -1, lastFormShift = -10, dustClock = 0, auraClock = 0;
  const entityById = new Map(options.entities.map((e) => [e.id, e]));
  const mm = actors.map(() => modelMatrix(0, -1000, 0, 0, 1));
  const graphs = actors.map((a) => a.pipeline.resources.scene);
  const boneCache = actors.map(() => new Map<string, SceneNodeLike | undefined>());
  const bone = (slot: number, name: string): SceneNodeLike | undefined => {
    const cache = boneCache[slot]!;
    if (!cache.has(name)) cache.set(name, graphs[slot]!.findByName(name)[0] as SceneNodeLike | undefined);
    return cache.get(name);
  };
  /** World position of a joint after the slot's current pose (call `refresh` first). */
  const boneWorld = (slot: number, name: string): Vec3 | null => {
    const m = bone(slot, name)?.transform.worldMatrix;
    if (!m) return null;
    const x = m[12]!, y = m[13]!, z = m[14]!, t = mm[slot]!;
    return [t[0]! * x + t[4]! * y + t[8]! * z + t[12]!, t[1]! * x + t[5]! * y + t[9]! * z + t[13]!, t[2]! * x + t[6]! * y + t[10]! * z + t[14]!];
  };
  const refresh = (slot: number): void => graphs[slot]!.updateWorldTransforms();

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

  const setTint = (slot: number, key: string, tint: Tint): void => {
    if (tints[slot] === key) return;
    tints[slot] = key;
    actors[slot]!.setTint({ baseColor: tint.base, ...(tint.emissive ? { emissiveColor: tint.emissive } : {}), ...(tint.strength !== undefined ? { emissiveStrength: tint.strength } : {}) });
  };

  const place = (slot: number, entity: { s: number; x: number; y: number }, yawExtra: number, scale: number, anim: Anim, dt: number, show: boolean): void => {
    const actor = actors[slot]!;
    visible[slot] = show;
    node(`blob-${slot}`).setVisible(show);
    if (!show) return;
    const f = groundFrame(entity.s, entity.x, entity.y);
    const clip = has(anim.clip, slot);
    const length = clipLength(clip, slot);
    let t = anim.t;
    if (t === undefined) { loopClock[slot] = (loopClock[slot]! + dt * (anim.rate ?? 1)) % length; t = loopClock[slot]!; }
    actor.playClip(clip, Math.max(0, Math.min(length, t)) % (length + 1e-6));
    mm[slot] = modelMatrix(f.x, f.y, f.z, Math.atan2(f.dx, f.dz) + MODEL_YAW_OFFSET + yawExtra, scale);
    (actor as TypedGLBActor & { __mm?: number[] }).__mm = mm[slot];
    const g = groundFrame(entity.s, entity.x, 0.1);
    const lift = Math.max(0, entity.y);
    const blob = node(`blob-${slot}`);
    blob.setPosition(g.x, g.y, g.z);
    blob.setScale([0.62 * scale * (1 - Math.min(0.5, lift * 0.1)), 1, 0.62 * scale * (1 - Math.min(0.5, lift * 0.1))]);
    blob.setUniform?.("solidAlpha", 0.42 * (1 - Math.min(0.7, lift * 0.14)));
  };

  const detach = attachRootRenderSource(options.canvas, {
    source: { collectRenderItems: () => actors.flatMap((actor, i) => visible[i] ? actor.collectRenderItems({ modelMatrix: mm[i]! }).map((item) => ({ ...item, castShadow: false })) : []) }
  });

  const aim = (id: string, from: Vec3, to: Vec3, length: number, grip = 0.12): void => {
    const d = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    const h = node(id);
    h.setVisible(true);
    h.setPosition(to[0] + d[0] * (length / 2 - grip), to[1] + d[1] * (length / 2 - grip), to[2] + d[2] * (length / 2 - grip));
    h.setRotation(-Math.asin(Math.max(-1, Math.min(1, d[1]))), Math.atan2(d[0], d[2]), 0);
    h.setScale([1, 1, length]);
  };
  const hideWeapons = (i: number): void => { for (const k of ["blade", "club", "orb"]) node(`${k}-${i}`).setVisible(false); };

  return {
    update(state, dt, time, events) {
      const s = state.s;
      /* sky, fog and animated uniforms */
      const sky = groundFrame(s, 0, 0);
      node("sky").setPosition(sky.x, 0, sky.z);
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
          if (i !== undefined) { aliveFlags[i] = 0; flamesDirty = true; const p = pickups[i]!.position; emit(p[0], p[1], p[2], 12, [0.3, 0.85, 1], 3, 0.18, 0.55, -2); }
        } else if (ev.type === "kill") { const p = at(ev.s as number, ev.lane as number, 1); emit(p[0], p[1], p[2], ev.heavy ? 40 : 28, ev.heavy ? [1, 0.55, 0.2] : [1, 0.85, 0.5], 6, 0.32, 0.75, 4); }
        else if (ev.type === "land") { const p = groundFrame(s, state.x, 0.1); emit(p.x, p.y, p.z, 10, [0.8, 0.75, 0.6], 2.4, 0.3, 0.55, 1); }
        else if (ev.type === "damage") { lastDamage = time; const p = groundFrame(s, state.x, 1.2); emit(p.x, p.y, p.z, 22, [1, 0.25, 0.2], 5, 0.28, 0.65, 3); }
        else if (ev.type === "windImpact" || ev.type === "cloneStrike") { const p = at(ev.s as number, ev.lane as number, 1.1); emit(p[0], p[1], p[2], 24, [0.6, 0.95, 1], 6.5, 0.3, 0.65, 0); }
        else if (ev.type === "break") { const p = at(ev.s as number, ev.lane as number, 0.8); emit(p[0], p[1], p[2], 26, [0.85, 0.6, 0.35], 5, 0.32, 0.7, 5); }
        else if (ev.type === "dash") { const p = groundFrame(s, state.x, 1); emit(p.x, p.y, p.z, 24, [0.5, 0.9, 1], 4, 0.26, 0.55, 0); }
        else if (ev.type === "rasengan") { const p = groundFrame(s + 0.8, state.x, 1.2); emit(p.x, p.y, p.z, 12, [0.4, 0.8, 1], 3, 0.2, 0.4, 0); }
        else if (ev.type === "form" || ev.type === "unlock") {
          lastFormShift = time;
          const p = groundFrame(s, state.x, 0.9);
          emit(p.x, p.y, p.z, 46, ev.form === "kurama" ? [1, 0.7, 0.18] : [1, 0.62, 0.22], 7, 0.34, 0.9, -1.5);
        } else if (ev.type === "enemyAttack") { const p = at(ev.s as number, ev.lane as number, 1.2); emit(p[0], p[1], p[2], 8, [1, 0.5, 0.3], 3, 0.2, 0.35, 0); }
      }
      if (flamesDirty) { flames.updateAttribute?.("aAlive", { array: aliveFlags, offset: 0 }); flamesDirty = false; }

      /* hero: pick a clip from the sim state */
      if (state.phase === "lost" && lostAt < 0) lostAt = time;
      if (state.phase !== "lost") lostAt = -1;
      const grounded = state.y < 0.06 && !state.falling;
      const hitAge = time - lastDamage;
      let anim: Anim;
      if (state.phase === "lost") anim = { clip: CLIPS.death, t: Math.min(clipLength(CLIPS.death) * 0.98, Math.max(0, time - lostAt) * 0.9) };
      else if (state.phase === "intro" || state.phase === "paused") anim = { clip: CLIPS.idle, rate: 0.8 };
      else if (hitAge < 0.32 && state.phase === "running") anim = { clip: CLIPS.hit, t: hitAge };
      else if (state.shurikenCast > 0) anim = { clip: CLIPS.sword, t: Math.min(1, (state.time - state.shurikenStartedAt) / TUNING.shurikenWindup) * clipLength(CLIPS.sword) * 0.55 };
      else if (state.attack > 0) anim = { clip: CLIPS.punch, t: Math.min(1, (state.time - state.attackStartedAt) / TUNING.attackDuration) * clipLength(CLIPS.punch) * 0.9 };
      else if (!grounded) anim = { clip: CLIPS.jump, rate: 0.9 };
      else if (state.slide > 0) anim = { clip: CLIPS.slide, rate: 1 };
      else anim = { clip: CLIPS.run, rate: (state.dash > 0 ? 1.7 : 1) * (1.15 + (state.speed - 18) * 0.05) };
      const heroScale = state.form === "kurama" ? 1.12 : 1;
      const flash = state.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0;
      const heroTint = flash ? FLASH_TINT : FORM_TINT[state.form]!;
      const heroSlot = state.form === "base" ? HERO : SAGE;
      activeHero = heroSlot;
      setTint(heroSlot, flash ? "flash" : state.form, heroTint);
      place(heroSlot, { s, x: state.x, y: Math.max(state.y, state.falling ? state.y : 0) }, MODEL_YAW_OFFSET, heroScale * (state.slide > 0 ? 0.9 : 1), anim, dt, true);
      place(heroSlot === HERO ? SAGE : HERO, { s, x: state.x, y: 0 }, 0, 1, anim, dt, false);

      /* shadow clones */
      CLONE_SLOTS.forEach((slot, k) => {
        const show = state.clones > 0;
        const lateral = [-1.5, 1.5, 0][k]!;
        const behind = [0.6, 0.6, 2.4][k]!;
        setTint(slot, "clone", CLONE_TINT);
        place(slot, { s: s - behind, x: state.x + lateral, y: state.y }, 0, 0.96, state.attack > 0 ? anim : { clip: grounded ? CLIPS.run : CLIPS.jump, rate: 1.15 * (1 + k * 0.07) }, dt, show);
      });

      /* enemies: stable slot per entity while in window */
      const window: Entity[] = [];
      for (const e of state.entities) {
        if (!isEnemy(e)) continue;
        const d = e.s - s;
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
        const free = (e.type === "heavy" ? BRUTE_SLOTS : SOLDIER_SLOTS).find((sl) => !slotEntity.has(sl));
        if (free !== undefined) { slotEntity.set(free, e.id); assigned.add(e.id); tints[free] = ""; }
      }
      ENEMY_SLOTS.forEach((slot, w) => {
        const id = slotEntity.get(slot);
        const e = id === undefined ? undefined : entityById.get(id);
        if (!e) { visible[slot] = false; node(`blob-${slot}`).setVisible(false); hideWeapons(w); return; }
        const kind = e.type as EnemyKind;
        const dead = !e.alive;
        const pop = dead ? Math.max(0, 1 - (state.time - e.defeatedAt) / 0.45) : 1;
        let ea: Anim;
        if (dead) ea = { clip: CLIPS.hit, t: Math.min(clipLength(CLIPS.hit, slot), (state.time - e.defeatedAt) * 0.75) };
        else if (e.intent) {
          const i = e.intent;
          const stageP = 1 - i.timer / Math.max(1e-3, i.duration);
          const p = i.stage === "windup" ? stageP * 0.5 : i.stage === "release" ? 0.5 + stageP * 0.25 : 0.75 + stageP * 0.25;
          ea = { clip: ENEMY_ATTACK_CLIP[kind], t: Math.max(0, Math.min(0.98, p)) * clipLength(has(ENEMY_ATTACK_CLIP[kind], slot), slot) };
        } else if (e.stagger > 0) ea = { clip: CLIPS.hit, t: 0.1 };
        else ea = e.approachSpeed > 0 ? { clip: CLIPS.run, rate: 1.25 } : { clip: CLIPS.idle, rate: 0.9 };
        setTint(slot, kind, { base: ENEMY_TINT[kind] });
        place(slot, { s: e.s, x: e.lane * laneOffset(e.s), y: e.y + (dead ? (1 - pop) * 1.6 : 0) }, Math.PI, (kind === "heavy" ? 1.3 : 1) * (0.4 + 0.6 * pop), ea, dt, pop > 0.02);
        hideWeapons(w);
        if (pop > 0.5) {
          refresh(slot);
          const hand = boneWorld(slot, BONES.handR), fore = boneWorld(slot, BONES.foreR);
          if (hand && fore) {
            if (kind === "swordsman") aim(`blade-${w}`, fore, hand, 1.15);
            else if (kind === "scout") aim(`blade-${w}`, fore, hand, 0.5, 0.05);
            else if (kind === "heavy") aim(`club-${w}`, fore, hand, 1.2 * 1.3, 0.25);
          }
          if (kind === "caster") {
            const lh = boneWorld(slot, BONES.handL);
            if (lh) { const o = node(`orb-${w}`); o.setVisible(true); o.setPosition(lh[0], lh[1] + 0.12, lh[2]); o.setScale(0.8 + 0.5 * (e.intent?.stage === "windup" ? 1 - e.intent.timer / Math.max(1e-3, e.intent.duration) : 0)); o.setUniform?.("ballTime", time + w); o.setUniform?.("ballOpacity", 0.95); }
          }
        }
      });

      /* barriers and beams */
      const barriers = state.entities.filter((e) => e.type === "barrier" && e.alive && e.s - s > -6 && e.s - s < 90);
      const beams = state.entities.filter((e) => e.type === "beam" && e.alive && e.s - s > -6 && e.s - s < 90);
      for (let i = 0; i < BARRIER_POOL; i++) {
        const e = barriers[i];
        for (const [id, lift] of [[`barrier-${i}`, 0.75], [`barrier-band-${i}`, 0.45], [`barrier-top-${i}`, 1.52]] as const) {
          const h = node(id);
          h.setVisible(!!e);
          if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), lift); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
        }
      }
      for (let i = 0; i < BEAM_POOL; i++) {
        const e = beams[i];
        const h = node(`beam-${i}`);
        h.setVisible(!!e);
        if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), 1.1); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
      }

      /* Rasengan orb in the hero's hand + sparks, wind shuriken */
      const ball = node("rasengan");
      const casting = state.attack > 0 || state.shurikenCast > 0;
      ball.setVisible(casting);
      const sparks = node("rasengan-sparks");
      sparks.setVisible(casting);
      if (casting) {
        refresh(activeHero);
        const hand = boneWorld(activeHero, BONES.handR), fore = boneWorld(activeHero, BONES.foreR);
        const fallback = groundFrame(s + 0.7, state.x + 0.25, state.y + 1.15);
        const reach = hand && fore ? normalize([hand[0] - fore[0], hand[1] - fore[1], hand[2] - fore[2]]) : ([0, 0, 0] as Vec3);
        const pos: Vec3 = hand ? [hand[0] + reach[0] * 0.28, hand[1] + reach[1] * 0.28, hand[2] + reach[2] * 0.28] : [fallback.x, fallback.y, fallback.z];
        const k = state.shurikenCast > 0 ? 3.2 : 1;
        ball.setPosition(pos[0], pos[1], pos[2]);
        ball.setScale(k);
        ball.setUniform?.("ballTime", time);
        ball.setUniform?.("ballOpacity", 1);
        sparks.setPosition(pos[0], pos[1], pos[2]);
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

      /* form aura: shell around the runner plus rising embers, dust at the feet */
      const aura = node("aura");
      const auraOn = state.phase !== "intro" && state.form !== "base";
      aura.setVisible(auraOn);
      if (auraOn) {
        const c = groundFrame(s, state.x, state.y + 0.95 * heroScale);
        const pulse = 1 + Math.sin(time * 6) * 0.05;
        const kur = state.form === "kurama";
        aura.setPosition(c.x, c.y, c.z);
        aura.setScale([(kur ? 1.0 : 0.78) * pulse, (kur ? 1.35 : 1.15) * pulse, (kur ? 1.0 : 0.78) * pulse]);
        aura.setUniform?.("auraTime", time);
        aura.setUniform?.("auraStrength", (kur ? 1.1 : 0.7) + Math.max(0, 1 - (time - lastFormShift) / 1.2) * 0.8);
        aura.setUniform?.("auraColor", kur ? [1, 0.78, 0.22] : [1, 0.5, 0.14]);
        auraClock += dt * (kur ? 70 : 28);
        while (auraClock >= 1) {
          auraClock -= 1;
          const hip = groundFrame(s - rng() * 0.8, state.x + (rng() - 0.5) * 0.9, state.y + 0.2 + rng() * 1.6);
          emit(hip.x, hip.y, hip.z, 1, kur ? [1, 0.72 + rng() * 0.2, 0.2] : [1, 0.55, 0.2], kur ? 2.4 : 1.4, kur ? 0.3 : 0.22, kur ? 0.8 : 0.6, -2.4);
        }
      }
      if (state.phase === "running" && grounded) {
        dustClock += dt * (state.speed / 18) * 9;
        while (dustClock >= 1) {
          dustClock -= 1;
          const f = groundFrame(s, state.x + (rng() - 0.5) * 0.5, 0.08);
          const tone = hexLinear(state.s > 1500 && state.s < 2260 ? "#7a6a3a" : "#c9b693");
          emit(f.x, f.y, f.z, 1, [Math.min(1, tone[0] * 1.5), Math.min(1, tone[1] * 1.5), Math.min(1, tone[2] * 1.5)], 1.1, 0.34, 0.5, -0.3);
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

      /* chase camera: the original's offsets, eased with 1 - exp(-7 dt), with a short shake on damage */
      const widen = smooth(2220, 2410, s);
      const eyeF = groundFrame(s - 6.4 - widen * 3.4, state.x * 0.45, 3.35 + widen * 0.95 + state.y * 0.22);
      const lookF = groundFrame(s + 12 + widen * 6, state.x * 0.38, 1.6 + widen * 0.35 + state.y * 0.15);
      const k = camPos ? 1 - Math.exp(-7 * dt) : 1;
      camPos = camPos ? [camPos[0] + (eyeF.x - camPos[0]) * k, camPos[1] + (eyeF.y - camPos[1]) * k, camPos[2] + (eyeF.z - camPos[2]) * k] : [eyeF.x, eyeF.y, eyeF.z];
      const shake = 0.3 * Math.exp(-9 * Math.max(0, hitAge)) * (hitAge < 1 ? 1 : 0);
      const eye: Vec3 = [camPos[0] + Math.sin(time * 71) * shake, camPos[1] + Math.cos(time * 83) * shake * 0.7, camPos[2] + Math.sin(time * 57) * shake * 0.4];
      cameraController.setPose({ position: eye, target: [lookF.x, lookF.y, lookF.z], fov: 57 + (state.dash > 0 ? 5 : 0) }, { cut: false });
    },
    resetCamera() { camPos = null; },
    probeBones(joint) {
      const names = actors[0]!.animation.skeletonJointNames();
      const name = joint && names.includes(joint) ? joint : names.includes("LeftForeArm") ? "LeftForeArm" : names[0]!;
      const clip = options.actors.clip;
      const length = clipLength(clip);
      const translations: [number, number, number][] = actors.map((actor, i) => {
        actor.playClip(clip, (i * 0.0713) % length);
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
