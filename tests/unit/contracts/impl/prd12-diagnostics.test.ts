import { describe, expect, it } from "vitest";
import * as contracts from "@aura3d/engine/contracts";
import * as engine from "@aura3d/engine";

const SECTIONS = contracts.diagnosticsSectionsAll();
const appliedLook = SECTIONS.find((section) => section.key === "appliedLook");
const frameTiming = SECTIONS.find((section) => section.key === "frameTiming");

function fakeApp(diagnosticsState: unknown, scene: object): never {
  return {
    scene,
    diagnostics: () => diagnosticsState
  } as never;
}

describe("PRD-12 T1.14 C-31 sections (appliedLook, frameTiming)", () => {
  it("registers both sections from the lane barrel, owned by prd12", () => {
    expect(appliedLook).toBeDefined();
    expect(frameTiming).toBeDefined();
    expect(appliedLook!.owner).toBe("prd12");
    expect(frameTiming!.owner).toBe("prd12");
    expect(contracts.DIAGNOSTICS_SECTION_KEYS).toContain("appliedLook");
    expect(contracts.DIAGNOSTICS_SECTION_KEYS).toContain("frameTiming");
  });

  it("appliedLook collects from real renderer diagnostics without constants", () => {
    const snapshot = { background: "#10151f", nodes: [], camera: { mode: "orbit" }, diagnostics: { enabled: false } };
    const state = engine.createInitialDiagnostics(snapshot as never);
    const report = appliedLook!.collect(fakeApp(engine.snapshotDiagnostics(state), snapshot));
    expect(report).not.toBeNull();
    const look = report as Record<string, unknown>;
    expect(typeof look.exposure).toBe("number");
    expect(["aces-filmic", "agx", "neutral", "reinhard", "none"]).toContain(look.toneMapping);
    const environment = look.environment as Record<string, unknown>;
    expect(["color", "hdri", "sky"]).toContain(environment.background);
    expect(typeof look.fallbackLightsActive).toBe("boolean");
    expect(["production", "safe-basic", "lean", "compat-preset"]).toContain(look.renderPath);
    expect(typeof look.pixelRatio).toBe("number");
    // No authored lights in the snapshot: fallback lights are genuinely active.
    expect(look.fallbackLightsActive).toBe(true);
  });

  it("reports null where the source is absent — never a constant", () => {
    // App whose renderer diagnostics are missing entirely.
    const report = appliedLook!.collect(fakeApp({}, { nodes: [] }));
    expect(report).toBeNull();
  });

  it("never throws on a disposed app", () => {
    const disposed = {
      scene: { nodes: [] },
      diagnostics: () => {
        throw new Error("Aura3D app is disposed.");
      }
    } as never;
    expect(() => appliedLook!.collect(disposed)).not.toThrow();
    expect(appliedLook!.collect(disposed)).toBeNull();
    expect(() => frameTiming!.collect(disposed)).not.toThrow();
  });

  it("frameTiming is null headless (no rAF) — no fabricated numbers", () => {
    const report = frameTiming!.collect(fakeApp({}, { nodes: [] }));
    // In a browser-less run there is no requestAnimationFrame to sample.
    if (typeof requestAnimationFrame !== "function") {
      expect(report).toBeNull();
    } else if (report !== null) {
      const timing = report as Record<string, unknown>;
      expect(["rAF", "gpu-timer-query"]).toContain(timing.source);
      expect(timing.frames as number).toBeGreaterThanOrEqual(0);
    }
  });
});
