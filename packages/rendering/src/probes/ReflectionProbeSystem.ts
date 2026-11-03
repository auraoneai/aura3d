// PRD-02 §6.6 — `ReflectionProbeSystem`: HDR 6-face capture per probe
// (`EnvironmentCaptureRequest`-shaped `renderFace` callback — the same seam
// the scene renderer already serves for C-09), PMREM on the GPU path via
// `buildProbeFromFaces` (rgba16f mip pyramid + SH9), CPU per-item selection
// of the 2 nearest overlapping probes, box projection weights with
// `blendDistance`; the global environment fills the remainder.
// Update modes: `once` (default), `on-demand` via `updateProbe(name)`,
// `every-n-frames` time-sliced at 1 face per frame.

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { EnvironmentProbe } from "../contracts/environment";
import { buildProbeFromFaces, cubeFaceViewProjection } from "../environment/probeBuild";
import type { RenderItem } from "../ForwardPass";
import { webgl2DeviceHost } from "../webgl2/Counters";

export type ProbeUpdateMode = "once" | "on-demand" | "every-n-frames";

export interface ReflectionProbeSpec {
  readonly name: string;
  readonly position: readonly [number, number, number];
  /** Legacy box half-extents around position, used when `box` is absent. */
  readonly boxHalfExtents: readonly [number, number, number];
  /** Explicit world-space bounds, which may be offset from the capture position. */
  readonly box?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /** True uses global influence and skips box projection. */
  readonly infinite?: boolean;
  readonly blendDistance: number;    // metres of weight falloff outside the box
  readonly priority?: number;        // higher wins ties
  readonly intensity?: number;       // default 1
  readonly update?: ProbeUpdateMode; // default "once"
  /** Frames between capture starts; long captures never overlap. */
  readonly everyNFrames?: number;
  readonly resolution?: 64 | 128 | 256; // face size, default 128
  readonly near?: number;
  readonly far?: number;
}

export interface ProbeSelection {
  readonly probe: EnvironmentProbe;
  readonly spec: ReflectionProbeSpec;
  readonly weight: number; // normalized later; box-distance weighted
}

export interface ProbeAssignment {
  readonly a: ProbeSelection | null;
  readonly b: ProbeSelection | null;
  /** Weight left for the global environment (1 − sum of probe weights). */
  readonly globalWeight: number;
}

export type ReflectionFaceRenderer = (
  face: 0 | 1 | 2 | 3 | 4 | 5,
  target: RenderTarget,
  viewProjection: Float32Array
) => void;

interface ProbeEntry {
  spec: ReflectionProbeSpec;
  probe: EnvironmentProbe | null;
  dirty: boolean;
  dirtyRevision: number;
  nextCaptureFrame: number;
  cycleStartFrame: number;
  cycleRevision: number;
  slice: { faces: Float32Array[]; next: number } | null;
}

export class ReflectionProbeSystem {
  private readonly entries = new Map<string, ProbeEntry>();
  private disposed = false;
  private updating = false;
  private frame = 0;
  private nextEntry = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly renderFace: ReflectionFaceRenderer,
    private readonly options: { readonly defaultFaceSize?: 64 | 128 | 256 } = {}
  ) {}

  register(spec: ReflectionProbeSpec): void {
    this.assertAlive();
    const existing = this.entries.get(spec.name);
    if (existing && JSON.stringify(existing.spec) === JSON.stringify(spec)) return;
    validateReflectionSpec(spec);
    validateReflectionDevice(this.device, spec.resolution ?? this.options.defaultFaceSize ?? 128);
    existing?.probe?.dispose();
    const owned: ReflectionProbeSpec = { ...spec,
      position: [...spec.position], boxHalfExtents: [...spec.boxHalfExtents],
      ...(spec.box ? { box: { min: [...spec.box.min], max: [...spec.box.max] } } : {}) };
    this.entries.set(spec.name, {
      spec: owned,
      probe: null,
      dirty: spec.update !== "on-demand",
      dirtyRevision: 0,
      nextCaptureFrame: 0,
      cycleStartFrame: 0,
      cycleRevision: 0,
      slice: null
    });
  }

  unregister(name: string): void {
    const entry = this.entries.get(name);
    entry?.probe?.dispose();
    this.entries.delete(name);
  }

  /** `app.lighting.updateProbe(name)` — flags an on-demand probe dirty. */
  updateProbe(name: string): void {
    this.assertAlive();
    const entry = this.entries.get(name);
    if (entry) { entry.dirty = true; entry.dirtyRevision += 1; }
  }

  probes(): readonly EnvironmentProbe[] {
    return [...this.entries.values()].flatMap((e) => (e.probe ? [e.probe] : []));
  }

  count(): number { return this.entries.size; }

  /** Advance captures: whole 6 faces for once/on-demand; 1 face per call for
   *  `every-n-frames` (time-sliced). Returns names whose probe changed. */
  update(maxProbes = Number.MAX_SAFE_INTEGER): readonly string[] {
    this.assertAlive();
    validateProbeBudget(maxProbes);
    if (this.updating) throw new Error("probe capture is already in progress");
    this.updating = true;
    const changed: string[] = [];
    try {
      for (const [name, entry] of this.scheduledEntries(maxProbes)) {
        const revision = entry.cycleRevision;
        if (entry.spec.update === "every-n-frames") {
          entry.slice ??= { faces: [], next: 0 };
          this.captureFace(entry, entry.slice.next as 0 | 1 | 2 | 3 | 4 | 5);
          entry.slice.next += 1;
          if (entry.slice.next < 6) continue;
        } else {
          for (let f = 0; f < 6; f += 1) this.captureFace(entry, f as 0 | 1 | 2 | 3 | 4 | 5);
        }
        if (this.entries.get(name) !== entry || this.disposed) continue;
        this.finish(entry, revision);
        changed.push(name);
      }
      return changed;
    } finally {
      this.updating = false;
    }
  }

  /** Advance captures with asynchronous float readback (including native WebGPU). */
  async updateAsync(maxProbes = Number.MAX_SAFE_INTEGER): Promise<readonly string[]> {
    this.assertAlive();
    validateProbeBudget(maxProbes);
    if (this.updating) throw new Error("probe capture is already in progress");
    this.updating = true;
    const changed: string[] = [];
    try {
      for (const [name, entry] of this.scheduledEntries(maxProbes)) {
        const revision = entry.cycleRevision;
        if (entry.spec.update === "every-n-frames") {
          entry.slice ??= { faces: [], next: 0 };
          await this.captureFaceAsync(entry, entry.slice.next as 0 | 1 | 2 | 3 | 4 | 5);
          if (this.entries.get(name) !== entry || this.disposed) continue;
          entry.slice.next += 1;
          if (entry.slice.next < 6) continue;
        } else {
          for (let f = 0; f < 6; f += 1) {
            await this.captureFaceAsync(entry, f as 0 | 1 | 2 | 3 | 4 | 5);
            if (this.entries.get(name) !== entry || this.disposed) break;
          }
        }
        if (this.entries.get(name) !== entry || this.disposed) continue;
        this.finish(entry, revision);
        changed.push(name);
      }
      return changed;
    } finally {
      this.updating = false;
    }
  }

  private scheduledEntries(maxProbes: number): [string, ProbeEntry][] {
    this.frame += 1;
    const entries = [...this.entries.entries()];
    const selected: [string, ProbeEntry][] = [];
    for (let offset = 0; offset < entries.length && selected.length < maxProbes; offset += 1) {
      const index = (this.nextEntry + offset) % entries.length;
      const [name, entry] = entries[index];
      if (!entry.dirty && entry.spec.update === "every-n-frames" && this.frame >= entry.nextCaptureFrame) entry.dirty = true;
      if (!entry.dirty) continue;
      if (!entry.slice) { entry.cycleStartFrame = this.frame; entry.cycleRevision = entry.dirtyRevision; }
      selected.push([name, entry]);
    }
    if (selected.length > 0) {
      const last = entries.findIndex(([name]) => name === selected[selected.length - 1][0]);
      this.nextEntry = (last + 1) % entries.length;
    }
    return selected;
  }

  private captureFace(entry: ProbeEntry, face: 0 | 1 | 2 | 3 | 4 | 5): void {
    const size = entry.spec.resolution ?? this.options.defaultFaceSize ?? 128;
    const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `probe-${entry.spec.name}-f${face}` });
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      this.device.setRenderTarget(target);
      this.renderFace(face, target, cubeFaceViewProjection(face, entry.spec.position, entry.spec.near, entry.spec.far));
      // GL readPixels returns rows bottom-up; lane-02 faces store row 0 at
      // v = −1 (top, CUBE_FACE_BASIS), so WebGL2 readbacks flip vertically.
      const raw = this.device.readFloatPixels(0, 0, size, size);
      const pixels = this.device.kind === "webgl2" ? flipRows(raw, size, size) : raw;
      entry.slice ??= { faces: [], next: 0 };
      entry.slice.faces[face] = pixels;
    } finally {
      try { this.device.setRenderTarget(prevTarget); } finally { target.dispose(); }
    }
  }

  private async captureFaceAsync(entry: ProbeEntry, face: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
    const size = entry.spec.resolution ?? this.options.defaultFaceSize ?? 128;
    const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `probe-${entry.spec.name}-f${face}` });
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      this.device.setRenderTarget(target);
      this.renderFace(face, target, cubeFaceViewProjection(face, entry.spec.position, entry.spec.near, entry.spec.far));
      const raw = this.device.readFloatPixelsAsync
        ? await this.device.readFloatPixelsAsync(0, 0, size, size)
        : this.device.readFloatPixels(0, 0, size, size);
      const pixels = this.device.kind === "webgl2" || this.device.kind === "webgpu" ? flipRows(raw, size, size) : raw;
      entry.slice ??= { faces: [], next: 0 };
      entry.slice.faces[face] = pixels;
    } finally {
      try { this.device.setRenderTarget(prevTarget); } finally { target.dispose(); }
    }
  }

  private finish(entry: ProbeEntry, revision: number): void {
    const size = entry.spec.resolution ?? this.options.defaultFaceSize ?? 128;
    const probe = buildProbeFromFaces(entry.slice?.faces ?? [], size as EnvironmentProbe["faceSize"], {
      source: "capture",
      label: `probe-${entry.spec.name}`
    });
    entry.probe?.dispose();
    entry.probe = probe;
    // Periodic work becomes eligible after the requested start-to-start gap;
    // a six-frame capture never overlaps the next one when the gap is shorter.
    if (entry.spec.update === "every-n-frames") entry.nextCaptureFrame = entry.cycleStartFrame + (entry.spec.everyNFrames ?? 1);
    entry.dirty = entry.dirtyRevision !== revision;
    entry.slice = null;
  }

  /** Release all published probes and invalidate any capture in progress. */
  dispose(): void {
    if (this.disposed) return;
    for (const name of this.entries.keys()) this.unregister(name);
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("reflection probe system is disposed");
  }

  /**
   * Per-item probe pick (PRD §6.6): the 2 nearest probes whose influence box
   * overlaps the item, weighted by box distance with `blendDistance`
   * falloff; the rest of the weight goes to the global environment.
   * On WebGL2 at most 2 probe cubes bind per draw — selection is CPU-side.
   */
  assign(item: { readonly position?: readonly [number, number, number]; readonly modelMatrix?: Float32Array | readonly number[] }): ProbeAssignment {
    const p = itemPosition(item);
    const scored: ProbeSelection[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.probe) continue;
      const weight = boxWeight(entry.spec, p);
      if (weight > 0) scored.push({ probe: entry.probe, spec: entry.spec, weight });
    }
    scored.sort((x, y) => y.weight - x.weight || (y.spec.priority ?? 0) - (x.spec.priority ?? 0) || x.spec.name.localeCompare(y.spec.name));
    const a = scored[0] ?? null;
    const b = scored[1] ?? null;
    const total = (a?.weight ?? 0) + (b?.weight ?? 0);
    const scale = total > 1 ? 1 / total : 1;
    const sa = a ? { ...a, weight: a.weight * scale } : null;
    const sb = b ? { ...b, weight: b.weight * scale } : null;
    return { a: sa, b: sb, globalWeight: Math.max(0, 1 - (sa?.weight ?? 0) - (sb?.weight ?? 0)) };
  }
}

function itemPosition(item: { readonly position?: readonly [number, number, number]; readonly modelMatrix?: Float32Array | readonly number[] }): [number, number, number] {
  if (item.position) return [item.position[0], item.position[1], item.position[2]];
  const m = item.modelMatrix;
  return m ? [m[12], m[13], m[14]] : [0, 0, 0];
}

/** Weight by box distance: 1 inside, linear falloff over `blendDistance`
 *  metres outside the box, 0 beyond it. */
export function boxWeight(spec: ReflectionProbeSpec, p: readonly [number, number, number]): number {
  if (spec.infinite) return 1;
  const min = spec.box?.min ?? spec.position.map((v, i) => v - spec.boxHalfExtents[i]);
  const max = spec.box?.max ?? spec.position.map((v, i) => v + spec.boxHalfExtents[i]);
  const dx = Math.max(0, min[0] - p[0], p[0] - max[0]);
  const dy = Math.max(0, min[1] - p[1], p[1] - max[1]);
  const dz = Math.max(0, min[2] - p[2], p[2] - max[2]);
  const d = Math.hypot(dx, dy, dz);
  const blend = Math.max(spec.blendDistance, 1e-6);
  return Math.max(0, 1 - d / blend);
}

function validateProbeBudget(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("reflection probe update budget must be a positive integer");
}

function validateReflectionSpec(spec: ReflectionProbeSpec): void {
  if (!spec.name || !spec.name.trim()) throw new RangeError("reflection probe name must be nonempty");
  if (spec.position.length !== 3 || spec.position.some((value) => !Number.isFinite(value))) throw new RangeError("reflection probe position must be finite");
  if (spec.boxHalfExtents.length !== 3 || spec.boxHalfExtents.some((value) => !Number.isFinite(value) || value <= 0)) throw new RangeError("reflection probe half extents must be finite and positive");
  if (spec.box && (spec.box.min.length !== 3 || spec.box.max.length !== 3 || spec.box.min.some((value, axis) =>
    !Number.isFinite(value) || !Number.isFinite(spec.box!.max[axis]) || spec.box!.max[axis] <= value || !Number.isFinite(spec.box!.max[axis] - value)))) {
    throw new RangeError("reflection probe box must contain finite bounds with positive extents");
  }
  if (!Number.isFinite(spec.blendDistance) || spec.blendDistance < 0) throw new RangeError("reflection probe blend distance must be finite and nonnegative");
  if (spec.intensity !== undefined && (!Number.isFinite(spec.intensity) || spec.intensity < 0)) throw new RangeError("reflection probe intensity must be finite and nonnegative");
  if (spec.priority !== undefined && !Number.isFinite(spec.priority)) throw new RangeError("reflection probe priority must be finite");
  if (spec.everyNFrames !== undefined && (!Number.isSafeInteger(spec.everyNFrames) || spec.everyNFrames < 1 || spec.everyNFrames > 1_000_000)) throw new RangeError("reflection probe interval must be an integer in 1..1000000");
  if (spec.resolution !== undefined && spec.resolution !== 64 && spec.resolution !== 128 && spec.resolution !== 256) throw new RangeError("reflection probe resolution must be 64, 128 or 256");
}

function validateReflectionDevice(device: RenderDevice, size: number): void {
  let limit = device.kind === "webgpu" ? 8192 : 2048;
  const native = (device as RenderDevice & { readonly nativeGpuDevice?: { readonly limits?: Readonly<Record<string, number>> } }).nativeGpuDevice;
  let reported: number | undefined;
  if (device.kind === "webgpu") reported = native?.limits?.maxTextureDimension2D;
  else if (device.kind === "webgl2") {
    const gl = webgl2DeviceHost(device)?.gl;
    if (gl) {
      const cube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE) as number;
      const target = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (!Number.isSafeInteger(cube) || cube < 1 || !Number.isSafeInteger(target) || target < 1) throw new RangeError("device texture size limits must be positive integers");
      reported = Math.min(cube, target);
    }
  }
  if (reported !== undefined) {
    if (!Number.isSafeInteger(reported) || reported < 1) throw new RangeError("device cube texture size limit must be a positive integer");
    limit = reported;
  }
  if (size > limit) throw new RangeError("reflection probe resolution exceeds the device cube texture size limit");
}

/** Vertical flip of an RGBA float image (GL bottom-up → top-down rows). */
export function flipRows(pixels: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(pixels.length);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    out.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
  }
  return out;
}
