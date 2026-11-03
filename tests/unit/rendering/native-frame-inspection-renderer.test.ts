import { describe, expect, it } from "vitest";

import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { FrameStats } from "../../../packages/rendering/src/quality/FrameStats";
import { prd11TelemetryForDevice } from "../../../packages/rendering/src/lanes/prd11";
import type {
  RendererGpuScopedResult,
  RendererGpuScopedTimingBackend,
  RendererGpuTimingToken
} from "../../../packages/rendering/src/RendererTiming";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

class QueryBackend implements RendererGpuScopedTimingBackend {
  readonly supported = true;
  readonly tokens: RendererGpuTimingToken[] = [];
  readonly ended: RendererGpuTimingToken[] = [];
  readonly ready: RendererGpuScopedResult[] = [];
  begin(label: string): RendererGpuTimingToken { return this.beginScope(label); }
  end(token: RendererGpuTimingToken): undefined { this.endScope(token); return undefined; }
  beginScope(label: string): RendererGpuTimingToken {
    const token = { label };
    this.tokens.push(token);
    return token;
  }
  endScope(token: RendererGpuTimingToken): void { this.ended.push(token); }
  poll(): readonly RendererGpuScopedResult[] { return this.ready.splice(0); }
  pollWithoutAging(): readonly RendererGpuScopedResult[] { return this.poll(); }
  settle(index: number, durationMs: number | null): void {
    const token = this.tokens[index]!;
    this.ready.push({ token, label: token.label, durationMs });
  }
}

async function createTimedRenderer() {
  const renderer = await Renderer.create({
    backend: "mock", width: 32, height: 16,
    qrFlags: createTrustedQrFlags({ A3D_QR_TIERS: true })
  });
  const backend = new QueryBackend();
  const stats = new FrameStats(16, backend);
  const telemetry = prd11TelemetryForDevice(renderer.device);
  (telemetry as { stats: FrameStats }).stats = stats;
  return { renderer, backend, stats };
}

function makeSource(onBeforeRender?: () => void) {
  return {
    renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "timed", ...(onBeforeRender ? { onBeforeRender } : {}) }],
    cameraPolicy: "identity" as const
  };
}

describe("Renderer per-view GPU inspection", () => {
  it("keeps view timing null when the timing contributor is disabled", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 32, height: 16 });
    renderer.render(makeSource());
    expect(renderer.getFrameInspection()).toMatchObject({ gpuTimeMs: null, gpuViewTiming: {
      wholeFrameGpuTimeMs: null, views: [{ viewId: "single", gpuTimeMs: null }]
    } });
    renderer.dispose();
  });

  it("reports a null whole-frame GPU time with an explicit reason when the device has no timer queries", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 32, height: 16 });
    renderer.render(makeSource());
    const capture = renderer.getFrameInspection()!;
    expect(capture.gpuTimeMs).toBeNull();
    expect(capture.gpuTimeReason).toBe("Mock device has no GPU timer queries");
    expect(capture.gpuViewTiming).toMatchObject({ wholeFrameGpuStatus: "unavailable", wholeFrameGpuReason: "Mock device has no GPU timer queries" });
    expect(capture.cpuTimeMs).toBeGreaterThanOrEqual(0);
    renderer.dispose();
  });

  it.each(["sync", "async"] as const)("updates the correct earlier render when a query settles (%s)", async (mode) => {
    const { renderer, backend } = await createTimedRenderer();
    const source = makeSource();
    if (mode === "sync") renderer.render(source); else await renderer.renderAsync(source);
    if (mode === "sync") renderer.render(source); else await renderer.renderAsync(source);
    expect(backend.tokens).toHaveLength(2);
    backend.settle(0, 2.5);
    const history = renderer.getFrameInspectionHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ frameNumber: 1, gpuTimeMs: null, gpuViewTiming: {
      coverage: "view-collect-through-after-output", wholeFrameGpuTimeMs: null, views: [{ viewId: "single", gpuTimeMs: 2.5 }]
    } });
    expect(history[1]).toMatchObject({ frameNumber: 2, gpuTimeMs: null, gpuViewTiming: { views: [{ viewId: "single", gpuTimeMs: null }] } });
    backend.settle(1, 4.25);
    expect(renderer.getFrameInspection()).toMatchObject({ frameNumber: 2, gpuTimeMs: null, gpuViewTiming: { views: [{ viewId: "single", gpuTimeMs: 4.25 }] } });
    renderer.dispose();
    expect(renderer.getFrameInspectionHistory()).toEqual([]);
  });

  it("keeps multiple view queries separate and does not call their sum a complete frame", async () => {
    const { renderer, backend } = await createTimedRenderer();
    const source = makeSource();
    renderer.render({ source, views: [
      { id: "left", camera: { viewProjectionMatrix: IDENTITY }, viewport: { x: 0, y: 0, width: 16, height: 16 } },
      { id: "right", camera: { viewProjectionMatrix: IDENTITY }, viewport: { x: 16, y: 0, width: 16, height: 16 } }
    ] });
    expect(backend.tokens).toHaveLength(2);
    backend.settle(1, 3);
    expect(renderer.getFrameInspection()).toMatchObject({ gpuTimeMs: null, gpuViewTiming: {
      wholeFrameGpuTimeMs: null,
      views: [{ viewId: "left", gpuTimeMs: null }, { viewId: "right", gpuTimeMs: 3 }]
    } });
    backend.settle(0, null);
    expect(renderer.getFrameInspection()?.gpuViewTiming?.views).toEqual([
      { viewId: "left", gpuTimeMs: null }, { viewId: "right", gpuTimeMs: 3 }
    ]);
    renderer.dispose();
  });

  it("closes an interrupted view query and leaves its missing measurement null", async () => {
    const { renderer, backend, stats } = await createTimedRenderer();
    expect(() => renderer.render(makeSource(() => { throw new Error("draw failed"); }))).toThrow("draw failed");
    expect(backend.tokens).toHaveLength(1);
    expect(backend.ended).toEqual([backend.tokens[0]]);
    expect(stats.samples).toBe(0);
    backend.settle(0, 9);
    expect(renderer.getFrameInspection()).toMatchObject({ gpuTimeMs: null, gpuViewTiming: { views: [{ viewId: "single", gpuTimeMs: null }] } });
    renderer.dispose();
  });
});

describe("Renderer frame inspection phases (S5-WP17-01)", () => {
  it.each(["sync", "async"] as const)("records the shadow-map and post-process phases it ran and times the whole render call (%s)", async (mode) => {
    const { DirectionalLight, identityMat4 } = await import("@aura3d/scene");
    const { PBRMaterial } = await import("../../../packages/rendering/src/PBRMaterial");
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial();
    const sun = new DirectionalLight("inspected-sun");
    sun.castsShadow = true;
    const source = {
      cameraPolicy: "identity" as const,
      renderItems: [{ geometry, material, label: "caster" }],
      shadow: { light: sun, size: 8, lightMatrix: identityMat4() },
      postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const } }
    };
    try {
      if (mode === "sync") renderer.render(source); else await renderer.renderAsync(source);
      const capture = renderer.getFrameInspection()!;
      const names = capture.passes.map((pass) => pass.name);
      expect(names).toContain("shadow-maps");
      expect(names).toContain("post-process");
      expect(names.indexOf("shadow-maps")).toBeLessThan(names.indexOf("post-process"));
      const shadow = capture.passes.find((pass) => pass.name === "shadow-maps")!;
      expect(shadow).toMatchObject({ status: "completed", reads: ["scene.shadowCasters"], writes: ["shadow.map"] });
      expect(shadow.drawCalls).toBeGreaterThan(0);
      const phaseCpu = capture.passes.reduce((total, pass) => total + (pass.cpuTimeMs ?? 0), 0);
      expect(capture.cpuTimeMs).not.toBeNull();
      expect(capture.cpuTimeMs!).toBeGreaterThanOrEqual(phaseCpu - 1e-6);
      expect(capture.gpuTimeMs).toBeNull();
    } finally {
      renderer.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("marks a render that threw incomplete even though its observed phases were recorded", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    expect(() => renderer.render(makeSource(() => { throw new Error("draw failed"); }))).toThrow("draw failed");
    expect(renderer.getFrameInspection()).toMatchObject({ complete: false });
    expect(renderer.getFrameInspection()!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    renderer.dispose();
  });
});
