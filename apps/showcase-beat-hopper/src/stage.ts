/**
 * Beat Hopper stage scenery (presentation only). Every layer is one merged batch node, laid out once from a
 * presentation-only LCG (never the gameplay stream):
 *   - neon grid floor 7 m below the elevated track, track girder + under-glow, pylons every 12 m
 *   - LED equalizer meters rising from the floor beside the track (heights dance on the sim beat)
 *   - lit-window towers with neon roof trims (mid city, scrolls 1:1) and a static far skyline
 *   - neon palms along the floor, beat arches over the track, floating islands with palms and speaker stacks
 *     (half-speed parallax), two glowing ridge rings on the horizon, sweeping searchlights and drifting motes
 * The renderer snapshots every runtime geometry node each frame (a full vertex pass for its bounds), so scenery is
 * static geometry: scrolling layers are periodic static children of a runtime group that moves by `dist mod period`,
 * and only the equalizer (heights), searchlights (yaw), floor (grid scroll) and sky are runtime geometry nodes.
 */
import { geometry, material, type AuraApp } from "@aura3d/engine";
import { Batch, type MeshData } from "../../../examples/shared/runner-kit/index";
import { boxMesh, mergeMeshes, sphereMesh, translateMesh } from "./meshes";
import { floorSpec, glowSpec, ridgeSpec, stageLitSpec, type Haze } from "./stage-shaders";
import { linear } from "./look";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Rgb = readonly [number, number, number];

export const FLOOR_Y = -7;

/** Presentation-only LCG (scenery layout): never the gameplay stream. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ mesh helpers */

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** Rotate about X (pitch) then Y (yaw), then translate. */
export function transformMesh(m: MeshData, pitch: number, yaw: number, tx = 0, ty = 0, tz = 0, roll = 0): MeshData {
  const out: MeshData = { positions: [], normals: [], uvs: m.uvs.slice(), indices: m.indices.slice() };
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    const x0 = x * cr - y * sr, y0 = x * sr + y * cr;
    const y1 = y0 * cp - z * sp, z1 = y0 * sp + z * cp;
    return [x0 * cy + z1 * sy, y1, -x0 * sy + z1 * cy];
  };
  for (let i = 0; i < m.positions.length; i += 3) {
    const p = rot(m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number);
    out.positions.push(p[0] + tx, p[1] + ty, p[2] + tz);
    const n = rot(m.normals[i] as number, m.normals[i + 1] as number, m.normals[i + 2] as number);
    out.normals.push(n[0], n[1], n[2]);
  }
  return out;
}

/** Faceted floating-island rock: flat top (y = 0, radius 1) tapering to a tip at y = -depth. */
function islandMesh(sides: number, depth: number, rand: () => number): MeshData {
  const m = empty();
  const ring = (r: number, y: number) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    const j = r * (0.85 + rand() * 0.3);
    return [Math.cos(a) * j, y, Math.sin(a) * j] as const;
  });
  const top = ring(1, 0);
  const mid = ring(0.72, -depth * 0.38);
  const tip = [0, -depth, 0] as const;
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[], v: [number, number, number]) => {
    const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
    const wx = c[0]! - a[0]!, wy = c[1]! - a[1]!, wz = c[2]! - a[2]!;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = m.positions.length / 3;
    for (const [i, p] of [a, b, c].entries()) {
      m.positions.push(p[0]!, p[1]!, p[2]!);
      m.normals.push(nx, ny, nz);
      m.uvs.push(0, v[i]!);
    }
    m.indices.push(base, base + 1, base + 2);
  };
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    tri([0, 0, 0], top[k2]!, top[k]!, [1, 1, 1]);
    tri(top[k]!, top[k2]!, mid[k2]!, [1, 1, 0.6]);
    tri(top[k]!, mid[k2]!, mid[k]!, [1, 0.6, 0.6]);
    tri(mid[k]!, mid[k2]!, tip, [0.6, 0.6, 0]);
  }
  return m;
}

/** One palm leaf: two flat-shaded triangles folded along the midrib (6 vertices), pointing along -Z. */
function leafMesh(halfWidth: number, length: number): MeshData {
  const m = empty();
  const base = [0, 0, 0], tip = [0, -0.04, -length];
  const tris = [[base, [-halfWidth, -0.025, -length * 0.42], tip], [base, tip, [halfWidth, -0.025, -length * 0.42]]];
  for (const [a, b, c] of tris) {
    const ux = b![0]! - a![0]!, uy = b![1]! - a![1]!, uz = b![2]! - a![2]!;
    const wx = c![0]! - a![0]!, wy = c![1]! - a![1]!, wz = c![2]! - a![2]!;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i0 = m.positions.length / 3;
    for (const [k, p] of [a!, b!, c!].entries()) {
      m.positions.push(p[0]!, p[1]!, p[2]!);
      m.normals.push(nx, ny, nz);
      m.uvs.push(k === 2 ? 1 : 0, 0.5);
    }
    m.indices.push(i0, i0 + 1, i0 + 2);
  }
  return m;
}

/** Neon palm: a curved segmented trunk and drooping fronds (base at y = 0, about 1 unit tall). */
function palmMesh(): MeshData {
  const parts: MeshData[] = [];
  const segs = 3;
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const h = 0.34;
    const w = 0.07 - i * 0.012;
    const lean = 0.05 + i * 0.07;
    parts.push(transformMesh(boxMesh(w, h, w), 0, 0, x, y + h / 2, 0, -lean));
    x += Math.sin(lean) * h;
    y += Math.cos(lean) * h * 0.98;
  }
  const fronds = 7;
  for (let k = 0; k < fronds; k++) {
    const yaw = (k / fronds) * Math.PI * 2 + 0.3;
    const frond = leafMesh(0.09, 0.5);
    parts.push(transformMesh(frond, -0.42 - (k % 2) * 0.18, yaw, x, y, 0));
  }
  return mergeMeshes(parts);
}

/** Beat arch over the track: two pylons from the floor and a lintel, 15 m wide. */
function archMesh(): MeshData {
  const top = 8.5;
  const h = top - FLOOR_Y;
  return mergeMeshes([
    translateMesh(boxMesh(0.5, h, 0.5), -7.5, FLOOR_Y + h / 2, 0),
    translateMesh(boxMesh(0.5, h, 0.5), 7.5, FLOOR_Y + h / 2, 0),
    translateMesh(boxMesh(15.5, 0.5, 0.5), 0, top, 0)
  ]);
}

/** Thin neon frame inside the arch (drawn additively). */
function archGlowMesh(): MeshData {
  const top = 8.0;
  const h = top - 0.2;
  return mergeMeshes([
    translateMesh(boxMesh(0.12, h, 0.12), -7.0, 0.2 + h / 2, 0),
    translateMesh(boxMesh(0.12, h, 0.12), 7.0, 0.2 + h / 2, 0),
    translateMesh(boxMesh(14.1, 0.12, 0.12), 0, top, 0)
  ]);
}

/** Speaker stack: two cabinets. */
function speakerMesh(): MeshData {
  return mergeMeshes([
    translateMesh(boxMesh(1, 1.1, 0.8), 0, 0.55, 0),
    translateMesh(boxMesh(0.9, 0.9, 0.75), 0, 1.55, 0)
  ]);
}

/** Searchlight beam: an open square frustum along +Y, base at the origin, pre-tilted forward. */
function beamMesh(length: number, r0: number, r1: number): MeshData {
  const m = empty();
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  for (let k = 0; k < 4; k++) {
    const a = corners[k]!, b = corners[(k + 1) % 4]!;
    const quad = [[a[0] * r0, 0, a[1] * r0], [b[0] * r0, 0, b[1] * r0], [b[0] * r1, length, b[1] * r1], [a[0] * r1, length, a[1] * r1]];
    const nx = (a[0] + b[0]) / 2, nz = (a[1] + b[1]) / 2;
    const l = Math.hypot(nx, nz) || 1;
    const base = m.positions.length / 3;
    for (const [i, p] of quad.entries()) {
      m.positions.push(p[0]!, p[1]!, p[2]!);
      m.normals.push(nx / l, 0, nz / l);
      m.uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return transformMesh(m, -0.42, 0);
}

/** Ridge ring on the horizon: a strip of peaks around -Z between the given azimuths. */
function ridgeMesh(radius: number, heights: (u: number) => number, from: number, to: number, columns: number): MeshData {
  const m = empty();
  for (let i = 0; i <= columns; i++) {
    const u = i / columns;
    const a = from + (to - from) * u;
    const x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
    const h = heights(u);
    m.positions.push(x, FLOOR_Y - 2, z, x, FLOOR_Y + h, z);
    m.normals.push(-Math.sin(a), 0, Math.cos(a), -Math.sin(a), 0, Math.cos(a));
    m.uvs.push(u, 0, u, 1);
    if (i < columns) {
      const b = i * 2;
      m.indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  return m;
}

function quadXZ(w: number, d: number, cz: number, y: number): MeshData {
  const x = w / 2, z = d / 2;
  return {
    positions: [-x, y, cz + z, x, y, cz + z, x, y, cz - z, -x, y, cz - z],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

/* ------------------------------------------------------------------ layout */

const NEON: readonly string[] = ["#ff2fb3", "#23e6ff", "#b44dff", "#ff9f1c", "#23e6ff", "#ff2fb3"];

export interface StageOptions {
  readonly haze: Haze;
  readonly farHaze: Haze;
  readonly ridgeHaze: Haze;
}

export interface StageRuntime {
  update(dist: number, beatPhase: number, pulse: number, clock: number, reduced: boolean): void;
}

interface Layer { readonly id: string; readonly period: number; readonly parallax: number }

/** Coverage in world z every scrolling layer must fill (camera at z ~ 8.5, haze closes by ~ 230 m). */
const NEAR_Z = 30;
const FAR_Z = -260;

/** How a stage node is mounted: a runtime node (takes uniforms / vertex writes), a plain static node, or a static
 * child of a runtime group that carries the layer's scroll. */
export type StageMount = "live" | "static" | { readonly group: string };

export function addStage(add: (id: string, geom: ReturnType<typeof geometry.dynamic>, spec: Parameters<typeof material.custom>[0], mount: StageMount) => void, o: StageOptions) {
  const rand = lcg(0x5e7a9e);
  const dyn = (m: MeshData) => geometry.dynamic({
    positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals),
    uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices)
  });
  const layers: Layer[] = [];
  /** Local z range that keeps [FAR_Z, NEAR_Z] covered for any node offset in [0, period * parallax-window). */
  const span = (period: number) => ({ near: NEAR_Z, far: FAR_Z - period });

  /* floor */
  add("stage-floor", dyn(quadXZ(900, 700, -200, FLOOR_Y)), floorSpec(o.haze), "live");

  /* ridges */
  const ridgeRand = lcg(0x71d6e);
  const noise = (seed: number) => {
    const ph = Array.from({ length: 6 }, () => ridgeRand() * Math.PI * 2);
    return (u: number) => {
      let h = 0;
      for (let k = 0; k < 6; k++) h += Math.abs(Math.sin(u * (3 + k * 4.7) * Math.PI + (ph[k] as number))) * (1 / (1 + k * 0.9));
      return h * seed;
    };
  };
  const backH = noise(16);
  const frontH = noise(10);
  const back = ridgeMesh(330, (u) => 6 + backH(u) * (0.55 + 0.45 * Math.abs(u - 0.5) * 2), -2.4, 2.4, 220);
  const front = ridgeMesh(250, (u) => 2 + frontH(u) * (0.25 + 0.75 * Math.pow(Math.abs(u - 0.5) * 2, 0.7)), -2.2, 2.2, 200);
  const ridges = new Batch(mergeMeshes([back, front]), 1, null);
  ridges.place(0, 0, 0, 0, 0, 1, 1, 1);
  {
    const tones: number[] = [];
    const v1 = back.positions.length / 3, v2 = front.positions.length / 3;
    const c1 = linear("#b44dff"), c2 = linear("#ff2fb3");
    for (let i = 0; i < v1; i++) tones.push(c1[0] * 0.8, c1[1] * 0.8, c1[2] * 0.8);
    for (let i = 0; i < v2; i++) tones.push(c2[0], c2[1], c2[2]);
    const g = geometry.dynamic({
      positions: ridges.positions.slice(), normals: ridges.normals.slice(), uvs: Float32Array.from(ridges.mesh.uvs),
      indices: Uint32Array.from(ridges.mesh.indices), attributes: { tone: { itemSize: 3, data: Float32Array.from(tones) } }
    });
    add("stage-ridges", g, ridgeSpec(o.ridgeHaze), "static");
  }

  /* far skyline (static, beyond the haze knee) */
  const FAR_TOWERS = 120;
  const farBatch = new Batch(boxMesh(1, 1, 1), FAR_TOWERS, [1, 1, 1]);
  for (let i = 0; i < FAR_TOWERS; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const a = (0.2 + rand() * 1.05) * side;
    const r = 150 + rand() * 60;
    const w = 6 + rand() * 9;
    const h = (14 + Math.pow(rand(), 1.6) * 55) * (0.35 + 0.65 * Math.min(1, Math.abs(a) / 0.7));
    farBatch.place(i, Math.sin(a) * r, FLOOR_Y + h / 2, -Math.cos(a) * r, a, w, h, w * (0.7 + rand() * 0.6));
    farBatch.setTone(i, linear(NEON[i % NEON.length] as string));
  }
  add("stage-far-city", farBatch.geometry(), stageLitSpec({ base: linear("#120a2e"), haze: o.farHaze, windows: true, trim: true }), "static");

  /* mid city: lit-window towers with roof trims, scroll 1:1 */
  const CITY_P = 96;
  const cityPer = 12;
  {
    const s = span(CITY_P);
    const copies = Math.ceil((s.near - s.far) / CITY_P);
    const tpl: { x: number; z: number; w: number; d: number; h: number; tone: Rgb }[] = [];
    for (let k = 0; k < cityPer; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const w = 4 + rand() * 6;
      tpl.push({
        x: side * (30 + rand() * 30 + w / 2), z: -(k / cityPer) * CITY_P - rand() * 4, w, d: 4 + rand() * 6,
        h: 10 + Math.pow(rand(), 1.5) * 32, tone: linear(NEON[(k * 5) % NEON.length] as string)
      });
    }
    const city = new Batch(boxMesh(1, 1, 1), copies * cityPer, [1, 1, 1]);
    let i = 0;
    for (let c = 0; c < copies; c++) {
      for (const t of tpl) {
        city.place(i, t.x, FLOOR_Y + t.h / 2, s.near + t.z - c * CITY_P, 0, t.w, t.h, t.d);
        city.setTone(i, t.tone);
        i++;
      }
    }
    add("stage-city", city.geometry(), stageLitSpec({ base: linear("#1a1040"), haze: o.haze, windows: true, trim: true }), { group: "grp-city" });
    layers.push({ id: "grp-city", period: CITY_P, parallax: 1 });
  }

  /* pylons + crossbeams under the elevated track, every 12 m */
  const PYLON_P = 12;
  {
    const s = span(PYLON_P);
    const copies = Math.ceil((s.near - s.far) / PYLON_P);
    const pylon = mergeMeshes([
      translateMesh(boxMesh(0.9, -FLOOR_Y - 0.6, 0.9), 0, (FLOOR_Y - 0.6) / 2, 0),
      translateMesh(boxMesh(5.2, 0.5, 0.7), 0, -0.85, 0)
    ]);
    const pylons = new Batch(pylon, copies, [1, 1, 1]);
    for (let c = 0; c < copies; c++) {
      pylons.place(c, 0, 0, s.near - c * PYLON_P, 0, 1, 1, 1);
      pylons.setTone(c, linear("#23e6ff"));
    }
    add("stage-pylons", pylons.geometry(), stageLitSpec({ base: linear("#2a1a5a"), haze: o.haze, trim: true }), { group: "grp-pylons" });
    layers.push({ id: "grp-pylons", period: PYLON_P, parallax: 1 });
  }

  /* palms along the floor, every 16 m each side (staggered) */
  const PALM_P = 32;
  {
    const s = span(PALM_P);
    const copies = Math.ceil((s.near - s.far) / PALM_P);
    const per = 4;
    const palm = palmMesh();
    const palms = new Batch(palm, copies * per, [1, 1, 1]);
    let i = 0;
    for (let c = 0; c < copies; c++) {
      for (let k = 0; k < per; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const sc = 8.5 + ((k * 7) % 5) * 0.6;
        const x = side * (11 + (k >> 1) * 4.5);
        palms.place(i, x, FLOOR_Y, s.near - c * PALM_P - k * (PALM_P / per), side > 0 ? Math.PI : 0, sc, sc, sc);
        palms.setTone(i, linear(k % 2 === 0 ? "#ff2fb3" : "#23e6ff"));
        i++;
      }
    }
    add("stage-palms", palms.geometry(), stageLitSpec({ base: linear("#0b2a40"), haze: o.haze, rim: linear("#ff4fc0"), emissive: [0.01, 0.035, 0.05], trim: true }), { group: "grp-palms" });
    layers.push({ id: "grp-palms", period: PALM_P, parallax: 1 });
  }

  /* beat arches every 48 m: dark frame + additive neon frame */
  const ARCH_P = 48;
  {
    const s = span(ARCH_P);
    const copies = Math.ceil((s.near - s.far) / ARCH_P);
    const arches = new Batch(archMesh(), copies, [1, 1, 1]);
    const glows = new Batch(archGlowMesh(), copies, [1, 1, 1]);
    for (let c = 0; c < copies; c++) {
      const z = s.near - 14 - c * ARCH_P;
      arches.place(c, 0, 0, z, 0, 1, 1, 1);
      glows.place(c, 0, 0, z + 0.32, 0, 1, 1, 1);
      arches.setTone(c, linear(c % 2 === 0 ? "#b44dff" : "#23e6ff"));
      glows.setTone(c, linear(c % 2 === 0 ? "#b44dff" : "#23e6ff"));
    }
    add("stage-arches", arches.geometry(), stageLitSpec({ base: linear("#1c1240"), haze: o.haze, trim: true }), { group: "grp-arches" });
    add("stage-arch-glow", glows.geometry(), glowSpec({ beam: false, wobble: 0, gain: [1.3, 1.3, 1.3] }), { group: "grp-arches" });
    layers.push({ id: "grp-arches", period: ARCH_P, parallax: 1 });
  }

  /* floating islands (half-speed parallax) with palms and speaker stacks on top */
  const ISLE_P = 120;
  {
    const s = { near: 60, far: FAR_Z - ISLE_P };
    const copies = Math.ceil((s.near - s.far) / ISLE_P);
    const per = 6;
    const isle = islandMesh(9, 1.7, lcg(0x15e));
    const isles = new Batch(isle, copies * per, [1, 1, 1]);
    const palm = palmMesh();
    const props = new Batch(palm, copies * per, [1, 1, 1]);
    const spk = speakerMesh();
    const speakers = new Batch(spk, copies * per, [1, 1, 1]);
    const tpl = Array.from({ length: per }, (_, k) => {
      const side = k % 2 === 0 ? -1 : 1;
      return { x: side * (24 + rand() * 26), y: -2.5 + rand() * 8, z: -(k / per) * ISLE_P - rand() * 8, r: 4 + rand() * 4, yaw: rand() * 6.28, tone: linear(NEON[(k + 1) % NEON.length] as string) };
    });
    let i = 0, j = 0;
    for (let c = 0; c < copies; c++) {
      for (const t of tpl) {
        const z = s.near + t.z - c * ISLE_P;
        isles.place(i, t.x, t.y, z, t.yaw, t.r, t.r, t.r);
        isles.setTone(i, t.tone);
        for (let q = 0; q < 1; q++) {
          const a = t.yaw + q * 2.4;
          const px = t.x + Math.cos(a) * t.r * 0.45, pz = z + Math.sin(a) * t.r * 0.45;
          props.place(j, px, t.y, pz, a, t.r * 1.2, t.r * 1.2, t.r * 1.2);
          props.setTone(j, linear(q === 0 ? "#ff2fb3" : "#23e6ff"));
          const bx = t.x + Math.cos(a + 1.2) * t.r * 0.5, bz = z + Math.sin(a + 1.2) * t.r * 0.5;
          speakers.place(j, bx, t.y, bz, Math.atan2(-t.x, 8), 1.1, 1.1, 1.1);
          speakers.setTone(j, t.tone);
          j++;
        }
        i++;
      }
    }
    add("stage-isles", isles.geometry(), stageLitSpec({ base: linear("#3a1d66"), haze: o.haze, topGrid: true, trim: true, rim: linear("#ff4fc0") }), { group: "grp-isles" });
    add("stage-isle-palms", props.geometry(), stageLitSpec({ base: linear("#0b2a40"), haze: o.haze, rim: linear("#ff4fc0"), emissive: [0.01, 0.035, 0.05], trim: true }), { group: "grp-isles" });
    add("stage-isle-speakers", speakers.geometry(), stageLitSpec({ base: linear("#140c2c"), haze: o.haze, trim: true }), { group: "grp-isles" });
    layers.push({ id: "grp-isles", period: ISLE_P, parallax: 0.5 });
  }

  /* drifting motes (additive, wobble in the vertex shader) */
  const MOTE_P = 64;
  {
    const s = span(MOTE_P);
    const copies = Math.ceil((s.near - s.far) / MOTE_P);
    const per = 45;
    const motes = new Batch(sphereMesh(0.08, 3, 2), copies * per, [1, 1, 1]);
    const mr = lcg(0x3073);
    const tpl = Array.from({ length: per }, () => ({ x: (mr() - 0.5) * 70, y: FLOOR_Y + 2 + mr() * 18, z: -mr() * MOTE_P, s: 0.6 + mr() * 1.4, c: mr() }));
    let i = 0;
    for (let c = 0; c < copies; c++) {
      for (const t of tpl) {
        const x = Math.abs(t.x) < 3 ? t.x + Math.sign(t.x || 1) * 4 : t.x;
        motes.place(i, x, t.y, s.near + t.z - c * MOTE_P, 0, t.s, t.s, t.s);
        const col = linear(t.c < 0.45 ? "#ff6fd0" : t.c < 0.85 ? "#6ff3ff" : "#ffd166");
        motes.setTone(i, [col[0] * 0.9, col[1] * 0.9 + (i % 7) * 0.001, col[2] * 0.9 + (i % 11) * 0.001]);
        i++;
      }
    }
    add("stage-motes", motes.geometry(), glowSpec({ beam: false, wobble: 0.5, gain: [1, 1, 1] }), { group: "grp-motes" });
    layers.push({ id: "grp-motes", period: MOTE_P, parallax: 1 });
  }

  /* searchlights from the far city */
  const BEAMS = 8;
  const beamTpl = beamMesh(150, 0.6, 7);
  const beams = new Batch(beamTpl, BEAMS, [1, 1, 1]);
  const beamBase = Array.from({ length: BEAMS }, (_, k) => {
    const side = k % 2 === 0 ? -1 : 1;
    return { x: side * (40 + (k >> 1) * 22), z: -150 - (k % 3) * 25, phase: k * 1.7, speed: 0.25 + (k % 3) * 0.08, tone: linear(k % 3 === 0 ? "#23e6ff" : k % 3 === 1 ? "#ff2fb3" : "#b44dff") };
  });
  beamBase.forEach((b, k) => beams.setTone(k, [b.tone[0] * 0.10, b.tone[1] * 0.10, b.tone[2] * 0.10]));
  add("stage-beams", beams.geometry(), glowSpec({ beam: true, wobble: 0, gain: [1, 1, 1] }), "live");

  /* equalizer meters beside the track (heights dance on the beat) */
  const EQ_P = 64;
  const eqPer = 10;
  const eqCopies = Math.ceil((NEAR_Z - (FAR_Z - EQ_P)) / EQ_P);
  const eq = new Batch(boxMesh(1, 1, 1), eqPer * eqCopies, [1, 1, 1]);
  const eqRand = lcg(0xbea7);
  const eqTpl = Array.from({ length: eqPer }, (_, k) => {
    const side = k % 2 === 0 ? -1 : 1;
    return { x: side * (9 + ((k >> 1) % 2) * 3.2 + eqRand() * 0.8), z: -((k >> 1) / (eqPer / 2)) * EQ_P - (side > 0 ? EQ_P / eqPer : 0), base: 2 + eqRand() * 7, phase: eqRand() * Math.PI * 2 };
  });
  add("stage-eq", eq.geometry(), stageLitSpec({ base: linear("#0c0820"), haze: o.haze, meter: true }), "live");

  return {
    bind(node: (id: string) => NodeHandle): StageRuntime {
      /* scrolling layers are static children of runtime groups (the group carries the scroll), so only the equalizer,
       * beams, floor and sky take per-frame uniforms */
      const litIds = ["stage-eq"];
      const glowIds = ["stage-beams"];
      return {
        update(dist, beatPhase, pulse, clock, reduced) {
          for (const l of layers) node(l.id).setPosition(0, 0, (dist * l.parallax) % l.period);
          node("stage-floor").setUniform?.("uScroll", -dist);
          node("stage-floor").setUniform?.("uPulse", pulse);
          for (const id of litIds) {
            const h = node(id);
            h.setUniform?.("uPulse", pulse);
            h.setUniform?.("uClock", clock);
          }
          for (const id of glowIds) {
            const h = node(id);
            h.setUniform?.("uPulse", pulse);
            h.setUniform?.("uClock", clock);
          }
          /* equalizer: periodic slots, each meter's height follows the beat phase */
          const offset = dist % EQ_P;
          let i = 0;
          for (let c = 0; c < eqCopies; c++) {
            for (const t of eqTpl) {
              const dance = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t.phase + beatPhase * Math.PI);
              const top = t.base * (0.45 + 0.55 * dance);
              const h = top - FLOOR_Y;
              const z = NEAR_Z + t.z - c * EQ_P + offset;
              if (z > 3) eq.collapse(i);
              else eq.place(i, t.x, FLOOR_Y + h / 2, z, 0, 1.15, h, 1.15);
              i++;
            }
          }
          eq.flush(node("stage-eq"));
          for (let k = 0; k < BEAMS; k++) {
            const b = beamBase[k]!;
            const yaw = reduced ? b.phase : b.phase + Math.sin(clock * b.speed + b.phase) * 0.9;
            beams.place(k, b.x, FLOOR_Y, b.z, yaw, 1, 1, 1);
          }
          beams.flush(node("stage-beams"));
        }
      };
    },
    programs(): { name: string; spec: Parameters<typeof material.custom>[0] }[] {
      return [
        { name: "stage-floor", spec: floorSpec(o.haze) },
        { name: "stage-ridges", spec: ridgeSpec(o.ridgeHaze) },
        { name: "stage-lit", spec: stageLitSpec({ base: [1, 1, 1], haze: o.haze, windows: true, trim: true }) },
        { name: "stage-glow", spec: glowSpec({ beam: true, wobble: 0.5, gain: [1, 1, 1] }) }
      ];
    }
  };
}
