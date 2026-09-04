import { describe, expect, it } from "vitest";
import {
  ensureCompressedTextureSupport,
  evaluateDistancePrioritizedMipResidency,
  resolveAnisotropyRequest
} from "../../../packages/assets/src";

describe("M2 one-call decoder setup", () => {
  it("confirms only probed decoders and selects a GPU-supported KTX2 target", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true, meshopt: true, ktx2: true, targetFormat: "astc-4x4-rgba-unorm" },
      {
        dracoAvailable: true,
        meshoptAvailable: false,
        ktx2Available: true,
        gpuCompressedFormats: ["etc2-rgba8unorm", "bc3-rgba-unorm"]
      }
    );
    expect(diagnostics.schema).toBe("a3d-compressed-texture-support");
    expect(diagnostics.draco).toMatchObject({ requested: true, available: true });
    // Meshopt was requested but no probe confirmed it: fail-closed, never success.
    expect(diagnostics.meshopt).toMatchObject({ requested: true, available: false });
    expect(diagnostics.meshopt.detail).toMatch(/fail closed/);
    // ASTC requested but absent from the GPU list: falls back to a listed target.
    expect(diagnostics.chosenKtx2Target).toBe("etc2-rgba8unorm");
  });

  it("fails closed on every decoder when no probe confirms anything", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true, meshopt: true, ktx2: true },
      { dracoAvailable: false, meshoptAvailable: false, ktx2Available: false }
    );
    expect(diagnostics.draco.available).toBe(false);
    expect(diagnostics.meshopt.available).toBe(false);
    expect(diagnostics.ktx2.available).toBe(false);
    expect(diagnostics.chosenKtx2Target).toBe("rgba8");
  });

  it("accepts thunk probes for live browser checks", async () => {
    const diagnostics = await ensureCompressedTextureSupport(
      { draco: true },
      { dracoAvailable: async () => true, ktx2Available: false }
    );
    expect(diagnostics.draco.available).toBe(true);
  });
});

describe("M2 distance-prioritized mip residency", () => {
  const candidates = [
    { id: "near", distanceMeters: 2, mipBytesCoarseToFine: [16, 64, 256] },
    { id: "mid", distanceMeters: 10, mipBytesCoarseToFine: [16, 64, 256] },
    { id: "far", distanceMeters: 40, mipBytesCoarseToFine: [16, 64, 256] }
  ];

  it("funds coarsest levels for all before refining nearest-first", () => {
    // 3 coarsest (48) + near refine (64) + mid refine (64) = 176; far refine (64) does not fit in 200.
    const residency = evaluateDistancePrioritizedMipResidency(candidates, 200);
    expect(residency.schema).toBe("a3d-texture-streaming-residency");
    const levels = new Map(residency.residents.map((resident) => [resident.id, resident.residentLevels]));
    expect(levels.get("near")).toBe(2);
    expect(levels.get("mid")).toBe(2);
    expect(levels.get("far")).toBe(1);
    expect(residency.evicted).toEqual([]);
    expect(residency.usedBytes).toBe(176);
    expect(residency.overBudget).toBe(true);
    expect(residency.overBudgetBytes).toBe(residency.requestedBytes - 176);
  });

  it("evicts farthest-first when the budget cannot cover every coarsest level", () => {
    const residency = evaluateDistancePrioritizedMipResidency(candidates, 40);
    const levels = new Map(residency.residents.map((resident) => [resident.id, resident.residentLevels]));
    expect(levels.get("near")).toBe(1);
    expect(levels.get("mid")).toBe(1);
    expect(levels.get("far")).toBe(0);
    expect(residency.evicted).toEqual(["far"]);
  });

  it("reports no over-budget telemetry when everything fits", () => {
    const residency = evaluateDistancePrioritizedMipResidency(candidates, 10_000);
    expect(residency.overBudget).toBe(false);
    expect(residency.overBudgetBytes).toBe(0);
    expect(residency.evicted).toEqual([]);
    for (const resident of residency.residents) expect(resident.residentLevels).toBe(3);
  });
});

describe("M2 capability-gated anisotropy", () => {
  it("defaults to 4x where supported", () => {
    expect(resolveAnisotropyRequest({ maxSupported: 16 })).toMatchObject({ applied: 4, capped: false });
  });

  it("gates 8x/16x opt-ins behind the capability probe", () => {
    expect(resolveAnisotropyRequest({ desired: 16, maxSupported: 16 }).applied).toBe(16);
    const capped = resolveAnisotropyRequest({ desired: 16, maxSupported: 4 });
    expect(capped).toMatchObject({ applied: 4, capped: true });
    expect(capped.detail).toMatch(/supports 4x/);
  });

  it("folds to 1x when the device reports no support", () => {
    expect(resolveAnisotropyRequest({ desired: 8, maxSupported: 1 }).applied).toBe(1);
    expect(resolveAnisotropyRequest({ desired: 8 }).applied).toBe(1);
  });
});
