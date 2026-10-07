/**
 * material-diagnostics.test.ts — PRD-04 P2-5 (C-31) + P2-14 (option coverage).
 *
 * `collectPrd04MaterialDiagnostics` fills `AuraMaterialDiagnostics` from flag state and
 * the shared texture-budget ledger; program counters stay 0 behind the measured-or-
 * pending `material-program-pending` issue. `registerPrd04OptionCoverage` registers the
 * five C-15 rows P2 wired.
 */
import { afterEach, describe, expect, it } from "vitest";
import { collectPrd04MaterialDiagnostics } from "../../../../packages/engine/src/production-runtime/actor/materialDiagnostics";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import {
  DIAGNOSTIC_ONLY_PRD04_FIELDS,
  registerPrd04OptionCoverage
} from "../../../../packages/engine/src/agent-api/compiler/diagnosticOnly.prd04";
import { optionCoverageRows } from "../../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true, A3D_QR_MATERIALS_KTX2: true } });
const FLAGS_OFF = resolveQrFlags({ options: {} });
const APP = {} as AuraApp;

afterEach(() => setTypedGLBActorQrFlags(FLAGS_OFF));

describe("collectPrd04MaterialDiagnostics", () => {
  it("reports r185 paths + tier budget under the flags", () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
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

  it("flag off reports legacy paths", () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const report = collectPrd04MaterialDiagnostics(APP);
    expect(report.paths.materialModel).toBe("legacy");
    expect(report.paths.transmission).toBe("off");
    expect(report.paths.ktx2).toBe("unavailable");
    expect(report.paths.tangents).toBe("derivative");
  });

  it("reads textureBudgetBytes from app.quality.settings when present", () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
    const app = { quality: { settings: { textureBudgetBytes: 256 * 1024 * 1024 } } } as unknown as AuraApp;
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
