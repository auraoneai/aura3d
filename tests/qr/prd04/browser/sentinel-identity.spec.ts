/**
 * sentinel-identity.spec.ts — PRD-04 §16.1 S1 (04-S1): flag-off identity.
 *
 * Renders the 6 scenes in `benchmarks/quality-rebuild/sentinels.json` on the
 * aura3d engine at flags `none` through the lane capture page, and compares
 * each frame with the baseline capture of the same scene.
 * Pass: per-image CIEDE2000 p99 <= the IC-0 noise floor.
 *
 * Baseline (CONTRACTS §6.1, CI-ROUTING "Sentinel baseline (GitHub)"): the
 * latest GitHub macos-14 flag-off capture of these scenes on main. The lane
 * workflow downloads the `prd04-sentinels-none` artifact of the latest main
 * run into PRD04_SENTINEL_BASELINE_DIR before this spec runs; every run
 * uploads its own captures under the same name, so a main run is the next
 * run's baseline.
 *
 * Tolerance: `sentinels.json` `identityCheck.deltaE2000P99`. It is measured
 * (two macos-14 runs of one main commit), never assumed. While it is null the
 * spec FAILS with a message saying so — it never substitutes a number. The
 * frames are still captured and uploaded first, so the run that measures the
 * floor has its inputs.
 *
 * Each scene is also captured twice (fresh pages), and the intra-run repeat
 * p99 is recorded on the report as data for the noise-floor measurement. It
 * is not used as the tolerance.
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { deltaE00, rgbToLab } from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

interface SentinelConfig {
  readonly identityCheck?: { readonly metric?: string; readonly statistic?: string; readonly deltaE2000P99?: number | null; readonly source?: string };
  readonly scenes: readonly { readonly id: string }[];
}

const SENTINELS_PATH = "benchmarks/quality-rebuild/sentinels.json";
const SENTINELS = JSON.parse(readFileSync(resolve(SENTINELS_PATH), "utf8")) as SentinelConfig;
const NOISE_FLOOR = SENTINELS.identityCheck?.deltaE2000P99 ?? null;
const BASELINE_DIR = resolve(process.env.PRD04_SENTINEL_BASELINE_DIR ?? "tests/reports/prd04/sentinels/baseline");
const OUT_DIR = resolve("tests/reports/prd04/sentinels/current");
const REPORT_PATH = resolve("tests/reports/prd04/probes/s1-sentinel-identity.json");
/** IC-0 method: images downscaled to a 1280 px long edge before ΔE (ic0-main-identity.json `method`). */
const LONG_EDGE = 1280;

interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
}

async function decode(path: string): Promise<Rgba> {
  const image = sharp(path).removeAlpha().ensureAlpha();
  const meta = await image.metadata();
  const scale = Math.min(1, LONG_EDGE / Math.max(meta.width ?? 1, meta.height ?? 1));
  const resized = scale < 1
    ? image.resize(Math.round((meta.width ?? 1) * scale), Math.round((meta.height ?? 1) * scale))
    : image;
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** Per-image CIEDE2000 99th percentile over every pixel (sRGB -> Lab D65). */
function deltaE2000P99(a: Rgba, b: Rgba): number {
  expect(`${a.width}x${a.height}`, "baseline and current frame sizes match").toBe(`${b.width}x${b.height}`);
  const n = a.width * a.height;
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    values[i] = deltaE00(
      rgbToLab(a.data[o]!, a.data[o + 1]!, a.data[o + 2]!),
      rgbToLab(b.data[o]!, b.data[o + 1]!, b.data[o + 2]!)
    );
  }
  values.sort();
  return values[Math.min(n - 1, Math.floor(0.99 * n))]!;
}

async function capture(page: Page, origin: string, sceneId: string, path: string): Promise<void> {
  await page.goto(
    `${origin}/tests/qr/prd04/harness/prd04-capture.html?engine=aura3d&scene=${encodeURIComponent(sceneId)}&flags=none`,
    { waitUntil: "domcontentloaded" }
  );
  const settled = await page
    .waitForFunction(
      () => (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_READY__ !== undefined
        || (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 120_000 }
    )
    .then(() => true, () => false);
  if (!settled) {
    const stage = await page.evaluate(() => (window as { __QR_STAGE__?: string }).__QR_STAGE__ ?? "pre-adapter").catch(() => "unreadable");
    throw new Error(`${sceneId}: capture page timed out at stage "${stage}" (no ready/error in 120s)`);
  }
  const error = await page.evaluate(() => (window as { __QR_ERROR__?: string }).__QR_ERROR__ ?? null);
  expect(error, `${sceneId} harness error`).toBeNull();
  const payload = await page.evaluate(() => (window as { __QR_READY__?: { qrFlags?: unknown } }).__QR_READY__ ?? null);
  expect(payload?.qrFlags, `${sceneId} ran with an empty flag set`).toEqual([]);
  await page.screenshot({ path });
}

test.describe("PRD-04 S1 sentinel identity (flags=none)", () => {
  let server: ExampleDevServer;
  const rows: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    mkdirSync(resolve(REPORT_PATH, ".."), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      `${JSON.stringify({
        probe: "s1-sentinel-identity",
        metric: "delta_e2000",
        statistic: "p99",
        noiseFloor: NOISE_FLOOR,
        noiseFloorSource: `${SENTINELS_PATH} identityCheck.deltaE2000P99`,
        baselineDir: BASELINE_DIR,
        githubRunId: process.env.GITHUB_RUN_ID ?? null,
        sha: process.env.GITHUB_SHA ?? null,
        baselineRunId: process.env.PRD04_SENTINEL_BASELINE_RUN_ID ?? null,
        scenes: rows
      }, null, 2)}\n`
    );
    await server?.close();
  });

  test("sentinels.json lists the 6 C-30 sentinel scenes", () => {
    expect(SENTINELS.scenes.map((s) => s.id)).toHaveLength(6);
    expect(SENTINELS.identityCheck?.metric).toBe("delta_e2000");
    expect(SENTINELS.identityCheck?.statistic).toBe("p99");
  });

  for (const { id } of SENTINELS.scenes) {
    test(`${id}: flags=none ΔE2000 p99 <= IC-0 noise floor`, async ({ browser }) => {
      const current = resolve(OUT_DIR, `${id}.png`);
      const repeat = resolve(OUT_DIR, `${id}.repeat.png`);
      for (const path of [current, repeat]) {
        const context = await browser.newContext();
        try {
          await capture(await context.newPage(), server.origin, id, path);
        } finally {
          await context.close();
        }
      }
      const repeatP99 = deltaE2000P99(await decode(current), await decode(repeat));
      const row: Record<string, unknown> = { scene: id, intraRunRepeatP99: repeatP99 };
      rows.push(row);

      if (typeof NOISE_FLOOR !== "number" || !Number.isFinite(NOISE_FLOOR)) {
        throw new Error(
          `S1 has no tolerance: ${SENTINELS_PATH} identityCheck.deltaE2000P99 is ${JSON.stringify(NOISE_FLOOR)}. ` +
            "The IC-0 GitHub sentinel noise floor (two macos-14 runs of one main commit, CI-ROUTING.md) must be " +
            "measured and written there first; this spec never assumes one. Captures for this run are in the " +
            "prd04-sentinels-none artifact."
        );
      }
      const baseline = resolve(BASELINE_DIR, `${id}.png`);
      if (!existsSync(baseline)) {
        throw new Error(
          `S1 has no baseline for ${id}: ${baseline} is missing. The lane workflow must download the latest ` +
            "main prd04-sentinels-none artifact into PRD04_SENTINEL_BASELINE_DIR before this spec."
        );
      }
      const p99 = deltaE2000P99(await decode(baseline), await decode(current));
      row.baselineP99 = p99;
      row.pass = p99 <= NOISE_FLOOR;
      expect(p99, `${id}: ΔE2000 p99 ${p99.toFixed(3)} vs baseline <= noise floor ${NOISE_FLOOR}`).toBeLessThanOrEqual(NOISE_FLOOR);
    });
  }
});
