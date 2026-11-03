/**
 * material-diagnostics.test.ts — PRD-04 P2-5 (C-31) + P2-14 (option coverage).
 *
 * `collectPrd04MaterialDiagnostics` fills `AuraMaterialDiagnostics` from app-owned flags,
 * actors and the renderer device's texture-budget ledger; program counters come from the live renderer's C-02
 * program cache (04-S15) and stay 0 behind `material-program-pending` only when no cache is
 * reachable. `registerPrd04OptionCoverage` registers the
 * five C-15 rows P2 wired.
 */
import { afterEach, describe, expect, it } from "vitest";
import { collectPrd04MaterialDiagnostics } from "../../../../packages/engine/src/production-runtime/actor/materialDiagnostics";
import { actorAnimationContextFor, resetQrAnimationFlags, setQrAnimationFlags } from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { applyTextureBudget, releaseTextureBudget } from "../../../../packages/rendering/src/textures/TextureBudget";
import {
  DIAGNOSTIC_ONLY_PRD04_FIELDS,
  registerPrd04OptionCoverage
} from "../../../../packages/engine/src/agent-api/compiler/diagnosticOnly.prd04";
import { optionCoverageRows } from "../../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { rendererProgramCache } from "../../../../packages/rendering/src/renderer/qrSubFlags";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true, A3D_QR_MATERIALS_KTX2: true } });
const FLAGS_OFF = resolveQrFlags({ options: { A3D_QR_MATERIALS: false } }); // explicit: materials is default-on
const APP = {} as AuraApp;

afterEach(() => resetQrAnimationFlags(APP));

describe("collectPrd04MaterialDiagnostics", () => {
  it("reports r185 paths + tier budget under the flags", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    const report = collectPrd04MaterialDiagnostics(APP);
    expect(report.paths).toEqual({
      materialModel: "physical-r185",
      transmission: "auto",
      ktx2: "basis",
      tangents: "mikktspace"
    });
    expect(report.programs).toBe(0);
    expect(report.programCompileMs).toBe(0);
    expect(report.transmissionTargetActive).toBe(false);
    expect(report.lightsDroppedByMaterial).toBe(0);
    expect(report.issues.some((issue) => issue.code === "material-program-pending")).toBe(true);
    expect(typeof report.textureBytes).toBe("number");
  });

  it("reads program count + compile ms from the live renderer program cache (04-S15)", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    const device = {} as Parameters<typeof rendererProgramCache>[0];
    const cache = rendererProgramCache(device, FLAGS_ON as Parameters<typeof rendererProgramCache>[1]);
    const stats = { compiled: 7, pending: 0, failed: 0, compileMsTotal: 42.5 };
    const realStats = cache.stats.bind(cache);
    (cache as { stats: () => typeof stats }).stats = () => stats;
    try {
      const app = { [Symbol.for("a3d.prd01.renderer")]: { device } } as unknown as AuraApp;
      setQrAnimationFlags(FLAGS_ON, app);
      const report = collectPrd04MaterialDiagnostics(app);
      expect(report.programs).toBe(7);
      expect(report.programCompileMs).toBe(42.5);
      expect(report.issues.some((issue) => issue.code === "material-program-pending")).toBe(false);
    } finally {
      (cache as { stats: typeof realStats }).stats = realStats;
    }
  });

  it("a renderer seam without a created cache stays pending (peek never creates one)", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    const app = { [Symbol.for("a3d.prd01.renderer")]: { device: {} } } as unknown as AuraApp;
    setQrAnimationFlags(FLAGS_ON, app);
    const report = collectPrd04MaterialDiagnostics(app);
    expect(report.programs).toBe(0);
    expect(report.issues.some((issue) => issue.code === "material-program-pending")).toBe(true);
  });

  it("uses only the owning renderer's current view snapshots and clears old issues", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    let viewsA: Array<{ targetActive: boolean; issues: string[] }> = [
      { targetActive: true, issues: ["transmission-ldr-capture"] },
      { targetActive: false, issues: ["transmission-ldr-capture"] }
    ];
    let viewsB: Array<{ targetActive: boolean; issues: string[] }> = [
      { targetActive: false, issues: ["TRANSMISSION_SOURCE_UNAVAILABLE"] }
    ];
    const appA = { [Symbol.for("a3d.prd01.renderer")]: { transmissionDiagnostics: () => viewsA } } as unknown as AuraApp;
    const appB = { [Symbol.for("a3d.prd01.renderer")]: { transmissionDiagnostics: () => viewsB } } as unknown as AuraApp;
    setQrAnimationFlags(FLAGS_ON, appA);
    setQrAnimationFlags(FLAGS_ON, appB);
    const a = collectPrd04MaterialDiagnostics(appA);
    const b = collectPrd04MaterialDiagnostics(appB);
    expect(a.transmissionTargetActive).toBe(true);
    expect(a.issues.filter((issue) => issue.code === "transmission-ldr-capture")).toHaveLength(1);
    expect(a.issues.some((issue) => issue.code === "TRANSMISSION_SOURCE_UNAVAILABLE")).toBe(false);
    expect(b.transmissionTargetActive).toBe(false);
    expect(b.issues.some((issue) => issue.code === "TRANSMISSION_SOURCE_UNAVAILABLE")).toBe(true);
    expect(b.issues.some((issue) => issue.code === "transmission-ldr-capture")).toBe(false);

    viewsA = [{ targetActive: false, issues: [] }];
    const next = collectPrd04MaterialDiagnostics(appA);
    expect(next.transmissionTargetActive).toBe(false);
    expect(next.issues.some((issue) => issue.code === "transmission-ldr-capture")).toBe(false);
    viewsB = [];
    const retired = collectPrd04MaterialDiagnostics(appB);
    expect(retired.transmissionTargetActive).toBe(false);
    expect(retired.issues.some((issue) => issue.code === "transmission-diagnostics-pending")).toBe(true);
    expect(retired.issues.some((issue) => issue.code === "TRANSMISSION_SOURCE_UNAVAILABLE")).toBe(false);
  });

  it("reports a missing per-app transmission snapshot instead of reading a global capture", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    const report = collectPrd04MaterialDiagnostics(APP);
    expect(report.transmissionTargetActive).toBe(false);
    expect(report.issues.some((issue) => issue.code === "transmission-diagnostics-pending")).toBe(true);
  });

  it("isolates material flags, actor warnings and texture budgets per app", () => {
    const deviceA = new MockRenderDevice(), deviceB = new MockRenderDevice();
    const appA = { [Symbol.for("a3d.prd01.renderer")]: { device: deviceA } } as unknown as AuraApp;
    const appB = { [Symbol.for("a3d.prd01.renderer")]: { device: deviceB } } as unknown as AuraApp;
    setQrAnimationFlags(FLAGS_ON, appA);
    setQrAnimationFlags(FLAGS_OFF, appB);
    const textureA = { width: 2, height: 2, format: "rgba8" as const, generateMipmaps: false, data: new Uint8Array(16) };
    const textureB = { width: 1, height: 1, format: "rgba8" as const, generateMipmaps: false, data: new Uint8Array(4) };
    applyTextureBudget(textureA, {}, deviceA);
    applyTextureBudget(textureB, {}, deviceB);
    const actorsA = actorAnimationContextFor(appA).state.actors;
    const actorsB = actorAnimationContextFor(appB).state.actors;
    actorsA.set("a", { inspectMaterials: () => [{ name: "material-a", warnings: ["warning-a:detail"] }] } as never);
    actorsB.set("b", { inspectMaterials: () => [{ name: "material-b", warnings: ["warning-b:detail"] }] } as never);
    try {
      const a = collectPrd04MaterialDiagnostics(appA), b = collectPrd04MaterialDiagnostics(appB);
      expect(a.paths.materialModel).toBe("physical-r185");
      expect(b.paths.materialModel).toBe("legacy");
      expect([a.textureBytes, b.textureBytes]).toEqual([16, 4]);
      expect(a.issues.some((issue) => issue.code === "warning-a")).toBe(true);
      expect(a.issues.some((issue) => issue.code === "warning-b")).toBe(false);
      expect(b.issues.some((issue) => issue.code === "warning-b")).toBe(true);
      expect(b.issues.some((issue) => issue.code === "warning-a")).toBe(false);
    } finally {
      actorsA.clear(); actorsB.clear();
      releaseTextureBudget(textureA, deviceA); releaseTextureBudget(textureB, deviceB);
      deviceA.dispose(); deviceB.dispose();
    }
  });

  it("flag off reports legacy paths", () => {
    setQrAnimationFlags(FLAGS_OFF, APP);
    const report = collectPrd04MaterialDiagnostics(APP);
    expect(report.paths.materialModel).toBe("legacy");
    expect(report.paths.transmission).toBe("off");
    expect(report.paths.ktx2).toBe("unavailable");
    expect(report.paths.tangents).toBe("derivative");
  });

  it("reads textureBudgetBytes from app.quality.settings when present", () => {
    setQrAnimationFlags(FLAGS_ON, APP);
    const app = { quality: { settings: { textureBudgetBytes: 256 * 1024 * 1024 } } } as unknown as AuraApp;
    setQrAnimationFlags(FLAGS_ON, app);
    expect(collectPrd04MaterialDiagnostics(app).textureBudgetBytes).toBe(256 * 1024 * 1024);
  });
});

describe("registerPrd04OptionCoverage (P2-14)", () => {
  it("registers the five C-15 coverage rows", () => {
    registerPrd04OptionCoverage();
    const rows = optionCoverageRows();
    for (const field of ["material.color", "materialOverrides"]) {
      expect(rows.some((row) => row.builder === "model" && row.field === field && row.ownerPrd === 4), `model.${field}`).toBe(true);
    }
    for (const field of ["sampling.wrap", "sampling.anisotropy", "alphaMode"]) {
      expect(rows.some((row) => row.builder === "material" && row.field === field && row.ownerPrd === 4), `material.${field}`).toBe(true);
    }
  });

  it("keeps only the still-unconsumed diagnostic-only fields", () => {
    expect(Object.keys(DIAGNOSTIC_ONLY_PRD04_FIELDS).sort()).toEqual([
      "material.alphaToCoverage",
      "material.doubleSided",
      "material.unlit"
    ]);
    for (const entry of Object.values(DIAGNOSTIC_ONLY_PRD04_FIELDS)) {
      expect(entry.ownerPrd).toBe(4);
    }
  });
});
