// [QR-04] materials output reaches the renderer. `suite=promote promote_flag=materials`
// scored byte-identical frames because (a) every prd04 lane scene was quarantined
// `missing-adapter` (adapter files are named by full id, `prd04/prd04-<slug>.ts`, and
// the registry only looked for `prd04/<slug>.ts`), so the lane's KHR_materials_* scenes
// were never captured; and (b) the per-scene page adapters dropped `opts.qrFlags`, so
// even a captured flag arm rendered flags-off.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVE_SCENE_IDS, REGISTRY, laneAdapterModulePath } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { scenes as prd04Scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd04/index";

const ROOT = resolve(__dirname, "../../../..");

describe("prd04 lane scenes are active in the benchmark registry", () => {
  for (const registration of prd04Scenes) {
    it(`${registration.id} is active and listed in __QR_SCENES__`, () => {
      const entry = REGISTRY.find((candidate) => candidate.id === registration.id);
      expect(entry, `${registration.id} missing from REGISTRY`).toBeDefined();
      expect(entry!.status, `${registration.id}: ${entry!.quarantineReason ?? ""}`).toBe("active");
      expect(ACTIVE_SCENE_IDS).toContain(registration.id);
    });
  }

  it("resolves full-id adapter files for main.ts", () => {
    expect(laneAdapterModulePath("aura3d", "prd04-iridescence")).toBe("./aura3d/scenes/prd04/prd04-iridescence.ts");
    expect(laneAdapterModulePath("three", "prd04-iridescence")).toBe("./three/scenes/prd04/prd04-iridescence.ts");
    // Slug-named lanes keep their slug path.
    expect(laneAdapterModulePath("aura3d", "prd12-skinned-character-walk")).toBe("./aura3d/scenes/prd12/skinned-character-walk.ts");
  });
});

describe("prd04 assets ship with the built bench page", () => {
  it("every prd04 asset is in the served /qr-assets/ table", async () => {
    const { benchmarkAssetFiles } = await import("../../../../benchmarks/quality-rebuild/shared/assets");
    const { prd04AssetFiles } = await import("../../../../benchmarks/quality-rebuild/scenes/prd04/assets");
    const served = new Set(benchmarkAssetFiles().map((f) => `${f.repoPath}=>${f.url}`));
    for (const file of prd04AssetFiles()) {
      expect(file.url.startsWith("/qr-assets/"), file.url).toBe(true);
      expect(served.has(`${file.repoPath}=>${file.url}`), file.repoPath).toBe(true);
    }
  });

  it("ci.sh fetches every prd04 LFS blob", async () => {
    const { prd04ModelAssets } = await import("../../../../benchmarks/quality-rebuild/scenes/prd04/assets");
    const ci = readFileSync(resolve(ROOT, "benchmarks/quality-rebuild/ci.sh"), "utf8");
    for (const entry of Object.values(prd04ModelAssets)) {
      if (entry.lfs) expect(ci, entry.repoPath).toContain(entry.repoPath);
    }
  });
});

describe("prd04 page adapters forward the page's qrFlags", () => {
  for (const registration of prd04Scenes) {
    it(`${registration.id} passes opts.qrFlags to runPrd04AuraScene`, () => {
      const path = laneAdapterModulePath("aura3d", registration.id)!;
      const source = readFileSync(resolve(ROOT, "benchmarks/quality-rebuild", path), "utf8");
      expect(source).toMatch(/runPrd04AuraScene\([^)]*\), host, opts\?\.qrFlags \?\? \[\]\)/);
    });
  }

  it("the adapter hands the flag list through to the run (materials arm is not flags-off)", async () => {
    const calls: unknown[][] = [];
    const vi = await import("vitest").then((m) => m.vi);
    vi.doMock("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd04/common", () => ({
      runPrd04AuraScene: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({});
      }
    }));
    const mod = await import("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd04/prd04-iridescence");
    await mod.default({} as HTMLElement, { qrFlags: ["materials"] });
    await mod.default({} as HTMLElement);
    vi.doUnmock("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd04/common");
    expect(calls[0]?.[2]).toEqual(["materials"]);
    expect(calls[1]?.[2]).toEqual([]);
  });
});
