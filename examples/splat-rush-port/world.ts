/**
 * Splat Rush world on the public `@aura3d/engine` surface only: toon-shaded `material.custom` surfaces,
 * `geometry.dynamic` meshes (exact three.js dimensions, see `meshes.ts`), `texture.canvas` textures painted from
 * the values the simulation drew, and per-frame runtime-node updates read straight from `SplatRushSim`.
 *
 * Draw calls and uploads (C9, C10): every pooled entity kind is one merged `geometry.dynamic` batch (deck, rails, lane
 * marks, gates, gate symbols, splatters, particles, clouds, streaks) instead of one node per entity. Road entities
 * (segments, gates, splatters) live in a scrolling frame: a road entity's z minus `sim.scroll` never changes, so its
 * vertices are written once when it appears and the batch node is moved by the scroll each frame. Clouds do the same
 * with `sim.cloudDrift`. Only particles and streaks are rewritten per frame, and only the dirty vertex range uploads.
 */
import { camera, geometry, material, scene, texture, type AuraApp } from "@aura3d/engine";
import { blobMesh, capsuleMesh, cylinderMesh, mergeMeshes, sphereMesh, transformMesh, type MeshData } from "./meshes";
import { SYMBOL_FOR_COLOR, symbolMesh, type SymbolKind } from "./symbols";
import { COLORS, CONFIG, POOL, curve, type Gate, type Segment, type SplatRushSim, type Splatter } from "./sim";
import type { Shown } from "./presentation";
import { addBackdrop, updateBackdrop } from "./backdrop";
import { addPickups, hidePickups, pickupNodeIds, updatePickups } from "./pickups";
import { FLAT_FRAGMENT, FLAT_TONE_FRAGMENT, FLAT_TONE_VERTEX, FLAT_VERTEX, SHADOW_FRAGMENT, SHADOW_VERTEX, SKY_FRAGMENT, SKY_VERTEX, TOON_TONE_VERTEX, TOON_VERTEX, toonFragment } from "./shaders";

type Rgb = readonly [number, number, number];
type Scene = ReturnType<typeof scene>;
type TextureHandle = ReturnType<typeof texture.canvas>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

export const hexLinear = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};

const hslToLinear = (h: number, s: number, l: number): Rgb => {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number): number => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(f(0)), lin(f(8)), lin(f(4))];
};

type CustomSpec = Parameters<typeof material.custom>[0];

export const toonSpec = (base: Rgb, map?: TextureHandle, emissive: Rgb = [0, 0, 0], tone = false): CustomSpec => ({
  glsl: { vertex: tone ? TOON_TONE_VERTEX : TOON_VERTEX, fragment: toonFragment(map !== undefined, tone) },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    emissive: { type: "color3", value: [...emissive] },
    alpha: { type: "f32", value: 1 },
    ...(map ? { map: { type: "texture2d" as const, value: map } } : {})
  },
  side: "double"
});

export const flatSpec = (base: Rgb, alpha: number, tone = false): CustomSpec => ({
  glsl: tone ? { vertex: FLAT_TONE_VERTEX, fragment: FLAT_TONE_FRAGMENT } : { vertex: FLAT_VERTEX, fragment: FLAT_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...base] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const shadowSpec = (): CustomSpec => ({
  glsl: { vertex: SHADOW_VERTEX, fragment: SHADOW_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [0.02, 0.02, 0.05] }, alpha: { type: "f32", value: 0.3 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const skySpec = (): CustomSpec => ({ glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT }, side: "double", depthWrite: false });

/** One of each distinct program, so a unit test can compile exactly what the app draws with. */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "toon", spec: toonSpec([0.5, 0.5, 0.5]) },
  { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
  { name: "flat-tone", spec: flatSpec([1, 1, 1], 1, true) },
  { name: "toon-map", spec: toonSpec([0.5, 0.5, 0.5], texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }) as unknown as TextureHandle) },
  { name: "sky", spec: skySpec() },
  { name: "flat", spec: flatSpec([1, 1, 1], 0.4) },
  { name: "shadow", spec: shadowSpec() }
];

/* ---------------------------------------------------------------- canvases (painted from the sim's own draws) */

export function paintBallCanvas(sim: SplatRushSim): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#f0433a";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(255,255,255,0.15)";
  for (const [x, y, rx, ry, rot] of sim.paint.ball as [number, number, number, number, number][]) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, 2 * Math.PI);
    g.fill();
  }
  return c;
}

export function paintRampCanvas(sim: SplatRushSim): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#fdf0e0";
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(0,0,0,0.025)";
  for (const [x, y] of sim.paint.speckles as [number, number][]) g.fillRect(x, y, 1.5, 1.5);
  const colors = ["rgba(240,67,58,0.55)", "rgba(249,198,71,0.50)", "rgba(94,202,240,0.50)", "rgba(184,104,232,0.45)"];
  for (const b of sim.paint.blobs) {
    g.fillStyle = colors[b.colorIndex] as string;
    g.beginPath();
    g.moveTo(b.x + b.r, b.y);
    for (let i = 0; i < 6; i++) {
      const s3 = (i / 6) * Math.PI * 2, r3 = ((i + 1) / 6) * Math.PI * 2;
      const [l3, p2] = b.lobes[i] as [number, number];
      g.bezierCurveTo(b.x + Math.cos(s3) * l3 * 1.2, b.y + Math.sin(s3) * l3 * 1.2, b.x + Math.cos(r3) * p2 * 1.2, b.y + Math.sin(r3) * p2 * 1.2, b.x + Math.cos(r3) * p2, b.y + Math.sin(r3) * p2);
    }
    g.closePath();
    g.fill();
  }
  return c;
}

/* ---------------------------------------------------------------- dynamic mesh batches */

function dynamicFrom(m: MeshData) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
}

/** Batches are moved by node transforms and their vertices span the whole run, so their culling bounds are unbounded. */
const OPEN_BOUNDS = { min: [-1e5, -1e4, -1e7] as [number, number, number], max: [1e5, 1e4, 1e7] as [number, number, number] };

/**
 * `max` copies of one template mesh in one `geometry.dynamic` node. `place` writes one instance (optionally from another
 * template with the same vertex count and indices), `collapse` folds it to a point, and `flush` uploads only the vertex
 * range written since the last flush.
 */
export class Batch {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tones: Float32Array | null;
  readonly vertsPer: number;
  readonly mesh: MeshData;
  /** Instances written since the last flush (positions/normals) and instances whose tone changed. */
  private readonly dirty: Uint8Array;
  private readonly toneDirty: Uint8Array;
  private anyDirty = false;
  private anyToneDirty = false;
  /** Vertex uploads issued by `flush` so far (for tests and the C10 budget). */
  uploadedVertices = 0;
  constructor(private readonly template: MeshData, readonly max: number, tone: Rgb | readonly number[] | null = null) {
    this.vertsPer = template.positions.length / 3;
    this.dirty = new Uint8Array(max);
    this.toneDirty = new Uint8Array(max);
    const merged = mergeMeshes(Array.from({ length: max }, () => template));
    this.mesh = merged;
    this.positions = new Float32Array(merged.positions.length);
    this.normals = Float32Array.from(merged.normals);
    if (tone) {
      this.tones = new Float32Array(merged.positions.length);
      const perVertex = tone.length === this.vertsPer * 3;
      for (let i = 0; i < max; i++) {
        for (let v = 0; v < this.vertsPer; v++) {
          const k = (i * this.vertsPer + v) * 3;
          this.tones[k] = perVertex ? (tone[v * 3] as number) : (tone[0] as number);
          this.tones[k + 1] = perVertex ? (tone[v * 3 + 1] as number) : (tone[1] as number);
          this.tones[k + 2] = perVertex ? (tone[v * 3 + 2] as number) : (tone[2] as number);
        }
      }
    } else this.tones = null;
  }

  private mark(i: number): void {
    this.dirty[i] = 1;
    this.anyDirty = true;
  }

  /** Each run of consecutive flagged instances, as [first, count]; clears the flags. */
  private static runs(flags: Uint8Array): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i]) continue;
      let j = i;
      while (j + 1 < flags.length && flags[j + 1]) j++;
      out.push([i, j - i + 1]);
      flags.fill(0, i, j + 1);
      i = j;
    }
    return out;
  }

  /** Place instance `i` at (x, y, z) with yaw about Y and per-axis scale. */
  place(i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, from: MeshData = this.template): void {
    const t = from, c = Math.cos(yaw), s = Math.sin(yaw), base = i * this.vertsPer * 3;
    for (let v = 0; v < this.vertsPer; v++) {
      const k = v * 3;
      const lx = (t.positions[k] as number) * sx, ly = (t.positions[k + 1] as number) * sy, lz = (t.positions[k + 2] as number) * sz;
      this.positions[base + k] = x + lx * c + lz * s;
      this.positions[base + k + 1] = y + ly;
      this.positions[base + k + 2] = z - lx * s + lz * c;
      const nx = (t.normals[k] as number) / sx, ny = (t.normals[k + 1] as number) / sy, nz = (t.normals[k + 2] as number) / sz;
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      this.normals[base + k] = (nx * c + nz * s) * inv;
      this.normals[base + k + 1] = ny * inv;
      this.normals[base + k + 2] = (-nx * s + nz * c) * inv;
    }
    this.mark(i);
  }

  /** Fold instance `i` to a point (nothing draws). */
  collapse(i: number): void {
    this.positions.fill(0, i * this.vertsPer * 3, (i + 1) * this.vertsPer * 3);
    this.mark(i);
  }

  setTone(i: number, rgb: Rgb): void {
    if (!this.tones) return;
    for (let v = 0; v < this.vertsPer; v++) {
      const k = (i * this.vertsPer + v) * 3;
      this.tones[k] = rgb[0]; this.tones[k + 1] = rgb[1]; this.tones[k + 2] = rgb[2];
    }
    this.toneDirty[i] = 1;
    this.anyToneDirty = true;
  }

  geometry() {
    return geometry.dynamic({
      positions: this.positions.slice(), normals: this.normals.slice(), uvs: f32(this.mesh.uvs), indices: Uint32Array.from(this.mesh.indices), bounds: OPEN_BOUNDS,
      ...(this.tones ? { attributes: { tone: { itemSize: 3, data: this.tones.slice() } } } : {})
    });
  }

  /** Upload each run of instances written since the last flush. `normals: false` for unlit batches. */
  flush(h: NodeHandle, normals = true): void {
    const span = this.vertsPer * 3;
    if (this.anyDirty) {
      for (const [first, count] of Batch.runs(this.dirty)) {
        const from = first * span, to = (first + count) * span, offset = first * this.vertsPer;
        h.updateAttribute?.("position", { array: this.positions.subarray(from, to), offset });
        if (normals) h.updateAttribute?.("normal", { array: this.normals.subarray(from, to), offset });
        this.uploadedVertices += count * this.vertsPer;
      }
      this.anyDirty = false;
    }
    if (this.tones && this.anyToneDirty) {
      for (const [first, count] of Batch.runs(this.toneDirty)) {
        h.updateAttribute?.("tone", { array: this.tones.subarray(first * span, (first + count) * span), offset: first * this.vertsPer });
      }
      this.anyToneDirty = false;
    }
  }
}

/** Stable pool slots for objects that come and go (segments, gates, splatters): an object keeps its slot for its life. */
export class Slots<T extends object> {
  private readonly slot = new Map<T, number>();
  private readonly seen = new Set<T>();
  private readonly free: number[];
  constructor(readonly size: number) {
    this.free = Array.from({ length: size }, (_, i) => size - 1 - i);
  }
  /** The object's slot and whether it was just assigned (`-1` when the pool is full). Marks it alive this frame. */
  use(item: T): { slot: number; fresh: boolean } {
    this.seen.add(item);
    const known = this.slot.get(item);
    if (known !== undefined) return { slot: known, fresh: false };
    const next = this.free.pop();
    if (next === undefined) return { slot: -1, fresh: false };
    this.slot.set(item, next);
    return { slot: next, fresh: true };
  }
  /** Release every object not used since the last sweep; `gone` gets each freed slot. */
  sweep(gone: (slot: number) => void): void {
    for (const [item, s] of this.slot) {
      if (this.seen.has(item)) continue;
      this.slot.delete(item);
      this.free.push(s);
      gone(s);
    }
    this.seen.clear();
  }
}

const boxMesh = (w: number, h: number, d: number): MeshData => {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const faces: [number, number, number, number[][]][] = [
    [1, 0, 0, [[w / 2, -h / 2, d / 2], [w / 2, -h / 2, -d / 2], [w / 2, h / 2, -d / 2], [w / 2, h / 2, d / 2]]],
    [-1, 0, 0, [[-w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, d / 2], [-w / 2, h / 2, d / 2], [-w / 2, h / 2, -d / 2]]],
    [0, 1, 0, [[-w / 2, h / 2, d / 2], [w / 2, h / 2, d / 2], [w / 2, h / 2, -d / 2], [-w / 2, h / 2, -d / 2]]],
    [0, -1, 0, [[-w / 2, -h / 2, -d / 2], [w / 2, -h / 2, -d / 2], [w / 2, -h / 2, d / 2], [-w / 2, -h / 2, d / 2]]],
    [0, 0, 1, [[-w / 2, -h / 2, d / 2], [w / 2, -h / 2, d / 2], [w / 2, h / 2, d / 2], [-w / 2, h / 2, d / 2]]],
    [0, 0, -1, [[w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, -d / 2], [-w / 2, h / 2, -d / 2], [w / 2, h / 2, -d / 2]]]
  ];
  for (const [nx, ny, nz, quad] of faces) {
    const base = m.positions.length / 3;
    quad.forEach((p, i) => {
      m.positions.push(p[0] as number, p[1] as number, p[2] as number);
      m.normals.push(nx, ny, nz);
      m.uvs.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
    });
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
};

/* ---------------------------------------------------------------- build */

export interface WorldOptions {
  readonly sim: SplatRushSim;
  readonly aspect: number;
}

export interface World {
  readonly scene: Scene;
  readonly textures: { readonly ball: TextureHandle; readonly ramp: TextureHandle };
  bind(app: AuraApp): WorldRuntime;
}

/** How to present one frame (all optional; the default draws the latest step exactly). */
export interface WorldView {
  /** Interpolated ball, camera and clock between the last two steps, and how far to step the road back. */
  readonly shown?: Shown;
  /** Camera override (the reduced-motion camera without shake). */
  readonly camera?: Shown["camera"];
  /** C8: no FOV punch. */
  readonly reducedMotion?: boolean;
  /** C7: colour symbols on the gates and above the ball. */
  readonly symbols?: boolean;
  /** C18: ring under the matching gate of the next row (first run only). */
  readonly guide?: boolean;
}

export interface WorldRuntime {
  update(sim: SplatRushSim, aspect: number, view?: WorldView): void;
  readonly nodeCount: number;
  /** Vertices uploaded by the batches so far (C10 budget checks). */
  readonly uploadedVertices: number;
  /** C14: show every pooled program (pickups, halos, shield, guide, symbols) at a parked spot so `warmPrograms` compiles
   * them before play; `false` hides them again (the next `update` places what is live). */
  warm(on: boolean): void;
}

const MAX_SEG = POOL.segments;
const GATE_MAX = POOL.gates;
const DASH_MAX = 60;
const CLOUDS = 56;
const STREAKS = 50;
/** Gate symbols float this high above the gate's base, over the bar (the bar top is at about 1.74). */
export const GATE_SYMBOL_Y = 2.3;
/** Ids of the merged batch nodes. */
export const BATCH_IDS = ["deck", "rails", "dashes", "gates", "gate-symbols", "splats", "particles", "clouds", "streaks"] as const;

const roadYaw = (r: number): number => Math.atan(0.04 * Math.cos(0.04 * r) * CONFIG.CURVE_AMPLITUDE);

export function buildWorld(options: WorldOptions): World {
  const { sim } = options;
  const ballTex = texture.canvas({ canvas: paintBallCanvas(sim), colorSpace: "linear" });
  const rampTex = texture.canvas({ canvas: paintRampCanvas(sim), colorSpace: "linear" });
  const builder: Scene = scene()
    .background("#bfdcee")
    .camera(camera.perspective({ position: [0, 15, 18], target: [0, 0, 0], fov: 55, near: 0.1, far: 500 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  /* sky backdrop (radius 120, centred on the origin like the original) */
  add("sky", sphereMesh(120, 32, 32), skySpec());
  addBackdrop(builder);

  /* player ball: sphere r 0.55, painted map x player colour */
  add("ball", sphereMesh(CONFIG.BALL_RADIUS, 32, 32), toonSpec(hexLinear(COLORS[0] as string), ballTex));

  /* soft contact shadow under the ball */
  add("ball-shadow", boxMesh(2, 0.002, 2), shadowSpec());

  /* road batches, in the scrolling frame */
  const deck = new Batch(boxMesh(8, 0.3, 1), MAX_SEG);
  const rails = new Batch(sphereMesh(1, 8, 6), MAX_SEG * 2);
  const dashes = new Batch(boxMesh(0.15, 0.02, 1.2), DASH_MAX);
  addBatch("deck", deck, toonSpec([1, 1, 1], rampTex));
  addBatch("rails", rails, toonSpec(hexLinear("#c3b1f0")));
  addBatch("dashes", dashes, toonSpec([1, 1, 1]));

  /* gates: two posts + bar, merged, scaled 0.32 like the original group; colour per gate in `tone` */
  const post = capsuleMesh(0.46, 4, 16, 6);
  const bar = capsuleMesh(0.52, 6.24, 16, 6);
  const gateMesh = transformMesh(
    mergeMeshes([transformMesh(post, { tx: -2.66, ty: 2 + 0.46 }), transformMesh(post, { tx: 2.2 + 0.46, ty: 2 + 0.46 }), transformMesh(bar, { rz: Math.PI / 2, ty: 4.92 })]),
    { scale: 0.32 }
  );
  const gates = new Batch(gateMesh, GATE_MAX, hexLinear(COLORS[0] as string));
  addBatch("gates", gates, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  /* C7 colour symbols: one per gate (same slots as the gates) plus one over the ball */
  const symbolMeshes = Object.fromEntries((["circle", "triangle", "square", "cross"] as const).map((k) => [k, symbolMesh(k)])) as Record<SymbolKind, ReturnType<typeof symbolMesh>>;
  const gateSymbols = new Batch(symbolMeshes.circle, GATE_MAX, symbolMeshes.circle.tones);
  addBatch("gate-symbols", gateSymbols, flatSpec([1, 1, 1], 1, true));
  const ballSymbol = new Batch(symbolMeshes.circle, 1, symbolMeshes.circle.tones);
  addBatch("ball-symbol", ballSymbol, flatSpec([1, 1, 1], 1, true));

  /* C18 first-run guide ring under the matching gate */
  add("guide", cylinderMesh(1, 1, 0.02, 32), flatSpec([1, 1, 1], 0.5));

  /* power-ups: Meshy toy models, one pool per type (pickups.ts) */
  addPickups(builder);

  /* splatters: flat blob + two small discs, in the scrolling frame */
  const splatMesh = mergeMeshes([
    transformMesh(blobMesh(1.5, 0.02), {}),
    transformMesh(cylinderMesh(0.15, 0.15, 0.05, 16), { tx: 1.5, ty: 0.02, tz: 1.2 }),
    transformMesh(cylinderMesh(0.15, 0.15, 0.05, 16), { tx: -1.2, ty: 0.02, tz: -1.5 })
  ]);
  const splats = new Batch(splatMesh, POOL.splatters, hexLinear(COLORS[0] as string));
  addBatch("splats", splats, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  /* particles (world space, rewritten while any is alive), clouds (drift frame), streaks (rewritten per frame), shield */
  const particles = new Batch(sphereMesh(0.13, 6, 6), POOL.particles, [1, 1, 1]);
  addBatch("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  const puff = mergeMeshes([
    sphereMesh(2.5, 14, 10),
    sphereMesh(1.8, 14, 10, -2, -0.5, 0),
    sphereMesh(1.5, 14, 10, 2, -0.8, 0.5),
    sphereMesh(1.2, 14, 10, 1, -1, -1)
  ]);
  const clouds = new Batch(puff, CLOUDS, [1, 1, 1]);
  const lowCloud = hexLinear("#eaf4ff");
  for (let i = 30; i < CLOUDS; i++) clouds.setTone(i, lowCloud);
  addBatch("clouds", clouds, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  const streaks = new Batch(boxMesh(0.08, 0.08, 4), STREAKS);
  addBatch("streaks", streaks, flatSpec([1, 1, 1], 0.4));
  add("shield", sphereMesh(1, 24, 16), flatSpec(hexLinear("#8fe3ff"), 0.28));

  return {
    scene: builder,
    textures: { ball: ballTex, ramp: rampTex },
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("splat-rush-port: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;
      hidePickups(node);
      node("shield").setVisible(false);
      node("guide").setVisible(false);
      node("ball-symbol").setVisible(false);
      node("gate-symbols").setVisible(false);

      const segSlots = new Slots<Segment>(MAX_SEG);
      const dashSlots = new Slots<Segment>(DASH_MAX);
      const gateSlots = new Slots<Gate>(GATE_MAX);
      const splatSlots = new Slots<Splatter>(POOL.splatters);
      const gateColor: number[] = Array.from({ length: GATE_MAX }, () => -1);
      const splatColor: number[] = Array.from({ length: POOL.splatters }, () => -1);
      const splatScale: number[] = Array.from({ length: POOL.splatters }, () => -1);
      const particleColor: string[] = Array.from({ length: POOL.particles }, () => "");
      const particleShown: boolean[] = Array.from({ length: POOL.particles }, () => false);
      const cloudLocal: number[] = Array.from({ length: CLOUDS }, () => Number.NaN);
      let ballColorKey = "";
      let ballSymbolKind: SymbolKind | "" = "";
      let symbolsOn = false;

      const rainbow = (elapsed: number): Rgb => hslToLinear((0.6 * elapsed) % 1, 0.9, 0.62);

      function update(simNow: SplatRushSim, aspect: number, view: WorldView = {}): void {
        const o = simNow.o;
        const shown = view.shown;
        const back = shown?.back ?? 0;
        const elapsed = shown?.elapsed ?? simNow.elapsed;
        const p = shown ? { ...shown.player, visible: simNow.player.visible } : simNow.player;
        /* ball */
        const ball = node("ball");
        ball.setPosition(p.x, p.y, p.z).setRotation(p.rotX, 0, 0).setScale(p.scale).setVisible(p.visible);
        const key = o.isRainbowActive ? "rainbow" : `c${o.playerColorIndex}`;
        const rgb = o.isRainbowActive ? rainbow(elapsed) : hexLinear(COLORS[o.playerColorIndex] as string);
        if (o.isRainbowActive || key !== ballColorKey) {
          ball.setUniform?.("baseColor", [...rgb]);
          ball.setUniform?.("emissive", o.isRainbowActive ? [0.3 * rgb[0], 0.3 * rgb[1], 0.3 * rgb[2]] : [0, 0, 0]);
          ballColorKey = key;
        }
        const lift = Math.max(0, p.y - CONFIG.BALL_RADIUS * p.scale);
        const shadow = node("ball-shadow");
        shadow.setVisible(p.visible).setPosition(p.x - 0.5 * p.y, 0.05, p.z - 0.5 * p.y).setScale(p.scale * 0.66 / (1 + 0.12 * lift));
        shadow.setUniform?.("alpha", 0.3 / (1 + 0.25 * lift));
        /* shield bubble */
        const shield = node("shield");
        shield.setVisible(o.shieldActive && p.visible);
        if (o.shieldActive) {
          shield.setPosition(p.x, p.y, p.z);
          shield.setScale(CONFIG.BALL_RADIUS * o.ballScale * 1.7 * (1 + 0.06 * Math.sin(8 * elapsed)));
        }

        /* road: segments, lane marks (every fourth segment), written once per segment in the scrolling frame */
        const scroll = simNow.scroll;
        for (const s of simNow.segments) {
          const { slot, fresh } = segSlots.use(s);
          if (fresh) {
            const r = s.z - scroll, x = curve(-o.distance + s.z), yaw = roadYaw(-o.distance + s.z);
            deck.place(slot, x, -0.15, r, yaw, 1, 1, 1);
            const cx = 4.3 * Math.cos(yaw), cz = 4.3 * Math.sin(yaw);
            rails.place(slot * 2, x - cx, 0.3, r + cz, yaw, 0.32, 0.32, 0.235);
            rails.place(slot * 2 + 1, x + cx, 0.3, r - cz, yaw, 0.32, 0.32, 0.235);
          }
          if (s.index % 4 === 0) {
            const d = dashSlots.use(s);
            if (d.fresh) dashes.place(d.slot, curve(-o.distance + s.z), 0.01, s.z - scroll, roadYaw(-o.distance + s.z), 1, 1, 1);
          }
        }
        segSlots.sweep((slot) => { deck.collapse(slot); rails.collapse(slot * 2); rails.collapse(slot * 2 + 1); });
        dashSlots.sweep((slot) => dashes.collapse(slot));

        /* gates and their symbols */
        const wantSymbols = view.symbols === true;
        for (const g of simNow.gates) {
          const { slot, fresh } = gateSlots.use(g);
          if (slot < 0) continue;
          const r = g.z - scroll, x = g.laneX + curve(-o.distance + g.z);
          if (fresh) gates.place(slot, x, 0, r, 0, 1, 1, 1);
          if (fresh || gateColor[slot] !== g.colorIndex || (wantSymbols && !symbolsOn)) {
            if (gateColor[slot] !== g.colorIndex) gates.setTone(slot, hexLinear(COLORS[g.colorIndex] as string));
            gateColor[slot] = g.colorIndex;
            gateSymbols.place(slot, x, GATE_SYMBOL_Y, r, 0, 1, 1, 1, symbolMeshes[SYMBOL_FOR_COLOR[g.colorIndex] ?? "circle"]);
          }
        }
        gateSlots.sweep((slot) => { gates.collapse(slot); gateSymbols.collapse(slot); gateColor[slot] = -1; });
        symbolsOn = wantSymbols;
        node("gate-symbols").setVisible(wantSymbols);
        const showBallSymbol = wantSymbols && p.visible && !o.isRainbowActive && o.phase === "playing";
        node("ball-symbol").setVisible(showBallSymbol);
        if (showBallSymbol) {
          const kind = SYMBOL_FOR_COLOR[o.playerColorIndex] ?? "circle";
          if (kind !== ballSymbolKind) { ballSymbol.place(0, 0, 0, 0, 0, 0.8, 0.8, 1, symbolMeshes[kind]); ballSymbolKind = kind; }
          node("ball-symbol").setPosition(p.x, p.y + CONFIG.BALL_RADIUS * p.scale + 0.75, p.z);
        }

        /* C18 guide: the matching gate of the nearest row still ahead */
        let guideGate: Gate | null = null;
        if (view.guide && o.phase === "playing" && !o.isRainbowActive) {
          for (const g of simNow.gates) {
            if (g.passed || g.z > -0.5 || g.colorIndex !== o.playerColorIndex) continue;
            if (!guideGate || g.z > guideGate.z) guideGate = g;
          }
        }
        const guide = node("guide");
        guide.setVisible(guideGate !== null);
        if (guideGate) {
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
          guide.setPosition(guideGate.laneX + curve(-o.distance + guideGate.z), 0.07, guideGate.z - back).setScale([1.05 + 0.15 * pulse, 1, 1.05 + 0.15 * pulse]);
          guide.setUniform?.("baseColor", [...hexLinear(COLORS[guideGate.colorIndex] as string)]);
          guide.setUniform?.("alpha", 0.35 + 0.3 * pulse);
        }

        updatePickups(node, simNow.powerups, elapsed, back);

        /* splatters: written when they appear and while they grow */
        for (const sp of simNow.splatters) {
          const { slot } = splatSlots.use(sp);
          if (slot < 0) continue;
          if (splatScale[slot] !== sp.scale) {
            splats.place(slot, sp.laneX + curve(-o.distance + sp.z), sp.y, sp.z - scroll, sp.rotY, sp.scale, sp.scale, sp.scale);
            splatScale[slot] = sp.scale;
          }
          if (splatColor[slot] !== sp.colorIndex) { splats.setTone(slot, hexLinear(COLORS[sp.colorIndex] as string)); splatColor[slot] = sp.colorIndex; }
        }
        splatSlots.sweep((slot) => { splats.collapse(slot); splatScale[slot] = -1; });

        /* particles */
        for (let i = 0; i < POOL.particles; i++) {
          const pa = simNow.particles[i] as SplatRushSim["particles"][number];
          if (!pa.visible) {
            if (particleShown[i]) { particles.collapse(i); particleShown[i] = false; }
            continue;
          }
          particles.place(i, pa.x, pa.y, pa.z, 0, pa.scale, pa.scale, pa.scale);
          particleShown[i] = true;
          if (particleColor[i] !== pa.color) { particles.setTone(i, hexLinear(pa.color)); particleColor[i] = pa.color; }
        }

        /* clouds: rewritten only when one respawns; the node carries the shared drift */
        const drift = simNow.cloudDrift;
        simNow.clouds.forEach((c, i) => {
          const local = c.z - drift;
          if (Math.abs(local - (cloudLocal[i] as number)) > 1e-6 || Number.isNaN(cloudLocal[i])) {
            clouds.place(i, c.x, c.y, local, c.r, c.s, c.s, c.s);
            cloudLocal[i] = local;
          }
        });

        /* streaks */
        const stretch = (d: number, h2: number): number => 1 + 0.05 * d + 0.6 * h2;
        const d2 = o.phase === "playing" ? o.speed : 0.5 * CONFIG.FORWARD_SPEED_INIT;
        const sz = stretch(d2, simNow.speedRatio);
        simNow.streaks.forEach((s, i) => streaks.place(i, s.x, s.y, s.z, 0, 1, 1, sz));

        /* uploads and frame offsets */
        const roadZ = scroll - back;
        node("deck").setPosition(0, 0, roadZ);
        node("rails").setPosition(0, 0, roadZ);
        node("dashes").setPosition(0, 0, roadZ);
        node("gates").setPosition(0, 0, roadZ);
        node("gate-symbols").setPosition(0, 0, roadZ);
        node("splats").setPosition(0, 0, roadZ);
        node("clouds").setPosition(0, 0, drift);
        deck.flush(node("deck"));
        rails.flush(node("rails"));
        dashes.flush(node("dashes"));
        gates.flush(node("gates"));
        gateSymbols.flush(node("gate-symbols"), false);
        ballSymbol.flush(node("ball-symbol"), false);
        splats.flush(node("splats"));
        particles.flush(node("particles"));
        clouds.flush(node("clouds"));
        streaks.flush(node("streaks"), false);

        updateBackdrop(node, o.distance - back, elapsed);
        /* camera */
        const c = view.camera ?? shown?.camera ?? simNow.camera;
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = baseFov + (view.reducedMotion ? 0 : o._fovApplied);
        controller.setPose({ position: [c.x, c.y, c.z], target: [c.lookX, c.lookY, c.lookZ], up: [0, 1, 0], fov }, { cut: false });
      }
      const batches = [deck, rails, dashes, gates, gateSymbols, ballSymbol, splats, particles, clouds, streaks];
      const parked = [...pickupNodeIds(), "shield", "guide", "ball-symbol"];
      function warm(on: boolean): void {
        for (const id of parked) {
          const h = node(id).setVisible(on);
          if (on) h.setPosition(0, -50, -60);
        }
        node("gate-symbols").setVisible(on);
        if (!on) { hidePickups(node); symbolsOn = false; }
      }
      return {
        update,
        warm,
        get nodeCount() { return handles.size; },
        get uploadedVertices() { return batches.reduce((sum, b) => sum + b.uploadedVertices, 0); }
      };
    }
  };
}
