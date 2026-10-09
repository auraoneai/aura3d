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

export type ProbeUpdateMode = "once" | "on-demand" | "every-n-frames";

export interface ReflectionProbeSpec {
  readonly name: string;
  readonly position: readonly [number, number, number];
  /** Box half-extents around `position` — the probe's influence volume. */
  readonly boxHalfExtents: readonly [number, number, number];
  readonly blendDistance: number;    // metres of weight falloff outside the box
  readonly priority?: number;        // higher wins ties
  readonly intensity?: number;       // default 1
  readonly update?: ProbeUpdateMode; // default "once"
  readonly resolution?: 128 | 256;     // face size, default 128
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
  slice: { faces: Float32Array[]; next: number } | null;
}

export class ReflectionProbeSystem {
  private readonly entries = new Map<string, ProbeEntry>();

  constructor(
    private readonly device: RenderDevice,
    private readonly renderFace: ReflectionFaceRenderer,
    private readonly options: { readonly defaultFaceSize?: 128 | 256 } = {}
  ) {}

  register(spec: ReflectionProbeSpec): void {
    const existing = this.entries.get(spec.name);
    if (existing && JSON.stringify(existing.spec) === JSON.stringify(spec)) return;
    existing?.probe?.dispose();
    this.entries.set(spec.name, {
      spec,
      probe: null,
      dirty: spec.update !== "on-demand",
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
    const entry = this.entries.get(name);
    if (entry) entry.dirty = true;
  }

  probes(): readonly EnvironmentProbe[] {
    return [...this.entries.values()].flatMap((e) => (e.probe ? [e.probe] : []));
  }

  count(): number { return this.entries.size; }

  /** Advance captures: whole 6 faces for once/on-demand; 1 face per call for
   *  `every-n-frames` (time-sliced). Returns names whose probe changed. */
  update(): readonly string[] {
    const changed: string[] = [];
    for (const [name, entry] of this.entries) {
      if (!entry.dirty) continue;
      if (entry.spec.update === "every-n-frames") {
        entry.slice ??= { faces: [], next: 0 };
        this.captureFace(entry, entry.slice.next as 0 | 1 | 2 | 3 | 4 | 5);
        entry.slice.next += 1;
        if (entry.slice.next < 6) continue;
        this.finish(entry);
        changed.push(name);
      } else {
        for (let f = 0; f < 6; f += 1) this.captureFace(entry, f as 0 | 1 | 2 | 3 | 4 | 5);
        this.finish(entry);
        changed.push(name);
      }
    }
    return changed;
  }

  private captureFace(entry: ProbeEntry, face: 0 | 1 | 2 | 3 | 4 | 5): void {
    const size = entry.spec.resolution ?? this.options.defaultFaceSize ?? 128;
    const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `probe-${entry.spec.name}-f${face}` });
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      this.device.setRenderTarget(target);
      this.renderFace(face, target, cubeFaceViewProjection(face, entry.spec.position, entry.spec.near, entry.spec.far));
      const pixels = this.device.readFloatPixels(0, 0, size, size);
      entry.slice ??= { faces: [], next: 0 };
      entry.slice.faces[face] = pixels;
    } finally {
      this.device.setRenderTarget(prevTarget);
      target.dispose();
    }
  }

  private finish(entry: ProbeEntry): void {
    const size = entry.spec.resolution ?? this.options.defaultFaceSize ?? 128;
    const probe = buildProbeFromFaces(entry.slice?.faces ?? [], size as EnvironmentProbe["faceSize"], {
      source: "capture",
      label: `probe-${entry.spec.name}`
    });
    entry.probe?.dispose();
    entry.probe = probe;
    // every-n-frames re-dirties so the loop keeps time-slicing; once/on-demand
    // stay clean until updateProbe() re-flags them.
    entry.dirty = entry.spec.update === "every-n-frames";
    entry.slice = null;
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
  const half = spec.boxHalfExtents;
  const c = spec.position;
  const dx = Math.max(0, Math.abs(p[0] - c[0]) - half[0]);
  const dy = Math.max(0, Math.abs(p[1] - c[1]) - half[1]);
  const dz = Math.max(0, Math.abs(p[2] - c[2]) - half[2]);
  const d = Math.hypot(dx, dy, dz);
  const blend = Math.max(spec.blendDistance, 1e-6);
  return Math.max(0, 1 - d / blend);
}
