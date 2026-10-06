/**
 * Lane-01 Phase-5 output surface tests (vitest): the C-05 surface forwards
 * `setOutput`/`setOutputOverlay` to the live Renderer through the Q-15-1
 * `PRD01_RENDERER` seam under `A3D_QR_CORE_OUTPUT`, queues intent until the
 * async mount attaches it, and keeps the flag-off record-only/DOM-fallback
 * behavior. `readAura3dTonemapQuery` powers the `?aura3d-tonemap` game opt-in.
 */

import { describe, expect, it, vi } from "vitest";

import { createPrd01OutputSurface, readAura3dTonemapQuery } from "../../../../packages/engine/src/lanes/prd01/outputSurface";
import { PRD01_OUTPUT_STATE } from "../../../../packages/engine/src/lanes/prd01/diagnostics";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraApp, AuraCreateAppOptions } from "@aura3d/engine";

const PRD01_RENDERER = Symbol.for("a3d.prd01.renderer");

interface FakeRenderer {
  readonly calls: { readonly setOutput: unknown[]; readonly overlay: unknown[] };
  setOutput(options: unknown): void;
  setOutputOverlay(overlay: unknown): void;
  readonly appliedOutput: null;
}

function makeRenderer(): FakeRenderer {
  const calls = { setOutput: [] as unknown[], overlay: [] as unknown[] };
  return {
    calls,
    appliedOutput: null,
    setOutput(options) {
      calls.setOutput.push(options);
    },
    setOutputOverlay(overlay) {
      calls.overlay.push(overlay);
    }
  };
}

function makeApp(overrides: Record<PropertyKey, unknown> = {}): AuraApp {
  return {
    screenshot: () => ({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 1, height: 1 }),
    diagnostics: () => ({ errors: [], degradations: [] }),
    step: () => 0,
    dispose: () => {},
    ...overrides
  } as unknown as AuraApp;
}

function ctxWith(flags: "off" | "v2" | "sub-off" = "v2", options: Partial<AuraCreateAppOptions> = {}) {
  const a3dQr = flags === "off" ? "none" : flags === "sub-off" ? "core,-core_output" : "core";
  return {
    flags: resolveQrFlags({ url: `http://localhost/?a3d-qr=${a3dQr}` }),
    options: options as AuraCreateAppOptions
  };
}

describe("prd01 output surface (Phase 5)", () => {
  it("reads ?aura3d-tonemap / ?aura3d-exp with tm/exp aliases", () => {
    expect(readAura3dTonemapQuery("?aura3d-tonemap=agx&aura3d-exp=0.5")).toEqual({ toneMapping: "agx", exposure: 0.5 });
    expect(readAura3dTonemapQuery("?tm=aces&exp=2")).toEqual({ toneMapping: "aces", exposure: 2 });
    expect(readAura3dTonemapQuery("?aura3d-tonemap=bogus&aura3d-exp=abc")).toEqual({});
    expect(readAura3dTonemapQuery("?unrelated=1")).toEqual({});
  });

  it("forwards setOutput through the renderer seam under the flag", () => {
    const renderer = makeRenderer();
    const app = makeApp({ [PRD01_RENDERER]: renderer });
    const surface = createPrd01OutputSurface(app, ctxWith());
    surface.setOutput({ toneMapping: "agx", exposure: 2, dither: true, backgroundPassthrough: true });
    expect(renderer.calls.setOutput).toEqual([{ toneMapping: "agx", exposure: 2, dithering: true, backgroundCoverage: true }]);
    const snapshot = surface[PRD01_OUTPUT_STATE]!.snapshot();
    expect(snapshot.implementation).toBe("real");
    expect(snapshot.applied).toMatchObject({ toneMapping: "agx", exposure: 2 });
  });

  it("queues setOutput until PRD01_RENDERER attaches, then flushes at capture", async () => {
    const app = makeApp();
    const surface = createPrd01OutputSurface(app, ctxWith());
    surface.setOutput({ toneMapping: "agx" });
    const snapshot = surface[PRD01_OUTPUT_STATE]!.snapshot();
    expect(snapshot.implementation).toBe("stub");
    expect(snapshot.applied).toEqual({});
    // Mount lands late: attach the seam, then capture() flushes pending intent.
    const renderer = makeRenderer();
    (app as unknown as Record<symbol, unknown>)[PRD01_RENDERER] = renderer;
    const shot = await surface.capture({ type: "png-blob" });
    expect(shot).toBeInstanceOf(Blob);
    expect(renderer.calls.setOutput).toEqual([{ toneMapping: "agx" }]);
    expect(surface[PRD01_OUTPUT_STATE]!.snapshot().implementation).toBe("real");
  });

  it("routes setOutputOverlay to the in-shader path under the flag", () => {
    const renderer = makeRenderer();
    const app = makeApp({ [PRD01_RENDERER]: renderer });
    const surface = createPrd01OutputSurface(app, ctxWith());
    const result = surface.setOutputOverlay({ flash: [1, 0, 0, 0.5] } as never);
    expect(result).toEqual({ applied: true });
    expect(renderer.calls.overlay).toEqual([
      { flash: [1, 0, 0, 0.5], vignette: [0, 0, 0, 0], shape: [0.7, 0.3], fade: [0, 0, 0, 0] }
    ]);
  });

  it("flag-off records intent only — no renderer calls, no seam lookup", () => {
    const renderer = makeRenderer();
    const app = makeApp({ [PRD01_RENDERER]: renderer });
    const surface = createPrd01OutputSurface(app, ctxWith("off"));
    surface.setOutput({ toneMapping: "agx", exposure: 2 });
    expect(renderer.calls.setOutput).toEqual([]);
    const snapshot = surface[PRD01_OUTPUT_STATE]!.snapshot();
    expect(snapshot.implementation).toBe("stub");
    expect(snapshot.requested).toMatchObject({ toneMapping: "agx", exposure: 2 });
    expect(snapshot.applied).toEqual({});
  });

  it("sub-flag off (core,-core_output) behaves like flag-off", () => {
    const renderer = makeRenderer();
    const app = makeApp({ [PRD01_RENDERER]: renderer });
    const surface = createPrd01OutputSurface(app, ctxWith("sub-off"));
    surface.setOutput({ toneMapping: "agx" });
    expect(renderer.calls.setOutput).toEqual([]);
    expect(surface[PRD01_OUTPUT_STATE]!.snapshot().implementation).toBe("stub");
  });
});
