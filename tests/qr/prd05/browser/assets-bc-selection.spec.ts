/**
 * assets-bc-selection.spec.ts — PRD-05 browser gate (§15, 05-BROWSERS).
 *
 * Windows-latest BC-selection job: `selectKTX2TargetFormat` under mocked
 * capability sets. The s3tc mock mirrors what Windows/ANGLE (D3D11)
 * exposes natively — ETC1S sources select BC1/BC3 while UASTC RGBA falls
 * back to rgba8 (no BC7 under s3tc-only). Expectations mirror the
 * exhaustive truth table in tests/unit/assets/ktx2-target-format.table.json.
 * Pure-function page — no GPU required.
 */
import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { startPrd05DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

interface SelectionPayload {
  readonly capsName: string;
  readonly selections: readonly { readonly basis: string; readonly srgb: boolean; readonly alpha: boolean; readonly target: string }[];
}

const EXPECTED: Record<string, Record<string, string>> = {
  s3tc: {
    "uastc/srgb/a": "rgba8", "uastc/srgb/-": "rgba8", "uastc/linear/a": "rgba8", "uastc/linear/-": "rgba8",
    "etc1s/srgb/a": "bc3-rgba-unorm", "etc1s/srgb/-": "bc1-rgb-unorm",
    "etc1s/linear/a": "bc3-rgba-unorm", "etc1s/linear/-": "bc1-rgb-unorm"
  },
  astc: {
    "uastc/srgb/a": "astc-4x4-rgba-unorm", "uastc/srgb/-": "astc-4x4-rgba-unorm",
    "uastc/linear/a": "astc-4x4-rgba-unorm", "uastc/linear/-": "astc-4x4-rgba-unorm",
    "etc1s/srgb/a": "etc2-rgba8unorm", "etc1s/srgb/-": "etc2-rgb8unorm",
    "etc1s/linear/a": "etc2-rgba8unorm", "etc1s/linear/-": "etc2-rgb8unorm"
  },
  etc2: {
    "uastc/srgb/a": "etc2-rgba8unorm", "uastc/srgb/-": "etc2-rgba8unorm",
    "uastc/linear/a": "etc2-rgba8unorm", "uastc/linear/-": "etc2-rgba8unorm",
    "etc1s/srgb/a": "etc2-rgba8unorm", "etc1s/srgb/-": "etc2-rgb8unorm",
    "etc1s/linear/a": "etc2-rgba8unorm", "etc1s/linear/-": "etc2-rgb8unorm"
  },
  bptc: {
    "uastc/srgb/a": "bc7-rgba-unorm", "uastc/srgb/-": "bc7-rgba-unorm",
    "uastc/linear/a": "bc7-rgba-unorm", "uastc/linear/-": "bc7-rgba-unorm",
    "etc1s/srgb/a": "etc2-rgba8unorm", "etc1s/srgb/-": "etc2-rgb8unorm",
    "etc1s/linear/a": "etc2-rgba8unorm", "etc1s/linear/-": "etc2-rgb8unorm"
  },
  none: {
    "uastc/srgb/a": "rgba8", "uastc/srgb/-": "rgba8", "uastc/linear/a": "rgba8", "uastc/linear/-": "rgba8",
    "etc1s/srgb/a": "rgba8", "etc1s/srgb/-": "rgba8", "etc1s/linear/a": "rgba8", "etc1s/linear/-": "rgba8"
  }
};

const key = (s: { basis: string; srgb: boolean; alpha: boolean }) => `${s.basis}/${s.srgb ? "srgb" : "linear"}/${s.alpha ? "a" : "-"}`;

test.describe("PRD-05 BC selection under capability mocks (P1)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("mocked caps select the truth-table formats (s3tc → BC, none → rgba8)", async ({ page }, testInfo) => {
    const results: SelectionPayload[] = [];
    for (const caps of Object.keys(EXPECTED)) {
      await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-bc-selection.html?caps=${caps}`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForFunction(
        () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
        undefined,
        { timeout: 60_000 }
      );
      const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
      const payload = await page.evaluate(() => (window as any).__QR_READY__ as SelectionPayload | undefined);
      expect(error, `harness error for caps=${caps}`).toBeNull();
      expect(payload, `payload missing for caps=${caps}`).toBeTruthy();
      results.push(payload!);
      for (const sel of payload!.selections) {
        const expected = EXPECTED[caps]![key(sel)];
        expect(sel.target, `caps=${caps} ${key(sel)}`).toBe(expected);
      }
    }
    // The s3tc run must actually reach BC formats — the job's purpose.
    const s3tc = results.find((r) => r.capsName === "s3tc")!;
    expect(s3tc.selections.filter((s) => s.target.startsWith("bc")).length).toBeGreaterThan(0);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve(`tests/reports/prd05-assets-bc-selection${testInfo.project.name === "chromium" ? "" : `.${testInfo.project.name}`}.json`),
      `${JSON.stringify({ surface: "assets-bc-selection", runs: results }, null, 2)}\n`
    );
  });
});
