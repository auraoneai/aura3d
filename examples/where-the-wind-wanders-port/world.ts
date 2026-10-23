/**
 * Where the Wind Wanders — meadow world on the public `@aura3d/engine` surface only.
 *
 * The original draws painted sprite art fetched from a remote bucket; the port recreates
 * every visual procedurally (vertex-tinted terrain, wind-swayed foliage cards, primitive
 * props). Gameplay state comes from `sim.ts`; this module only draws it.
 */
import { camera, geometry, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { BELL, BOUNDS, CAMERA_OFFSET, LETTERS, STRUCTURES, START, type WindState } from "./sim";
import { HAZE_FRAGMENT, HAZE_VERTEX, PAINT_FRAGMENT, PAINT_VERTEX, SEA_FRAGMENT, SOLID_FRAGMENT, SOLID_VERTEX, WIND_FRAGMENT, WIND_VERTEX } from "./shaders";
import { buildTerrain, groundHeight, lehmer, pathZ } from "./terrain";

type Rgb = readonly [number, number, number];
type CustomSpec = Parameters<typeof material.custom>[0];
type Scene = ReturnType<typeof scene>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const lin = (hex: string): Rgb => {
  const c = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [c(0), c(1), c(2)];
};

export const windSpec = (): CustomSpec => ({
  glsl: { vertex: WIND_VERTEX, fragment: WIND_FRAGMENT },
  uniforms: { windTime: { type: "f32", value: 0 }, windStrength: { type: "f32", value: 1 } },
  side: "double"
});
export const paintSpec = (tintScale = 1): CustomSpec => ({
  glsl: { vertex: PAINT_VERTEX, fragment: PAINT_FRAGMENT },
  uniforms: { tintScale: { type: "f32", value: tintScale } }
});
export const seaSpec = (): CustomSpec => ({
  glsl: { vertex: PAINT_VERTEX, fragment: SEA_FRAGMENT },
  uniforms: { windTime: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false
});
export const solidSpec = (base: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0): CustomSpec => ({
  glsl: { vertex: SOLID_VERTEX, fragment: SOLID_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...base] }, glowColor: { type: "color3", value: [...glow] }, glow: { type: "f32", value: glowAmount } },
  side: "double"
});
export const hazeSpec = (phase: number): CustomSpec => ({
  glsl: { vertex: HAZE_VERTEX, fragment: HAZE_FRAGMENT },
  uniforms: {
    windTime: { type: "f32", value: 0 },
    hazePhase: { type: "f32", value: phase },
    hazeOpacity: { type: "f32", value: 0.42 },
    hazeColor: { type: "color3", value: [0.86, 0.9, 0.94] }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const solid = (hex: string, glowHex = "#000000", glowAmount = 0) => material.custom(solidSpec(lin(hex), lin(glowHex), glowAmount));

interface FoliageCards {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  tint: number[];
  sway: number[];
  phase: number[];
}

function pushCard(f: FoliageCards, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, color: Rgb, sway: number, phase: number): void {
  const base = f.positions.length / 3;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
    const lx = (u - 0.5) * w;
    f.positions.push(cx + lx * cs, cy + v * h, cz - lx * sn);
    f.normals.push(0, 1, 0);
    f.uvs.push(u, v);
    f.tint.push(color[0], color[1], color[2]);
    f.sway.push(sway);
    f.phase.push(phase);
  }
  f.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export interface WorldRuntime {
  update(state: WindState, dtSeconds: number, timeSeconds: number, aspect: number): void;
  reset(): void;
  readonly nodeCount: number;
  readonly foliageCards: number;
}

export interface World {
  readonly scene: Scene;
  readonly foliageCards: number;
  bind(app: AuraApp): WorldRuntime;
}

const FACING_YAW: Record<string, number> = { front: 0, frontRight: Math.PI / 4, right: Math.PI / 2, backRight: (3 * Math.PI) / 4, back: Math.PI, backLeft: (-3 * Math.PI) / 4, left: -Math.PI / 2, frontLeft: -Math.PI / 4 };

export function buildWorld(): World {
  const rand = lehmer(20261022);
  const builder: Scene = scene()
    .background("#c9dfe9")
    .camera(camera.perspective({ position: [START.x + CAMERA_OFFSET.x - 10 + 12, 6.7, 21], target: [START.x, 2.2, 0.5], fov: 43, near: 0.15, far: 700 }));

  const terrain = buildTerrain(1.5);
  builder.add(geometry.custom(geometry.dynamic({
    positions: terrain.positions,
    normals: terrain.normals,
    indices: terrain.indices,
    attributes: { tint: { itemSize: 3, data: terrain.tint } }
  }), { name: "terrain", material: material.custom(paintSpec()) }));

  const seaY = -0.55;
  const seaQuad = geometry.dynamic({
    positions: f32([-300, seaY, -300, 300, seaY, -300, 300, seaY, 300, -300, seaY, 300]),
    normals: f32([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: [0, 2, 1, 0, 3, 2],
    attributes: { tint: { itemSize: 3, data: f32([0.3, 0.55, 0.6, 0.3, 0.55, 0.6, 0.3, 0.55, 0.6, 0.3, 0.55, 0.6]) } }
  });
  builder.add(geometry.custom(seaQuad, { name: "sea", material: material.custom(seaSpec()) }).runtime({ id: "sea" }));

  /* ---- foliage cards: one merged mesh, one wind material (replaces dozens of per-sprite materials) ---- */
  const f: FoliageCards = { positions: [], normals: [], uvs: [], indices: [], tint: [], sway: [], phase: [] };
  const blocked = (x: number, z: number): boolean =>
    Math.abs(z - pathZ(x)) < 1.3 ||
    Object.values(STRUCTURES).some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 1) ||
    LETTERS.some((l) => Math.hypot(x - l.x, z - l.z) < 1.4);
  const grass: Rgb[] = [lin("#6f9a3c"), lin("#7fa84a"), lin("#5d8a35")];
  const flower: Rgb[] = [lin("#e8d86a"), lin("#f0f0f0"), lin("#9bb7ec"), lin("#e49ab8")];
  let cardCount = 0;
  const scatter = (count: number, kind: "grass" | "flower" | "fern" | "reed"): void => {
    let made = 0, tries = 0;
    while (made < count && tries++ < count * 6) {
      const x = BOUNDS.minX + rand() * (BOUNDS.maxX - BOUNDS.minX), z = BOUNDS.minZ + rand() * (BOUNDS.maxZ - BOUNDS.minZ - 6) - 2;
      if (z < -12 || blocked(x, z)) continue;
      const y = groundHeight(x, z);
      const yaw = rand() * Math.PI;
      const phase = rand() * 6.28;
      const color = kind === "flower" ? flower[Math.floor(rand() * flower.length)]! : grass[Math.floor(rand() * grass.length)]!;
      const h = kind === "grass" ? 0.55 + rand() * 0.5 : kind === "flower" ? 0.4 + rand() * 0.3 : kind === "fern" ? 0.9 + rand() * 0.5 : 1.3 + rand() * 0.6;
      const w = kind === "fern" ? 1.1 : kind === "reed" ? 0.5 : 0.7;
      pushCard(f, x, y - 0.02, z, w, h, yaw, color, 0.14 * h, phase);
      pushCard(f, x, y - 0.02, z, w, h, yaw + Math.PI / 2, color, 0.14 * h, phase + 0.7);
      made++;
      cardCount += 2;
    }
  };
  scatter(1500, "grass");
  scatter(260, "flower");
  scatter(90, "fern");
  scatter(60, "reed");
  const foliageGeometry = geometry.dynamic({
    positions: f32(f.positions),
    normals: f32(f.normals),
    uvs: f32(f.uvs),
    indices: new Uint32Array(f.indices),
    attributes: { tint: { itemSize: 3, data: f32(f.tint) }, sway: { itemSize: 1, data: f32(f.sway) }, phase: { itemSize: 1, data: f32(f.phase) } }
  });
  builder.add(geometry.custom(foliageGeometry, { name: "foliage", material: material.custom(windSpec()) }).runtime({ id: "foliage" }));

  /* ---- trees (pine stacks, birches), the oak and the structures ---- */
  const tree = (name: string, x: number, z: number, s: number, hex: string): void => {
    const y = groundHeight(x, z);
    builder.add(primitives.cylinder({ name: `${name}-trunk`, position: [x, y + 0.8 * s, z], size: [0.28 * s, 1.6 * s, 0.28 * s], material: solid("#6a4a2e") }));
    for (let i = 0; i < 3; i++) {
      builder.add(primitives.cone({ name: `${name}-crown-${i}`, position: [x, y + (1.5 + i * 0.95) * s, z], params: { radius: (1.35 - i * 0.28) * s, height: 1.7 * s, radialSegments: 8 }, material: solid(hex) }));
    }
  };
  for (let i = 0; i < 64; i++) {
    const x = BOUNDS.minX + rand() * (BOUNDS.maxX - BOUNDS.minX), z = -12 + rand() * 33;
    if (blocked(x, z) || Math.abs(x + 25) < 4.5) { i--; continue; }
    tree(`pine-${i}`, x, z, 0.8 + rand() * 0.9, rand() < 0.5 ? "#3d6b36" : "#4c7a3c");
  }
  const oakY = groundHeight(-25, 0);
  builder.add(primitives.cylinder({ name: "oak-trunk", position: [-25, oakY + 2.2, 0], size: [1.1, 4.4, 1.1], material: solid("#5e4229") }));
  builder.add(primitives.sphere({ name: "oak-canopy", position: [-25, oakY + 5.8, 0], size: 6.2, material: solid("#4f8a3a") }));
  const cottage = STRUCTURES.cottage;
  const cy = groundHeight(cottage.x, cottage.z);
  builder.add(primitives.box({ name: "cottage-walls", position: [cottage.x, cy + 1.7, cottage.z], size: [5.4, 3.4, 4.2], material: solid("#e3d6b8") }));
  builder.add(primitives.cone({ name: "cottage-roof", position: [cottage.x, cy + 4.9, cottage.z], rotation: [0, Math.PI / 4, 0], params: { radius: 4.2, height: 2.6, radialSegments: 4 }, material: solid("#a8573a") }));
  const dc = STRUCTURES.distantCottage;
  const dcy = groundHeight(dc.x, dc.z);
  builder.add(primitives.box({ name: "distant-cottage-walls", position: [dc.x, dcy + 1.5, dc.z], size: [4.6, 3, 3.6], material: solid("#d8cdb0") }));
  builder.add(primitives.cone({ name: "distant-cottage-roof", position: [dc.x, dcy + 4.2, dc.z], rotation: [0, Math.PI / 4, 0], params: { radius: 3.6, height: 2.2, radialSegments: 4 }, material: solid("#97503a") }));
  const mill = STRUCTURES.windmill;
  const my = groundHeight(mill.x, mill.z);
  builder.add(primitives.cylinder({ name: "windmill-tower", position: [mill.x, my + 5, mill.z], size: [3.4, 10, 3.4], material: solid("#efe6cf") }));
  builder.add(primitives.cone({ name: "windmill-cap", position: [mill.x, my + 11.2, mill.z], params: { radius: 2.5, height: 2.6, radialSegments: 8 }, material: solid("#8d6a46") }));
  for (let i = 0; i < 4; i++) {
    builder.add(primitives.box({ name: `windmill-sail-${i}`, position: [mill.x, my + 9, mill.z + 2.1], size: [0.5, 7.4, 0.12], rotation: [0, 0, (i * Math.PI) / 2], material: solid("#f3ecd8") }).runtime({ id: `windmill-sail-${i}` }));
  }

  /* ---- fences, signs, jetty, bell, letters ---- */
  const fenceAt = (x: number, z: number, scale: number): void => {
    const y = groundHeight(x, z);
    const w = scale * (570 / 290);
    builder.add(primitives.box({ name: `fence-${x}-${z}`, position: [x, y + 0.7, z], size: [w, 0.14, 0.1], material: solid("#a08558") }));
    builder.add(primitives.box({ name: `fence-low-${x}-${z}`, position: [x, y + 0.38, z], size: [w, 0.12, 0.1], material: solid("#a08558") }));
    for (const dx of [-0.4, 0, 0.4]) builder.add(primitives.box({ name: `fence-post-${x}-${z}-${dx}`, position: [x + dx * w, y + 0.45, z], size: [0.1, 0.9, 0.1], material: solid("#8d7549") }));
  };
  for (let x = -18; x < -7; x += 4) fenceAt(x, -4, 1.45);
  for (let x = 25; x < 42; x += 4) fenceAt(x, 7, 1.35);
  for (const [sx, sz] of [[-14, 2], [13, 3]] as const) {
    const y = groundHeight(sx, sz);
    builder.add(primitives.cylinder({ name: `sign-post-${sx}`, position: [sx, y + 0.7, sz], size: [0.12, 1.4, 0.12], material: solid("#7b5b36") }));
    builder.add(primitives.box({ name: `sign-board-${sx}`, position: [sx, y + 1.45, sz], size: [0.9, 0.4, 0.08], material: solid("#c4a46a") }));
  }
  for (let i = 0; i < 12; i++) {
    const z = -10.5 - 0.6 * i;
    builder.add(primitives.box({ name: `jetty-plank-${i}`, position: [31, 0.05, z], size: [2.7, 0.13, 0.55], material: solid(i % 2 ? "#a78a56" : "#927548") }));
  }
  const bellY = groundHeight(BELL.x, BELL.z);
  builder.add(primitives.cylinder({ name: "bell-post", position: [BELL.x, bellY + 1.4, BELL.z], size: [0.18, 2.8, 0.18], material: solid("#6a4a2e") }));
  builder.add(primitives.cone({ name: "bell", position: [BELL.x, bellY + 2.7, BELL.z], params: { radius: 0.55, height: 0.9, radialSegments: 12 }, rotation: [Math.PI, 0, 0], material: solid("#d9a43a", "#ffd37a", 0.35) }).runtime({ id: "bell" }));
  LETTERS.forEach((l, i) => {
    const y = groundHeight(l.x, l.z);
    builder.add(primitives.box({ name: `letter-${i}`, position: [l.x, y + 1.05, l.z], size: [0.62, 0.42, 0.04], rotation: [0.3, 0.5, 0.1], material: solid("#f6f0dc", "#fff2b0", 0.6) }).runtime({ id: `letter-${i}` }));
  });

  /* ---- mist ribbons ---- */
  [0, 3.1, 6.4].forEach((phase, i) => {
    const z = -8 - i * 5;
    builder.add(geometry.custom(geometry.dynamic({
      positions: f32([-60, 0.4, z, 60, 0.4, z, 60, 6, z, -60, 6, z]),
      normals: f32([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: f32([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: [0, 1, 2, 0, 2, 3]
    }), { name: `mist-${i}`, material: material.custom(hazeSpec(phase)) }).runtime({ id: `mist-${i}` }));
  });

  /* ---- traveller (procedural stand-in for the painted sprite) and its shadow ---- */
  builder.add(primitives.capsule({ name: "player-body", position: [START.x, 1, START.z], size: [0.5, 1.2, 0.5], material: solid("#4a6fa5") }).runtime({ id: "player-body" }));
  builder.add(primitives.sphere({ name: "player-head", position: [START.x, 1.8, START.z], size: 0.46, material: solid("#e9c9a5") }).runtime({ id: "player-head" }));
  builder.add(primitives.cone({ name: "player-hat", position: [START.x, 2.1, START.z], params: { radius: 0.34, height: 0.4, radialSegments: 10 }, material: solid("#b8452e") }).runtime({ id: "player-hat" }));
  builder.add(primitives.cylinder({ name: "player-shadow", position: [START.x, 0.1, START.z], size: [0.8, 0.02, 0.8], material: solid("#2e3a1f") }).runtime({ id: "player-shadow" }));

  return {
    scene: builder,
    foliageCards: cardCount,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const cam = app.camera;
      if (!cam) throw new Error("where-the-wind-wanders-port: the app exposes no camera controller");
      const look = { x: -10, y: 2.2, z: 0.5 };
      let lastFound = -1;
      return {
        foliageCards: cardCount,
        get nodeCount() { return handles.size; },
        reset() { look.x = -10; look.y = 2.2; look.z = 0.5; lastFound = -1; },
        update(state, dt, time, aspect) {
          const { x, z } = state.pos;
          const y = groundHeight(x, z);
          const hop = state.hop.height;
          const yaw = FACING_YAW[state.facing] ?? 0;
          node("player-body").setPosition(x, y + 0.95 + hop, z).setRotation(0, yaw, 0);
          node("player-head").setPosition(x, y + 1.78 + hop, z);
          node("player-hat").setPosition(x, y + 2.12 + hop, z);
          node("player-shadow").setPosition(x, y + 0.03, z).setScale(1 - 0.13 * hop);
          node("foliage").setUniform?.("windTime", time);
          node("sea").setUniform?.("windTime", time);
          for (let i = 0; i < 3; i++) node(`mist-${i}`).setUniform?.("windTime", time);
          for (let i = 0; i < 4; i++) node(`windmill-sail-${i}`).setRotation(0, 0, (i * Math.PI) / 2 + time * 0.45);
          if (state.found.length !== lastFound) {
            lastFound = state.found.length;
            LETTERS.forEach((_, i) => node(`letter-${i}`).setVisible(!state.found.includes(i)));
            node("bell").setPosition(BELL.x, groundHeight(BELL.x, BELL.z) + 2.7 + (state.complete ? 0.15 : 0), BELL.z);
          }
          LETTERS.forEach((l, i) => {
            if (!state.found.includes(i)) node(`letter-${i}`).setPosition(l.x, groundHeight(l.x, l.z) + 1.05 + 0.12 * Math.sin(time * 2 + i), l.z);
          });
          // camera follow: the look target eases toward the traveller (original: lerp 1 - exp(-2.5 dt))
          const tx = x + 2, ty = y + hop + 1.8, tz = z - 3.5;
          const k = 1 - Math.exp(-2.5 * dt);
          look.x += (tx - look.x) * k;
          look.y += (ty - look.y) * k;
          look.z += (tz - look.z) * k;
          cam.setPose({
            position: [look.x + CAMERA_OFFSET.x, look.y + CAMERA_OFFSET.y, look.z + CAMERA_OFFSET.z],
            target: [look.x, look.y, look.z],
            up: [0, 1, 0],
            fov: aspect < 1 ? 50 : 43
          }, { cut: false });
        }
      };
    }
  };
}
