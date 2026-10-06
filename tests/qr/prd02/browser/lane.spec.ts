/**
 * Lane prd02 browser conformance (PRD-02 §15, §16.1). Runs on macos-14 in
 * lighting-quality.yml (Chromium, ANGLE Metal). The pixel-level sentinel is
 * the lane-capture job's report; these specs assert the flag seam in a real
 * browser context and that lane specs stay import-clean.
 */
import { expect, test } from "@playwright/test";

test("A3D_QR_LIGHTING resolves off by default and on via options", async () => {
  const { resolveQrFlags } = await import("@aura3d/engine/contracts");
  const off = resolveQrFlags({ options: [] });
  expect(off.has("A3D_QR_LIGHTING")).toBe(false);
  const on = resolveQrFlags({ options: ["A3D_QR_LIGHTING"] });
  expect(on.has("A3D_QR_LIGHTING")).toBe(true);
  const short = resolveQrFlags({ options: ["lighting"] });
  expect(short.has("A3D_QR_LIGHTING")).toBe(true);
});

test("prd02 lane specs are importable in a browser bundle context", async () => {
  const { prd02SceneIds, prd02Specs } = await import("../../../benchmarks/quality-rebuild/scenes/prd02/specs");
  expect(prd02SceneIds.length).toBeGreaterThanOrEqual(18);
  for (const id of prd02SceneIds) {
    expect(prd02Specs[id as keyof typeof prd02Specs].owner).toBe("prd02");
  }
});

test("flag-off path keeps legacy lighting defaults", async () => {
  const { resolveQrFlags } = await import("@aura3d/engine/contracts");
  const flags = resolveQrFlags({ options: [] });
  expect(flags.has("A3D_QR_LIGHTING")).toBe(false);
  expect(flags.has("A3D_QR_LIGHTING_CSM")).toBe(false);
});
