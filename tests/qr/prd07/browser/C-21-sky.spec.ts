// 07 Phase D §22.5 — C-21 sky conformance, stub and REAL provider. Lane-owned
// home for the custodian-named tests/browser/contracts/C-21-sky.spec.ts (that
// directory is lane 15's); runs in prd07-vfx.yml `browser` on macos-14.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_C21__?: {
      readonly status: "ready" | "error";
      readonly provided?: boolean;
      readonly resolved?: "stub" | "real";
      readonly radianceLength?: number;
      readonly radianceMax?: number;
      readonly radianceFinite?: boolean;
      readonly skyLumaStd?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

async function run(page: import("@playwright/test").Page, origin: string, query: string) {
  await page.goto(`${origin}/tests/qr/prd07/browser/C-21-sky-harness.html${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__QR_PRD07_C21__?.status === "ready" || window.__QR_PRD07_C21__?.status === "error", undefined, { timeout: 90_000 });
  return page.evaluate(() => window.__QR_PRD07_C21__);
}

test.describe("C-21 sky conformance", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("real (flags vfx,vfx.sky): SkyBackgroundPass resolves, horizon radiance is non-zero, the sky is varied", async ({ page }) => {
    const r = await run(page, server.origin, "?a3d-qr=vfx,vfx.sky");
    expect(r?.status, r?.error).toBe("ready");
    expect(r?.provided).toBe(true);
    expect(r?.resolved).toBe("real");
    expect(r?.radianceLength).toBe(24);
    expect(r?.radianceFinite).toBe(true);
    expect(r?.radianceMax ?? 0).toBeGreaterThan(0);
    // Same bound as sky-background.spec.ts (> 6 std on the 8-bit sky region).
    expect(r?.skyLumaStd ?? 0).toBeGreaterThan(6);
    expect(r?.errors ?? []).toEqual([]);
  });

  test("stub (flags none): slot resolves to the PR 0a stub with zero horizon radiance", async ({ page }) => {
    const r = await run(page, server.origin, "");
    expect(r?.status, r?.error).toBe("ready");
    expect(r?.resolved).toBe("stub");
    expect(r?.radianceLength).toBe(3);
    expect(r?.radianceMax).toBe(0);
  });
});
