/**
 * Rendering for the Cloud Runner port: a sunlit sandstone-and-forest ridge in the sky. Sky dome with lit cumulus and hazy
 * ridges, lofted ground (textured PBR track and grass, banded sandstone cliffs), merged foliage, mesas and cloud banks,
 * a rigged GLB runner with skeletal animation, the sky cloud, star orbs, creatures, boulders, warning decals, pooled
 * particles and post (bloom, grade and vignette on top of the outdoor-day look). Everything goes through the public `@aura3d/engine` surface; art is
 * original (procedural meshes, CC0 catalog model and textures).
 */
import { camera, cameras, defineAuraAssets, effects, environments, geometry, instances, lights, looks, material, model, primitives, scene, type AuraApp } from "@aura3d/engine";
import type { Chapter } from "./chapter";
import { at, frameAt, type V3 } from "./course";
import { meatChunk } from "./creatures";
import { createCameraClearance, createLocomotion } from "@aura3d/engine/game";
import { Fx } from "./fx";
import type { Game } from "./game";
import { ACTIVE, ballSpec, glowSpec, scenerySpec, shadowSpec, skySpec, valleySpec, waterSpec, warnSpec } from "./materials";
import { ACTIVE_LOOK, sunPosition, type CumulusLookRow } from "./art/look";
import { Mesh, box, cylinder, hex } from "./mesh";
import { LEG_CLIPS } from "./legcycle";
import { CLIP_FOOT_SPEED, MAX_RATE, touchdowns } from "./locomotion";
import { CLIP_TOUCHDOWN_LEFT, advanceGaitPhase, gaitParams, gaitTouchdowns, gaitWeight, plantedGaitPose } from "./gait";
import { MESHY } from "./models";
import { buildBridges, buildClouds, buildGorgePosts, buildHut, buildMesas, buildObstacles, yawOf } from "./props";
import { smooth } from "./sim";
import { ROAD_HALF, buildGround, buildScatter, buildValleyForest, groundHeight } from "./terrain";

const LICENSE_ACG = "CC0 1.0, ambientCG";
/* same-origin pathnames, not absolute URLs: the production bridge treats http(s) model URLs as unsafe and refuses the scene */
export const ASSETS = defineAuraAssets({
  pathColor: { type: "texture", format: "jpg", url: new URL("./assets/textures/path-color.jpg", import.meta.url).pathname, hash: "sha256-5b083a420d259ad70ec62babb666554b6dcb82a7b06e8dfec8d3f6ba0bb0c7e6", metadata: { license: LICENSE_ACG } },
  pathNormal: { type: "texture", format: "jpg", url: new URL("./assets/textures/path-normal.jpg", import.meta.url).pathname, hash: "sha256-c8b9f181e2c5088f8cee915662401f5b02ac3ae9f0cbc82ea92d20dab9b97c4d", metadata: { license: LICENSE_ACG } },
});

const f32 = (a: ArrayLike<number>): Float32Array => Float32Array.from(a as ArrayLike<number>);
function meshGeometry(m: Mesh) {
  const tone = new Float32Array(m.vertexCount * 3);
  for (let i = 0; i < m.vertexCount; i++) { tone[i * 3] = m.colors[i * 4]!; tone[i * 3 + 1] = m.colors[i * 4 + 1]!; tone[i * 3 + 2] = m.colors[i * 4 + 2]!; }
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), attributes: { tone: { itemSize: 3, data: tone } } });
}
const plainGeometry = (m: Mesh) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });

export interface WorldStats { drawNodes: number; chunks: number; triangles: number }
/** What the legs are doing this frame: the clip, its phase in cycles, cadence, stride gain and the share of ground speed the planted feet still slide. */
export interface GaitReport { clip: string; phase: number; groundSpeed: number; rate: number; /** Share of the legs driven by the planted-foot IK gait (0 = clip only, 1 = fully planted). */ weight: number; /** Steps per second. */ cadence: number; /** Seconds a foot stays planted. */ stance: number; /** Forward lean of the hips (rad). */ lean: number; overspeed: boolean }
/** What the camera frames this frame: eye, target, vertical fov (deg) and the subjects' world positions (QA framing checks). */
export interface WorldView { eye: V3; target: V3; fov: number; aspect: number; hero: V3; log: V3 | null; hut: V3 | null; culled: number }
export interface WorldRuntime {
  update(game: Game, dt: number, aspect: number, events: readonly string[]): void; cutCamera(): void;
  readonly stats: WorldStats; readonly gait: GaitReport; readonly camera: { eye: V3; target: V3 }; readonly view: WorldView;
  /** Grounded foot touchdowns while running (the footstep sound follows these, not distance). */
  readonly footsteps: number;
}
/** A merged scenery chunk hidden past `range` metres from the camera (small detail is sub-pixel or fogged there). */
interface Cullable { id: string; centre: V3; radius: number; range: number }
/** Hide distances per scenery group (metres from the eye to the chunk's bounding sphere). */
export const CULL_RANGE = { flowers: 150, bushes: 240, rocks: 240, trees: 400 } as const;
/** Look sun angles that point the outdoor-day key light along `SUN_POS`, the authored shadow sun (one light direction for shading and shadows). */
export function sunAnglesOf(p: V3): { azimuthDeg: number; elevationDeg: number } {
  return { azimuthDeg: (Math.atan2(p[0], p[2]) * 180) / Math.PI, elevationDeg: (Math.atan2(p[1], Math.hypot(p[0], p[2])) * 180) / Math.PI };
}
function boundsOf(m: Mesh): { centre: V3; radius: number } {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { centre: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], radius: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 };
}
/** Checkpoint markers: a post and a pennant on the road edge at every checkpoint after the start, merged into one mesh. */
export function buildCheckpointFlags(ch: Chapter): Mesh {
  const m = new Mesh();
  const post = cylinder(8, 0.09, 0.07, 3.2, hex("#f3ead4"), hex("#ffffff"));
  const pennant = box(1.3, 0.75, 0.05, hex("#ffcf4a"));
  const band = box(1.3, 0.16, 0.06, hex("#d9341f"));
  for (const c of ch.checkpoints) {
    if (c <= 0) continue;
    const f = frameAt(c, ROAD_HALF + 0.6);
    const yaw = yawOf(f.forward);
    const base: V3 = [f.point[0], f.point[1] + groundHeight(ch, c, ROAD_HALF + 0.6), f.point[2]];
    m.append(post, base, 1, yaw, 0);
    // the pennant hangs off the post toward the road, so it reads from the chase camera
    const off = (k: number): V3 => [base[0] - f.right[0] * 0.65, base[1] + k, base[2] - f.right[2] * 0.65];
    m.append(pennant, off(2.75), 1, yaw, 0);
    m.append(band, off(2.4), 1, yaw, 0);
  }
  m.computeNormals();
  return m;
}
/** The ride log: bark rings and pale cut ends (the log used the rock texture before). */
export function buildLog(): Mesh {
  const raw = new Mesh();
  const ring = [hex("#6e4b2f"), hex("#82593a")];
  for (let i = 0; i < 8; i++) raw.append(cylinder(14, 1.0, 1.0, 0.8, ring[i % 2]!, ring[(i + 1) % 2]!), [0, i * 0.8, 0]);
  raw.append(cylinder(14, 0.9, 0.9, 0.02, hex("#d9b98a"), hex("#c9a273")), [0, 6.4, 0]);
  raw.append(cylinder(14, 0.9, 0.9, 0.02, hex("#d9b98a"), hex("#c9a273")), [0, -0.02, 0]);
  for (let i = 0; i < raw.vertexCount; i++) raw.positions[i * 3 + 1]! -= 3.2;
  const logMesh = new Mesh();
  logMesh.append(raw, [0, 0, 0], 1, Math.PI / 2, Math.PI / 2);
  return logMesh;
}
/**
 * GU47 WP-35 look nodes for one look-table row (art/look.ts).
 * - storm-washed: one look key carries the sun and its 4-cascade PCSS shadow to 160 m (CD-01, CD-02; the authored shadow sun
 *   and the sky-fill hemisphere are gone, so there is no ambient fill), a cool unshadowed back rim (CD-03), spruit_sunrise IBL
 *   at 0.8 behind the custom dome (CD-04, background off), haze #9fb8cf 0.0032 with height fog pooling in the gorges (CD-07),
 *   one grade node (the authored grade folds into the look's, CD-08) with warm gain and cool lift, the look bloom, a 0.2
 *   vignette and contact shadows next to the look's single AO node (CD-10).
 * - original (`?look=original`): today's nodes, value for value.
 */
export function lookNodes(row: CumulusLookRow): unknown[] {
  const out: unknown[] = [];
  if (row.authoredSunPos) {
    out.push(looks.preset(row.preset, { sun: sunAnglesOf(row.authoredSunPos as V3), fogDensityScale: row.fog.lookScale }));
    out.push(lights.directional({ name: "sun", position: row.authoredSunPos as V3, target: [0, 0, 0], intensity: row.sun.intensity, color: row.sun.color, shadow: { cascades: row.sun.cascades, maxDistance: row.sun.maxDistance, blend: 0.14 } }));
    if (row.hemisphere) out.push(lights.hemisphere({ name: "sky-fill", skyColor: row.hemisphere.sky, groundColor: row.hemisphere.ground, intensity: row.hemisphere.intensity }));
    out.push(effects.fog({ name: "haze", color: row.fog.color, density: row.fog.density }));
    out.push(effects.bloom({ name: "bloom", intensity: row.bloom.intensity, threshold: row.bloom.threshold }));
    out.push(effects.colorGrade({ name: "grade", exposure: row.grade.exposure, contrast: row.grade.contrast, saturation: row.grade.saturation }));
    // The vignette renders through the post-v2 bridge (postBridge.ts) even though the effects diagnostics list it with
    // consumer "none". Removing it lifted mean luma from 131 to 199 with clipping (remote A/B run g25-abvig), so it stays.
    out.push(effects.vignette({ name: "vignette", intensity: row.vignette.intensity, smoothness: row.vignette.smoothness }));
    return out;
  }
  const gorge = row.fog.gorgeHeight;
  out.push(looks.preset(row.preset, {
    sun: { elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg },
    ...(row.hdri ? { hdri: row.hdri } : {}),
    ...(row.environmentIntensity !== null ? { environmentIntensity: row.environmentIntensity } : {}),
    ...(row.environmentRotationDeg !== null ? { environmentRotationDeg: row.environmentRotationDeg } : {}),
    background: row.fog.color,
    key: { color: row.sun.color, intensity: row.sun.intensity, shadow: { cascades: row.sun.cascades, maxDistance: row.sun.maxDistance, filter: row.sun.filter, blend: 0.14 } },
    rim: row.rim ? { color: row.rim.color, intensity: row.rim.intensity, azimuthDeg: row.rim.azimuthDeg } : false,
    fogDensityScale: row.fog.lookScale,
    fog: { color: row.fog.color, ...(gorge ? { height: { mode: "height", density: row.fog.density, ...gorge } } : {}) },
    post: { bloom: { intensity: row.bloom.intensity, threshold: row.bloom.threshold } }
  }));
  out.push(effects.colorGrade({
    name: "grade", exposure: row.grade.exposure, contrast: row.grade.contrast, saturation: row.grade.saturation,
    ...(row.grade.temperature !== undefined ? { temperature: row.grade.temperature } : {}),
    ...(row.grade.tint !== undefined ? { tint: row.grade.tint } : {}),
    ...(row.grade.lift ? { lift: [...row.grade.lift] as [number, number, number] } : {}),
    ...(row.grade.gain ? { gain: [...row.grade.gain] as [number, number, number] } : {})
  }));
  out.push(effects.vignette({ name: "vignette", intensity: row.vignette.intensity, smoothness: row.vignette.smoothness }));
  out.push(effects.contactShadows({ length: 0.3, thickness: 0.06, intensity: 0.9 }));
  return out;
}
function addLookNodes(b: { add(n: never): unknown }, row: CumulusLookRow): void { for (const n of lookNodes(row)) b.add(n as never); }
export interface World { readonly scene: ReturnType<typeof scene>; bind(app: AuraApp): WorldRuntime }

/* dev toggle for A/B frames: ?heroset=0 drops the instanced hero trees, rocks and mesas */
const HERO_SET = typeof location === "undefined" || !/[?&]heroset=0/.test(location.search);
const ORB_CAP = 72;
/* clips that play once and hold their last pose (end time in seconds) or a fixed pose (at) */
const HERO_HOLD: Readonly<Record<string, { end: number; at?: number }>> = { jump: { end: 2.0 }, hit: { end: 1.5 }, dead: { end: 2.95 }, sit: { end: 8.3, at: 7.6 } };
/* Meshy models face +Z in their own space; the port's creature rig faced -Z, so the yaw is offset by this many half turns */
const REX_FACING = 1;
/** The one sun (CD-01): the look key, its cascaded shadow, the scenery shader light and the sky disc all point along this. */
export const SUN_POS: V3 = (ACTIVE_LOOK.authoredSunPos ?? sunPosition(ACTIVE_LOOK.scenery.sunDir, 100)) as V3;
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export function buildWorld(ch: Chapter, rockMap: unknown, grassMap: unknown): World {
  const b = scene().background(ACTIVE.fogHex).camera(camera.perspective({ position: [0, 74, 8], target: [0, 70, -20], fov: 55, near: 0.2, far: 4200 }));
  addLookNodes(b, ACTIVE_LOOK);
  let triangles = 0, chunks = 0, drawNodes = 0;
  const cullables: Cullable[] = [];
  /* only the cliff walls cast sun shadows: every caster is drawn once per cascade, and merged foliage, flowers, mesas and cloud banks are far or tiny */
  const addMesh = (m: Mesh, name: string, spec: ReturnType<typeof scenerySpec>, id?: string, castShadow = false, range?: number): void => {
    const node = geometry.custom(meshGeometry(m), { name, material: material.custom(spec), castShadow });
    const runtimeId = id ?? (range !== undefined ? name : undefined);
    b.add(runtimeId ? node.runtime({ id: runtimeId }) : node);
    if (range !== undefined && runtimeId) cullables.push({ id: runtimeId, ...boundsOf(m), range });
    triangles += m.indices.length / 3; chunks++; drawNodes++;
  };

  /* sky, valley */
  b.add(primitives.sphere({ name: "sky", size: 3600, castShadow: false, material: material.custom(skySpec()) }).runtime({ id: "sky" }));
  b.add(geometry.custom(geometry.dynamic({
    positions: f32([-3200, 0, -3200, 3200, 0, -3200, 3200, 0, 3200, -3200, 0, 3200]), normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]), indices: Uint32Array.from([0, 2, 1, 0, 3, 2])
  }), { name: "valley", castShadow: false, material: material.custom(valleySpec()) }).runtime({ id: "valley" }));

  /* ground: textured PBR track and grass, banded sandstone and foliage-covered banks */
  const ground = buildGround(ch);
  const sampling = { wrap: "repeat" as const, anisotropy: 8 };
  ground.road.forEach((m, i) => { b.add(geometry.custom(plainGeometry(m), { name: `road-${i}`, castShadow: false, material: material.pbr({ color: "#ffffff", roughness: 1, metallic: 0, specularIntensity: 0.12, texture: ASSETS.pathColor, normal: ASSETS.pathNormal, normalScale: 0.9, sampling }), side: "double" } as never)); triangles += m.indices.length / 3; chunks++; });
  ground.grass.forEach((m, i) => addMesh(m, `grass-${i}`, scenerySpec({ map: grassMap, mapMix: 0.7, mapScale: 0.9, rim: 0.12, sun: 1.2 })));
  ground.slope.forEach((m, i) => addMesh(m, `slope-${i}`, scenerySpec({ map: rockMap, mapMix: 0.55, mapScale: 0.5, rim: 0.22 }), undefined, true));
  const scatter = buildScatter(ch);
  scatter.trees.forEach((m, i) => addMesh(m, `trees-${i}`, scenerySpec({ rim: 0.34 }), undefined, false, CULL_RANGE.trees));
  scatter.bushes.forEach((m, i) => addMesh(m, `bushes-${i}`, scenerySpec({ rim: 0.3 }), undefined, false, CULL_RANGE.bushes));
  scatter.rocks.forEach((m, i) => addMesh(m, `rocks-${i}`, scenerySpec({ map: rockMap, mapMix: 0.5, mapScale: 1.2 }), undefined, false, CULL_RANGE.rocks));
  scatter.flowers.forEach((m, i) => addMesh(m, `flowers-${i}`, scenerySpec({ sun: 1.6, rim: 0.1 }), undefined, false, CULL_RANGE.flowers));
  buildValleyForest(ch).forEach((m, i) => addMesh(m, `valley-forest-${i}`, scenerySpec({ rim: 0.2, sun: 1.0 })));
  const mesas = buildMesas(ch);
  mesas.meshes.forEach((m, i) => addMesh(m, `mesas-${i}`, scenerySpec({ map: rockMap, mapMix: 0.35, mapScale: 0.18, rim: 0.3 })));
  /* generated hero set pieces along the road: instanced, one draw each */
  const place = (list: readonly { pos: V3; scale: number; yaw: number }[]) => list.map((p) => ({ position: p.pos, rotation: [0, p.yaw, 0] as V3, scale: p.scale }));
  const heroSet = { targetHeight: 1, castShadow: true, receiveShadow: false, instancingAware: true } as const;
  if (HERO_SET && scatter.roundTrees.length) b.add(instances.model(MESHY.treeRound, { name: "hero-trees-round", ...heroSet, transforms: place(scatter.roundTrees) }));
  if (HERO_SET && scatter.pineTrees.length) b.add(instances.model(MESHY.treePine, { name: "hero-trees-pine", ...heroSet, transforms: place(scatter.pineTrees) }));
  if (HERO_SET && scatter.boulders.length) b.add(instances.model(MESHY.boulder, { name: "hero-rocks", ...heroSet, castShadow: false, transforms: place(scatter.boulders) }));
  if (HERO_SET && mesas.placements.length) b.add(instances.model(MESHY.mesa, { name: "hero-mesas", targetHeight: 1, castShadow: false, receiveShadow: false, instancingAware: true, transforms: mesas.placements.map((m) => ({ position: m.pos, rotation: [0, m.yaw, 0] as V3, scale: [m.width / 0.55, m.height, m.width / 0.55] as V3 })) }));
  buildClouds(ch).forEach((m, i) => addMesh(m, `clouds-${i}`, scenerySpec({ sun: 0.85, rim: 0.5 })));
  buildObstacles(ch).forEach((m, i) => addMesh(m, `obstacles-${i}`, scenerySpec({ map: rockMap, mapMix: 0.4, mapScale: 1.5 })));
  addMesh(buildBridges(ch), "bridges", scenerySpec({ rim: 0.15 }));
  addMesh(buildGorgePosts(ch), "gorge-posts", scenerySpec({ rim: 0.25 }));
  const hut = buildHut(ch);
  if (hut) addMesh(hut, "home", scenerySpec({ rim: 0.2 }));
  addMesh(buildCheckpointFlags(ch), "checkpoint-flags", scenerySpec({ rim: 0.3, sun: 1.3 }));

  /* water: a shallow stream across the track */
  ch.waters.forEach((w, i) => {
    const m = new Mesh();
    let prev = -1;
    for (let s = w.start - 2; s <= w.end + 2; s += 2) {
      const l = at(s, -ROAD_HALF - 3, 0.07), r = at(s, ROAD_HALF + 3, 0.07);
      const k = m.vertex(l, [0, 1, 0], [0, s / 12], [1, 1, 1]); m.vertex(r, [0, 1, 0], [1, s / 12], [1, 1, 1]);
      if (prev >= 0) m.quad(prev, prev + 1, k + 1, k);
      prev = k;
    }
    b.add(geometry.custom(plainGeometry(m), { name: `river-${i}`, castShadow: false, material: material.custom(waterSpec()) }).runtime({ id: `river-${i}` }));
  });

  /* characters and set pieces */
  b.add(model(MESHY.hero, { name: "hero", targetHeight: 1.5, castShadow: true, receiveShadow: false }).runtime({ id: "hero" }));
  if (ch.log) b.add(geometry.custom(meshGeometry(buildLog()), { name: "ride-log", material: material.custom(scenerySpec({ rim: 0.3 })) }).runtime({ id: "ride-log" }));
  const shadowQuad = new Mesh();
  shadowQuad.vertex([-0.5, 0, -0.5], [0, 1, 0], [0, 0], [1, 1, 1]); shadowQuad.vertex([0.5, 0, -0.5], [0, 1, 0], [1, 0], [1, 1, 1]); shadowQuad.vertex([0.5, 0, 0.5], [0, 1, 0], [1, 1], [1, 1, 1]); shadowQuad.vertex([-0.5, 0, 0.5], [0, 1, 0], [0, 1], [1, 1, 1]); shadowQuad.quad(0, 1, 2, 3);
  /* CD-02: the fake contact quad only on rows whose scenery does not receive the sun shadow (the original look) */
  if (!ACTIVE_LOOK.scenery.receiveShadow) b.add(geometry.custom(plainGeometry(shadowQuad), { name: "hero-shadow", castShadow: false, material: material.custom(shadowSpec()) }).runtime({ id: "hero-shadow" }));
  b.add(model(MESHY.cloud, { name: "sky-cloud", targetHeight: 0.8, castShadow: false, receiveShadow: false }).runtime({ id: "sky-cloud" }));
  const staff = cylinder(10, 0.13, 0.13, 1, hex("#b53a2a"), hex("#b53a2a"));
  staff.append(cylinder(10, 0.2, 0.2, 0.06, hex("#f0c04a"), hex("#f0c04a")), [0, 0, 0]);
  staff.append(cylinder(10, 0.2, 0.2, 0.06, hex("#f0c04a"), hex("#f0c04a")), [0, 0.94, 0]);
  b.add(geometry.custom(meshGeometry(staff), { name: "staff", castShadow: true, material: material.custom(scenerySpec({ rim: 0.4 })) }).runtime({ id: "staff" }));
  for (const ball of ch.balls) b.add(primitives.sphere({ name: `ball-${ball.star}`, size: 0.95, material: material.custom(ballSpec(ball.star)) }).runtime({ id: `ball-${ball.star}` }));
  if (ch.home) b.add(primitives.sphere({ name: `ball-${ch.home.star}`, size: 0.95, material: material.custom(ballSpec(ch.home.star)) }).runtime({ id: `ball-${ch.home.star}` }));
  const meat = meatChunk();
  ch.meat.forEach((_, i) => b.add(geometry.custom(meshGeometry(meat), { name: `meat-${i}`, castShadow: false, material: material.custom(scenerySpec({ sun: 1.4, rim: 0.4 })) }).runtime({ id: `meat-${i}` })));
  ch.boulders.forEach((_, i) => b.add(model(MESHY.boulder, { name: `boulder-${i}`, targetHeight: 2.0, castShadow: true, receiveShadow: false }).runtime({ id: `boulder-${i}` })));
  const dives = ch.creatures.filter((c) => c.type === "pteranodon");
  dives.forEach((_, i) => b.add(model(MESHY.ptero, { name: `ptera-body-${i}`, targetHeight: 1.7, castShadow: true, receiveShadow: false }).runtime({ id: `ptera-body-${i}` })));
  const hasRex = ch.creatures.some((c) => c.type === "trex");
  if (hasRex) b.add(model(MESHY.rex, { name: "rex-body", targetHeight: 8.4, castShadow: true, receiveShadow: false }).runtime({ id: "rex-body" }));

  const quad = (() => { const m = new Mesh(); m.vertex([-0.5, 0, -0.5], [0, 1, 0], [0, 0], [1, 1, 1]); m.vertex([0.5, 0, -0.5], [0, 1, 0], [1, 0], [1, 1, 1]); m.vertex([0.5, 0, 0.5], [0, 1, 0], [1, 1], [1, 1, 1]); m.vertex([-0.5, 0, 0.5], [0, 1, 0], [0, 1], [1, 1, 1]); m.quad(0, 1, 2, 3); return m; })();
  const warnIds: string[] = [];
  const warn = (id: string, round: boolean): void => { warnIds.push(id); b.add(geometry.custom(plainGeometry(quad), { name: id, castShadow: false, material: material.custom(warnSpec(round)) }).runtime({ id })); };
  ch.boulders.forEach((_, i) => warn(`warn-boulder-${i}`, false));
  dives.forEach((_, i) => warn(`warn-dive-${i}`, true));
  const rexCreature = ch.creatures.find((c) => c.type === "trex");
  [...(rexCreature?.bites ?? []).map((s) => ({ s, kind: "bite" })), ...(rexCreature?.swipes ?? []).map((s) => ({ s, kind: "swipe" }))].sort((x, y) => x.s - y.s).forEach((_, i) => warn(`warn-rex-${i}`, false));

  b.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(ORB_CAP * 3).fill(0)), topology: "points",
    attributes: { tone: { itemSize: 3, data: f32(new Array(ORB_CAP * 3).fill(1)) }, aSize: { itemSize: 1, data: f32(new Array(ORB_CAP).fill(0)) }, aAlpha: { itemSize: 1, data: f32(new Array(ORB_CAP).fill(0)) } }
  }), { name: "orbs", material: material.custom(glowSpec()) }).runtime({ id: "orbs" }));
  const fx = new Fx();
  fx.addTo(b);

  return { scene: b, bind: (app) => bindRuntime(app, ch, fx, { triangles, chunks, drawNodes }, cullables) };
}

/* ------------------------------------------------------------------------------------- runtime */
function bindRuntime(app: AuraApp, ch: Chapter, fx: Fx, stats: WorldStats, cullables: readonly Cullable[]): WorldRuntime {
  const cam = app.camera;
  if (!cam) throw new Error("cloud-runner port: the app exposes no camera controller");
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const hero = node("hero"), cloud = node("sky-cloud"), staff = node("staff"), sky = node("sky"), valley = node("valley");
  const orbs = node("orbs");
  const orbPos = new Float32Array(ORB_CAP * 3), orbTone = new Float32Array(ORB_CAP * 3), orbSize = new Float32Array(ORB_CAP), orbAlpha = new Float32Array(ORB_CAP);
  const rexAttacks = [...(ch.creatures.find((c) => c.type === "trex")?.bites ?? []).map((s) => ({ s, kind: "bite" as const })), ...(ch.creatures.find((c) => c.type === "trex")?.swipes ?? []).map((s) => ({ s, kind: "swipe" as const }))].sort((x, y) => x.s - y.s);
  const dives = ch.creatures.filter((c) => c.type === "pteranodon");
  const riverIds = ch.waters.map((_, i) => `river-${i}`);
  const chase = cameras.chase();
  let eye: V3 | null = null, look: V3 | null = null;
  let animClip = "", animT = 0, wispT = 0, clock = 0;
  let rexS = 0, rexInit = false;
  const camPos: { eye: V3; target: V3 } = { eye: [0, 0, 0], target: [0, 0, 0] };
  const view: WorldView = { eye: [0, 0, 0], target: [0, 0, 0], fov: 55, aspect: 1, hero: [0, 0, 0], log: null, hut: null, culled: 0 };
  const cullShown = new Map<string, boolean>();
  let footsteps = 0;
  /* finale camera: the hut and its mound are solid, and the eye stays above the ground around the home frame */
  const finaleClear = createCameraClearance();
  const homeFrame = ch.home ? frameAt(ch.home.s) : null;
  const hutCentre: V3 | null = ch.home ? at(ch.home.s, 9.5, 2.4) : null;
  const finaleBlocked = (x: number, y: number, z: number): boolean => {
    if (!homeFrame || !ch.home) return false;
    const d: V3 = [x - homeFrame.point[0], y - homeFrame.point[1], z - homeFrame.point[2]];
    const sOff = d[0] * homeFrame.forward[0] + d[1] * homeFrame.forward[1] + d[2] * homeFrame.forward[2];
    const lat = d[0] * homeFrame.right[0] + d[1] * homeFrame.right[1] + d[2] * homeFrame.right[2];
    const up = d[0] * homeFrame.up[0] + d[1] * homeFrame.up[1] + d[2] * homeFrame.up[2];
    if (up < groundHeight(ch, ch.home.s + sOff, lat) + 0.6) return true;
    if (Math.hypot(sOff, lat - 9.5) < 3.9 && up < 6.4) return true;
    const mx = (lat - 15.5) / 6.6, my = (up + 0.4) / 2.8, mz = sOff / 5.6;
    return mx * mx + my * my + mz * mz < 1;
  };
  const foot = (g: Game): V3 => at(g.state.s, g.state.lane, g.state.jump);

  const gait: GaitReport = { clip: "", phase: 0, groundSpeed: 0, rate: 1, weight: 0, cadence: 0, stance: 0, lean: 0, overspeed: false };
  let gaitPhase = 0;
  const loco = createLocomotion({ gaits: [{ name: "idle", speed: 0, cycle: 4.03 }, { name: "run", speed: CLIP_FOOT_SPEED.run, cycle: LEG_CLIPS.run.duration }], minRate: 0.6, maxRate: MAX_RATE });
  const play = (clip: string, rate: number, dt: number, groundSpeed = 0, stepFx?: (side: "left" | "right") => void): void => {
    if (clip !== animClip) { animClip = clip; animT = 0; }
    const before = animT;
    animT += dt * rate;
    const hold = HERO_HOLD[clip];
    hero.play(clip, { loop: hold === undefined, captureTime: hold === undefined ? animT : hold.at ?? Math.min(animT, hold.end), crossFade: 0.1 });
    gait.clip = clip; gait.groundSpeed = groundSpeed; gait.rate = rate;
    if (clip === "run") {
      const dur = LEG_CLIPS.run.duration;
      const w = gaitWeight(groundSpeed);
      const gp = gaitParams(groundSpeed);
      const gBefore = gaitPhase;
      if (w <= 0) gaitPhase = animT / dur - CLIP_TOUCHDOWN_LEFT;
      else {
        // legs, hips and arms share one phase: the clip is locked to the gait so the arm swing matches the stride
        gaitPhase = advanceGaitPhase(gaitPhase, groundSpeed, dt);
        animT = (gaitPhase + CLIP_TOUCHDOWN_LEFT) * dur;
        hero.play(clip, { loop: true, captureTime: animT, crossFade: 0.1 });
      }
      gait.weight = w; gait.cadence = gp.cadence; gait.stance = gp.stance; gait.lean = gp.lean * w; gait.overspeed = false;
      gait.phase = gaitPhase;
      hero.setAnimationPose(plantedGaitPose(groundSpeed, gaitPhase, w));
      const td = w > 0 ? gaitTouchdowns(gBefore, gaitPhase) : touchdowns("run", before / dur, animT / dur);
      if (stepFx) { for (let i = 0; i < td.left; i++) stepFx("left"); for (let i = 0; i < td.right; i++) stepFx("right"); }
    } else {
      hero.setAnimationPose(undefined);
      gait.weight = 0; gait.cadence = 0; gait.stance = 0; gait.lean = 0; gait.phase = 0; gait.overspeed = false;
    }
  };

  function emitEvents(g: Game, events: readonly string[]): void {
    const s = g.state, f = frameAt(s.s, s.lane), p = foot(g), up = f.up;
    const chest: V3 = [p[0] + up[0] * 1.3, p[1] + up[1] * 1.3, p[2] + up[2] * 1.3];
    for (const e of events) {
      if (e === "jump" || e === "land") fx.dust(p, up, e === "land" ? 7 : 5, "#e8d4a8", 0.9);
      else if (e === "dismount") { fx.dust(p, up, 12, "#d9c08a", 1.3); fx.burst(p, up, "#ffe9a8", 10, 0.9); }
      else if (e === "splash") { fx.dust(p, up, 10, "#d8f4ff", 1); fx.ring(at(s.s, s.lane, 0.1), up, "#d8f4ff", 0.8); }
      else if (e === "extend") fx.ring(p, up, "#ffe27a", 1);
      else if (e === "launch" || e === "power-launch") { fx.burst(chest, up, "#fff3b0", 18, 1.3); fx.ring(p, up, "#fff3b0", 1.4); }
      else if (e === "perfect") { fx.burst(chest, up, "#ffffff", 26, 1.7); fx.ring(p, up, "#ffffff", 2); }
      else if (e === "strike") fx.burst([p[0] + f.forward[0] * 2, p[1] + 1.2, p[2] + f.forward[2] * 2], up, "#fff0b0", 12, 1.1);
      else if (e === "strike-hit" || e === "duel-won") { fx.burst(chest, up, "#ffe27a", e === "duel-won" ? 40 : 22, e === "duel-won" ? 2.2 : 1.6); fx.ring(p, up, "#ffffff", e === "duel-won" ? 2.6 : 1.8); }
      else if (e === "skypearl") { fx.burst(chest, up, "#ffb347", 28, 1.7); fx.ring(p, up, "#ffd27a", 1.5); }
      else if (e === "meat") fx.burst(chest, up, "#ffb98a", 18, 1.2);
      else if (e === "orb") fx.burst(chest, up, "#fff0b8", 3, 0.5);
      else if (e === "checkpoint") fx.ring(p, up, "#ffe9a0", 1.6);
      else if (e === "glider-ready") fx.ring(p, up, "#fff0a8", 1.3);
      else if (e === "glider-call" || e === "glider-mount") { fx.burst(p, up, "#fff3c0", 22, 1.4); fx.ring(p, up, "#ffe6a0", 1.3); }
      else if (e === "glider-end") fx.burst(p, up, "#fff3c0", 14, 1);
      else if (e === "glider-knocked") fx.burst(chest, up, "#ffd9c8", 26, 1.6);
      else if (e === "hit" || e === "boulder-hit" || e === "trex-bite" || e === "trex-swipe" || e === "ptera-grab") { fx.burst(chest, up, "#ffd0b0", 16, 1.5); fx.dust(p, up, 8, "#cdb78e", 1.1); }
      else if (e === "respawn") fx.ring(p, up, "#ffffff", 1.6);
    }
  }

  return {
    stats,
    gait,
    camera: camPos,
    view,
    get footsteps() { return footsteps; },
    cutCamera() { eye = null; look = null; chase.reset(); finaleClear.reset(); },
    update(g, dt, aspect, events) {
      clock += dt;
      const s = g.state, f = frameAt(s.s, s.lane), phase = g.phase;
      const n = s.glider, riding = n.active || n.call > 0;
      emitEvents(g, events);

      /* ---- hero pose ---- */
      const logLift = ch.log ? 1.9 * (1 - smooth(ch.log - 0.3, ch.log, s.s)) : 0;
      let h = s.jump + logLift;
      let pos: V3 = at(s.s, s.lane, h);
      let yaw = yawOf(f.forward) - s.laneVelocity * 0.035;
      let roll = -s.laneVelocity * 0.012;
      let pitch = 0;
      if (phase === "falling" && g.falling) {
        const fl = g.falling, ff = frameAt(fl.s, fl.lane);
        pos = [ff.point[0] + ff.forward[0] * fl.t * 9 + ff.up[0] * (fl.jump + fl.y), ff.point[1] + ff.forward[1] * fl.t * 9 + ff.up[1] * (fl.jump + fl.y), ff.point[2] + ff.forward[2] * fl.t * 9 + ff.up[2] * (fl.jump + fl.y)];
        pitch = fl.t * 5.5;
      } else if ((s.grabTimer ?? 0) > 0) {
        const k = Math.sin(Math.min(1, (0.9 - (s.grabTimer ?? 0)) / 0.9) * Math.PI) * 3.2;
        pos = at(s.s, s.lane, h + k);
      }
      if (phase === "menu") yaw = yawOf(f.forward) + Math.PI * 0.85 + Math.sin(clock * 0.3) * 0.08;
      if (phase === "result") yaw = yawOf(f.forward) + (g.result?.won ? Math.PI : 0);
      if (phase === "finale") yaw = yawOf(f.forward) - 0.1;
      const finaleRun = phase === "finale" && (g.finale?.t ?? 0) < 4;
      const groundSpeed = phase === "playing" ? s.speed : finaleRun ? (ch.home.s - ch.length) / 4 : 0;
      const lf = loco.update(groundSpeed, phase === "paused" ? 0 : dt);
      let clip = "run", rate = lf.rates.run ?? 1;
      if (phase === "menu") { clip = "idle"; rate = 1; }
      else if (phase === "result") { clip = g.result?.won ? "cheer" : "dead"; rate = 1; }
      else if (phase === "finale") { clip = finaleRun ? "run" : "cheer"; rate = finaleRun ? (lf.rates.run ?? 1) : 1; }
      else if (phase === "falling") { clip = "jump"; rate = 0.7; }
      else if (s.janken) { clip = s.janken.t < 0.7 ? "idle" : "attack"; rate = s.janken.t < 0.7 ? 1.4 : 1.2; }
      else if (s.strikeTimer > 0) { clip = "attack"; rate = 1.8; }
      else if ((s.grabTimer ?? 0) > 0) { clip = "hit"; rate = 1.2; }
      else if ((s.stumbleTimer ?? 0) > 0) { clip = "hit"; rate = 1.4; }
      else if (riding) { clip = "sit"; rate = 1; }
      else if (s.pole) { clip = "block"; rate = 0.35; }
      else if (s.jump > 0.12) { clip = "jump"; rate = 1.9; }
      else if (phase === "paused") { clip = animClip || "run"; rate = 0; }
      // the 7 Hz hit blink is skipped under reduced motion (the hearts row still shows the hit)
      if (phase === "playing" && s.invincible > 0 && !g.reducedMotion && Math.floor(clock * 14) % 2 === 0 && !riding) hero.setVisible(false); else hero.setVisible(true);
      hero.setPosition(pos[0], pos[1], pos[2]);
      hero.setRotation(pitch, yaw, roll);
      const stepDust = (side: "left" | "right"): void => {
        if (phase !== "playing" || s.jump > 0.15 || riding) return;
        footsteps++;
        const side2 = (side === "left" ? -1 : 1) * 0.28;
        const base = at(s.s, Math.max(-5.1, Math.min(5.1, s.lane + side2)), 0.1);
        fx.dust(base, f.up, 1, "#e5cf9f", 0.55, 0.7);
      };
      play(clip, rate, phase === "paused" ? 0 : dt, groundSpeed, stepDust);

      if (ch.log) {
        const lg = node("ride-log");
        const sLog = s.s < ch.log ? s.s : ch.log + (s.s - ch.log) * 0.35;
        const show = sLog - s.s > -30 && phase !== "falling";
        lg.setVisible(show);
        if (show) { const lp = at(sLog, s.s < ch.log ? s.lane : 0, 1.0); lg.setPosition(lp[0], lp[1], lp[2]); lg.setRotation(-(sLog * 1.0), yawOf(frameAt(sLog).forward), 0); view.log = lp; }
        else view.log = null;
      }

      if (!ACTIVE_LOOK.scenery.receiveShadow) {
        const hs = node("hero-shadow");
        const gp = at(s.s, s.lane, 0.07 + (ch.log && s.s < ch.log ? 0 : 0));
        hs.setVisible(phase !== "falling" && phase !== "finale");
        hs.setPosition(gp[0], gp[1], gp[2]);
        hs.setRotation(0, yawOf(f.forward), 0);
        const hk = Math.max(0.35, 1.5 - s.jump * 0.12);
        hs.setScale([hk * 1.6, 1, hk * 1.6]);
        hs.setUniform?.("shadowAlpha", Math.max(0.12, 0.42 - s.jump * 0.05));
      }

      /* ---- sky cloud ---- */
      cloud.setVisible(riding || (phase === "menu" && false));
      if (riding) {
        const base = at(s.s, s.lane, Math.max(0, s.jump - 0.55));
        cloud.setPosition(base[0] + f.forward[0] * 1.1, base[1] + 0.12, base[2] + f.forward[2] * 1.1); /* the generated cloud's mass sits behind its origin */
        cloud.setRotation(0, yaw, Math.sin(clock * 3) * 0.04);
        cloud.setScale(n.call > 0 ? 0.6 + (1 - n.call / 0.26) * 1.0 : 1.7);
        wispT += dt;
        if (wispT > 0.07) { wispT = 0; fx.wisp([base[0] - f.forward[0] * 1.3, base[1] + 0.2, base[2] - f.forward[2] * 1.3], "#fff3c0", 0.8); }
      }

      /* ---- staff over a gorge ---- */
      const onPole = s.pole;
      staff.setVisible(!!onPole);
      if (onPole) {
        const mid = (onPole.start + onPole.end) / 2, len = onPole.end - onPole.start + 2;
        const pf = frameAt(mid, 0);
        const reach = Math.min(1, Math.max(0.05, (s.s - onPole.start + 8) / (onPole.end - onPole.start)));
        const l = Math.max(2, len * Math.min(1, reach + 0.25));
        const c = at(onPole.start - 1 + l / 2, 0, 0.12);
        staff.setPosition(c[0], c[1], c[2]);
        staff.setRotation(Math.PI / 2, yawOf(pf.forward), 0);
        staff.setScale([1, l, 1]);
      }

      /* ---- balls, meat ---- */
      for (const ball of ch.balls) {
        const nd = node(`ball-${ball.star}`);
        const got = s.balls.includes(ball.star);
        nd.setVisible(!got && Math.abs(ball.s - s.s) < 220);
        if (!got) { const p = at(ball.s, ball.lane, ball.height + Math.sin(clock * 2 + ball.star) * 0.12); nd.setPosition(p[0], p[1], p[2]); nd.setRotation(0, clock * 1.6 + ball.star, 0); }
      }
      if (ch.home) { const nd = node(`ball-${ch.home.star}`); const show = !!g.finale || g.phase === "result"; nd.setVisible(show && s.balls.includes(ch.home.star)); const p = at(ch.home.s - 1.5, 9.5, 2.6 + Math.sin(clock * 2) * 0.1); nd.setPosition(p[0], p[1], p[2]); nd.setRotation(0, clock * 1.4, 0); }
      ch.meat.forEach((m, i) => {
        const nd = node(`meat-${i}`);
        nd.setVisible(!s.eaten.has(m.s) && Math.abs(m.s - s.s) < 220);
        const p = at(m.s, m.lane, (m.height ?? 1.15) + Math.sin(clock * 2.4 + i) * 0.1);
        nd.setPosition(p[0], p[1], p[2]); nd.setRotation(0, clock * 1.8, 0.3);
      });

      /* ---- orb field: collectables near the runner, magnet-pulled when riding ---- */
      let k = 0;
      const put = (p: V3, size: number, alpha: number, tone: V3): void => {
        if (k >= ORB_CAP) return;
        orbPos[k * 3] = p[0]; orbPos[k * 3 + 1] = p[1]; orbPos[k * 3 + 2] = p[2];
        orbTone[k * 3] = tone[0]; orbTone[k * 3 + 1] = tone[1]; orbTone[k * 3 + 2] = tone[2];
        orbSize[k] = size; orbAlpha[k] = alpha; k++;
      };
      const chestNow = at(s.s, s.lane, s.jump + 1.2);
      for (const orb of g.orbs) {
        if (orb.s < s.s - 3 || orb.s > s.s + 90) continue;
        if (s.collected.has(orb.id)) continue;
        const mag = g.magnet.get(orb.id);
        let p = at(orb.s, orb.lane, 1.15 + Math.sin(clock * 3 + orb.id) * 0.1);
        if (mag !== undefined) p = lerp3(p, chestNow, Math.min(1, 0.2 + mag * 0.6));
        put(p, 0.55, 1, [1.0, 0.93, 0.62]);
      }
      for (const ball of ch.balls) if (!s.balls.includes(ball.star) && Math.abs(ball.s - s.s) < 90) put(at(ball.s, ball.lane, ball.height), 2.6, 0.55, [1.0, 0.55, 0.12]);
      for (let i = k; i < ORB_CAP; i++) { orbAlpha[i] = 0; orbPos[i * 3 + 1] = -1e4; }
      orbs.updateAttribute?.("position", { array: orbPos, offset: 0 });
      orbs.updateAttribute?.("tone", { array: orbTone, offset: 0 });
      orbs.updateAttribute?.("aSize", { array: orbSize, offset: 0 });
      orbs.updateAttribute?.("aAlpha", { array: orbAlpha, offset: 0 });

      /* ---- boulders and warning decals ---- */
      const enc = g.enc;
      ch.boulders.forEach((bd, i) => {
        const nd = node(`boulder-${i}`), wz = node(`warn-boulder-${i}`);
        const d = s.s - bd.s, vis = d > -62 && d < 22 && !(enc.boulders[i]?.passed && d > 6);
        nd.setVisible(vis);
        const lane = -16 + (d + 36) * 0.44;
        if (vis) {
          const fr = frameAt(bd.s, lane), bounce = Math.abs(Math.sin((lane + 16) * Math.PI / 4.4)) * 0.55 * (1 - smooth(10, 16, lane + 16));
          const gh = groundHeight(ch, bd.s, lane);
          // Fitted model: its origin is the lowest point and the roll pivots there, so place the node at (centre - rotated radius) to roll about the centre.
          const roll = -(lane + 16) / 2.0;
          nd.setPosition(
            fr.point[0] + fr.up[0] * (bounce + 1.9 + gh) + Math.sin(roll) * 1.9,
            fr.point[1] + fr.up[1] * (bounce + 1.9 + gh) - Math.cos(roll) * 1.9,
            fr.point[2] + fr.up[2] * (bounce + 1.9 + gh)
          );
          nd.setScale(1.9);
          nd.setRotation(0, yawOf(fr.forward), roll);
          if (d > -50 && Math.random() < 0.0) fx.dust(at(bd.s, lane, 0.2), fr.up, 1);
        }
        const zc = at(bd.s, 0, 0.1), zf = frameAt(bd.s);
        const wvis = !enc.boulders[i]?.passed && d > -46 && d < 0;
        wz.setVisible(wvis);
        if (wvis) { wz.setPosition(zc[0], zc[1] + 0.05, zc[2]); wz.setRotation(0, yawOf(zf.forward), 0); wz.setScale([11.2, 1, 2.6]); wz.setUniform?.("warnAlpha", smooth(-46, -30, d)); wz.setUniform?.("warnGold", 0); wz.setUniform?.("tClock", clock); }
      });

      /* ---- pteranodons ---- */
      dives.forEach((c, i) => {
        const body = node(`ptera-body-${i}`), wz = node(`warn-dive-${i}`);
        const dv = enc.dives[i];
        const d = s.s - c.s;
        const alive = dv && !dv.hit && d > -70 && d < 26;
        const gone = dv?.ko && d < 40 && d > -70 && dv.hit;
        const show = !!alive || !!gone;
        body.setVisible(show);
        if (show && dv) {
          const target = dv.target ?? s.lane;
          const k2 = smooth(-40, 0, d);
          let sp = c.s + 18 * (1 - k2) - Math.max(0, d) * 1.2, lat = mix(target > 0 ? -9 : 9, target, k2), hgt = 1.6 + 17 * (1 - smooth(-40, -2, d)) + (d > 0 ? d * 0.7 : 0);
          let bank = (lat - target) * 0.03, flap = Math.sin(clock * 11 + i) * 0.55;
          if (dv.hit && dv.ko) { const t = Math.max(0, clock % 100); void t; sp = c.s + (d * 0.4); hgt = 3 + Math.max(0, d) * 0.2; flap = 0.9; bank = clock * 6; lat = target + d * 0.5; }
          const bp = at(sp, lat, hgt);
          const bf = frameAt(sp);
          const by = yawOf(bf.forward) + Math.PI + (dv.hit ? 0 : 0);
          body.setPosition(bp[0], bp[1] + Math.sin(clock * 11 + i) * 0.12, bp[2]); body.setRotation(0.2 * (1 - k2), yawOf(bf.forward) + Math.PI, bank + flap * 0.22); body.setScale([2.6, 2.6 - Math.abs(flap) * 0.25, 2.6]);
          void by;
        }
        const wvis = !!dv && !dv.passed && !dv.hit && dv.target !== null && d > -40 && d < 0;
        wz.setVisible(wvis);
        if (wvis && dv) {
          const kk = smooth(-40, -2, d), zp = at(c.s, dv.target ?? 0, 0.1), zf = frameAt(c.s);
          wz.setPosition(zp[0], zp[1] + 0.05, zp[2]); wz.setRotation(0, yawOf(zf.forward), 0); wz.setScale([3.5 + kk * 4, 1, 4.5 + kk * 4.5]);
          wz.setUniform?.("warnAlpha", 0.35 + kk * 0.65); wz.setUniform?.("warnGold", 0); wz.setUniform?.("tClock", clock);
        }
      });

      /* ---- tyrant lizard ---- */
      const trexState = enc.trex;
      if (trexState) {
        const body = node("rex-body");
        const tc = trexState.creature;
        const present = s.s > tc.s - 30 && s.s < (tc.until ?? 0) + 14 && !trexState.beaten;
        body.setVisible(present);
        if (present) {
          const next = trexState.attacks.find((a) => !a.done);
          const targetS = next ? next.s - 2 : s.s + 6;
          if (!rexInit) { rexS = Math.max(tc.s - 18, s.s + 14); rexInit = true; }
          rexS += Math.max(-26 * dt, Math.min(26 * dt, targetS - rexS));
          const stunned = s.s < trexState.stunnedUntil;
          const lat = -10.2, bp = at(rexS, lat, groundHeight(ch, rexS, lat)), fwd = frameAt(rexS).forward;
          const stomp = Math.abs(Math.sin(clock * 6)) * 0.22 * (stunned ? 0.2 : 1);
          const nextAttack = next && !stunned ? next : null;
          const dd = nextAttack ? s.s - nextAttack.s : -50;
          const lunge = nextAttack ? smooth(-9, -1.5, dd) * (1 - smooth(0.5, 5, dd)) : 0;
          const swipe = nextAttack && nextAttack.kind === "swipe" ? smooth(-8, -1, dd) * (1 - smooth(1, 5, dd)) : 0;
          const yaw0 = Math.atan2(fwd[0], fwd[2]) + Math.PI * 0.72 - swipe * 0.5;
          const sc = 1.15;
          const rot = (x: number, y: number, z: number, yawAngle: number): V3 => [x * Math.cos(yawAngle) + z * Math.sin(yawAngle), y, -x * Math.sin(yawAngle) + z * Math.cos(yawAngle)];
          const reachF = rot(0, 0, lunge * 3.2, yaw0 - Math.PI * 0.72 + Math.PI * 0.72);
          body.setPosition(bp[0] + reachF[0], bp[1] + stomp - (stunned ? 0.6 : 0), bp[2] + reachF[2]);
          body.setRotation(stunned ? 0.18 : lunge * 0.28, yaw0 + Math.PI * REX_FACING, stunned ? 0.08 : swipe * 0.18);
          body.setScale(sc);
        }
        rexAttacks.forEach((a, i) => {
          const wz = node(`warn-rex-${i}`), tstate = trexState.attacks.find((x) => x.s === a.s);
          const d = s.s - a.s;
          const live = !!tstate && !tstate.done && s.s >= trexState.stunnedUntil && d > -30 && d < 0;
          wz.setVisible(live);
          if (live) {
            const fr = frameAt(a.s), isBite = a.kind === "bite";
            const lateral = isBite ? -3.0 : 0, width = isBite ? 5.2 : 11.2, length = isBite ? 7 : 3;
            const zp = at(a.s, lateral, 0.1);
            wz.setPosition(zp[0], zp[1] + 0.05, zp[2]); wz.setRotation(0, yawOf(fr.forward), 0); wz.setScale([width, 1, length]);
            wz.setUniform?.("warnAlpha", smooth(-30, -18, d)); wz.setUniform?.("warnGold", g.state.jankenWindow && enc.threat?.s === a.s && isBite ? 1 : 0); wz.setUniform?.("tClock", clock);
          }
        });
      }

      /* ---- water, sky and valley follow (footstep dust is emitted on foot touchdowns in play()) ---- */
      for (const id of riverIds) node(id).setUniform?.("tClock", clock);

      /* ---- camera ---- */
      let wantEye: V3, wantLook: V3, fov = aspect < 1 ? 62 : 55 + s.speed * 0.2;
      let cut = false;
      const hp = pos;
      if (phase === "menu") {
        const a = clock * 0.18 + 0.2;
        wantEye = at(s.s + 7.2 * Math.cos(a) + 2.5, 5.0 * Math.sin(a) - 3.6, s.jump + logLift + 2.4);
        wantLook = at(s.s + 0.2, s.lane, s.jump + logLift + 1.2);
        fov = 40; cut = !eye;
      } else if (phase === "finale" && ch.home && hutCentre) {
        // frame the runner and the hut together: aim midway between them and stand back far enough for both to fit the width
        const t = g.finale?.t ?? 0;
        const heroChest: V3 = [pos[0], pos[1] + 1.2, pos[2]];
        const mid = lerp3(heroChest, hutCentre, 0.5);
        fov = 48;
        const halfW = Math.tan((fov * Math.PI) / 360) * Math.min(aspect, 16 / 9);
        const dist = Math.max(11, Math.min(30, 7.5 / Math.max(0.05, halfW)));
        const midS = (s.s + ch.home.s) / 2, midLane = (s.lane + 9.5) / 2;
        const a = 0.55 + t * 0.03;
        const raw = at(midS - dist * Math.cos(a), midLane - dist * Math.sin(a), 3.2 + t * 0.1);
        wantEye = finaleClear.update(dt, { focus: mid, eye: raw, blocked: finaleBlocked, minDistance: 4 });
        wantLook = mid;
      } else if (phase === "result") {
        const a = clock * 0.2;
        wantEye = at(s.s + 3.6 * Math.cos(a), 3.0 * Math.sin(a), s.jump + 1.8);
        wantLook = at(s.s, s.lane, s.jump + 1.0);
        fov = 44;
      } else if (phase === "falling") {
        const fl = g.falling;
        wantEye = eye ?? at(s.s - 7.4, s.lane * 0.65, 3.3);
        wantLook = [hp[0], hp[1] + 0.5, hp[2]];
        void fl;
      } else {
        // portrait start: the ride log fills the lower frame at fov 62, so the eye rises and pulls back until the log is left
        const portraitLog = aspect < 1 && ch.log ? 1 - smooth(ch.log - 12, ch.log + 4, s.s) : 0;
        const back = frameAt(s.s - 7.4 - 4 * portraitLog, s.lane * 0.65), ahead = frameAt(Math.min(ch.length + 20, s.s + 7), s.lane * 0.65);
        const lift = 3.3 + s.jump * 0.35 + (riding ? 0.6 : 0) + logLift * 0.5 + 2.5 * portraitLog;
        wantEye = [back.point[0] + back.up[0] * lift, back.point[1] + back.up[1] * lift, back.point[2] + back.up[2] * lift];
        wantLook = [ahead.point[0] + ahead.up[0] * 1.5, ahead.point[1] + ahead.up[1] * 1.5, ahead.point[2] + ahead.up[2] * 1.5];
        if (g.chase) fov += 3;
        fov += g.danger * 3;
      }
      const shake = g.reducedMotion ? 0 : g.impact * 0.28;
      const pose = chase.step({
        wantEye, wantLook, fovTarget: fov, cut,
        lag: { eye: phase === "playing" ? 14 : 5, look: phase === "playing" ? 14 : 5 },
        shakeOffset: [Math.sin(clock * 83) * shake, Math.sin(clock * 71 + 1) * shake, Math.sin(clock * 97 + 2) * shake]
      }, dt);
      eye = [chase.pose.eye[0], chase.pose.eye[1], chase.pose.eye[2]];
      look = [chase.pose.look[0], chase.pose.look[1], chase.pose.look[2]];
      const shook: V3 = [pose.eye[0], pose.eye[1], pose.eye[2]];
      cam.setPose({ position: [shook[0], shook[1], shook[2]], target: [look[0], look[1], look[2]], up: [0, 1, 0], fov: pose.fov }, { cut: pose.cut });
      camPos.eye = shook; camPos.target = look;
      view.eye = shook; view.target = look; view.fov = pose.fov; view.aspect = aspect; view.hero = pos; view.hut = hutCentre;

      /* distance culling of the small merged scenery (frustum culling alone keeps every chunk ahead on the winding course) */
      let culled = 0;
      for (const c of cullables) {
        const far = Math.hypot(c.centre[0] - shook[0], c.centre[1] - shook[1], c.centre[2] - shook[2]) - c.radius > c.range;
        if (far) culled++;
        if (cullShown.get(c.id) !== !far) { cullShown.set(c.id, !far); node(c.id).setVisible(!far); }
      }
      view.culled = culled;

      sky.setPosition(shook[0], shook[1], shook[2]);
      sky.setUniform?.("cloudPhase", clock);
      valley.setPosition(shook[0], f.point[1] - 43, shook[2]);
      valley.setUniform?.("cloudPhase", clock);

      fx.update(dt, app);
    }
  };
}
