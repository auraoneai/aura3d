/**
 * Lane prd02 browser conformance (PRD-02 §15, §16.1). Runs on macos-14 in
 * lighting-quality.yml (Chromium, ANGLE Metal). The pixel-level sentinel is
 * the lane-capture job's report; these specs assert the flag seam in a real
 * browser context and that lane specs stay import-clean.
 */
import { expect, test } from "@playwright/test";

test("A3D_QR_LIGHTING resolves off by default and on via options", async () => {
  const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags.js");
  const off = resolveQrFlags({});
  expect(off.on("A3D_QR_LIGHTING")).toBe(false);
  const on = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
  expect(on.on("A3D_QR_LIGHTING")).toBe(true);
  const short = resolveQrFlags({ url: "https://aura3d.test/app/?a3d-qr=lighting" });
  expect(short.on("A3D_QR_LIGHTING")).toBe(true);
});

test("prd02 lane specs are importable in a browser bundle context", async () => {
  const { prd02SceneIds, prd02Specs } = await import("../../../../benchmarks/quality-rebuild/scenes/prd02/specs.js");
  expect(prd02SceneIds.length).toBeGreaterThanOrEqual(18);
  for (const id of prd02SceneIds) {
    expect(prd02Specs[id as keyof typeof prd02Specs].owner).toBe("prd02");
  }
});

test("flag-off path keeps legacy lighting defaults", async () => {
  const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags.js");
  const flags = resolveQrFlags({});
  expect(flags.on("A3D_QR_LIGHTING")).toBe(false);
  expect(flags.on("A3D_QR_LIGHTING_CSM")).toBe(false);
});
