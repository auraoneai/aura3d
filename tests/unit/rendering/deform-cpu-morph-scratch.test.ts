/* PRD-06 T2.3 (PRD-06:1228): the CPU morph fallback under `A3D_QR_ANIMATION`
 * must not allocate per frame — one persistent dynamic VBO per source
 * geometry, rewritten via dirty-range `bufferSubData` (`updateBuffer`).
 *
 * Spec assertions:
 *   - 100 frames → 1 vertex buffer upload-created and 0 `Geometry`
 *     constructions after the first frame (object identity is the observable
 *     proxy for the constructor spy — `new Geometry` cannot be spied on, but a
 *     second construction would produce a different wrapper object).
 *   - ForwardPass's per-frame `geometry.dispose()` on the resolved wrapper is
 *     a no-op — the scratch survives (releaseMorphScratchGeometry drops it).
 *   - Morphed output equals the legacy `applyMorphTargets` result.
 *   - Flag-off stays byte-identical: fresh `Geometry` per call.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { QrFlags, QrFlagName, QrFlagValue } from "@aura3d/rendering/contracts";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import "../../../packages/rendering/src/lanes/prd06";
import { releaseMorphScratchGeometry, resolveRenderGeometry } from "../../../packages/rendering/src/forward/Deform";
import { applyMorphTargets, type MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import type { RenderBuffer, RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

const FLAGS_ON = flagsOf({ A3D_QR_ANIMATION: true });
const FLAGS_OFF = flagsOf({});

/** Counts createBuffer/updateBuffer; only the two calls VertexBuffer.upload makes. */
function fakeDevice() {
  const created: RenderBuffer[] = [];
  const updated: RenderBuffer[] = [];
  let id = 0;
  const device = {
    createBuffer(usage: "vertex" | "index", byteLength: number): RenderBuffer {
      const buf = {
        id: ++id,
        usage,
        byteLength,
        disposed: false
      } as RenderBuffer & { disposed: boolean };
      buf.dispose = () => {
        buf.disposed = true;
      };
      created.push(buf);
      return buf;
    },
    updateBuffer(buffer: RenderBuffer): void {
      updated.push(buffer);
    }
  } as unknown as RenderDevice;
  return { device, created, updated };
}

const VERTEX_COUNT = 6;

function sourceGeometry(): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3T4T2, VERTEX_COUNT);
  for (let v = 0; v < VERTEX_COUNT; v += 1) {
    vb.setAttribute(v, "position", [v * 0.1, 0, 0]);
    vb.setAttribute(v, "normal", [0, 1, 0]);
    vb.setAttribute(v, "tangent", [1, 0, 0, 1]);
    vb.setAttribute(v, "uv", [v / VERTEX_COUNT, 0]);
  }
  return new Geometry(vb, new IndexBuffer([0, 1, 2, 2, 3, 4, 4, 5, 0], VERTEX_COUNT));
}

function morphTargets(count: number): MorphTargetDelta[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `t${i}`,
    positions: Array.from({ length: VERTEX_COUNT }, (_, v) => [0.1 + i * 0.05, v * 0.01, 0] as [number, number, number]),
    normals: Array.from({ length: VERTEX_COUNT }, () => [0, 0, 1] as [number, number, number]),
    tangents: Array.from({ length: VERTEX_COUNT }, () => [0, 1, 0] as [number, number, number])
  }));
}

function itemOf(source: Geometry, targets: MorphTargetDelta[], weights: number[]): RenderItem {
  return { geometry: source, morphTargets: targets, morphWeights: weights, label: "morph-item" } as RenderItem;
}

afterEach(() => setRendererQrFlags(FLAGS_OFF));

describe("T2.3 persistent CPU-morph scratch (A3D_QR_ANIMATION on)", () => {
  it("100 frames → 1 created buffer, same wrapper object, bufferSubData uploads", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targets = morphTargets(3);
    const { device, created, updated } = fakeDevice();

    let resolved: Geometry | undefined;
    for (let frame = 0; frame < 100; frame += 1) {
      const weights = [0.2 * Math.sin(frame * 0.1), 0.4, -0.1];
      const g = resolveRenderGeometry(itemOf(source, targets, weights));
      if (frame === 0) resolved = g;
      // No new Geometry per frame: same cached wrapper (envelope bounds stay valid).
      expect(g).toBe(resolved);
      g.vertexBuffer.upload(device);
      // ForwardPass's finally block calls geometry.dispose() every frame.
      g.dispose();
    }

    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(99);
    // Buffer survived 100 no-op disposes.
    expect(created[0]!.disposed).toBe(false);
    releaseMorphScratchGeometry(source);
  });

  it("morphed vertices equal the legacy applyMorphTargets result", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targets = morphTargets(2);
    const weights = [0.6, -0.3];
    const resolved = resolveRenderGeometry(itemOf(source, targets, weights));
    const legacy = applyMorphTargets(source, targets, weights);
    for (let v = 0; v < VERTEX_COUNT; v += 1) {
      expect(resolved.vertexBuffer.getAttribute(v, "position")).toEqual(legacy.vertexBuffer.getAttribute(v, "position"));
      expect(resolved.vertexBuffer.getAttribute(v, "normal")).toEqual(legacy.vertexBuffer.getAttribute(v, "normal"));
      expect(resolved.vertexBuffer.getAttribute(v, "tangent")).toEqual(legacy.vertexBuffer.getAttribute(v, "tangent"));
      expect(resolved.vertexBuffer.getAttribute(v, "uv")).toEqual(legacy.vertexBuffer.getAttribute(v, "uv"));
    }
    releaseMorphScratchGeometry(source);
  });

  it("bounds are the morph envelope — contain every morphed vertex for weights in [0, 1]", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targets = morphTargets(4);
    const resolved = resolveRenderGeometry(itemOf(source, targets, [1, 1, 1, 1]));
    // The envelope bound covers the weight∈[0,1] domain (the established
    // morph-culling contract — same as computeMorphTargetEnvelopeBounds
    // elsewhere). Weights outside [0,1] extrapolate beyond it by definition.
    for (const w of [[1, 0, 0, 0], [0, 0, 0, 1], [0.25, 0.5, 0.75, 1], [1, 1, 1, 1], [0, 0, 0, 0]]) {
      const g = resolveRenderGeometry(itemOf(source, targets, w));
      for (let v = 0; v < VERTEX_COUNT; v += 1) {
        const p = g.vertexBuffer.getAttribute(v, "position");
        for (let a = 0; a < 3; a += 1) {
          expect(p[a]!).toBeGreaterThanOrEqual(resolved.bounds.min[a]! - 1e-6);
          expect(p[a]!).toBeLessThanOrEqual(resolved.bounds.max[a]! + 1e-6);
        }
      }
    }
    releaseMorphScratchGeometry(source);
  });

  it("a new target set rebuilds the wrapper but reuses the buffers", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targetsA = morphTargets(2);
    const first = resolveRenderGeometry(itemOf(source, targetsA, [1, 0]));
    const vb = first.vertexBuffer;
    const ib = first.indexBuffer;
    const second = resolveRenderGeometry(itemOf(source, morphTargets(2), [0, 1]));
    expect(second).not.toBe(first);
    expect(second.vertexBuffer).toBe(vb);
    expect(second.indexBuffer).toBe(ib);
    releaseMorphScratchGeometry(source);
  });

  it("index buffer is the shared persistent one, uploaded once", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targets = morphTargets(1);
    const { device, created } = fakeDevice();
    const g = resolveRenderGeometry(itemOf(source, targets, [1]));
    const uploadedA = g.indexBuffer!.upload(device);
    const uploadedB = g.indexBuffer!.upload(device);
    expect(uploadedA).toBe(uploadedB);
    expect(created.filter((b) => b.usage === "index")).toHaveLength(1);
    releaseMorphScratchGeometry(source);
  });

  it("releaseMorphScratchGeometry drops the entry — next resolve rebuilds", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    const targets = morphTargets(1);
    const first = resolveRenderGeometry(itemOf(source, targets, [1]));
    releaseMorphScratchGeometry(source);
    const second = resolveRenderGeometry(itemOf(source, targets, [1]));
    expect(second).not.toBe(first);
    releaseMorphScratchGeometry(source);
  });

  it("throws the same count-mismatch error as the legacy path", () => {
    setRendererQrFlags(FLAGS_ON);
    const source = sourceGeometry();
    expect(() => resolveRenderGeometry(itemOf(source, morphTargets(2), [1]))).toThrow(
      "Morph target count must match morph weight count."
    );
    releaseMorphScratchGeometry(source);
  });
});

describe("T2.3 flag-off byte-identical legacy path", () => {
  it("returns a fresh Geometry per call and does not touch the scratch cache", () => {
    setRendererQrFlags(FLAGS_OFF);
    const source = sourceGeometry();
    const targets = morphTargets(1);
    const a = resolveRenderGeometry(itemOf(source, targets, [1]));
    const b = resolveRenderGeometry(itemOf(source, targets, [1]));
    expect(a).not.toBe(b);
    expect(a.vertexBuffer).not.toBe(b.vertexBuffer);
    // Legacy dispose semantics preserved: disposing the resolved wrapper kills it.
    a.dispose();
    expect(() => a.vertexBuffer.getAttribute(0, "position")).toThrow();
    releaseMorphScratchGeometry(source);
  });
});
