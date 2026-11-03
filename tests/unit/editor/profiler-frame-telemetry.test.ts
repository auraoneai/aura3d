import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorRuntime } from "../../../packages/editor-runtime/src/EditorRuntime";
import {
  DiagnosticsOverlayModel,
  type EditorDiagnosticsInput,
  type EditorDiagnosticsSnapshot
} from "../../../packages/editor-runtime/src/DiagnosticsOverlayModel";
import type { EditorShell } from "../../../apps/editor/src/EditorShell";
import { ProfilerPanel } from "../../../apps/editor/src/panels/ProfilerPanel";
import { EditorViewport } from "../../../apps/editor/src/viewport/EditorViewport";

const legacyInput: EditorDiagnosticsInput = {
  frameTimeMs: 0,
  drawCalls: 3,
  triangleCount: 12,
  nodeCount: 2,
  assetCount: 1,
  physicsBodies: 1,
  resources: [{ id: "shader", label: "Shader", kind: "shader", status: "warning" }]
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The panel only needs a plain element-shaped object, not a DOM or browser. */
function makeProfiler(snapshot: () => EditorDiagnosticsSnapshot): ProfilerPanel {
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "section") throw new Error(`Unexpected element: ${tag}`);
      return { className: "", innerHTML: "" };
    }
  });
  const shell = {
    get frameCount(): never { throw new Error("UI refresh counts are not timing samples"); },
    runtime: { mode: "edit", diagnosticsSnapshot: snapshot },
    plugins: { snapshot: () => ({ panels: [] }) }
  } as unknown as EditorShell;
  return new ProfilerPanel(shell);
}

function readFrameMetric(panel: ProfilerPanel): { status: string; value: string } {
  const match = panel.element.innerHTML.match(/<dd data-metric="frame-time" data-status="([^"]+)"[^>]*>([^<]*)<\/dd>/);
  expect(match).not.toBeNull();
  return { status: match![1]!, value: match![2]! };
}

function frameMetric(panel: ProfilerPanel): { status: string; value: string } {
  panel.render();
  return readFrameMetric(panel);
}

interface TestClock { value: number }

/** Exercise the real viewport render method with a fake renderer and no DOM. */
function makeViewport(renderer: unknown, clock: TestClock): {
  viewport: EditorViewport;
  runtime: EditorRuntime;
  notifyViewportFrame: ReturnType<typeof vi.fn>;
} {
  vi.stubGlobal("performance", { now: () => clock.value });
  const runtime = new EditorRuntime();
  const notifyViewportFrame = vi.fn();
  const shell = {
    runtime,
    project: { scene: { nodes: [] }, assets: [] },
    scene: { updateWorldTransforms: vi.fn() },
    selectedNode: vi.fn(),
    notifyViewportFrame
  };
  const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
  Object.assign(viewport, {
    shell,
    renderer,
    disposed: false,
    canvas: { width: 8, height: 8 },
    syncTextureAssets: vi.fn(),
    syncMeshAssets: vi.fn(),
    sceneRenderItems: vi.fn(() => []),
    camera: vi.fn(() => ({ viewProjectionMatrix: [] })),
    pickTargets: vi.fn(() => []),
    sceneLights: vi.fn(() => []),
    diagnosticResources: vi.fn(() => []),
    drawOverlay: vi.fn(),
    scheduleAnimation: vi.fn()
  });
  return { viewport, runtime, notifyViewportFrame };
}

const healthyDiagnostics = {
  drawCalls: 0,
  buffers: 0,
  shaders: 0,
  contextLost: false,
  lastError: null
};

describe("editor profiler frame telemetry", () => {
  it("preserves numeric diagnostics compatibility while distinguishing initial and cleared state from a measured zero", () => {
    const model = new DiagnosticsOverlayModel();
    expect(model.snapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false });

    const measured = model.update(legacyInput);
    expect(measured).toMatchObject({
      frameTimeMs: 0,
      hasFrameTimeSample: true,
      drawCalls: 3,
      triangleCount: 12,
      warnings: 1
    });
    expect(measured.shaderWarnings[0]?.id).toBe("shader");

    model.clear();
    expect(model.snapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false, drawCalls: 0 });
  });

  it("shows unavailable without a sample and faithfully displays zero and successive slow samples", () => {
    const model = new DiagnosticsOverlayModel();
    const panel = makeProfiler(() => model.snapshot());
    expect(frameMetric(panel)).toEqual({ status: "unavailable", value: "Unavailable" });

    model.update(legacyInput);
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "0.00 ms" });
    model.update({ ...legacyInput, frameTimeMs: 147.25 });
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "147.25 ms" });
    model.update({ ...legacyInput, frameTimeMs: 209.5 });
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "209.50 ms" });
    expect(panel.element.innerHTML).toContain("not GPU timing");
    expect(panel.element.innerHTML).toContain('<dd data-metric="draw-calls">3</dd>');

    model.clear();
    expect(frameMetric(panel)).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it("does not expose the numeric placeholder or an invalid/unknown sample status as measured", () => {
    const model = new DiagnosticsOverlayModel();
    const measured = model.update({ ...legacyInput, frameTimeMs: 99.5 });
    let current: EditorDiagnosticsSnapshot = measured;
    const panel = makeProfiler(() => current);
    const { hasFrameTimeSample: _sampleStatus, ...missingStatus } = measured;
    const cases: unknown[] = [
      missingStatus,
      { ...measured, hasFrameTimeSample: false },
      { ...measured, hasFrameTimeSample: null },
      { ...measured, hasFrameTimeSample: "true" },
      { ...measured, frameTimeMs: undefined },
      { ...measured, frameTimeMs: Number.NaN },
      { ...measured, frameTimeMs: Number.POSITIVE_INFINITY },
      { ...measured, frameTimeMs: -1 }
    ];
    for (const candidate of cases) {
      current = candidate as EditorDiagnosticsSnapshot;
      expect(frameMetric(panel)).toEqual({ status: "unavailable", value: "Unavailable" });
    }

    current = model.update({ ...legacyInput, frameTimeMs: 99.5, hasFrameTimeSample: false });
    expect(frameMetric(panel)).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it("invalidates a previous sample without mutating earlier snapshots or other diagnostics", () => {
    const model = new DiagnosticsOverlayModel();
    const previous = model.update({ ...legacyInput, frameTimeMs: 75 });
    model.invalidateFrameTimeSample();
    expect(previous).toMatchObject({ frameTimeMs: 75, hasFrameTimeSample: true });
    expect(model.snapshot()).toMatchObject({
      frameTimeMs: 75,
      hasFrameTimeSample: false,
      drawCalls: 3,
      warnings: 1
    });
    expect(frameMetric(makeProfiler(() => model.snapshot()))).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it("rejects invalid values or sample flags without replacing the previous snapshot", () => {
    const model = new DiagnosticsOverlayModel();
    const previous = model.update({ ...legacyInput, frameTimeMs: 5 });
    for (const frameTimeMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => model.update({ ...legacyInput, frameTimeMs })).toThrow(/frame time/);
      expect(model.snapshot()).toBe(previous);
    }
    for (const flag of [null, "true", 1]) {
      expect(() => model.update({ ...legacyInput, hasFrameTimeSample: flag as never })).toThrow(/sample status/);
      expect(model.snapshot()).toBe(previous);
    }
  });

  it("leaves telemetry unavailable when no renderer submitted a frame", () => {
    const clock = { value: 100 };
    const { viewport, runtime } = makeViewport(undefined, clock);
    runtime.updateDiagnostics({ ...legacyInput, frameTimeMs: 27 });
    Object.assign(viewport, { syncTextureAssets: () => { clock.value += 900; } });

    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false });
    expect(frameMetric(makeProfiler(() => runtime.diagnosticsSnapshot()))).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it("propagates the measured viewport elapsed time for zero and slow renderer submissions", () => {
    const clock = { value: 100 };
    let renderDuration = 0;
    const render = vi.fn(() => {
      clock.value += renderDuration;
      return healthyDiagnostics;
    });
    const { viewport, runtime } = makeViewport({ render }, clock);
    const panel = makeProfiler(() => runtime.diagnosticsSnapshot());

    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: true });
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "0.00 ms" });

    Object.assign(viewport, { syncTextureAssets: () => { clock.value += 5; } });
    renderDuration = 142.25;
    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 147.25, hasFrameTimeSample: true });
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "147.25 ms" });

    renderDuration = 204.5;
    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 209.5, hasFrameTimeSample: true });
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "209.50 ms" });
    expect(render).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["missing context status", { ...healthyDiagnostics, contextLost: undefined }],
    ["missing error status", { ...healthyDiagnostics, lastError: undefined }],
    ["lost context", { ...healthyDiagnostics, contextLost: true }],
    ["renderer error", { ...healthyDiagnostics, lastError: "render failed" }],
    ["missing diagnostics", undefined]
  ])("fails closed when renderer evidence has %s", (_case, diagnostics) => {
    const clock = { value: 5 };
    const { viewport, runtime } = makeViewport({ render: () => { clock.value += 80; return diagnostics; } }, clock);
    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false });
    expect(frameMetric(makeProfiler(() => runtime.diagnosticsSnapshot()))).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 49])("fails closed for an invalid elapsed clock value (%s)", (end) => {
    const clock = { value: 50 };
    const { viewport, runtime } = makeViewport({ render: () => { clock.value = end; return healthyDiagnostics; } }, clock);
    viewport.render();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false });
  });

  it.each(["preparation", "render"])("invalidates the previous sample before a failed %s", (stage) => {
    const clock = { value: 50 };
    const renderer = { render: () => {
      if (stage === "render") throw new Error("render failed");
      return healthyDiagnostics;
    } };
    const { viewport, runtime, notifyViewportFrame } = makeViewport(renderer, clock);
    runtime.updateDiagnostics({ ...legacyInput, frameTimeMs: 11 });
    const panel = makeProfiler(() => runtime.diagnosticsSnapshot());
    expect(frameMetric(panel)).toEqual({ status: "measured", value: "11.00 ms" });
    notifyViewportFrame.mockImplementation(() => panel.render());
    if (stage === "preparation") {
      Object.assign(viewport, { syncTextureAssets: () => { throw new Error("preparation failed"); } });
    }
    expect(() => viewport.render()).toThrow(`${stage} failed`);
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 11, hasFrameTimeSample: false });
    expect(notifyViewportFrame).toHaveBeenCalledOnce();
    expect(readFrameMetric(panel)).toEqual({ status: "unavailable", value: "Unavailable" });
  });

  it("invalidates a sample if overlay work fails and preserves the frame error if notification also fails", () => {
    const clock = { value: 10 };
    const { viewport, runtime, notifyViewportFrame } = makeViewport({ render: () => healthyDiagnostics }, clock);
    runtime.updateDiagnostics({ ...legacyInput, frameTimeMs: 11 });
    Object.assign(viewport, { drawOverlay: () => { throw new Error("overlay failed"); } });
    notifyViewportFrame.mockImplementation(() => { throw new Error("notification failed"); });

    expect(() => viewport.render()).toThrow("overlay failed");
    expect(notifyViewportFrame).toHaveBeenCalledOnce();
    expect(runtime.diagnosticsSnapshot()).toMatchObject({ frameTimeMs: 0, hasFrameTimeSample: false });
  });
});
