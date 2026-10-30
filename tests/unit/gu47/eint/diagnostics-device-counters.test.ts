import { describe, expect, it } from "vitest";
import { scene, primitives } from "@aura3d/engine";
import {
  bindLazyFrameDiagnostics,
  createInitialDiagnostics,
  deviceFrameCounters,
  snapshotDiagnostics
} from "../../../../packages/engine/src/agent-api/diagnostics";

/**
 * GU47 eint ED-1 (E-D ED-7 handoff): `app.diagnostics().triangles` / `.textureBytes` report the lane Renderer's device
 * counters (`RenderDeviceDiagnostics.triangles`, the per-frame count `app.info.render.triangles` reads, and the live
 * `textureBytes` gauge). Read lazily: one device read per inspected frame, none for frames nobody inspects.
 */

function fakeAuraRenderer(values: { triangles: number; textureBytes: number }) {
  let reads = 0;
  return {
    renderer: { device: { getDiagnostics: () => { reads += 1; return { drawCalls: 3, ...values }; } } },
    reads: () => reads
  };
}

describe("GU47 eint ED-1: device counters in app.diagnostics()", () => {
  const snapshot = scene().add(primitives.box()).toJSON();

  it("deviceFrameCounters reads the lane Renderer's device; no device means no counters", () => {
    expect(deviceFrameCounters(fakeAuraRenderer({ triangles: 1200, textureBytes: 4096 }).renderer)).toEqual({ triangles: 1200, textureBytes: 4096 });
    expect(deviceFrameCounters(undefined)).toBeUndefined();
    expect(deviceFrameCounters({})).toBeUndefined();
    expect(deviceFrameCounters({ device: { getDiagnostics: () => ({ drawCalls: 1 }) } })).toEqual({});
  });

  it("the counters reach the snapshot, read once per inspected frame", () => {
    const state = createInitialDiagnostics(snapshot);
    const report = state.renderer;
    const evidence = state.evidence;
    const values = { triangles: 1200, textureBytes: 4096 };
    const fake = fakeAuraRenderer(values);
    let busy = false;
    const lazy = bindLazyFrameDiagnostics(state, {
      renderer: () => report,
      evidence: () => evidence,
      busy: () => busy,
      deviceCounters: () => deviceFrameCounters(fake.renderer)
    });
    const first = snapshotDiagnostics(state);
    expect(first.triangles).toBe(1200);
    expect(first.textureBytes).toBe(4096);
    expect(fake.reads()).toBe(1);
    snapshotDiagnostics(state);
    expect(fake.reads()).toBe(1);

    values.triangles = 2400;
    lazy.invalidate();
    // While an async frame is pending the last completed frame's value is served.
    busy = true;
    expect(snapshotDiagnostics(state).triangles).toBe(1200);
    busy = false;
    expect(snapshotDiagnostics(state).triangles).toBe(2400);
    expect(fake.reads()).toBe(2);

    lazy.freeze();
    values.triangles = 9999;
    lazy.invalidate();
    expect(snapshotDiagnostics(state).triangles).toBe(2400);
  });

  it("without a device source the keys stay absent (headless / mocked renderers)", () => {
    const state = createInitialDiagnostics(snapshot);
    const report = state.renderer;
    const evidence = state.evidence;
    bindLazyFrameDiagnostics(state, { renderer: () => report, evidence: () => evidence, busy: () => false });
    const snap = snapshotDiagnostics(state);
    expect(snap).not.toHaveProperty("triangles");
    expect(snap).not.toHaveProperty("textureBytes");
    const unmounted = createInitialDiagnostics(snapshot);
    bindLazyFrameDiagnostics(unmounted, { renderer: () => report, evidence: () => evidence, busy: () => false, deviceCounters: () => undefined });
    expect(snapshotDiagnostics(unmounted)).not.toHaveProperty("triangles");
  });
});
