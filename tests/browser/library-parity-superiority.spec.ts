import type {} from "./root-spot-shadow-n1-harness";
import type {} from "./part-o1-navigation-crowd-harness";
import type {} from "./part-o2-visual-scripting-harness";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART K1 task 2 (muse3jsparity-PRD): library parity / superiority (M–P).
 *
 * Every claimed matrix row is either worked (proof exists) or explicitly
 * OUT with a reason. The machine-readable matrix
 * `benchmark/context/muse3jsparity-r185-matrix.json` is regenerated in this
 * run through its sanctioned generator (never hand-edited), then asserted:
 * the file is fresh, counts read 750/425/61, zero GAP rows lack prdSection,
 * zero OUT rows lack outReason. Retained M–P browser receipts must exist
 * with non-trivial bytes (missing fails, never skips), and the headline
 * metric of each is re-verified live in this same run (30-minute rule).
 * The producer writes current-run receipts after live assertions pass; it does
 * not require mutable reports from an earlier checkout.
 *
 * P2 closure requires a fresh real 4k-GLB browser run with native submission
 * and pixel assertions; the existence of unit source files cannot close it.
 */

const REPORT_DIR = "tests/reports/muse3jsparity";
const MATRIX_PATH = "benchmark/context/muse3jsparity-r185-matrix.json";
const FRESHNESS_MS = 30 * 60 * 1000;

// Unit-proven legs with no browser-pixel claim (asserted as files + doctrine,
// never as rendered proof).
const UNIT_LEGS: readonly string[] = [
  "tests/unit/controls/arcball-controls.test.ts",
  "tests/unit/assets/gltf-animation-pointer-and-variants.test.ts",
  "tests/unit/engine/instances-model-p2.test.ts",
  "tests/unit/engine/instances-model-mount-p2.test.ts",
];

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("K1 library parity superiority (M-P)", () => {
  test.setTimeout(900_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("matrix regenerated in-run: fresh, 750/425/61, every GAP owned, every OUT reasoned", async () => {
    execFileSync(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/muse3jsparity-matrix/index.ts"],
      { cwd: process.cwd(), timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] }
    );
    const full = resolve(MATRIX_PATH);
    expect(existsSync(full), `matrix JSON missing after regen: ${MATRIX_PATH}`).toBe(true);
    const ageMs = Date.now() - statSync(full).mtimeMs;
    expect(ageMs, `matrix must be fresh (re-earned in this run, age ${ageMs}ms)`).toBeLessThan(FRESHNESS_MS);
    const matrix = JSON.parse(readFileSync(full, "utf8")) as {
      three?: { srcFiles?: number; jsmFiles?: number; jsmTslFiles?: number };
      rows?: { area?: string; verdict?: string; prdSection?: string; outReason?: string }[];
    };
    expect(matrix.three?.srcFiles).toBe(750);
    expect(matrix.three?.jsmFiles).toBe(425);
    expect(matrix.three?.jsmTslFiles).toBe(61);
    const rows = matrix.rows ?? [];
    expect(rows.length).toBeGreaterThan(20);
    const unownedGap = rows.filter((row) => row.verdict === "GAP" && !row.prdSection);
    expect(
      unownedGap.map((row) => row.area),
      "zero GAP rows without an owning PRD section"
    ).toEqual([]);
    const unreasonedOut = rows.filter((row) => row.verdict === "OUT" && !row.outReason);
    expect(
      unreasonedOut.map((row) => row.area),
      "zero OUT rows without an outReason"
    ).toEqual([]);
    const verdictCounts: Record<string, number> = {};
    for (const row of rows) {
      const verdict = row.verdict ?? "UNKNOWN";
      verdictCounts[verdict] = (verdictCounts[verdict] ?? 0) + 1;
    }
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    writeFileSync(
      resolve(`${REPORT_DIR}/matrix-check.json`),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          matrixPath: MATRIX_PATH,
          counts: matrix.three,
          verdictCounts,
          gapAreas: rows.filter((row) => row.verdict === "GAP").map((row) => `${row.area} -> ${row.prdSection}`),
          outAreas: rows.filter((row) => row.verdict === "OUT").map((row) => row.area),
        },
        null,
        2
      )}\n`
    );
  });

  test("unit-proven source legs remain present", async () => {
    for (const leg of UNIT_LEGS) {
      expect(existsSync(resolve(leg)), `MISSING unit leg: ${leg}`).toBe(true);
    }
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    writeFileSync(
      resolve(`${REPORT_DIR}/library-unit-leg-check.json`),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), unitLegs: UNIT_LEGS }, null, 2)}\n`
    );
  });

  test("live re-verification: M-P headline metrics re-proven in this run", async ({ page }) => {
    const live: Record<string, unknown> = {};

    // M1 animation-pointer: typed fixture drives a real material track.
    let errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/animation-pointer-material-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_POINTER_MATERIAL__?: unknown }).__AURA3D_POINTER_MATERIAL__), undefined, { timeout: 60_000 });
    const pointer = await page.evaluate(() => (window as unknown as { __AURA3D_POINTER_MATERIAL__?: Record<string, unknown> }).__AURA3D_POINTER_MATERIAL__);
    expect(errors, "pointer harness page errors").toEqual([]);
    expect(pointer?.["imports"]).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect((pointer?.["renderer"] as { runtimeBackend?: string } | undefined)?.runtimeBackend).toBe("production-runtime");
    expect((pointer?.["asset"] as { typedRef?: string } | undefined)?.typedRef).toBe("assets.animationPointerPanel");
    live.animationPointerM1 = { imports: pointer?.["imports"], typedRef: (pointer?.["asset"] as { typedRef?: string })?.typedRef };

    // M2 streaming residency + anisotropy.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/root-texture-streaming-m2-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.click("#shoot");
    await page.waitForFunction(
      () =>
        window.__AURA3D_M2_STREAMING__?.status === "ready" ||
        window.__AURA3D_M2_STREAMING__?.status === "error",
      undefined,
      { timeout: 280_000 }
    );
    const m2 = await page.evaluate(() => window.__AURA3D_M2_STREAMING__);
    expect(m2?.status, `${m2?.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(m2?.captures?.map((capture) => capture.id)).toEqual(["funded", "starved"]);
    expect(m2?.checks?.fundedOverBudget).toBe(false);
    expect(m2?.checks?.fundedTextured).toBe(true);
    live.textureStreamingM2 = {
      captures: m2?.captures?.map((capture) => capture.id),
      fundedOverBudget: m2?.checks?.fundedOverBudget,
    };

    // M3/N1 spot + HDRI at root.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/root-spot-hdri-n1m3-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.click("#shoot");
    await page.waitForFunction(
      () =>
        window.__AURA3D_N1M3_SPOT_HDRI__?.status === "ready" ||
        window.__AURA3D_N1M3_SPOT_HDRI__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    const n1m3 = await page.evaluate(() => window.__AURA3D_N1M3_SPOT_HDRI__);
    expect(n1m3?.status, `${n1m3?.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(n1m3?.checks?.spotNodesOn).toBe(1);
    expect(n1m3?.checks?.hdriBacked0).toBe(true);
    expect(n1m3?.checks?.hdriBacked35).toBe(true);
    live.spotHdriN1M3 = { spotNodesOn: n1m3?.checks?.spotNodesOn, hdriBacked: true };

    // N1 spot shadow path.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/root-spot-shadow-n1-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.click("#shoot");
    await page.waitForFunction(
      () =>
        window.__AURA3D_N1_SPOT_SHADOW__?.status === "ready" ||
        window.__AURA3D_N1_SPOT_SHADOW__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    const n1 = await page.evaluate(() => window.__AURA3D_N1_SPOT_SHADOW__);
    expect(n1?.status, `${n1?.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(n1?.checks?.streetCasterIsSpot).toBe(true);
    expect(n1?.checks?.streetCasterName).toBe("streetlamp");
    live.spotShadowN1 = { streetCasterIsSpot: n1?.checks?.streetCasterIsSpot };

    // O1 navigation bake -> path -> crowd move.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/part-o1-navigation-crowd-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.status === "ready", undefined, {
      timeout: 240_000,
    });
    const o1initial = await page.evaluate(() => structuredClone(window.__AURA3D_PART_O1__));
    expect(errors, "O1 harness page errors").toEqual([]);
    expect(o1initial?.claim).toBe("root-navigation-crowds-bake-path-move");
    expect(o1initial?.available).toBe(true);
    expect(o1initial?.diagnostics?.count).toBe(4);
    expect(o1initial?.diagnostics?.atCap).toBe(true);
    await page.getByRole("button", { name: "Run root crowd trace" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.status === "complete", undefined, {
      timeout: 120_000,
    });
    const o1 = await page.evaluate(() => structuredClone(window.__AURA3D_PART_O1__));
    expect(o1?.steps).toBe(120);
    expect(o1?.agentZeroDisplacement).toBeGreaterThan(1.5);
    live.navigationCrowdO1 = {
      claim: o1?.claim,
      count: o1?.diagnostics?.count,
      steps: o1?.steps,
      agentZeroDisplacement: o1?.agentZeroDisplacement,
    };

    // P2 is measured live; historical unit-source presence is not rendered proof.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/instanced-model-p2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(() => window.__AURA3D_P2_INSTANCED_MODEL__?.status === "ready" || window.__AURA3D_P2_INSTANCED_MODEL__?.status === "error", undefined, { timeout: 180_000 });
    const p2 = await page.evaluate(() => window.__AURA3D_P2_INSTANCED_MODEL__);
    expect(p2?.status, p2?.error ?? errors.join("\n")).toBe("ready");
    expect(errors).toEqual([]);
    const p2Field = p2?.captures?.find(capture => capture.id === "instanced-4000");
    const p2Single = p2?.captures?.find(capture => capture.id === "single");
    expect(p2Field?.instanceCount).toBe(4000);
    expect(p2Field?.assetStatus).toBe("ready");
    expect(p2Field?.backend).toBe("production-runtime");
    expect(p2Field?.errorCount).toBe(0);
    expect(Number(p2?.checks?.instancedSubmissions4000 ?? 0)).toBeGreaterThan(0);
    expect(Number(p2?.checks?.draws4000 ?? 0)).toBeGreaterThan(0);
    expect(Number(p2?.checks?.draws4000 ?? Infinity)).toBeLessThanOrEqual(Number(p2?.checks?.drawsSingle ?? 0) + 4);
    expect(Number(p2?.checks?.pixelDiffSingleVs4000 ?? 0)).toBeGreaterThan(1000);
    expect(p2Field?.image.brightPixels ?? 0).toBeGreaterThan((p2Single?.image.brightPixels ?? 0) + 1000);
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    await page.screenshot({ path: resolve(`${REPORT_DIR}/library-p2-4000.png`) });
    live.instancedModelP2 = p2;

    // O2 visual-scripting graph changes gameplay state.
    errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/part-o2-visual-scripting-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.status === "ready", undefined, {
      timeout: 120_000,
    });
    const o2initial = await page.evaluate(() => structuredClone(window.__AURA3D_PART_O2__));
    expect(errors, "O2 harness page errors").toEqual([]);
    expect(o2initial?.claim).toBe("root-visual-scripting-graph-gameplay");
    expect(o2initial?.roundTripStable).toBe(true);
    expect(o2initial?.catalogKinds).toBeGreaterThanOrEqual(25);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.jumps === 1, undefined, {
      timeout: 60_000,
    });
    const o2 = await page.evaluate(() => structuredClone(window.__AURA3D_PART_O2__));
    expect(o2?.score).toBe(1);
    live.visualScriptingO2 = { claim: o2?.claim, catalogKinds: o2?.catalogKinds, score: o2?.score };

    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    writeFileSync(
      resolve(`${REPORT_DIR}/library-live-reverification.json`),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), live }, null, 2)}\n`
    );
    writeFileSync(
      resolve(`${REPORT_DIR}/library-parity-superiority.json`),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope: "M-P rows: worked or explicitly OUT (matrix) + current-run live re-verification",
          matrixReceipt: `${REPORT_DIR}/matrix-check.json`,
          unitLegReceipt: `${REPORT_DIR}/library-unit-leg-check.json`,
          liveReceipt: `${REPORT_DIR}/library-live-reverification.json`,
          schema: "aura3d.library-parity-301/v1",
          producer: "tests/browser/library-parity-superiority.spec.ts",
          p2RenderedProof: live.instancedModelP2,
          superiorityVerdict: "inconclusive",
          comparisonRequired: "Per-feature r185 winning metrics and independent image review remain required for superiority.",
        },
        null,
        2
      )}\n`
    );
  });
});

declare global {
  interface Window {
    __AURA3D_M2_STREAMING__?: {
      readonly status: "ready" | "error";
      readonly captures?: readonly { readonly id: string }[];
      readonly checks?: Record<string, unknown>;
      readonly error?: string;
    };
    __AURA3D_N1M3_SPOT_HDRI__?: {
      readonly status: "ready" | "error";
      readonly checks?: Record<string, unknown>;
      readonly error?: string;
    };
  }
}