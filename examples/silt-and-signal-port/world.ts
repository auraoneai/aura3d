/**
 * Silt & Signal on Aura3D: the rendered world for one chapter, built on the public engine surface.
 *
 * Lit PBR terrain, road and canal banks with CC0 texture sets, instanced trees, rocks, houses, lamps and aqueduct
 * piers, a rigged hero on a board, additive signal rings, a flowing canal, the ported sky dome, a cascaded sun,
 * hemisphere fill, fog and a light grade/bloom. Sky colours follow the original's per-chapter rule; the layout of
 * chapter 0 follows the original's measured object positions (see terrain.ts).
 */
import {
  camera, createAnimationController, effects, environments, geometry, instances, lights, material, model, primitives, scene,
  type AuraApp, type AuraMaterialSpec
} from "@aura3d/engine";
import { assets } from "./assets";
import { CHAPTERS } from "./chapters-data";
import { objectiveOf, type Sim } from "./sim";
import { RING_FRAGMENT, RING_VERTEX, SKY_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from "./shaders";
import { createTerrain, usesOriginalTerrain, type Column, type MeshData, type Placement, type Terrain, type Wall } from "./terrain";

type Scene = ReturnType<typeof scene>;
export type Rgb = readonly [number, number, number];
export type CustomSpec = Parameters<typeof material.custom>[0];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** 0xRRGGBB (sRGB) to a linear triple, the working space three.js uses for `Color(hex)`. */
export const hexLinear = (hex: number): Rgb => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
export const cssHex = (hex: number): string => `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;
const mixHex = (a: number, b: number, t: number): number => {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The original picks the sky colours per chapter, falling back to the palette (`D` in the bundle). */
export function skyColors(chapter: number): { top: Rgb; bottom: Rgb; night: number } {
  const ch = CHAPTERS[chapter]!;
  // chapter 0 is a dusk plaza in the original's frames: measured sky colours (top, horizon) instead of the palette's day blues
  if (chapter === 0) return { top: hexLinear(0xa9b8c2), bottom: hexLinear(0xe8c9ae), night: 0 };
  const top = chapter === 0 ? 7125983 : chapter === 6 ? 10205909 : chapter === 1 ? 9549517 : ch.palette.sky!;
  const bottom = chapter === 0 ? 13494749 : chapter === 6 ? 15846320 : chapter === 1 ? 14792340 : ch.palette.fog!;
  return { top: hexLinear(top), bottom: hexLinear(bottom), night: ch.night ? 1 : 0 };
}

export const skySpec = (chapter: number): CustomSpec => {
  const c = skyColors(chapter);
  return {
    glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    uniforms: {
      skyTop: { type: "color3", value: [...c.top] },
      skyBottom: { type: "color3", value: [...c.bottom] },
      skyNight: { type: "f32", value: c.night }
    },
    side: "back",
    depthWrite: false
  };
};

export const waterSpec = (chapter: number): CustomSpec => {
  const p = CHAPTERS[chapter]!.palette;
  const original = usesOriginalTerrain(chapter);
  return {
    glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
    uniforms: {
      waterColor: { type: "color3", value: [...hexLinear(p.water!)] },
      siltTime: { type: "f32", value: 0 },
      canalShift: { type: "f32", value: original ? 0 : 62 },
      canalHalf: { type: "f32", value: original ? 25 : 16 },
      fogColor: { type: "color3", value: [...hexLinear(chapter === 0 ? 0xdcc5b1 : p.fog!)] },
      fogFar: { type: "f32", value: 1400 }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
};

export const ringSpec = (active: boolean, color: Rgb = [1, 0.82, 0.42]): CustomSpec => ({
  glsl: { vertex: RING_VERTEX, fragment: RING_FRAGMENT },
  uniforms: {
    ringColor: { type: "color3", value: [...color] },
    ringActive: { type: "f32", value: active ? 1 : 0 },
    siltTime: { type: "f32", value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

/** One of each distinct program the scene uses, so a unit test can compile exactly what the app draws. */
export const allProgramSpecs = (chapter = 0): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec(chapter) },
  { name: "water", spec: waterSpec(chapter) },
  { name: "ring", spec: ringSpec(true) }
];

export const MAX_RINGS = 8;

export interface WorldStats { readonly walls: number; readonly trees: number; readonly rocks: number; readonly houses: number; readonly lamps: number; readonly stone: number; readonly brass: number; readonly terrainTriangles: number }

export interface WorldRuntime {
  update(sim: Sim, dt: number, time: number, aspect: number): void;
  /** play a one-shot rider clip (ring pickup, objective complete) and return to the cruise loop */
  celebrate(): void;
  readonly nodeCount: number;
  readonly riderAnimation: () => { bound: boolean; clip: string | null; error?: string };
}

export interface World {
  readonly scene: Scene;
  readonly stats: WorldStats;
  readonly terrain: Terrain;
  bind(app: AuraApp, options?: { readonly animate?: boolean }): WorldRuntime;
}

const FAR = [0, -400, 0] as const;
/** board.glb is 0.7 m long and 0.137 m thick; the rider's feet stand on its deck top */
const BOARD_SCALE = 2.8;
const BOARD_DROP = 1.25;
const DECK_TOP = 0.137 * BOARD_SCALE;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const dynamicFrom = (m: MeshData) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });

/** Lighting rig per chapter, from the measured chapter-0 rig (warm key 2.2, sky/ground hemisphere 1.05, exp2 fog) and the palette. */
function rigOf(chapter: number) {
  const ch = CHAPTERS[chapter]!;
  const p = ch.palette;
  const night = chapter === 0 ? false : !!ch.night;
  return {
    night,
    sun: cssHex(night ? mixHex(p.sun!, 0x6f8fd0, 0.55) : p.sun!),
    sunIntensity: night ? 0.7 : 2.2,
    hemiSky: cssHex(night ? mixHex(p.sky!, 0x1a2a55, 0.5) : chapter === 0 ? 0x73b4c4 : p.sky!),
    hemiGround: cssHex(night ? 0x0b1220 : chapter === 0 ? 0x324a57 : mixHex(p.ground!, 0x1c2630, 0.6)),
    hemiIntensity: night ? 0.85 : 1.45,
    fog: chapter === 0 ? "#dcc5b1" : cssHex(p.fog!),
    fogDensity: night ? 0.0014 : 0.0009,
    background: chapter === 0 ? "#e3c5ab" : cssHex(p.fog!)
  };
}

const placements = (list: readonly Placement[], offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) =>
  list.map((p) => ({
    position: [p.x - offset.x * p.scale, p.y + offset.y * p.scale, p.z - offset.z * p.scale] as [number, number, number],
    rotation: [0, p.yaw, 0] as [number, number, number],
    scale: p.scale
  }));

const wallTransforms = (list: readonly Wall[]) =>
  list.map((w) => ({
    position: [w.x, (w.bottom + w.top) / 2, w.z] as [number, number, number],
    scale: [w.halfX * 2, w.top - w.bottom, w.halfZ * 2] as [number, number, number]
  }));

const columnTransforms = (list: readonly Column[]) =>
  list.map((c) => ({
    position: [c.x, (c.bottom + c.top) / 2, c.z] as [number, number, number],
    scale: [c.r * 2, c.top - c.bottom, c.r * 2] as [number, number, number]
  }));

export function buildWorld(chapter: number): World {
  const ch = CHAPTERS[chapter]!;
  const rig = rigOf(chapter);
  const terrain = createTerrain(chapter);
  const props = terrain.props();
  const palette = ch.palette;

  const grassTint = cssHex(mixHex(0xffffff, palette.ground!, rig.night ? 0.9 : 0.8));
  const stoneTint = cssHex(mixHex(0xffffff, palette.stone!, 0.45));
  const pbr = (spec: AuraMaterialSpec): AuraMaterialSpec => material.pbr({ metallic: 0, envMapIntensity: 0.6, ...spec });

  const terrainMesh = terrain.terrainMesh();
  const builder: Scene = scene()
    .background(rig.background)
    .camera(camera.perspective({ position: [0, 14, 60], target: [0, 8, 0], fov: 62, near: 0.3, far: 2700 }))
    .add(environments.neutral({ intensity: rig.night ? 0.4 : 0.95 }))
    .add(lights.hemisphere({ skyColor: rig.hemiSky, groundColor: rig.hemiGround, intensity: rig.hemiIntensity }))
    .add(lights.directional({
      position: [-100, 153, -80],
      target: [0, 0, 0],
      intensity: rig.sunIntensity,
      color: rig.sun,
      shadow: { mapSize: 4096, cascades: 3, maxDistance: 360, bias: -0.0004 }
    }))
    .add(effects.fog({ density: rig.fogDensity, color: rig.fog }))
    .add(effects.bloom({ intensity: rig.night ? 0.7 : 0.38, threshold: 0.82, radius: 0.5 }))
    .add(effects.colorGrade({ contrast: 1.06, saturation: 1.08, exposure: rig.night ? 1.05 : 1 }));

  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 4200, material: material.custom(skySpec(chapter)) }).runtime({ id: "sky" }));

  builder.add(geometry.custom(dynamicFrom(terrainMesh), {
    name: "terrain",
    receiveShadow: true,
    material: pbr({ color: grassTint, texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 1 })
  }).runtime({ id: "terrain" }));
  const plaza = terrain.plazaMesh();
  if (plaza.indices.length) {
    builder.add(geometry.custom(dynamicFrom(plaza), {
      name: "plaza",
      receiveShadow: true,
      material: pbr({ color: "#e9d2a8", texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: 1 })
    }).runtime({ id: "plaza" }));
  }
  builder.add(geometry.custom(dynamicFrom(terrain.roadMesh()), {
    name: "road",
    receiveShadow: true,
    material: pbr({ color: usesOriginalTerrain(chapter) ? "#d8c08e" : stoneTint, texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: 1 })
  }).runtime({ id: "road" }));
  const bank = terrain.bankMesh();
  if (bank.indices.length) {
    builder.add(geometry.custom(dynamicFrom(bank), {
      name: "bank",
      receiveShadow: true,
      material: pbr({ color: "#d9c8aa", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, roughness: 1 })
    }).runtime({ id: "bank" }));
  }
  builder.add(geometry.custom(dynamicFrom(terrain.waterMesh()), { name: "canal", material: material.custom(waterSpec(chapter)) }).runtime({ id: "canal" }));
  const deck = terrain.deckMesh();
  if (deck.indices.length) {
    builder.add(geometry.custom(dynamicFrom(deck), {
      name: "cistern-deck",
      receiveShadow: true,
      material: pbr({ color: "#efe2c8", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1 })
    }).runtime({ id: "cistern-deck" }));
  }
  const wallGroups: readonly { kind: Wall["kind"]; spec: AuraMaterialSpec }[] = [
    { kind: "cliff", spec: pbr({ color: "#b7bcc4", texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1, texTransforms: { baseColor: { scale: [6, 2] }, normal: { scale: [6, 2] }, metallicRoughness: { scale: [6, 2] } } }) },
    { kind: "stone", spec: pbr({ color: "#e8d3b0", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1, texTransforms: { baseColor: { scale: [4, 3] }, normal: { scale: [4, 3] }, metallicRoughness: { scale: [4, 3] } } }) },
    { kind: "plaster", spec: pbr({ color: "#fff0d5", roughness: 0.85 }) }
  ];
  for (const group of wallGroups) {
    const list = props.walls.filter((w) => w.kind === group.kind);
    if (!list.length) continue;
    builder.add(instances.box({ name: `walls-${group.kind}`, size: [1, 1, 1], transforms: wallTransforms(list), castShadow: true, receiveShadow: true, material: group.spec }));
  }

  if (props.trees.length) builder.add(instances.model(assets.tree, { name: "trees", transforms: placements(props.trees), castShadow: true, receiveShadow: true }));
  // boulders: squashed icosahedra with the rock texture set (the staged rocks.glb samples a near-black palette entry)
  if (props.rocks.length) {
    builder.add(instances.polyhedron({
      name: "rocks",
      size: [1, 1, 1],
      castShadow: true,
      receiveShadow: true,
      material: pbr({ color: "#b3aea6", texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1 }),
      transforms: props.rocks.map((p) => ({
        position: [p.x, p.y + 0.28 * p.scale, p.z] as [number, number, number],
        rotation: [0, p.yaw, 0] as [number, number, number],
        scale: [p.scale, p.scale * 0.62, p.scale * 0.85] as [number, number, number]
      }))
    }));
  }
  if (props.houses.length) builder.add(instances.model(assets.house, { name: "houses", transforms: placements(props.houses, { x: 0, y: 0, z: -0.064 }), castShadow: true, receiveShadow: true }));
  // lamp.glb keeps its source offset: centre (2.038, 0, 7), height -0.3..0.3
  if (props.lamps.length) builder.add(instances.model(assets.lamp, { name: "lamps", transforms: placements(props.lamps, { x: 2.038, y: 0.3, z: 7 }), castShadow: true }));
  if (props.stone.length) {
    builder.add(instances.cylinder({
      name: "piers",
      size: [1, 1, 1],
      transforms: columnTransforms(props.stone),
      castShadow: true,
      receiveShadow: true,
      material: pbr({ color: "#f0e3c9", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1, texTransforms: { baseColor: { scale: [3, 12] }, normal: { scale: [3, 12] }, metallicRoughness: { scale: [3, 12] } } })
    }));
  }
  if (props.brass.length) {
    builder.add(instances.cylinder({
      name: "masts",
      size: [1, 1, 1],
      transforms: columnTransforms(props.brass),
      castShadow: true,
      material: pbr({ color: "#b99455", roughness: 0.38, metallic: 0.85, envMapIntensity: 1.1 })
    }));
  }

  for (let i = 0; i < MAX_RINGS; i++) {
    builder.add(primitives.torus({
      name: `ring-${i}`,
      position: [...FAR],
      size: [48, 48, 48],
      params: { tube: 0.045 },
      material: material.custom(ringSpec(i === 0))
    }).runtime({ id: `ring-${i}` }));
  }

  for (const side of ["l", "r"]) {
    builder.add(primitives.sphere({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.7, 1.5, 0.7], material: material.custom(ringSpec(true, [0.25, 0.85, 1])) }).runtime({ id: `thruster-${side}` }));
  }
  builder.add(model(assets.board, { name: "board", position: [0, 4, 0], scale: BOARD_SCALE, castShadow: true }).runtime({ id: "board" }));
  builder.add(model(assets.hero, { name: "rider", position: [0, 4, 0], scale: 1.25, castShadow: true }).runtime({ id: "rider" }));

  const stats: WorldStats = {
    walls: props.walls.length, trees: props.trees.length, rocks: props.rocks.length, houses: props.houses.length, lamps: props.lamps.length,
    stone: props.stone.length, brass: props.brass.length, terrainTriangles: (terrainMesh.indices.length + plaza.indices.length) / 3
  };

  return {
    scene: builder,
    stats,
    terrain,
    bind(app: AuraApp, options: { readonly animate?: boolean } = {}): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, h = app.nodes.require(id));
        return h;
      };
      const cameraController = app.camera;
      if (!cameraController) throw new Error("silt-and-signal-port: the app exposes no camera controller");

      let animation: { bound: boolean; clip: string | null; error?: string } = { bound: false, clip: null };
      let controller: ReturnType<typeof createAnimationController> | undefined;
      try {
        if (options.animate === false) throw new Error("animation disabled (norig=1)");
        controller = createAnimationController({ id: "rider-animation", clipRegistry: assets.hero, requiredClips: ["idle", "drive"], suppressRootMotion: true });
        controller.bindRuntimeNode(node("rider"), { id: "rider-binding", defaultClipId: "idle" });
        animation = { bound: true, clip: "idle" };
      } catch (error) {
        animation = { bound: false, clip: null, error: String((error as Error)?.message ?? error) };
        controller = undefined;
      }
      let oneShot = 0;
      const playClip = (clip: string): void => {
        if (!controller || animation.clip === clip) return;
        try { controller.crossFade(clip, 0.14); animation = { ...animation, clip }; } catch { /* clip missing: stay on the current one */ }
      };

      let lookX = 0, lookY = 0, lookZ = 0, init = false;
      let lastPoint = -1, lastObjective = -1;
      return {
        celebrate() { oneShot = 0.9; playClip("emote-yes"); },
        update(sim, dt, time, aspect) {
          const { state, flight } = sim;
          const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
          const pitch = Math.max(-0.35, Math.min(0.35, -flight.vertical * 0.012));
          const rider = node("rider"), board = node("board");
          board.setPosition(state.x, state.y - BOARD_DROP, state.z);
          board.setRotation(pitch, state.yaw + Math.PI, flight.bank);
          rider.setPosition(state.x, state.y - BOARD_DROP + DECK_TOP, state.z);
          rider.setRotation(pitch, state.yaw + Math.PI, flight.bank);
          const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
          for (const [side, ox] of [["l", -0.62], ["r", 0.62]] as const) {
            const t = node(`thruster-${side}`);
            t.setPosition(state.x + ox * cy + 0.2 * sy, state.y - BOARD_DROP - 0.85, state.z - ox * sy + 0.2 * cy);
            t.setScale([1, 0.8 + 0.25 * Math.sin(time * 24 + ox * 5) + Math.min(0.8, Math.abs(flight.speed) * 0.012), 1]);
            t.setUniform?.("siltTime", time);
          }
          node("sky").setPosition(state.x, state.y, state.z);
          node("canal").setUniform?.("siltTime", time);

          if (state.point !== lastPoint || state.objective !== lastObjective) {
            if (lastPoint >= 0 && (state.point > lastPoint || state.objective !== lastObjective)) { oneShot = 0.9; playClip("emote-yes"); }
            lastPoint = state.point; lastObjective = state.objective;
          }
          if (oneShot > 0) oneShot -= dt;
          else if (sim.state.hold > 0) playClip("interact-right");
          else playClip(Math.abs(flight.speed) > 4 ? "drive" : "idle");
          controller?.update(dt);

          const o = objectiveOf(state);
          for (let i = 0; i < MAX_RINGS; i++) {
            const h = node(`ring-${i}`);
            const p = o.points[i];
            if (!p || state.scene || state.completed) { h.setPosition(...FAR); continue; }
            h.setPosition(p.x, p.y, p.z);
            h.setUniform?.("siltTime", time);
            h.setUniform?.("ringActive", i === state.point ? 1 : 0);
          }
          const back = 13 + Math.min(8, Math.abs(flight.speed) * 0.08);
          const ex = state.x - fx * back, ey = state.y + 5.2 + Math.abs(flight.vertical) * 0.05, ez = state.z - fz * back;
          const tx = state.x + fx * 14, ty = state.y + 1.2, tz = state.z + fz * 14;
          if (!init) { lookX = tx; lookY = ty; lookZ = tz; init = true; }
          const k = 1 - Math.exp(-dt * 5);
          lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; lookZ += (tz - lookZ) * k;
          const kick = flight.boosting ? 6 : 0;
          cameraController.setPose({ position: [ex, ey, ez], target: [lookX, lookY, lookZ], up: [0, 1, 0], fov: (aspect < 0.85 ? 78 : 62) + kick }, { cut: false });
        },
        get nodeCount() { return handles.size; },
        riderAnimation: () => animation
      };
    }
  };
}
