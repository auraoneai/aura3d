/**
 * Beat Hopper stage scenery (presentation only). Every layer is one merged batch node, laid out once from a
 * presentation-only LCG (never the gameplay stream):
 *   - neon grid floor 7 m below the elevated track, track girder + under-glow, pylons every 12 m
 *   - LED equalizer meters rising from the floor beside the track (heights dance on the sim beat)
 *   - lit-window towers with neon roof trims (mid city, scrolls 1:1) and a static far skyline
 *   - neon palms along the floor, raised chamfered stadium beat arches (`top = 12.6 m` so portrait `390x844` never
 *     slices the lintel across the sunset/HUD!), floating islands with palms and speaker stacks (half-speed parallax),
 *     two glowing ridge rings on the horizon, smooth 18-segment volumetric laser cones and drifting motes.
 * Tight `CORRIDOR_BOUNDS` and `STAGE_BOUNDS` replace `OPEN_BOUNDS` so zero unbounded batches leak into frustum/shadow cascades.
 */
import { geometry, material, type AuraApp } from "@aura3d/engine";
import { Batch, CORRIDOR_BOUNDS, type BatchBounds, type MeshData } from "../../../examples/shared/runner-kit/index";
import { boxMesh, mergeMeshes, sphereMesh, translateMesh } from "./meshes";
import {
  sculptCyberPalmMesh,
  sculptIslandSpeakerStackMesh,
  sculptTrackTrestlePylonMesh,
  sculptTrussBeatArchMesh
} from "./art/proceduralModels";
import { floorSpec, glowSpec, ridgeSpec, stageLitSpec, type Haze } from "./stage-shaders";
import { linear } from "./look";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Rgb = readonly [number, number, number];

export const FLOOR_Y = -7;

const STAGE_BOUNDS: BatchBounds = {
  min: [-360, -24, -420],
  max: [360, 130, 80]
};

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

/** Curved `tubeSweepMesh` synthwave cyber-palm with `loftSectionsMesh` pleated fronds (base at y = 0, ~1 unit tall). */
function palmMesh(): MeshData {
  return sculptCyberPalmMesh();
}

/** Open `latticeTrussMesh` stadium beat arch (`top = 12.6 m`, chamfered upper corners) + underslung spot cans. */
function archMesh(): MeshData {
  return sculptTrussBeatArchMesh(FLOOR_Y);
}

/** Thin neon light-tube frame inside the raised stadium arch (drawn additively). */
function archGlowMesh(): MeshData {
  const shoulderY = 10.2;
  const top = 12.05;
  const legH = shoulderY - 0.2;
  return mergeMeshes([
    translateMesh(boxMesh(0.13, legH, 0.13), -7.4, 0.2 + legH / 2, 0),
    translateMesh(boxMesh(0.13, legH, 0.13), 7.4, 0.2 + legH / 2, 0),
    transformMesh(boxMesh(0.13, 2.65, 0.13), 0, 0, -6.48, 11.12, 0, -Math.PI / 4),
    transformMesh(boxMesh(0.13, 2.65, 0.13), 0, 0, 6.48, 11.12, 0, Math.PI / 4),
    translateMesh(boxMesh(11.3, 0.13, 0.13), 0, top, 0)
  ]);
}

/** Horn-loaded dual speaker stack on floating islands (`latheMesh` woofer + lofted waveguide head). */
function speakerMesh(): MeshData {
  return sculptIslandSpeakerStackMesh();
}

/** Smooth 18-segment open volumetric cone frustum along +Y, pre-tilted forward for silky Fresnel laser beams. */
function beamMesh(length: number, r0: number, r1: number, radial = 18): MeshData {
  const m = empty();
  const slope = (r0 - r1) / Math.max(length, 1e-4);
  const inv = 1 / Math.hypot(1, slope);
  for (let iy = 0; iy <= 1; iy++) {
    const r = iy === 0 ? r0 : r1;
    const y = iy === 0 ? 0 : length;
    for (let k = 0; k <= radial; k++) {
      const u = k / radial;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      m.positions.push(ca * r, y, sa * r);
      m.normals.push(ca * inv, slope * inv, sa * inv);
      m.uvs.push(u, iy);
    }
  }
  const row = radial + 1;
  for (let k = 0; k < radial; k++) {
    const a = k, b = k + 1, c = row + k, d = row + k + 1;
    m.indices.push(a, b, d, a, d, c);
  }
  return transformMesh(m, -0.40, 0);
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
    uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices),
    bounds: STAGE_BOUNDS
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
  const ridges = new Batch(mergeMeshes([back, front]), 1, null, STAGE_BOUNDS);
  ridges.place(0, 0, 0, 0, 0, 1, 1, 1);
  {
    const tones: number[] = [];
    const v1 = back.positions.length / 3, v2 = front.positions.length / 3;
    const c1 = linear("#b44dff"), c2 = linear("#ff2fb3");
    for (let i = 0; i < v1; i++) tones.push(c1[0] * 0.8, c1[1] * 0.8, c1[2] * 0.8);
    for (let i = 0; i < v2; i++) tones.push(c2[0], c2[1], c2[2]);
    const g = geometry.dynamic({
      positions: ridges.positions.slice(), normals: ridges.normals.slice(), uvs: Float32Array.from(ridges.mesh.uvs),
      indices: Uint32Array.from(ridges.mesh.indices), attributes: { tone: { itemSize: 3, data: Float32Array.from(tones) } },
      bounds: STAGE_BOUNDS
    });
    add("stage-ridges", g, ridgeSpec(o.ridgeHaze), "static");
  }

  /* far skyline (static, beyond the haze knee) */
  const FAR_TOWERS = 120;
  const farBatch = new Batch(boxMesh(1, 1, 1), FAR_TOWERS, [1, 1, 1], STAGE_BOUNDS);
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
    const city = new Batch(boxMesh(1, 1, 1), copies * cityPer, [1, 1, 1], STAGE_BOUNDS);
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

  /* V-braced architectural trestle pylons + saddle girders under the elevated track, every 12 m */
  const PYLON_P = 12;
  {
    const s = span(PYLON_P);
    const copies = Math.ceil((s.near - s.far) / PYLON_P);
    const pylon = sculptTrackTrestlePylonMesh(FLOOR_Y);
    const pylons = new Batch(pylon, copies, [1, 1, 1], CORRIDOR_BOUNDS);
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
    const palms = new Batch(palm, copies * per, [1, 1, 1], CORRIDOR_BOUNDS);
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

  /* raised stadium beat arches every 48 m: dark chamfered frame + additive neon tube frame */
  const ARCH_P = 48;
  {
    const s = span(ARCH_P);
    const copies = Math.ceil((s.near - s.far) / ARCH_P);
    const arches = new Batch(archMesh(), copies, [1, 1, 1], CORRIDOR_BOUNDS);
    const glows = new Batch(archGlowMesh(), copies, [1, 1, 1], CORRIDOR_BOUNDS);
    for (let c = 0; c < copies; c++) {
      const z = s.near - 14 - c * ARCH_P;
      arches.place(c, 0, 0, z, 0, 1, 1, 1);
      glows.place(c, 0, 0, z + 0.32, 0, 1, 1, 1);
      arches.setTone(c, linear(c % 2 === 0 ? "#b44dff" : "#23e6ff"));
      glows.setTone(c, linear(c % 2 === 0 ? "#b44dff" : "#23e6ff"));
    }
    add("stage-arches", arches.geometry(), stageLitSpec({ base: linear("#1c1240"), haze: o.haze, trim: true }), { group: "grp-arches" });
    add("stage-arch-glow", glows.geometry(), glowSpec({ beam: false, wobble: 0, gain: [1.35, 1.35, 1.35] }), { group: "grp-arches" });
    layers.push({ id: "grp-arches", period: ARCH_P, parallax: 1 });
  }

  /* floating islands (half-speed parallax) with palms and speaker stacks on top */
  const ISLE_P = 120;
  {
    const s = { near: 60, far: FAR_Z - ISLE_P };
    const copies = Math.ceil((s.near - s.far) / ISLE_P);
    const per = 6;
    const isle = islandMesh(9, 1.7, lcg(0x15e));
    const isles = new Batch(isle, copies * per, [1, 1, 1], STAGE_BOUNDS);
    const palm = palmMesh();
    const props = new Batch(palm, copies * per, [1, 1, 1], STAGE_BOUNDS);
    const spk = speakerMesh();
    const speakers = new Batch(spk, copies * per, [1, 1, 1], STAGE_BOUNDS);
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
    const motes = new Batch(sphereMesh(0.08, 3, 2), copies * per, [1, 1, 1], CORRIDOR_BOUNDS);
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
    add("stage-motes", motes.geometry(), glowSpec({ beam: false, wobble: 0.5, gain: [1.1, 1.1, 1.1] }), { group: "grp-motes" });
    layers.push({ id: "grp-motes", period: MOTE_P, parallax: 1 });
  }

  /* smooth 18-segment volumetric laser searchlights from the far city (static banks rotated via runtime group handles) */
  const BEAMS_PER_SIDE = 4;
  const BEAM_PIVOT_X = 62;
  const BEAM_PIVOT_Z = -175;
  const beamTpl = beamMesh(155, 0.55, 7.6, 18);
  const beamsL = new Batch(beamTpl, BEAMS_PER_SIDE, [1, 1, 1], STAGE_BOUNDS);
  const beamsR = new Batch(beamTpl, BEAMS_PER_SIDE, [1, 1, 1], STAGE_BOUNDS);
  for (let sIdx = 0; sIdx < BEAMS_PER_SIDE; sIdx++) {
    const kL = sIdx * 2;
    const kR = sIdx * 2 + 1;
    const xL = -(40 + sIdx * 22) - (-BEAM_PIVOT_X);
    const zL = -150 - (kL % 3) * 25 - BEAM_PIVOT_Z;
    const tL = linear(kL % 3 === 0 ? "#23e6ff" : kL % 3 === 1 ? "#ff2fb3" : "#b44dff");
    beamsL.place(sIdx, xL, 0, zL, -0.22 + sIdx * 0.16, 1, 1, 1);
    beamsL.setTone(sIdx, [tL[0] * 0.16, tL[1] * 0.16, tL[2] * 0.16]);

    const xR = (40 + sIdx * 22) - BEAM_PIVOT_X;
    const zR = -150 - (kR % 3) * 25 - BEAM_PIVOT_Z;
    const tR = linear(kR % 3 === 0 ? "#23e6ff" : kR % 3 === 1 ? "#ff2fb3" : "#b44dff");
    beamsR.place(sIdx, xR, 0, zR, 0.22 - sIdx * 0.16, 1, 1, 1);
    beamsR.setTone(sIdx, [tR[0] * 0.16, tR[1] * 0.16, tR[2] * 0.16]);
  }
  add("stage-beams-l", beamsL.geometry(), glowSpec({ beam: true, wobble: 0, gain: [1.15, 1.15, 1.15] }), { group: "grp-beams-l" });
  add("stage-beams-r", beamsR.geometry(), glowSpec({ beam: true, wobble: 0, gain: [1.15, 1.15, 1.15] }), { group: "grp-beams-r" });

  return {
    bind(node: (id: string) => NodeHandle): StageRuntime {
      return {
        update(dist, _beatPhase, pulse, clock, reduced) {
          for (const l of layers) node(l.id).setPosition(0, 0, (dist * l.parallax) % l.period);
          node("stage-floor").setUniform?.("uScroll", -dist);
          node("stage-floor").setUniform?.("uPulse", pulse);
          const yawL = reduced ? 0 : Math.sin(clock * 0.29) * 0.42;
          const yawR = reduced ? 0 : -Math.sin(clock * 0.33 + 1.1) * 0.42;
          node("grp-beams-l")
            .setPosition(-BEAM_PIVOT_X, FLOOR_Y, BEAM_PIVOT_Z)
            .setRotation(0, yawL, 0);
          node("grp-beams-r")
            .setPosition(BEAM_PIVOT_X, FLOOR_Y, BEAM_PIVOT_Z)
            .setRotation(0, yawR, 0);
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
