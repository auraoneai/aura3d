// 07 Phase D §22.5 — C-20 burst conformance, stub and REAL provider
// (CONTRACTS C-20: "burst gives instancesDrawn > 0 and a non-empty diff
// region"). Lane-owned home for the custodian-named
// tests/browser/contracts/C-20-burst.spec.ts (that directory is lane 15's);
// runs in prd07-vfx.yml `browser` on macos-14 (ANGLE Metal).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_C20__?: {
      readonly status: "ready" | "error";
      readonly provided?: boolean;
      readonly resolved?: "stub" | "real";
      readonly upsert?: string;
      readonly instancesDrawn?: number;
      readonly maxChangedFraction?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

async function run(page: import("@playwright/test").Page, origin: string, query: string) {
  await page.goto(`${origin}/tests/qr/prd07/browser/C-20-burst-harness.html${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__QR_PRD07_C20__?.status === "ready" || window.__QR_PRD07_C20__?.status === "error", undefined, { timeout: 90_000 });
  return page.evaluate(() => window.__QR_PRD07_C20__);
}

test.describe("C-20 burst conformance", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("real (flags vfx): provider resolves, burst draws instances and changes pixels", async ({ page }) => {
    const r = await run(page, server.origin, "?a3d-qr=vfx");
    expect(r?.status, r?.error).toBe("ready");
    expect(r?.provided).toBe(true);
    expect(r?.resolved).toBe("real");
    expect(r?.upsert).toBe("handle");
    expect(r?.instancesDrawn ?? 0).toBeGreaterThan(0);
    expect(r?.maxChangedFraction ?? 0).toBeGreaterThan(0);
    expect(r?.errors ?? []).toEqual([]);
  });

  test("stub (flags none): slot resolves to the PR 0a stub, which throws PARTICLE_PASS_PENDING", async ({ page }) => {
    const r = await run(page, server.origin, "");
    expect(r?.status, r?.error).toBe("ready");
    expect(r?.resolved).toBe("stub");
    expect(r?.upsert).toBe("PARTICLE_PASS_PENDING");
    expect(r?.instancesDrawn ?? 0).toBe(0);
  });
});
